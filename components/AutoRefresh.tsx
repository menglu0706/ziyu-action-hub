'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';

// Re-fetches the page's server data (router.refresh: no reload, scroll position kept) when the app
// comes back to the foreground -- a home-screen app resumes the old page instead of reloading --
// and every intervalMs while it is visible. At most one refresh per MIN_GAP_MS.
const MIN_GAP_MS=10_000;

export function AutoRefresh({intervalMs=60_000}:{intervalMs?:number}){
  const router=useRouter();
  useEffect(()=>{
    let last=Date.now();
    const refresh=()=>{if(document.visibilityState!=='visible'||Date.now()-last<MIN_GAP_MS)return;last=Date.now();router.refresh()};
    const timer=setInterval(refresh,intervalMs);
    document.addEventListener('visibilitychange',refresh);
    window.addEventListener('pageshow',refresh);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('pageshow',refresh)};
  },[router,intervalMs]);
  return null;
}
