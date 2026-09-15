'use client';
import {useEffect,useRef,useState,useTransition} from 'react';
import {adjustTaskProgress} from '@/app/user-actions';

export function ProgressControl({taskId,initial,goal}:{taskId:string;initial:number;goal:number}){
  const [n,setN]=useState(initial),[error,setError]=useState('');const [pending,start]=useTransition();const confirmed=useRef(initial),busy=useRef(false);
  useEffect(()=>{if(!busy.current){confirmed.current=initial;setN(initial)}},[initial]);
  const adjust=(delta:-1|1)=>{if(busy.current)return;const previous=confirmed.current,next=Math.min(goal,Math.max(0,previous+delta));if(next===previous)return;busy.current=true;setN(next);setError('');start(async()=>{try{const saved=await adjustTaskProgress(taskId,delta);confirmed.current=saved;setN(saved)}catch{setN(previous);setError('进度保存失败，请重试')}finally{busy.current=false}})};
  return <div><div className="flex items-center gap-3"><button disabled={pending||n<=0} onClick={()=>adjust(-1)} className="h-9 w-9 rounded-full border border-[#dbeaf4] bg-white text-lg disabled:opacity-50">−</button><b className="min-w-14 text-center">{n} / {goal}</b><button disabled={pending||n>=goal} onClick={()=>adjust(1)} className="h-9 w-9 rounded-full border-0 bg-[#eaf5fc] text-[#3785cc] text-lg disabled:opacity-50">＋</button></div>{error&&<p className="mb-0 mt-1 text-right text-[11px] text-[#d75454]" role="status">{error}</p>}</div>;
}
