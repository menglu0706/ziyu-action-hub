// 加热 rules, shared by the weibo-watcher and the site's /dev/heat preview.
// lib/heat.ts is a copy of this file for the Next.js app -- keep the two identical.

// A Weibo post's HTML as plain text. Web-link cards (shown as 网页链接) and 超话 tag cards are
// dropped: neither reads as text.
export const plain=(html:string)=>html.replace(/<a [^>]*href="[^"]*(?:sinaurl|\/p\/index|\/p\/100808)[^"]*"[^>]*>[\s\S]*?<\/a>/g,'').replace(/<br\s*\/?>/g,'\n').replace(/<a [^>]*>全文<\/a>/g,'').replace(/<[^>]+>/g,'')
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'");

export type HeatPost={text:string;longText?:string;retweeted_status?:{text:string;user?:{id:number|string}}};
export type HeatKind='红膏'|'空瓶';
export type HeatResult={kind:HeatKind;repost:boolean;description:string}|{skip:string};

// 红膏 keywords: 梓渝's own names always count; the general words only when the post carries no
// one else's hashtag (a hashtag not about 梓渝), since fights push 热搜 too.
const POSITIVE_KEYWORDS=/梓渝|yuni|芋泥/i;
const POSITIVE_WORDS=/红膏|热搜|蓝v|公益|官号|正向|(?<![a-z])rs(?![a-z])/i;
const othersHashtag=(text:string)=>(text.match(/#[^#\n]+#/g)??[]).some(tag=>!POSITIVE_KEYWORDS.test(tag));
// 控评 / 空 instructions in a post's own text make it 空瓶, whatever else it says: 🈳, 前排, or 空 /
// 控 as an instruction (控评, 控一下, 空瓶, 速空, 来空, 去空, 空一下, 空这条) -- not inside ordinary
// words like 空腹 or 控制. So do links to specific comments (liking front-row comments is 控评).
const KONG_MARKERS=/🈳|前排|控评|控一下|空瓶|[速来去]空|空一下|空这/u;
const linksComments=(html:string)=>/href="[^"]*(?:detailbulletincomment|comment_id)/.test(html);
// 星品 / 新宣 progress posts are a different kind of task, not 加热.
const STAR_PRODUCT=/星品|新宣/u;
// Other instructions that make a post a 加热 call on their own: 加热 / 加🔥, a goal (3k👍, 万赞, 千转,
// 1k🧱) or a call to push (速来, 点…热门, 外显, 艾特智搜).
const HEAT_MARKERS=/加热|[加➕]🔥|\d+(?:\.\d+)?\s*[kKwW万千]?\s*(?:👍|赞|转|评|🧱|🍎)|[万千]\s*(?:👍|赞|转|评)|速来|稳热门|点.{0,4}热门|外显|艾特智搜/u;
// Links in a post's HTML to other Weibo posts, as the uids of their authors.
const linkedAuthors=(html:string)=>[...html.matchAll(/href="https?:\/\/(?:m\.)?weibo\.(?:com|cn)\/(\d+)\/\w+/g)].map(m=>m[1]);
// Whether a post's HTML links to at least one other Weibo post.
const linksPosts=(html:string)=>/href="https?:\/\/(?:m\.)?weibo\.(?:com|cn)\/(?:\d+|detail|status)\/\w+/.test(html);

// A 加热 goal: a target count (3000👍, 万赞, 1k🧱, 2🍎) or 🎯.
export const HEAT_GOAL=/\d+(?:\.\d+)?\s*[kKwW万千]?\s*(?:👍|赞|转|评|🧱|🍎)|[万千]\s*(?:👍|赞|转|评)|🎯/u;

// A post's own text up to its first line with a link (to a post, comment or web page); hashtags
// and @mentions are kept, as that is how 加热 accounts write their instructions. If it states a
// goal, only the phrases carrying one are kept.
export function heatText(html:string){
  const lines:string[]=[];
  for(const line of html.split(/<br\s*\/?>/)){
    if(/<a [^>]*href="(?![^"]*containerid=231522)(?!\/n\/)[^"]*"/.test(line))break;
    const text=plain(line).replace(/https?:\/\/\S+/g,'').replace(/[ \t]+/g,' ').trim();
    if(text||lines.length)lines.push(text);
  }
  return goalsOnly(lines.join('\n').replace(/\n{3,}/g,'\n\n').trim()).slice(0,300);
}
// When a text states a goal, only the phrases that carry one (the rest is commentary); otherwise
// the text as is. Applying it twice changes nothing.
export function goalsOnly(text:string){
  const goals=text.split(/\n|(?<=[，。！？!?；;])/).map(part=>part.trim().replace(/[，；;]$/,'')).filter(part=>HEAT_GOAL.test(part));
  return goals.length?goals.join('\n'):text;
}

// Whether a 加热 account's post becomes a 加热 task, and which kind. Only a repost, or an original
// post that links to other posts, can be one, and never a 星品 post. Then, in this order:
//   空瓶 (a fight, 控评 / 空): its own text has one of KONG_MARKERS, or it links to comments;
//   红膏 (broadcasting good news): it reposts or links a post by one of ziyuUids (梓渝's own accounts;
//     no brands, which change), or its own text has one of HEAT_MARKERS together with a 红膏 keyword:
//     POSITIVE_KEYWORDS, or POSITIVE_WORDS when it carries no one else's hashtag (a 梓渝 mention
//     alone, e.g. a 打榜 push, is not a 加热 call);
//   空瓶: its own text has one of HEAT_MARKERS. A hashtag alone isn't an instruction, and the
//     reposted post's text doesn't count.
// A repost of a repost (its text carries the "//@name:" chain) is ignored, as is anything else.
// personalUids: 梓渝's personal account(s). A post whose every linked or reposted post is theirs is
// skipped -- those posts already get a 紧急 task -- unless it also links comments (控评 is separate).
export function classifyHeat(post:HeatPost,ziyuUids:Set<string>,personalUids:Set<string>=new Set()):HeatResult{
  const html=post.longText??post.text,rt=post.retweeted_status;
  if(rt&&/\/\/\s*<a [^>]*>@|\/\/\s*@/.test(html))return {skip:'转发的转发'};
  if(!rt&&!linksPosts(html))return {skip:'原创但没有引用其他微博'};
  const targets=[...linkedAuthors(html),...(rt?[String(rt.user?.id)]:[])];
  if(targets.length&&targets.every(id=>personalUids.has(id))&&!linksComments(html))return {skip:'目标是梓渝个人博（紧急任务已覆盖）'};
  const own=plain(html);
  if(STAR_PRODUCT.test(own)||/href="[^"]*\/c\/wbox/.test(html))return {skip:'星品任务'};
  const kong=KONG_MARKERS.test(own)||linksComments(html);
  const positiveWords=POSITIVE_KEYWORDS.test(own)||POSITIVE_WORDS.test(own)&&!othersHashtag(own);
  const positive=!kong&&(positiveWords&&HEAT_MARKERS.test(own)||targets.some(id=>ziyuUids.has(id)));
  const fight=kong||!positive&&HEAT_MARKERS.test(own);
  if(!positive&&!fight)return {skip:'没有梓渝关键词或加热指令'};
  return {kind:positive?'红膏':'空瓶',repost:Boolean(rt),description:withHeatNotice(heatText(html))};
}
// Every 加热 task's description opens with this line.
export const HEAT_NOTICE='先转发扩散再加热！！！';
export const withHeatNotice=(description:string)=>description.includes(HEAT_NOTICE)?description:[HEAT_NOTICE,description.trim()].filter(Boolean).join('\n');
// A 加热 description as the site shows it: the notice, then goalsOnly of the rest. The site applies
// it on display, so tasks saved before a rule change read the same as new ones.
export const heatDisplayText=(description:string)=>withHeatNotice(goalsOnly(description.replace(HEAT_NOTICE,'').trim()));
export const heatTitle=(name:string,kind:HeatKind)=>`${name} ${kind==='红膏'?'红膏加热':'速来空瓶'}`;

// How long a 加热 task stays up: 红膏 10 hours, 空瓶 6 (and tasks made in admin, which have no kind).
export const HEAT_TTL_MS={红膏:10*3600e3,空瓶:6*3600e3,default:6*3600e3} as const;
export const heatTtl=(kind?:HeatKind|null)=>kind?HEAT_TTL_MS[kind]:HEAT_TTL_MS.default;

// /heat shows at most HEAT_TAB_LIMIT cards; when both kinds are live, each keeps at least HEAT_KIND_MIN.
export const HEAT_TAB_LIMIT=15;
const HEAT_KIND_MIN=2;
export type HeatRankItem={heatKind?:HeatKind|null;heatRepost?:boolean;createdAt?:string};
// Original posts before reposts, newest first within each.
const byRank=(a:HeatRankItem,b:HeatRankItem)=>Number(Boolean(a.heatRepost))-Number(Boolean(b.heatRepost))||(b.createdAt??'').localeCompare(a.createdAt??'');
// The cards /heat shows, in order: the best-ranked HEAT_TAB_LIMIT, except that a kind with fewer than
// HEAT_KIND_MIN of them takes the places of the lowest-ranked cards of the other kind. The watcher
// takes offline the watcher-made tasks this leaves out (the rotation).
export function pickHeat<T extends HeatRankItem>(tasks:T[],limit=HEAT_TAB_LIMIT):T[]{
  const ranked=[...tasks].sort(byRank),chosen=ranked.slice(0,limit),rest=ranked.slice(limit);
  const count=(kind:HeatKind)=>chosen.filter(task=>task.heatKind===kind).length;
  for(const kind of ['红膏','空瓶'] as const){
    const extras=rest.filter(task=>task.heatKind===kind);
    while(count(kind)<HEAT_KIND_MIN&&extras.length){
      // The lowest-ranked card that can give up its place: not this kind, and not taking the other kind below its minimum.
      const index=chosen.findLastIndex(task=>task.heatKind!==kind&&(!task.heatKind||count(task.heatKind)>HEAT_KIND_MIN));
      if(index<0)break;
      chosen.splice(index,1);
      chosen.push(extras.shift()!);
    }
  }
  return chosen.sort(byRank);
}
