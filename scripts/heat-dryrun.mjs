// Dry run for a home PC: applies the current 加热 rules to the live /heat cards and reports which
// would be kept, moved to the other kind, or removed (same-account replacement, rotation). Nothing
// is changed: cards come from the watcher's read-only heat-live mode, and each card's post is read
// once from Weibo with the spare account's login.
//
// Needs in .env.local (project root): WEIBO_COOKIE="SUB=..." and WATCHER_KEY=... (same as the relay)
// Run:  npx tsx scripts/heat-dryrun.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const envLines=fs.readFileSync(`${ROOT}/.env.local`,'utf8').split(/\r?\n/);
let cookie=envLines.find(l=>/^\s*WEIBO_COOKIE\s*=/.test(l));cookie=cookie.slice(cookie.indexOf('=')+1).trim().replace(/^["']|["']$/g,'');if(!cookie.includes('='))cookie=`SUB=${cookie}`;
const key=envLines.find(l=>l.startsWith('WATCHER_KEY=')).slice('WATCHER_KEY='.length).trim();
const {classifyHeat,pickHeat}=await import(pathToFileURL(`${ROOT}/supabase/functions/_shared/heat.ts`).href);
const accounts=JSON.parse(fs.readFileSync(`${ROOT}/supabase/functions/_shared/accounts.json`,'utf8'));
const Z=new Set(Object.keys(accounts.urgent)),P=new Set(Object.keys(accounts.personal));
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const weibo=async url=>(await fetch(url,{headers:{'User-Agent':UA,Cookie:cookie,Referer:'https://m.weibo.cn/','X-Requested-With':'XMLHttpRequest',Accept:'application/json'},redirect:'manual'})).json();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const live=await (await fetch('https://enwmacfmwqaqghyiqskj.supabase.co/functions/v1/weibo-watcher',{method:'POST',headers:{'Content-Type':'application/json','x-watcher-key':key},body:JSON.stringify({mode:'heat-live'})})).json();
const cards=live.tasks.sort((a,b)=>a.created_at.localeCompare(b.created_at));
console.log(`live 加热 cards: ${cards.length} (${cards.filter(c=>c.source!=='weibo').length} made in admin)\n`);

// 1. Current classification of each watcher card's post.
let requests=0;
for(const card of cards){
  if(card.source!=='weibo'||!card.post_id)continue;
  if(requests)await sleep(2000+Math.random()*2000);
  const res=await weibo(`https://m.weibo.cn/statuses/show?id=${card.post_id}`);requests++;
  const post=res?.data;
  if(!post){card.note='微博读取失败（可能已删除）';continue}
  if(post.isLongText){await sleep(1500);const ext=await weibo(`https://m.weibo.cn/statuses/extend?id=${post.id}`);requests++;if(ext?.data?.longTextContent)post.longText=ext.data.longTextContent}
  card.account=post.user?.screen_name;card.bid=post.bid;
  const heat=classifyHeat(post,Z,P);
  if('skip' in heat)card.nowSkip=heat.skip;else card.newKind=heat.kind;
}

// 2. Same-account replacement: a newer original from the same account linking every post an older card links.
const listedOf=c=>(c.heat_targets??[]).filter(id=>id!==c.post_id);
for(const older of cards){
  if(older.source!=='weibo'||!older.uid)continue;
  const newer=cards.find(c=>c!==older&&c.source==='weibo'&&c.uid===older.uid&&c.created_at>older.created_at&&!c.heat_repost&&listedOf(c).length&&listedOf(older).length&&listedOf(older).every(id=>listedOf(c).includes(id)));
  if(newer)older.replacedBy=newer;
}

// 3. Rotation over what remains, with the new kinds.
const remaining=cards.filter(c=>!c.replacedBy).map(c=>({...c,heatKind:c.newKind??c.heat_kind,heatRepost:c.heat_repost,createdAt:c.created_at}));
const shown=new Set(pickHeat(remaining).map(c=>c.id));

console.log('verdict   | card');
for(const c of cards){
  const who=`${c.account??c.title} ${c.bid?`(${c.bid})`:''}`;
  let verdict,why='';
  if(c.source!=='weibo'){verdict='KEEP';why='后台手动发布，不受规则影响'}
  else if(c.replacedBy){verdict='REMOVE';why=`同账号更新替代：被 ${c.replacedBy.bid??c.replacedBy.id} 替代`}
  else if(!shown.has(c.id)){verdict='REMOVE';why='轮换（超出 /heat 显示数量）'}
  else if(c.newKind&&c.newKind!==c.heat_kind){verdict='MOVE';why=`${c.heat_kind} → ${c.newKind}`}
  else{verdict='KEEP';why=c.note??(c.nowSkip?`（当前规则会跳过：${c.nowSkip}；已在线的卡片保留）`:c.heat_kind)}
  console.log(`${verdict.padEnd(9)} | ${who} — ${why}`);
}
console.log(`\nWeibo requests made: ${requests}. Nothing was changed.`);
