-- When the Weibo post behind a watcher-made task was published, so /heat can show it (in Beijing
-- time) on each card. weibo_ingest already has it, but only admins can read that table. Existing
-- tasks are filled in from it; admin-made tasks stay null.
begin;

alter table public.tasks
add column if not exists source_posted_at timestamptz;

update public.tasks t
set source_posted_at = i.posted_at
from public.weibo_ingest i
where i.task_id = t.id
  and i.posted_at is not null
  and t.source_posted_at is null;

commit;
