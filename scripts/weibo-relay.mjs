// Weibo relay for a home PC: reads the watched accounts' feeds with the spare account's login and
// hands them to the weibo-watcher Edge Function, which does all the processing. Weibo refuses these
// feeds from cloud servers, so this runs on an ordinary home connection -- the same one the spare
// account logs in from.
//
// Needs in .env.local (project root): WEIBO_COOKIE="SUB=..." and WATCHER_KEY=...
// Run:  node scripts/weibo-relay.mjs      (keep the window open; Ctrl+C to stop)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const WATCHER_URL='https://enwmacfmwqaqghyiqskj.supabase.co/functions/v1/weibo-watcher';
const ACCOUNTS={'8019758392':'梓渝的小喇叭0706','7352202247':'我是梓渝_','8009243499':'梓渝ZIYU工作室','6179787120':'月之必要'};
// Accounts whose long posts need their full text (月之必要's 打榜任务 lists replace a task's text).
const FULL_TEXT_ACCOUNTS=new Set(['6179787120']);
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// A scan every 150-210 s; after 2+ refused scans in a row, 30 min, 1 h, 2 h, up to 4 h apart.
const nextGapMs=failuresInRow=>failuresInRow<2?150_000+Math.random()*60_000:Math.min(30*2**(failuresInRow-2),240)*60_000;

