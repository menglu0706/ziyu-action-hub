import {createClient} from '@/lib/supabase/server';
import type {AdminTask,GuideRecord,MediaRecord,QuickLink,TextTemplate} from './admin-mock';
import type {VisualSetting} from './types';

export type AdminInitialData={tasks:AdminTask[];links:QuickLink[];templates:TextTemplate[];media:MediaRecord[];guides:GuideRecord[];visual:VisualSetting[];error?:string};
const urgencyLabel=(score:number)=>score>=90?'紧急':score>=70?'重要':score>=40?'普通':'低';
const requiredLabel=(score:number)=>score>=90?'必做':score>=65?'建议':score>=35?'可做':'不推荐';
const statusLabel=(status:string):AdminTask['status']=>status==='published'?'上线':status==='offline'?'下线':'草稿';

export async function getAdminInitialData():Promise<AdminInitialData>{
  const db=await createClient();
  const [tasksResult,linksResult,templatesResult,mediaResult,guidesResult,visualResult]=await Promise.all([
    db.from('tasks').select('*').order('sort_order'),db.from('quick_links').select('*').order('sort_order'),db.from('text_templates').select('*').order('sort_order'),db.from('media_items').select('*').order('published_at',{ascending:false}),db.from('guides').select('*').order('sort_order'),db.from('visual_settings').select('*').order('module_key')
  ]);
  if(tasksResult.error||linksResult.error||templatesResult.error||mediaResult.error||guidesResult.error||visualResult.error)return {tasks:[],links:[],templates:[],media:[],guides:[],visual:[],error:'数据加载失败，请检查数据库迁移后重试。'};
  return {
    tasks:(tasksResult.data??[]).map((r,i)=>({id:r.id,title:r.title,category:r.category,urgency:urgencyLabel(r.urgency_score),required:requiredLabel(r.required_score),minutes:r.estimated_minutes,deadline:r.deadline?new Date(r.deadline).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—',status:statusLabel(r.status),url:r.external_url,quick:r.quick_instruction,description:r.description??'',rawDeadline:r.deadline,audience:r.audience,pinned:r.is_pinned,daily:r.show_in_daily,multi:r.is_multi_account,history:r.count_completion,leader:r.leaderboard_enabled,push:r.push_reserved,_sort:i} as AdminTask & {_sort:number})),
    links:(linksResult.data??[]).map(r=>({id:r.id,name:r.title,platform:r.platform??'',url:r.external_url,icon:r.icon_key??'↗',order:r.sort_order,enabled:r.is_enabled})),
    templates:(templatesResult.data??[]).map(r=>({id:r.id,title:r.title,type:r.template_type,body:r.content,pinned:r.is_pinned_today,order:r.sort_order,enabled:r.is_enabled})),
    media:(mediaResult.data??[]).map(r=>({id:r.id,title:r.title,category:r.category,date:r.published_at.slice(0,10),publishedAt:r.published_at,cover:r.cover_url??'',url:r.external_url,isNew:r.is_new,enabled:r.is_enabled})),
    guides:(guidesResult.data??[]).map(r=>({id:r.id,title:r.title,summary:r.summary??'',body:r.content,category:r.category??'',guideType:r.guide_type as GuideRecord['guideType'],order:r.sort_order,status:statusLabel(r.status),rawStatus:r.status as GuideRecord['rawStatus']})),
    visual:(visualResult.data??[]).map(r=>({id:r.id,module:r.module_key,enabled:r.use_custom_background,imageUrl:r.background_url??'',position:r.background_position,size:r.background_size,overlay:Number(r.overlay_opacity),decorativeText:r.decorative_text??'',textEnabled:r.show_decorative_text}))
  };
}
