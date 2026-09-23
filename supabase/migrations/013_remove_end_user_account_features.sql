-- Removes the database objects backing end-user accounts, task-progress
-- tracking, and the leaderboard -- all already removed from the app's public
-- pages and, as of the previous migration, from the admin dashboard too.
-- Nothing here touches admin/editor accounts (admin_users), tasks, task_steps,
-- quick_links, text_templates, media_items, guides, visual_settings, the
-- content-images bucket, urgent-task ordering (assign_new_urgent_sort_position,
-- reorder_urgent_tasks), or site_daily_metrics/get_admin_dashboard_stats's
-- surviving fields -- all of that stays exactly as-is.
--
-- This drops tables and cannot be undone by re-running an earlier migration.
-- Review before applying; take a backup/export first if any of this data
-- (registered users, historical task completions, leaderboard opt-ins) still
-- matters to you.
--
-- Does NOT remove the 'avatars' storage bucket -- Supabase blocks direct SQL
-- deletes against storage tables, so that has to be done separately via the
-- Dashboard or Storage API. See the note near the end of this file.
begin;

-- 1. Redefine the dashboard stats RPC to stop reading task_completions/profiles
-- before those tables go away. today_visits and current_urgent_tasks are the
-- only fields the app still consumes.
-- Postgres won't let CREATE OR REPLACE change a RETURNS TABLE(...) shape, so
-- the old 5-column version must be dropped explicitly first.
drop function if exists public.get_admin_dashboard_stats();
create function public.get_admin_dashboard_stats()
returns table (
  today_visits bigint,
  current_urgent_tasks bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shanghai_today date := (current_timestamp at time zone 'Asia/Shanghai')::date;
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select
    coalesce((select m.visit_count from public.site_daily_metrics m where m.metric_date = shanghai_today), 0)::bigint,
    (
      select count(*)
      from public.tasks t
      where t.status = 'published'
        and t.show_in_urgent
        and (t.deadline is null or t.deadline > current_timestamp)
    )::bigint;
end;
$$;
revoke all on function public.get_admin_dashboard_stats() from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_stats() to authenticated;

-- 2. Stop auto-creating profiles rows on new auth.users signups -- this
-- trigger would start failing on every new signup once profiles is dropped.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists private.handle_new_user();

-- 3. Leaderboard: cron job, RPCs, and the opt-out trigger, before the table.
-- Guarded: only runs if pg_cron was ever actually enabled.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'refresh-leaderboard-snapshots-daily';
  end if;
end $$;

drop function if exists public.refresh_leaderboard_snapshots();
-- This trigger lives on profiles, which isn't dropped until step 5 -- must
-- drop it explicitly here or the function drop below fails with a
-- dependency error.
drop trigger if exists remove_leaderboard_snapshots_on_opt_out on public.profiles;
drop function if exists private.remove_leaderboard_snapshots_on_opt_out();
drop table if exists public.leaderboard_snapshots;

-- 4. Task progress / platform account counts: triggers and RPCs, then tables.
-- Every trigger below is dropped explicitly before its function, regardless
-- of whether the trigger's host table is also dropped later in this script --
-- CREATE/DROP FUNCTION always fails while any trigger still references it,
-- even one on a table this same migration removes a few lines down.
-- clamp_progress_after_task_account_scope_change's trigger lives on `tasks`,
-- which isn't dropped at all, so it needs this either way.
drop trigger if exists clamp_progress_after_task_account_scope_change on public.tasks;
drop function if exists private.clamp_progress_after_task_account_scope_change();
drop trigger if exists clamp_progress_after_account_count_change on public.platform_account_counts;
drop function if exists private.clamp_progress_after_account_count_change();
drop trigger if exists validate_task_progress_account_target on public.task_progress;
drop function if exists private.validate_task_progress_account_target();
drop function if exists public.adjust_task_progress(uuid, integer);
drop table if exists public.task_progress;
drop table if exists public.platform_account_counts;

-- 5. Task completions and the accounts table itself.
drop function if exists public.complete_task(uuid);
drop table if exists public.task_completions;
drop table if exists public.profiles;

-- 6. Columns on tasks that only ever supported the features above.
alter table public.tasks drop column if exists completion_mode;
alter table public.tasks drop column if exists count_completion;
alter table public.tasks drop column if exists leaderboard_enabled;

-- 7. Orphaned visual_settings rows for module keys the admin UI no longer
-- offers (see the previous migration/commit). 'welcome' is kept -- it's an
-- intentional forward-looking placeholder, not a removed feature.
delete from public.visual_settings where module_key in ('global', 'me', 'leaderboard');

-- 8. The 'avatars' storage bucket is NOT handled here. Supabase blocks direct
-- SQL DELETE against storage.objects/storage.buckets (storage.protect_delete())
-- specifically to prevent this kind of accidental data loss -- bucket removal
-- has to go through the Storage API or Dashboard instead. To remove it:
-- Supabase Dashboard -> Storage -> avatars -> ... -> Delete bucket.
-- That single action deletes the bucket, everything in it, and its policies
-- together, correctly, in one step.

commit;
