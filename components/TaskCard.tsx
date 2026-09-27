'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import type {Task} from '@/lib/types';
import {CopyButton} from './CopyButton';
import {FormattedText} from './FormattedText';
import {HEAT_TRENDING_SUFFIX,heatDisplayText} from '@/lib/heat';
import {Countdown} from './Countdown';
import {ExternalLink} from './ExternalLink';
import {MiniProgramAction} from './MiniProgramAction';
import {externalWebHref,isWechatMiniProgramToken} from '@/lib/url';
import {trackClick} from '@/lib/trackClick';
import {isTaskFolded,toggleTaskFolded} from '@/lib/foldedTasks';

// heat: a 加热 card, which shows the post's own instruction (its description) instead of 一句话最快做法.
// Text the watcher wrote (task.autoText) is shown formatted.
// number: the card's place in a numbered list (/heat), shown before the title.
export function TaskCard({task,dominant=false,urgent=false,directAction=false,heat=false,number}:{task:Task;dominant?:boolean;urgent?:boolean;directAction?:boolean;heat?:boolean;number?:number}){
  const [expired,setExpired]=useState(()=>Boolean(task.deadline&&new Date(task.deadline).getTime()<=Date.now()));const expire=useCallback(()=>setExpired(true),[]);
  const [folded,setFolded]=useState(false);
  useEffect(()=>{setFolded(isTaskFolded(task.id))},[task.id]);
  const toggleFold=()=>setFolded(toggleTaskFolded(task.id));
  if(urgent&&expired)return null;
  const miniProgramToken=isWechatMiniProgramToken(task.url)?task.url:null,targetHref=externalWebHref(task.url),showAction=(dominant||urgent||directAction)&&!expired;
  if(folded)return <article className="card p-3 flex items-center gap-3"><button type="button" onClick={toggleFold} aria-label="展开任务" className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left"><span className="text-[#8fae66]">✓</span><b className="min-w-0 flex-1 truncate text-sm font-bold text-[#a3b4c4] line-through">{task.title}</b><span className="shrink-0 text-xs font-bold text-[#438bd1]">展开 ⌄</span></button></article>;
  return <article className={`card ${dominant?'p-5':'p-4'} relative overflow-hidden`}><div className="flex items-start justify-between gap-3"><div>{task.platform&&<p className="m-0 text-xs font-bold text-[#5994c4]">{task.platform}</p>}<h3 className={`${dominant?'text-xl':'text-base'} my-1 font-extrabold tracking-tight`}>{number!==undefined&&<span className="mr-1.5 inline-grid h-6 min-w-6 place-items-center rounded-full bg-[#4e94dc] px-1.5 align-[2px] text-xs font-black text-white">{number}</span>}{heat&&task.title.endsWith(HEAT_TRENDING_SUFFIX)?<>{task.title.slice(0,-HEAT_TRENDING_SUFFIX.length)}<span className="ml-1.5 inline-block rounded-full bg-[#ee6b6b] px-2 py-0.5 align-[2px] text-xs font-black text-white">🔥 热搜</span></>:task.title}</h3>{task.deadline&&<span className="inline-flex rounded-full bg-[#fff0f0] px-2 py-1 text-[11px] font-bold text-[#d75454]"><Countdown deadline={task.deadline} compact onExpire={expire}/></span>}</div><div className="flex items-center gap-2">{task.pinned&&<span className="tag gold">置顶</span>}<button type="button" onClick={toggleFold} aria-label="折叠任务（已完成）" className="border-0 bg-transparent p-0 text-lg leading-none text-[#a9bccf]">⌃</button></div></div><div className="my-2.5 flex flex-wrap gap-2"><span className="tag">{task.category}</span><span className="tag red">{task.urgency>90?'紧急':'重要'}</span><span className="tag gold">{task.required>90?'必做':'建议'}</span><span className="tag">约{task.minutes}分钟</span></div>{heat&&task.description?<FormattedText text={task.autoText?heatDisplayText(task.description):task.description} className="my-2 line-clamp-4 text-sm leading-6 text-[#627c94]"/>:task.autoText?<FormattedText text={task.quick} className={`my-2 text-sm leading-6 text-[#627c94] ${dominant?'line-clamp-2':''}`}/>:<p className={`my-2 text-sm leading-6 text-[#627c94] ${dominant?'line-clamp-2':''}`}>{task.quick}</p>}{task.recommendedCopy&&<div className="my-2.5 rounded-xl bg-[#eef7fc] p-3"><div className="mb-1 flex items-center justify-between"><b className="text-xs">推荐文案</b><CopyButton text={task.recommendedCopy}/></div><p className="m-0 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-[#59738b]">{task.recommendedCopy}</p></div>}{showAction&&miniProgramToken?<MiniProgramAction token={miniProgramToken} onClick={()=>trackClick(`task_cta:${task.id}`)}/>:showAction&&targetHref?<ExternalLink className="primary py-2.5" href={targetHref} onClick={()=>trackClick(`task_cta:${task.id}`)}>立即前往 <span className="ml-2">↗</span></ExternalLink>:null}<Link href={`/tasks/${task.id}`} prefetch={false} className={`${dominant||directAction?'mt-2.5 block text-center':'mt-2 inline-block'} text-sm font-bold text-[#438bd1] no-underline`}>{dominant||directAction?'查看任务详情 →':'查看任务 →'}</Link></article>;
}
