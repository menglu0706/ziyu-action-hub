// Copy of lib/taskLink.ts for the Deno Edge Functions -- keep the two identical.
// Canonical form of a task link, so the same target written differently compares equal:
// weibo.com/<uid>/<id>, m.weibo.cn/status/<id> and m.weibo.cn/detail/<id> all name one post,
// where <id> is either the numeric mid or its base62 form (e.g. 5346612432865162 / Q3kLx...).
const BASE62='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TRACKING_PARAMS=/^(utm_.*|from|wvr|wfr|share_.*|spm|sourcetype|jumpfrom|ssr|timestamp|xsec_.*|share_from_user_hidden|apptime)$/i;

// Weibo's base62 id encodes the numeric mid in 7-digit groups, 4 base62 chars per group.
function weiboBidToMid(bid:string){
  let mid='';
  for(let end=bid.length;end>0;end-=4){
    let value=0;
    for(const char of bid.slice(Math.max(0,end-4),end)){const digit=BASE62.indexOf(char);if(digit<0)return null;value=value*62+digit}
    const chunk=String(value);mid=(end-4>0?chunk.padStart(7,'0'):chunk)+mid;
  }
  return mid;
}
function weiboPostId(url:URL){
  if(!/(^|\.)weibo\.(com|cn)$/.test(url.hostname))return null;
  const parts=url.pathname.split('/').filter(Boolean);
  const id=parts[0]==='status'||parts[0]==='detail'?parts[1]:parts.length===2&&/^\d+$/.test(parts[0])?parts[1]:null;
  if(!id)return null;
  return /^\d+$/.test(id)?id:/^[0-9A-Za-z]+$/.test(id)?weiboBidToMid(id):null;
}

export function normalizeTaskLink(value:string){
  const text=value.trim();
  // Share text often wraps the link ("https://v.douyin.com/xxx/ 7@5.com :5pm"): use the URL itself.
  const found=text.match(/https?:\/\/[^\s]+/i);
  if(!found)return text.replace(/\s+/g,' ');
  let url:URL;
  try{url=new URL(found[0])}catch{return found[0]}
  url.hostname=url.hostname.toLowerCase().replace(/^www\./,'');
  const post=weiboPostId(url);
  if(post)return `weibo:${post}`;
  for(const key of [...url.searchParams.keys()])if(TRACKING_PARAMS.test(key))url.searchParams.delete(key);
  url.searchParams.sort();
  const query=url.searchParams.toString();
  return `${url.hostname}${url.pathname.replace(/\/+$/,'')}${query?`?${query}`:''}`;
}
