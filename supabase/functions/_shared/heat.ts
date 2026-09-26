// 加热 rules, shared by the weibo-watcher and the site's /dev/heat preview.
// lib/heat.ts is a copy of this file for the Next.js app -- keep the two identical.

// A Weibo post's HTML as plain text. Web-link cards (shown as 网页链接) and 超话 tag cards are
// dropped: neither reads as text.
export const plain=(html:string)=>html.replace(/<a [^>]*href="[^"]*(?:sinaurl|\/p\/index|\/p\/100808)[^"]*"[^>]*>[\s\S]*?<\/a>/g,'').replace(/<br\s*\/?>/g,'\n').replace(/<a [^>]*>全文<\/a>/g,'').replace(/<[^>]+>/g,'')
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'");

export type HeatPost={text:string;longText?:string;retweeted_status?:{text:string;user?:{id:number|string}}};
export type HeatKind='红膏'|'空瓶';
export type HeatResult={kind:HeatKind;repost:boolean;description:string}|{skip:string};

const POSITIVE_KEYWORDS=/梓渝|yuni|芋泥/i;
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

// A post's own text up to its first line with a link (to a post, comment or web page); hashtags
// and @mentions are kept, as that is how 加热 accounts write their instructions.
export function heatText(html:string){
  const lines:string[]=[];
  for(const line of html.split(/<br\s*\/?>/)){
    if(/<a [^>]*href="(?![^"]*containerid=231522)(?!\/n\/)[^"]*"/.test(line))break;
    const text=plain(line).replace(/https?:\/\/\S+/g,'').replace(/[ \t]+/g,' ').trim();
    if(text||lines.length)lines.push(text);
  }
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,300);
}

// Whether a 加热 account's post becomes a 加热 task, and which kind. Only a repost, or an original
// post that links to other posts, can be one, and never a 星品 post. Then, in this order:
//   空瓶 (a fight, 控评 / 空): its own text has one of KONG_MARKERS, or it links to comments;
//   红膏 (broadcasting good news): it reposts or links a post by one of ziyuUids (梓渝's own accounts
//     and brands), or its own text mentions POSITIVE_KEYWORDS together with one of HEAT_MARKERS (a
//     梓渝 mention alone, e.g. a 打榜 push, is not a 加热 call);
//   空瓶: its own text has one of HEAT_MARKERS. A hashtag alone isn't an instruction, and the
//     reposted post's text doesn't count.
// A repost of a repost (its text carries the "//@name:" chain) is ignored, as is anything else.
export function classifyHeat(post:HeatPost,ziyuUids:Set<string>):HeatResult{
  const html=post.longText??post.text,rt=post.retweeted_status;
  if(rt&&/\/\/\s*<a [^>]*>@|\/\/\s*@/.test(html))return {skip:'转发的转发'};
  if(!rt&&!linksPosts(html))return {skip:'原创但没有引用其他微博'};
  const own=plain(html);
  if(STAR_PRODUCT.test(own)||/href="[^"]*\/c\/wbox/.test(html))return {skip:'星品任务'};
  const kong=KONG_MARKERS.test(own)||linksComments(html);
  const positive=!kong&&(POSITIVE_KEYWORDS.test(own)&&HEAT_MARKERS.test(own)||[...linkedAuthors(html),...(rt?[String(rt.user?.id)]:[])].some(id=>ziyuUids.has(id)));
  const fight=kong||!positive&&HEAT_MARKERS.test(own);
  if(!positive&&!fight)return {skip:'没有梓渝关键词或加热指令'};
  return {kind:positive?'红膏':'空瓶',repost:Boolean(rt),description:withHeatNotice(heatText(html))};
}
// Every 加热 task's description opens with this line.
export const HEAT_NOTICE='先转发扩散再加热！！！';
export const withHeatNotice=(description:string)=>description.includes(HEAT_NOTICE)?description:[HEAT_NOTICE,description.trim()].filter(Boolean).join('\n');
export const heatTitle=(name:string,kind:HeatKind)=>`${name} ${kind==='红膏'?'红膏加热':'速来空瓶'}`;
