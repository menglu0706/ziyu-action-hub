'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';

// In-page 加热 alerts on every page: while the site is open, checks site_notifications about once a
// minute (right away when the tab comes back) and shows a banner for new ones. In a background tab
// on a computer it shows a system notification instead, if notifications are allowed -- with the
// same tag as the Web Push one, so the two don't stack. Nothing older than the visitor's first
// visit, or older than 30 minutes, is shown.
type Note={id:number;kind:string;title:string;body:string;url:string;created_at:string};
const SEEN_KEY='ziyu-last-notification';
const readSeen=()=>{try{return Number(localStorage.getItem(SEEN_KEY))||0}catch{return 0}};
const writeSeen=(id:number)=>{try{localStorage.setItem(SEEN_KEY,String(id))}catch{}};

export function FanNotifications(){
  const router=useRouter();
  const [note,setNote]=useState<Note|null>(null);
  const seen=useRef<number|null>(null);
  const admin=usePathname().startsWith('/admin');
  useEffect(()=>{
    if(admin)return;
    const db=createClient();
    const check=async()=>{
      if(seen.current===null){
        // First visit on this browser: start from the newest notification without showing it.
        const stored=readSeen();
        if(stored)seen.current=stored;
        else{const {data}=await db.from('site_notifications').select('id').order('id',{ascending:false}).limit(1);const latest=data?.[0]?.id??0;seen.current=latest;writeSeen(latest)}
      }
      const {data}=await db.from('site_notifications').select('id,kind,title,body,url,created_at').gt('id',seen.current).order('id',{ascending:true}).limit(5);
      const fresh=(data??[]).filter(n=>Date.now()-new Date(n.created_at).getTime()<30*60_000);
      if(data?.length){const last=data[data.length-1].id;seen.current=last;writeSeen(last)}
      const latest=fresh[fresh.length-1];
      if(!latest)return;
      if(document.hidden&&'Notification' in window&&Notification.permission==='granted'){
        try{
          const reg=await navigator.serviceWorker?.getRegistration();
          if(reg)await reg.showNotification(latest.title,{body:latest.body,icon:'/icons/icon-192.png',tag:latest.kind,data:{url:latest.url}});
          else new Notification(latest.title,{body:latest.body,icon:'/icons/icon-192.png',tag:latest.kind});
        }catch{}
      }
      setNote(latest);
    };
    const run=()=>{check().catch(()=>{})};
    run();
    const timer=setInterval(run,60_000);
    const onVisible=()=>{if(!document.hidden)run()};
    document.addEventListener('visibilitychange',onVisible);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVisible)};
  },[admin]);
  useEffect(()=>{if(!note)return;const t=setTimeout(()=>setNote(null),20_000);return ()=>clearTimeout(t)},[note]);

  if(!note)return null;
  return <div role="alert" className="fixed left-1/2 top-3 z-50 w-[min(92vw,420px)] -translate-x-1/2">
    <div className="card flex items-start gap-3 border border-[#f3c1c1] bg-white p-3 shadow-lg">
      <button type="button" className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left" onClick={()=>{setNote(null);router.push(note.url)}}>
        <b className="block text-sm text-[#c43d4d]">{note.title}</b>
        <span className="mt-1 block whitespace-pre-line text-xs text-[#4b647c]">{note.body}</span>
        <span className="mt-1 block text-[11px] font-bold text-[#1674ca]">点击前往加热 →</span>
      </button>
      <button type="button" aria-label="关闭" className="border-0 bg-transparent text-lg leading-none text-[#8aa0b4]" onClick={()=>setNote(null)}>×</button>
    </div>
  </div>;
}
