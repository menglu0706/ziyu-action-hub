import { Suspense } from 'react';
import { AdminLogin } from '@/components/AdminLogin';
import '../[[...slug]]/admin.css';
import './login.css';

export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  return <Suspense fallback={<main className="admin-login-page">加载中…</main>}><AdminLogin /></Suspense>;
}
