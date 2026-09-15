import {UrgentList} from '@/components/UrgentList';
import type {Task} from '@/lib/types';
import {getTaskViewerState,type TaskViewerSession} from '@/lib/user-repository';
export async function UrgentTasks({tasks,session}:{tasks:Task[];session:TaskViewerSession}){const state=await getTaskViewerState(tasks,session);return <UrgentList tasks={tasks.map(task=>({...task,progress:state.progress.get(task.id)??0,goal:state.goals.get(task.id)??null,completed:state.completed.has(task.id)}))}/>}
