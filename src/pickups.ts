import {canStand,type Point} from './world';
import type {createTerrain} from './terrain';
import type {Vitals} from './vitals';
export type Pickup=Point&{id:number;kind:'health'|'ammo'|'rage'};
export function createPickups(terrain:ReturnType<typeof createTerrain>,random=Math.random){
 const items:Pickup[]=[];let elapsed=0,id=0;
 const safe=(p:Point)=>['normal','oil','water','rubble'].includes(terrain.kindAt(p))&&canStand(p,terrain.movementObstacles);
 return {items,save(){return {items:structuredClone(items),elapsed,id};},load(data:any){items.splice(0,items.length,...data.items);elapsed=data.elapsed;id=data.id;},reset(){items.length=0;elapsed=0;},update(dt:number,actors:{position:Point;vitals:Vitals;refill:()=>void}[]){
  for(let i=items.length-1;i>=0;i--){const item=items[i];if(!safe(item)){items.splice(i,1);continue;}const actor=actors.find(a=>a.vitals.hp>0&&Math.hypot(a.position.x-item.x,a.position.z-item.z)<.65);if(!actor)continue;
   if(item.kind==='health')actor.vitals.hp=Math.min(100,actor.vitals.hp+35);
   if(item.kind==='rage')actor.vitals.rage=Math.min(100,actor.vitals.rage+35);
   if(item.kind==='ammo')actor.refill();items.splice(i,1);
  }
  elapsed+=dt;if(elapsed<8)return;elapsed%=8;if(items.length>=9)return;
  const candidates=terrain.tiles.filter(p=>safe(p)&&items.every(i=>Math.hypot(i.x-p.x,i.z-p.z)>1)&&actors.every(a=>Math.hypot(a.position.x-p.x,a.position.z-p.z)>2));
  if(!candidates.length)return;const p=candidates[Math.floor(random()*candidates.length)];items.push({x:p.x,z:p.z,id:++id,kind:((roll:number)=>roll<.55?'health':roll<.85?'rage':'ammo')(random())});
 }};
}
