// Local-only preview of the 加热 rules: runs Weibo posts through the same classifyHeat the watcher
// uses, oldest first like the watcher, and lays the result out with /heat's pickHeatTasks, plus a
// table of how every post was handled. Not served in production builds.
//   /dev/heat              curated samples (lib/dev/heatSamples.json); every task counts as live.
//   /dev/heat?source=crawl the 加热 accounts' latest posts as crawled (lib/dev/heatCrawl.json); tasks
//                          get their real lifetime (红膏 10 h, 空瓶 6 h), as if /heat were opened at crawl time.
import {notFound} from 'next/navigation';
import {MobileHeader} from '@/components/MobileHeader';
import {HeatList} from '@/components/HeatList';
import {classifyHeat,heatTitle,heatTtl,type HeatPost} from '@/lib/heat';
import {HEAT_TAB_LIMIT,pickHeatTasks} from '@/lib/heatList';
import type {Task} from '@/lib/types';
import samples from '@/lib/dev/heatSamples.json';
import crawl from '@/lib/dev/heatCrawl.json';

type Sample=HeatPost&{bid:string;id:string;created_at:string;user:{id:number;screen_name:string};retweeted_status?:{bid:string;user:{id:number}}};
// Same as the watcher's ZIYU_UIDS: 梓渝's watched accounts plus brands.
const ZIYU_UIDS=new Set(['8019758392','7352202247','8009243499','7552817501']);
const postUrl=(uid:number,bid:string)=>`https://weibo.com/${uid}/${bid}`;
// The crawl's compact rows: bid, Beijing time (e.g. 'Sep 27 01:47:13', 2026), uid, name, HTML, repost.
type CrawlRow={b:string;t:string;u:number;n:string;h:string;r?:{b:string;u:number;n:string;h:string}};
const crawlTime=(t:string)=>new Date(`${t.slice(0,6)} 2026 ${t.slice(7)} GMT+0800`).toString();
const fromCrawl=(row:CrawlRow):Sample=>({bid:row.b,id:row.b,created_at:crawlTime(row.t),user:{id:row.u,screen_name:row.n},text:row.h,
  retweeted_status:row.r&&{bid:row.r.b,text:row.r.h,user:{id:row.r.u}}});

export default async function HeatPreview({searchParams}:{searchParams:Promise<{source?:string}>}){
  if(process.env.NODE_ENV==='production')notFound();
  const fromCrawlSource=(await searchParams).source==='crawl';
  const posts=fromCrawlSource?(crawl as CrawlRow[]).map(fromCrawl):samples as Sample[];
  const time=(post:Sample)=>new Date(post.created_at).getTime();
  // "Now" for the lifetimes: the newest crawled post, or the real now for samples (all live).
  const asOf=fromCrawlSource?Math.max(...posts.map(time)):Date.now(),listedUrls=new Set<string>();
  const rows=[...posts].sort((a,b)=>time(a)-time(b)).map(post=>{
    const url=postUrl(post.user.id,post.bid),rt=post.retweeted_status;
    const result=classifyHeat(post,ZIYU_UIDS);
    if('skip' in result)return {post,url,outcome:`忽略：${result.skip}`,task:null};
    const ends=(fromCrawlSource?time(post):asOf)+heatTtl(result.kind);
    if(ends<=asOf)return {post,url,outcome:`${result.kind}，但已过 ${heatTtl(result.kind)/3600e3} 小时（已下线）`,task:null};
    if(rt&&listedUrls.has(postUrl(rt.user.id,rt.bid)))return {post,url,outcome:'忽略：原帖已在加热列表',task:null};
    listedUrls.add(url);
    // Shift the window onto the real clock so the cards' countdowns read as they would have at asOf.
    const deadline=new Date(Date.now()+ends-asOf).toISOString();
    const task:Task={id:post.id,title:heatTitle(post.user.screen_name,result.kind),platform:'微博',category:'其他',urgency:100,required:100,minutes:1,deadline,
      createdAt:new Date(post.created_at).toISOString(),quick:'点击前往博文，按要求加热',description:result.description,recommendedCopy:'',url,pinned:false,urgent:false,
      heat:true,heatKind:result.kind,heatRepost:result.repost,daily:false,dailyGroup:'其他',urgentSortPosition:null,steps:[]};
    return {post,url,outcome:result.kind,task};
  });
  const tasks=rows.flatMap(row=>row.task?[row.task]:[]),shown=pickHeatTasks(tasks),shownIds=new Set(shown.map(task=>task.id));
  const kinds=(list:Task[])=>(['红膏','空瓶'] as const).map(kind=>`${kind} ${list.filter(task=>task.heatKind===kind).length}`).join(' · ');
  return <main className="phone-shell"><MobileHeader title="加热任务 · 样例预览"/><div className="page-pad">
    <p className="mb-2 mt-0 text-xs font-bold"><a href="/dev/heat">样例</a> · <a href="/dev/heat?source=crawl">真实抓取</a>{fromCrawlSource&&<span className="font-medium text-[#7890a6]">（按 {new Date(asOf).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} 时的 /heat 计算）</span>}</p>
    <p className="mb-3 mt-0 text-xs font-medium text-[#7890a6]">{posts.length} 条微博，{tasks.length} 条生成任务（{kinds(tasks)}）。/heat 显示 {shown.length} 条（{kinds(shown)}），原创在前。</p>
    <HeatList tasks={shown}/>
    <h2 className="section-title mb-2 mt-6">每条微博的处理结果（按发布时间）</h2>
    <div className="card overflow-x-auto p-3"><table className="w-full text-left text-xs leading-5"><thead><tr className="text-[#7890a6]"><th className="pr-2">微博</th><th className="pr-2">账号</th><th className="pr-2">时间</th><th className="pr-2">类型</th><th>结果</th></tr></thead><tbody>
      {rows.map(({post,url,outcome,task})=><tr key={post.id} className="border-t border-[#e4edf4] align-top"><td className="py-1 pr-2"><a href={url} target="_blank" rel="noreferrer">{post.bid}</a></td><td className="py-1 pr-2">{post.user.screen_name}</td><td className="py-1 pr-2 whitespace-nowrap">{new Date(post.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td className="py-1 pr-2">{post.retweeted_status?'转发':'原创'}</td><td className="py-1">{task?<><b>{outcome}</b>{shownIds.has(task.id)?'':`（超出 ${HEAT_TAB_LIMIT} 条，未显示）`}</>:<span className="text-[#d75454]">{outcome}</span>}</td></tr>)}
    </tbody></table></div>
  </div></main>;
}
