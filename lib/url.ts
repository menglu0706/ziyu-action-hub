export function isSafeWebUrl(value:string,allowEmpty=false){if(allowEmpty&&!value)return true;try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'}catch{return false}}
export function requireSafeWebUrl(value:string,label='链接',allowEmpty=false){if(!isSafeWebUrl(value,allowEmpty))throw new Error(`${label}必须是有效的 http 或 https 地址`);return value}
export function isWeiboWboxUrl(value:string){if(!isSafeWebUrl(value))return false;const url=new URL(value),hostname=url.hostname.toLowerCase(),path=url.pathname.replace(/\/+$/,'');return hostname==='wbox.h5.weibo.cn'||hostname==='m.weibo.cn'&&path==='/c/wbox'}
export function cleanWeiboWboxUrl(value:string){if(!isWeiboWboxUrl(value))return value;let clean=value;while(clean.endsWith('%'))clean=clean.slice(0,-1);return clean}
export function externalWebHref(value:string){const clean=cleanWeiboWboxUrl(value);return isSafeWebUrl(clean)?clean:null}
export function externalWebTarget(value:string):'_self'|'_blank'|null{if(!isSafeWebUrl(value))return null;const hostname=new URL(value).hostname.toLowerCase();return hostname==='t.cn'||hostname==='www.t.cn'?'_self':'_blank'}
export function weiboWboxNativeUrl(value:string){const original=externalWebHref(value);if(!original||!isWeiboWboxUrl(original))return null;const query=new URL(original).search.slice(1);return query?`sinaweibo://wbox?${query}`:'sinaweibo://wbox'}
