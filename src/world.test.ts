import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { canStand, movePlayer, isOccluded, sightContext, HALF_SIZE, PLAYER_RADIUS, SPAWN, type Obstacle } from './world';

const wall: Obstacle[] = [{ x: 0, z: 0, width: 2, depth: 2, height: 2 }];
test('real Babylon pawn position stays finite on first movement and subsequent frames', () => {
  const position = new Vector3(SPAWN.x, 0, SPAWN.z);
  const first = movePlayer(position, 0, 0.08);
  assert.equal(first.x, SPAWN.x);
  assert.ok(Math.abs(first.z - (SPAWN.z + 0.08)) < 1e-9);
  assert.equal(position.z, SPAWN.z, 'movement must not mutate its input');
  for (let frame = 0; frame < 240; frame++) {
    const next = movePlayer(position, 0, 0.08);
    assert.ok(Number.isFinite(next.x) && Number.isFinite(next.z));
    assert.ok(canStand(next));
    position.x = next.x;
    position.z = next.z;
  }
});
test('spawn is free and arena boundary contains the whole player', () => {
  assert.equal(canStand({ x: NaN, z: 0 }), false);
  assert.equal(canStand({ x: 0, z: Infinity }), false);
  assert.ok(canStand(SPAWN));
  assert.ok(!canStand({ x: HALF_SIZE, z: 0 }, []));
  const end = movePlayer({ x: 0, z: 0 }, 100, 0, []);
  assert.ok(end.x <= HALF_SIZE - PLAYER_RADIUS);
});
test('large movement cannot tunnel through a wall', () => {
  const end = movePlayer({ x: -4, z: 0 }, 10, 0, wall);
  assert.ok(end.x <= -1 - PLAYER_RADIUS);
  assert.ok(canStand(end, wall));
});
test('movement slides along an obstacle instead of sticking', () => {
  const end = movePlayer({ x: -1.5, z: 0 }, 0.5, 0.6, wall);
  assert.ok(end.z > 0.5);
  assert.ok(canStand(end, wall));
});
test('wall hides the region behind it, but not in front or beside', () => {
  const player = { x: 0, z: -4 };
  assert.equal(isOccluded(player, { x: 0, z: 4 }, wall), true);
  assert.equal(isOccluded(player, { x: 0, z: -2 }, wall), false);
  assert.equal(isOccluded(player, { x: 4, z: 0 }, wall), false);
});
test('walking around a wall reveals the same target', () => {
  assert.equal(isOccluded({ x: 4, z: -4 }, { x: 4, z: 4 }, wall), false);
  assert.equal(isOccluded({ x: -4, z: 0 }, { x: 4, z: 0 }, wall), true);
  assert.equal(isOccluded({ x: -4, z: 2 }, { x: 4, z: 2 }, wall), false);
});

test('touching blocks seal the sight seam while transparent tanks leave a sight opening', () => {
  const row = [-4,-2,0,2].map(x=>({x,z:0,width:2,depth:2,height:2,seeThrough:x===2}));
  for (const x of [-3.001,-3,-2.999,-1.001,-1,-0.999]) {
    assert.equal(isOccluded({x,z:-4},{x,z:4},row),true);
    assert.equal(isOccluded({x,z:-4},{x,z:-1.01},row),false);
  }
  assert.equal(isOccluded({x:2,z:-4},{x:2,z:4},row),false);
});

test('one block can have both hidden and visible surface points without revealing the whole block', () => {
  const blocks = [{x:0,z:0,width:2,depth:2,height:2}, {x:2,z:4,width:2,depth:2,height:2}];
  const player = {x:0,z:-4};
  assert.equal(isOccluded(player,{x:1.1,z:4},blocks,1),true);
  assert.equal(isOccluded(player,{x:2.9,z:4},blocks,1),false);
});

test('partial bush entry cannot peek across, full entry hides exterior, adjacent bushes share an interior', () => {
  const bushes = [0,2].map(x=>({x,z:0,width:2,depth:2,height:2,walkThrough:true}));
  for (const z of [-1.2,-0.99,-0.7]) {
    assert.equal(sightContext({x:0,z},bushes).inside,false);
    assert.equal(isOccluded({x:0,z},{x:0,z:4},bushes),true);
    assert.equal(isOccluded({x:0,z},{x:0,z:-4},bushes),false);
  }
  assert.equal(sightContext({x:0,z:-0.5},bushes).inside,true);
  assert.equal(isOccluded({x:0,z:0},{x:0,z:-4},bushes),true);
  assert.equal(isOccluded({x:0,z:0},{x:0,z:4},bushes),true);
  assert.equal(sightContext({x:1,z:0},bushes).inside,true);
  assert.equal(isOccluded({x:1,z:0},{x:2,z:0},bushes),false);
  assert.equal(isOccluded({x:0,z:0},{x:0,z:4},bushes.map(b=>({...b,destroyed:true}))),false);
});
