-- /media items made from 小红书 / 抖音 share cards that 加热 accounts post to Weibo.
-- description: the card's author and topics (小红书: plus the note's content), shown under the title.
-- share_key: which original post the item is for (xhs:<note id>, or dy:<author>:<Beijing date> for
-- 抖音), so the same post shared by several accounts becomes one item.
begin;

alter table public.media_items
add column if not exists description text,
add column if not exists share_key text;

create unique index if not exists media_items_share_key_idx
on public.media_items (share_key)
where share_key is not null;

commit;
