import {notFound} from 'next/navigation';
import {MobileHeader} from '@/components/MobileHeader';
import {Countdown} from '@/components/Countdown';
import {CopyButton} from '@/components/CopyButton';
import {ExternalLink} from '@/components/ExternalLink';
import {MiniProgramAction} from '@/components/MiniProgramAction';
import {repository} from '@/lib/repository';
import {externalWebHref,isWechatMiniProgramToken} from '@/lib/url';

export const revalidate=30;

export default async function TaskDetail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const task=await repository.getTask(id);
  if(!task)notFound();
  const expired=Boolean(task.deadline&&new Date(task.deadline).getTime()<=Date.now());
  const miniProgramToken=isWechatMiniProgramToken(task.url)?task.url:null,targetHref=externalWebHref(task.url);
  return <main className="phone-shell"><MobileHeader title="任务详情" back="/urgent"/><div className="page-pad"><article className="card p-5"><p className="m-0 text-xs font-bold text-[#4b91cc]">{task.platform}</p><div className="flex items-start justify-between gap-3"><h1 className="my-2 text-2xl font-black">{task.title}</h1>{expired&&<span className="tag red">已截止</span>}</div><div className="my-3 flex flex-wrap gap-2"><span className="tag">{task.category}</span><span className="tag red">紧急</span><span className="tag gold">必做</span><span className="tag">约{task.minutes}分钟</span>{task.deadline&&!expired&&<span className="tag red"><Countdown deadline={task.deadline} compact/></span>}</div><section className="my-5"><h2 className="text-base">最快做法</h2><p className="text-sm leading-7 text-[#59738b] whitespace-pre-wrap">{task.quick}</p></section>{task.description&&<p className="my-5 text-sm leading-7 text-[#59738b] whitespace-pre-wrap">{task.description}</p>}{task.recommendedCopy&&<section className="my-5 rounded-2xl bg-[#eef7fc] p-4"><div className="flex items-center justify-between"><h2 className="m-0 text-base">推荐文案</h2><CopyButton text={task.recommendedCopy}/></div><p className="mb-0 whitespace-pre-wrap text-sm leading-7 text-[#59738b]">{task.recommendedCopy}</p></section>}{task.steps.length>0&&<><h2 className="text-base">最快步骤</h2><ol className="space-y-3 p-0">{task.steps.map((step,index)=><li className="flex items-center gap-3 text-sm" key={`${index}-${step}`}><b className="grid h-7 w-7 place-items-center rounded-full bg-[#eaf5fc] text-[#4088cd]">{index+1}</b>{step}</li>)}</ol></>}{!expired&&miniProgramToken?<MiniProgramAction token={miniProgramToken} className="my-5"/>:!expired&&targetHref?<ExternalLink className="primary my-5" href={targetHref}>立即前往 ↗</ExternalLink>:null}</article></div></main>;
}
