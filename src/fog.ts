import { containsPoint, sightContext, BLOCK_SIZE, GRID_SIZE, PLAYER_SCALE, type Obstacle, type Point } from './world';
import type { TerrainKind, Tile } from './terrain';

export const FOG_SIZE = 128;
export const EYE_HEIGHT = 1.3 * PLAYER_SCALE;
// Only straight, touching rows share their surface mask, not arbitrary clusters.
export function surfacePeers(index: number, blocks: Obstacle[]): number[] {
  const root = blocks[index];
  if (!root || root.destroyed || root.seeThrough) return [index];
  const result = new Set([index]);
  for (const axis of ['x','z'] as const) {
    const other = axis === 'x' ? 'z' : 'x';
    const row = [index];
    for (let k=0;k<row.length;k++) blocks.forEach((b,i)=>{
      const a = blocks[row[k]];
      const size = axis === 'x' ? 'width' : 'depth';
      if (!b.destroyed && !b.seeThrough && b[other]===root[other] && b.height===root.height && !row.includes(i) &&
          Math.abs(b[axis]-a[axis]) <= (b[size]+a[size])/2+0.0001) row.push(i);
    });
    row.forEach(i=>result.add(i));
  }
  return [...result];
}

export function createSight(p: Point, blocks: Obstacle[]) {
  const context = sightContext(p,blocks);
  // Player/projectile queries never need block-surface peer groups.
  const peers: number[][] = [];
  function visible(target: Point, height = 0, self = -1) {
    if (context.inside && !context.group.some(b=>containsPoint(b,target))) return false;
    for (let i=0;i<blocks.length;i++) {
      const b = blocks[i];
      if (b.destroyed || b.seeThrough || (self >= 0 && (peers[self]??=surfacePeers(self,blocks)).includes(i)) || (context.inside && context.group.includes(b))) continue;
      let enter=0, exit=1;
      const origin = [context.observer.x,EYE_HEIGHT,context.observer.z];
      const end = [target.x,height,target.z];
      const lo = [b.x-b.width/2,0,b.z-b.depth/2], hi=[b.x+b.width/2,b.height,b.z+b.depth/2];
      for (let axis=0;axis<3;axis++) {
        const d=end[axis]-origin[axis];
        if (Math.abs(d)<0.00001) { if (origin[axis]<lo[axis] || origin[axis]>hi[axis]) { enter=2; break; } }
        else { const a=(lo[axis]-origin[axis])/d,c=(hi[axis]-origin[axis])/d; enter=Math.max(enter,Math.min(a,c)); exit=Math.min(exit,Math.max(a,c)); }
      }
      if (exit>=enter && exit>0.001 && enter<0.999) return false;
    }
    return true;
  }
  return { context, get peers(){return blocks.map((_,i)=>peers[i]??=surfacePeers(i,blocks));}, visible };
}

export function createFogMemory(blocks: Obstacle[], tiles: Tile[]) {
  // RGBA: ground explored, block surface explored, unused, opaque.
  const pixels = new Uint8Array(FOG_SIZE*FOG_SIZE*4);
  const knownBlocks: (boolean|null)[] = blocks.map(()=>null); // last observed destroyed state
  const knownTiles: (TerrainKind|null)[] = tiles.map(()=>null);
  const tileIndices = new Int16Array(FOG_SIZE*FOG_SIZE);
  const blockIndices = new Int16Array(FOG_SIZE*FOG_SIZE);
  for (let z=0;z<FOG_SIZE;z++) for (let x=0;x<FOG_SIZE;x++) {
    const p={x:-15+(x+0.5)*30/FOG_SIZE,z:-15+(z+0.5)*30/FOG_SIZE};
    tileIndices[z*FOG_SIZE+x]=tiles.length===GRID_SIZE*GRID_SIZE ? Math.min(GRID_SIZE-1,Math.floor((p.z+15)/BLOCK_SIZE))*GRID_SIZE+Math.min(GRID_SIZE-1,Math.floor((p.x+15)/BLOCK_SIZE)) : tiles.findIndex(t=>Math.abs(t.x-p.x)<BLOCK_SIZE/2 && Math.abs(t.z-p.z)<BLOCK_SIZE/2);
    blockIndices[z*FOG_SIZE+x]=blocks.findIndex(b=>containsPoint(b,p));
  }
  const indexAt = (p: Point) => (Math.max(0,Math.min(FOG_SIZE-1,Math.floor((p.z+15)/30*FOG_SIZE)))*FOG_SIZE+
    Math.max(0,Math.min(FOG_SIZE-1,Math.floor((p.x+15)/30*FOG_SIZE))))*4;
  function reset() { pixels.fill(0); knownBlocks.fill(null); knownTiles.fill(null); }
  return { pixels, knownBlocks, knownTiles, reset, indexAt,
    update(p: Point, kindAt: (p: Point)=>TerrainKind) {
      const sight = createSight(p,blocks);
      // Snapshots update only on direct sight, not merely because the tile was explored.
      blocks.forEach((b,i)=>{
        let seen=false;
        for (const x of [-0.85,0,0.85]) for (const z of [-0.85,0,0.85]) {
          const target={x:b.x+x*b.width/2,z:b.z+z*b.depth/2};
          if (sight.visible(target,b.destroyed ? 0 : b.height,i)) seen=true;
        }
        if (seen) knownBlocks[i]=!!b.destroyed;
      });
      tiles.forEach((t,i)=>{
        if (sight.visible(t) || [-0.4,0.4].some(x=>[-0.4,0.4].some(z=>sight.visible({x:t.x+x*BLOCK_SIZE,z:t.z+z*BLOCK_SIZE})))) knownTiles[i]=kindAt(t);
      });
      for (let z=0;z<FOG_SIZE;z++) for (let x=0;x<FOG_SIZE;x++) {
        const p={x:-15+(x+0.5)*30/FOG_SIZE,z:-15+(z+0.5)*30/FOG_SIZE};
        const at=(z*FOG_SIZE+x)*4;
        const tile = tileIndices[z*FOG_SIZE+x];
        const b = blockIndices[z*FOG_SIZE+x];
        // Remember complete map cells/objects, not the old ray-shaped shadow.
        // Live visibility and snapshot updates above remain independently occluded.
        const knownTile = tile >= 0 && knownTiles[tile] !== null;
        const knownBlock = b >= 0 && knownBlocks[b] !== null;
        if (knownTile || knownBlock || (tile < 0 && sight.visible(p))) pixels[at]=255;
        if (knownBlock) pixels[at+1]=255;
        pixels[at+3]=255;
      }
      return sight;
    },
  };
}
