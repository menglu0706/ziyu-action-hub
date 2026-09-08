'use client';
import {useState} from 'react';

export function MediaCover({url,className}:{url:string;className:string}){
  const [failed,setFailed]=useState(false);
  // A browser image supports arbitrary administrator-provided hosts without remote-image configuration.
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={`absolute inset-0 grid place-items-center ${className}`}>{url&&!failed?<img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span className="fish text-4xl"/>}</div>
}
