import {MobileHeader} from '@/components/MobileHeader';
import {MobileNav} from '@/components/MobileNav';
import {GuideList} from '@/components/GuideList';
import {repository} from '@/lib/repository';
import {visualStyle} from '@/lib/visual';
export default async function Guide(){const [guides,setting]=await Promise.all([repository.getGuides(),repository.getVisualSetting('guide')]);return <main className="phone-shell" style={visualStyle(setting)}><MobileHeader title="攻略"/><div className="page-pad"><GuideList guides={guides}/></div><MobileNav/></main>}
