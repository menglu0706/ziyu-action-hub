import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect('/admin/login');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('role,is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (!admin?.is_active || !['admin', 'editor'].includes(admin.role)) {
    redirect('/admin/login?error=access_denied');
  }
  return { userId, role: admin.role };
}
