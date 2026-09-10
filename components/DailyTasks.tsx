import {DailyPlanner} from '@/components/DailyPlanner';
import type {Task} from '@/lib/types';
import {getTaskViewerState,type TaskViewerSession} from '@/lib/user-repository';

export async function DailyTasks({tasks,session}:{tasks:Task[];session:TaskViewerSession}){
  const state=await getTaskViewerState(tasks,session);
  const personalized=tasks.map(task=>({...task,progress:state.progress.get(task.id)??0,goal:state.goals.get(task.id)??null,completed:state.completed.has(task.id)}));
  return <DailyPlanner tasks={personalized}/>;
}
