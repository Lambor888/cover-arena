import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shotgunCone,pushFrom} from './shotgun';
import {createTerrain} from './terrain';
import {createHazards} from './hazards';
import type {BlockState} from './blockState';
import {Room} from '../server/room';
const box=(material:BlockState['material'],x:number,z:number):BlockState=>({material,x,z,width:1,depth:1,height:1.8,destroyed:false,hits:0});
test('shotgun hits multiple front targets beyond sword range once, excludes rear and far targets',()=>{
 const targets=[{x:0,z:4},{x:2,z:3},{x:0,z:-1},{x:0,z:8}].map(position=>({position,radius:.344,hit(){}}));
 const cone=shotgunCone({x:0,z:0},0,[],targets);
 assert.deepEqual([...cone.hitActors],targets.slice(0,2));
});
test('shotgun respects cover and pushback cannot cross walls, rubble or arena boundary',()=>{
 const wall=box('marble',0,3);const target={position:{x:0,z:4},radius:.344,hit(){}};
 assert.equal(shotgunCone({x:0,z:0},0,[wall],[target]).hitActors.size,0);
 const p={x:0,z:1};pushFrom(p,{x:0,z:0},0,[wall]);assert.ok(p.z<2.2&&p.z>1);
 const terrain=createTerrain([wall]);wall.destroyed=true;terrain.onDestroyed(wall);
 const q={x:0,z:1};pushFrom(q,{x:0,z:0},0,terrain.movementObstacles);assert.ok(q.z<2.2);
 const edge={x:0,z:14};pushFrom(edge,{x:0,z:13},0,[]);assert.ok(edge.z<=14.656);
});
test('cone ignites only exposed oil, preserves water and oil outside its arc',()=>{
 const blocks=[box('marble',.5,2.5)],terrain=createTerrain(blocks),hazards=createHazards(blocks,terrain,[],()=>{},()=>{});
 const front=terrain.at({x:1.5,z:1.5})!,hidden=terrain.at({x:.5,z:3.5})!,rear=terrain.at({x:.5,z:-2.5})!,water=terrain.at({x:-.5,z:1.5})!;
 front.kind=hidden.kind=rear.kind='oil';water.kind='water';hazards.igniteCone({x:0,z:0},0);
 assert.equal(front.kind,'fire');assert.equal(hidden.kind,'oil');assert.equal(rear.kind,'oil');assert.equal(water.kind,'water');
});
test('authoritative shotgun deals 30, repels and interrupts dash; reload cannot be bypassed by switching',()=>{
 const r=new Room('SHOTGUN',7);try{
 r.join(0);r.join(1);r.phase='playing';r.blocks.forEach(b=>b.destroyed=true);
 Object.assign(r.players[0].position,{x:0,z:0});Object.assign(r.players[1].position,{x:0,z:3});
 r.players[1].vitals.rage=100;r.skills[1].activate('sword',Math.PI,{x:0,z:0});
 const fire=(seq:number)=>r.accept(0,{type:'input',seq,moveX:0,moveZ:0,aimX:0,aimZ:3,weapon:'shotgun',fire:true,skill:false,reload:false});
 fire(1);r.step();assert.equal(r.players[1].vitals.hp,70);assert.ok(r.players[1].position.z>5);assert.equal(r.skills[1].phase,'idle');assert.ok(r.players[1].vitals.stun>0);
 assert.equal(r.arsenals[0].ammo.ammo,3);r.arsenals[0].reload();assert.ok(r.arsenals[0].ammo.remaining>3);
 assert.ok(r.view(0).effects.some(e=>e.kind==='shotgun-cone'&&e.vertices!.length>200));
 r.arsenals[0].select('pistol');r.arsenals[0].select('shotgun');Object.assign(r.players[1].position,{x:0,z:3});fire(2);r.step();assert.equal(r.players[1].vitals.hp,70);
 for(let i=0;i<106;i++)r.step();fire(3);r.step();assert.equal(r.players[1].vitals.hp,40);
 }finally{r.dispose();}
});
test('one shot breaks front wood without piercing it or damaging marble',()=>{
 const r=new Room('COVER',8);try{
 r.blocks.forEach(b=>b.destroyed=true);const wood=r.blocks.find(b=>b.material==='wood')!,stone=r.blocks.find(b=>b.material==='marble')!;
 Object.assign(wood,box('wood',0,2));Object.assign(stone,box('marble',2,2));
 Object.assign(r.players[0].position,{x:0,z:0});Object.assign(r.players[1].position,{x:0,z:3});
 r.arsenals[0].select('shotgun');r.arsenals[0].fire(r.players[0].position,0);
 assert.ok(wood.destroyed);assert.equal(stone.destroyed,false);assert.equal(r.players[1].vitals.hp,100);
 }finally{r.dispose();}
});
