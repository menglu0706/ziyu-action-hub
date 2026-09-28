// Web Push (RFC 8030) with only Web Crypto: aes128gcm payload encryption (RFC 8291 / 8188) and
// VAPID authentication (RFC 8292). Works in Deno (the watcher) and Node 20+ (tests).

export type PushSubscription={endpoint:string;p256dh:string;auth:string};
export type VapidKeys={publicKey:string;privateKey:string;subject:string};

const enc=new TextEncoder();
export const b64url={
  encode:(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),
  decode:(text:string)=>{const b=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((text.length+3)%4));return Uint8Array.from(b,c=>c.charCodeAt(0))},
};
const concat=(...parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out};

async function hkdf(salt:Uint8Array,ikm:Uint8Array,info:Uint8Array,length:number){
  const key=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8));
}

// The payload encrypted for one subscription, as the request body (a single aes128gcm record).
export async function encryptPayload(sub:PushSubscription,payload:Uint8Array){
  const uaPublic=b64url.decode(sub.p256dh),authSecret=b64url.decode(sub.auth);
  const local=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']) as CryptoKeyPair;
  const asPublic=new Uint8Array(await crypto.subtle.exportKey('raw',local.publicKey));
  const uaKey=await crypto.subtle.importKey('raw',uaPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const ecdhSecret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},local.privateKey,256));
  const ikm=await hkdf(authSecret,ecdhSecret,concat(enc.encode('WebPush: info\0'),uaPublic,asPublic),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hkdf(salt,ikm,enc.encode('Content-Encoding: aes128gcm\0'),16);
  const nonce=await hkdf(salt,ikm,enc.encode('Content-Encoding: nonce\0'),12);
  const aes=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  // 0x02 marks the last (only) record.
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},aes,concat(payload,new Uint8Array([2]))));
  const header=new Uint8Array(21+asPublic.length);
  header.set(salt,0);new DataView(header.buffer).setUint32(16,4096);header[20]=asPublic.length;header.set(asPublic,21);
  return concat(header,cipher);
}

// The VAPID Authorization header for a push service origin (valid 12 hours).
export async function vapidHeader(endpoint:string,vapid:VapidKeys){
  const pub=b64url.decode(vapid.publicKey);
  const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',d:vapid.privateKey,x:b64url.encode(pub.slice(1,33)),y:b64url.encode(pub.slice(33,65)),ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const part=(value:unknown)=>b64url.encode(enc.encode(JSON.stringify(value)));
  const unsigned=`${part({typ:'JWT',alg:'ES256'})}.${part({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+12*3600,sub:vapid.subject})}`;
  const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64url.encode(signature)}, k=${vapid.publicKey}`;
}

// Sends one notification. Returns the push service's HTTP status (201 = accepted; 404 / 410 = the
// subscription is gone and should be deleted).
export async function sendPush(sub:PushSubscription,payload:unknown,vapid:VapidKeys,ttlSeconds=3600){
  const body=await encryptPayload(sub,enc.encode(JSON.stringify(payload)));
  const res=await fetch(sub.endpoint,{method:'POST',headers:{Authorization:await vapidHeader(sub.endpoint,vapid),'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:String(ttlSeconds),Urgency:'high'},body});
  await res.body?.cancel();
  return res.status;
}
