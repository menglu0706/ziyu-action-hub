import {createClient} from '@/lib/supabase/server';
import type {AdminTask,GuideRecord,MediaRecord,QuickLink,TextTemplate} from './admin-mock';
import type {VisualSetting} from './types';

export type AdminDashboardStats={todayVisits:number;currentUrgentTasks:number};
export type AdminTopTaskClick={buttonKey:string;title:string|null;clickCount:number};
export type AdminButtonClickStats={navClicks:Record<string,number>;topTaskClicks:AdminTopTaskClick[]};
export type AdminWatcherItem={postId:string;uid:string;kind:string;status:string;reason:string|null;title:string|null;taskId:string|null;createdAt:string};
export type AdminWatcherStatus={enabled:boolean;failing:boolean;lastScanAt:string|null;lastScanOk:boolean|null;lastError:string|null;lastOkAt:string|null;recent:AdminWatcherItem[]};
export type AdminInitialData={watcher?:AdminWatcherStatus|null;tasks:AdminTask[];links:QuickLink[];templates:TextTemplate[];media:MediaRecord[];guides:GuideRecord[];visual:VisualSetting[];stats:AdminDashboardStats|null;buttonClicks:AdminButtonClickStats|null;error?:string};
export type AdminDataScope='dashboard'|'task-new'|'tasks'|'links'|'templates'|'media'|'guides'|'visual'|'none';
const urgencyLabel=(score:number)=>score>=90?'紧急':score>=70?'重要':score>=40?'普通':'低';
const requiredLabel=(score:number)=>score>=90?'必做':score>=65?'建议':score>=35?'可做':'不推荐';
const statusLabel=(status:string):AdminTask['status']=>status==='published'?'上线':status==='offline'?'下线':'草稿';

