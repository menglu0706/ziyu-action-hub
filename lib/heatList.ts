import {pickHeat} from './heat';
import type {Task} from './types';

export {HEAT_TAB_LIMIT} from './heat';
// The cards /heat shows (lib/heat.ts's pickHeat, shared with the watcher's rotation).
export const pickHeatTasks=(tasks:Task[])=>pickHeat(tasks);

// /heat's sections: when both kinds are shown, 红膏 on top and 空瓶 below (each keeping pickHeatTasks'
// order); otherwise one untitled section. Tasks made in admin (no kind) go with 红膏.
export function groupHeatTasks(tasks:Task[]):{kind:'红膏'|'空瓶'|null;tasks:Task[]}[]{
  const fight=tasks.filter(task=>task.heatKind==='空瓶'),rest=tasks.filter(task=>task.heatKind!=='空瓶');
  return fight.length&&rest.length?[{kind:'红膏',tasks:rest},{kind:'空瓶',tasks:fight}]:[{kind:null,tasks}];
}
