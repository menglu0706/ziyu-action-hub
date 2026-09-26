-- How /heat picks its cards: original-post tasks before repost ones, and each kind (红膏 / 空瓶)
-- keeps at least 2 places when both are live (lib/heatList.ts). heat_repost marks tasks made from
-- a repost; heat_kind is the watcher's 红膏 / 空瓶 (null for tasks made in admin). Safe to re-run.
begin;

alter table public.tasks
add column if not exists heat_repost boolean not null default false,
add column if not exists heat_kind text check (heat_kind in ('红膏', '空瓶'));

drop index if exists public.tasks_active_heat_order_idx;
create index tasks_active_heat_order_idx
on public.tasks (heat_repost, created_at desc)
where status = 'published' and show_in_heat;

commit;
