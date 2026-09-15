'use client';
import {useEffect,useState} from 'react';
const remaining=(deadline:string)=>new Date(deadline).getTime()-Date.now();

export function Countdown({deadline,onExpire}:{deadline:string;compact?:boolean;onExpire?:()=>void}){
  const [left,setLeft]=useState(()=>remaining(deadline));
  useEffect(()=>{let notified=false;const update=()=>{const value=remaining(deadline);setLeft(value);if(value<=0&&!notified){notified=true;onExpire?.()}};update();const id=setInterval(update,1000);return()=>clearInterval(id)},[deadline,onExpire]);
  if(left<=0)return <span suppressHydrationWarning>已截止</span>;
  const seconds=Math.floor(left/1000),days=Math.floor(seconds/86400),hours=Math.floor(seconds/3600)%24,minutes=Math.floor(seconds/60)%60,secs=seconds%60;
  const clock=[hours,minutes,secs].map(value=>String(value).padStart(2,'0')).join(':');
  const value=days>0?`${days}天 ${clock}`:seconds>=3600?clock:`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  return <span suppressHydrationWarning>⏱ {value}</span>;
}
