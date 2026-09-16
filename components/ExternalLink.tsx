'use client';
import {useEffect,useRef,useState} from 'react';
import {externalWebHref,externalWebTarget,isWeiboWboxUrl,weiboWboxNativeUrl} from '@/lib/url';

const isMobileDevice=()=>/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;

export function ExternalLink({href,className,children}:{href:string;className?:string;children:React.ReactNode}){
  const safeHref=externalWebHref(href),wbox=Boolean(safeHref&&isWeiboWboxUrl(safeHref));
  const appUrl=safeHref?weiboWboxNativeUrl(safeHref):null;
  const [fallback,setFallback]=useState(false),[copied,setCopied]=useState(false);const timer=useRef<number|null>(null);
  const clear=()=>{if(timer.current!==null){window.clearTimeout(timer.current);timer.current=null}};
  useEffect(()=>{const visibility=()=>{if(document.visibilityState==='hidden')clear()};document.addEventListener('visibilitychange',visibility);return()=>{clear();document.removeEventListener('visibilitychange',visibility)}},[]);
  if(!safeHref)return null;
  const openWeibo=()=>{if(!appUrl)return;clear();setFallback(false);setCopied(false);window.location.href=appUrl;timer.current=window.setTimeout(()=>{timer.current=null;if(document.visibilityState==='visible')setFallback(true)},1500)};
  const click=(event:React.MouseEvent<HTMLAnchorElement>)=>{if(!wbox||!isMobileDevice())return;event.preventDefault();openWeibo()};
  const copy=async()=>{try{await navigator.clipboard.writeText(safeHref);setCopied(true)}catch{setCopied(false)}};
  const target=wbox?'_blank':externalWebTarget(safeHref)??undefined;
  return <><a className={className} href={safeHref} target={target} rel="noreferrer" onClick={click}>{children}</a>{fallback&&<div className="external-link-modal-backdrop" role="presentation"><section className="external-link-modal" role="dialog" aria-modal="true" aria-labelledby="wbox-fallback-title"><h2 id="wbox-fallback-title">此任务需要在微博 App 内打开</h2><div><button className="primary" onClick={openWeibo}>再次打开微博</button><button className="outline" onClick={copy}>{copied?'已复制':'复制原始链接'}</button><button className="plain" onClick={()=>setFallback(false)}>关闭</button></div></section></div>}</>;
}
