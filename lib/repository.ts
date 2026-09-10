import {unstable_cache} from 'next/cache';
import {createPublicClient} from '@/lib/supabase/public';
import {createClient} from '@/lib/supabase/server';
import type {Category,Guide,MediaItem,QuickLink,Task,TextTemplate,VisualSetting} from './types';

export class ContentDataError extends Error{constructor(){super('内容暂时无法加载，请稍后重试。')}}
type TaskRow={id:string;title:string;description:string|null;category:string;platform:string|null;external_url:string;quick_instruction:string;urgency_score:number;required_score:number;estimated_minutes:number;deadline:string|null;created_at:string;is_pinned:boolean;show_in_daily:boolean;is_multi_account:boolean;completion_mode:'one_time'|'daily';sort_order:number;task_steps?:{step_number:number;content:string}[]};
const mapTask=(row:TaskRow):Task=>({id:row.id,title:row.title,description:row.description??'',category:row.category as Category,platform:row.platform??'',url:row.external_url,quick:row.quick_instruction,urgency:row.urgency_score,required:row.required_score,minutes:row.estimated_minutes,deadline:row.deadline,createdAt:row.created_at,pinned:row.is_pinned,daily:row.show_in_daily,multi:row.is_multi_account,completionMode:row.completion_mode,progress:0,goal:null,steps:[...(row.task_steps??[])].sort((a,b)=>a.step_number-b.step_number).map(x=>x.content)});
type VisualSettingRow={id:string;module_key:string;use_custom_background:boolean;background_url:string|null;background_position:string;background_size:string;overlay_opacity:number|string;decorative_text:string|null;show_decorative_text:boolean};
const mapVisualSetting=(row:VisualSettingRow):VisualSetting=>({id:row.id,module:row.module_key,enabled:row.use_custom_background,imageUrl:row.background_url??'',position:row.background_position,size:row.background_size,overlay:Number(row.overlay_opacity),decorativeText:row.decorative_text??'',textEnabled:row.show_decorative_text});
type GuideRow={id:string;guide_type:'tip'|'guide'|'faq';title:string;summary:string|null;content:string;category:string|null};
type QuickLinkRow={id:string;title:string;platform:string|null;external_url:string;icon_key:string|null;sort_order:number;is_enabled:boolean};
type TemplateRow={id:string;title:string;template_type:string;content:string;is_pinned_today:boolean;sort_order:number;is_enabled:boolean};
type MediaRow={id:string;title:string;category:string;published_at:string;cover_url:string|null;external_url:string;is_new:boolean;is_enabled:boolean};
async function run<T>(query:PromiseLike<{data:T|null;error:unknown}>){const {data,error}=await query;if(error)throw new ContentDataError();return data}
const taskCacheOptions={revalidate:5} as const;
const publicCacheOptions={revalidate:30} as const;

const getCachedTasks=unstable_cache(async()=>{const db=createPublicClient();const rows=await run(db.from('tasks').select('*,task_steps(step_number,content)').eq('status','published').order('is_pinned',{ascending:false}).order('deadline',{ascending:true,nullsFirst:false}).order('urgency_score',{ascending:false}).order('required_score',{ascending:false}).order('sort_order'));return (rows??[]).map(row=>mapTask(row as TaskRow))},['public-tasks'],taskCacheOptions);
const getCachedTask=unstable_cache(async(id:string)=>{const db=createPublicClient();const row=await run(db.from('tasks').select('*,task_steps(step_number,content)').eq('id',id).eq('status','published').maybeSingle());return row?mapTask(row as TaskRow):undefined},['public-task'],taskCacheOptions);
const getCachedGuides=unstable_cache(async()=>{const db=createPublicClient();const rows=await run(db.from('guides').select('*').eq('status','published').order('sort_order'));return ((rows??[]) as GuideRow[]).map(r=>({id:r.id,type:r.guide_type,title:r.title,summary:r.summary??'',body:r.content,category:r.category??''}))},['public-guides'],publicCacheOptions);
const getCachedMedia=unstable_cache(async()=>{const db=createPublicClient();const rows=await run(db.from('media_items').select('*').eq('is_enabled',true).order('published_at',{ascending:false}));return ((rows??[]) as MediaRow[]).map(r=>({id:r.id,title:r.title,category:r.category,publishedAt:r.published_at,coverUrl:r.cover_url??'',url:r.external_url,isNew:r.is_new,enabled:r.is_enabled}))},['public-media'],publicCacheOptions);
const getCachedVisualSetting=unstable_cache(async(module:string)=>{const db=createPublicClient();const result=await run(db.from('visual_settings').select('*').eq('module_key',module).maybeSingle());const row=result as VisualSettingRow|null;return row?mapVisualSetting(row):undefined},['public-visual-setting'],publicCacheOptions);

async function getQuickLinks(){const db=await createClient();const rows=await run(db.from('quick_links').select('*').eq('is_enabled',true).order('sort_order'));return ((rows??[]) as QuickLinkRow[]).map(r=>({id:r.id,title:r.title,platform:r.platform??'',url:r.external_url,icon:r.icon_key??'↗',sortOrder:r.sort_order,enabled:r.is_enabled}))}
async function getTemplates(){const db=await createClient();const rows=await run(db.from('text_templates').select('*').eq('is_enabled',true).order('is_pinned_today',{ascending:false}).order('sort_order'));return ((rows??[]) as TemplateRow[]).map(r=>({id:r.id,title:r.title,type:r.template_type,content:r.content,pinned:r.is_pinned_today,sortOrder:r.sort_order,enabled:r.is_enabled}))}

export interface ActionHubRepository{getTasks():Promise<Task[]>;getTask(id:string):Promise<Task|undefined>;getGuides():Promise<Guide[]>;getQuickLinks():Promise<QuickLink[]>;getTemplates():Promise<TextTemplate[]>;getMedia():Promise<MediaItem[]>;getVisualSetting(module:string):Promise<VisualSetting|undefined>}
export const repository:ActionHubRepository={
 getTasks:getCachedTasks,
 getTask:getCachedTask,
 getGuides:getCachedGuides,
 getQuickLinks,
 getTemplates,
 getMedia:getCachedMedia,
 getVisualSetting:getCachedVisualSetting
};
