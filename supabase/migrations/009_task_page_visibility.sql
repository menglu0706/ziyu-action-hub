-- Independent urgent/daily task visibility with matching ordering and dashboard semantics.
begin;

alter table public.tasks
add column show_in_urgent boolean not null default true;

-- Preserve the pre-migration behavior: every existing task was eligible for
-- /urgent whenever it became published and had not expired. Administrators can
-- explicitly turn this off after review. Adding the column with a constant
-- default avoids firing task update triggers for existing rows; future inserts
-- default to hidden after this separate default change.
alter table public.tasks
alter column show_in_urgent set default false;

drop index if exists public.tasks_active_urgent_order_idx;
create index tasks_active_urgent_order_idx
on public.tasks (is_pinned desc, urgent_sort_position asc, created_at desc)
where status = 'published' and show_in_urgent;

create or replace function private.assign_new_urgent_sort_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_assign boolean := false;
begin
  if new.status = 'published'
     and new.show_in_urgent
     and not new.is_pinned
     and (new.deadline is null or new.deadline > now()) then
    if tg_op = 'INSERT' then
      should_assign := true;
    else
      should_assign := old.status is distinct from 'published'
        or old.show_in_urgent is distinct from true
        or old.is_pinned
        or (old.deadline is not null and old.deadline <= now());
    end if;
  end if;

  if should_assign then
    perform pg_catalog.pg_advisory_xact_lock(20260914, 3);
    select coalesce(min(t.urgent_sort_position), 0) - 1
      into new.urgent_sort_position
    from public.tasks t
    where t.status = 'published'
      and t.show_in_urgent
      and not t.is_pinned
      and (t.deadline is null or t.deadline > now());
  end if;
  return new;
end;
$$;

revoke all on function private.assign_new_urgent_sort_position()
from public, anon, authenticated;

create or replace function public.reorder_urgent_tasks(p_task_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_count integer;
  distinct_supplied_count integer;
  eligible_count integer;
begin
  if not private.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_task_ids is null then
    raise exception 'Task order required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20260914, 3);

  select count(*), count(distinct supplied.id)
  into supplied_count, distinct_supplied_count
  from unnest(p_task_ids) as supplied(id);

  if supplied_count <> distinct_supplied_count then
    raise exception 'Duplicate task IDs are not allowed';
  end if;

  select count(*)
  into eligible_count
  from public.tasks t
  where t.status = 'published'
    and t.show_in_urgent
    and not t.is_pinned
    and (t.deadline is null or t.deadline > now());

  if supplied_count <> eligible_count or exists (
    select 1
    from unnest(p_task_ids) as supplied(id)
    left join public.tasks t on t.id = supplied.id
    where t.id is null
      or t.status <> 'published'
      or not t.show_in_urgent
      or t.is_pinned
      or (t.deadline is not null and t.deadline <= now())
  ) then
    raise exception 'Order must contain every active non-pinned urgent task exactly once';
  end if;

  update public.tasks t
  set urgent_sort_position = ordered.position,
      updated_at = now()
  from unnest(p_task_ids) with ordinality as ordered(id, position)
  where t.id = ordered.id;
end;
$$;

revoke all on function public.reorder_urgent_tasks(uuid[])
from public, anon, authenticated;
grant execute on function public.reorder_urgent_tasks(uuid[]) to authenticated;

create or replace function public.get_admin_dashboard_stats()
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
    (
      select count(*)
      from public.tasks t
      where t.status = 'published'
        and t.show_in_urgent
        and (t.deadline is null or t.deadline > current_timestamp)
    )::bigint,
    trend.completion_trend
  from trend;
end;
$$;

revoke all on function public.get_admin_dashboard_stats()
from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_stats() to authenticated;

commit;
