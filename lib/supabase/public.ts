import 'server-only';
import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import {getSupabaseConfig} from './config';

let client:ReturnType<typeof createSupabaseClient>|undefined;

export function createPublicClient(){
  if(client)return client;
  const {url,publishableKey}=getSupabaseConfig();
  client=createSupabaseClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  return client;
}
