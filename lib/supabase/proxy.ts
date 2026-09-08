import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headersToSet).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === '/admin/login';
  if (isLogin) return response;

  if (pathname.startsWith('/admin')) {
    const userId = data?.claims?.sub;
    if (error || !userId) {
      const login = request.nextUrl.clone();
      login.pathname = '/admin/login';
      login.searchParams.set('next', pathname);
      return NextResponse.redirect(login);
    }
    const { data: admin } = await supabase
      .from('admin_users')
      .select('role,is_active')
      .eq('user_id', userId)
      .maybeSingle();
    if (!admin?.is_active || !['admin', 'editor'].includes(admin.role)) {
      const denied = request.nextUrl.clone();
      denied.pathname = '/admin/login';
      denied.searchParams.set('error', 'access_denied');
      return NextResponse.redirect(denied);
    }
  }
  return response;
}
