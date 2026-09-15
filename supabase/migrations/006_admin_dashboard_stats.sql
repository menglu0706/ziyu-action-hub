-- Real admin dashboard statistics and privacy-minimal daily visit aggregation.
begin;

create table if not exists public.site_daily_metrics (
  metric_date date primary key,
  visit_count bigint not null default 0 check (visit_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.site_daily_metrics enable row level security;
revoke all on table public.site_daily_metrics from public, anon, authenticated;

create or replace function public.increment_daily_site_visit()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.site_daily_metrics (metric_date, visit_count, updated_at)
  values ((current_timestamp at time zone 'Asia/Shanghai')::date, 1, current_timestamp)
  on conflict (metric_date) do update
  set visit_count = public.site_daily_metrics.visit_count + 1,
      updated_at = current_timestamp;
$$;
revoke all on function public.increment_daily_site_visit() from public, anon, authenticated;
grant execute on function public.increment_daily_site_visit() to anon, authenticated;

create index if not exists task_completions_completed_at_idx
on public.task_completions (completed_at);

create index if not exists tasks_published_deadline_idx
on public.tasks (deadline)
where status = 'published';

create or replace function public.get_admin_dashboard_stats()
returns table (
  today_visits bigint,
  today_task_completions bigint,
  registered_users bigint,
  current_urgent_tasks bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shanghai_today date := (current_timestamp at time zone 'Asia/Shanghai')::date;
  day_start timestamptz := shanghai_today::timestamp at time zone 'Asia/Shanghai';
  day_end timestamptz := (shanghai_today + 1)::timestamp at time zone 'Asia/Shanghai';
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select
    coalesce((select m.visit_count from public.site_daily_metrics m where m.metric_date = shanghai_today), 0)::bigint,
    (select count(*) from public.task_completions tc where tc.completed_at >= day_start and tc.completed_at < day_end)::bigint,
    (select count(*) from public.profiles p)::bigint,
    (select count(*) from public.tasks t where t.status = 'published' and (t.deadline is null or t.deadline > current_timestamp))::bigint;
end;
$$;
revoke all on function public.get_admin_dashboard_stats() from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_stats() to authenticated;

commit;
