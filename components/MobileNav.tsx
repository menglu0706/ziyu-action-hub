'use client';
/* eslint-disable @next/next/no-img-element */
import type {CSSProperties} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

const items=[
  {key:'urgent',href:'/urgent',src:'/nav-icons/urgent.png',label:'紧急'},
  {key:'daily',href:'/daily',src:'/nav-icons/daily.png',label:'日常'},
  {key:'feed',href:'/media',src:'/nav-icons/feed.png',label:'吸食'},
  {key:'guide',href:'/guide',src:'/nav-icons/guide.png',label:'攻略'},
  {key:'me',href:'/me',src:'/nav-icons/me.jpg',label:'养渝'}
] as const;
const navIconTuning={urgent:{scale:1.03,x:0,y:1},daily:{scale:1.12,x:-1,y:1},feed:{scale:1.08,x:0,y:0},guide:{scale:1.02,x:0,y:1},me:{scale:1.06,x:0,y:0}} as const;

export function MobileNav(){const path=usePathname();return <nav className="nav" aria-label="主导航">{items.map(item=>{const tuning=navIconTuning[item.key],style={'--icon-scale':tuning.scale,'--icon-x':`${tuning.x}px`,'--icon-y':`${tuning.y}px`} as CSSProperties;return <Link key={item.href} href={item.href} prefetch={item.href==='/media'||item.href==='/guide'?true:item.href==='/me'?false:null} className={path.startsWith(item.href)?'active':''}><span className="nav-icon" style={style}><img src={item.src} alt=""/></span><span className="nav-label">{item.label}</span></Link>})}</nav>}