function readEnv(){
  const file=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','.env.local');
  const values={};
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const match=line.match(/^\s*(WEIBO_COOKIE|WATCHER_KEY)\s*=\s*(.*)\s*$/);
    if(match)values[match[1]]=match[2].replace(/^["']|["']$/g,'');
  }
  for(const key of ['WEIBO_COOKIE','WATCHER_KEY'])if(!values[key]){console.error(`.env.local 缺少 ${key}`);process.exit(1)}
  if(!values.WEIBO_COOKIE.includes('='))values.WEIBO_COOKIE=`SUB=${values.WEIBO_COOKIE}`;
  return values;
}
const env=readEnv();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const now=()=>new Date().toLocaleTimeString('zh-CN',{hour12:false});

async function watcher(body){
  const res=await fetch(WATCHER_URL,{method:'POST',headers:{'Content-Type':'application/json','x-watcher-key':env.WATCHER_KEY},body:JSON.stringify(body)});
  if(!res.ok)throw new Error(`Supabase 返回 HTTP ${res.status}`);
  return res.json();
}

// The spare account follows only the watched accounts, so one request to its own following feed
// (the latest ~20 posts, about 10 days' worth) covers all of them -- a third of the traffic of
// reading each profile, and the same as a person scrolling their feed. Returns per-account feeds
// in the shape the watcher expects, or {error} with the texts the admin card and playbook describe.
// pages=2 after a long gap (the night pause, a restart), so a busy night can't push posts past page 1.
async function getJson(url){
  const res=await fetch(url,{headers:{'User-Agent':UA,Cookie:env.WEIBO_COOKIE,Referer:'https://m.weibo.cn/','X-Requested-With':'XMLHttpRequest',Accept:'application/json'},redirect:'manual'});
  if(res.status>=300&&res.status<400)return {error:'微博登录已过期或被限制（请求被重定向）'};
  if(!res.ok)return {error:`微博请求失败 HTTP ${res.status}`};
  const json=await res.json().catch(()=>null);
  if(!json||json.ok!==1)return {error:'微博返回异常数据（可能登录已过期）'};
  return {json};
}
async function readFeeds(pages=1){
  try{
    const statuses=[];let maxId='';
    for(let page=0;page<pages;page++){
      if(page)await sleep(1000+Math.random()*2000);
      const {json,error}=await getJson(`https://m.weibo.cn/feed/friends${maxId?`?max_id=${maxId}`:''}`);
      if(error)return {error};
      statuses.push(...(json.data?.statuses??[]));
      maxId=json.data?.max_id_str??json.data?.max_id??'';
      if(!maxId||maxId==='0')break;
    }
    const feeds=Object.fromEntries(Object.keys(ACCOUNTS).map(uid=>[uid,{data:{cards:[]}}]));
    // Posts from anyone else the spare account follows are ignored.
    for(const mblog of statuses){const uid=String(mblog.user?.id);if(feeds[uid])feeds[uid].data.cards.push({card_type:9,mblog})}
    await attachFullText(feeds);
    return {feeds};
  }catch(error){return {error:`无法连接微博：${error.message}`}}
}

// Long posts arrive cut off ("全文"); fetch the full text once per post for FULL_TEXT_ACCOUNTS,
// at most 3 per scan. A failed fetch leaves the preview and is retried next scan.
const fullTextCache=new Map();
async function attachFullText(feeds){
  let fetched=0;
  for(const uid of FULL_TEXT_ACCOUNTS)for(const {mblog} of feeds[uid]?.data.cards??[]){
    if(!mblog.isLongText||mblog.retweeted_status)continue;
    if(!fullTextCache.has(mblog.id)&&fetched<3){
      fetched++;await sleep(800+Math.random()*1500);
      const {json}=await getJson(`https://m.weibo.cn/statuses/extend?id=${mblog.id}`).catch(()=>({}));
      if(json?.data?.longTextContent)fullTextCache.set(mblog.id,json.data.longTextContent);
    }
    if(fullTextCache.has(mblog.id))mblog.longText=fullTextCache.get(mblog.id);
  }
}

// 我是梓渝_'s posts inside the 梓渝 超话 never reach followers' feeds, so the 超话 page is read too.
// Only his posts are kept; fans' posts on the page are dropped here and never sent anywhere.
const TOPIC_KEY='topic:梓渝超话',TOPIC_CONTAINER='100808b605a0014c09819072d77e8e4798710b',TOPIC_AUTHOR='7352202247';
async function readTopic(){
  try{
    const res=await fetch(`https://m.weibo.cn/api/container/getIndex?containerid=${TOPIC_CONTAINER}`,{headers:{'User-Agent':UA,Cookie:env.WEIBO_COOKIE,Referer:'https://m.weibo.cn/','X-Requested-With':'XMLHttpRequest',Accept:'application/json'},redirect:'manual'});
    if(res.status>=300&&res.status<400)return {error:'微博登录已过期或被限制（请求被重定向）'};
    if(!res.ok)return {error:`微博请求失败 HTTP ${res.status}`};
    const json=await res.json().catch(()=>null);
    if(!json||json.ok!==1)return {error:'微博返回异常数据（可能登录已过期）'};
    const posts=new Map();
    const walk=cards=>{for(const card of cards??[]){if(card.mblog&&String(card.mblog.user?.id)===TOPIC_AUTHOR)posts.set(card.mblog.id,card.mblog);walk(card.card_group)}};
    walk(json.data?.cards);
    return {feed:{data:{cards:[...posts.values()].map(mblog=>({card_type:9,mblog}))}}};
  }catch(error){return {error:`无法连接微博：${error.message}`}}
}

let failuresInRow=0,lastReadAt=0;
console.log(`[${now()}] weibo-relay 已启动（按 Ctrl+C 停止）`);
for(;;){
  try{
    const {enabled,quiet,resumeInMs}=await watcher({mode:'check'});
    if(!enabled){console.log(`[${now()}] 自动发布已关闭，暂不读取微博`);await sleep(180_000);continue}
    if(quiet){
      // Night pause set by Supabase; resume a few random minutes after it ends. Re-check every
      // 30 minutes at most, so a change to the quiet hours takes effect.
      const wait=Math.min(resumeInMs+Math.random()*180_000,30*60_000);
      console.log(`[${now()}] 夜间暂停（北京时间 1:00–8:00），约 ${Math.round(resumeInMs/60000)} 分钟后恢复`);
      await sleep(wait);continue;
    }
    // After a gap of over 30 minutes (night pause, PC asleep, restart) read a second page too.
    const read=await readFeeds(Date.now()-lastReadAt>30*60_000?2:1);
    if(!read.error)lastReadAt=Date.now();
    const feeds=read.feeds??{},errors=read.error?Object.fromEntries(Object.keys(ACCOUNTS).map(uid=>[uid,read.error])):{};
    await sleep(1000+Math.random()*2000);
    const topic=await readTopic();
    if(topic.feed)feeds[TOPIC_KEY]=topic.feed;else errors[TOPIC_KEY]=topic.error;
    const result=await watcher({mode:'relay',feeds,errors});
    // Back off only when the main feed is refused; a 超话 problem is reported but doesn't slow it down.
    failuresInRow=read.error?failuresInRow+1:0;
    const failed=Object.entries(errors).map(([uid,message])=>`${ACCOUNTS[uid]??"梓渝超话"}：${message}`).join('；');
    console.log(`[${now()}] ${failed?`失败 - ${failed}`:`正常，新发布 ${result.published??0} 条`}`);
  }catch(error){
    // Supabase unreachable (e.g. the PC just woke up): try again at the normal pace.
    console.log(`[${now()}] 无法连接 Supabase：${error.message}`);
  }
  const gap=nextGapMs(failuresInRow);
  if(failuresInRow>=2)console.log(`[${now()}] 连续 ${failuresInRow} 次被微博拒绝，${Math.round(gap/60000)} 分钟后重试`);
  await sleep(gap);
}
