import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../server/room';
import {createCombatCues} from './combatCues';
import type {WeaponKind} from './resources';
const input=(seq:number,fire=false)=>({type:'input' as const,seq,moveX:0,moveZ:0,aimX:0,aimZ:12,weapon:'pistol' as const,fire,skill:false,reload:false});
function setup(){const r=new Room('SKILLS',9);r.join(0);r.join(1);r.phase='playing';r.blocks.forEach(b=>b.destroyed=true);Object.assign(r.players[0].position,{x:0,z:0});Object.assign(r.players[1].position,{x:12,z:12});return r;}
test('one click fires once and a later click fires again',()=>{const r=setup();try{r.accept(0,input(1,true));r.accept(0,input(2,false));for(let i=0;i<12;i++)r.step();assert.equal(r.arsenals[0].ammo.ammo,9);r.accept(0,input(3,true));for(let i=0;i<12;i++)r.step();assert.equal(r.arsenals[0].ammo.ammo,8);}finally{r.dispose();}});
test('every ultimate consumes shared rage once; rocket volley follows target-circle tangents without spending normal ammunition',()=>{
 for(const weapon of ['pistol','sword','rocket','grenade','shotgun'] as WeaponKind[]){const r=setup();try{
 r.players[0].vitals.rage=100;r.arsenals[0].select(weapon);const ammo=r.arsenals[0].ammo.ammo;
 assert.ok(r.skills[0].activate(weapon,0,{x:0,z:8}));assert.equal(r.players[0].vitals.rage,0);assert.equal(r.skills[0].activate(weapon,0,{x:0,z:8}),false);assert.equal(r.arsenals[0].ammo.ammo,ammo);
 if(weapon==='rocket'){const shells=r.scene.meshes.filter(m=>m.name==='rocket-shell');assert.equal(shells.length,3);assert.ok(Math.abs(Math.max(...shells.map(m=>m.rotation.y))-Math.min(...shells.map(m=>m.rotation.y))-2*Math.asin(2/8))<1e-8);}
 }finally{r.dispose();}}
});
test('pistol boost halves interval, accelerates bullets, expires and resets',()=>{
 const r=setup();try{const a=r.arsenals[0];a.fire({x:0,z:0},0);assert.equal(a.cooldown,.075);a.reset();a.ultimate('pistol',{x:0,z:0},0,{x:0,z:8});a.fire({x:0,z:0},0);assert.equal(a.cooldown,.0375);a.update(.05);assert.equal(r.scene.meshes.find(m=>m.name==='pistol-bullet')!.position.z,3);a.update(6);assert.equal(a.boostRemaining,0);a.fire({x:0,z:0},0);assert.equal(a.cooldown,.075);a.reset();assert.equal(a.boostRemaining,0);}finally{r.dispose();}
});
test('sword dash grants temporary speed then expires',()=>{
 const r=setup();try{r.players[0].vitals.rage=100;const s=r.skills[0];s.activate('sword',0,{x:0,z:8});for(let i=0;i<60;i++)s.update(.02);assert.ok(r.players[0].position.z>3.9);assert.equal(s.speedMultiplier,1.4);s.update(4);assert.equal(s.speedMultiplier,1);s.reset();assert.equal(s.speedRemaining,0);}finally{r.dispose();}
});
test('large grenade damages a target outside normal blast radius',()=>{
 const r=setup();try{Object.assign(r.players[1].position,{x:0,z:12});r.arsenals[0].ultimate('grenade',{x:0,z:0},0,{x:0,z:8});assert.ok(r.scene.meshes.some(m=>m.name==='large-grenade-shell'));r.arsenals[0].update(1.1);assert.equal(r.players[1].vitals.hp,60);}finally{r.dispose();}
});
test('shotgun ultimate clears all five materials in front while preserving rear and distant blocks',()=>{
 const r=setup();try{const types=['wood','marble','bush','tank','oil'] as const;const selected=types.map((material,i)=>{const b=r.blocks.find(b=>b.material===material)!;Object.assign(b,{x:i-2,z:3,destroyed:false});return b;});const rear=r.blocks.find(b=>!selected.includes(b))!;Object.assign(rear,{x:0,z:-3,destroyed:false});const far=r.blocks.find(b=>b!==rear&&!selected.includes(b))!;Object.assign(far,{x:0,z:11,destroyed:false});r.arsenals[0].ultimate('shotgun',{x:0,z:0},0,{x:0,z:8});assert.ok(selected.every(b=>b.destroyed));assert.equal(rear.destroyed,false);assert.equal(far.destroyed,false);assert.equal(r.terrain.kindAt(selected[1]),'marbleRubble');}finally{r.dispose();}
});
test('combat cues reveal coarse hidden sound areas, suppress visible and own shots, throttle and expire',()=>{
 const c=createCombatCues(),observers=[{x:0,z:-3},{x:.4,z:3.4}],wall={x:0,z:0,width:4,depth:1,height:2};
 c.emit('shot',observers[1],1,0,observers,[]);c.emit('explosion',observers[1],1,0,observers,[]);assert.equal(c.view(0,0).length,0);
 c.emit('shot',observers[1],1,1,observers,[wall]);assert.equal(c.view(0,1).length,1);assert.equal(c.view(1,1).length,0);assert.equal(c.view(0,1)[0].x,0);assert.equal(c.view(0,1)[0].z,3);
 c.emit('shot',observers[1],1,2,observers,[wall]);assert.equal(c.view(0,2).length,1);c.emit('explosion',observers[1],1,3,observers,[wall]);assert.equal(c.view(0,3).length,2);assert.equal(c.view(0,33).length,0);c.reset();assert.equal(c.view(0,3).length,0);
});

