-- 加热 tasks made from a repost (rather than an account's own post) are listed after the
-- original-post ones on /heat. Tasks made in admin count as originals.
begin;

alter table public.tasks
add column heat_repost boolean not null default false;

drop index if exists public.tasks_active_heat_order_idx;
create index tasks_active_heat_order_idx
on public.tasks (heat_repost, created_at desc)
where status = 'published' and show_in_heat;

commit;
