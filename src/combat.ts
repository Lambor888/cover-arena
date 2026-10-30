import { firstWallImpact } from './ballistics';
import type { Obstacle, Point } from './world';

export const SWORD_RANGE = 2.8;
export const SWORD_HALF_ANGLE = Math.PI / 3;
export const SWORD_SWING_DURATION = 0.12;
export const ROCKET_SPEED = 54;
export const ROCKET_INITIAL_SPEED = 2;
export const ROCKET_ACCELERATION = 30;
export function rocketDistance(age: number) {
  const ramp=Math.min(age,(ROCKET_SPEED-ROCKET_INITIAL_SPEED)/ROCKET_ACCELERATION);
  return ROCKET_INITIAL_SPEED*ramp+0.5*ROCKET_ACCELERATION*ramp*ramp+ROCKET_SPEED*(age-ramp);
}
export const GRENADE_INTERVAL = 1.8;
export function grenadePoint(start: {x:number;z:number}, end: {x:number;z:number}, progress: number) {
  const t=Math.max(0,Math.min(1,progress));
  const peak=Math.max(3.2,Math.min(7,Math.hypot(end.x-start.x,end.z-start.z)*0.25));
  return {x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t,y:0.9*(1-t)+4*peak*t*(1-t)};
}
export const ROCKET_LIFETIME = 3;
export const ROCKET_INTERVAL = 2.5;
export const BLAST_RADIUS = 3;

export function blastTargets(center: Point, blocks: Obstacle[], radius = BLAST_RADIUS): number[] {
  return blocks.flatMap((b, index) => {
    const dx = Math.max(0, Math.abs(center.x - b.x) - b.width / 2);
    const dz = Math.max(0, Math.abs(center.z - b.z) - b.depth / 2);
    return !b.destroyed && dx * dx + dz * dz <= radius * radius ? [index] : [];
  });
}

export function swordTargets(position: Point, yaw: number, blocks: Obstacle[]): number[] {
  // Sweep a fan of finite rays: only the closest block on each ray takes damage.
  const targets = new Set<number>();
  for (let i = 0; i <= 48; i++) {
    const angle = yaw - SWORD_HALF_ANGLE + 2 * SWORD_HALF_ANGLE * i / 48;
    const end = { x: position.x + Math.sin(angle) * SWORD_RANGE, z: position.z + Math.cos(angle) * SWORD_RANGE };
    const hit = firstWallImpact(position, end, blocks);
    if (hit) targets.add(hit.index);
  }
  return [...targets];
}
