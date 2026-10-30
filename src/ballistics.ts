import { type Point, type Obstacle } from './world';

// Sweep the full segment each frame so fast bullets cannot tunnel through walls.
export function firstWallHit(from: Point, to: Point, obstacles: readonly Obstacle[], height = 0.9): number | null {
  return firstWallImpact(from, to, obstacles, height)?.fraction ?? null;
}
export function firstWallImpact(from: Point, to: Point, obstacles: readonly Obstacle[], height = 0.9, projectile: 'solid' | 'bullet' = 'solid'): { fraction: number; index: number } | null {
  let nearest: { fraction: number; index: number } | null = null;
  for (let index = 0; index < obstacles.length; index++) {
    const wall = obstacles[index];
    if (wall.destroyed || (projectile === 'bullet' && wall.bulletThrough) || height < 0 || height > wall.height) continue;
    let enter = 0, exit = 1;
    for (const [axis, size] of [['x', wall.width], ['z', wall.depth]] as const) {
      const delta = to[axis] - from[axis];
      const low = wall[axis] - size / 2, high = wall[axis] + size / 2;
      if (Math.abs(delta) < 1e-9) {
        if (from[axis] < low || from[axis] > high) { enter = 2; break; }
      } else {
        const a = (low - from[axis]) / delta, b = (high - from[axis]) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (enter <= exit && enter <= 1 && (nearest === null || enter < nearest.fraction)) nearest = { fraction: enter, index };
  }
  return nearest;
}

export function firstArcImpact(from: Point & {y:number}, to: Point & {y:number}, blocks: readonly Obstacle[]) {
  let result: {index:number;fraction:number}|null=null;
  blocks.forEach((b,index)=>{
    if(b.destroyed) return;
    let enter=0,exit=1;
    for(const [axis,low,high] of [['x',b.x-b.width/2,b.x+b.width/2],['y',0,b.height],['z',b.z-b.depth/2,b.z+b.depth/2]] as const) {
      const d=to[axis]-from[axis];
      if(Math.abs(d)<1e-9) {if(from[axis]<low || from[axis]>high) return;}
      else {const a=(low-from[axis])/d,c=(high-from[axis])/d;enter=Math.max(enter,Math.min(a,c));exit=Math.min(exit,Math.max(a,c));}
    }
    if(enter<=exit && (!result || enter<result.fraction)) result={index,fraction:enter};
  });
  return result as {index:number;fraction:number}|null;
}
