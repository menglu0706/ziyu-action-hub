-- Ordinary frontend user account MVP. Run as one transaction.
begin;

alter table public.profiles add column if not exists timezone text;
alter table public.tasks add column if not exists completion_mode text;

-- Existing rows use show_in_daily only for this one-time migration backfill.
-- Runtime completion behavior reads completion_mode directly.
update public.tasks
set completion_mode = case when show_in_daily then 'daily' else 'one_time' end
where completion_mode is null;

alter table public.tasks alter column completion_mode set default 'one_time';
alter table public.tasks alter column completion_mode set not null;

do $$ begin
  alter table public.tasks add constraint tasks_completion_mode_valid
  check (completion_mode in ('one_time', 'daily'));
exception when duplicate_object then null;
end $$;

-- Keep the existing auth trigger, but guarantee a non-empty fallback nickname.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '新用户'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

grant insert on table public.profiles to authenticated;
drop policy if exists profiles_own_insert on public.profiles;
create policy profiles_own_insert on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));

-- Progress is bounded by the current user's account count for the task platform.
-- Missing account counts and non-multi-account tasks have a safe stored bound of 0.
create or replace function private.validate_task_progress_account_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_is_multi boolean;
  target integer;
  allowed_max integer;
begin
  select t.is_multi_account, pac.account_count
  into task_is_multi, target
  from public.tasks t
  left join public.platform_account_counts pac
    on pac.user_id = new.user_id and pac.platform = t.platform
  where t.id = new.task_id;

  if not found then raise exception 'Task unavailable for progress'; end if;
  allowed_max := case when task_is_multi then coalesce(target, 0) else 0 end;
  if new.completed_count < 0 or new.completed_count > allowed_max then
    raise exception 'Progress outside current account count';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_task_progress_account_target() from public, anon, authenticated;

-- Normalize existing progress without deleting rows. Missing account counts
-- and progress attached to non-multi-account tasks safely reduce to zero.
update public.task_progress p
set completed_count = least(
  p.completed_count,
  case when t.is_multi_account then coalesce((
    select pac.account_count
    from public.platform_account_counts pac
    where pac.user_id = p.user_id and pac.platform = t.platform
  ), 0) else 0 end
)
from public.tasks t
where t.id = p.task_id
  and p.completed_count > case when t.is_multi_account then coalesce((
    select pac.account_count
    from public.platform_account_counts pac
    where pac.user_id = p.user_id and pac.platform = t.platform
  ), 0) else 0 end;

drop trigger if exists validate_task_progress_account_target on public.task_progress;
create trigger validate_task_progress_account_target
before insert or update of completed_count, task_id, user_id
on public.task_progress for each row
execute function private.validate_task_progress_account_target();

create or replace function private.clamp_progress_after_account_count_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_target integer;
begin
  if tg_op = 'DELETE' then
    update public.task_progress p
    set completed_count = 0
    from public.tasks t
    where t.id = p.task_id
      and p.user_id = old.user_id
      and t.platform = old.platform
      and p.completed_count > 0;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.user_id, old.platform) is distinct from (new.user_id, new.platform) then
    select pac.account_count into old_target
    from public.platform_account_counts pac
    where pac.user_id = old.user_id and pac.platform = old.platform;

    update public.task_progress p
    set completed_count = least(p.completed_count, coalesce(old_target, 0))
    from public.tasks t
    where t.id = p.task_id
      and p.user_id = old.user_id
      and t.platform = old.platform
      and p.completed_count > coalesce(old_target, 0);
  end if;

  update public.task_progress p
  set completed_count = least(p.completed_count, new.account_count)
  from public.tasks t
  where t.id = p.task_id
    and p.user_id = new.user_id
    and t.platform = new.platform
    and p.completed_count > new.account_count;
  return new;
end;
$$;
revoke all on function private.clamp_progress_after_account_count_change() from public, anon, authenticated;
drop trigger if exists clamp_progress_after_account_count_change on public.platform_account_counts;
create trigger clamp_progress_after_account_count_change
after insert or update or delete on public.platform_account_counts
for each row execute function private.clamp_progress_after_account_count_change();

create or replace function private.clamp_progress_after_task_account_scope_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.task_progress p
  set completed_count = least(
    p.completed_count,
    case when new.is_multi_account then coalesce((
      select pac.account_count
      from public.platform_account_counts pac
      where pac.user_id = p.user_id and pac.platform = new.platform
    ), 0) else 0 end
  )
  where p.task_id = new.id
    and p.completed_count > case when new.is_multi_account then coalesce((
      select pac.account_count
      from public.platform_account_counts pac
      where pac.user_id = p.user_id and pac.platform = new.platform
    ), 0) else 0 end;
  return new;
end;
$$;
revoke all on function private.clamp_progress_after_task_account_scope_change() from public, anon, authenticated;
drop trigger if exists clamp_progress_after_target_change on public.tasks;
drop trigger if exists clamp_progress_after_task_account_scope_change on public.tasks;
create trigger clamp_progress_after_task_account_scope_change
after update of platform, is_multi_account on public.tasks
for each row execute function private.clamp_progress_after_task_account_scope_change();

