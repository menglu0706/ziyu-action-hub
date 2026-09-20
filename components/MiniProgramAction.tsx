'use client';
import {useState} from 'react';

async function copyText(value:string){
  try{
    await navigator.clipboard.writeText(value);
  }catch{
    const input=document.createElement('textarea');
    input.value=value;
    input.style.position='fixed';
    input.style.opacity='0';
    document.body.appendChild(input);
    input.select();
    const copied=document.execCommand('copy');
    input.remove();
    if(!copied)throw new Error('复制失败');
  }
}

export function MiniProgramAction({token,className=''}:{token:string;className?:string}){
  const [copied,setCopied]=useState(false),[failed,setFailed]=useState(false);
  const copy=async()=>{try{await copyText(token);setCopied(true);setFailed(false)}catch{setFailed(true);setCopied(false)}};
  return <div className={className}><button type="button" className="primary py-2.5" onClick={copy}>{copied?'已复制 ✓':'复制小程序口令'}</button><p className={`mb-0 mt-2 text-center text-xs ${failed?'text-red-500':'text-[#7890a6]'}`}>{failed?'复制失败，请重试':'请粘贴到微信聊天中打开小程序'}</p></div>;
}
