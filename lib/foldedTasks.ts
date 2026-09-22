'use client';

const STORAGE_KEY='ziyu-folded-tasks';

function readFolded():Set<string>{
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return new Set();
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed)?new Set(parsed.map(String)):new Set();
  }catch{
    return new Set();
  }
}

function writeFolded(ids:Set<string>){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...ids]))}
  catch{/* storage may be unavailable (private mode, quota); fold state just won't persist */}
}

export function isTaskFolded(taskId:string):boolean{
  return readFolded().has(taskId);
}

export function toggleTaskFolded(taskId:string):boolean{
  const ids=readFolded();
  const next=!ids.has(taskId);
  if(next)ids.add(taskId);else ids.delete(taskId);
  writeFolded(ids);
  return next;
}
