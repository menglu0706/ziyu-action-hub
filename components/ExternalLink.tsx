'use client';
import {useState} from 'react';
import {externalWebHref,externalWebTarget,isWeiboWboxUrl,weiboWboxLandingUrl} from '@/lib/url';

export function ExternalLink({href,className,children,onClick}:{href:string;className?:string;children:React.ReactNode;onClick?:()=>void}){
  const safeHref=externalWebHref(href),wbox=Boolean(safeHref&&isWeiboWboxUrl(safeHref));
  const landingUrl=safeHref?weiboWboxLandingUrl(safeHref):null;
  const [fallback,setFallback]=useState(false),[copied,setCopied]=useState(false);
  if(!safeHref)return null;
  const click=(event:React.MouseEvent<HTMLAnchorElement>)=>{onClick?.();if(!wbox||landingUrl)return;event.preventDefault();setCopied(false);setFallback(true)};
  const copy=async()=>{try{await navigator.clipboard.writeText(safeHref);setCopied(true)}catch{setCopied(false)}};
  const navigationHref=wbox?landingUrl??'#':safeHref,target=wbox?undefined:externalWebTarget(safeHref)??undefined;
  return <><a className={className} href={navigationHref} target={target} rel="noreferrer" onClick={click}>{children}</a>{fallback&&<div className="external-link-modal-backdrop" role="presentation"><section className="external-link-modal" role="dialog" aria-modal="true" aria-labelledby="wbox-fallback-title"><h2 id="wbox-fallback-title">微博活动需通过微博官方落地页打开</h2><div><button className="outline" onClick={copy}>{copied?'已复制':'复制链接'}</button><button className="plain" onClick={()=>setFallback(false)}>取消</button></div></section></div>}</>;
}
