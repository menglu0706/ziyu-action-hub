'use client';
import {shanghaiDate} from './shanghaiDate';

const STORAGE_KEY='ziyu-folded-tasks';

// Maps taskId -> the Shanghai calendar date it was folded on. Recurring
// (task.daily) folds are only honored for that same day; one-time
// (urgent-only) folds stay folded regardless of date, until unfolded by
// hand or the task itself expires off the page.
function readFolded():Record<string,string>{
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return {};
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch{
    return {};
  }
}

function writeFolded(map:Record<string,string>){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(map))}
  catch{/* storage may be unavailable (private mode, quota); fold state just won't persist */}
}

export function isTaskFolded(taskId:string,resetsDaily:boolean):boolean{
  const map=readFolded(),foldedOn=map[taskId];
  if(!foldedOn)return false;
  if(resetsDaily&&foldedOn!==shanghaiDate()){
    delete map[taskId];
    writeFolded(map);
    return false;
  }
  return true;
}

export function toggleTaskFolded(taskId:string,resetsDaily:boolean):boolean{
  const map=readFolded(),isFolded=isTaskFolded(taskId,resetsDaily);
  if(isFolded)delete map[taskId];else map[taskId]=shanghaiDate();
  writeFolded(map);
  return !isFolded;
}
