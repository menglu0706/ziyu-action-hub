'use client';
import {shanghaiDate} from './shanghaiDate';

const STORAGE_KEY='ziyu-folded-tasks';

// Maps taskId -> {d: the Shanghai calendar date it was folded on, r: whether
// this fold resets daily (task.daily) or persists until manually unfolded
// (urgent-only tasks). `r` is stored per-entry (not just passed in at call
// time) so a sweep can safely expire stale daily entries platform-wide, even
// for a task that has stopped rendering entirely and will never be checked
// again on its own.
type Entry={d:string;r:boolean};
type FoldedMap=Record<string,Entry>;

function readFolded():FoldedMap{
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return {};
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {};
    const today=shanghaiDate(),map:FoldedMap={};
    let changed=false;
    for(const [id,entry] of Object.entries(parsed as Record<string,Partial<Entry>>)){
      if(!entry||typeof entry.d!=='string'){changed=true;continue}
      if(entry.r&&entry.d!==today){changed=true;continue} // sweep stale daily folds
      map[id]={d:entry.d,r:Boolean(entry.r)};
    }
    if(changed)writeFolded(map);
    return map;
  }catch{
    return {};
  }
}

function writeFolded(map:FoldedMap){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(map))}
  catch{/* storage may be unavailable (private mode, quota); fold state just won't persist */}
}

export function isTaskFolded(taskId:string,resetsDaily:boolean):boolean{
  const entry=readFolded()[taskId];
  if(!entry)return false;
  if(resetsDaily&&entry.d!==shanghaiDate())return false; // already swept by readFolded, but stay correct either way
  return true;
}

export function toggleTaskFolded(taskId:string,resetsDaily:boolean):boolean{
  const map=readFolded(),isFolded=isTaskFolded(taskId,resetsDaily);
  if(isFolded)delete map[taskId];else map[taskId]={d:shanghaiDate(),r:resetsDaily};
  writeFolded(map);
  return !isFolded;
}
