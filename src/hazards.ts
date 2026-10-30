import {inShotgunCone,SHOTGUN_ULTIMATE_RANGE,SHOTGUN_HALF_ANGLE} from './shotgun';
import { damageBlock, type BlockState } from './blockState';
import type { createTerrain } from './terrain';
import { PLAYER_RADIUS, type Point } from './world';
import { BLAST_RADIUS } from './combat';

export const OIL_BLAST_RADIUS = 3;
export function createCondition(position: Point) {
  return { position, flammable: false, burning: false, flash: 0, phase: 0, impacts: 0 };
}
export type Condition = ReturnType<typeof createCondition>;
export function conditionFlash(actor: Condition): 'red' | 'white' | null {
  if (Math.floor(actor.phase/0.12)%2!==0) return null;
  if (actor.burning) return 'red';
  return actor.flammable || actor.flash>0 ? 'white' : null;
}
export function createHazards(blocks: BlockState[], terrain: ReturnType<typeof createTerrain>, actors: Condition[], changed: (index: number)=>void, visual: (p: Point,r: number)=>void, hurt?: (actor:Condition,damage:number)=>void) {
  function destroy(i: number) { terrain.onDestroyed(blocks[i]); changed(i); }
  function paint(p: Point, radius: number, all: boolean) {
    for (const tile of terrain.tiles) if (Math.hypot(tile.x-p.x,tile.z-p.z)<=radius && tile.kind!=='water' && tile.kind!=='marbleRubble' && (all || tile.kind==='oil')) tile.kind='fire';
  }
  function explode(p: Point, radius=BLAST_RADIUS, incendiary=false, damage=45) {
    // Vector3 exposes x/z through accessors; object spread copies its private
    // fields instead. Snapshot coordinates explicitly for every caller.
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(radius) || radius<=0) return;
    const queue=[{p:{x:p.x,z:p.z},radius,incendiary,damage}];
    const burnedBushes=new Set<number>();
    for (let q=0;q<queue.length;q++) {
      const blast=queue[q]; visual(blast.p,blast.radius);
      for (const actor of actors) if (Math.hypot(actor.position.x-blast.p.x,actor.position.z-blast.p.z)<=blast.radius+0.344) {
        actor.flash=0.55; actor.impacts++; hurt?.(actor,blast.damage);
        if (actor.flammable) actor.burning=true;
        blocks.forEach((b,i)=>{
          if (!b.destroyed && b.material==='bush' && Math.abs(actor.position.x-b.x)<=b.width/2 && Math.abs(actor.position.z-b.z)<=b.depth/2 && !burnedBushes.has(i)) {
            burnedBushes.add(i); b.destroyed=true; destroy(i);
            queue.push({p:{x:b.x,z:b.z},radius:1.8,incendiary:true,damage:15});
          }
        });
      }
      blocks.forEach((b,i)=>{
        const distance=Math.hypot(Math.max(0,Math.abs(b.x-blast.p.x)-b.width/2),Math.max(0,Math.abs(b.z-blast.p.z)-b.depth/2));
        if (b.destroyed || !(distance<=blast.radius)) return;
        if (b.material==='bush' && !blast.incendiary) return;
        b.destroyed=true; destroy(i);
        if (b.material==='oil') queue.push({p:{x:b.x,z:b.z},radius:OIL_BLAST_RADIUS,incendiary:true,damage:60});
      });
      paint(blast.p,blast.radius,blast.incendiary);
    }
  }
  return {
    explode,
    breakForDash(i:number){const b=blocks[i];if(!b.destroyed){b.destroyed=true;destroy(i);}},
    igniteCone(p:Point,yaw:number,ultimate=false) {
      if(ultimate){
        const inside=(q:Point)=>Math.hypot(q.x-p.x,q.z-p.z)<=SHOTGUN_ULTIMATE_RANGE && (q.x-p.x)*Math.sin(yaw)+(q.z-p.z)*Math.cos(yaw)>=Math.hypot(q.x-p.x,q.z-p.z)*Math.cos(SHOTGUN_HALF_ANGLE)-1e-6;
        blocks.forEach((b,i)=>{if(!b.destroyed&&inside(b)){b.destroyed=true;destroy(i);}});
        for(const tile of terrain.tiles)if(tile.kind==='oil'&&inside(tile))tile.kind='fire';
        return;
      }
      for(const tile of terrain.tiles)if(tile.kind==='oil'&&inShotgunCone(p,yaw,tile,blocks))tile.kind='fire';
    },
    spreadFuel(p:Point) {
      const center=terrain.at(p);if(!center)return;
      const step=terrain.tiles[1].x-terrain.tiles[0].x;
      for(const tile of terrain.tiles) if(Math.abs(tile.x-center.x)<=step+.0001 && Math.abs(tile.z-center.z)<=step+.0001 && !['water','marbleRubble','fire'].includes(tile.kind)) tile.kind='oil';
    },
    attackBlock(i: number, explosive=false, melee=false) {
      const b=blocks[i];
      if (b.destroyed) return;
      if (explosive) { explode(b); return; }
      if (damageBlock(b,false,melee)) destroy(i);
    },
    update(dt: number) {
      for (const actor of actors) {
        actor.phase+=dt; actor.flash=Math.max(0,actor.flash-dt);
        const kind=terrain.kindAt(actor.position);
        if (kind==='water') { actor.burning=false; actor.flammable=false; }
        if (kind==='oil') {
          actor.flammable=true;
          if (actor.burning) {
            const tile=terrain.at(actor.position);
            if (tile?.kind==='oil') tile.kind='fire';
          }
        }
        if (kind==='fire') { actor.flash=0.2; if(actor.flammable) actor.burning=true; }
        if (actor.burning) {
          // Contact burning removes only overlapping bushes, without blast damage
          // or igniting neighboring blocks/terrain. Include partial body entry.
          blocks.forEach((b,i)=>{
            if (b.destroyed || b.material!=='bush') return;
            const dx=Math.max(0,Math.abs(actor.position.x-b.x)-b.width/2);
            const dz=Math.max(0,Math.abs(actor.position.z-b.z)-b.depth/2);
            if (dx*dx+dz*dz < PLAYER_RADIUS*PLAYER_RADIUS) {
              b.destroyed=true; destroy(i);
            }
          });
        } else if (kind==='bush') {
          actor.flammable=false;
        }
        if (actor.burning) actor.flash=0.2;
        if (actor.burning || kind==='fire') hurt?.(actor,8*dt);
      }
    },
    reset() { for (const a of actors) {a.flammable=false;a.burning=false;a.flash=0;a.phase=0;a.impacts=0;} },
  };
}

