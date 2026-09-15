import {MobileHeader} from '@/components/MobileHeader';

export default function TaskDetailLoading(){
  return <main className="phone-shell"><MobileHeader title="任务详情" back="/urgent"/><div className="page-pad"><article className="card space-y-4 p-5" aria-label="正在加载任务详情"><div className="h-3 w-16 animate-pulse rounded bg-[#e3edf4]"/><div className="h-7 w-2/3 animate-pulse rounded bg-[#e3edf4]"/><div className="flex gap-2"><div className="h-6 w-14 animate-pulse rounded-full bg-[#edf3f7]"/><div className="h-6 w-14 animate-pulse rounded-full bg-[#edf3f7]"/></div><div className="h-20 animate-pulse rounded-xl bg-[#f0f5f9]"/><div className="h-11 animate-pulse rounded-xl bg-[#e2eff8]"/></article></div></main>;
}
