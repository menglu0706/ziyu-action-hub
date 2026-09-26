// Copy of supabase/functions/_shared/heat.ts for the Next.js app -- keep the two identical.
// 加热 rules, shared by the weibo-watcher and the site's /dev/heat preview.

// A Weibo post's HTML as plain text. Web-link cards (shown as 网页链接) and 超话 tag cards are
// dropped: neither reads as text.
export const plain=(html:string)=>html.replace(/<a [^>]*href="[^"]*(?:sinaurl|\/p\/index|\/p\/100808)[^"]*"[^>]*>[\s\S]*?<\/a>/g,'').replace(/<br\s*\/?>/g,'\n').replace(/<a [^>]*>全文<\/a>/g,'').replace(/<[^>]+>/g,'')
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'");

export type HeatPost={text:string;longText?:string;retweeted_status?:{text:string;user?:{id:number|string}}};
export type HeatKind='红膏'|'空瓶';
export type HeatResult={kind:HeatKind;repost:boolean;description:string}|{skip:string};

const POSITIVE_KEYWORDS=/梓渝|yuni|芋泥/i;
// 🈳 / 空 / 控 (控评, 空瓶) in a post's own text make it 空瓶, whatever else it says.
const KONG_MARKERS=/🈳|空|控/u;
// Other instructions that make a post a 加热 call on their own.
const HEAT_MARKERS=/加热|[加➕]🔥/u;
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
// post that links to other posts, can be one. Then, in this order:
//   空瓶 (a fight, 控评 / 空): its own text has one of KONG_MARKERS;
//   红膏 (broadcasting good news): its own text mentions POSITIVE_KEYWORDS, or it reposts or links a
//     post by one of ziyuUids (梓渝's own accounts and brands);
//   空瓶: its own text has one of HEAT_MARKERS, or it carries a hashtag (in its text or the reposted post).
// A repost of a repost (its text carries the "//@name:" chain) is ignored, as is anything else.
export function classifyHeat(post:HeatPost,ziyuUids:Set<string>):HeatResult{
  const html=post.longText??post.text,rt=post.retweeted_status;
  if(rt&&/\/\/\s*<a [^>]*>@|\/\/\s*@/.test(html))return {skip:'转发的转发'};
  if(!rt&&!linksPosts(html))return {skip:'原创但没有引用其他微博'};
  const own=plain(html);
  const kong=KONG_MARKERS.test(own);
  const positive=!kong&&(POSITIVE_KEYWORDS.test(own)||[...linkedAuthors(html),...(rt?[String(rt.user?.id)]:[])].some(id=>ziyuUids.has(id)));
  const fight=kong||!positive&&(HEAT_MARKERS.test(own)||/#[^#\n]+#/.test(own+(rt?plain(rt.text):'')));
  if(!positive&&!fight)return {skip:'没有梓渝关键词、加热指令或话题'};
  return {kind:positive?'红膏':'空瓶',repost:Boolean(rt),description:heatText(html)};
}
export const heatTitle=(name:string,kind:HeatKind)=>`${name} ${kind==='红膏'?'红膏加热':'速来空瓶'}`;
