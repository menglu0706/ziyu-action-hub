'use client';
import {shanghaiDate} from './shanghaiDate';

const STORAGE_KEY='ziyu-folded-tasks';

// Maps taskId -> the Shanghai calendar date it was folded on. Every fold
// expires the day after it was set, for every task -- if it still needs
// doing, it reappears unfolded the next day rather than staying hidden.
function readFolded():Record<string,string>{
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return {};
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {};
    const today=shanghaiDate(),map:Record<string,string>={};
    let changed=false;
    for(const [id,date] of Object.entries(parsed as Record<string,unknown>)){
      if(typeof date!=='string'||date!==today){changed=true;continue} // sweep anything not from today
      map[id]=date;
    }
    if(changed)writeFolded(map);
    return map;
  }catch{
    return {};
  }
}

function writeFolded(map:Record<string,string>){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(map))}
  catch{/* storage may be unavailable (private mode, quota); fold state just won't persist */}
}

export function isTaskFolded(taskId:string):boolean{
  return Boolean(readFolded()[taskId]);
}

export function toggleTaskFolded(taskId:string):boolean{
  const map=readFolded(),isFolded=Boolean(map[taskId]);
  if(isFolded)delete map[taskId];else map[taskId]=shanghaiDate();
  writeFolded(map);
  return !isFolded;
}
