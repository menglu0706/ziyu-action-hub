import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {ServerTrace} from '@/lib/observability/server-trace';

export async function getAdminActor(client?:Awaited<ReturnType<typeof createClient>>) {
  const supabase = client??await createClient();
  const { data: admin, error } = await supabase
    .from('admin_users')
    .select('user_id,role,is_active')
    .maybeSingle();
  if(error||!admin?.is_active||!['admin','editor'].includes(admin.role))return null;
  return {db:supabase,userId:admin.user_id,role:admin.role as 'admin'|'editor'};
}

export async function requireAdmin(client?:Awaited<ReturnType<typeof createClient>>,trace?:ServerTrace) {
  const actor=trace?await trace.measure('page.admin.authorization',()=>getAdminActor(client)):await getAdminActor(client);
  if(!actor){
    redirect('/admin/login?error=access_denied');
  }
  return actor;
}
