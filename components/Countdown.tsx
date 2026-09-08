'use client';
import {useEffect,useState} from 'react';
const remaining=(deadline:string)=>new Date(deadline).getTime()-Date.now();

export function Countdown({deadline}:{deadline:string}){
  const [left,setLeft]=useState(()=>remaining(deadline));
  useEffect(()=>{setLeft(remaining(deadline));const id=setInterval(()=>setLeft(remaining(deadline)),1000);return()=>clearInterval(id)},[deadline]);
  if(left<=0)return <span suppressHydrationWarning>已截止</span>;
  const h=Math.floor(left/3600000),m=Math.floor(left/60000)%60,s=Math.floor(left/1000)%60;
  return <span suppressHydrationWarning>{[h,m,s].map(n=>String(n).padStart(2,'0')).join(':')}</span>;
}
