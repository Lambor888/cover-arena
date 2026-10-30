import {test} from 'node:test';
import assert from 'node:assert/strict';
import {segmentCircle,firstActorImpact,swordHitsActor,type CombatTarget} from './actorCombat';
import {createRoamer,ENEMY_SPAWN} from './enemy';
import {createFootsteps} from './hearing';
import {createBlockStates} from './blockState';
import {canStand} from './world';
import {createArsenal} from './arsenal';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';

test('fast projectile sweeps hit the nearest actor and respect a closer wall',()=>{
  const a: CombatTarget={position:{x:0,z:2},radius:0.3,hit(){}};
  const b={...a,position:{x:0,z:4}};
  assert.ok(segmentCircle({x:0,z:0},{x:0,z:10},a.position,a.radius)!<0.2);
  assert.equal(firstActorImpact({x:0,z:0},{x:0,z:10},[b,a])?.target,a);
  assert.equal(firstActorImpact({x:0,z:0},{x:0,z:10},[a],0.1),null);
  assert.equal(segmentCircle({x:1,z:0},{x:1,z:10},a.position,a.radius),null);
});
test('sword respects front fan, range and cover',()=>{
  const target: CombatTarget={position:{x:0,z:2},radius:0.3,hit(){}};
  assert.equal(swordHitsActor({x:0,z:0},0,target,[]),true);
  assert.equal(swordHitsActor({x:0,z:0},Math.PI,target,[]),false);
  assert.equal(swordHitsActor({x:0,z:-3},0,target,[]),false);
  assert.equal(swordHitsActor({x:0,z:0},0,target,[{x:0,z:1,width:2,depth:0.5,height:2}]),false);
});
test('all three weapons notify hits once, pistol cannot hit through cover, rocket bursts on actor contact',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const m=new StandardMaterial('test',scene), hits:string[]=[];
    const target: CombatTarget={position:{x:0,z:2},radius:0.3,hit:w=>hits.push(w)};
    const blocks=[{x:0,z:1,width:2,depth:0.5,height:2,destroyed:false}];
    const arsenal=createArsenal(scene,{bullet:m,steel:m,fire:m,slash:m,blast:m},blocks,()=>{},[target]);
    arsenal.fire({x:0,z:0},0);arsenal.update(0.2);assert.deepEqual(hits,[]);
    blocks[0].destroyed=true;
    arsenal.fire({x:0,z:0},0);arsenal.update(0.2);arsenal.update(0.2);
    assert.deepEqual(hits,['pistol']);
    arsenal.select('sword');arsenal.fire({x:0,z:0},0);arsenal.fire({x:0,z:0},0);arsenal.update(0.6);
    assert.deepEqual(hits,['pistol','sword']);
    arsenal.select('rocket');arsenal.fire({x:0,z:0},0);arsenal.update(0.3);arsenal.update(0.1);
    assert.deepEqual(hits,['pistol','sword','rocket']);
    assert.equal(scene.meshes.some(m=>m.name==='rocket-shell'),false);
  } finally {scene.dispose();engine.dispose();}
});
test('random walker stays in the arena and outside solid obstacles, resets to spawn',()=>{
  let seed=7;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const walker=createRoamer(random),blocks=createBlockStates();
  let distance=0;
  for(let i=0;i<1800;i++){distance+=walker.update(0.05,blocks,()=> 'normal');assert.ok(canStand(walker.position,blocks));}
  assert.ok(distance>10);
  walker.reset();assert.deepEqual(walker.position,ENEMY_SPAWN);
});
test('sound cues require actual unseen movement in hearing range and have approximate snapshot locations',()=>{
  const listener={x:0,z:0},enemy={x:4.2,z:3.7};
  const steps=createFootsteps(()=>0.8);
  assert.equal(steps.update(1,listener,enemy,0,false),null);
  assert.equal(steps.update(1,listener,enemy,1,true),null);
  assert.equal(steps.update(1,listener,{x:30,z:0},1,false),null);
  const cue=steps.update(1,listener,enemy,1,false)!;
  assert.ok(cue);assert.notDeepEqual(cue,enemy);
  assert.ok(Math.hypot(cue.x-enemy.x,cue.z-enemy.z)<3);
  enemy.x=7;assert.notEqual(cue.x,enemy.x);
  assert.equal(steps.update(0.1,listener,enemy,1,false),null);
  steps.reset();assert.equal(steps.update(1,listener,enemy,0,false),null);
});
