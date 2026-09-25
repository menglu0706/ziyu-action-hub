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
const ACCOUNTS={'8019758392':'梓渝的小喇叭0706','7352202247':'我是梓渝_','8009243499':'梓渝ZIYU工作室'};
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

// Returns {feed} or {error}; the error texts match what the admin card and playbook describe.
async function readFeed(uid){
  try{
    const res=await fetch(`https://m.weibo.cn/api/container/getIndex?containerid=107603${uid}`,{headers:{'User-Agent':UA,Cookie:env.WEIBO_COOKIE,Referer:'https://m.weibo.cn/','X-Requested-With':'XMLHttpRequest',Accept:'application/json'},redirect:'manual'});
    if(res.status>=300&&res.status<400)return {error:'微博登录已过期或被限制（请求被重定向）'};
    if(!res.ok)return {error:`微博请求失败 HTTP ${res.status}`};
    const json=await res.json().catch(()=>null);
    if(!json||json.ok!==1)return {error:'微博返回异常数据（可能登录已过期）'};
    // Only the posts are needed; drop the rest of the page data.
    return {feed:{data:{cards:json.data?.cards??[]}}};
  }catch(error){return {error:`无法连接微博：${error.message}`}}
}

let failuresInRow=0;
console.log(`[${now()}] weibo-relay 已启动（按 Ctrl+C 停止）`);
for(;;){
  try{
    const {enabled,quiet,resumeInMs}=await watcher({mode:'check'});
    if(!enabled){console.log(`[${now()}] 自动发布已关闭，暂不读取微博`);await sleep(180_000);continue}
    if(quiet){
      // Night pause set by Supabase; resume a few random minutes after it ends. Re-check every
      // 30 minutes at most, so a change to the quiet hours takes effect.
      const wait=Math.min(resumeInMs+Math.random()*180_000,30*60_000);
      console.log(`[${now()}] 夜间暂停（北京时间 1:00–9:00），约 ${Math.round(resumeInMs/60000)} 分钟后恢复`);
      await sleep(wait);continue;
    }
    const feeds={},errors={};
    for(const uid of Object.keys(ACCOUNTS)){
      const result=await readFeed(uid);
      if(result.feed)feeds[uid]=result.feed;else errors[uid]=result.error;
      await sleep(1000+Math.random()*2000);
    }
    const result=await watcher({mode:'relay',feeds,errors});
    failuresInRow=Object.keys(errors).length?failuresInRow+1:0;
    const failed=Object.entries(errors).map(([uid,message])=>`${ACCOUNTS[uid]}：${message}`).join('；');
    console.log(`[${now()}] ${failed?`失败 - ${failed}`:`正常，新发布 ${result.published??0} 条`}`);
  }catch(error){
    // Supabase unreachable (e.g. the PC just woke up): try again at the normal pace.
    console.log(`[${now()}] 无法连接 Supabase：${error.message}`);
  }
  const gap=nextGapMs(failuresInRow);
  if(failuresInRow>=2)console.log(`[${now()}] 连续 ${failuresInRow} 次被微博拒绝，${Math.round(gap/60000)} 分钟后重试`);
  await sleep(gap);
}
