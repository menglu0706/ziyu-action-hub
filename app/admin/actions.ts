'use server';
import {revalidatePath,revalidateTag} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {isPlatform} from '@/lib/platforms';
import {DAILY_GROUPS,type DailyGroup} from '@/lib/types';
import {DAILY_TASKS_CACHE_TAG,TASK_DETAIL_CACHE_TAG} from '@/lib/repository';
import {requireSafeWebUrl,requireTaskTarget} from '@/lib/url';
import {normalizeTaskLink} from '@/lib/taskLink';

// Next.js redacts thrown-error messages crossing the Server Action boundary in production,
// replacing them with a generic "error in Server Components render" message -- so a deliberate,
// safe, actionable validation message (e.g. "task URL must be..." ) never reaches the admin who
// needs to see it. Wrapping each action's body converts that thrown error into a returned value,
// which isn't subject to the same redaction, while leaving all the existing validation/throw
// logic inside untouched.
// A save that would duplicate an active task's link comes back as `duplicate` instead of saving:
// 'same' (identical content, never saved) or 'different' (saved only when resent with override).
export type TaskDuplicate={kind:'same'|'different';tasks:{id:string;title:string}[]};
export type ActionResult={error?:string;duplicate?:TaskDuplicate};
class DuplicateTaskError extends Error{constructor(readonly duplicate:TaskDuplicate){super('任务链接重复')}}
async function toResult(work:()=>Promise<void>):Promise<ActionResult>{try{await work();return {}}catch(error){if(error instanceof DuplicateTaskError)return {duplicate:error.duplicate};return {error:error instanceof Error?error.message:'操作失败'}}}

