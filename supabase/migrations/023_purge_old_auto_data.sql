-- Keeps the tables the watcher and admin read from growing forever. Every day at 04:05 Beijing
-- time: watcher-made tasks (source 'weibo') that have been offline for over 30 days are deleted
-- (their steps go with them; weibo_ingest rows keep their log but lose the task link), and
-- weibo_ingest rows older than 60 days are deleted -- the Weibo feeds the relay reads only reach
-- back about 10 days, so older rows are never needed for duplicate checks. Tasks made in admin are
-- never deleted.
begin;

create index if not exists tasks_offline_weibo_idx
on public.tasks (updated_at)
where source = 'weibo' and status = 'offline';

create or replace function private.purge_old_auto_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.tasks
  where source = 'weibo'
    and status = 'offline'
    and updated_at < now() - interval '30 days';

  delete from public.weibo_ingest
  where created_at < now() - interval '60 days';
end;
$$;

revoke all on function private.purge_old_auto_data()
from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-old-auto-data';

select cron.schedule(
  'purge-old-auto-data',
  '5 20 * * *',
  $$select private.purge_old_auto_data();$$
);

commit;
