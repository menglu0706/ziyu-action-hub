-- Tasks created by the Weibo watcher go offline 24 hours after creation. The watcher sets
-- auto_offline_at; a job every 5 minutes takes due tasks offline and clears it, so a task an
-- admin later puts back online by hand stays online. Media items are not affected.
begin;

alter table public.tasks
add column auto_offline_at timestamptz;

create index tasks_auto_offline_at_idx on public.tasks (auto_offline_at) where auto_offline_at is not null;

-- Auto tasks created before this migration get the same 24-hour lifetime.
update public.tasks
set auto_offline_at = created_at + interval '1 day'
where source = 'weibo' and status = 'published';

create or replace function private.expire_auto_tasks()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks
  set status = 'offline', is_pinned = false, auto_offline_at = null, updated_at = now()
  where auto_offline_at is not null
    and auto_offline_at <= now()
    and status = 'published';

  -- Drafts or tasks already taken offline by hand just drop the expiry.
  update public.tasks
  set auto_offline_at = null
  where auto_offline_at is not null
    and auto_offline_at <= now();
end;
$$;

revoke all on function private.expire_auto_tasks()
from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'expire-auto-tasks';

select cron.schedule(
  'expire-auto-tasks',
  '*/5 * * * *',
  $$select private.expire_auto_tasks();$$
);

commit;
