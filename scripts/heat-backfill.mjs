// One-off 加热 backfill for a home PC: reads the 加热 accounts' posts from the last 10 hours with the
// spare account's login and hands them to the weibo-watcher Edge Function (mode 'backfill-heat'),
// which runs the normal 加热 rules, duplicate checks and rotation. Each task's time (红膏 10 h,
// 空瓶 6 h) counts from its post, so the watcher skips 空瓶 posts older than 6 hours.
// Safe to run more than once: posts the watcher has already handled are reported and left alone.
//
// Needs in .env.local (project root): WEIBO_COOKIE="SUB=..." and WATCHER_KEY=... (same as the relay)
// Run:  node scripts/heat-backfill.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const WATCHER_URL='https://enwmacfmwqaqghyiqskj.supabase.co/functions/v1/weibo-watcher';
// The watched accounts, shared with the watcher: supabase/functions/_shared/accounts.json.
const WATCHED=JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','supabase','functions','_shared','accounts.json'),'utf8'));
const HEAT_ACCOUNTS=WATCHED.heat;
// The longest 加热 lifetime (红膏).
const WINDOW_MS=10*3600e3;
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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

async function getJson(url){
  const res=await fetch(url,{headers:{'User-Agent':UA,Cookie:env.WEIBO_COOKIE,Referer:'https://m.weibo.cn/','X-Requested-With':'XMLHttpRequest',Accept:'application/json'},redirect:'manual'});
  if(res.status>=300&&res.status<400)throw new Error('微博登录已过期或被限制（请求被重定向）');
  if(!res.ok)throw new Error(`微博请求失败 HTTP ${res.status}`);
  const json=await res.json().catch(()=>null);
  if(!json||json.ok!==1)throw new Error('微博返回异常数据（可能登录已过期）');
  return json;
}

// One account's posts from the last 10 hours (its profile-pinned post dropped), long posts in full.
async function recentPosts(uid){
  const json=await getJson(`https://m.weibo.cn/api/container/getIndex?type=uid&value=${uid}&containerid=107603${uid}`);
  const since=Date.now()-WINDOW_MS;
  const posts=(json.data?.cards??[]).filter(card=>card.card_type===9&&card.mblog&&card.mblog.mblogtype!==2).map(card=>card.mblog)
    .filter(post=>new Date(post.created_at).getTime()>since);
  for(const post of posts.filter(post=>post.isLongText&&!post.retweeted_status)){
    await sleep(800+Math.random()*1500);
    const full=await getJson(`https://m.weibo.cn/statuses/extend?id=${post.id}`).catch(()=>null);
    if(full?.data?.longTextContent)post.longText=full.data.longTextContent;
  }
  return posts;
}

const posts=[];
for(const [uid,name] of Object.entries(HEAT_ACCOUNTS)){
  try{const found=await recentPosts(uid);console.log(`${name}：最近 10 小时 ${found.length} 条`);posts.push(...found)}
  catch(error){console.error(`${name}：读取失败，${error.message}`)}
  await sleep(1500+Math.random()*1500);
}
if(!posts.length){console.log('没有需要补的微博。');process.exit(0)}

// Oldest first, as a scan would handle them, so an original is listed before reposts of it.
posts.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
const res=await fetch(WATCHER_URL,{method:'POST',headers:{'Content-Type':'application/json','x-watcher-key':env.WATCHER_KEY},body:JSON.stringify({mode:'backfill-heat',posts})});
if(!res.ok){console.error(`Supabase 返回 HTTP ${res.status}`);process.exit(1)}
const {results,skipped}=await res.json();
if(skipped){console.error(`监控已关闭（${skipped}），没有补任何任务。`);process.exit(1)}
for(const {post,account,outcome} of results)console.log(`${account}  ${post}  ${outcome}`);
console.log(`完成：新建 ${results.filter(r=>r.outcome.startsWith('已创建')).length} 条加热任务。`);
