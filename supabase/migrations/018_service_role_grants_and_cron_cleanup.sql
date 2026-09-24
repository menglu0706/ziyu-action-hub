-- This project grants table access explicitly (see 001 and 008), so the service role used by
-- the weibo-watcher Edge Function and the /api/cron/media-cleanup route needs its own grants,
-- and admins need read access to the watcher tables for the dashboard card.
begin;

grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.tasks,
  public.media_items,
  public.weibo_watch_state,
  public.weibo_ingest,
  public.weibo_scan_log,
  public.weibo_watcher_settings,
  public.weibo_alerts
to service_role;

grant usage, select on sequence
  public.weibo_scan_log_id_seq,
  public.weibo_alerts_id_seq
to service_role;

grant select on table public.weibo_ingest, public.weibo_scan_log, public.weibo_watcher_settings to authenticated;
grant update on table public.weibo_watcher_settings to authenticated;

-- pg_cron records every run and never deletes them. Two every-minute jobs add ~2,900 rows a
-- day (~250 MB a year), so keep only the last 7 days. Runs daily at 03:30 Asia/Shanghai.
select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-cron-history';

select cron.schedule(
  'purge-cron-history',
  '30 19 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);

commit;
