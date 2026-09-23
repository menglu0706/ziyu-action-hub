-- Scheduled go-live and scheduled pin windows for tasks, applied by a
-- once-a-minute pg_cron job.
--
-- publish_at:     an offline task becomes published once this time passes.
-- pin_starts_at:  the task takes the single pinned (置顶) slot once this time
--                 passes and the task is published. Cleared once applied, so a
--                 later manual unpin is not undone by the schedule.
-- pin_ends_at:    the task is unpinned once this time passes. Null means it
--                 stays pinned until an admin removes it manually.
begin;

create extension if not exists pg_cron;

alter table public.tasks
add column publish_at timestamptz,
add column pin_starts_at timestamptz,
add column pin_ends_at timestamptz;

alter table public.tasks
add constraint tasks_pin_window_order
check (pin_starts_at is null or pin_ends_at is null or pin_ends_at > pin_starts_at);

create index tasks_publish_at_idx on public.tasks (publish_at) where publish_at is not null;
create index tasks_pin_schedule_idx on public.tasks (pin_starts_at) where pin_starts_at is not null or pin_ends_at is not null;

create or replace function private.apply_task_schedules()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_pinned uuid;
begin
  -- 1. Go live. Runs first so a task published and pinned at the same minute
  -- (e.g. both at 10:00) is eligible for step 3 in this same run.
  update public.tasks
  set status = 'published', publish_at = null, updated_at = now()
  where status = 'offline'
    and publish_at is not null
    and publish_at <= now();

  -- 2. End pin windows. A window that ended before it could start (the task
  -- was never published in time) is discarded along with it.
  update public.tasks
  set is_pinned = false, pin_starts_at = null, pin_ends_at = null, updated_at = now()
  where pin_ends_at is not null
    and pin_ends_at <= now();

  -- 3. Start the most recently due pin window. Only one task is pinned at a
  -- time (matching saveTask), so any other due windows are superseded.
  select t.id into next_pinned
  from public.tasks t
  where t.pin_starts_at is not null
    and t.pin_starts_at <= now()
    and t.status = 'published'
  order by t.pin_starts_at desc, t.id
  limit 1;

  if next_pinned is not null then
    update public.tasks
    set is_pinned = false,
        -- Keep a future schedule intact; only drop the end time of a pin
        -- that is being displaced.
        pin_ends_at = case when pin_starts_at is null then null else pin_ends_at end,
        updated_at = now()
    where is_pinned and id <> next_pinned;

    update public.tasks
    set pin_starts_at = null, pin_ends_at = null, updated_at = now()
    where id <> next_pinned
      and status = 'published'
      and pin_starts_at is not null
      and pin_starts_at <= now();

    update public.tasks
    set is_pinned = true, pin_starts_at = null, updated_at = now()
    where id = next_pinned;
  end if;
end;
$$;

revoke all on function private.apply_task_schedules()
from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'apply-task-schedules';

select cron.schedule(
  'apply-task-schedules',
  '* * * * *',
  $$select private.apply_task_schedules();$$
);

commit;
