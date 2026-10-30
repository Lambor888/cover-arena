import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHazards,createCondition,conditionFlash} from './hazards';
import {createTerrain,movementVelocity} from './terrain';
import type {BlockState} from './blockState';
import {grenadePoint,rocketDistance} from './combat';
import {firstArcImpact} from './ballistics';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {canStand,movePlayer} from './world';
import {createSight} from './fog';
const block=(material:BlockState['material'],x=0,z=0):BlockState=>({material,x,z,width:1.2,depth:1.2,height:1.8,hits:0,destroyed:false});
test('flammable flashes white, burning takes red priority, both alternate with normal',()=>{
  const a=createCondition({x:0,z:0});a.flammable=true;
  assert.equal(conditionFlash(a),'white');
  a.phase=.13;assert.equal(conditionFlash(a),null);
  a.burning=true;a.phase=.24;a.flash=.4;assert.equal(conditionFlash(a),'red');
  a.phase=.37;assert.equal(conditionFlash(a),null);
  a.phase=.48;a.burning=false;a.flammable=false;a.flash=0;assert.equal(conditionFlash(a),null);
});
test('burning actor ignites only oil underfoot without explosion; extinguished actor does not ignite oil',()=>{
  const terrain=createTerrain([]);const a=createCondition(new Vector3(0,0,0));
  const h=createHazards([],terrain,[a],()=>{},()=>assert.fail('walking must not explode'));
  terrain.at(a.position)!.kind='oil';terrain.at({x:1.2,z:0})!.kind='oil';
  h.update(.1);assert.equal(terrain.kindAt(a.position),'oil');assert.ok(a.flammable);
  a.burning=true;h.update(.1);assert.equal(terrain.kindAt(a.position),'fire');
  assert.equal(terrain.kindAt({x:1.2,z:0}),'oil');assert.ok(a.burning);
  a.position.x=1.2;h.update(.1);assert.equal(terrain.kindAt(a.position),'fire');
  terrain.at(a.position)!.kind='water';h.update(.1);assert.equal(a.burning,false);
  terrain.at(a.position)!.kind='oil';h.update(.1);assert.equal(terrain.kindAt(a.position),'oil');
});
test('marble leaves one low solid tile, does not spread, allows sight and resets',()=>{
  const blocks=[block('marble')];const terrain=createTerrain(blocks);
  const h=createHazards(blocks,terrain,[],()=>{},()=>{});
  h.explode({x:0,z:0});
  assert.equal(terrain.kindAt(blocks[0]),'marbleRubble');
  assert.equal(terrain.tiles.filter(t=>t.kind!=='normal').length,1);
  assert.equal(canStand({x:0,z:0},terrain.movementObstacles),false);
  assert.ok(movePlayer({x:0,z:-2},0,4,terrain.movementObstacles).z<-.9);
  assert.equal(createSight({x:0,z:-2},blocks).visible({x:0,z:2}),true);
  terrain.reset();assert.equal(canStand({x:0,z:0},terrain.movementObstacles),true);
});
test('marble rubble cannot be overwritten by water, wood, oil, bush clearing or fire',()=>{
  const blocks=[block('marble')];const terrain=createTerrain(blocks);
  const h=createHazards(blocks,terrain,[],()=>{},()=>{});h.explode({x:0,z:0});
  for(const material of ['tank','wood','oil','bush'] as const) {
    terrain.onDestroyed(block(material));assert.equal(terrain.kindAt({x:0,z:0}),'marbleRubble');
  }
  h.explode({x:0,z:0},3,true);
  assert.equal(terrain.kindAt({x:0,z:0}),'marbleRubble');
  assert.equal(canStand({x:0,z:0},terrain.movementObstacles),false);
});
test('burning Babylon player ignites only nearby bush and leaves distant blocks intact',()=>{
  const blocks=[block('bush',2.4),block('wood',12),block('oil',-12),block('marble',0,12)];
  const terrain=createTerrain(blocks);
  const position=new Vector3(0,0,0);
  const actor=createCondition(position); actor.flammable=true;
  const centers:{x:number;z:number}[]=[];
  const h=createHazards(blocks,terrain,[actor],()=>{},p=>centers.push(p));
  terrain.at(position)!.kind='fire'; h.update(.1);
  assert.equal(actor.burning,true); assert.equal(centers.length,0);
  assert.ok(blocks.every(b=>!b.destroyed));
  position.x=2.4; h.update(.1);
  assert.equal(blocks[0].destroyed,true);
  assert.ok(blocks.slice(1).every(b=>!b.destroyed));
  assert.ok(centers.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
  const count=centers.length;
  for(let i=0;i<60;i++) h.update(1/60);
  assert.equal(centers.length,count);
});
test('oil tanks spill on normal hit and chain exactly once on blast',()=>{
  const blocks=[block('oil'),block('oil',4.8),block('marble',7.2),block('bush',4.8,1.2)];
  const terrain=createTerrain(blocks);const events:number[]=[];
  const h=createHazards(blocks,terrain,[],()=>{},(_,r)=>events.push(r));
  h.attackBlock(0);assert.equal(terrain.kindAt({x:0,z:0}),'oil');assert.equal(events.length,0);
  h.explode({x:2.4,z:0});assert.ok(blocks.every(b=>b.destroyed));assert.equal(events.length,2);assert.ok(events.every(r=>r===3));
  assert.equal(terrain.kindAt({x:0,z:0}),'fire');
});
test('oil, bush, explosion, fire and water drive actor states and reset',()=>{
  const blocks=[block('bush',2.4)];const terrain=createTerrain(blocks);const actor=createCondition({x:0,z:0});
  const h=createHazards(blocks,terrain,[actor],()=>{},()=>{});
  terrain.at(actor.position)!.kind='oil';h.update(.1);assert.ok(actor.flammable);
  actor.position.x=2.4;h.update(.1);assert.equal(actor.flammable,false);
  actor.position.x=0;h.update(.1);h.explode(actor.position);assert.ok(actor.burning);
  actor.position.x=2.4;h.update(.1);assert.ok(blocks[0].destroyed);assert.equal(terrain.kindAt(actor.position),'normal');assert.ok(actor.burning);
  terrain.at(actor.position)!.kind='water';h.update(.1);assert.equal(actor.burning,false);
  h.reset();assert.equal(actor.flash,0);
});
test('explosion in occupied bush causes secondary flare; tank water survives ignition',()=>{
  const blocks=[block('bush'),block('tank',0.234375)];const terrain=createTerrain(blocks);const a=createCondition({x:0,z:0});const radii:number[]=[];
  const h=createHazards(blocks,terrain,[a],()=>{},(_,r)=>radii.push(r));h.explode(a.position);
  assert.ok(blocks[0].destroyed);assert.ok(radii.includes(1.8));assert.equal(terrain.kindAt(a.position),'water');assert.ok(a.flash>0);
});
test('rocket starts slow then exceeds bullet speed; grenade clears middle wall and hits landing bush',()=>{
  assert.ok(rocketDistance(.1)<.4);assert.ok(rocketDistance(2.1)-rocketDistance(2)>3.6);
  const from={x:0,z:0},to={x:0,z:10};const wall=block('marble',0,5);
  assert.ok(grenadePoint(from,to,.5).y>wall.height);
  assert.equal(firstArcImpact(grenadePoint(from,to,.45),grenadePoint(from,to,.55),[wall]),null);
  assert.ok(firstArcImpact(grenadePoint(from,to,.95),grenadePoint(from,to,1),[block('bush',0,10)]));
  assert.deepEqual(grenadePoint(from,to,1),{x:0,z:10,y:0});
});
test('oil retains more momentum than water',()=>{
  const v={x:5,z:0},stop={x:0,z:0};
  assert.ok(movementVelocity(v,stop,'pistol','oil',.5,false).x>movementVelocity(v,stop,'pistol','water',.5,false).x);
});
test('invalid explosion coordinates or radius cannot damage terrain or actors',()=>{
  const blocks=[block('oil'),block('wood',12)];
  const terrain=createTerrain(blocks);const actor=createCondition({x:0,z:0});
  const h=createHazards(blocks,terrain,[actor],()=>assert.fail('unexpected destruction'),()=>assert.fail('unexpected explosion'));
  h.explode({x:NaN,z:0});h.explode({x:0,z:Infinity});
  h.explode({x:0,z:0},NaN);h.explode({x:0,z:0},Infinity);
  assert.ok(blocks.every(b=>!b.destroyed));assert.equal(actor.impacts,0);
  assert.ok(terrain.tiles.every(t=>t.kind==='normal'));
});

test('burning contact clears only overlapped bush, keeps burning, and cannot ignite nearby oil',()=>{
  const blocks=[block('bush'),block('bush',1.2),block('oil',0,1.2),block('wood',-1.2),block('marble',0,-1.2)];
  const terrain=createTerrain(blocks);const actor=createCondition(new Vector3(-0.8,0,0));
  actor.burning=true;actor.flammable=true;
  const h=createHazards(blocks,terrain,[actor],()=>{},()=>assert.fail('contact must not explode'));
  h.update(.1);
  assert.equal(blocks[0].destroyed,true);assert.ok(blocks.slice(1).every(b=>!b.destroyed));
  assert.equal(actor.burning,true);assert.equal(actor.flammable,true);assert.equal(actor.impacts,0);
  assert.ok(terrain.tiles.every(t=>t.kind==='normal'));
  actor.position.x=0.4;h.update(.1);assert.equal(blocks[1].destroyed,true);
  assert.ok(actor.burning);assert.ok(blocks.slice(2).every(b=>!b.destroyed));
});
test('oil blast radius is reduced and leaves blocks beyond three units intact',()=>{
  const blocks=[block('oil'),block('wood',2.4),block('marble',4.8),block('oil',0,4.8)];
  const terrain=createTerrain(blocks);const radii:number[]=[];
  const h=createHazards(blocks,terrain,[],()=>{},(_,r)=>radii.push(r));
  h.explode({x:0,z:0},.1);
  assert.deepEqual(radii,[.1,3]);assert.ok(blocks[1].destroyed);
  assert.ok(blocks.slice(2).every(b=>!b.destroyed));
  assert.equal(terrain.kindAt({x:0,z:3.6}),'normal');
});
