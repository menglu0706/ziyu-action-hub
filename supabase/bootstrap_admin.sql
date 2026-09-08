-- Run only after creating the administrator in Supabase Dashboard > Authentication > Users.
-- Replace the placeholder with that user's UUID before executing this statement.
insert into public.admin_users (user_id, role, is_active)
values ('YOUR_AUTH_USER_UUID'::uuid, 'admin', true)
on conflict (user_id) do update
set role = excluded.role,
    is_active = excluded.is_active,
    updated_at = now();
