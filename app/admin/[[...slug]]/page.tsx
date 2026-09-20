import {redirect} from 'next/navigation';
import './admin.css';
import {AdminPrototype} from '@/components/AdminPrototype';
import {AdminUserManagement} from '@/components/AdminUserManagement';
import {TaskAdminList,TaskAdminNew} from '@/components/TaskAdminFlow';
import {requireAdmin} from '@/lib/auth/admin';
import {getAdminInitialData,type AdminDataScope} from '@/lib/admin-repository';
import {getAdminAccounts} from '@/lib/admin-users';
import {createClient} from '@/lib/supabase/server';
import {createServerTrace,type ServerTrace} from '@/lib/observability/server-trace';

export const dynamic='force-dynamic';

const scopeFor=(path:string,editing:boolean):AdminDataScope=>path===''?'dashboard':path==='tasks'?'tasks':path==='tasks/new'?(editing?'tasks':'task-new'):path==='quick-links'?'links':path==='templates'?'templates':path==='media'?'media':path==='guides'?'guides':path==='visual-settings'?'visual':'none';

async function renderAdmin(trace:ServerTrace,{params,searchParams}:{params:Promise<{slug?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const db=await createClient(trace),adminPromise=requireAdmin(db,trace);
  const [{slug=[]},query]=await Promise.all([params,searchParams]);
  const path=slug.join('/'),value=(key:string)=>typeof query[key]==='string'?query[key] as string:undefined,editId=value('edit');
  const [actor,data]=await Promise.all([adminPromise,getAdminInitialData(scopeFor(path,Boolean(editId)),db)]);
  if(path==='users'){
    if(actor.role!=='admin')redirect('/admin');
    const result=await getAdminAccounts(actor,trace);
    return <AdminUserManagement initialAccounts={result.accounts} initialError={result.error}/>;
  }
  if(path==='tasks/new'){
    const preset=value('preset');
    return <TaskAdminNew key={`${preset??''}:${editId??''}`} tasks={data.tasks} preset={preset} editId={editId}/>;
  }
  if(path==='tasks')return <TaskAdminList tasks={data.tasks}/>;
  return <AdminPrototype slug={slug} initialData={data} query={query}/>;
}

export default async function Admin(props:{params:Promise<{slug?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const pageStartedAt=Date.now(),trace=await createServerTrace('/admin',pageStartedAt);
  try{const result=await renderAdmin(trace,props);trace.end('page.initial-render',pageStartedAt);trace.flush();return result}catch(error){trace.end('page.initial-render',pageStartedAt,'failure');trace.flushError(error);throw error}
}
