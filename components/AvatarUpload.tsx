'use client';
/* eslint-disable @next/next/no-img-element */
import {useRef,useState} from 'react';
import {saveAvatarUrl} from '@/app/user-actions';
import {createClient} from '@/lib/supabase/client';

const acceptedTypes=new Set(['image/jpeg','image/png','image/webp']);
const maxSourceBytes=5*1024*1024;

async function prepareAvatar(file:File){
  const bitmap=await createImageBitmap(file);
  try{
    const sourceSize=Math.min(bitmap.width,bitmap.height),sourceX=(bitmap.width-sourceSize)/2,sourceY=(bitmap.height-sourceSize)/2;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    const context=canvas.getContext('2d');if(!context)throw new Error('图片处理失败');
    context.drawImage(bitmap,sourceX,sourceY,sourceSize,sourceSize,0,0,512,512);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('图片压缩失败')),'image/webp',.82));
  }finally{bitmap.close()}
}

export function AvatarUpload({userId,avatarUrl}:{userId:string;avatarUrl:string|null}){
  const input=useRef<HTMLInputElement>(null);const [preview,setPreview]=useState(avatarUrl),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const upload=async(file?:File)=>{if(!file||busy)return;if(!acceptedTypes.has(file.type)){setMessage('请选择 JPEG、PNG 或 WebP 图片');return}if(file.size>maxSourceBytes){setMessage('原图不能超过 5 MB');return}const previous=preview,localUrl=URL.createObjectURL(file);setPreview(localUrl);setBusy(true);setMessage('');try{const blob=await prepareAvatar(file),path=`${userId}/avatar.webp`,db=createClient(),{error}=await db.storage.from('avatars').upload(path,blob,{contentType:'image/webp',cacheControl:'3600',upsert:true});if(error)throw new Error('头像上传失败');const savedUrl=await saveAvatarUrl();setPreview(savedUrl);setMessage('头像已更新')}catch(cause){setPreview(previous);setMessage(cause instanceof Error?cause.message:'头像更新失败')}finally{URL.revokeObjectURL(localUrl);setBusy(false);if(input.current)input.current.value=''}};
  return <section className="flex items-center gap-4 rounded-2xl border border-[#e2edf5] bg-[#f8fcff] p-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-[#dff1fb]">{preview?<img src={preview} alt="当前头像" className="h-full w-full object-cover"/>:<span className="fish"/>}</div><div className="min-w-0 flex-1"><label className={`inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full border border-[#bfd7e7] bg-white px-4 text-xs font-semibold text-[#416d91] ${busy?'pointer-events-none opacity-60':''}`}>{busy?'正在更新…':'更换头像'}<input ref={input} hidden disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>upload(event.target.files?.[0])}/></label><p className="mb-0 mt-2 text-[10px] leading-4 text-[#8298ac]">JPEG / PNG / WebP，原图最大 5 MB</p>{message&&<p className={`mb-0 mt-1 text-xs ${message==='头像已更新'?'text-[#438bd1]':'text-red-500'}`}>{message}</p>}</div></section>;
}
