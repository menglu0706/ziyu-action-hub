'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';

const markerPrefix='ziyu-site-visit:';
const inFlightDates=new Set<string>();

function shanghaiDate(){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value??'';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function DailyVisitTracker(){
  const pathname=usePathname();

  useEffect(()=>{
    if(pathname==='/admin'||pathname.startsWith('/admin/'))return;
    const date=shanghaiDate();
    const marker=`${markerPrefix}${date}`;
    try{if(localStorage.getItem(marker)||inFlightDates.has(date))return}catch{return}
    inFlightDates.add(date);
    void (async()=>{
      try{
        const {error}=await createClient().rpc('increment_daily_site_visit');
        if(!error){try{localStorage.setItem(marker,'1')}catch{/* Storage may be unavailable; telemetry stays non-critical. */}}
      }catch{/* A later navigation or reload may retry. */}
      finally{inFlightDates.delete(date)}
    })();
  },[pathname]);

  return null;
}