export async function getAdminInitialData(scope:AdminDataScope='tasks',client?:Awaited<ReturnType<typeof createClient>>):Promise<AdminInitialData>{
  const db=client??await createClient();
  const empty=()=>Promise.resolve({data:[],error:null});
  const emptyStats=()=>Promise.resolve({data:null,error:null});
  const tasksQuery=scope==='dashboard'||scope==='task-new'||scope==='tasks'?db.from('tasks').select('*').order('is_pinned',{ascending:false}).order('urgent_sort_position',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false}):null;
  const [tasksResult,linksResult,templatesResult,mediaResult,guidesResult,visualResult,statsResult,buttonClicksResult]=await Promise.all([
    tasksQuery?(scope==='tasks'?tasksQuery:tasksQuery.limit(5)):empty(),
    scope==='links'?db.from('quick_links').select('*').order('sort_order'):empty(),
    scope==='templates'?db.from('text_templates').select('*').order('sort_order'):empty(),
    scope==='media'?db.from('media_items').select('*').order('published_at',{ascending:false}):empty(),
    scope==='guides'?db.from('guides').select('*').order('sort_order'):empty(),
    scope==='visual'?db.from('visual_settings').select('*').order('module_key'):empty(),
    scope==='dashboard'?db.rpc('get_admin_dashboard_stats'):emptyStats(),
    scope==='dashboard'?db.rpc('get_button_click_stats'):emptyStats()
  ]);
  const watcher=scope==='dashboard'?await getWatcherStatus(db):null;
  if(tasksResult.error||linksResult.error||templatesResult.error||mediaResult.error||guidesResult.error||visualResult.error)return {tasks:[],links:[],templates:[],media:[],guides:[],visual:[],stats:null,buttonClicks:null,error:'数据加载失败，请检查数据库迁移后重试。'};
  const statsRow=Array.isArray(statsResult.data)?statsResult.data[0]:statsResult.data;
  const clickStats=buttonClicksResult.data as {navClicks?:Record<string,unknown>;topTaskClicks?:{button_key:unknown;title:unknown;click_count:unknown}[]}|null;
  return {
    watcher,
    tasks:(tasksResult.data??[]).map((r,i)=>({id:r.id,title:r.title,category:r.category,platform:r.platform??'',urgency:urgencyLabel(r.urgency_score),required:requiredLabel(r.required_score),minutes:r.estimated_minutes,deadline:r.deadline?new Date(r.deadline).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—',status:statusLabel(r.status),url:r.external_url,quick:r.quick_instruction,description:r.description??'',recommendedCopy:r.recommended_copy??'',rawDeadline:r.deadline,audience:r.audience,pinned:r.is_pinned,urgentVisible:r.show_in_urgent,daily:r.show_in_daily,dailyGroup:r.daily_group,source:r.source??'manual',push:r.push_reserved,urgentSortPosition:r.urgent_sort_position??null,dailySortPosition:r.daily_sort_position??null,publishAt:r.publish_at??null,pinStartsAt:r.pin_starts_at??null,pinEndsAt:r.pin_ends_at??null,_sort:i} as AdminTask & {_sort:number})),
    links:(linksResult.data??[]).map(r=>({id:r.id,name:r.title,platform:r.platform??'',url:r.external_url,icon:r.icon_key??'↗',order:r.sort_order,enabled:r.is_enabled})),
    templates:(templatesResult.data??[]).map(r=>({id:r.id,title:r.title,type:r.template_type,body:r.content,pinned:r.is_pinned_today,order:r.sort_order,enabled:r.is_enabled})),
    media:(mediaResult.data??[]).map(r=>({id:r.id,title:r.title,category:r.category,date:r.published_at.slice(0,10),publishedAt:r.published_at,cover:r.cover_url??'',url:r.external_url,isNew:r.is_new,enabled:r.is_enabled})),
    guides:(guidesResult.data??[]).map(r=>({id:r.id,title:r.title,summary:r.summary??'',body:r.content,category:r.category??'',guideType:r.guide_type as GuideRecord['guideType'],order:r.sort_order,status:statusLabel(r.status),rawStatus:r.status as GuideRecord['rawStatus']})),
    visual:(visualResult.data??[]).map(r=>({id:r.id,module:r.module_key,enabled:r.use_custom_background,imageUrl:r.background_url??'',position:r.background_position,size:r.background_size,overlay:Number(r.overlay_opacity),decorativeText:r.decorative_text??'',textEnabled:r.show_decorative_text})),
    stats:statsRow?{todayVisits:Number(statsRow.today_visits),currentUrgentTasks:Number(statsRow.current_urgent_tasks)}:null,
    buttonClicks:clickStats?{
      navClicks:Object.fromEntries(Object.entries(clickStats.navClicks??{}).map(([k,v])=>[k,Number(v)])),
      topTaskClicks:(clickStats.topTaskClicks??[]).map(r=>({buttonKey:String(r.button_key),title:r.title==null?null:String(r.title),clickCount:Number(r.click_count)}))
    }:null,
    error:statsResult.error?'统计数据加载失败，请稍后重试。':undefined
  };
}

// Weibo watcher status for the dashboard. Returns null (card hidden) until migration 017 exists.
async function getWatcherStatus(db:Awaited<ReturnType<typeof createClient>>):Promise<AdminWatcherStatus|null>{
  const [settings,last,lastOk,recent]=await Promise.all([
    db.from('weibo_watcher_settings').select('enabled,failing').maybeSingle(),
    db.from('weibo_scan_log').select('scanned_at,ok,error').order('scanned_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('weibo_scan_log').select('scanned_at').eq('ok',true).order('scanned_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('weibo_ingest').select('post_id,uid,kind,status,reason,title,task_id,created_at').order('created_at',{ascending:false}).limit(10)
  ]);
  if(settings.error||!settings.data)return null;
  return {
    enabled:settings.data.enabled,failing:settings.data.failing,
    lastScanAt:last.data?.scanned_at??null,lastScanOk:last.data?.ok??null,lastError:last.data?.ok?null:last.data?.error??null,lastOkAt:lastOk.data?.scanned_at??null,
    recent:(recent.data??[]).map(r=>({postId:r.post_id,uid:r.uid,kind:r.kind,status:r.status,reason:r.reason,title:r.title,taskId:r.task_id,createdAt:r.created_at}))
  };
}
