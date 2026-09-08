import {notFound} from 'next/navigation';
import {MobileHeader} from '@/components/MobileHeader';
import {Countdown} from '@/components/Countdown';
import {ProgressControl} from '@/components/ProgressControl';
import {CompleteButton} from '@/components/CompleteButton';
import {repository} from '@/lib/repository';

export const dynamic='force-dynamic';

export default async function TaskDetail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const task=await repository.getTask(id);
  if(!task)notFound();
  return <main className="phone-shell"><MobileHeader title="任务详情" back="/urgent"/><div className="page-pad"><article className="card p-5"><p className="m-0 text-xs font-bold text-[#4b91cc]">{task.platform}</p><h1 className="my-2 text-2xl font-black">{task.title}</h1><div className="my-3 flex gap-2"><span className="tag">{task.category}</span><span className="tag red">紧急</span><span className="tag gold">必做</span></div><section className="my-5"><h2 className="text-base">最快做法</h2><p className="text-sm leading-7 text-[#59738b] whitespace-pre-wrap">{task.quick}</p></section>{task.description&&<p className="my-5 text-sm leading-7 text-[#59738b] whitespace-pre-wrap">{task.description}</p>}{task.steps.length>0&&<><h2 className="text-base">最快步骤</h2><ol className="space-y-3 p-0">{task.steps.map((step,index)=><li className="flex items-center gap-3 text-sm" key={`${index}-${step}`}><b className="grid h-7 w-7 place-items-center rounded-full bg-[#eaf5fc] text-[#4088cd]">{index+1}</b>{step}</li>)}</ol></>}{task.deadline&&<div className="my-5 rounded-2xl bg-[#f3f9fd] p-4 text-center"><span className="text-xs text-[#7890a6]">剩余时间</span><div className="mt-1 font-mono text-2xl font-bold text-[#dd6060]"><Countdown deadline={task.deadline}/></div></div>}<a className="primary my-5" href={task.url} target="_blank" rel="noreferrer">立即前往 ↗</a>{task.multi&&<div className="mb-5 flex items-center justify-between"><b className="text-xs text-[#718ba2]">多账号进度</b><ProgressControl initial={task.progress} goal={task.goal}/></div>}<CompleteButton/><div className="mt-5 rounded-xl border border-dashed border-[#c9deec] p-4 text-center text-xs text-[#8ba0b1]">截图凭证（后续可选功能）</div></article></div></main>;
}
