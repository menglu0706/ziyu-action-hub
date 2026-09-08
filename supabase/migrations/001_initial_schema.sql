-- ZIYU Action Hub: initial Supabase schema, grants, RLS, and public seed data.
-- Run this file manually in the Supabase SQL Editor as a project owner.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
grant usage on schema public to anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '',
  avatar_url text,
  leaderboard_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_users add column if not exists updated_at timestamptz not null default now();

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  platform text,
  external_url text not null,
  quick_instruction text not null,
  urgency_score integer not null default 0 check (urgency_score >= 0),
  required_score integer not null default 0 check (required_score >= 0),
  estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
  deadline timestamptz,
  is_pinned boolean not null default false,
  show_in_daily boolean not null default true,
  is_multi_account boolean not null default false,
  count_completion boolean not null default true,
  leaderboard_enabled boolean not null default true,
  push_reserved boolean not null default false,
  audience text not null default 'all',
  status text not null default 'published' check (status in ('draft', 'published', 'offline')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  step_number integer not null check (step_number > 0),
  content text not null,
  created_at timestamptz not null default now(),
  unique (task_id, step_number)
);

create table if not exists public.quick_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text,
  external_url text not null,
  icon_key text,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.text_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  template_type text not null,
  content text not null,
  is_pinned_today boolean not null default false,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  published_at timestamptz not null default now(),
  cover_url text,
  external_url text not null,
  is_new boolean not null default false,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guides (
  id uuid primary key default gen_random_uuid(),
  guide_type text not null check (guide_type in ('tip', 'guide', 'faq')),
  title text not null,
  summary text,
  content text not null,
  category text,
  sort_order integer not null default 0,
  status text not null default 'published' check (status in ('draft', 'published', 'offline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visual_settings (
  id uuid primary key default gen_random_uuid(),
  module_key text unique not null check (module_key in ('global','urgent','daily','media','guide','me','leaderboard','welcome')),
  background_url text,
  use_custom_background boolean not null default false,
  background_position text not null default 'center',
  background_size text not null default 'cover' check (background_size in ('cover', 'contain')),
  overlay_opacity numeric not null default 0 check (overlay_opacity >= 0 and overlay_opacity <= 1),
  decorative_text text,
  show_decorative_text boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_account_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  account_count integer not null default 1 check (account_count >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

create table if not exists public.task_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  completed_count integer not null default 0 check (completed_count >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, task_id)
);

create index if not exists tasks_public_priority_idx on public.tasks (status, is_pinned desc, deadline, urgency_score desc, required_score desc, sort_order);
create index if not exists task_steps_task_id_idx on public.task_steps (task_id);
create index if not exists platform_account_counts_user_id_idx on public.platform_account_counts (user_id);
create index if not exists task_progress_user_id_idx on public.task_progress (user_id);
create index if not exists task_progress_task_id_idx on public.task_progress (task_id);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
      and is_active = true
      and role in ('admin', 'editor')
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nickname', split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','admin_users','tasks','quick_links','text_templates','media_items','guides','visual_settings','platform_account_counts','task_progress']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.tasks enable row level security;
alter table public.task_steps enable row level security;
alter table public.quick_links enable row level security;
alter table public.text_templates enable row level security;
alter table public.media_items enable row level security;
alter table public.guides enable row level security;
alter table public.visual_settings enable row level security;
alter table public.platform_account_counts enable row level security;
alter table public.task_progress enable row level security;

revoke all on table public.profiles, public.admin_users, public.tasks, public.task_steps, public.quick_links, public.text_templates, public.media_items, public.guides, public.visual_settings, public.platform_account_counts, public.task_progress from anon, authenticated;
grant select on table public.tasks, public.task_steps, public.quick_links, public.text_templates, public.media_items, public.guides, public.visual_settings to anon, authenticated;
grant insert, update, delete on table public.tasks, public.task_steps, public.quick_links, public.text_templates, public.media_items, public.guides, public.visual_settings to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.platform_account_counts, public.task_progress to authenticated;
grant select on table public.admin_users to authenticated;

drop policy if exists tasks_public_read on public.tasks;
drop policy if exists tasks_admin_read on public.tasks;
drop policy if exists tasks_admin_insert on public.tasks;
drop policy if exists tasks_admin_update on public.tasks;
drop policy if exists tasks_admin_delete on public.tasks;
create policy tasks_public_read on public.tasks for select to anon, authenticated using (status = 'published');
create policy tasks_admin_read on public.tasks for select to authenticated using ((select private.is_admin()));
create policy tasks_admin_insert on public.tasks for insert to authenticated with check ((select private.is_admin()) and created_by = (select auth.uid()));
create policy tasks_admin_update on public.tasks for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy tasks_admin_delete on public.tasks for delete to authenticated using ((select private.is_admin()));

drop policy if exists task_steps_public_read on public.task_steps;
drop policy if exists task_steps_admin_read on public.task_steps;
drop policy if exists task_steps_admin_insert on public.task_steps;
drop policy if exists task_steps_admin_update on public.task_steps;
drop policy if exists task_steps_admin_delete on public.task_steps;
create policy task_steps_public_read on public.task_steps for select to anon, authenticated using (exists (select 1 from public.tasks where tasks.id = task_steps.task_id and tasks.status = 'published'));
create policy task_steps_admin_read on public.task_steps for select to authenticated using ((select private.is_admin()));
create policy task_steps_admin_insert on public.task_steps for insert to authenticated with check ((select private.is_admin()));
create policy task_steps_admin_update on public.task_steps for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy task_steps_admin_delete on public.task_steps for delete to authenticated using ((select private.is_admin()));

drop policy if exists quick_links_public_read on public.quick_links;
drop policy if exists quick_links_admin_read on public.quick_links;
drop policy if exists quick_links_admin_insert on public.quick_links;
drop policy if exists quick_links_admin_update on public.quick_links;
drop policy if exists quick_links_admin_delete on public.quick_links;
create policy quick_links_public_read on public.quick_links for select to anon, authenticated using (is_enabled = true);
create policy quick_links_admin_read on public.quick_links for select to authenticated using ((select private.is_admin()));
create policy quick_links_admin_insert on public.quick_links for insert to authenticated with check ((select private.is_admin()));
create policy quick_links_admin_update on public.quick_links for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy quick_links_admin_delete on public.quick_links for delete to authenticated using ((select private.is_admin()));

drop policy if exists text_templates_public_read on public.text_templates;
drop policy if exists text_templates_admin_read on public.text_templates;
drop policy if exists text_templates_admin_insert on public.text_templates;
drop policy if exists text_templates_admin_update on public.text_templates;
drop policy if exists text_templates_admin_delete on public.text_templates;
create policy text_templates_public_read on public.text_templates for select to anon, authenticated using (is_enabled = true);
create policy text_templates_admin_read on public.text_templates for select to authenticated using ((select private.is_admin()));
create policy text_templates_admin_insert on public.text_templates for insert to authenticated with check ((select private.is_admin()));
create policy text_templates_admin_update on public.text_templates for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy text_templates_admin_delete on public.text_templates for delete to authenticated using ((select private.is_admin()));

drop policy if exists media_items_public_read on public.media_items;
drop policy if exists media_items_admin_read on public.media_items;
drop policy if exists media_items_admin_insert on public.media_items;
drop policy if exists media_items_admin_update on public.media_items;
drop policy if exists media_items_admin_delete on public.media_items;
create policy media_items_public_read on public.media_items for select to anon, authenticated using (is_enabled = true);
create policy media_items_admin_read on public.media_items for select to authenticated using ((select private.is_admin()));
create policy media_items_admin_insert on public.media_items for insert to authenticated with check ((select private.is_admin()));
create policy media_items_admin_update on public.media_items for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy media_items_admin_delete on public.media_items for delete to authenticated using ((select private.is_admin()));

drop policy if exists guides_public_read on public.guides;
drop policy if exists guides_admin_read on public.guides;
drop policy if exists guides_admin_insert on public.guides;
drop policy if exists guides_admin_update on public.guides;
drop policy if exists guides_admin_delete on public.guides;
create policy guides_public_read on public.guides for select to anon, authenticated using (status = 'published');
create policy guides_admin_read on public.guides for select to authenticated using ((select private.is_admin()));
create policy guides_admin_insert on public.guides for insert to authenticated with check ((select private.is_admin()));
create policy guides_admin_update on public.guides for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy guides_admin_delete on public.guides for delete to authenticated using ((select private.is_admin()));

drop policy if exists visual_settings_public_read on public.visual_settings;
drop policy if exists visual_settings_admin_insert on public.visual_settings;
drop policy if exists visual_settings_admin_update on public.visual_settings;
drop policy if exists visual_settings_admin_delete on public.visual_settings;
create policy visual_settings_public_read on public.visual_settings for select to anon, authenticated using (true);
create policy visual_settings_admin_insert on public.visual_settings for insert to authenticated with check ((select private.is_admin()));
create policy visual_settings_admin_update on public.visual_settings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy visual_settings_admin_delete on public.visual_settings for delete to authenticated using ((select private.is_admin()));

drop policy if exists profiles_own_read on public.profiles;
drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_own_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists account_counts_own_read on public.platform_account_counts;
drop policy if exists account_counts_own_insert on public.platform_account_counts;
drop policy if exists account_counts_own_update on public.platform_account_counts;
drop policy if exists account_counts_own_delete on public.platform_account_counts;
create policy account_counts_own_read on public.platform_account_counts for select to authenticated using (user_id = (select auth.uid()));
create policy account_counts_own_insert on public.platform_account_counts for insert to authenticated with check (user_id = (select auth.uid()));
create policy account_counts_own_update on public.platform_account_counts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy account_counts_own_delete on public.platform_account_counts for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists task_progress_own_read on public.task_progress;
drop policy if exists task_progress_own_insert on public.task_progress;
drop policy if exists task_progress_own_update on public.task_progress;
drop policy if exists task_progress_own_delete on public.task_progress;
create policy task_progress_own_read on public.task_progress for select to authenticated using (user_id = (select auth.uid()));
create policy task_progress_own_insert on public.task_progress for insert to authenticated with check (user_id = (select auth.uid()));
create policy task_progress_own_update on public.task_progress for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy task_progress_own_delete on public.task_progress for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists admin_users_own_read on public.admin_users;
create policy admin_users_own_read on public.admin_users for select to authenticated using (user_id = (select auth.uid()));

insert into public.tasks (id,title,description,category,platform,external_url,quick_instruction,urgency_score,required_score,estimated_minutes,deadline,is_pinned,show_in_daily,is_multi_account,status,sort_order)
values
 ('10000000-0000-4000-8000-000000000001','巅峰榜投金币','今日榜单冲刺阶段，请优先完成金币投票。','音乐','QQ音乐','https://y.qq.com','打开巅峰榜，为梓渝投出今日金币',100,100,2,now()+interval '1 day',true,true,true,'published',1),
 ('10000000-0000-4000-8000-000000000002','超话签到与互动','完成今日超话签到，并选择一条内容互动。','数据','微博','https://weibo.com','签到后完成一条有效互动',82,80,3,now()+interval '2 days',false,true,true,'published',2),
 ('10000000-0000-4000-8000-000000000003','品牌内容支持','前往品牌发布内容，完成自然、真实的互动。','商务','微博','https://weibo.com','进入品牌原帖完成自然互动',66,75,5,now()+interval '4 days',false,true,false,'published',3),
 ('10000000-0000-4000-8000-000000000004','歌曲日常播放','使用官方音乐平台正常收听。','日常','网易云音乐','https://music.163.com','按歌单顺序正常播放',40,55,10,now()+interval '30 days',false,true,false,'published',4)
on conflict (id) do nothing;

insert into public.task_steps (task_id,step_number,content) values
 ('10000000-0000-4000-8000-000000000001',1,'打开QQ音乐'),('10000000-0000-4000-8000-000000000001',2,'搜索梓渝'),('10000000-0000-4000-8000-000000000001',3,'进入巅峰榜'),('10000000-0000-4000-8000-000000000001',4,'完成投票'),('10000000-0000-4000-8000-000000000001',5,'返回本站点击完成')
on conflict (task_id,step_number) do nothing;

insert into public.quick_links (id,title,platform,external_url,icon_key,sort_order,is_enabled) values
 ('20000000-0000-4000-8000-000000000001','QQ音乐','音乐','https://y.qq.com','♪',1,true),('20000000-0000-4000-8000-000000000002','微博','社交','https://weibo.com','◎',2,true),('20000000-0000-4000-8000-000000000003','微博超话','社交','https://weibo.com','#',3,true),('20000000-0000-4000-8000-000000000004','腾讯视频','视频','https://v.qq.com','▷',4,true),('20000000-0000-4000-8000-000000000005','抖音','视频','https://www.douyin.com','♫',5,true),('20000000-0000-4000-8000-000000000006','网易云音乐','音乐','https://music.163.com','♬',6,true),('20000000-0000-4000-8000-000000000007','豆瓣','社区','https://www.douban.com','豆',7,true),('20000000-0000-4000-8000-000000000008','百度','搜索','https://www.baidu.com','百',8,true)
on conflict (id) do nothing;

insert into public.text_templates (id,title,template_type,content,is_pinned_today,sort_order,is_enabled) values
 ('30000000-0000-4000-8000-000000000001','今日超话支持','超话文案','梓渝全肯定',true,1,true),('30000000-0000-4000-8000-000000000002','转发支持短句','转发支持文案','看向你，只看向你',false,2,true),('30000000-0000-4000-8000-000000000003','ZZP 默认尾巴','ZZP尾巴','YUNI会永远永远陪梓渝黏黏糊糊走下去……',true,3,true)
on conflict (id) do nothing;

insert into public.media_items (id,title,category,published_at,external_url,is_new,is_enabled) values
 ('40000000-0000-4000-8000-000000000001','舞台直拍｜蓝色现场','舞台',now(),'https://weibo.com',true,true),('40000000-0000-4000-8000-000000000002','新采访完整片段','采访',now()-interval '1 day','https://weibo.com',true,true),('40000000-0000-4000-8000-000000000003','品牌活动高清图集','商务',now()-interval '2 days','https://weibo.com',false,true)
on conflict (id) do nothing;

insert into public.guides (id,guide_type,title,summary,content,category,sort_order,status) values
 ('50000000-0000-4000-8000-000000000001','tip','巅峰榜怎么做最快？','两分钟完成今日金币投票','从快捷入口进入 QQ 音乐，搜索梓渝后进入巅峰榜，确认金币数量并一次投出。','音乐',1,'published'),('50000000-0000-4000-8000-000000000002','guide','金币怎么攒？','每日获取金币的常用途径','完成平台日常任务并留意金币到账提示，集中在重要榜单开放时使用。','音乐',2,'published'),('50000000-0000-4000-8000-000000000003','faq','新手必看','从最重要的一件事开始','先完成紧急页置顶任务，再按自己的时间选择日常任务。','日常',3,'published')
on conflict (id) do nothing;

insert into public.visual_settings (module_key,background_position,background_size,decorative_text,show_decorative_text)
select module_key,'center top','cover',case when module_key='global' then 'More for ZIYU' end,module_key='global'
from unnest(array['global','urgent','daily','media','guide','me','leaderboard','welcome']) as module_key
on conflict (module_key) do nothing;
