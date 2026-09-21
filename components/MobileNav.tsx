'use client';
import type {CSSProperties} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

const items=[
  {key:'urgent',href:'/urgent',src:'/nav-icons/urgent.png',label:'紧急'},
  {key:'daily',href:'/daily',src:'/nav-icons/daily.png',label:'日常'},
  {key:'feed',href:'/media',src:'/nav-icons/feed.png',label:'吸食'},
  {key:'guide',href:'/guide',src:'/nav-icons/guide.png',label:'攻略'}
] as const;
const navIconTuning={urgent:{scale:1,x:0,y:1},daily:{scale:1,x:0,y:1},feed:{scale:0.95,x:0,y:0},guide:{scale:1,x:0,y:1}} as const;

export function MobileNav(){const path=usePathname();return <nav className="nav" aria-label="主导航">{items.map(item=>{const tuning=navIconTuning[item.key],style={'--icon-scale':tuning.scale,'--icon-x':`${tuning.x}px`,'--icon-y':`${tuning.y}px`} as CSSProperties;return <Link key={item.href} href={item.href} className={path.startsWith(item.href)?'active':''}><span className="nav-icon" style={style}><Image src={item.src} alt="" width={144} height={144}/></span><span className="nav-label">{item.label}</span></Link>})}</nav>}
