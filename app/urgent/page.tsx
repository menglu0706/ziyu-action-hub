import {FishIcon} from '@/components/FishIcon';
import {MobileNav} from '@/components/MobileNav';
import {TaskCard} from '@/components/TaskCard';
import {UrgentList} from '@/components/UrgentList';
import {repository} from '@/lib/repository';
import {visualStyle} from '@/lib/visual';

export const revalidate=30;

export default async function Urgent(){
  const [tasks,setting]=await Promise.all([repository.getUrgentTasks(),repository.getVisualSetting('urgent')]);
  const hero=tasks[0];
  const ongoing=hero?tasks.filter(task=>task.id!==hero.id):tasks;

  return <main className="phone-shell urgent-page" style={visualStyle(setting)}><section className="hero"><div className="relative z-10"><FishIcon/><p className="urgent-brand mt-4">All for ZIYU</p></div></section><div className="page-pad -mt-4 relative z-10"><h2 className="section-title mb-2"><span className="mr-1" aria-hidden="true">🔥</span>紧急任务 <span className="ml-1 text-xs font-medium text-[#7890a6]">现在最重要</span></h2>{hero?<TaskCard task={hero} dominant urgent/>:<div className="card p-5 text-sm text-[#7890a6]">暂无已发布任务</div>}<h2 className="section-title mb-2 mt-5">进行中的任务</h2><UrgentList tasks={ongoing}/></div><MobileNav/></main>;
}
