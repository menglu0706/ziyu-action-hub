import {Fragment,type ReactNode} from 'react';
import {HEAT_NOTICE} from '@/lib/heat';

// Text the weibo-watcher wrote (加热 descriptions, auto tasks, the 打榜 list it copies into the
// music task), formatted for reading at a glance: the 先转发扩散再加热 notice in bold red, #话题# and
// @mentions in blue, goals (3000👍, 万赞, 1k🧱) and 《作品》 in bold, and each numbered item
// (1️⃣ 2️⃣ … 🔟) on its own line. Line breaks are kept. Admin-written text is shown as typed.
const TOKENS=/(#[^#\n]+#|@[\w一-龥-]+|《[^》\n]+》|\d+(?:\.\d+)?\s*[kKwW万千]?\s*(?:👍🏻|👍|赞|转|评|🧱|🍎)|[万千]\s*(?:👍|赞|转|评))/gu;
const ITEM_BREAK=/([^\n])[ \t]*(?=[0-9]️?⃣|🔟)/gu;

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

export function FormattedText({text,className=''}:{text:string;className?:string}){
  const lines=text.trim().replace(ITEM_BREAK,'$1\n').split('\n');
  return <p className={`whitespace-pre-wrap ${className}`}>{lines.map((line,i)=><Fragment key={i}>{i>0&&'\n'}{line.trim()===HEAT_NOTICE?<b className="text-[#d75454]">{line}</b>:formatLine(line)}</Fragment>)}</p>;
}
