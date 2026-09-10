import {Suspense} from 'react';
import {FishIcon} from '@/components/FishIcon';
import {MobileNav} from '@/components/MobileNav';
import {TaskCard} from '@/components/TaskCard';
import {TaskViewerControls,TaskViewerControlsFallback} from '@/components/TaskViewerControls';
import {UrgentList} from '@/components/UrgentList';
import {repository} from '@/lib/repository';
import {startTaskViewerSession} from '@/lib/user-repository';
import {visualStyle} from '@/lib/visual';

export const dynamic='force-dynamic';

export default async function Urgent(){
  const viewerSession=startTaskViewerSession();
  const [tasks,setting]=await Promise.all([repository.getTasks(),repository.getVisualSetting('urgent')]);
  const hero=tasks[0];
  const createdTime=(value?:string)=>value?new Date(value).getTime():0;
  const ongoing=tasks.slice(1).sort((a,b)=>b.urgency-a.urgency||b.required-a.required||createdTime(b.createdAt)-createdTime(a.createdAt));
  const viewerSlot=hero?.multi?<Suspense fallback={<TaskViewerControlsFallback/>}><TaskViewerControls task={hero} session={viewerSession}/></Suspense>:undefined;

  return <main className="phone-shell" style={visualStyle(setting)}><section className="hero"><div className="relative z-10"><FishIcon/><p className="mt-5 text-[27px] font-bold tracking-tight">只要做，就不怕浪费</p><p className="mt-2 text-xs tracking-[.18em] text-[#648baa]">ZUYUNI99 · MORE FOR ZIYU</p></div></section><div className="page-pad -mt-4 relative z-10"><h2 className="section-title"><span className="mr-1" aria-hidden="true">🔥</span>紧急任务 <span className="ml-1 text-xs font-medium text-[#7890a6]">现在最重要</span></h2>{hero?<TaskCard task={hero} dominant viewerSlot={viewerSlot}/>:<div className="card p-5 text-sm text-[#7890a6]">暂无已发布任务</div>}<h2 className="section-title">进行中的任务</h2><UrgentList tasks={ongoing}/></div><MobileNav/></main>;
}
