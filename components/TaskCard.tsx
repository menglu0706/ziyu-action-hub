'use client';
import Link from 'next/link';
import type {ReactNode} from 'react';
import {useCallback,useState} from 'react';
import type {Task} from '@/lib/types';
import {CopyButton} from './CopyButton';
import {Countdown} from './Countdown';
import {ProgressControl} from './ProgressControl';

export function TaskCard({task,dominant=false,urgent=false,viewerSlot}:{task:Task;dominant?:boolean;urgent?:boolean;viewerSlot?:ReactNode}){
  const [expired,setExpired]=useState(false);const expire=useCallback(()=>setExpired(true),[]);
  if(urgent&&expired)return null;
  const progress=viewerSlot!==undefined?viewerSlot:task.multi&&<div className="mt-4 flex items-center justify-between"><span className="text-xs font-bold text-[#7890a6]">多账号进度</span>{typeof task.goal==='number'?<ProgressControl taskId={task.id} initial={task.progress} goal={task.goal}/>:<Link href="/me/account" className="text-xs text-[#438bd1]">请先设置账号数量</Link>}</div>;
  return <article className={`card ${dominant?'p-5':'p-4'} relative overflow-hidden`}><div className="flex items-start justify-between gap-3"><div><p className="m-0 text-xs font-bold text-[#5994c4]">{task.platform}</p><h3 className={`${dominant?'text-[22px]':'text-[17px]'} my-1 font-extrabold tracking-tight`}>{task.title}</h3>{task.deadline&&<span className="inline-flex rounded-full bg-[#fff0f0] px-2 py-1 text-[11px] font-bold text-[#d75454]"><Countdown deadline={task.deadline} compact onExpire={expire}/></span>}</div>{task.pinned&&<span className="tag gold">置顶</span>}</div><div className="my-3 flex flex-wrap gap-2"><span className="tag">{task.category}</span><span className="tag red">{task.urgency>90?'紧急':'重要'}</span><span className="tag gold">{task.required>90?'必做':'建议'}</span><span className="tag">约{task.minutes}分钟</span></div><p className={`text-sm leading-6 text-[#627c94] ${dominant?'line-clamp-2':''}`}>{task.quick}</p>{task.recommendedCopy&&<div className="my-3 rounded-xl bg-[#eef7fc] p-3"><div className="mb-1 flex items-center justify-between"><b className="text-xs">推荐文案</b><CopyButton text={task.recommendedCopy}/></div><p className="m-0 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-[#59738b]">{task.recommendedCopy}</p></div>}{(dominant||urgent)&&<Link className="primary" href={task.url} target="_blank">立即前往 <span className="ml-2">↗</span></Link>}<Link href={`/tasks/${task.id}`} className={`${dominant?'mt-3 block text-center':'mt-2 inline-block'} text-sm font-bold text-[#438bd1] no-underline`}>{dominant?'查看任务详情 →':'查看任务 →'}</Link>{(dominant||urgent)&&progress}</article>;
}
