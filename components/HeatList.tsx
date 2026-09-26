'use client';
import {useEffect,useState} from 'react';
import {groupHeatTasks} from '@/lib/heatList';
import type {Task} from '@/lib/types';
import {TaskCard} from './TaskCard';

const GROUP_TITLES={红膏:'🔥 红膏加热',空瓶:'🈳 速来空瓶'} as const;
const endsAt=(task:Task)=>task.deadline?new Date(task.deadline).getTime():Infinity;

// The 加热 cards, grouped 红膏 then 空瓶 when both are present and numbered 1, 2, 3 … down the page.
// Cards past their deadline drop out as they expire, and the rest are renumbered, so the numbers
// never skip.
export function HeatList({tasks}:{tasks:Task[]}){
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    const next=Math.min(...tasks.map(endsAt).filter(time=>time>now));
    if(!Number.isFinite(next))return;
    const timer=setTimeout(()=>setNow(Date.now()),Math.min(next-Date.now()+50,2**31-1));
    return()=>clearTimeout(timer);
  },[tasks,now]);
  const live=tasks.filter(task=>endsAt(task)>now);
  if(!live.length)return <div className="card p-5 text-sm text-[#7890a6]">暂无加热任务</div>;
  const groups=groupHeatTasks(live),offsets=groups.map((_,i)=>groups.slice(0,i).reduce((sum,group)=>sum+group.tasks.length,0));
  return <>{groups.map((group,g)=><section key={group.kind??'all'} className="mb-5">{group.kind&&<h2 className="section-title mb-2">{GROUP_TITLES[group.kind]} <span className="ml-1 text-xs font-medium text-[#7890a6]">{group.tasks.length} 条</span></h2>}<div className="space-y-3">{group.tasks.map((task,i)=><TaskCard key={task.id} task={task} urgent heat number={offsets[g]+i+1}/>)}</div></section>)}</>;
}
