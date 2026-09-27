-- Site-wide switches the public site reads, starting with the 加热 page. When heat_enabled is off,
-- the 加热 tab leaves the nav, /heat redirects to /urgent and the watcher creates no 加热 tasks.
-- Anyone can read the row (the public site needs it); only admins can change it.
begin;

create table public.site_settings (
  id boolean primary key default true check (id),
  heat_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.site_settings default values;

alter table public.site_settings enable row level security;

create policy site_settings_public_read on public.site_settings
for select to anon, authenticated using (true);

create policy site_settings_admin_update on public.site_settings
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;
grant select on public.site_settings to service_role;

commit;
