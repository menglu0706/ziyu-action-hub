'use client';
import type {CSSProperties} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {trackClick} from '@/lib/trackClick';

const SPRITE_SRC='/nav-icons/sprite.webp';
const items=[
  {key:'urgent',href:'/urgent',spriteIndex:0,label:'紧急'},
  {key:'heat',href:'/heat',spriteIndex:4,label:'加热'},
  {key:'daily',href:'/daily',spriteIndex:1,label:'日常'},
  {key:'feed',href:'/media',spriteIndex:2,label:'吸食'},
  {key:'guide',href:'/guide',spriteIndex:3,label:'攻略'}
] as const;
const navIconTuning={urgent:{scale:1,x:0,y:1},heat:{scale:1,x:0,y:1},daily:{scale:1.1,x:0,y:1},feed:{scale:0.95,x:0,y:0},guide:{scale:1,x:0,y:1}} as const;

export function MobileNav(){const path=usePathname();return <nav className="nav" aria-label="主导航">{items.map(item=>{const tuning=navIconTuning[item.key],style={'--icon-scale':tuning.scale,'--icon-x':`${tuning.x}px`,'--icon-y':`${tuning.y}px`,'--sprite-index':item.spriteIndex} as CSSProperties;return <Link key={item.href} href={item.href} prefetch={false} onClick={()=>trackClick(`nav:${item.href.slice(1)}`)} className={path.startsWith(item.href)?'active':''}><span className="nav-icon" style={style}><img src={SPRITE_SRC} alt=""/></span><span className="nav-label">{item.label}</span></Link>})}</nav>}
