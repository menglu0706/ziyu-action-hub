// Weibo watcher. Weibo only accepts the watched accounts' feeds from an ordinary home connection,
// so a relay script on a home PC (scripts/weibo-relay.mjs) reads them and posts the raw feeds
// here (mode 'relay'); this function turns each new post into a pinned /urgent task -- plus a
// /media item for some -- following the per-account rules below. Every post is handled at most
// once (weibo_ingest), and a post whose link is already an active task (manual or automatic) is
// skipped, so manual tasks always win. pg_cron's once-a-minute call is a heartbeat that alerts
// when the relay's scans stop arriving.
//
// Secrets: WATCHER_KEY (shared with the relay and Vault 'weibo_watcher_key'), and optionally
// SERVERCHAN_KEY for WeChat alerts. Deploy with:
//   npx supabase functions deploy weibo-watcher --project-ref <ref> --no-verify-jwt --use-api
import {createClient} from 'npm:@supabase/supabase-js@2';
import {normalizeTaskLink} from '../_shared/taskLink.ts';

type Post={
  id:string;bid?:string;created_at:string;text:string;source?:string;isLongText?:boolean;longText?:string;mblogtype?:number;pic_num?:number;
  pics?:{url:string;large?:{url:string}}[];page_info?:{type?:string;page_pic?:{url?:string}};
  user?:{id:number;screen_name?:string};retweeted_status?:Post;
  cooperate_info?:{owner_uid:number;cooperate_user_list:{idstr:string;screen_name:string}[]};
};
type Parsed={post:Post;src:Post;repost:boolean;live:boolean;cocreate:boolean;brands:string[];sentence:string};
type Rule={name:string;reposts:boolean;media:boolean;title:(p:Parsed)=>string;description:(p:Parsed)=>string|null};

const CO_TITLE='星品共创百万转百万评千万赞';
// 我是梓渝_'s posts inside the 梓渝 超话 arrive as their own feed under this key (also its
// weibo_watch_state row); they get this title and the post's first sentence as description.
const TOPIC_KEY='topic:梓渝超话',TOPIC_TITLE='宝梓超话营业啦，快来！！';
// Account 2's task keeps the pinned slot for this long after its post; other accounts' new tasks
// meanwhile go to the top of the unpinned list instead.
const PRIORITY_UID='7352202247',PRIORITY_PIN_MS=6*3600e3;
// Auto tasks go offline this long after creation (migration 019's job does the switch).
const TASK_TTL_MS=24*3600e3;
// 加热 tasks' deadline, the same default the admin form uses.
const HEAT_TTL_MS=6*3600e3;
// Short brand names for 共创 co-creators, when cleaning the Weibo screen name isn't enough.
const BRAND_NAMES:Record<string,string>={'7552817501':'有棵树'};
const ACCOUNTS:Record<string,Rule>={
  '8019758392':{name:'梓渝的小喇叭0706',reposts:true,media:false,
    title:p=>`重要通知：${p.sentence||'梓渝的小喇叭0706 发布了新微博'}`,description:()=>null},
  '7352202247':{name:'我是梓渝_',reposts:true,media:true,
    title:p=>p.repost?'任务博来啦，快来zzp!':p.live?'宝梓直播啦快来！！！！':'宝梓营业啦，快快来！！百万转，百万评！',
    description:p=>p.sentence||null},
  '8009243499':{name:'梓渝ZIYU工作室',reposts:false,media:true,
    title:p=>p.sentence||'梓渝ZIYU工作室 发布了新微博',description:()=>null},
};
// Accounts whose matching original posts rewrite an existing task's 一句话最快做法 instead of
// creating tasks. Their other posts and reposts are ignored without a log entry. The relay
// attaches the full text of long posts (longText) for these accounts.
const UPDATE_ACCOUNTS:Record<string,{name:string;taskId:string;keywords:RegExp}>={
  '6179787120':{name:'月之必要',taskId:'f6eda702-5e58-4a4f-92e9-cbb372dd4f69',keywords:/打榜任务|打木旁任务|打木旁rw|打榜rw/i}, // YUNI音乐日常任务
};
// Accounts dedicated to 加热: their posts matching HEAT_KEYWORDS become /heat tasks -- never
// pinned, not on /urgent, with a deadline HEAT_TTL_MS away (admins can change it). A repost's task
// links to the reposted post. Their other posts are ignored without a log entry. An account can
// also be in UPDATE_ACCOUNTS; a post matching its update keywords is handled as an update instead.
// Each account must also be in the relay's ACCOUNTS (and followed by the spare account).
const HEAT_KEYWORDS=/加热/;
const HEAT_ACCOUNTS:Record<string,{name:string}>={
  '7487914503':{name:'划破晨昏线'},
  '7839981852':{name:'是你的小汪0829'},
  '7871898411':{name:'梓木喃语'},
  '7791016273':{name:'先天性超雄圣体'},
  '5665884286':{name:'William瑾瑜'},
  '9159145258':{name:'梓渝_潮汐发电站重生版'},
  '6179787120':{name:'月之必要'},
};
const accountName=(uid:string)=>ACCOUNTS[uid]?.name??UPDATE_ACCOUNTS[uid]?.name??HEAT_ACCOUNTS[uid]?.name??uid;

