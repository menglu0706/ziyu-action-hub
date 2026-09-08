'use client';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {useState} from 'react';
import {createClient} from '@/lib/supabase/client';

function safeNext(value:string|null){return value?.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/me'}
export function UserAuthForm({mode}:{mode:'login'|'signup'}){
  const router=useRouter();const search=useSearchParams();const next=safeNext(search.get('next'));const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [nickname,setNickname]=useState('');const [message,setMessage]=useState(search.get('error')==='callback'?'邮箱验证链接无效或已过期，请重新登录。':'');const [pending,setPending]=useState(false);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setPending(true);setMessage('');const db=createClient();
    if(mode==='login'){const {error}=await db.auth.signInWithPassword({email,password});if(error){setMessage('登录失败，请检查邮箱和密码');setPending(false);return}router.replace(next);router.refresh();return}
    const callback=new URL('/auth/callback',window.location.origin);callback.searchParams.set('next',next);const {data,error}=await db.auth.signUp({email,password,options:{data:{nickname:nickname.trim()},emailRedirectTo:callback.toString()}});if(error){setMessage(error.message);setPending(false);return}if(data.session){router.replace(next);router.refresh();return}setMessage('注册成功，请先前往邮箱完成验证后登录。');setPending(false)};
  const login=mode==='login';const alternate=`${login?'/signup':'/login'}?next=${encodeURIComponent(next)}`;return <main className="phone-shell flex min-h-screen items-center px-5"><form onSubmit={submit} className="card w-full p-6"><div className="mb-6 text-center"><span className="fish text-4xl"/><h1 className="mb-1 mt-3 text-2xl font-bold">{login?'登录养渝':'注册养渝'}</h1><p className="m-0 text-sm text-[#7890a6]">ZIYU Action Hub</p></div>{!login&&<label className="field mb-4">昵称<input required maxLength={40} autoComplete="nickname" value={nickname} onChange={e=>setNickname(e.target.value)}/></label>}<label className="field mb-4">邮箱<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field mb-4">密码<input required minLength={6} type="password" autoComplete={login?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>{message&&<p role="status" className="mb-4 text-sm text-[#d75454]">{message}</p>}<button disabled={pending} className="primary w-full">{pending?'请稍候…':login?'登录':'注册'}</button><p className="mb-0 mt-5 text-center text-sm text-[#7890a6]">{login?'还没有账号？':'已有账号？'} <Link className="font-bold text-[#438bd1]" href={alternate}>{login?'立即注册':'前往登录'}</Link></p></form></main>
}
