-- 加热 tab: tasks shown on /heat. They expire through the ordinary deadline, which defaults to
-- 6 hours after going live (set by saveTask and the Weibo watcher) and can be changed like any other.
-- Unlike other tasks, a 加热 task past its deadline is also switched to offline, by the same
-- 5-minute job that expires the watcher's tasks (migration 019).
begin;

alter table public.tasks
add column show_in_heat boolean not null default false;

create index tasks_active_heat_order_idx
on public.tasks (created_at desc)
where status = 'published' and show_in_heat;

create or replace function private.expire_auto_tasks()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks
  set status = 'offline', is_pinned = false, auto_offline_at = null, updated_at = now()
  where auto_offline_at is not null
    and auto_offline_at <= now()
    and status = 'published';

  -- Drafts or tasks already taken offline by hand just drop the expiry.
  update public.tasks
  set auto_offline_at = null
  where auto_offline_at is not null
    and auto_offline_at <= now();

  update public.tasks
  set status = 'offline', is_pinned = false, updated_at = now()
  where show_in_heat
    and status = 'published'
    and deadline <= now();
end;
$$;

revoke all on function private.expire_auto_tasks()
from public, anon, authenticated;

-- The 加热 tab joins the dashboard's nav click counts.
create or replace function public.get_button_click_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shanghai_today date := (current_timestamp at time zone 'Asia/Shanghai')::date;
  nav_stats jsonb;
  top_tasks jsonb;
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(b.button_key, b.click_count), '{}'::jsonb)
  into nav_stats
  from public.button_click_stats b
  where b.click_date = shanghai_today
    and b.button_key in ('nav:urgent', 'nav:heat', 'nav:daily', 'nav:media', 'nav:guide');

  select coalesce(jsonb_agg(row_to_json(ranked)), '[]'::jsonb)
  into top_tasks
  from (
    select
      b.button_key,
      t.title,
      b.click_count
    from public.button_click_stats b
    left join public.tasks t on t.id::text = replace(b.button_key, 'task_cta:', '')
    where b.click_date = shanghai_today
      and b.button_key like 'task_cta:%'
    order by b.click_count desc
    limit 10
  ) ranked;

  return jsonb_build_object('navClicks', nav_stats, 'topTaskClicks', top_tasks);
end;
$$;

commit;
