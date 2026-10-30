import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlockStates, damageBlock } from './blockState';
import { canStand, isOccluded, movePlayer, BLOCK_SIZE, GRID_SIZE, PLAYER_SCALE, PLAYER_RADIUS } from './world';
import { firstWallImpact } from './ballistics';
import { createTerrain, movementVelocity } from './terrain';
import { createArsenal } from './arsenal';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';

test('bush separates sight, movement, bullets and melee; tank is transparent but solid', () => {
  const blocks = createBlockStates();
  const bush = { ...blocks[10], x: 0, z: 0, width:1.2, depth:1.2 };
  const tank = { ...blocks[14], x: 0, z: 4 };
  const from = { x: 0, z: -4 }, to = { x: 0, z: 8 };
  assert.equal(canStand(bush, [bush]), true);
  assert.equal(isOccluded(from, to, [bush]), true);
  assert.equal(isOccluded(bush, to, [bush]), true);
  assert.equal(firstWallImpact(from, to, [bush, tank], 0.9, 'bullet')?.index, 1);
  assert.equal(firstWallImpact(from, to, [bush, tank])?.index, 0);
  assert.equal(canStand(tank, [tank]), false);
  assert.equal(isOccluded(from, to, [tank]), false);
  assert.equal(damageBlock(bush), false);
  assert.equal(damageBlock(bush, true), false);
  assert.equal(damageBlock(bush, false, true), false);
  assert.equal(damageBlock(bush, false, true), false);
  assert.equal(damageBlock(bush, false, true), true);
  assert.equal(damageBlock(tank), false);
  assert.equal(damageBlock(tank), false);
  assert.equal(damageBlock(tank), true);
});

test('terrain spreads to nine aligned cells, active bushes take precedence, clearing and reset work', () => {
  const blocks = createBlockStates();
  const terrain = createTerrain(blocks);
  assert.equal(terrain.tiles.length, 30*30);
  assert.equal(terrain.kindAt(blocks[10]), 'bush');
  terrain.onDestroyed(blocks[14]);
  assert.equal(terrain.tiles.filter(t=>t.kind==='water').length, 9);
  assert.equal(terrain.kindAt(blocks[14]), 'water');
  terrain.onDestroyed(blocks[0]);
  assert.equal(terrain.kindAt(blocks[0]), 'rubble');
  assert.equal(terrain.kindAt(blocks[10]), 'bush');
  blocks[10].destroyed = true; terrain.onDestroyed(blocks[10]);
  assert.equal(terrain.kindAt(blocks[10]), 'normal');
  terrain.reset();
  assert.equal(terrain.tiles.every(t=>t.kind==='normal'), true);
});

test('weapon and surface speed stack, water coasts and turns gradually, sword lock stops drift', () => {
  const zero = {x:0,z:0}, forward = {x:0,z:1};
  assert.equal(movementVelocity(zero, forward, 'pistol', 'normal', 0.05, false).z, 5);
  assert.equal(movementVelocity(zero, forward, 'sword', 'normal', 0.05, false).z, 6.25);
  assert.equal(movementVelocity(zero, forward, 'rocket', 'rubble', 0.05, false).z, 2.25);
  assert.equal(movementVelocity(zero, forward, 'pistol', 'bush', 0.05, false).z, 1.75);
  const coast = movementVelocity({x:0,z:5}, zero, 'pistol', 'water', 0.05, false);
  assert.ok(coast.z > 0 && coast.z < 5);
  const turn = movementVelocity({x:0,z:5}, {x:1,z:0}, 'pistol', 'water', 0.05, false);
  assert.ok(turn.x > 0 && turn.z > 0);
  assert.deepEqual(movementVelocity(coast, forward, 'sword', 'water', 0.05, true), zero);
  assert.deepEqual(movementVelocity(coast, zero, 'pistol', 'normal', 0.05, false), zero);
  const end = movePlayer({x:0,z:-2}, 0, 10, [{x:0,z:0,width:2,depth:2,height:2}]);
  assert.ok(end.z < -1);
});

test('bush absorbs an incoming rocket without blast damage to surrounding blocks', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const m = new StandardMaterial('test', scene);
    const bush = {...createBlockStates()[10], x:0,z:2};
    const hits: number[] = [];
    const weapons = createArsenal(scene,{bullet:m,steel:m,fire:m,slash:m,blast:m},[bush],i=>hits.push(i));
    weapons.select('rocket'); weapons.fire({x:0,z:0},0); weapons.update(0.3);
    assert.deepEqual(hits,[]);
    assert.equal(scene.meshes.some(m=>m.name==='rocket-shell'||m.name==='rocket-explosion'),false);
    assert.equal(scene.meshes.some(m=>m.name==='rocket-absorbed'),true);
  } finally { scene.dispose(); engine.dispose(); }
});

test('30 grid covers the arena exactly with unchanged player scale and constant-time cell lookup',()=>{
  const terrain=createTerrain(createBlockStates());
  assert.equal(GRID_SIZE,30);assert.equal(terrain.tiles.length,900);
  assert.equal(terrain.tiles[0].x-BLOCK_SIZE/2,-15);
  assert.equal(terrain.tiles.at(-1)!.x+BLOCK_SIZE/2,15);
  assert.equal(terrain.at({x:-15,z:-15}),terrain.tiles[0]);
  assert.equal(terrain.at({x:15,z:0}),undefined);
  assert.equal(PLAYER_SCALE,.8);assert.equal(PLAYER_RADIUS,.43*.8);
  for(const tile of terrain.tiles) assert.equal(terrain.at(tile),tile);
});
test('additional test walls are single-row and have unique independent cells',()=>{
  const blocks=createBlockStates();
  assert.equal(blocks.length,73);
  assert.equal(new Set(blocks.map(b=>`${b.x},${b.z}`)).size,blocks.length);
  for(let start=43;start<73;start+=5) {
    const wall=blocks.slice(start,start+5);
    assert.ok(wall.every(b=>b.material===wall[0].material));
    const xs=new Set(wall.map(b=>b.x)).size,zs=new Set(wall.map(b=>b.z)).size;
    assert.ok((xs===1 && zs===5)||(xs===5 && zs===1));
    damageBlock(wall[0],true,true);
    assert.ok(wall.slice(1).every(b=>!b.destroyed));
  }
});
