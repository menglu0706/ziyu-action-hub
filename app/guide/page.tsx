import Link from 'next/link';
import {MobileHeader} from '@/components/MobileHeader';
import {MobileNav} from '@/components/MobileNav';
import {GuideList} from '@/components/GuideList';
import {repository} from '@/lib/repository';
import {visualStyle} from '@/lib/visual';
export const dynamic='force-dynamic';
export default async function Guide(){const [guides,setting]=await Promise.all([repository.getGuides(),repository.getVisualSetting('guide')]);return <main className="phone-shell" style={visualStyle(setting)}><MobileHeader title="攻略"/><div className="page-pad"><div className="flex gap-2 overflow-x-auto pb-5">{['小Tips','攻略指引','常见问题'].map((x,i)=><button className={`pill ${i===0?'active':''}`} key={x}>{x}</button>)}<Link className="pill no-underline" href="/guide/tools">快捷工具</Link></div><GuideList guides={guides}/>{!guides.length&&<div className="card p-5 text-sm text-[#7890a6]">暂无已发布内容</div>}</div><MobileNav/></main>}
