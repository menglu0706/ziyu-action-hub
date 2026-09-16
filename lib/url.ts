export function isSafeWebUrl(value:string,allowEmpty=false){if(allowEmpty&&!value)return true;try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'}catch{return false}}
export function requireSafeWebUrl(value:string,label='链接',allowEmpty=false){if(!isSafeWebUrl(value,allowEmpty))throw new Error(`${label}必须是有效的 http 或 https 地址`);return value}
export function externalWebHref(value:string){if(!isSafeWebUrl(value))return null;const url=new URL(value);if(url.protocol==='http:'&&url.hostname.toLowerCase()==='t.cn'){url.protocol='https:';return url.href}return value}
