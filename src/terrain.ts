import { BLOCK_SIZE, HALF_SIZE, GRID_SIZE, type Point, type Obstacle } from './world';
import type { BlockState } from './blockState';

export type TerrainKind = 'normal' | 'bush' | 'water' | 'rubble' | 'marbleRubble' | 'oil' | 'fire';
export const MARBLE_RUBBLE_HEIGHT = 0.3;
export interface Tile extends Point { kind: TerrainKind }
export const WEAPON_SPEED = { pistol: 5, sword: 6.25, rocket: 3.75, grenade: 5, shotgun: 4.5 };
export const TERRAIN_SPEED = { normal: 1, bush: 0.35, water: 1, rubble: 0.6, marbleRubble: 1, oil: 1, fire: 1 };
export function createTerrain(blocks: BlockState[]) {
  const tiles: Tile[] = [];
  for (let z=0;z<GRID_SIZE;z++) for(let x=0;x<GRID_SIZE;x++) tiles.push({x:-HALF_SIZE+(x+0.5)*BLOCK_SIZE,z:-HALF_SIZE+(z+0.5)*BLOCK_SIZE,kind:'normal'});
  const at = (p:Point) => {
    const x=Math.floor((p.x+HALF_SIZE)/BLOCK_SIZE),z=Math.floor((p.z+HALF_SIZE)/BLOCK_SIZE);
    return x>=0 && x<GRID_SIZE && z>=0 && z<GRID_SIZE ? tiles[z*GRID_SIZE+x] : undefined;
  };
  const kindAt = (p: Point): TerrainKind => {
    const tile = at(p);
    if (!tile) return 'normal';
    return blocks.some(b => !b.destroyed && b.material === 'bush' && at(b) === tile) ? 'bush' : tile.kind;
  };
  // Collision-only proxies: destroyed marble no longer participates in sight or
  // weapon hits, but its persistent low rubble still blocks both pawns.
  const movementObstacles: Obstacle[] = [...blocks, ...blocks.filter(b=>b.material==='marble').map(b=>({
    get x(){return b.x;},get z(){return b.z;},width:b.width,depth:b.depth,height:MARBLE_RUBBLE_HEIGHT,seeThrough:true,
    get destroyed() { return at(b)?.kind!=='marbleRubble'; },
  }))];
  return {
    tiles, kindAt, at, movementObstacles,
    onDestroyed(block: BlockState) {
      if (block.material === 'marble') { const tile=at(block); if(tile) tile.kind='marbleRubble'; return; }
      if (block.material === 'bush') { const tile = at(block); if (tile && tile.kind!=='marbleRubble') tile.kind = 'normal'; return; }
      for (const tile of tiles) if (Math.abs(tile.x-(at(block)?.x ?? block.x)) <= BLOCK_SIZE+0.00001 && Math.abs(tile.z-(at(block)?.z ?? block.z)) <= BLOCK_SIZE+0.00001) {
        if (tile.kind==='marbleRubble') continue;
        if (block.material === 'tank') tile.kind='water';
        else if (tile.kind!=='fire' && tile.kind!=='water') tile.kind = block.material === 'oil' ? 'oil' : 'rubble';
      }
    },
    reset() { for (const tile of tiles) tile.kind = 'normal'; },
  };
}

// Water retains momentum on release and makes turns gradual. Other surfaces stop immediately.
export function movementVelocity(previous: Point, input: Point, weapon: keyof typeof WEAPON_SPEED, terrain: TerrainKind, dt: number, locked: boolean, multiplier=1): Point {
  if (locked) return { x: 0, z: 0 };
  const length = Math.hypot(input.x, input.z);
  const speed = WEAPON_SPEED[weapon] * TERRAIN_SPEED[terrain] * multiplier;
  const target = { x: length ? input.x/length*speed : 0, z: length ? input.z/length*speed : 0 };
  const blend = terrain === 'oil' ? 1-Math.exp(-(length ? 1.2 : 0.45)*dt) : terrain === 'water' ? 1 - Math.exp(-(length ? 3 : 1.8)*dt) : 1;
  return { x: previous.x+(target.x-previous.x)*blend, z: previous.z+(target.z-previous.z)*blend };
}