-- Progress stays readable through RLS, but all ordinary-user mutation goes
-- through the atomic RPC below. No direct REST INSERT/UPDATE/DELETE remains.
revoke insert, update, delete on table public.task_progress from authenticated;
drop policy if exists task_progress_own_insert on public.task_progress;
drop policy if exists task_progress_own_update on public.task_progress;
drop policy if exists task_progress_own_delete on public.task_progress;

create or replace function public.adjust_task_progress(p_task_id uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  task_platform text;
  target integer;
  result_count integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if p_delta not in (-1, 1) then raise exception 'Delta must be -1 or 1'; end if;

  select t.platform into task_platform
  from public.tasks t
  where t.id = p_task_id
    and t.status = 'published'
    and t.is_multi_account = true
    and (t.deadline is null or now() <= t.deadline)
    and t.platform is not null
  for share;
  if not found then raise exception 'Task unavailable for progress'; end if;

  select pac.account_count into target
  from public.platform_account_counts pac
  where pac.user_id = caller_id and pac.platform = task_platform
  for share;
  if not found then raise exception 'Platform account count required'; end if;

  insert into public.task_progress (user_id, task_id, completed_count)
  values (caller_id, p_task_id, greatest(0, least(target, p_delta)))
  on conflict (user_id, task_id) do update
    set completed_count = greatest(
          0,
          least(target, public.task_progress.completed_count + p_delta)
        ),
        updated_at = now()
  returning completed_count into result_count;

  return result_count;
end;
$$;
revoke all on function public.adjust_task_progress(uuid, integer) from public, anon, authenticated;
grant execute on function public.adjust_task_progress(uuid, integer) to authenticated;

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  task_title text not null,
  task_category text not null,
  completion_mode text not null check (completion_mode in ('one_time', 'daily')),
  occurrence_date date,
  counts_toward_stats boolean not null,
  completed_at timestamptz not null,
  constraint task_completions_occurrence_shape check (
    (completion_mode = 'one_time' and occurrence_date is null)
    or (completion_mode = 'daily' and occurrence_date is not null)
  )
);

create unique index if not exists task_completions_one_time_unique
on public.task_completions (user_id, task_id)
where task_id is not null and completion_mode = 'one_time';
create unique index if not exists task_completions_daily_unique
on public.task_completions (user_id, task_id, occurrence_date)
where task_id is not null and completion_mode = 'daily';
create index if not exists task_completions_user_completed_idx
on public.task_completions (user_id, completed_at desc);

alter table public.task_completions enable row level security;
revoke all on table public.task_completions from anon, authenticated;
grant select on table public.task_completions to authenticated;

drop policy if exists task_completions_own_read on public.task_completions;
drop policy if exists task_completions_own_insert on public.task_completions;
drop policy if exists task_completions_own_update on public.task_completions;
drop policy if exists task_completions_own_delete on public.task_completions;
create policy task_completions_own_read on public.task_completions
for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.complete_task(p_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source_task public.tasks%rowtype;
  completed_instant timestamptz := now();
  user_timezone text;
  local_occurrence_date date;
  completion_id uuid;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;

  select * into source_task
  from public.tasks t
  where t.id = p_task_id
    and t.status = 'published'
    and (t.deadline is null or completed_instant <= t.deadline)
  for share;
  if not found then raise exception 'Task unavailable for completion'; end if;

  if source_task.completion_mode = 'daily' then
    select p.timezone into user_timezone
    from public.profiles p
    where p.id = caller_id
    for share;
    if user_timezone is null or btrim(user_timezone) = '' then
      raise exception 'Valid profile timezone required for daily completion';
    end if;
    begin
      local_occurrence_date := (completed_instant at time zone user_timezone)::date;
    exception when invalid_parameter_value then
      raise exception 'Valid profile timezone required for daily completion';
    end;
  end if;

  insert into public.task_completions (
    user_id,
    task_id,
    task_title,
    task_category,
    completion_mode,
    occurrence_date,
    counts_toward_stats,
    completed_at
  ) values (
    caller_id,
    source_task.id,
    source_task.title,
    source_task.category,
    source_task.completion_mode,
    local_occurrence_date,
    source_task.count_completion,
    completed_instant
  )
  on conflict do nothing
  returning id into completion_id;

  if completion_id is null then
    select tc.id into completion_id
    from public.task_completions tc
    where tc.user_id = caller_id
      and tc.task_id = p_task_id
      and tc.completion_mode = source_task.completion_mode
      and (
        (source_task.completion_mode = 'one_time' and tc.occurrence_date is null)
        or (source_task.completion_mode = 'daily' and tc.occurrence_date = local_occurrence_date)
      )
    limit 1;
  end if;
  return completion_id;
end;
$$;
revoke all on function public.complete_task(uuid) from public, anon, authenticated;
grant execute on function public.complete_task(uuid) to authenticated;

commit;
