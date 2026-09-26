import {Fragment,type ReactNode} from 'react';
import {HEAT_NOTICE} from '@/lib/heat';

// A 加热 task's description, formatted for reading at a glance: the 先转发扩散再加热 notice in bold
// red, #话题# and @mentions in blue, goals (3000👍, 万赞, 1k🧱) in bold. Line breaks are kept.
const TOKENS=/(#[^#\n]+#|@[\w一-龥-]+|\d+(?:\.\d+)?\s*[kKwW万千]?\s*(?:👍🏻|👍|赞|转|评|🧱|🍎)|[万千]\s*(?:👍|赞|转|评))/gu;

function formatLine(line:string){
  const parts:ReactNode[]=[];let last=0;
  for(const match of line.matchAll(TOKENS)){
    const token=match[0],index=match.index??0;
    if(index>last)parts.push(line.slice(last,index));
    parts.push(token.startsWith('#')||token.startsWith('@')?<span key={index} className="font-semibold text-[#3f86cc]">{token}</span>:<b key={index} className="text-[#18345a]">{token}</b>);
    last=index+token.length;
  }
  if(last<line.length)parts.push(line.slice(last));
  return parts;
}

export function HeatDescription({text,className=''}:{text:string;className?:string}){
  const lines=text.split('\n');
  return <p className={`whitespace-pre-wrap ${className}`}>{lines.map((line,i)=><Fragment key={i}>{i>0&&'\n'}{line.trim()===HEAT_NOTICE?<b className="text-[#d75454]">{line}</b>:formatLine(line)}</Fragment>)}</p>;
}
