-- Refresh both leaderboard snapshot periods daily at 00:10 Asia/Shanghai.
begin;

create extension if not exists pg_cron;

select cron.unschedule(jobid)
from cron.job
where jobname = 'refresh-leaderboard-snapshots-daily';

select cron.schedule(
  'refresh-leaderboard-snapshots-daily',
  '10 16 * * *',
  $$select public.refresh_leaderboard_snapshots();$$
);

commit;
