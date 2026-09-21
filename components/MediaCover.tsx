'use client';
import Image from 'next/image';
import {useState} from 'react';

// Admins can paste any external URL here (legacy data), not just app-uploaded covers, so we
// can't route everything through next/image (its remotePatterns must be a known, fixed list).
// Supabase-hosted covers -- the common case, and the ones we actually pay egress for -- go
// through next/image so Vercel's cache absorbs repeat views instead of hitting Supabase Storage
// on every request. Anything else falls back to a plain <img>.
const SUPABASE_STORAGE_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`
  : null;

export function MediaCover({url,className}:{url:string;className:string}){
  const [failed,setFailed]=useState(false);
  if(!url||failed)return <div className={`absolute inset-0 grid place-items-center ${className}`}><span className="fish text-4xl"/></div>;
  if(SUPABASE_STORAGE_PREFIX&&url.startsWith(SUPABASE_STORAGE_PREFIX)){
    return <div className={`absolute inset-0 overflow-hidden ${className}`}><Image src={url} alt="" fill sizes="50vw" className="object-cover" onError={()=>setFailed(true)}/></div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={`absolute inset-0 grid place-items-center ${className}`}><img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/></div>;
}
