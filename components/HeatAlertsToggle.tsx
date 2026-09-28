'use client';
import {useEffect,useState} from 'react';
import {VAPID_PUBLIC_KEY,base64UrlToBytes} from '@/lib/push';

// 加热提醒 on /heat: turns Web Push on or off for this browser. Where push can't work, it says what
// to do instead (iPhone: add to the home screen first; WeChat: open in a browser).
type State='loading'|'unsupported'|'wechat'|'ios-home'|'denied'|'off'|'on'|'busy';

const isIos=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;

async function registration(){
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export function HeatAlertsToggle(){
  const [state,setState]=useState<State>('loading'),[error,setError]=useState('');
  useEffect(()=>{
    (async()=>{
      if(/MicroMessenger/i.test(navigator.userAgent))return setState('wechat');
      if(isIos()&&!isStandalone())return setState('ios-home');
      if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return setState('unsupported');
      if(Notification.permission==='denied')return setState('denied');
      const existing=await (await registration()).pushManager.getSubscription();
      setState(existing?'on':'off');
    })().catch(()=>setState('unsupported'));
  },[]);

  const turnOn=async()=>{
    setState('busy');setError('');
    try{
      if(await Notification.requestPermission()!=='granted')return setState('denied');
      const reg=await registration();
      const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlToBytes(VAPID_PUBLIC_KEY)});
      const res=await fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sub.toJSON())});
      if(!res.ok)throw new Error('保存失败');
      setState('on');
    }catch{setError('开启失败，请稍后再试');setState('off')}
  };
  const turnOff=async()=>{
    setState('busy');
    try{
      const sub=await (await registration()).pushManager.getSubscription();
      if(sub){await fetch('/api/push/subscribe',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe()}
      setState('off');
    }catch{setError('关闭失败，请稍后再试');setState('on')}
  };

  if(state==='loading')return null;
  const hint:Partial<Record<State,string>>={
    unsupported:'这个浏览器不支持推送提醒。网站开着时，有新的热搜 / 空瓶告急会在页面上提示。',
    wechat:'微信里无法接收推送提醒：点右上角「…」选择「在浏览器打开」，再开启加热提醒。',
    'ios-home':'iPhone 需要先把网站添加到主屏幕：点分享按钮 →「添加到主屏幕」，然后从主屏幕打开本页，再开启加热提醒。',
    denied:'通知已被关闭。请在浏览器或系统设置里允许本网站发送通知，然后刷新页面。',
  };
  return <div className="card mb-3 p-3 text-xs text-[#58738d]">
    <div className="flex items-center justify-between gap-3">
      <div><b className="text-sm text-[#18345a]">🔔 加热提醒</b><p className="m-0 mt-1">有新的 🔥 热搜加热，或 15 分钟内出现 3 个以上空瓶时提醒你（北京时间 1:00–8:00 不提醒）。</p></div>
      {(state==='off'||state==='on'||state==='busy')&&<button type="button" disabled={state==='busy'} onClick={state==='on'?turnOff:turnOn} className={`pill shrink-0 ${state==='on'?'':'active'}`}>{state==='busy'?'…':state==='on'?'关闭提醒':'开启提醒'}</button>}
    </div>
    {hint[state]&&<p className="m-0 mt-2 text-[#b8743a]">{hint[state]}</p>}
    {state==='on'&&<p className="m-0 mt-2 text-[#2e8b62]">✓ 已开启。安卓手机在中国大陆可能收不到（需要谷歌服务）；网站开着时仍会在页面上提示。</p>}
    {error&&<p className="m-0 mt-2 text-[#d75454]">{error}</p>}
  </div>;
}
