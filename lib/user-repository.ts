import {getOrCreateOwnProfile,optionalUser,requireUserIdentity} from '@/lib/auth/user';
import type {Task} from '@/lib/types';

export type CompletionHistory={id:string;taskId:string|null;title:string;category:string;completedAt:string};
export function startTaskViewerSession(){return optionalUser()}
type ViewerTask=Pick<Task,'id'|'platform'|'multi'|'completionMode'>;
export async function getTaskViewerState(tasks:ViewerTask[],session=startTaskViewerSession()){
  const {db,user}=await session;
  if(!user||!tasks.length)return {authenticated:Boolean(user),progress:new Map<string,number>(),goals:new Map<string,number>(),completed:new Set<string>()};
  const taskIds=tasks.map(task=>task.id);const platforms=[...new Set(tasks.flatMap(task=>task.multi&&task.platform?[task.platform]:[]))];
  const [progressResult,completionResult,profileResult,accountResult]=await Promise.all([
    db.from('task_progress').select('task_id,completed_count').eq('user_id',user.id).in('task_id',taskIds),
    db.from('task_completions').select('task_id,completion_mode,occurrence_date').eq('user_id',user.id).in('task_id',taskIds),
    db.from('profiles').select('timezone').eq('id',user.id).maybeSingle(),
    platforms.length?db.from('platform_account_counts').select('platform,account_count').eq('user_id',user.id).in('platform',platforms):Promise.resolve({data:[]})
  ]);
  const counts=new Map((accountResult.data??[]).map(row=>[row.platform,row.account_count]));const goals=new Map<string,number>();
  for(const task of tasks)if(task.multi&&task.platform&&counts.has(task.platform))goals.set(task.id,counts.get(task.platform)!);
  let today:string|null=null;const timezone=profileResult.data?.timezone;
  if(timezone)try{today=localDateKey(new Date(),timezone)}catch{today=null}
  const modes=new Map(tasks.map(task=>[task.id,task.completionMode]));const completed=new Set<string>();
  for(const row of completionResult.data??[])if(row.task_id&&modes.get(row.task_id)===row.completion_mode&&(row.completion_mode==='one_time'||(row.completion_mode==='daily'&&today!==null&&row.occurrence_date===today)))completed.add(row.task_id);
  return {authenticated:true,progress:new Map((progressResult.data??[]).map(row=>[row.task_id,row.completed_count])),goals,completed};
}

function localDateKey(instant:string|Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));
  const get=(type:string)=>parts.find(part=>part.type===type)?.value??'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function shiftDateKey(key:string,days:number){const [year,month,day]=key.split('-').map(Number);const date=new Date(Date.UTC(year,month-1,day+days));return date.toISOString().slice(0,10)}

export async function getUserDashboard(next='/me'){
  const context=await requireUserIdentity(next);const {db,user}=context;
  const [profile,completionResult,accountResult]=await Promise.all([
    getOrCreateOwnProfile(context),
    db.from('task_completions').select('id,task_id,task_title,task_category,completed_at,counts_toward_stats').eq('user_id',user.id).order('completed_at',{ascending:false}),
    db.from('platform_account_counts').select('platform,account_count').eq('user_id',user.id).order('platform')
  ]);
  const rows=completionResult.data??[];
  const taskIds=(rows??[]).flatMap(row=>row.task_id?[row.task_id]:[]);const {data:availableRows}=taskIds.length?await db.from('tasks').select('id').in('id',taskIds).eq('status','published'):{data:[]};const available=new Set((availableRows??[]).map(row=>row.id));
  const history=(rows??[]).map(row=>({id:row.id,taskId:row.task_id&&available.has(row.task_id)?row.task_id:null,title:row.task_title,category:row.task_category,completedAt:row.completed_at} satisfies CompletionHistory));
  const timezone=profile.timezone||null;
  const accounts=accountResult.data??[];
  if(!timezone)return {user,profile,history,accounts,stats:{today:null,week:null,streak:null,total:(rows??[]).filter(row=>row.counts_toward_stats).length}};
  const valid=(rows??[]).filter(row=>row.counts_toward_stats);let today:string;let keys:string[];
  try{today=localDateKey(new Date(),timezone);keys=valid.map(row=>localDateKey(row.completed_at,timezone))}catch{return {user,profile,history,accounts,stats:{today:null,week:null,streak:null,total:valid.length}}}
  const [year,month,day]=today.split('-').map(Number);const weekday=new Date(Date.UTC(year,month-1,day)).getUTCDay();const monday=shiftDateKey(today,-((weekday+6)%7));
  const active=new Set(keys);let cursor=active.has(today)?today:shiftDateKey(today,-1);let streak=0;while(active.has(cursor)){streak++;cursor=shiftDateKey(cursor,-1)}
  return {user,profile,history,accounts,stats:{today:keys.filter(key=>key===today).length,week:keys.filter(key=>key>=monday&&key<=today).length,streak,total:valid.length}};
}
