-- Which /daily sub-tab (音乐 / 微博 / 鱼干 / 其他) a task is listed under.
begin;

alter table public.tasks
add column daily_group text not null default '其他'
check (daily_group in ('音乐', '微博', '鱼干', '其他'));

-- Pre-fill existing tasks from where they are done (platform) first, then
-- from their category. Admins can change any of these in the task form.
update public.tasks
set daily_group = case
  when platform = '微博' then '微博'
  when platform in ('QQ音乐', '网易云音乐') then '音乐'
  when category = '超话' then '微博'
  when category = '音乐' then '音乐'
  else '其他'
end;

commit;
