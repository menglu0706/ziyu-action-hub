-- Required by server-side backend account management.
begin;

grant usage on schema public to service_role;

grant select, insert, update, delete
on table public.admin_users
to service_role;

commit;
