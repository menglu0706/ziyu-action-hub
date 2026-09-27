-- Which Weibo posts (ids) each watcher-made 加热 task covers: a repost covers the post it reposts;
-- an original that lists posts (a collection) covers every listed post and itself. The watcher uses
-- it both ways: a new repost is skipped when a live 加热 task already covers its post, and a new
-- collection takes offline the live tasks covering any post it lists. Null for older and admin-made
-- tasks.
begin;

alter table public.tasks
add column if not exists heat_targets text[];

create index if not exists tasks_heat_targets_idx
on public.tasks using gin (heat_targets)
where show_in_heat and heat_targets is not null;

commit;
