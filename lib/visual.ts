import type {CSSProperties} from 'react';
import type {VisualSetting} from './types';
import {isSafeWebUrl} from './url';

export function visualStyle(setting?:VisualSetting):CSSProperties|undefined{
  if(!setting?.enabled||!isSafeWebUrl(setting.imageUrl))return undefined;
  const opacity=Math.min(1,Math.max(0,setting.overlay));
  return {
    backgroundImage:`linear-gradient(rgba(255,255,255,${opacity}),rgba(255,255,255,${opacity})),url("${setting.imageUrl.replaceAll('"','%22')}")`,
    backgroundPosition:setting.position,
    backgroundSize:setting.size,
    backgroundRepeat:'no-repeat'
  };
}
