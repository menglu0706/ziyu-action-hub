import type {Task} from './types';

export const HEAT_TAB_LIMIT=15;
// When both kinds are live, each keeps at least this many places on /heat.
const HEAT_KIND_MIN=2;

// /heat's order: original posts before reposts, newest first within each.
const byRank=(a:Task,b:Task)=>Number(Boolean(a.heatRepost))-Number(Boolean(b.heatRepost))||(b.createdAt??'').localeCompare(a.createdAt??'');

// The cards /heat shows: the best-ranked HEAT_TAB_LIMIT, except that a kind (红膏 / 空瓶) with fewer
// than HEAT_KIND_MIN of them takes the places of the lowest-ranked cards of the other kind.
export function pickHeatTasks(tasks:Task[],limit=HEAT_TAB_LIMIT){
  const ranked=[...tasks].sort(byRank),chosen=ranked.slice(0,limit),rest=ranked.slice(limit);
  const count=(kind:string)=>chosen.filter(task=>task.heatKind===kind).length;
  for(const kind of ['红膏','空瓶'] as const){
    const extras=rest.filter(task=>task.heatKind===kind);
    while(count(kind)<HEAT_KIND_MIN&&extras.length){
      // The lowest-ranked card that can give up its place: not this kind, and not taking the other kind below its minimum.
      const index=chosen.findLastIndex(task=>task.heatKind!==kind&&(!task.heatKind||count(task.heatKind)>HEAT_KIND_MIN));
      if(index<0)break;
      chosen.splice(index,1);
      chosen.push(extras.shift()!);
    }
  }
  return chosen.sort(byRank);
}

// /heat's sections: when both kinds are shown, 红膏 on top and 空瓶 below (each keeping pickHeatTasks'
// order); otherwise one untitled section. Tasks made in admin (no kind) go with 红膏.
export function groupHeatTasks(tasks:Task[]):{kind:'红膏'|'空瓶'|null;tasks:Task[]}[]{
  const fight=tasks.filter(task=>task.heatKind==='空瓶'),rest=tasks.filter(task=>task.heatKind!=='空瓶');
  return fight.length&&rest.length?[{kind:'红膏',tasks:rest},{kind:'空瓶',tasks:fight}]:[{kind:null,tasks}];
}
