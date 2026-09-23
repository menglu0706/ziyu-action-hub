-- A task that leaves the pinned slot (manual unpin or an ended pin schedule)
-- now drops to the bottom of the urgent/daily lists instead of the top.
-- Newly published or newly visible tasks still enter at the top.
begin;

create or replace function private.assign_new_urgent_sort_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_assign boolean := false;
  was_unpinned boolean := false;
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
      was_unpinned := old.is_pinned;
    end if;
  end if;

  if should_assign then
    perform pg_catalog.pg_advisory_xact_lock(20260914, 3);
    if was_unpinned then
      select coalesce(max(t.urgent_sort_position), 0) + 1
        into new.urgent_sort_position
      from public.tasks t
      where t.status = 'published'
        and t.show_in_urgent
        and not t.is_pinned
        and t.id <> new.id
        and (t.deadline is null or t.deadline > now());
    else
      select coalesce(min(t.urgent_sort_position), 0) - 1
        into new.urgent_sort_position
      from public.tasks t
      where t.status = 'published'
        and t.show_in_urgent
        and not t.is_pinned
        and (t.deadline is null or t.deadline > now());
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.assign_new_urgent_sort_position()
from public, anon, authenticated;

create or replace function private.assign_new_daily_sort_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_assign boolean := false;
  was_unpinned boolean := false;
begin
  if new.status = 'published'
     and new.show_in_daily
     and not new.is_pinned
     and (new.deadline is null or new.deadline > now()) then
    if tg_op = 'INSERT' then
      should_assign := true;
    else
      should_assign := old.status is distinct from 'published'
        or old.show_in_daily is distinct from true
        or old.is_pinned
        or (old.deadline is not null and old.deadline <= now());
      was_unpinned := old.is_pinned;
    end if;
  end if;

  if should_assign then
    perform pg_catalog.pg_advisory_xact_lock(20260914, 4);
    if was_unpinned then
      select coalesce(max(t.daily_sort_position), 0) + 1
        into new.daily_sort_position
      from public.tasks t
      where t.status = 'published'
        and t.show_in_daily
        and not t.is_pinned
        and t.id <> new.id
        and (t.deadline is null or t.deadline > now());
    else
      select coalesce(min(t.daily_sort_position), 0) - 1
        into new.daily_sort_position
      from public.tasks t
      where t.status = 'published'
        and t.show_in_daily
        and not t.is_pinned
        and (t.deadline is null or t.deadline > now());
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.assign_new_daily_sort_position()
from public, anon, authenticated;

commit;
