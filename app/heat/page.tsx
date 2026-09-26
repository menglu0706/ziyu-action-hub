import {MobileHeader} from '@/components/MobileHeader';
import {MobileNav} from '@/components/MobileNav';
import {TaskCard} from '@/components/TaskCard';
import {repository} from '@/lib/repository';

export const revalidate=30;

export default async function Heat(){
  const tasks=await repository.getHeatTasks();
  return <main className="phone-shell"><MobileHeader title="加热任务"/><div className="page-pad"><p className="mb-3 mt-0 text-xs font-medium text-[#7890a6]">加热任务到点自动下线</p>{tasks.length?<div className="space-y-3">{tasks.map(task=><TaskCard key={task.id} task={task} urgent/>)}</div>:<div className="card p-5 text-sm text-[#7890a6]">暂无加热任务</div>}</div><MobileNav/></main>;
}
