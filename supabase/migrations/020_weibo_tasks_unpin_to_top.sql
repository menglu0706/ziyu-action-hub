-- A Weibo watcher task that loses the pinned slot (usually to a newer post) goes to the top of
-- the urgent list instead of the bottom, since it is still one of the freshest tasks. Manually
-- created tasks keep migration 015's behaviour and drop to the bottom when unpinned.
begin;

create or replace function private.assign_new_urgent_sort_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_assign boolean := false;
  to_bottom boolean := false;
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
      to_bottom := old.is_pinned and new.source is distinct from 'weibo';
    end if;
  end if;

  if should_assign then
    perform pg_catalog.pg_advisory_xact_lock(20260914, 3);
    if to_bottom then
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
        and t.id <> new.id
        and (t.deadline is null or t.deadline > now());
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.assign_new_urgent_sort_position()
from public, anon, authenticated;

commit;
