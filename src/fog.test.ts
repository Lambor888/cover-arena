import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFogMemory, createSight, surfacePeers } from './fog';
import type { Obstacle } from './world';
import type { TerrainKind, Tile } from './terrain';

test('fog starts unknown, remembers exploration, and reset clears knowledge', () => {
  const blocks = [{x:0,z:0,width:8,depth:2,height:2}];
  const fog=createFogMemory(blocks,[]);
  const far={x:0,z:5};
  assert.equal(fog.pixels[fog.indexAt(far)],0);
  fog.update({x:0,z:-5},()=> 'normal');
  assert.equal(fog.pixels[fog.indexAt(far)],0);
  fog.update({x:0,z:5},()=> 'normal');
  assert.equal(fog.pixels[fog.indexAt(far)],255);
  fog.update({x:0,z:-5},()=> 'normal');
  assert.equal(fog.pixels[fog.indexAt(far)],255);
  fog.reset();
  assert.ok(fog.pixels.every(v=>v===0));
  assert.ok(fog.knownBlocks.every(v=>v===null));
});

test('out-of-sight destruction and terrain changes retain old snapshots until observed again', () => {
  const blocks: Obstacle[]=[{x:0,z:0,width:12,depth:2,height:2}, {x:0,z:6,width:2,depth:2,height:2,destroyed:false}];
  const tiles: Tile[]=[{x:2,z:6,kind:'normal'}];
  let kind: TerrainKind='normal';
  const fog=createFogMemory(blocks,tiles);
  fog.update({x:0,z:10},()=>kind);
  assert.equal(fog.knownBlocks[1],false);
  assert.equal(fog.knownTiles[0],'normal');
  blocks[1].destroyed=true; kind='water';
  fog.update({x:0,z:-6},()=>kind);
  assert.equal(fog.knownBlocks[1],false);
  assert.equal(fog.knownTiles[0],'normal');
  fog.update({x:0,z:10},()=>kind);
  assert.equal(fog.knownBlocks[1],true);
  assert.equal(fog.knownTiles[0],'water');
});

test('same-row surfaces do not cut each other, but outside blockers still hide only part of the surface', () => {
  const blocks: Obstacle[]=[{x:0,z:0,width:2,depth:2,height:2}, {x:2,z:4,width:2,depth:2,height:2}, {x:4,z:4,width:2,depth:2,height:2}];
  assert.deepEqual(surfacePeers(1,blocks).sort(),[1,2]);
  const sight=createSight({x:0,z:-4},blocks);
  assert.equal(sight.visible({x:1.1,z:4},1,1),false);
  assert.equal(sight.visible({x:2.9,z:4},1,1),true);
  const low=createSight({x:0,z:-4},[{x:0,z:0,width:2,depth:2,height:0.5}]);
  assert.equal(low.visible({x:0,z:4},2),true);
  assert.equal(low.visible({x:0,z:4},0),false);
});

test('bush enclosure limits new sight without clearing existing memory outside', () => {
  const bush={x:0,z:0,width:2,depth:2,height:2,walkThrough:true};
  assert.equal(createSight({x:0,z:-0.8},[bush]).visible({x:0,z:4}),false);
  assert.equal(createSight({x:0,z:0},[bush]).visible({x:0,z:-4}),false);
  const fog=createFogMemory([bush],[]);
  fog.update({x:0,z:-4},()=> 'normal');
  fog.update({x:0,z:0},()=> 'normal');
  assert.equal(fog.pixels[fog.indexAt({x:0,z:-4})],255);
});

test('explored cells and block footprints retain complete dark shapes rather than old black shadow wedges', () => {
  const blocks: Obstacle[]=[{x:0,z:0,width:2,depth:2,height:2}];
  const tiles: Tile[]=[{x:2.2265625,z:1.9921875,kind:'normal'},{x:0,z:6,kind:'normal'}];
  const fog=createFogMemory(blocks,tiles);
  fog.update({x:0,z:-4},()=> 'normal');
  assert.equal(fog.knownTiles[0],'normal');
  assert.equal(fog.knownTiles[1],null);
  for (const x of [2.15,2.2265625,2.3]) for (const z of [1.92,1.9921875,2.06]) {
    assert.equal(fog.pixels[fog.indexAt({x,z})],255);
  }
  assert.equal(fog.pixels[fog.indexAt({x:0,z:6})],0);
  for (const x of [-0.875,0.875]) for (const z of [-0.875,0.875]) {
    assert.equal(fog.pixels[fog.indexAt({x,z})+1],255);
    assert.equal(fog.pixels[fog.indexAt({x,z})],255);
  }
});
