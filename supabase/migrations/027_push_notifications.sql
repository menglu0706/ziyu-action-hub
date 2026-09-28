-- Notifications to fans about 加热: a 🔥 热搜 card, or a surge of 空瓶 cards.
--
-- site_notifications: what was announced. The site reads the recent ones to show an in-page alert
--   (and a desktop notification from a background tab); the watcher writes them.
-- push_subscriptions: browsers that turned on 加热提醒, for Web Push. Anonymous (just the push
--   service endpoint and its keys); written only by the site's server and read by the watcher.
begin;

create table public.site_notifications (
  id bigserial primary key,
  kind text not null check (kind in ('heat_trending', 'kong_surge')),
  title text not null,
  body text not null,
  url text not null default '/heat',
  created_at timestamptz not null default now()
);
create index site_notifications_created_at_idx on public.site_notifications (created_at desc);

create table public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);

alter table public.site_notifications enable row level security;
alter table public.push_subscriptions enable row level security;

-- Anyone may read the last day of notifications (they only repeat what /heat shows).
create policy site_notifications_public_read on public.site_notifications
for select to anon, authenticated using (created_at > now() - interval '1 day');
grant select on table public.site_notifications to anon, authenticated;

grant select, insert, update, delete on table public.site_notifications, public.push_subscriptions to service_role;
grant usage, select on sequence public.site_notifications_id_seq to service_role;

commit;
