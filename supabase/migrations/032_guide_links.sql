-- 攻略 items (tips / 攻略指引 / 常见问题) can carry a link: /guide then shows the same
-- 「立即前往 ↗」 button as the task cards. button_label replaces the button's text when set;
-- items without external_url look as before.
begin;

alter table public.guides
add column if not exists external_url text,
add column if not exists button_label text;

commit;
