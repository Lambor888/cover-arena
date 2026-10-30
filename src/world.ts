export interface Point { x: number; z: number }
export interface Obstacle extends Point { width: number; depth: number; height: number; destroyed?: boolean; walkThrough?: boolean; seeThrough?: boolean; bulletThrough?: boolean; absorbsRocket?: boolean }
export const HALF_SIZE = 15;
export const PLAYER_SCALE = 0.8;
export const PLAYER_RADIUS = 0.43 * PLAYER_SCALE;
export const SPAWN: Point = { x: 0, z: -9 };
export const GRID_SIZE = 30;
export const BLOCK_SIZE = HALF_SIZE * 2 / GRID_SIZE;
export const snapToCell = (v:number) => -HALF_SIZE+(Math.floor((v+HALF_SIZE)/BLOCK_SIZE)+0.5)*BLOCK_SIZE;
export const BLOCK_HEIGHT = 1.8;
// Integer grid coordinates keep every block aligned and equally sized.
const BLOCK_CELLS = [
  [-2, -3], [2, -2], [-1, 1], [-4, 1], [3, 2],
  [0, 4], [-4, -5], [5, -4], [-4, 5], [4, 5],
  [-1, -3], [0, -3], [1, -3], [-3, 3], [2, 0], [-2, 4],
  // Southern sight-test row: wood, marble, bush, bush, tank, wood.
  [-3, -10], [-2, -10], [-1, -10], [0, -10], [1, -10], [2, -10],
  [-8, -6], [-7, -6], [7, -5], [8, -5],
  [-8, -1], [-7, -1], [7, 0], [8, 0],
  [-7, 5], [-6, 5], [7, 5], [8, 5],
  [-3, 9], [-2, 9], [2, 9], [3, 9],
  [-4, -6], [-5, -6], [-5, -5], [5, 3], [5, 4],
] as const;
export const OBSTACLES: Obstacle[] = BLOCK_CELLS.map(([x, z]) => ({
  x: snapToCell(x * 1.2), z: snapToCell(z * 1.2),
  width: BLOCK_SIZE, depth: BLOCK_SIZE, height: BLOCK_HEIGHT,
}));

// Six single-row test walls with open routes between them.
export const TEST_WALLS = [
  {x:-12,z:-11,axis:'x'}, {x:7,z:-11,axis:'x'},
  {x:-12,z:-3,axis:'z'}, {x:12,z:-3,axis:'z'},
  {x:-5,z:8,axis:'x'}, {x:2,z:8,axis:'x'},
] as const;
for (const wall of TEST_WALLS) for(let cell=0;cell<5;cell++) {
  OBSTACLES.push({x:snapToCell(wall.x)+(wall.axis==='x'?cell*BLOCK_SIZE:0),z:snapToCell(wall.z)+(wall.axis==='z'?cell*BLOCK_SIZE:0),width:BLOCK_SIZE,depth:BLOCK_SIZE,height:BLOCK_HEIGHT});
}

export function canStand(p: Point, obstacles = OBSTACLES): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
  if (Math.abs(p.x) > HALF_SIZE - PLAYER_RADIUS || Math.abs(p.z) > HALF_SIZE - PLAYER_RADIUS) return false;
  return !obstacles.some(b => {
    if (b.destroyed || b.walkThrough) return false;
    const dx = Math.max(Math.abs(p.x - b.x) - b.width / 2, 0);
    const dz = Math.max(Math.abs(p.z - b.z) - b.depth / 2, 0);
    return dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS;
  });
}

// Small steps prevent tunnelling. Axis separation lets the pawn slide along walls.
export function movePlayer(p: Point, dx: number, dz: number, obstacles = OBSTACLES): Point {
  // Babylon Vector3 exposes x/z through getters; spreading it copies _x/_z instead.
  const result: Point = { x: p.x, z: p.z };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let i = 0; i < steps; i++) {
    const nx = { x: result.x + dx / steps, z: result.z };
    if (canStand(nx, obstacles)) result.x = nx.x;
    const nz = { x: result.x, z: result.z + dz / steps };
    if (canStand(nz, obstacles)) result.z = nz.z;
  }
  return result;
}

export function containsPoint(b: Obstacle, p: Point): boolean {
  return Math.abs(p.x-b.x) <= b.width/2 && Math.abs(p.z-b.z) <= b.depth/2;
}

// Adjacent bushes form one enclosure. Internal tile edges are not entry/exit edges.
export function sightContext(p: Point, obstacles: Obstacle[]) {
  const bushes = obstacles.filter(b => b.walkThrough && !b.destroyed && !b.seeThrough);
  const group = bushes.filter(b => containsPoint(b,p));
  for (let i=0; i<group.length; i++) for (const b of bushes) {
    if (!group.includes(b) && Math.abs(b.x-group[i].x) <= (b.width+group[i].width)/2+0.00001 && Math.abs(b.z-group[i].z) <= (b.depth+group[i].depth)/2+0.00001 &&
        (b.x===group[i].x || b.z===group[i].z)) group.push(b);
  }
  let nearest = Infinity;
  let observer = { x:p.x, z:p.z };
  for (const b of group) for (const [axis, other, size, otherSize] of [['x','z',b.width,b.depth], ['z','x',b.depth,b.width]] as const) for (const sign of [-1,1]) {
    const edge = b[axis]+sign*size/2;
    const probe = {x:b.x,z:b.z}; probe[axis] = edge+sign*0.001;
    if (group.some(n=>n!==b && containsPoint(n,probe))) continue;
    const point = {x:p.x,z:p.z}; point[axis]=edge;
    point[other]=Math.max(b[other]-otherSize/2,Math.min(b[other]+otherSize/2,p[other]));
    const distance = Math.hypot(point.x-p.x,point.z-p.z);
    if (distance < nearest) { nearest=distance; observer={...point}; observer[axis]+=sign*0.002; }
  }
  const inside = group.length > 0 && nearest >= PLAYER_RADIUS;
  return { observer: inside ? {x:p.x,z:p.z} : observer, inside, group };
}

// Segment / rectangle slab intersection; matches the GPU visibility shader.
export function isOccluded(from: Point, to: Point, obstacles = OBSTACLES, self = -1): boolean {
  const context = sightContext(from,obstacles);
  from = context.observer;
  if (context.inside && !context.group.some(b=>containsPoint(b,to))) return true;
  return obstacles.some((b, index) => {
    if (index === self || b.destroyed || b.seeThrough) return false;
    if (context.inside && context.group.includes(b)) return false;
    let near = 0, far = 1;
    for (const [axis, half] of [['x', b.width / 2], ['z', b.depth / 2]] as const) {
      const d = to[axis] - from[axis];
      const min = b[axis] - half, max = b[axis] + half;
      if (Math.abs(d) < 0.00001) {
        if (from[axis] < min || from[axis] > max) return false;
      } else {
        const a = (min - from[axis]) / d, c = (max - from[axis]) / d;
        near = Math.max(near, Math.min(a, c));
        far = Math.min(far, Math.max(a, c));
      }
    }
    return far >= near && far > 0.001 && near < 0.999;
  });
}

