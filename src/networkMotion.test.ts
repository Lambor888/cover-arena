import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalMotion,PoseSmoother} from './networkMotion';
import type {PlayerView} from './protocol';
import {canStand} from './world';
const player=(extra:Partial<PlayerView>={}):PlayerView=>({x:0,z:0,yaw:0,hp:100,rage:0,stun:0,flammable:false,burning:false,flash:0,phase:0,weapon:'pistol',ammo:10,reserve:null,capacity:10,reload:0,cooldown:0,boost:0,speedBoost:0,skillPhase:'idle',vx:0,vz:0,movementLocked:false,...extra});
test('local movement responds before the next snapshot and stops on ordinary ground',()=>{
 const motion=new LocalMotion([],()=> 'normal');motion.receive(player(),true,0,130,true);
 assert.ok(motion.update(.016,.016,{x:1,z:0},'pistol').x>0);
 const x=motion.position.x;motion.update(.032,.016,{x:0,z:0},'pistol');assert.equal(motion.position.x,x);
});
test('prediction respects obstacles including low marble rubble and server locks',()=>{
 const wall={x:1,z:0,width:1,depth:3,height:.3,seeThrough:true};
 const motion=new LocalMotion([wall],()=> 'normal');motion.receive(player(),true,0,130,true);
 for(let i=1;i<=15;i++)assert.equal(canStand(motion.update(i/60,1/60,{x:1,z:0},'sword'),[wall]),true);
 for(const lock of [{stun:1},{movementLocked:true},{skillPhase:'windup'},{hp:0}]){
  motion.receive(player(lock),true,1,130,true);motion.update(1.016,.016,{x:1,z:0},'pistol');assert.equal(motion.position.x,0);
 }
});
test('prediction preserves slippery momentum but is bounded when updates stop',()=>{
 const motion=new LocalMotion([],()=> 'oil');motion.receive(player({vx:3}),true,0,130,true);
 motion.update(.016,.016,{x:0,z:0},'pistol');assert.ok(motion.position.x>0);
 for(let i=2;i<=120;i++)motion.update(i/60,1/60,{x:1,z:0},'pistol');
 const x=motion.position.x;motion.update(3,.016,{x:1,z:0},'pistol');assert.equal(motion.position.x,x);assert.ok(x<6);
});
test('authoritative correction and round reset do not retain old spawn movement',()=>{
 const motion=new LocalMotion([],()=> 'normal');motion.receive(player(),true,0,130,true);
 motion.update(.02,.02,{x:1,z:0},'pistol');
 motion.receive(player({x:10,z:10}),false,.03,130,true);
 assert.deepEqual(motion.display(),{x:10,z:10});
 motion.update(.05,.02,{x:1,z:0},'pistol');assert.deepEqual(motion.position,{x:10,z:10});
});
test('remote interpolation is continuous, uses shortest rotation and hides immediately',()=>{
 const motion=new PoseSmoother();motion.receive({x:0,y:0,z:0,yaw:Math.PI-.1},0,.13,true);
 motion.receive({x:1,y:0,z:0,yaw:-Math.PI+.1},.13,.13);
 const mid=motion.sample(.195)!;assert.ok(mid.x>.49&&mid.x<.51);assert.ok(Math.abs(mid.yaw-Math.PI)<.001);
 assert.equal(motion.sample(1)!.x,1);
 motion.receive(null,1,.13);assert.equal(motion.sample(1.01),null);
 motion.receive({x:10,y:0,z:4,yaw:0},2,.13);assert.equal(motion.sample(2)!.x,10);
});

test('130 ms snapshot intervals keep movement continuous without accumulating drift',()=>{
 const motion=new LocalMotion([],()=> 'normal');motion.receive(player({vx:5}),true,0,130,true);
 let previous=0;
 for(let i=1;i<=120;i++){
  const now=i/60;
  if(i%8===0)motion.receive(player({x:5*(now-.065),vx:5}),true,now,130);
  const shown=motion.update(now,1/60,{x:1,z:0},'pistol');
  assert.ok(shown.x-previous<.2,'no snapshot-sized teleport');
  assert.ok(shown.x>=previous-.01,'no backwards rubber-band on steady movement');
  previous=shown.x;
 }
 assert.ok(Math.abs(previous-10)<.3,'display remains near server trajectory');
});

test('a 950 ms response gap does not freeze prediction at 300 ms, and authoritative age drives replay',()=>{
 const motion=new LocalMotion([],()=> 'normal');motion.receive(player({vx:5}),true,0,130,true);
 for(let i=1;i<=57;i++)motion.update(i/60,1/60,{x:1,z:0},'pistol');
 assert.ok(motion.position.x>4.7);
 // The server simulated up to 0.75s; response arrives at 0.95s.
 motion.receive(player({x:3.75,vx:5}),true,.95,950,false,200);
 assert.ok(Math.abs(motion.position.x-4.75)<.001);
 assert.ok(Math.abs(motion.display().x-4.75)<.001);
});
