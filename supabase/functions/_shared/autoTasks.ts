// Tasks the weibo-watcher writes text for, shared by the watcher and the site.
// lib/autoTasks.ts is a copy of this file for the Next.js app -- keep the two identical.

// YUNI音乐日常任务: 月之必要's 打榜任务 posts rewrite its 一句话最快做法 (the watcher's UPDATE_ACCOUNTS).
export const DAILY_MUSIC_TASK_ID='f6eda702-5e58-4a4f-92e9-cbb372dd4f69';
// Tasks made in admin whose text the watcher rewrites; the site formats their text like the
// watcher's own tasks (source 'weibo').
export const AUTO_TEXT_TASK_IDS:readonly string[]=[DAILY_MUSIC_TASK_ID];
