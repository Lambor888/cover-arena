import { firstWallImpact } from './ballistics';
import { SWORD_HALF_ANGLE, SWORD_RANGE } from './combat';
import type { Point, Obstacle } from './world';

export interface CombatTarget { knockback?: (origin:Point,yaw:number)=>void; position: Point; radius: number; hit: (weapon: 'pistol'|'sword'|'rocket'|'grenade'|'shotgun')=>void }
export function segmentCircle(from: Point, to: Point, center: Point, radius: number): number|null {
  const x=from.x-center.x,z=from.z-center.z,dx=to.x-from.x,dz=to.z-from.z;
  const c=x*x+z*z-radius*radius;
  if (c<=0) return 0;
  const a=dx*dx+dz*dz;
  if (a<1e-12) return null;
  const b=x*dx+z*dz, disc=b*b-a*c;
  if (disc<0) return null;
  const t=(-b-Math.sqrt(disc))/a;
  return t>=0 && t<=1 ? t : null;
}
export function firstActorImpact(from: Point, to: Point, targets: CombatTarget[], wallFraction = Infinity) {
  let nearest: { target: CombatTarget; fraction: number }|null=null;
  for (const target of targets) {
    const t=segmentCircle(from,to,target.position,target.radius);
    if (t!==null && t<wallFraction && (!nearest || t<nearest.fraction)) nearest={target,fraction:t};
  }
  return nearest;
}
export function swordHitsActor(position: Point, yaw: number, target: CombatTarget, blocks: Obstacle[]) {
  // Sample the same fan as environmental attacks; walls win ties.
  for (let i=0;i<=96;i++) {
    const angle=yaw-SWORD_HALF_ANGLE+2*SWORD_HALF_ANGLE*i/96;
    const end={x:position.x+Math.sin(angle)*SWORD_RANGE,z:position.z+Math.cos(angle)*SWORD_RANGE};
    const wall=firstWallImpact(position,end,blocks);
    if (firstActorImpact(position,end,[target],wall?.fraction)) return true;
  }
  return false;
}

