'use client';
import {useEffect,useState} from 'react';
const remaining=(deadline:string)=>new Date(deadline).getTime()-Date.now();

export function Countdown({deadline,compact=false,onExpire}:{deadline:string;compact?:boolean;onExpire?:()=>void}){
  const [left,setLeft]=useState(()=>remaining(deadline));
  useEffect(()=>{let notified=false;const update=()=>{const value=remaining(deadline);setLeft(value);if(value<=0&&!notified){notified=true;onExpire?.()}};update();const id=setInterval(update,1000);return()=>clearInterval(id)},[deadline,onExpire]);
  if(left<=0)return <span suppressHydrationWarning>已截止</span>;
  const days=Math.floor(left/86400000),h=Math.floor(left/3600000)%24,m=Math.max(1,Math.ceil(left/60000)%60),s=Math.floor(left/1000)%60;
  if(compact)return <span suppressHydrationWarning>剩余 {days?`${days}天${h}小时`:Math.floor(left/3600000)?`${Math.floor(left/3600000)}小时${m}分钟`:`${Math.ceil(left/60000)}分钟`}</span>;
  return <span suppressHydrationWarning>{[h,m,s].map(n=>String(n).padStart(2,'0')).join(':')}</span>;
}
