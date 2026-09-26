import {groupHeatTasks} from '@/lib/heatList';
import type {Task} from '@/lib/types';
import {TaskCard} from './TaskCard';

const GROUP_TITLES={红膏:'🔥 红膏加热',空瓶:'🈳 速来空瓶'} as const;

// The 加热 cards, grouped 红膏 then 空瓶 when both are present.
export function HeatList({tasks}:{tasks:Task[]}){
  return <>{groupHeatTasks(tasks).map(group=><section key={group.kind??'all'} className="mb-5">{group.kind&&<h2 className="section-title mb-2">{GROUP_TITLES[group.kind]} <span className="ml-1 text-xs font-medium text-[#7890a6]">{group.tasks.length} 条</span></h2>}<div className="space-y-3">{group.tasks.map(task=><TaskCard key={task.id} task={task} urgent heat/>)}</div></section>)}</>;
}
