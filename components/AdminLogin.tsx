'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function AdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(searchParams.get('error') === 'access_denied' ? '此账号没有后台访问权限' : '');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage('登录失败，请检查邮箱和密码');
      setLoading(false);
      return;
    }
    router.replace(searchParams.get('next') || '/admin');
    router.refresh();
  }

  return <main className="admin-login-page"><form onSubmit={submit} className="admin-login-card"><div className="admin-login-brand">梓渝</div><p>极速行动站 · 后台管理</p><label>邮箱<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label>密码<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>{message && <div role="alert" className="admin-login-error">{message}</div>}<button disabled={loading}>{loading ? '登录中…' : '登录后台'}</button><small>仅限已授权管理员与编辑登录</small></form></main>;
}
