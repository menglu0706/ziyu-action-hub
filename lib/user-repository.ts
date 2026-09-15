import {getOrCreateOwnProfile,optionalUser,requireUserIdentity} from '@/lib/auth/user';
import type {LeaderboardRow,Task} from '@/lib/types';

export type CompletionHistory={id:string;taskId:string|null;title:string;category:string;completedAt:string};
export type TaskViewerSession=ReturnType<typeof optionalUser>;
export function startTaskViewerSession(){return optionalUser()}
type ViewerTask=Pick<Task,'id'|'platform'|'multi'|'completionMode'>;
export async function getTaskViewerState(tasks:ViewerTask[],session:TaskViewerSession=startTaskViewerSession()){
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
const mapLeaderboard=(row:{user_id:string;display_nickname:string;display_avatar_url:string|null;action_count:number;rank:number;period_start:string;period_end:string}):LeaderboardRow=>({userId:row.user_id,nickname:row.display_nickname,avatarUrl:row.display_avatar_url,actionCount:row.action_count,rank:row.rank,periodStart:row.period_start,periodEnd:row.period_end});
type UserIdentity=Awaited<ReturnType<typeof requireUserIdentity>>;
type OwnProfile=Awaited<ReturnType<typeof getOrCreateOwnProfile>>;
type StatsRow={completed_at:string;counts_toward_stats:boolean};
export type UserStats={today:number|null;week:number|null;streak:number|null;total:number};

function calculateStats(rows:StatsRow[],timezone:string|null):UserStats{
  const valid=rows.filter(row=>row.counts_toward_stats);
  if(!timezone)return {today:null,week:null,streak:null,total:valid.length};
  let today:string;let keys:string[];
  try{today=localDateKey(new Date(),timezone);keys=valid.map(row=>localDateKey(row.completed_at,timezone))}catch{return {today:null,week:null,streak:null,total:valid.length}}
  const [year,month,day]=today.split('-').map(Number);const weekday=new Date(Date.UTC(year,month-1,day)).getUTCDay();const monday=shiftDateKey(today,-((weekday+6)%7));
  const active=new Set(keys);let cursor=active.has(today)?today:shiftDateKey(today,-1);let streak=0;while(active.has(cursor)){streak++;cursor=shiftDateKey(cursor,-1)}
  return {today:keys.filter(key=>key===today).length,week:keys.filter(key=>key>=monday&&key<=today).length,streak,total:valid.length};
}

export async function getUserStats(context:UserIdentity,profilePromise:Promise<OwnProfile>){
  const completionPromise=context.db.from('task_completions').select('completed_at,counts_toward_stats').eq('user_id',context.user.id);
  const [profile,completionResult]=await Promise.all([profilePromise,completionPromise]);
  return calculateStats(completionResult.data??[],profile.timezone||null);
}

export async function getCurrentLeaderboard(context:UserIdentity){
  const {data}=await context.db.from('leaderboard_snapshots').select('user_id,display_nickname,display_avatar_url,action_count,rank,period_start,period_end').eq('period_type','current_week').order('period_start',{ascending:false}).order('rank').limit(100);
  const latestPeriod=data?.[0]?.period_start;
  return (data??[]).filter(row=>row.period_start===latestPeriod).map(mapLeaderboard);
}

export async function getUserTaskHistory(next='/me/tasks'){
  const context=await requireUserIdentity(next);const {db,user}=context;
  const profilePromise=getOrCreateOwnProfile(context);
  const completionPromise=db.from('task_completions').select('id,task_id,task_title,task_category,completed_at').eq('user_id',user.id).order('completed_at',{ascending:false});
  const [profile,completionResult]=await Promise.all([profilePromise,completionPromise]);
  const rows=completionResult.data??[];const taskIds=rows.flatMap(row=>row.task_id?[row.task_id]:[]);
  const {data:availableRows}=taskIds.length?await db.from('tasks').select('id').in('id',taskIds).eq('status','published'):{data:[]};const available=new Set((availableRows??[]).map(row=>row.id));
  const history=rows.map(row=>({id:row.id,taskId:row.task_id&&available.has(row.task_id)?row.task_id:null,title:row.task_title,category:row.task_category,completedAt:row.completed_at} satisfies CompletionHistory));
  return {user,profile,history};
}
export async function getLeaderboard(periodType:'current_week'|'previous_week'){
  const {db,user}=await requireUserIdentity('/me/leaderboard');const {data,error}=await db.from('leaderboard_snapshots').select('user_id,display_nickname,display_avatar_url,action_count,rank,period_start,period_end').eq('period_type',periodType).order('period_start',{ascending:false}).order('rank').limit(100);if(error)return {user,rows:[] as LeaderboardRow[]};const latest=data?.[0]?.period_start;return {user,rows:(data??[]).filter(row=>row.period_start===latest).map(mapLeaderboard)};
}
export async function getLeaderboards(){const {db,user}=await requireUserIdentity('/me/leaderboard');const load=async(periodType:'current_week'|'previous_week')=>{const {data}=await db.from('leaderboard_snapshots').select('user_id,display_nickname,display_avatar_url,action_count,rank,period_start,period_end').eq('period_type',periodType).order('period_start',{ascending:false}).order('rank').limit(100);const latest=data?.[0]?.period_start;return (data??[]).filter(row=>row.period_start===latest).map(mapLeaderboard)};const [current,previous]=await Promise.all([load('current_week'),load('previous_week')]);return {user,current,previous}}

export async function getUserDashboard(next='/me'){
  const context=await requireUserIdentity(next);const {db,user}=context;
  const [profile,completionResult,accountResult,leaderboardResult]=await Promise.all([
    getOrCreateOwnProfile(context),
    db.from('task_completions').select('id,task_id,task_title,task_category,completed_at,counts_toward_stats').eq('user_id',user.id).order('completed_at',{ascending:false}),
    db.from('platform_account_counts').select('platform,account_count').eq('user_id',user.id).order('platform'),
    db.from('leaderboard_snapshots').select('user_id,display_nickname,display_avatar_url,action_count,rank,period_start,period_end').eq('period_type','current_week').order('period_start',{ascending:false}).order('rank').limit(100)
  ]);
  const latestPeriod=leaderboardResult.data?.[0]?.period_start;const leaderboard=(leaderboardResult.data??[]).filter(row=>row.period_start===latestPeriod).map(mapLeaderboard);
  const rows=completionResult.data??[];
  const taskIds=(rows??[]).flatMap(row=>row.task_id?[row.task_id]:[]);const {data:availableRows}=taskIds.length?await db.from('tasks').select('id').in('id',taskIds).eq('status','published'):{data:[]};const available=new Set((availableRows??[]).map(row=>row.id));
  const history=(rows??[]).map(row=>({id:row.id,taskId:row.task_id&&available.has(row.task_id)?row.task_id:null,title:row.task_title,category:row.task_category,completedAt:row.completed_at} satisfies CompletionHistory));
  const timezone=profile.timezone||null;
  const accounts=accountResult.data??[];
  return {user,profile,history,accounts,leaderboard,stats:calculateStats(rows,timezone)};
}
