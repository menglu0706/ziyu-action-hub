// Weibo watcher: called once a minute by pg_cron (migration 017). Reads the watched accounts'
// latest posts from m.weibo.cn as the watcher account (WEIBO_COOKIE), and turns each new post
// into a pinned /urgent task -- plus a /media item for some -- following the per-account rules
// below. Every post is handled at most once (weibo_ingest), and a post whose link is already an
// active task (manual or automatic) is skipped, so manual tasks always win.
//
// Secrets: WEIBO_COOKIE, WATCHER_KEY (must match Vault 'weibo_watcher_key'), and optionally
// SERVERCHAN_KEY for WeChat alerts. Deploy with:
//   npx supabase functions deploy weibo-watcher --project-ref <ref> --no-verify-jwt --use-api
import {createClient} from 'npm:@supabase/supabase-js@2';
import {normalizeTaskLink} from '../_shared/taskLink.ts';

type Post={
  id:string;bid?:string;created_at:string;text:string;isLongText?:boolean;mblogtype?:number;pic_num?:number;
  pics?:{url:string;large?:{url:string}}[];page_info?:{type?:string;page_pic?:{url?:string}};
  user?:{id:number;screen_name?:string};retweeted_status?:Post;
  cooperate_info?:{owner_uid:number;cooperate_user_list:{idstr:string;screen_name:string}[]};
};
type Parsed={post:Post;src:Post;repost:boolean;live:boolean;cocreate:boolean;brands:string[];sentence:string};
type Rule={name:string;reposts:boolean;media:boolean;title:(p:Parsed)=>string;description:(p:Parsed)=>string|null};

const CO_TITLE='星品共创百万转百万评千万赞';
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

const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const COVER_BUCKET='content-images';
const ALERT_DAILY_LIMIT=5; // Server酱 free tier; the last one is kept for watcher failures.
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

