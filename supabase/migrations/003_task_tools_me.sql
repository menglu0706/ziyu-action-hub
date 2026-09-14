-- Task tools, public content images, and privacy-safe leaderboard snapshots.
begin;

alter table public.tasks add column if not exists recommended_copy text;
alter table public.tasks add column if not exists urgent_sort_position bigint;

with ranked as (
  select id, row_number() over (
    order by urgency_score desc, required_score desc, created_at desc, id
  ) as position
  from public.tasks
  where status = 'published'
    and not is_pinned
    and (deadline is null or deadline > now())
)
update public.tasks t
set urgent_sort_position = ranked.position
from ranked
where ranked.id = t.id and t.urgent_sort_position is null;

create index if not exists tasks_active_urgent_order_idx
on public.tasks (status, is_pinned desc, urgent_sort_position asc, created_at desc);

create or replace function private.assign_new_urgent_sort_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_assign boolean := false;
begin
  if new.status = 'published'
     and not new.is_pinned
     and (new.deadline is null or new.deadline > now()) then
    if tg_op = 'INSERT' then
      should_assign := true;
    else
      should_assign := old.status is distinct from 'published'
        or old.is_pinned
        or (old.deadline is not null and old.deadline <= now());
    end if;
  end if;

  if should_assign then
    perform pg_catalog.pg_advisory_xact_lock(20260914, 3);
    select coalesce(min(t.urgent_sort_position), 0) - 1
      into new.urgent_sort_position
    from public.tasks t
    where t.status = 'published'
      and not t.is_pinned
      and (t.deadline is null or t.deadline > now());
  end if;
  return new;
end;
$$;
revoke all on function private.assign_new_urgent_sort_position() from public, anon, authenticated;

drop trigger if exists assign_new_urgent_sort_position on public.tasks;
create trigger assign_new_urgent_sort_position
before insert or update on public.tasks
for each row execute function private.assign_new_urgent_sort_position();

create or replace function public.reorder_urgent_tasks(p_task_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_count integer;
  eligible_count integer;
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if p_task_ids is null then raise exception 'Task order required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(20260914, 3);

  select count(*), count(distinct supplied.id)
  into supplied_count, eligible_count
  from unnest(p_task_ids) as supplied(id);
  if supplied_count <> eligible_count then raise exception 'Duplicate task IDs are not allowed'; end if;

  select count(*) into eligible_count
  from public.tasks t
  where t.status = 'published' and not t.is_pinned
    and (t.deadline is null or t.deadline > now());
  if supplied_count <> eligible_count or exists (
    select 1 from unnest(p_task_ids) as supplied(id)
    left join public.tasks t on t.id = supplied.id
    where t.id is null or t.status <> 'published' or t.is_pinned
      or (t.deadline is not null and t.deadline <= now())
  ) then raise exception 'Order must contain every active non-pinned urgent task exactly once'; end if;

  update public.tasks t
  set urgent_sort_position = ordered.position, updated_at = now()
  from unnest(p_task_ids) with ordinality as ordered(id, position)
  where t.id = ordered.id;
end;
$$;
revoke all on function public.reorder_urgent_tasks(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_urgent_tasks(uuid[]) to authenticated;

create table if not exists public.leaderboard_snapshots (
  period_type text not null check (period_type in ('current_week', 'previous_week')),
  period_start date not null,
  period_end date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_nickname text not null,
  display_avatar_url text,
  action_count integer not null check (action_count >= 0),
  rank integer not null check (rank > 0),
  refreshed_at timestamptz not null default now(),
  primary key (period_type, period_start, user_id)
);
create index if not exists leaderboard_snapshots_period_rank_idx
on public.leaderboard_snapshots (period_type, period_start desc, rank asc);

alter table public.leaderboard_snapshots enable row level security;
revoke all on table public.leaderboard_snapshots from anon, authenticated;
grant select on table public.leaderboard_snapshots to authenticated;
drop policy if exists leaderboard_snapshots_authenticated_read on public.leaderboard_snapshots;
create policy leaderboard_snapshots_authenticated_read on public.leaderboard_snapshots
for select to authenticated using (true);

create or replace function private.remove_leaderboard_snapshots_on_opt_out()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.leaderboard_snapshots
  where user_id = new.id;
  return new;
end;
$$;
revoke all on function private.remove_leaderboard_snapshots_on_opt_out() from public, anon, authenticated;

drop trigger if exists remove_leaderboard_snapshots_on_opt_out on public.profiles;
create trigger remove_leaderboard_snapshots_on_opt_out
after update of leaderboard_opt_in on public.profiles
for each row
when (old.leaderboard_opt_in is true and new.leaderboard_opt_in is false)
execute function private.remove_leaderboard_snapshots_on_opt_out();

create or replace function public.refresh_leaderboard_snapshots()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_start date := date_trunc('week', now() at time zone 'Asia/Shanghai')::date;
  current_end date := current_start + 6;
  previous_start date := current_start - 7;
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Admin access required';
  end if;

  delete from public.leaderboard_snapshots
  where period_type in ('current_week', 'previous_week');

  insert into public.leaderboard_snapshots (
    period_type, period_start, period_end, user_id, display_nickname,
    display_avatar_url, action_count, rank, refreshed_at
  )
  with periods as (
    select 'current_week'::text as period_type, current_start as period_start, current_end as period_end
    union all
    select 'previous_week', previous_start, current_start - 1
  ), scores as (
    select p.period_type, p.period_start, p.period_end, tc.user_id,
           count(*)::integer as action_count
    from periods p
    join public.task_completions tc
      on tc.counts_toward_stats
     and tc.completed_at >= (p.period_start::timestamp at time zone 'Asia/Shanghai')
     and tc.completed_at < ((p.period_end + 1)::timestamp at time zone 'Asia/Shanghai')
    join public.profiles profile on profile.id = tc.user_id and profile.leaderboard_opt_in
    group by p.period_type, p.period_start, p.period_end, tc.user_id
  ), ranked as (
    select scores.*, dense_rank() over (
      partition by period_type, period_start order by action_count desc
    )::integer as rank
    from scores
  )
  select ranked.period_type, ranked.period_start, ranked.period_end, ranked.user_id,
         coalesce(nullif(btrim(profile.nickname), ''), '用户'), profile.avatar_url,
         ranked.action_count, ranked.rank, now()
  from ranked join public.profiles profile on profile.id = ranked.user_id;
end;
$$;
revoke all on function public.refresh_leaderboard_snapshots() from public, anon, authenticated;
grant execute on function public.refresh_leaderboard_snapshots() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-images', 'content-images', true, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists content_images_public_read on storage.objects;
drop policy if exists content_images_admin_insert on storage.objects;
drop policy if exists content_images_admin_update on storage.objects;
drop policy if exists content_images_admin_delete on storage.objects;
create policy content_images_public_read on storage.objects for select to anon, authenticated
using (bucket_id = 'content-images');
create policy content_images_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'content-images' and (select private.is_admin()));
create policy content_images_admin_update on storage.objects for update to authenticated
using (bucket_id = 'content-images' and (select private.is_admin()))
with check (bucket_id = 'content-images' and (select private.is_admin()));
create policy content_images_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'content-images' and (select private.is_admin()));

commit;
