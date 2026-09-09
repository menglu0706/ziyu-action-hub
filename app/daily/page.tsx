import {MobileHeader} from '@/components/MobileHeader';
import {MobileNav} from '@/components/MobileNav';
import {DailyPlanner} from '@/components/DailyPlanner';
import {repository} from '@/lib/repository';
import {visualStyle} from '@/lib/visual';
import {getTaskViewerState,startTaskViewerSession} from '@/lib/user-repository';
export const dynamic='force-dynamic';
export default async function Daily(){const viewerSession=startTaskViewerSession();const [source,setting]=await Promise.all([repository.getTasks(),repository.getVisualSetting('daily')]);const state=await getTaskViewerState(source,viewerSession);const tasks=source.map(task=>({...task,progress:state.progress.get(task.id)??0,goal:state.goals.get(task.id)??null,completed:state.completed.has(task.id)}));const intro=setting?.decorativeText.trim();return <main className="phone-shell" style={visualStyle(setting)}><MobileHeader title="日常任务"/><div className="page-pad">{intro&&<div className="card mb-5 p-5"><p className="m-0 text-xs font-bold text-[#5994c4]">今日安排</p><h2 className="mb-0 mt-2 whitespace-pre-wrap text-2xl font-bold">{intro}</h2></div>}{tasks.length?<DailyPlanner tasks={tasks}/>:<div className="card p-5 text-sm text-[#7890a6]">暂无已发布日常任务</div>}</div><MobileNav/></main>}
