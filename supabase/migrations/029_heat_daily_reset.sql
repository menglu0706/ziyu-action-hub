-- The 加热 tab starts each day empty: at 03:00 Beijing time every live 加热 task goes offline,
-- whatever its deadline (tasks already past it were taken offline by expire_auto_tasks). Made in
-- admin or by the watcher alike. The relay pauses 01:00-08:00, so nothing new arrives before 08:00.
begin;

create or replace function private.reset_heat_tasks()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks
  set status = 'offline', is_pinned = false, updated_at = now()
  where show_in_heat
    and status = 'published';
end;
$$;

revoke all on function private.reset_heat_tasks()
from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'reset-heat-tasks';

-- 19:00 UTC = 03:00 Beijing.
select cron.schedule(
  'reset-heat-tasks',
  '0 19 * * *',
  $$select private.reset_heat_tasks();$$
);

commit;
