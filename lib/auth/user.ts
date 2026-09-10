import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';

export function safeNextPath(value:string|null|undefined,fallback='/me'){
  return value?.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:fallback;
}

function fallbackNickname(user:{email?:string;user_metadata?:Record<string,unknown>}){
  const metadata=user.user_metadata?.nickname;
  if(typeof metadata==='string'&&metadata.trim())return metadata.trim();
  return user.email?.split('@')[0]?.trim()||'新用户';
}

export async function requireUserIdentity(next='/me'){
  const db=await createClient();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)redirect(`/login?next=${encodeURIComponent(safeNextPath(next))}`);
  return {db,user};
}

export async function getOrCreateOwnProfile({db,user}:Awaited<ReturnType<typeof requireUserIdentity>>){
  let {data:profile}=await db.from('profiles').select('id,nickname,avatar_url,timezone').eq('id',user.id).maybeSingle();
  if(!profile){
    const candidate={id:user.id,nickname:fallbackNickname(user),avatar_url:null,timezone:null};
    const inserted=await db.from('profiles').insert(candidate).select('id,nickname,avatar_url,timezone').maybeSingle();
    if(inserted.data)profile=inserted.data;
    else profile=(await db.from('profiles').select('id,nickname,avatar_url,timezone').eq('id',user.id).maybeSingle()).data??candidate;
  }
  return profile;
}

export async function requireUser(next='/me'){
  const context=await requireUserIdentity(next);
  const profile=await getOrCreateOwnProfile(context);
  return {...context,profile};
}

export async function optionalUser(){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return {db,user};
}
