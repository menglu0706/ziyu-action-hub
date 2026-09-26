// Local-only preview of the 加热 rules: runs sample Weibo posts (lib/dev/heatSamples.json) through
// the same classifyHeat the watcher uses, oldest first like the watcher, and lays the result out
// with /heat's pickHeatTasks, plus a table of how every sample was handled. Not served in
// production builds. Every sample counts as live, whatever its age.
import {notFound} from 'next/navigation';
import {MobileHeader} from '@/components/MobileHeader';
import {TaskCard} from '@/components/TaskCard';
import {classifyHeat,heatTitle,type HeatPost} from '@/lib/heat';
import {HEAT_TAB_LIMIT,pickHeatTasks} from '@/lib/heatList';
import type {Task} from '@/lib/types';
import samples from '@/lib/dev/heatSamples.json';

type Sample=HeatPost&{bid:string;id:string;created_at:string;user:{id:number;screen_name:string};retweeted_status?:{bid:string;user:{id:number}}};
// Same as the watcher's ZIYU_UIDS: 梓渝's watched accounts plus brands.
const ZIYU_UIDS=new Set(['8019758392','7352202247','8009243499','7552817501']);
const postUrl=(uid:number,bid:string)=>`https://weibo.com/${uid}/${bid}`;

export default function HeatPreview(){
  if(process.env.NODE_ENV==='production')notFound();
  const deadline=new Date(Date.now()+6*3600e3).toISOString(),listedUrls=new Set<string>();
  const time=(post:Sample)=>new Date(post.created_at).getTime();
  const rows=[...(samples as Sample[])].sort((a,b)=>time(a)-time(b)).map(post=>{
    const url=postUrl(post.user.id,post.bid),rt=post.retweeted_status;
    const result=classifyHeat(post,ZIYU_UIDS);
    if('skip' in result)return {post,url,outcome:`忽略：${result.skip}`,task:null};
    if(rt&&listedUrls.has(postUrl(rt.user.id,rt.bid)))return {post,url,outcome:'忽略：原帖已在加热列表',task:null};
    listedUrls.add(url);
    const task:Task={id:post.id,title:heatTitle(post.user.screen_name,result.kind),platform:'微博',category:'其他',urgency:100,required:100,minutes:1,deadline,
      createdAt:new Date(post.created_at).toISOString(),quick:'点击前往博文，按要求加热',description:result.description,recommendedCopy:'',url,pinned:false,urgent:false,
      heat:true,heatKind:result.kind,heatRepost:result.repost,daily:false,dailyGroup:'其他',urgentSortPosition:null,steps:[]};
    return {post,url,outcome:result.kind,task};
  });
  const tasks=rows.flatMap(row=>row.task?[row.task]:[]),shown=pickHeatTasks(tasks),shownIds=new Set(shown.map(task=>task.id));
  const kinds=(list:Task[])=>(['红膏','空瓶'] as const).map(kind=>`${kind} ${list.filter(task=>task.heatKind===kind).length}`).join(' · ');
  return <main className="phone-shell"><MobileHeader title="加热任务 · 样例预览"/><div className="page-pad">
    <p className="mb-3 mt-0 text-xs font-medium text-[#7890a6]">{samples.length} 条样例微博，{tasks.length} 条生成任务（{kinds(tasks)}）。/heat 显示 {shown.length} 条（{kinds(shown)}），原创在前。</p>
    <div className="space-y-3">{shown.map(task=><TaskCard key={task.id} task={task} urgent heat/>)}</div>
    <h2 className="section-title mb-2 mt-6">每条样例的处理结果（按发布时间）</h2>
    <div className="card overflow-x-auto p-3"><table className="w-full text-left text-xs leading-5"><thead><tr className="text-[#7890a6]"><th className="pr-2">微博</th><th className="pr-2">账号</th><th className="pr-2">类型</th><th>结果</th></tr></thead><tbody>
      {rows.map(({post,url,outcome,task})=><tr key={post.id} className="border-t border-[#e4edf4] align-top"><td className="py-1 pr-2"><a href={url} target="_blank" rel="noreferrer">{post.bid}</a></td><td className="py-1 pr-2">{post.user.screen_name}</td><td className="py-1 pr-2">{post.retweeted_status?'转发':'原创'}</td><td className="py-1">{task?<><b>{outcome}</b>{shownIds.has(task.id)?'':`（超出 ${HEAT_TAB_LIMIT} 条，未显示）`}</>:<span className="text-[#d75454]">{outcome}</span>}</td></tr>)}
    </tbody></table></div>
  </div></main>;
}
