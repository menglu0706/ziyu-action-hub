// Local-only preview of the 加热 rules: runs sample Weibo posts (lib/dev/heatSamples.json) through
// the same classifyHeat the watcher uses and lays the result out like /heat, plus a table of how
// every sample was handled. Not served in production builds.
import {notFound} from 'next/navigation';
import {MobileHeader} from '@/components/MobileHeader';
import {TaskCard} from '@/components/TaskCard';
import {classifyHeat,heatTitle,type HeatPost} from '@/lib/heat';
import type {Task} from '@/lib/types';
import samples from '@/lib/dev/heatSamples.json';

type Sample=HeatPost&{bid:string;id:string;created_at:string;user:{id:number;screen_name:string}};
// Same as the watcher's ZIYU_UIDS: 梓渝's watched accounts plus brands.
const ZIYU_UIDS=new Set(['8019758392','7352202247','8009243499','7552817501']);
const HEAT_TAB_LIMIT=15;

export default function HeatPreview(){
  if(process.env.NODE_ENV==='production')notFound();
  const deadline=new Date(Date.now()+6*3600e3).toISOString();
  const rows=(samples as Sample[]).map(post=>{
    const result=classifyHeat(post,ZIYU_UIDS),url=`https://weibo.com/${post.user.id}/${post.bid}`;
    const task:Task|null='skip' in result?null:{id:post.id,title:heatTitle(post.user.screen_name,result.kind),platform:'微博',category:'其他',urgency:100,required:100,minutes:1,deadline,
      createdAt:new Date(post.created_at).toISOString(),quick:'点击前往博文，按要求加热',description:result.description,recommendedCopy:'',url,pinned:false,urgent:false,heat:true,daily:false,dailyGroup:'其他',urgentSortPosition:null,steps:[]};
    return {post,url,result,task};
  });
  // /heat's order: original posts before reposts, newest first within each.
  const listed=rows.filter(row=>row.task).sort((a,b)=>Number('repost' in a.result&&a.result.repost)-Number('repost' in b.result&&b.result.repost)||b.task!.createdAt!.localeCompare(a.task!.createdAt!));
  const shown=new Set(listed.slice(0,HEAT_TAB_LIMIT).map(row=>row.post.id));
  return <main className="phone-shell"><MobileHeader title="加热任务 · 样例预览"/><div className="page-pad">
    <p className="mb-3 mt-0 text-xs font-medium text-[#7890a6]">{samples.length} 条样例微博，{listed.length} 条生成任务，下面按 /heat 的顺序显示前 {HEAT_TAB_LIMIT} 条。</p>
    <div className="space-y-3">{listed.filter(row=>shown.has(row.post.id)).map(row=><TaskCard key={row.post.id} task={row.task!} urgent heat/>)}</div>
    <h2 className="section-title mb-2 mt-6">每条样例的处理结果</h2>
    <div className="card overflow-x-auto p-3"><table className="w-full text-left text-xs leading-5"><thead><tr className="text-[#7890a6]"><th className="pr-2">微博</th><th className="pr-2">账号</th><th className="pr-2">类型</th><th>结果</th></tr></thead><tbody>
      {rows.map(({post,url,result})=><tr key={post.id} className="border-t border-[#e4edf4] align-top"><td className="py-1 pr-2"><a href={url} target="_blank" rel="noreferrer">{post.bid}</a></td><td className="py-1 pr-2">{post.user.screen_name}</td><td className="py-1 pr-2">{post.retweeted_status?'转发':'原创'}</td><td className="py-1">{'skip' in result?<span className="text-[#d75454]">忽略：{result.skip}</span>:<><b>{result.kind}</b>{shown.has(post.id)?'':'（超出 15 条，未显示）'}</>}</td></tr>)}
    </tbody></table></div>
  </div></main>;
}
