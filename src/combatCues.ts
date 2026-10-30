import {createSight} from './fog';
import type {Point,Obstacle} from './world';
export type CombatCue=Point & {id:number;kind:'shot'|'explosion';tick:number};
// Sound identifies a coarse area at emission time, never a tracking position.
export const combatSoundArea=(p:Point):Point=>({x:Math.max(-14,Math.min(14,Math.round(p.x/3)*3)),z:Math.max(-14,Math.min(14,Math.round(p.z/3)*3))});
export function createCombatCues(){
 let id=0;const queues:CombatCue[][]=[[],[]];const last=[-100,-100];
 return {
  save(){return {id,queues:structuredClone(queues),last:[...last]};},
  load(data:any){id=data.id;queues.forEach((q,i)=>q.splice(0,q.length,...data.queues[i]));last.splice(0,last.length,...data.last);},
  emit(kind:CombatCue['kind'],p:Point,owner:number|null,tick:number,observers:Point[],blocks:Obstacle[]){
   observers.forEach((observer,i)=>{if(kind==='shot'&&(owner===i||tick-last[i]<8))return;
    if(createSight(observer,blocks).visible(p,kind==='shot'?1:.4))return;
    if(kind==='shot')last[i]=tick;
    queues[i].push({...combatSoundArea(p),id:++id,kind,tick});if(queues[i].length>12)queues[i].shift();
   });
  },
  view(slot:number,tick:number){return queues[slot].filter(c=>tick-c.tick<30);},
  reset(){queues.forEach(q=>q.length=0);last.fill(-100);},
 };
}
