-- Independent manual ordering for active daily tasks.
begin;

alter table public.tasks
add column daily_sort_position bigint;

-- Match the pre-migration /daily order for active, non-pinned tasks. Pinned
-- tasks remain outside manual ordering and continue to render first.
with ranked as (
  select
    t.id,
    row_number() over (
      order by
        t.deadline asc nulls last,
        t.urgency_score desc,
        t.required_score desc,
        t.sort_order asc,
        t.created_at desc,
        t.id
    ) as position
  from public.tasks t
  where t.status = 'published'
    and t.show_in_daily
    and not t.is_pinned
    and (t.deadline is null or t.deadline > now())
)
update public.tasks t
set daily_sort_position = ranked.position
from ranked
where ranked.id = t.id;

create index tasks_active_daily_order_idx
on public.tasks (
  is_pinned desc,
  daily_sort_position asc,
  deadline asc,
  urgency_score desc,
  required_score desc,
  sort_order asc,
  created_at desc
)
where status = 'published' and show_in_daily;

create or replace function private.assign_new_daily_sort_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_assign boolean := false;
begin
  if new.status = 'published'
     and new.show_in_daily
     and not new.is_pinned
     and (new.deadline is null or new.deadline > now()) then
    if tg_op = 'INSERT' then
      should_assign := true;
    else
      should_assign := old.status is distinct from 'published'
        or old.show_in_daily is distinct from true
        or old.is_pinned
        or (old.deadline is not null and old.deadline <= now());
    end if;
  end if;

  if should_assign then
    perform pg_catalog.pg_advisory_xact_lock(20260914, 4);
    select coalesce(min(t.daily_sort_position), 0) - 1
      into new.daily_sort_position
    from public.tasks t
    where t.status = 'published'
      and t.show_in_daily
      and not t.is_pinned
      and (t.deadline is null or t.deadline > now());
  end if;

  return new;
end;
$$;

revoke all on function private.assign_new_daily_sort_position()
from public, anon, authenticated;

drop trigger if exists assign_new_daily_sort_position on public.tasks;
create trigger assign_new_daily_sort_position
before insert or update on public.tasks
for each row execute function private.assign_new_daily_sort_position();

create or replace function public.reorder_daily_tasks(p_task_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_count integer;
  distinct_supplied_count integer;
  eligible_count integer;
begin
  if not private.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_task_ids is null then
    raise exception 'Task order required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260914, 4);

  select count(*), count(distinct supplied.id)
  into supplied_count, distinct_supplied_count
  from unnest(p_task_ids) as supplied(id);

  if supplied_count <> distinct_supplied_count then
    raise exception 'Duplicate task IDs are not allowed';
  end if;

  select count(*)
  into eligible_count
  from public.tasks t
  where t.status = 'published'
    and t.show_in_daily
    and not t.is_pinned
    and (t.deadline is null or t.deadline > now());

  if supplied_count <> eligible_count or exists (
    select 1
    from unnest(p_task_ids) as supplied(id)
    left join public.tasks t on t.id = supplied.id
    where t.id is null
      or t.status <> 'published'
      or not t.show_in_daily
      or t.is_pinned
      or (t.deadline is not null and t.deadline <= now())
  ) then
    raise exception 'Order must contain every active non-pinned daily task exactly once';
  end if;

  update public.tasks t
  set daily_sort_position = ordered.position,
      updated_at = now()
  from unnest(p_task_ids) with ordinality as ordered(id, position)
  where t.id = ordered.id;
end;
$$;

revoke all on function public.reorder_daily_tasks(uuid[])
from public, anon, authenticated;
grant execute on function public.reorder_daily_tasks(uuid[]) to authenticated;

commit;
