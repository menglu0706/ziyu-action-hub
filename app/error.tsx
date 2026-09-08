'use client';
import {MobileNav} from '@/components/MobileNav';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="phone-shell"><div className="page-pad pt-16"><div className="card p-5 text-center text-sm text-[#7890a6]"><p>内容暂时无法加载，请稍后重试。</p><button className="primary" onClick={reset}>重新加载</button></div></div><MobileNav/></main>}
