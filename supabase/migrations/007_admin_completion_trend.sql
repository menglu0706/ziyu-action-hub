-- Add the real latest-seven-day completion trend to the existing admin stats RPC.
begin;

drop function if exists public.get_admin_dashboard_stats();

create function public.get_admin_dashboard_stats()
returns table (
  today_visits bigint,
  today_task_completions bigint,
  registered_users bigint,
  current_urgent_tasks bigint,
  completion_trend jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shanghai_today date := (current_timestamp at time zone 'Asia/Shanghai')::date;
  trend_start timestamptz := (shanghai_today - 6)::timestamp at time zone 'Asia/Shanghai';
  trend_end timestamptz := (shanghai_today + 1)::timestamp at time zone 'Asia/Shanghai';
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  with days as (
    select shanghai_today - offset_value as completion_date
    from generate_series(6, 0, -1) as offsets(offset_value)
  ),
  completion_counts as (
    select
      (tc.completed_at at time zone 'Asia/Shanghai')::date as completion_date,
      count(*)::bigint as completion_count
    from public.task_completions tc
    where tc.completed_at >= trend_start
      and tc.completed_at < trend_end
    group by (tc.completed_at at time zone 'Asia/Shanghai')::date
  ),
  trend as (
    select jsonb_agg(
      jsonb_build_object(
        'date', to_char(days.completion_date, 'YYYY-MM-DD'),
        'count', coalesce(completion_counts.completion_count, 0)
      )
      order by days.completion_date
    ) as completion_trend
    from days
    left join completion_counts using (completion_date)
  )
  select
    coalesce((select m.visit_count from public.site_daily_metrics m where m.metric_date = shanghai_today), 0)::bigint,
    coalesce((select c.completion_count from completion_counts c where c.completion_date = shanghai_today), 0)::bigint,
    (select count(*) from public.profiles p)::bigint,
    (select count(*) from public.tasks t where t.status = 'published' and (t.deadline is null or t.deadline > current_timestamp))::bigint,
    trend.completion_trend
  from trend;
end;
$$;

revoke all on function public.get_admin_dashboard_stats() from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_stats() to authenticated;

commit;
