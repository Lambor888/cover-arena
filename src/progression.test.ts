import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAmmo,WEAPON_RULES} from './resources';
import {createVitals,dealDamage,updateVitals,resetVitals} from './vitals';
import {createRageSkills} from './rageSkills';
import {createCondition,createHazards} from './hazards';
import {createTerrain} from './terrain';
import type {BlockState} from './blockState';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {createArsenal} from './arsenal';
const box=(material:BlockState['material'],z:number):BlockState=>({material,x:0,z,width:1,depth:1,height:1.8,hits:0,destroyed:false});
test('ten-shot magazine blocks further shots until reload completes; manual and background reload preserve time',()=>{
  const a=createAmmo();for(let i=0;i<10;i++)assert.ok(a.consume('pistol'));
  assert.equal(a.states.pistol.ammo,0);assert.equal(a.consume('pistol'),false);
  a.update(1);a.reload('pistol');assert.equal(a.states.pistol.remaining,1);
  a.consume('grenade');a.reload('grenade');a.update(.99);assert.equal(a.consume('pistol'),false);
  a.update(.02);assert.equal(a.states.pistol.ammo,10);assert.ok(a.states.grenade.remaining>0);
  a.reset();assert.equal(a.states.grenade.ammo,2);assert.equal(a.states.grenade.remaining,0);
});
test('health clamps at zero and rage rewards only actual enemy damage; dead actors gain no rage',()=>{
  const a=createVitals(),b=createVitals();updateVitals(a,20);assert.equal(a.rage,100);
  a.rage=0;dealDamage(b,120,a);assert.equal(b.hp,0);assert.equal(a.rage,50);
  dealDamage(b,10,a);assert.equal(a.rage,50);updateVitals(b,20);assert.equal(b.rage,0);
  dealDamage(a,10,a);assert.equal(a.rage,50);resetVitals(a);assert.deepEqual(a,createVitals());
});
test('charge winds up, breaks wood, hits once and stuns, then permits rocket follow-up',()=>{
  const p=createVitals(),e=createVitals(),pos={x:0,z:0},ep={x:0,z:3};p.rage=100;
  const blocks=[box('wood',1.5)];const terrain=createTerrain(blocks);
  const s=createRageSkills(p,pos,e,ep,blocks,terrain.movementObstacles,i=>{blocks[i].destroyed=true;terrain.onDestroyed(blocks[i]);},()=>{});
  assert.ok(s.activate('sword',0,ep));assert.equal(p.rage,0);s.update(.2);assert.equal(pos.z,0);
  s.update(.15);for(let i=0;i<30;i++)s.update(.02);
  assert.ok(blocks[0].destroyed);assert.equal(e.hp,85);assert.equal(e.stun,.6);assert.equal(s.locked,false);
  dealDamage(e,WEAPON_RULES.rocket.damage,p);assert.equal(e.hp,40);
});
test('charge is stopped by existing marble rubble and reset cancels dash',()=>{
 const p=createVitals(),e=createVitals(),pos={x:0,z:0};p.rage=100;const blocks=[box('marble',1.5)],terrain=createTerrain(blocks);blocks[0].destroyed=true;terrain.onDestroyed(blocks[0]);const skills=createRageSkills(p,pos,e,{x:0,z:8},blocks,terrain.movementObstacles,()=>assert.fail('break rubble'),()=>{});skills.activate('sword',0,{x:0,z:6});for(let i=0;i<80;i++)skills.update(.02);assert.ok(pos.z<.7);skills.reset();assert.equal(skills.locked,false);
});
test('fuel ultimate uses shared rage, protects water and rubble, enables ignition and water extinguishes damage',()=>{
  const p=createVitals(),e=createVitals();p.rage=100;const pos={x:0,z:0},ep={x:3.5,z:.5};
  const terrain=createTerrain([]),actor=createCondition(ep);
  terrain.at({x:2.5,z:.5})!.kind='water';terrain.at({x:4.5,z:.5})!.kind='marbleRubble';
  const h=createHazards([],terrain,[actor],()=>{},()=>{},(_,d)=>dealDamage(e,d,p));
  const s=createRageSkills(p,pos,e,ep,[],[],()=>{},(_,__,aim)=>h.spreadFuel(aim));
  assert.ok(s.activate('grenade',0,ep));assert.equal(p.rage,0);assert.equal(s.activate('sword',0,ep),false);
  assert.equal(terrain.kindAt(ep),'oil');assert.equal(terrain.kindAt({x:2.5,z:.5}),'water');assert.equal(terrain.kindAt({x:4.5,z:.5}),'marbleRubble');
  h.update(.1);assert.ok(actor.flammable);h.explode(ep);assert.ok(actor.burning);assert.equal(e.hp,55);
  h.update(1);assert.equal(e.hp,47);terrain.at(ep)!.kind='water';h.update(1);assert.equal(e.hp,47);assert.equal(actor.burning,false);
});
test('arsenal enforces magazine and cooldown together and fuel grenade has no blast or regular ammo cost',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),mat=new StandardMaterial('m',scene);
  try {
    let blasts=0,fuel=0;
    const a=createArsenal(scene,{bullet:mat,steel:mat,fire:mat,slash:mat,blast:mat},[],()=>{},[],()=>blasts++,()=>fuel++);
    for(let i=0;i<10;i++){a.fire({x:0,z:0},0);a.update(.1);}
    assert.equal(a.ammo.ammo,0);a.fire({x:0,z:0},0);assert.equal(a.ammo.ammo,0);
    a.select('sword');a.update(2);a.select('pistol');assert.equal(a.ammo.ammo,10);
    a.select('grenade');a.fuelGrenade({x:0,z:0},0,{x:0,z:4});a.update(1.1);
    assert.equal(fuel,1);assert.equal(blasts,0);assert.equal(a.ammo.ammo,2);
    a.fire({x:0,z:0},0,{x:0,z:4});a.fire({x:0,z:0},0,{x:0,z:4});assert.equal(a.ammo.ammo,1);
    a.reset();assert.equal(a.ammo.ammo,2);assert.equal(a.cooldown,0);
  } finally {scene.dispose();engine.dispose();}
});
test('skills reject insufficient rage, unsupported weapons, stun and death without consuming resources',()=>{
  const p=createVitals(),e=createVitals(),pos={x:0,z:0},aim={x:0,z:3};
  const s=createRageSkills(p,pos,e,aim,[],[],()=>{},()=>assert.fail('unexpected cast'));
  p.rage=99;assert.equal(s.activate('sword',0,aim),false);assert.equal(p.rage,99);
  p.rage=100;assert.equal(s.activate('pistol',0,aim),false);assert.equal(p.rage,100);
  p.stun=.5;assert.equal(s.activate('grenade',0,aim),false);
  p.stun=0;p.hp=0;assert.equal(s.activate('grenade',0,aim),false);assert.equal(p.rage,100);
});
test('fuel projectile is absorbed by a landing bush rather than spreading oil or exploding',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),mat=new StandardMaterial('fuel-test',scene);
  try {
    const bush={...box('bush',4),absorbsRocket:true};
    const a=createArsenal(scene,{bullet:mat,steel:mat,fire:mat,slash:mat,blast:mat},[bush],()=>{},[],()=>assert.fail('blast'),()=>assert.fail('oil spill'));
    a.fuelGrenade({x:0,z:0},0,{x:0,z:4});a.update(1.2);
    assert.equal(scene.meshes.filter(m=>m.name==='grenade-shell').length,0);
    assert.equal(bush.destroyed,false);
  } finally {scene.dispose();engine.dispose();}
});
