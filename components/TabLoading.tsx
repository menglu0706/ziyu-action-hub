import {FishIcon} from '@/components/FishIcon';
import {MobileHeader} from '@/components/MobileHeader';
import {MobileNav} from '@/components/MobileNav';

export function TabLoading({title,urgent=false}:{title?:string;urgent?:boolean}){
  return <main className="phone-shell" aria-busy="true" aria-label="页面加载中">
    {urgent?<section className="hero"><FishIcon/></section>:<MobileHeader title={title??''}/>} 
    <div className={`page-pad animate-pulse ${urgent?'-mt-4 relative z-10':''}`}>
      <div className="mb-3 h-6 w-28 rounded-full bg-white/70"/>
      <section className="card p-5">
        <div className="h-3 w-20 rounded-full bg-[#e7f1f7]"/>
        <div className="mt-4 h-6 w-3/4 rounded-full bg-[#e7f1f7]"/>
        <div className="mt-5 h-3 w-full rounded-full bg-[#edf4f8]"/>
        <div className="mt-3 h-3 w-2/3 rounded-full bg-[#edf4f8]"/>
        <div className="mt-6 h-12 w-full rounded-[14px] bg-[#e1eff9]"/>
      </section>
      <section className="card mt-4 h-28"/>
    </div>
    <MobileNav/>
  </main>;
}
