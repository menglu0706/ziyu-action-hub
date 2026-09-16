import 'server-only';
import {createClient} from '@supabase/supabase-js';

export function createAdminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('后台账号管理未配置 SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
}
