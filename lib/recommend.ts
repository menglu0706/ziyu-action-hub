import type {Task} from './types';export function recommend(tasks:Task[],minutes:number){return tasks.filter(t=>t.daily&&t.minutes<=minutes)}
