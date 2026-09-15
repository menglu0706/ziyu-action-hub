import {AdminCard,AdminShell} from '@/components/AdminShell';

export default function AdminLoading(){
  return <AdminShell title="后台管理" subtitle="加载中…"><AdminCard><div className="space-y-3" aria-label="正在加载后台内容"><div className="h-5 w-32 animate-pulse rounded bg-[#e8f1f8]"/><div className="h-12 animate-pulse rounded-xl bg-[#f0f5f9]"/><div className="h-12 animate-pulse rounded-xl bg-[#f0f5f9]"/><div className="h-12 animate-pulse rounded-xl bg-[#f0f5f9]"/></div></AdminCard></AdminShell>;
}