function cookie(){const raw=(Deno.env.get('WEIBO_COOKIE')??'').trim().replace(/^["']|["']$/g,'');return raw.includes('=')?raw:`SUB=${raw}`}
async function weibo(url:string){
  const res=await fetch(url,{headers:{'User-Agent':UA,Cookie:cookie(),Referer:'https://m.weibo.cn/','X-Requested-With':'XMLHttpRequest',Accept:'application/json'},redirect:'manual'});
  if(res.status>=300&&res.status<400)throw new Error('微博登录已过期或被限制（请求被重定向）');
  if(!res.ok)throw new Error(`微博请求失败 HTTP ${res.status}`);
  const json=await res.json().catch(()=>null);
  if(!json||json.ok!==1)throw new Error('微博返回异常数据（可能登录已过期）');
  return json;
}

// --- Text rules ---------------------------------------------------------------------------
const plain=(html:string)=>html.replace(/<br\s*\/?>/g,'\n').replace(/<a [^>]*>全文<\/a>/g,'').replace(/<[^>]+>/g,'')
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'");
// Trailing hashtag lists are dropped; inline hashtags keep their words; @mentions, links,
// video/live labels, leading 📣 and "通知：" labels are removed, as is a repost's "//@name:" chain.
const clean=(text:string)=>text.replace(/\/\/\s*@[\s\S]*$/,'').replace(/(\s*#[^#\n]+#)+\s*$/gm,'').replace(/#([^#\n]+)#/g,'$1').replace(/@[\w一-龥-]+/g,'')
  .replace(/https?:\/\/\S+/g,'').replace(/\S+的微博(视频|直播)/g,'').replace(/^[\s📣🔔📢]+/gmu,'').replace(/^(重要通知|通知|公告)[：:]\s*/gm,'').replace(/[ \t]+/g,' ');
const meaningful=(s:string)=>(s.match(/[一-龥A-Za-z0-9]/g)??[]).length;
function firstSentence(html:string){
  const lines=clean(plain(html)).split('\n').map(s=>s.trim()).filter(s=>meaningful(s));
  let line=lines[0]??'';
  if(meaningful(line)<4&&lines[1])line=`${line}${lines[1]}`;
  const s=(line.match(/^.*?[。！？!?]/u)?.[0]??line).trim();
  if(meaningful(s)<2)return '';
  return s.length>30?`${s.slice(0,30)}…`:s;
}
const brandName=(u:{idstr:string;screen_name:string})=>BRAND_NAMES[u.idstr]??(u.screen_name.replace(/^[A-Za-z0-9 .&'-]+/,'').replace(/(官方微博|官方|官博)$/,'')||u.screen_name);

async function fullText(post:Post){
  if(!post.isLongText)return post.text;
  try{const json=await weibo(`https://m.weibo.cn/statuses/extend?id=${post.id}`);return json.data?.longTextContent??post.text}catch{return post.text}
}
async function parse(post:Post):Promise<Parsed>{
  const repost=Boolean(post.retweeted_status),src=post.retweeted_status??post;
  const co=src.cooperate_info;
  const brands=co?co.cooperate_user_list.filter(u=>!ACCOUNTS[u.idstr]).map(brandName):[];
  // Reposts: the account's own comment reads best; fall back to the reposted post's text.
  const own=repost?firstSentence(post.text):'';
  const sentence=own&&!/^转发微博/.test(own)?own:firstSentence(await fullText(src));
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
async function activeTaskWithLink(link:string){
  const {data,error}=await db.from('tasks').select('id,external_url,status,publish_at,deadline').in('status',['published','offline']);
  if(error)throw new Error('任务查重失败');
  const now=Date.now();
  return data.find(t=>(t.status==='published'||t.publish_at)&&(!t.deadline||new Date(t.deadline).getTime()>now)&&normalizeTaskLink(t.external_url)===link)??null;
}
async function mediaWithLink(link:string){
  const {data,error}=await db.from('media_items').select('id,external_url');
  if(error)throw new Error('物料查重失败');
  return data.find(m=>normalizeTaskLink(m.external_url)===link)??null;
}

async function handle(uid:string,post:Post){
  const rule=ACCOUNTS[uid];
  const repost=Boolean(post.retweeted_status),src=post.retweeted_status??post;
  const base={post_id:post.id,uid,source_post_id:src.id,posted_at:new Date(post.created_at).toISOString()};
  const finish=(values:Record<string,unknown>)=>db.from('weibo_ingest').update(values).eq('post_id',post.id);
  // Claim the post; a concurrent or repeated run finds the row and stops here.
  const {data:claimed}=await db.from('weibo_ingest').insert({...base,kind:repost?'repost':'original',status:'processing'}).select('post_id');
  if(!claimed?.length)return null;
  try{
    if(repost&&!rule.reposts){await finish({status:'skipped',reason:'该账号只处理原创'});return null}
    const p=await parse(post);
    const kind=p.cocreate?'cocreate':p.live?'live':repost?'repost':'original';
    const link=postUrl(src);
    const {data:earlier}=await db.from('weibo_ingest').select('post_id').eq('source_post_id',src.id).eq('status','published').limit(1);
    if(earlier?.length){await finish({kind,status:'skipped',reason:'同一原帖已生成任务'});return null}
    if(await activeTaskWithLink(normalizeTaskLink(link))){await finish({kind,status:'skipped',reason:'已存在相同链接的任务'});return null}

    const title=p.cocreate?CO_TITLE:rule.title(p);
    const description=p.cocreate?`${p.brands.join('、')||rule.name} 星品 共创`:rule.description(p);
    const quick=p.live?'点击进入直播间':repost?'前往原博完成任务':'点击前往原博：转发、评论、点赞';
    const {data:task,error:taskError}=await db.from('tasks').insert({
      title,description,category:p.cocreate?'商务':'其他',platform:'微博',external_url:link,quick_instruction:quick,
      urgency_score:100,required_score:100,estimated_minutes:1,audience:'所有人',status:'published',
      is_pinned:true,show_in_urgent:true,show_in_daily:false,daily_group:'其他',source:'weibo',source_post_id:src.id,
    }).select('id').single();
    if(taskError||!task)throw new Error(`任务创建失败：${taskError?.message??''}`);
    // One pinned slot: the newest post takes it (the previous task stays on /urgent, unpinned).
    await db.from('tasks').update({is_pinned:false}).eq('is_pinned',true).neq('id',task.id);

    let mediaId:string|null=null;
    if(rule.media&&!repost&&!p.cocreate&&!p.live&&!await mediaWithLink(normalizeTaskLink(link))){
      const {data:media}=await db.from('media_items').insert({
        title:p.sentence||`${rule.name} 发布了新微博`,category:post.page_info?.type==='video'?'视频':post.pic_num?'图片':'日常',
        published_at:base.posted_at,cover_url:await copyCover(post),external_url:link,is_new:true,is_enabled:true,source_post_id:post.id,
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

async function scanAccount(uid:string){
  const json=await weibo(`https://m.weibo.cn/api/container/getIndex?containerid=107603${uid}`);
  const posts:Post[]=(json.data?.cards??[]).filter((c:{card_type:number})=>c.card_type===9).map((c:{mblog:Post})=>c.mblog)
    .filter((m:Post)=>m.mblogtype!==2); // profile-pinned post
  return posts.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
}

Deno.serve(async req=>{
  if(req.headers.get('x-watcher-key')!==Deno.env.get('WATCHER_KEY'))return new Response('forbidden',{status:403});
  const {data:settings,error:settingsError}=await db.from('weibo_watcher_settings').select('enabled,failing').single();
  if(settingsError)return Response.json({error:`读取监控设置失败：${settingsError.message}`},{status:500});
  if(!settings.enabled)return Response.json({skipped:'disabled'});
  const started=Date.now(),published:{postId:string;title:string;link:string}[]=[],failures:string[]=[];
  try{
    const {data:states}=await db.from('weibo_watch_state').select('uid,last_seen_id');
    const lastSeen=new Map((states??[]).map(s=>[s.uid,BigInt(s.last_seen_id)]));
    const fresh:{uid:string;post:Post}[]=[],advance:{uid:string;newest:bigint}[]=[];
    // Each account succeeds or fails on its own; its position only moves once its posts are handled.
    for(const uid of Object.keys(ACCOUNTS)){
      try{
        const posts=await scanAccount(uid);
        if(posts.length){
          const newest=BigInt(posts[posts.length-1].id),seen=lastSeen.get(uid);
          // First scan of an account: remember where we are, import nothing.
          if(seen!==undefined)for(const post of posts)if(BigInt(post.id)>seen)fresh.push({uid,post});
          if(seen===undefined||newest>seen)advance.push({uid,newest});
        }
      }catch(error){failures.push(`${ACCOUNTS[uid].name}：${error instanceof Error?error.message:String(error)}`)}
      await sleep(800);
    }
    // Oldest first across accounts, so an original post is handled before its reposts.
    fresh.sort((a,b)=>BigInt(a.post.id)<BigInt(b.post.id)?-1:1);
    for(const {uid,post} of fresh){const result=await handle(uid,post);if(result)published.push(result)}
    for(const {uid,newest} of advance)await db.from('weibo_watch_state').upsert({uid,last_seen_id:newest.toString(),updated_at:new Date().toISOString()});
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
      await db.from('weibo_watcher_settings').update({failing:true,updated_at:new Date().toISOString()}).eq('id',true);
      await alert('failed','微博监控失败',`${failure}\n\n如果是登录过期，请更新 WEIBO_COOKIE。`);
    }
  }else if(settings.failing){
    await db.from('weibo_watcher_settings').update({failing:false,updated_at:new Date().toISOString()}).eq('id',true);
    await alert('recovered','微博监控已恢复','扫描恢复正常。');
  }
  return Response.json({ok:!failure,error:failure,published:published.length,ms:Date.now()-started});
});
