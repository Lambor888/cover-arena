import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAmmo,AMMO_TOTAL} from './resources';
import {createTerrain} from './terrain';
import {createPickups} from './pickups';
import {createVitals} from './vitals';
import {generateMap} from './map';
import {randomSpawns} from './spawns';
import {createSight} from './fog';
import {canStand} from './world';
test('limited weapons exhaust total stock; manual reload cannot generate ammo; refill restores all',()=>{const a=createAmmo();for(const w of ['rocket','grenade','shotgun'] as const){let fired=0;while(a.consume(w)){fired++;a.update(5);}assert.equal(fired,AMMO_TOTAL[w]);a.reload(w);a.update(100);assert.equal(a.consume(w),false);}a.reset();assert.equal(a.states.rocket.ammo+a.states.rocket.reserve,4);assert.equal(a.states.grenade.ammo+a.states.grenade.reserve,6);assert.equal(a.states.shotgun.ammo+a.states.shotgun.reserve,8);});
test('pickups spawn on safe unoccupied surfaces, cap population, remove fire drops, collect once',()=>{const terrain=createTerrain([]),p=createPickups(terrain,()=>.3),v=createVitals();for(let i=0;i<20;i++)p.update(8,[]);assert.equal(p.items.length,9);assert.equal(new Set(p.items.map(i=>i.x+','+i.z)).size,9);const first=p.items[0];terrain.at(first)!.kind='fire';p.update(0,[]);assert.equal(p.items.length,8);p.reset();let refills=0;const actor={position:{x:.5,z:.5},vitals:v,refill:()=>refills++};v.hp=80;v.rage=80;for(const kind of ['health','ammo','rage'] as const){p.items.push({id:1,...actor.position,kind});p.update(0,[actor,actor]);}assert.equal(v.hp,100);assert.equal(v.rage,100);assert.equal(refills,1);assert.equal(p.items.length,0);});
test('spawn pairs across 100 maps are passable, separated and mutually hidden at body edges',()=>{const positions=new Set<string>();for(let seed=0;seed<100;seed++){const blocks=generateMap(seed),[a,b]=randomSpawns(blocks);positions.add(JSON.stringify([a,b]));assert.ok(canStand(a,blocks)&&canStand(b,blocks));assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=10);for(const [from,to] of [[a,b],[b,a]])for(const dx of [-.34,0,.34])for(const dz of [-.34,0,.34])assert.equal(createSight(from,blocks).visible({x:to.x+dx,z:to.z+dz},1),false);}assert.ok(positions.size>90);});

test('shotgun four-round magazine reloads once from its remaining four rounds',()=>{const a=createAmmo();for(let i=0;i<4;i++){assert.ok(a.consume('shotgun'));assert.equal(a.states.shotgun.remaining,i===3?3.5:0);}assert.equal(a.states.shotgun.reserve,4);assert.equal(a.consume('shotgun'),false);a.update(3.5);assert.equal(a.states.shotgun.ammo,4);assert.equal(a.states.shotgun.reserve,0);for(let i=0;i<4;i++)assert.ok(a.consume('shotgun'));a.update(10);assert.equal(a.consume('shotgun'),false);});
