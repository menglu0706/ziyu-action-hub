-- The 超话签到 task on /urgent (907fb1d6-...) changes title for 福袋日 every week: Wednesday 00:00
-- Beijing time it becomes the 福袋日 title, and Thursday 00:00 (right after Wednesday 23:59) it
-- goes back to the 超话签到 title. Only the title changes; a title edited in admin in between is
-- overwritten at the next switch. If the task is deleted, the jobs do nothing.
begin;

create or replace function private.set_signin_task_title(p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks
  set title = p_title, updated_at = now()
  where id = '907fb1d6-9f72-4bdd-b93f-ab9c3417678f'
    and title is distinct from p_title;
end;
$$;

revoke all on function private.set_signin_task_title(text)
from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname in ('signin-title-fudai', 'signin-title-normal');

-- Tuesday 16:00 UTC = Wednesday 00:00 Beijing.
select cron.schedule(
  'signin-title-fudai',
  '0 16 * * 2',
  $$select private.set_signin_task_title('福袋日❗️ 领福袋❗️ 日热度要第一❗️');$$
);

-- Wednesday 16:00 UTC = Thursday 00:00 Beijing.
select cron.schedule(
  'signin-title-normal',
  '0 16 * * 3',
  $$select private.set_signin_task_title('超话签到❗️ 四评两转维持超辣❗️');$$
);

commit;
