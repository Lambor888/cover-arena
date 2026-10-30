import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstWallHit } from './ballistics';
import { createBlockStates, damageBlock } from './blockState';
import { canStand, isOccluded } from './world';
const wall = { x: 0, z: 0, width: 2, depth: 2, height: 2 };
test('wood survives two shots, third shot removes collision, bullet and sight blocking', () => {
  const block = { ...createBlockStates()[0], x: 0, z: 0 };
  assert.equal(damageBlock(block), false);
  assert.equal(damageBlock(block), false);
  assert.equal(canStand({x:0,z:0}, [block]), false);
  assert.equal(damageBlock(block), true);
  assert.equal(canStand({x:0,z:0}, [block]), true);
  assert.equal(firstWallHit({x:0,z:-5},{x:0,z:5},[block]), null);
  assert.equal(isOccluded({x:0,z:-5},{x:0,z:5},[block]), false);
  assert.equal(damageBlock(block), false);
});
test('marble remains intact after repeated pistol hits', () => {
  const block = createBlockStates()[1];
  for (let i=0; i<20; i++) assert.equal(damageBlock(block), false);
  assert.equal(block.destroyed, false);
  assert.equal(block.hits, 0);
});
test('fast bullet stops at the first wall face rather than passing through', () => {
  assert.equal(firstWallHit({x:0,z:-5},{x:0,z:5},[wall]), 0.4);
});
test('parallel shot beside a wall stays unobstructed', () => {
  assert.equal(firstWallHit({x:2,z:-5},{x:2,z:5},[wall]), null);
});
test('nearest obstacle wins regardless of array order', () => {
  assert.equal(firstWallHit({x:0,z:-5},{x:0,z:10},[{...wall,z:6},wall]), 4/15);
});
test('short shot does not hit beyond its segment and point-blank shot is blocked', () => {
  assert.equal(firstWallHit({x:0,z:-5},{x:0,z:-2},[wall]), null);
  assert.equal(firstWallHit({x:0,z:-1.05},{x:0,z:0},[wall])! < 0.05, true);
});
