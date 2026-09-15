import Link from 'next/link';
import {CompleteButton} from '@/components/CompleteButton';
import {ProgressControl} from '@/components/ProgressControl';
import {getTaskViewerState,type TaskViewerSession} from '@/lib/user-repository';
import type {Task} from '@/lib/types';

export async function TaskDetailViewer({task,session}:{task:Task;session:TaskViewerSession}){
  const state=await getTaskViewerState([task],session),progress=state.progress.get(task.id)??0,goal=state.goals.get(task.id)??null;
  return <>{task.multi&&<div className="mb-5 flex items-center justify-between gap-3"><b className="text-xs text-[#718ba2]">多账号进度</b>{typeof goal==='number'?<ProgressControl taskId={task.id} initial={progress} goal={goal}/>:<span className="text-right text-xs text-[#7890a6]">还未设置{task.platform}账号数<br/><Link href="/me/account" className="font-bold text-[#438bd1]">去设置 →</Link></span>}</div>}<CompleteButton taskId={task.id} initialDone={state.completed.has(task.id)}/></>;
}

export function TaskDetailViewerFallback({multi}:{multi:boolean}){
  return <>{multi&&<div className="mb-5 flex items-center justify-between"><b className="text-xs text-[#718ba2]">多账号进度</b><span className="text-xs text-[#8ba0b1]">加载中…</span></div>}<div className="h-11 animate-pulse rounded-xl bg-[#eef4f8]"/></>;
}
