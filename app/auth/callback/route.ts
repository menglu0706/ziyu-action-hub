import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {safeNextPath} from '@/lib/auth/user';

export async function GET(request:Request){
  const url=new URL(request.url);const code=url.searchParams.get('code');const next=safeNextPath(url.searchParams.get('next'));
  if(code){const db=await createClient();const {error}=await db.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(next,url.origin))}
  return NextResponse.redirect(new URL('/login?error=callback',url.origin));
}
