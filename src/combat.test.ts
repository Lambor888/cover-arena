import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swordTargets, blastTargets, rocketDistance, SWORD_SWING_DURATION } from './combat';
import { createBlockStates, damageBlock } from './blockState';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { createArsenal } from './arsenal';
test('sword hits the front fan, not the back or beyond reach', () => {
  const box = { width: 0.5, depth: 0.5, height: 2 };
  const targets = swordTargets({x:0,z:0},0,[{...box,x:0,z:2},{...box,x:0,z:-2},{...box,x:0,z:4}]);
  assert.deepEqual(targets,[0]);
});
test('sword cannot hit a block behind another, or hit one block twice per swing', () => {
  const wall = {x:0,z:1,width:2,depth:0.5,height:2};
  assert.deepEqual(swordTargets({x:0,z:0},0,[wall,{...wall,z:2}]),[0]);
});
test('explosions break either material and affect only blocks touching blast radius', () => {
  const blocks = createBlockStates();
  blocks[0].x=0; blocks[0].z=0; blocks[1].x=3; blocks[1].z=0;
  assert.ok(blastTargets({x:0,z:0},blocks).includes(1));
  assert.equal(damageBlock(blocks[0],true),true);
  assert.equal(damageBlock(blocks[1],true),true);
  assert.equal(damageBlock(blocks[1],true),false);
  assert.ok(!blastTargets({x:0,z:0},blocks).includes(0));
  assert.deepEqual(blastTargets({x:100,z:100},blocks),[]);
});
test('rocket detonates at three seconds, respects cooldown across switching, and reset clears effects', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const material = new StandardMaterial('test', scene);
    const blocks = [{ x: 2, z: rocketDistance(3), width: 0.5, depth: 0.5, height: 2 }];
    const hits: number[] = [];
    const weapons = createArsenal(scene, {bullet:material,steel:material,fire:material,slash:material,blast:material}, blocks, i => hits.push(i));
    weapons.select('rocket'); weapons.fire({x:0,z:0},0);
    weapons.select('sword'); weapons.select('rocket'); weapons.fire({x:0,z:0},0);
    assert.equal(scene.meshes.filter(m=>m.name==='rocket-shell').length,1);
    weapons.update(2.99);
    assert.deepEqual(hits,[]);
    assert.equal(scene.meshes.filter(m=>m.name==='rocket-shell').length,1);
    weapons.update(0.02);
    assert.deepEqual(hits,[0]);
    assert.equal(scene.meshes.filter(m=>m.name==='rocket-shell').length,0);
    assert.ok(scene.meshes.some(m=>m.name==='rocket-explosion'));
    weapons.reset(); assert.equal(scene.meshes.length,0);
  } finally { scene.dispose(); engine.dispose(); }
});
test('rocket contact detonates early and sword damage is applied once per swing', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const material = new StandardMaterial('test', scene);
    const blocks = [{ x:0,z:2,width:1,depth:1,height:2 }];
    const hits: boolean[]=[];
    const weapons = createArsenal(scene,{bullet:material,steel:material,fire:material,slash:material,blast:material},blocks,(_i, explosive)=>hits.push(!!explosive));
    weapons.select('sword'); weapons.fire({x:0,z:0},0); weapons.fire({x:0,z:0},0);
    assert.deepEqual(hits,[false]);
    assert.equal(weapons.movementLocked,true);
    weapons.select('rocket'); weapons.fire({x:0,z:0},0);
    assert.equal(scene.meshes.some(m=>m.name==='rocket-shell'),false);
    weapons.update(SWORD_SWING_DURATION / 2);
    assert.equal(weapons.movementLocked,true);
    assert.ok(scene.meshes.some(m=>m.name==='sword-sweep-blade'));
    weapons.update(SWORD_SWING_DURATION / 2);
    assert.equal(weapons.movementLocked,false);
    assert.equal(scene.meshes.some(m=>m.name==='sword-sweep-blade'),false);
    weapons.select('rocket'); weapons.fire({x:0,z:0},0); weapons.update(0.3);
    assert.deepEqual(hits,[false,true]);
    assert.equal(scene.meshes.filter(m=>m.name==='rocket-shell').length,0);
    weapons.reset(); weapons.select('sword'); weapons.fire({x:0,z:0},0);
    assert.equal(weapons.movementLocked,true);
    weapons.reset();
    assert.equal(weapons.movementLocked,false);
  } finally { scene.dispose(); engine.dispose(); }
});

test('grenade flies over a wall, bursts at the clicked target, and bushes absorb landing',()=>{
  const engine=new NullEngine();const scene=new Scene(engine);
  try {
    const material=new StandardMaterial('grenade-test',scene);
    const blocks=[{x:0,z:5,width:1.2,depth:1.2,height:1.8}];
    const bursts:{x:number;z:number}[]=[];
    const weapons=createArsenal(scene,{bullet:material,steel:material,fire:material,slash:material,blast:material},blocks,()=>{},[],p=>bursts.push(p));
    weapons.select('grenade');weapons.fire({x:0,z:0},0,{x:0,z:10});weapons.update(1.1);
    assert.equal(bursts.length,1);assert.ok(Math.abs(bursts[0].z-10)<.001);
    weapons.reset();bursts.length=0;
    blocks.push({x:0,z:10,width:1.2,depth:1.2,height:1.8,absorbsRocket:true} as typeof blocks[number]);
    weapons.fire({x:0,z:0},0,{x:0,z:10});weapons.update(1.1);
    assert.equal(bursts.length,0);assert.equal(scene.meshes.filter(m=>m.name==='grenade-shell').length,0);
  } finally {scene.dispose();engine.dispose();}
});
