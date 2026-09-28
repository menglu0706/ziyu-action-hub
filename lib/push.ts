// Web Push for 加热提醒. The public VAPID key is meant to be public (browsers need it to subscribe);
// its private half is the Supabase secret VAPID_PRIVATE_KEY, used by the weibo-watcher to send.
export const VAPID_PUBLIC_KEY='BD3Ic4phpDLlgVVGA9Jp1_KuIq7cU_ZjTzkH5h5WbmfV7FEkZeB6EP5rU_14mVfh8c8rw9-OkehjiZ-35kHGda8';

export const base64UrlToBytes=(text:string)=>{
  const binary=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((text.length+3)%4));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
};

// A push subscription as the site stores it: the push service endpoint and the browser's keys.
export type StoredSubscription={endpoint:string;p256dh:string;auth:string};
const KEY=/^[A-Za-z0-9_-]+$/;
export function parseSubscription(value:unknown):StoredSubscription|null{
  const sub=value as {endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}};
  const endpoint=typeof sub?.endpoint==='string'?sub.endpoint:'',p256dh=sub?.keys?.p256dh,auth=sub?.keys?.auth;
  if(endpoint.length>1000||typeof p256dh!=='string'||typeof auth!=='string')return null;
  try{if(new URL(endpoint).protocol!=='https:')return null}catch{return null}
  // p256dh is a 65-byte P-256 point, auth 16 bytes, both base64url.
  if(!KEY.test(p256dh)||!KEY.test(auth)||p256dh.length<86||p256dh.length>88||auth.length<21||auth.length>24)return null;
  return {endpoint,p256dh,auth};
}
