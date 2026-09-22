'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import {shanghaiDate} from '@/lib/shanghaiDate';

const markerPrefix='ziyu-site-visit:';
const inFlightDates=new Set<string>();

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
