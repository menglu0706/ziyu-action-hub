import {ProgressControl} from '@/components/ProgressControl';
import Link from 'next/link';
import {getTaskViewerState,type TaskViewerSession} from '@/lib/user-repository';
import type {Task} from '@/lib/types';

export async function TaskViewerControls({task,session}:{task:Task;session:TaskViewerSession}){
  if(!task.multi)return null;
  const state=await getTaskViewerState([task],session);
  const goal=state.goals.get(task.id)??null;
  const progress=state.progress.get(task.id)??0;
  return <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs font-bold text-[#7890a6]">多账号进度</span>{typeof goal==='number'?<ProgressControl taskId={task.id} initial={progress} goal={goal}/>:<span className="text-right text-xs text-[#7890a6]">还未设置{task.platform}账号数<br/><Link href="/me/account" className="font-bold text-[#438bd1]">去设置 →</Link></span>}</div>;
}

export function TaskViewerControlsFallback(){
  return <div className="mt-4 flex items-center justify-between"><span className="text-xs font-bold text-[#7890a6]">多账号进度</span><span className="text-xs text-[#8ba0b1]">加载中…</span></div>;
}
