import {firstWallImpact} from './ballistics';
import {segmentCircle,type CombatTarget} from './actorCombat';
import {movePlayer,type Point,type Obstacle} from './world';
export const SHOTGUN_RANGE=7;
export const SHOTGUN_HALF_ANGLE=Math.PI/4;
export const SHOTGUN_ULTIMATE_RANGE=9;
export const SHOTGUN_PUSH=2.5;
// Snapshot every ray before any block is destroyed so one shot cannot pierce cover.
export function shotgunCone(origin:Point,yaw:number,blocks:Obstacle[],targets:CombatTarget[]=[],ultimate=false) {
 const hitBlocks=new Set<number>(),hitActors=new Set<CombatTarget>(),ends:Point[]=[];
 for(let i=0;i<=96;i++){
  const half=SHOTGUN_HALF_ANGLE;const range=ultimate?SHOTGUN_ULTIMATE_RANGE:SHOTGUN_RANGE;
  const angle=yaw-half+2*half*i/96;
  const end={x:origin.x+Math.sin(angle)*range,z:origin.z+Math.cos(angle)*range};
  const wall=ultimate?null:firstWallImpact(origin,end,blocks,.9,'bullet');
  if(wall)hitBlocks.add(wall.index);
  for(const target of targets){const t=segmentCircle(origin,end,target.position,target.radius);if(t!==null&&t<(wall?.fraction??Infinity))hitActors.add(target);}
  const f=wall?.fraction??1;ends.push({x:origin.x+(end.x-origin.x)*f,z:origin.z+(end.z-origin.z)*f});
 }
 return {hitBlocks,hitActors,ends};
}
export function inShotgunCone(origin:Point,yaw:number,p:Point,blocks:Obstacle[]) {
 const dx=p.x-origin.x,dz=p.z-origin.z,d=Math.hypot(dx,dz);
 return d<=SHOTGUN_RANGE&&(d<.0001||(dx*Math.sin(yaw)+dz*Math.cos(yaw))/d>=Math.cos(SHOTGUN_HALF_ANGLE)-1e-8)&&!firstWallImpact(origin,p,blocks,.9,'bullet');
}
export function pushFrom(position:Point,origin:Point,yaw:number,blocks:Obstacle[]) {
 const dx=position.x-origin.x,dz=position.z-origin.z,d=Math.hypot(dx,dz);
 const next=movePlayer(position,(d>.0001?dx/d:Math.sin(yaw))*SHOTGUN_PUSH,(d>.0001?dz/d:Math.cos(yaw))*SHOTGUN_PUSH,blocks);
 position.x=next.x;position.z=next.z;
}