// Only used to download cover images from Weibo's image CDN (no login involved).
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const COVER_BUCKET='content-images';
// Media is tagged by platform on /media, like the team's own items.
const MEDIA_CATEGORY='微博';
const ALERT_DAILY_LIMIT=5; // Server酱 free tier; the last one is kept for watcher failures.
// No scans from the home relay for this long means it has stopped.
const STALE_AFTER_MS=15*60_000;
// The watched accounts post nothing that can't wait between 01:00 and 08:00 Beijing time (月之必要's
// 打榜任务 list comes around 08:00), so the relay doesn't read Weibo then; the first scan after
// 08:00 catches up on the night's posts.
const QUIET_START_HOUR=1,QUIET_END_HOUR=8;
const BEIJING_OFFSET_MS=8*3600e3;
function quietWindow(now=Date.now()){
  const beijing=new Date(now+BEIJING_OFFSET_MS),hour=beijing.getUTCHours();
  const dayStart=Date.UTC(beijing.getUTCFullYear(),beijing.getUTCMonth(),beijing.getUTCDate())-BEIJING_OFFSET_MS;
  const end=dayStart+QUIET_END_HOUR*3600e3;
  return {quiet:hour>=QUIET_START_HOUR&&hour<QUIET_END_HOUR,end};
}
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
// --- Text rules ---------------------------------------------------------------------------
// Web-link cards (shown as 网页链接) and 超话 tag cards are dropped: neither reads as text.
const plain=(html:string)=>html.replace(/<a [^>]*href="[^"]*(?:sinaurl|\/p\/index|\/p\/100808)[^"]*"[^>]*>[\s\S]*?<\/a>/g,'').replace(/<br\s*\/?>/g,'\n').replace(/<a [^>]*>全文<\/a>/g,'').replace(/<[^>]+>/g,'')
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'");
// Trailing hashtag lists are dropped; inline hashtags keep their words; @mentions, links,
// video/live labels, leading 📣 and "通知：" labels are removed, as is a repost's "//@name:" chain.
const clean=(text:string)=>text.replace(/\[语音(\d+)"\]\s*请用最新版手机微博app收听原声\s*(?:分享语音)?/g,'发了一条 $1 秒的语音。').replace(/\/\/\s*@[\s\S]*$/,'').replace(/(\s*#[^#\n]+#)+\s*$/gm,'').replace(/#([^#\n]+)#/g,'$1').replace(/@[\w一-龥-]+/g,'')
  .replace(/https?:\/\/\S+/g,'').replace(/\S+的微博(视频|直播)/g,'').replace(/^[\s📣🔔📢]+/gmu,'').replace(/^(重要通知|通知|公告)[：:]\s*/gm,'').replace(/[ \t]+/g,' ');
const meaningful=(s:string)=>(s.match(/[一-龥A-Za-z0-9]/g)??[]).length;
function firstSentence(html:string){
  const lines=clean(plain(html)).split('\n').map(s=>s.trim()).filter(s=>meaningful(s));
  let line=lines[0]??'';
  if(meaningful(line)<4&&lines[1])line=`${line}${lines[1]}`;
  const s=(line.match(/^.*?[。！？!?]+/u)?.[0]??line).trim();
  if(meaningful(s)<2)return '';
  return s.length>30?`${s.slice(0,30)}…`:s;
}
const brandName=(u:{idstr:string;screen_name:string})=>BRAND_NAMES[u.idstr]??(u.screen_name.replace(/^[A-Za-z0-9 .&'-]+/,'').replace(/(官方微博|官方|官博)$/,'')||u.screen_name);

function parse(post:Post):Parsed{
  const repost=Boolean(post.retweeted_status),src=post.retweeted_status??post;
  const co=src.cooperate_info;
  const brands=co?co.cooperate_user_list.filter(u=>!ACCOUNTS[u.idstr]).map(brandName):[];
  // Reposts: the account's own comment reads best; fall back to the reposted post's text (the feed's
  // preview, which holds the first sentence).
  const own=repost?firstSentence(post.text):'';
  const sentence=own&&!/^转发微博/.test(own)?own:firstSentence(src.text);
  return {post,src,repost,live:!repost&&post.page_info?.type==='live',cocreate:Boolean(co),brands,sentence};
}
const postUrl=(p:Post)=>`https://weibo.com/${p.user?.id}/${p.bid??p.id}`;
const shanghaiDate=()=>new Date(Date.now()+8*3600e3).toISOString().slice(0,10);

// --- Cover images -------------------------------------------------------------------------
// Weibo blocks hotlinking, so the cover is copied into our bucket (media/ is cleaned after 14 days).
function coverSource(post:Post){
  if(post.page_info?.type==='video')return post.page_info.page_pic?.url??null;
  const pic=post.pics?.[0];
  return pic?(pic.large?.url??pic.url).replace(/\/(orj\d+|mw\d+|large|bmiddle|thumb\d+|wap\d+)\//,'/mw690/'):null;
}
async function copyCover(post:Post){
  const url=coverSource(post);
  if(!url)return null;
  try{
    const res=await fetch(url,{headers:{'User-Agent':UA,Referer:'https://weibo.com/'}});
    if(!res.ok)return null;
    const bytes=new Uint8Array(await res.arrayBuffer());
    if(bytes.length>5*1024*1024)return null;
    const type=res.headers.get('content-type')?.split(';')[0]??'image/jpeg';
    const path=`media/weibo-${post.id}.${type==='image/png'?'png':type==='image/webp'?'webp':'jpg'}`;
    const {error}=await db.storage.from(COVER_BUCKET).upload(path,bytes,{contentType:type,upsert:true});
    if(error)return null;
    return db.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
  }catch{return null}
}

// --- Alerts (Server酱) ----------------------------------------------------------------------
async function alert(kind:'posted'|'failed'|'recovered',title:string,body:string){
  const key=Deno.env.get('SERVERCHAN_KEY');
  if(!key)return false;
  const today=shanghaiDate();
  const {count}=await db.from('weibo_alerts').select('id',{count:'exact',head:true}).eq('sent_on',today);
  const used=count??0;
  // Posting alerts use the first 4 slots (the 4th carries the warning); slot 5 is for failures.
  if(kind==='posted'&&used>=ALERT_DAILY_LIMIT-1)return false;
  if(used>=ALERT_DAILY_LIMIT)return false;
  if(kind==='posted'&&used===ALERT_DAILY_LIMIT-2)body+='\n\n⚠️ 今日微信提醒额度已用完。请留意网站，或切换为人工处理，直到明天 00:00 恢复。';
  const res=await fetch(`https://sctapi.ftqq.com/${key}.send`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({title:title.slice(0,32),desp:body})}).catch(()=>null);
  const json=res?await res.json().catch(()=>null):null;
  if(!res?.ok||(json&&json.code!==0))return false;
  await db.from('weibo_alerts').insert({sent_on:today,kind});
  return true;
}

// --- Processing ---------------------------------------------------------------------------
// heat: only look at /heat tasks (a post can be both a 紧急 task and a 加热 task).
async function activeTaskWithLink(link:string,heat=false){
  let query=db.from('tasks').select('id,external_url,status,publish_at,deadline').in('status',['published','offline']);
  if(heat)query=query.eq('show_in_heat',true);
  const {data,error}=await query;
  if(error)throw new Error('任务查重失败');
  const now=Date.now();
  return data.find(t=>(t.status==='published'||t.publish_at)&&(!t.deadline||new Date(t.deadline).getTime()>now)&&normalizeTaskLink(t.external_url)===link)??null;
}
async function mediaWithLink(link:string){
  const {data,error}=await db.from('media_items').select('id,external_url');
  if(error)throw new Error('物料查重失败');
  return data.find(m=>normalizeTaskLink(m.external_url)===link)??null;
}

// Whether a new task from this account should take the pinned slot: always for account 2, and
// for the others unless the current pin is account 2's task from a post under 6 hours old.
async function takesPin(uid:string){
  if(uid===PRIORITY_UID)return true;
  const {data:pinned}=await db.from('tasks').select('id').eq('is_pinned',true).eq('status','published').limit(1);
  if(!pinned?.length)return true;
  const {data:origin}=await db.from('weibo_ingest').select('uid,posted_at').eq('task_id',pinned[0].id).limit(1);
  const source=origin?.[0];
  return !(source?.uid===PRIORITY_UID&&source.posted_at&&Date.now()-new Date(source.posted_at).getTime()<PRIORITY_PIN_MS);
}

const isRedPacket=(post:Post)=>post.source==='粉丝红包'||post.page_info?.type==='hongbao';
const isVoice=(post:Post)=>/\[语音\d+(?:&quot;|")\]/.test(post.text)||post.page_info?.type==='audio';
const hasMedia=(post:Post)=>Boolean(post.pic_num)||post.page_info?.type==='video'||isVoice(post);

// A post's whole text as one tidy line for 一句话最快做法: links, @mentions, repost chains and
// trailing hashtag lists removed, inline hashtags kept as words, line breaks become spaces.
// With startAt, text before the first line matching it (e.g. a greeting) is dropped.
const taskText=(html:string,startAt?:RegExp)=>{
  const lines=clean(plain(html)).split('\n').map(s=>s.trim()).filter(s=>meaningful(s));
  const first=startAt?Math.max(0,lines.findIndex(line=>startAt.test(line))):0;
  return lines.slice(first).join(' ').replace(/\s+/g,' ').trim().slice(0,500);
};

async function handleUpdate(uid:string,post:Post){
  const rule=UPDATE_ACCOUNTS[uid];
  if(post.retweeted_status)return null;
  const html=post.longText??post.text;
  if(!rule.keywords.test(plain(html)))return null;
  const finish=(values:Record<string,unknown>)=>db.from('weibo_ingest').update(values).eq('post_id',post.id);
  const {data:claimed}=await db.from('weibo_ingest').insert({post_id:post.id,uid,source_post_id:post.id,kind:'update',status:'processing',posted_at:new Date(post.created_at).toISOString()}).select('post_id');
  if(!claimed?.length)return null;
  try{
    const content=taskText(html,rule.keywords);
    if(!content){await finish({status:'skipped',reason:'微博没有可用的文字'});return null}
    const {data:task,error}=await db.from('tasks').select('id,title,quick_instruction').eq('id',rule.taskId).maybeSingle();
    if(error||!task)throw new Error('要更新的日常任务不存在，请检查监控设置');
    if(sameText(task.quick_instruction,content)){await finish({status:'skipped',reason:'内容相同，无需更新',task_id:task.id});return null}
    const previous=task.quick_instruction;
    const {error:updateError}=await db.from('tasks').update({quick_instruction:content,updated_at:new Date().toISOString()}).eq('id',task.id);
    if(updateError)throw new Error(`任务更新失败：${updateError.message}`);
    // The previous text is kept in the log, so an update can be undone by hand.
    await finish({status:'published',title:`更新：${task.title}`,task_id:task.id,reason:`原一句话最快做法：${previous}`});
  }catch(error){await finish({status:'failed',reason:error instanceof Error?error.message:String(error)})}
  return null; // task updates don't send WeChat alerts
}
async function handleHeat(uid:string,post:Post){
  if(!HEAT_KEYWORDS.test(plain(post.longText??post.text)))return null;
  const src=post.retweeted_status??post;
  const finish=(values:Record<string,unknown>)=>db.from('weibo_ingest').update(values).eq('post_id',post.id);
  const {data:claimed}=await db.from('weibo_ingest').insert({post_id:post.id,uid,source_post_id:src.id,kind:'heat',status:'processing',posted_at:new Date(post.created_at).toISOString()}).select('post_id');
  if(!claimed?.length)return null;
  try{
    const link=postUrl(src);
    const {data:earlier}=await db.from('weibo_ingest').select('post_id').eq('source_post_id',src.id).eq('kind','heat').eq('status','published').limit(1);
    if(earlier?.length){await finish({status:'skipped',reason:'同一原帖已生成加热任务'});return null}
    if(await activeTaskWithLink(normalizeTaskLink(link),true)){await finish({status:'skipped',reason:'已存在相同链接的加热任务'});return null}
    const p=parse(post);
    const title=p.sentence||'加热任务来啦，快来！';
    const {data:task,error}=await db.from('tasks').insert({
      title,description:null,category:'其他',platform:'微博',external_url:link,quick_instruction:'点击前往原博：转发、评论、点赞',
      urgency_score:100,required_score:100,estimated_minutes:1,audience:'所有人',status:'published',
      deadline:new Date(Date.now()+HEAT_TTL_MS).toISOString(),is_pinned:false,show_in_urgent:false,show_in_heat:true,show_in_daily:false,daily_group:'其他',source:'weibo',source_post_id:src.id,
    }).select('id').single();
    if(error||!task)throw new Error(`加热任务创建失败：${error?.message??''}`);
    await finish({status:'published',title:`加热：${title}`,task_id:task.id});
  }catch(error){await finish({status:'failed',reason:error instanceof Error?error.message:String(error)})}
  return null; // 加热 tasks don't send WeChat alerts
}
const sameText=(a:string|null,b:string|null)=>(a??'').replace(/\s+/g,'')===(b??'').replace(/\s+/g,'');

// fromTopic: a post 我是梓渝_ made inside the 梓渝 超话, which never reaches followers' feeds.
async function handle(uid:string,post:Post,fromTopic=false){
  const update=UPDATE_ACCOUNTS[uid];
  if(update&&!post.retweeted_status&&update.keywords.test(plain(post.longText??post.text)))return handleUpdate(uid,post);
  if(HEAT_ACCOUNTS[uid])return handleHeat(uid,post);
  if(update)return null;
  const rule=ACCOUNTS[uid];
  const repost=Boolean(post.retweeted_status),src=post.retweeted_status??post;
  const base={post_id:post.id,uid,source_post_id:src.id,posted_at:new Date(post.created_at).toISOString()};
  const finish=(values:Record<string,unknown>)=>db.from('weibo_ingest').update(values).eq('post_id',post.id);
  // Claim the post; a concurrent or repeated run finds the row and stops here.
  const {data:claimed}=await db.from('weibo_ingest').insert({...base,kind:fromTopic?'topic':repost?'repost':'original',status:'processing'}).select('post_id');
  if(!claimed?.length)return null;
  try{
    if(repost&&!rule.reposts){await finish({status:'skipped',reason:'该账号只处理原创'});return null}
    // 我是梓渝_'s posts that Weibo generates when a fan red packet is sent aren't tasks.
    if(uid===PRIORITY_UID&&!repost&&isRedPacket(post)){await finish({status:'skipped',reason:'系统生成的红包微博'});return null}
    const p=parse(post);
    const kind=p.cocreate?'cocreate':p.live?'live':fromTopic?'topic':repost?'repost':'original';
    const link=postUrl(src);
    const {data:earlier}=await db.from('weibo_ingest').select('post_id').eq('source_post_id',src.id).eq('status','published').limit(1);
    if(earlier?.length){await finish({kind,status:'skipped',reason:'同一原帖已生成任务'});return null}
    if(await activeTaskWithLink(normalizeTaskLink(link))){await finish({kind,status:'skipped',reason:'已存在相同链接的任务'});return null}

    const title=p.cocreate?CO_TITLE:fromTopic?TOPIC_TITLE:rule.title(p);
    const description=p.cocreate?`${p.brands.join('、')||rule.name} 星品 共创`:fromTopic?p.sentence||null:rule.description(p);
    const quick=p.live?'点击进入直播间':repost?'前往原博完成任务':'点击前往原博：转发、评论、点赞';
    const pin=await takesPin(uid);
    // An unpinned insert lands at the top of the ongoing list (assign_new_urgent_sort_position).
    const {data:task,error:taskError}=await db.from('tasks').insert({
      title,description,category:p.cocreate?'商务':'其他',platform:'微博',external_url:link,quick_instruction:quick,
      urgency_score:100,required_score:100,estimated_minutes:1,audience:'所有人',status:'published',
      is_pinned:pin,show_in_urgent:true,show_in_daily:false,daily_group:'其他',source:'weibo',source_post_id:src.id,
      auto_offline_at:new Date(Date.now()+TASK_TTL_MS).toISOString(),
    }).select('id').single();
    if(taskError||!task)throw new Error(`任务创建失败：${taskError?.message??''}`);
    // One pinned slot: a pinning task takes it (the previous task stays on /urgent, unpinned).
    if(pin)await db.from('tasks').update({is_pinned:false}).eq('is_pinned',true).neq('id',task.id);

    let mediaId:string|null=null;
    // Only posts with photos, video or voice become media; text-only posts never do.
    const wantsMedia=(fromTopic||rule.media&&!p.cocreate&&!p.live)&&!repost&&hasMedia(post);
    if(wantsMedia&&!await mediaWithLink(normalizeTaskLink(link))){
      const {data:media}=await db.from('media_items').insert({
        title:p.sentence||`${rule.name} 发布了新微博`,category:MEDIA_CATEGORY,
        published_at:base.posted_at,cover_url:await copyCover(post),external_url:link,is_enabled:true,source_post_id:post.id,
      }).select('id').single();
      mediaId=media?.id??null;
    }
    await finish({kind,status:'published',title,task_id:task.id,media_id:mediaId});
    return {postId:post.id,title,link};
  }catch(error){
    await finish({status:'failed',reason:error instanceof Error?error.message:String(error)});
    return null;
  }
}

type Feed={data?:{cards?:{card_type:number;mblog?:Post}[]}};
// The feed the home relay read for one account, as posts oldest first (profile-pinned post dropped).
function postsFrom(feed:Feed|undefined):Post[]{
  const posts=(feed?.data?.cards??[]).filter(c=>c.card_type===9&&c.mblog).map(c=>c.mblog as Post).filter(m=>m.mblogtype!==2);
  return posts.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
}

type RelayBody={mode:'relay';feeds?:Record<string,Feed>;errors?:Record<string,string>};

// One scan, from the feeds the home relay just read.
async function relayScan(body:RelayBody,settings:{failing:boolean}){
  const started=Date.now(),published:{postId:string;title:string;link:string}[]=[],failures:string[]=[];
  try{
    const {data:states}=await db.from('weibo_watch_state').select('uid,last_seen_id');
    const lastSeen=new Map((states??[]).map(s=>[s.uid,BigInt(s.last_seen_id)]));
    const fresh:{uid:string;post:Post;fromTopic:boolean}[]=[],advance:{key:string;newest:bigint}[]=[];
    // Each feed succeeds or fails on its own; its position only moves once its posts are handled.
    const collect=(key:string,uid:string,feed:Feed,fromTopic:boolean)=>{
      const posts=postsFrom(feed).filter(m=>String(m.user?.id)===uid);
      if(!posts.length)return;
      const newest=BigInt(posts[posts.length-1].id),seen=lastSeen.get(key);
      // First scan of a feed: remember where we are, import nothing.
      if(seen!==undefined)for(const post of posts)if(BigInt(post.id)>seen)fresh.push({uid,post,fromTopic});
      if(seen===undefined||newest>seen)advance.push({key,newest});
    };
    for(const uid of new Set([...Object.keys(ACCOUNTS),...Object.keys(UPDATE_ACCOUNTS),...Object.keys(HEAT_ACCOUNTS)])){
      const relayError=body.errors?.[uid];
      if(relayError||!body.feeds?.[uid]){failures.push(`${accountName(uid)}：${relayError??'家用电脑没有发送该账号的数据'}`);continue}
      collect(uid,uid,body.feeds[uid],false);
    }
    // The 超话 feed is optional (older relays don't send it), but its errors count.
    if(body.errors?.[TOPIC_KEY])failures.push(`梓渝超话：${body.errors[TOPIC_KEY]}`);
    else if(body.feeds?.[TOPIC_KEY])collect(TOPIC_KEY,PRIORITY_UID,body.feeds[TOPIC_KEY],true);
    // Oldest first across feeds, so an original post is handled before its reposts.
    fresh.sort((a,b)=>BigInt(a.post.id)<BigInt(b.post.id)?-1:1);
    for(const {uid,post,fromTopic} of fresh){const result=await handle(uid,post,fromTopic);if(result)published.push(result)}
    for(const {key,newest} of advance)await db.from('weibo_watch_state').upsert({uid:key,last_seen_id:newest.toString(),updated_at:new Date().toISOString()});
  }catch(error){failures.push(error instanceof Error?error.message:String(error))}
  const failure=failures.length?failures.join('；'):null;

  await db.from('weibo_scan_log').insert({ok:!failure,error:failure,duration_ms:Date.now()-started});
  await db.from('weibo_scan_log').delete().lt('scanned_at',new Date(Date.now()-7*864e5).toISOString());

  if(published.length&&await alert('posted',`新发布 ${published.length} 条微博任务`,published.map(p=>`- ${p.title}\n  ${p.link}`).join('\n'))){
    await db.from('weibo_ingest').update({alerted_at:new Date().toISOString()}).in('post_id',published.map(p=>p.postId));
  }
  if(failure){
    // Alert once, after two failed scans in a row.
    const {data:recent}=await db.from('weibo_scan_log').select('ok').order('scanned_at',{ascending:false}).limit(2);
    if(!settings.failing&&recent?.length===2&&recent.every(r=>!r.ok)){
      await db.from('weibo_watcher_settings').update({failing:true}).eq('id',true);
      await alert('failed','微博监控失败',`${failure}\n\n如果是登录过期或被拒绝，请联系负责人更新家用电脑上的微博登录。`);
    }
  }else if(settings.failing){
    await db.from('weibo_watcher_settings').update({failing:false}).eq('id',true);
    await alert('recovered','微博监控已恢复','扫描恢复正常。');
  }
  return Response.json({ok:!failure,error:failure,published:published.length,ms:Date.now()-started});
}

// Adds /media items (no tasks, no pins) for specific posts the watcher missed, e.g. ones from before
// a feed was first watched. Same media rules and duplicate check as a normal scan.
async function backfillMedia(posts:Post[]){
  const created:string[]=[],skipped:string[]=[];
  for(const post of posts){
    const uid=String(post.user?.id),rule=ACCOUNTS[uid];
    const link=postUrl(post);
    if(!rule||post.retweeted_status||!hasMedia(post)){skipped.push(`${post.id}：不符合物料规则`);continue}
    const sentence=firstSentence(post.text);
    const existing=await mediaWithLink(normalizeTaskLink(link));
    if(existing){
      // Re-sending a post refreshes the title and tag of the media item it already has.
      await db.from('media_items').update({category:MEDIA_CATEGORY,...(sentence?{title:sentence}:{})}).eq('id',existing.id);
      skipped.push(`${post.id}：物料已存在，已更新标题和分类`);continue;
    }
    const {error}=await db.from('media_items').insert({
      title:sentence||`${rule.name} 发布了新微博`,category:MEDIA_CATEGORY,
      published_at:new Date(post.created_at).toISOString(),cover_url:await copyCover(post),external_url:link,is_enabled:true,source_post_id:post.id,
    });
    if(error)skipped.push(`${post.id}：${error.message}`);else created.push(sentence||post.id);
  }
  return Response.json({created,skipped});
}

// pg_cron calls this every minute. Weibo is only read by the home relay now, so this just checks
// that scans keep arriving and alerts once if they stop (PC off, asleep, offline or relay stopped).
async function heartbeat(settings:{failing:boolean}){
  const night=quietWindow();
  if(night.quiet)return Response.json({heartbeat:'quiet'});
  const {data:last}=await db.from('weibo_scan_log').select('scanned_at').order('scanned_at',{ascending:false}).limit(1);
  const lastAt=last?.[0]?.scanned_at;
  // Silence during the night doesn't count: measure from 09:00 if the last scan was before it.
  const since=Math.max(lastAt?new Date(lastAt).getTime():0,Date.now()>=night.end?night.end:0);
  const stale=Date.now()-since>STALE_AFTER_MS;
  if(stale&&!settings.failing){
    await db.from('weibo_watcher_settings').update({failing:true}).eq('id',true);
    await alert('failed','微博监控已停止','超过 15 分钟没有收到家用电脑的扫描结果。请检查电脑是否开机、联网，以及 weibo-relay 是否在运行。');
  }
  return Response.json({heartbeat:stale?'stale':'ok',lastScanAt:lastAt??null});
}

Deno.serve(async req=>{
  if(req.headers.get('x-watcher-key')!==Deno.env.get('WATCHER_KEY'))return new Response('forbidden',{status:403});
  // ?test=alert sends one WeChat test message (counts toward the daily quota); it never touches Weibo.
  if(new URL(req.url).searchParams.get('test')==='alert'){
    if(!Deno.env.get('SERVERCHAN_KEY'))return Response.json({sent:false,reason:'SERVERCHAN_KEY 未设置'});
    const sent=await alert('posted','微博监控测试提醒','这是一条测试消息：微博监控的微信提醒已配置成功。');
    return Response.json({sent,reason:sent?null:'发送失败或今日额度已用完'});
  }
  const {data:settings,error:settingsError}=await db.from('weibo_watcher_settings').select('enabled,failing').single();
  if(settingsError)return Response.json({error:`读取监控设置失败：${settingsError.message}`},{status:500});
  const body=await req.json().catch(()=>({})) as {mode?:string};
  // The relay asks first, so a switched-off watcher sends no requests to Weibo at all.
  if(body.mode==='check'){
    const night=quietWindow();
    return Response.json({enabled:settings.enabled,quiet:night.quiet,resumeInMs:night.quiet?night.end-Date.now():0});
  }
  if(!settings.enabled)return Response.json({skipped:'disabled'});
  if(body.mode==='relay')return relayScan(body as RelayBody,settings);
  if(body.mode==='backfill-media')return backfillMedia((body as {posts?:Post[]}).posts??[]);
  // Retags every media item the watcher created (source_post_id set) with MEDIA_CATEGORY.
  if(body.mode==='retag-media'){
    const {data,error}=await db.from('media_items').update({category:MEDIA_CATEGORY}).not('source_post_id','is',null).neq('category',MEDIA_CATEGORY).select('id,title');
    return Response.json(error?{error:error.message}:{retagged:(data??[]).map(m=>m.title)});
  }
  return heartbeat(settings);
});