async function context(){const db=await createClient();const {data}=await db.auth.getClaims();const userId=data?.claims?.sub;if(!userId)throw new Error('请重新登录');const {data:admin}=await db.from('admin_users').select('role,is_active').eq('user_id',userId).maybeSingle();if(!admin?.is_active||!['admin','editor'].includes(admin.role))throw new Error('没有后台操作权限');return {db,userId}}
type Db=Awaited<ReturnType<typeof context>>['db'];
const sameText=(a:string|null|undefined,b:string|null|undefined)=>(a??'').replace(/\s+/g,'')===(b??'').replace(/\s+/g,'');
// Active tasks (live, or offline awaiting a scheduled go-live, and not past their deadline) that
// link to the same target. Only checked when the link is new or changed. Returns true when the
// admin chose to override a different-content duplicate.
async function checkDuplicateLink(db:Db,input:{id?:string;title:string;url:string;quick:string;description?:string;recommendedCopy?:string;override?:boolean}){
  const link=normalizeTaskLink(input.url);
  const {data,error}=await db.from('tasks').select('id,title,external_url,quick_instruction,description,recommended_copy,status,publish_at,deadline').in('status',['published','offline']);
  if(error)throw new Error('任务查重失败');
  const current=input.id?data.find(t=>t.id===input.id):undefined;
  if(current&&normalizeTaskLink(current.external_url)===link)return false;
  const now=Date.now();
  const matches=data.filter(t=>t.id!==input.id&&(t.status==='published'||t.publish_at)&&(!t.deadline||new Date(t.deadline).getTime()>now)&&normalizeTaskLink(t.external_url)===link);
  if(!matches.length)return false;
  const same=matches.filter(t=>sameText(t.title,input.title)&&sameText(t.quick_instruction,input.quick)&&sameText(t.description,input.description)&&sameText(t.recommended_copy,input.recommendedCopy));
  if(same.length)throw new DuplicateTaskError({kind:'same',tasks:same.map(t=>({id:t.id,title:t.title}))});
  if(!input.override)throw new DuplicateTaskError({kind:'different',tasks:matches.map(t=>({id:t.id,title:t.title}))});
  return true;
}
const scores={urgency:{'紧急':100,'重要':75,'普通':45,'低':20},required:{'必做':100,'建议':70,'可做':40,'不推荐':10}} as const;
export async function saveTask(input:{id?:string;title:string;url:string;quick:string;description?:string;recommendedCopy?:string;category:string;platform?:string;urgency:keyof typeof scores.urgency;required:keyof typeof scores.required;minutes:number;deadline?:string;audience:string;pinned:boolean;urgent?:boolean;daily:boolean;dailyGroup:DailyGroup;push:boolean;status:'draft'|'published';publishAt?:string;pinStartsAt?:string;pinEndsAt?:string;override?:boolean}):Promise<ActionResult>{return toResult(async()=>{requireTaskTarget(input.url);if(!DAILY_GROUPS.includes(input.dailyGroup))throw new Error('请选择日常分组');const showInUrgent=input.urgent??true;const {db,userId}=await context();
// Overriding a different-content duplicate publishes the new task pinned; the old one is unpinned below but kept.
const overrode=await checkDuplicateLink(db,input);const wantsPin=input.pinned||(overrode&&input.status==='published'&&showInUrgent);const now=Date.now(),time=(value:string)=>new Date(value).getTime();
// A future go-live time turns "publish" into "stay offline until then"; drafts never auto-publish.
const publishAt=input.status==='published'&&input.publishAt&&time(input.publishAt)>now?input.publishAt:null;const status=publishAt?'offline':input.status;
// A scheduled pin replaces the "pin now" toggle: an explicit pin start wins, and a pinned task that
// goes live later takes the pin slot at go-live rather than immediately (while still offline).
const scheduledPin=input.pinStartsAt||(wantsPin&&publishAt)||null;
let pinStartsAt=scheduledPin,pinEndsAt=input.pinEndsAt||null;if(pinEndsAt&&time(pinEndsAt)<=now)throw new Error('置顶结束时间必须晚于当前时间');if(pinStartsAt&&pinEndsAt&&time(pinEndsAt)<=time(pinStartsAt))throw new Error('置顶结束时间必须晚于置顶开始时间');
// A pin start that has already passed on a live task applies immediately instead of waiting for the scheduler.
const pinStartsNow=Boolean(pinStartsAt&&time(pinStartsAt)<=now&&status==='published');if(pinStartsNow)pinStartsAt=null;const pinned=scheduledPin?pinStartsNow:wantsPin;if(!pinned&&!pinStartsAt)pinEndsAt=null;
if((pinned||pinStartsAt)&&!showInUrgent)throw new Error('首页强制置顶任务必须显示在紧急页面');if(input.platform&&!isPlatform(input.platform))throw new Error('请选择任务平台');const id=input.id??crypto.randomUUID();const row={id,title:input.title.trim(),external_url:input.url,quick_instruction:input.quick.trim(),description:input.description||null,recommended_copy:input.recommendedCopy?.trim()||null,category:input.category,platform:input.platform||null,urgency_score:scores.urgency[input.urgency],required_score:scores.required[input.required],estimated_minutes:input.minutes,deadline:input.deadline||null,audience:input.audience,is_pinned:pinned,show_in_urgent:showInUrgent,show_in_daily:input.daily,daily_group:input.dailyGroup,push_reserved:input.push,status,publish_at:publishAt,pin_starts_at:pinStartsAt,pin_ends_at:pinEndsAt,created_by:userId};if(pinned){const {error}=await db.from('tasks').update({is_pinned:false}).neq('id',id);if(error)throw new Error('置顶任务更新失败')}const query=input.id?db.from('tasks').update(row).eq('id',id):db.from('tasks').insert(row);const {error}=await query;if(error)throw new Error('任务保存失败');revalidatePath('/admin/tasks');revalidatePath('/urgent');revalidatePath('/daily');revalidatePath(`/tasks/${id}`);revalidateTag(TASK_DETAIL_CACHE_TAG)})}
export async function reorderUrgentTasks(ids:string[]):Promise<ActionResult>{return toResult(async()=>{const {db}=await context();const {error}=await db.rpc('reorder_urgent_tasks',{p_task_ids:ids});if(error)throw new Error('紧急任务排序保存失败');revalidatePath('/admin/tasks');revalidatePath('/urgent')})}
export async function reorderDailyTasks(ids:string[]):Promise<ActionResult>{return toResult(async()=>{const {db}=await context();const {error}=await db.rpc('reorder_daily_tasks',{p_task_ids:ids});if(error)throw new Error('日常任务排序保存失败');revalidateTag(DAILY_TASKS_CACHE_TAG)})}
export async function setTaskStatus(id:string,status:'published'|'offline'):Promise<ActionResult>{return toResult(async()=>{const {db}=await context();const {error}=await db.from('tasks').update({status,publish_at:null}).eq('id',id);if(error)throw new Error('任务状态更新失败');revalidatePath('/admin/tasks');revalidatePath('/urgent');revalidatePath('/daily');revalidatePath(`/tasks/${id}`);revalidateTag(TASK_DETAIL_CACHE_TAG)})}
export async function unpinTask(id:string):Promise<ActionResult>{return toResult(async()=>{const {db}=await context();const {error}=await db.from('tasks').update({is_pinned:false,pin_starts_at:null,pin_ends_at:null}).eq('id',id);if(error)throw new Error('取消置顶失败');revalidatePath('/admin/tasks');revalidatePath('/urgent');revalidateTag(DAILY_TASKS_CACHE_TAG)})}
export async function renameTask(id:string,title:string):Promise<ActionResult>{return toResult(async()=>{if(!title.trim())throw new Error('任务标题不能为空');const {db}=await context();const {error}=await db.from('tasks').update({title:title.trim()}).eq('id',id);if(error)throw new Error('任务更新失败');revalidatePath('/admin/tasks');revalidatePath('/urgent');revalidatePath('/daily');revalidatePath(`/tasks/${id}`);revalidateTag(TASK_DETAIL_CACHE_TAG)})}
export async function deleteTask(id:string):Promise<ActionResult>{return toResult(async()=>{const {db}=await context();const {error}=await db.from('tasks').delete().eq('id',id);if(error)throw new Error('任务删除失败');revalidatePath('/admin/tasks');revalidatePath('/urgent');revalidatePath('/daily');revalidatePath(`/tasks/${id}`);revalidateTag(TASK_DETAIL_CACHE_TAG)})}
export async function duplicateTask(id:string):Promise<ActionResult>{return toResult(async()=>{const {db,userId}=await context();const {data,error}=await db.from('tasks').select('*').eq('id',id).single();if(error||!data)throw new Error('复制失败');const {id:_id,created_at:_created,updated_at:_updated,...copy}=data;void _id;void _created;void _updated;const result=await db.from('tasks').insert({...copy,title:`${copy.title}（副本）`,status:'draft',publish_at:null,pin_starts_at:null,pin_ends_at:null,created_by:userId});if(result.error)throw new Error('复制失败');revalidatePath('/admin/tasks')})}
type Domain='quick_links'|'text_templates'|'media_items'|'guides';
export async function deleteContent(domain:Domain,id:string):Promise<ActionResult>{return toResult(async()=>{const {db}=await context();const {error}=await db.from(domain).delete().eq('id',id);if(error)throw new Error('删除失败');revalidatePath('/admin');revalidatePath('/guide');revalidatePath('/guide/tools');revalidatePath('/media')})}
export async function updateContent(domain:Domain,id:string,values:Record<string,unknown>):Promise<ActionResult>{return toResult(async()=>{for(const key of ['external_url','cover_url'])if(typeof values[key]==='string')requireSafeWebUrl(values[key] as string,key,key==='cover_url');const {db}=await context();const {error}=await db.from(domain).update(values).eq('id',id);if(error)throw new Error('更新失败');revalidatePath('/admin');revalidatePath('/guide');revalidatePath('/guide/tools');revalidatePath('/media')})}
export async function createContent(domain:Domain,values:Record<string,unknown>):Promise<ActionResult>{return toResult(async()=>{for(const key of ['external_url','cover_url'])if(typeof values[key]==='string')requireSafeWebUrl(values[key] as string,key,key==='cover_url');const {db}=await context();const {error}=await db.from(domain).insert(values);if(error)throw new Error('新增失败');revalidatePath('/admin');revalidatePath('/guide');revalidatePath('/guide/tools');revalidatePath('/media')})}
export async function saveVisualSetting(values:{module_key:string;background_url:string;use_custom_background:boolean;background_position:string;background_size:string;overlay_opacity:number;decorative_text:string;show_decorative_text:boolean}):Promise<ActionResult>{return toResult(async()=>{requireSafeWebUrl(values.background_url,'背景图片',true);const {db}=await context();const {error}=await db.from('visual_settings').upsert(values,{onConflict:'module_key'});if(error)throw new Error('视觉设置保存失败');revalidatePath('/admin/visual-settings');revalidatePath('/urgent');revalidatePath('/daily');revalidatePath('/media');revalidatePath('/guide')})}