test('dash reaches clicked point, breaks tanks and wood, and collects a pickup along path',()=>{
 const r=setup();try{const wood=r.blocks.find(b=>b.material==='wood')!,tank=r.blocks.find(b=>b.material==='tank')!;Object.assign(wood,{x:0,z:2,destroyed:false});Object.assign(tank,{x:0,z:4,destroyed:false});r.players[0].vitals.hp=40;r.players[0].vitals.rage=100;r.pickups.items.push({id:99,x:0,z:3,kind:'health'});r.skills[0].activate('sword',Math.PI/2,{x:0,z:7});for(let i=0;i<100;i++)r.skills[0].update(.02);assert.ok(wood.destroyed&&tank.destroyed);assert.ok(Math.abs(r.players[0].position.z-7)<.001);assert.equal(r.players[0].vitals.hp,75);assert.equal(r.pickups.items.length,0);}finally{r.dispose();}
});
test('shotgun ultimate preserves narrowed 90 degree angle while extending range',()=>{
 const r=setup();try{const side=r.blocks.find(b=>b.material==='wood')!,front=r.blocks.find(b=>b.material==='tank')!;Object.assign(side,{x:4,z:1,destroyed:false});Object.assign(front,{x:0,z:6,destroyed:false});r.arsenals[0].ultimate('shotgun',{x:0,z:0},0,{x:0,z:8});assert.equal(side.destroyed,false);assert.equal(front.destroyed,true);}finally{r.dispose();}
});

test('rocket ultimate fires exactly three timed volleys and reset cancels pending waves',()=>{const r=setup();try{const a=r.arsenals[0],count=()=>r.scene.meshes.filter(m=>m.name==='rocket-shell').length;a.ultimate('rocket',r.players[0].position,0,{x:0,z:10});assert.equal(count(),3);a.update(.34);assert.equal(count(),3);a.update(.01);assert.equal(count(),6);a.update(.35);assert.equal(count(),9);a.update(.1);assert.equal(count(),9);a.reset();a.update(1);assert.equal(count(),0);a.ultimate('rocket',r.players[0].position,0,{x:0,z:10});a.reset();a.update(1);assert.equal(count(),0);}finally{r.dispose();}});
