-- The 03:00 Beijing 加热 reset (migration 029) now deletes instead of taking offline: every 加热
-- task, live or already offline, is removed, so the tab and the admin list start each day clean.
-- Drafts and tasks scheduled to go live later are kept. Deleting a task removes its steps; the
-- watcher's log (weibo_ingest) keeps its rows, without the task link.
begin;

create or replace function private.reset_heat_tasks()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.tasks
  where show_in_heat
    and (status = 'published' or (status = 'offline' and publish_at is null));
end;
$$;

revoke all on function private.reset_heat_tasks()
from public, anon, authenticated;

-- Same schedule as before (19:00 UTC = 03:00 Beijing); re-created in case 029 wasn't run.
select cron.unschedule(jobid)
from cron.job
where jobname = 'reset-heat-tasks';

select cron.schedule(
  'reset-heat-tasks',
  '0 19 * * *',
  $$select private.reset_heat_tasks();$$
);

commit;
