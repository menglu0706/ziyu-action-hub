-- Weibo watcher: a once-a-minute pg_cron job calls the weibo-watcher Edge Function, which
-- turns new posts from the watched accounts into pinned /urgent tasks (and /media items).
--
-- The job authenticates with a key stored in Supabase Vault under the name
-- 'weibo_watcher_key' (created separately, not in this file). Until that secret exists the
-- job does nothing.
begin;

create extension if not exists pg_net;

-- Where a task or media item came from, so manual entries can take priority and the
-- watcher never processes the same Weibo post twice.
alter table public.tasks
add column source text not null default 'manual' check (source in ('manual', 'weibo')),
add column source_post_id text;

alter table public.media_items
add column source_post_id text;

create index tasks_source_post_id_idx on public.tasks (source_post_id) where source_post_id is not null;
create index media_items_source_post_id_idx on public.media_items (source_post_id) where source_post_id is not null;

-- Newest post id already seen per watched account. A missing row means the next scan only
-- records the current latest post (so history is never imported).
create table public.weibo_watch_state (
  uid text primary key,
  last_seen_id numeric not null,
  updated_at timestamptz not null default now()
);

-- One row per Weibo post the watcher handled, and what it did with it.
create table public.weibo_ingest (
  post_id text primary key,
  uid text not null,
  source_post_id text not null,
  kind text not null,
  status text not null check (status in ('processing', 'published', 'skipped', 'failed')),
  reason text,
  title text,
  task_id uuid references public.tasks(id) on delete set null,
  media_id uuid references public.media_items(id) on delete set null,
  posted_at timestamptz,
  alerted_at timestamptz,
  created_at timestamptz not null default now()
);
create index weibo_ingest_source_post_id_idx on public.weibo_ingest (source_post_id);
create index weibo_ingest_created_at_idx on public.weibo_ingest (created_at desc);

-- Scan health, kept for 7 days by the watcher itself.
create table public.weibo_scan_log (
  id bigserial primary key,
  scanned_at timestamptz not null default now(),
  ok boolean not null,
  error text,
  duration_ms integer
);
create index weibo_scan_log_scanned_at_idx on public.weibo_scan_log (scanned_at desc);

-- Single-row switch and failure state.
create table public.weibo_watcher_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  failing boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.weibo_watcher_settings default values;

-- WeChat alerts sent, for the daily quota (counted per Asia/Shanghai day).
create table public.weibo_alerts (
  id bigserial primary key,
  sent_on date not null,
  kind text not null,
  sent_at timestamptz not null default now()
);
create index weibo_alerts_sent_on_idx on public.weibo_alerts (sent_on);

-- The Edge Function uses the service role. Admins can read everything and flip the switch.
alter table public.weibo_watch_state enable row level security;
alter table public.weibo_ingest enable row level security;
alter table public.weibo_scan_log enable row level security;
alter table public.weibo_watcher_settings enable row level security;
alter table public.weibo_alerts enable row level security;

create policy weibo_ingest_admin_read on public.weibo_ingest for select to authenticated using ((select private.is_admin()));
create policy weibo_scan_log_admin_read on public.weibo_scan_log for select to authenticated using ((select private.is_admin()));
create policy weibo_watcher_settings_admin_read on public.weibo_watcher_settings for select to authenticated using ((select private.is_admin()));
create policy weibo_watcher_settings_admin_update on public.weibo_watcher_settings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

select cron.unschedule(jobid)
from cron.job
where jobname = 'weibo-watcher';

select cron.schedule(
  'weibo-watcher',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://enwmacfmwqaqghyiqskj.supabase.co/functions/v1/weibo-watcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-watcher-key', (select decrypted_secret from vault.decrypted_secrets where name = 'weibo_watcher_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'weibo_watcher_key');
  $$
);

commit;
