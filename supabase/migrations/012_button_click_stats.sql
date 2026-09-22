-- Daily click counts per button, for the admin dashboard.
begin;

create table if not exists public.button_click_stats (
  click_date date not null,
  button_key text not null,
  click_count bigint not null default 0 check (click_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (click_date, button_key)
);

alter table public.button_click_stats enable row level security;
revoke all on table public.button_click_stats from public, anon, authenticated;

create or replace function public.increment_button_click(p_button_key text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_button_key is null or length(p_button_key) = 0 or length(p_button_key) > 200 then
    return;
  end if;

  insert into public.button_click_stats (click_date, button_key, click_count, updated_at)
  values ((current_timestamp at time zone 'Asia/Shanghai')::date, p_button_key, 1, current_timestamp)
  on conflict (click_date, button_key) do update
  set click_count = public.button_click_stats.click_count + 1,
      updated_at = current_timestamp;
end;
$$;
revoke all on function public.increment_button_click(text) from public, anon, authenticated;
grant execute on function public.increment_button_click(text) to anon, authenticated;

create index if not exists button_click_stats_date_idx
on public.button_click_stats (click_date);

-- Returns today's (Asia/Shanghai) click counts for the fixed nav-tab keys,
-- plus the top task CTA buttons by click count today.
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
    and b.button_key in ('nav:urgent', 'nav:daily', 'nav:media', 'nav:guide');

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
revoke all on function public.get_button_click_stats() from public, anon, authenticated;
grant execute on function public.get_button_click_stats() to authenticated;

commit;
