import 'server-only';
import {createClient} from '@supabase/supabase-js';

function isModernSecretKey(key:string){
  return /^sb_secret_[A-Za-z0-9_-]+$/.test(key);
}

function legacyJwtRole(key:string){
  const parts=key.split('.');
  if(parts.length!==3)return null;

  try{
    const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8')) as {role?:unknown};
    return typeof payload.role==='string'?payload.role:undefined;
  }catch{
    return undefined;
  }
}

function assertAdminKey(key:string){
  if(isModernSecretKey(key))return;

  if(key.startsWith('sb_publishable_')){
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 配置错误：publishable 密钥不能用于后台管理');
  }

  const role=legacyJwtRole(key);
  if(role==='service_role')return;
  if(role){
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY 配置错误：当前密钥角色为 ${role}，必须使用 service_role 密钥`);
  }

  throw new Error('SUPABASE_SERVICE_ROLE_KEY 配置错误：密钥格式无效');
}

export function createAdminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('后台账号管理未配置 SUPABASE_SERVICE_ROLE_KEY');
  assertAdminKey(key);
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
}
