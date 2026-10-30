import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../room';
import {createHandler,encode,decode,type Store,type Saved} from './handler';
import type {WeaponKind} from '../../src/resources';
class MemoryStore implements Store{values=new Map<string,{data:string;etag:string}>();conflicts=0;revision=0;async read(key:string){return this.values.get(key)??null;}async write(key:string,data:string,etag?:string){const old=this.values.get(key);if(this.conflicts>0){this.conflicts--;return false;}if(etag?old?.etag!==etag:!!old)return false;this.values.set(key,{data,etag:String(++this.revision)});return true;}}
const input=(seq:number,extra={})=>({type:'input',seq,moveX:0,moveZ:0,aimX:0,aimZ:3,weapon:'pistol',fire:false,skill:false,reload:false,...extra});
const jsonClone=<T>(v:T):T=>decode(encode(v));
function prepared(){const r=new Room('RESTORE',42);r.join(0);r.join(1);r.phase='playing';r.blocks.forEach(b=>b.destroyed=true);Object.assign(r.players[0].position,{x:0,z:0});Object.assign(r.players[1].position,{x:0,z:10});return r;}

test('restored room bypasses spawn selection even when all cover has been destroyed',()=>{
 const original=prepared();let restored:Room|undefined;
 try{
  original.accept(0,input(1,{moveX:1}));original.step();
  const saved=jsonClone(original.save());
  restored=new Room('RESTORE',42,saved);restored.load(saved);
  assert.deepEqual(jsonClone(restored.save()),saved);
  for(let i=0;i<10;i++){original.step();restored.step();}
  assert.deepEqual(restored.save(),original.save());
 }finally{original.dispose();restored?.dispose();}
});
test('cold restoration preserves projectiles, effects, ammo, timed volleys and damage for all weapons',()=>{
 for(const weapon of ['pistol','sword','rocket','grenade','shotgun'] as WeaponKind[]){const a=prepared(),b=new Room('RESTORE',42);try{
 a.arsenals[0].select(weapon);a.arsenals[0].fire(a.players[0].position,0,{x:0,z:8});a.arsenals[0].ultimate(weapon,a.players[0].position,0,{x:0,z:8});a.step();a.view(0);b.load(jsonClone(a.save()));
 for(let t=0;t<90;t++){a.step();b.step();if(t%3===0)b.load(jsonClone(b.save()));}
 assert.deepEqual(b.players.map(p=>p.vitals),a.players.map(p=>p.vitals),weapon);assert.deepEqual(b.arsenals[0].save().ammo,a.arsenals[0].save().ammo,weapon);assert.equal(b.arsenals[0].boostRemaining,a.arsenals[0].boostRemaining);assert.equal(b.scene.meshes.filter(m=>!m.parent).length,a.scene.meshes.filter(m=>!m.parent).length);
 }finally{a.dispose();b.dispose();}}
});
test('cold restoration preserves dash, pickups, burning and environment',()=>{const a=prepared(),b=new Room('RESTORE',42);try{a.players[0].vitals.rage=100;a.players[0].vitals.hp=40;a.pickups.items.push({id:4,x:0,z:2,kind:'health'});a.skills[0].activate('sword',0,{x:0,z:5});a.players[1].condition.burning=true;for(let i=0;i<7;i++)a.step();b.load(jsonClone(a.save()));for(let i=0;i<25;i++){a.step();b.step();b.load(jsonClone(b.save()));}assert.deepEqual(b.players.map(p=>p.vitals),a.players.map(p=>p.vitals));assert.deepEqual(b.players[0].position,a.players[0].position);assert.equal(b.pickups.items.length,0);}finally{a.dispose();b.dispose();}});
function fixture(){const store=new MemoryStore();let now=100000,req=0;const tokens=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];const call=async(slot:number,action:string,fields:any={})=>{const handler=createHandler(store,()=>now),response=await handler(new Request('https://arena.example/.netlify/functions/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:'DUEL',token:tokens[slot],id:String(++req),action,...fields})}));return {status:response.status,data:await response.json()};};return {store,call,advance(ms:number){now+=ms;}};}
test('HTTP join conflicts converge; full rooms and invalid sessions are rejected',async()=>{const f=fixture();f.store.conflicts=1;const [a,b]=await Promise.all([f.call(0,'join'),f.call(1,'join')]);assert.equal(a.status,200);assert.equal(b.status,200);assert.notEqual(a.data.slot,b.data.slot);const bad=await f.call(0,'poll',{token:'33333333-3333-4333-8333-333333333333'});assert.equal(bad.status,403);const third=await f.call(0,'join',{token:'33333333-3333-4333-8333-333333333333'});assert.equal(third.status,409);assert.equal((await f.call(0,'join')).data.slot,a.data.slot);});
test('two HTTP players complete three scored rounds with a final winner; duplicate shots are idempotent',async()=>{
 const f=fixture();await f.call(0,'join');await f.call(1,'join');let seq=0;
 for(let round=1;round<=3;round++){
  // Only the test fixture arranges a clear shooting lane. Production accepts no position or HP fields.
  const saved:Saved=decode(f.store.values.get('room/DUEL')!.data),r=new Room('DUEL',saved.room.seed);r.load(saved.room);r.phase='playing';r.blocks.forEach(b=>b.destroyed=true);Object.assign(r.players[0].position,{x:0,z:0});Object.assign(r.players[1].position,{x:0,z:3});saved.room=r.save();r.dispose();f.store.values.set('room/DUEL',{data:encode(saved),etag:String(++f.store.revision)});
  for(let shot=0;shot<9;shot++){const message={id:'round'+round+'shot'+shot,input:input(++seq,{fire:true})};await f.call(0,'poll',message);await f.call(0,'poll',message);f.advance(350);await f.call(1,'poll');}
  const a=(await f.call(0,'poll')).data,b=(await f.call(1,'poll')).data;assert.equal(a.phase,'finished');assert.deepEqual(a.scores,[round,0]);assert.deepEqual(b.scores,a.scores);assert.equal(a.self.ammo,1);assert.equal(a.seriesComplete,round===3);
  if(round<3){await f.call(0,'rematch');const next=(await f.call(1,'rematch')).data;assert.equal(next.round,round+1);assert.equal(next.phase,'countdown');}else{assert.equal(a.seriesWinner,0);assert.equal((await f.call(0,'rematch')).data.round,3);}
 }
});
test('untrusted combat fields cannot teleport/heal; stale opponent disconnects; state never leaks sessions',async()=>{const f=fixture();await f.call(0,'join');await f.call(1,'join');const before=(await f.call(0,'poll')).data;const result=await f.call(0,'poll',{input:input(1,{hp:999,x:999})});assert.equal(result.data.self.hp,100);assert.equal(result.data.self.x,before.self.x);assert.equal('members'in result.data,false);assert.equal((await f.call(0,'poll',{input:input(2,{moveX:NaN})})).status,400);f.advance(21000);assert.equal((await f.call(0,'poll')).data.reason,'Opponent disconnected');});
test('handler rejects cross-origin requests and supports a read-only health endpoint',async()=>{const f=fixture(),h=createHandler(f.store);assert.equal((await h(new Request('https://arena.example/.netlify/functions/game'))).status,200);assert.equal((await h(new Request('https://arena.example/.netlify/functions/game',{method:'POST',headers:{Origin:'https://bad.example'},body:'{}'}))).status,403);});

test('simultaneous polls merge both inputs in one room commit; retry only reads the committed result',async()=>{
 const f=fixture();await f.call(0,'join');await f.call(1,'join');
 const write=f.store.write.bind(f.store);let commits=0,attempts=0;
 f.store.write=async(key,data,etag)=>{const ok=await write(key,data,etag);if(key==='room/DUEL'){attempts++;if(ok)commits++;}return ok;};
 const [a,b]=await Promise.all([f.call(0,'poll',{id:'concurrent-a',input:input(1,{moveX:1})}),f.call(1,'poll',{id:'concurrent-b',input:input(1,{moveZ:1})})]);
 assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.data.ackSeq,1);assert.equal(b.data.ackSeq,1);
 assert.equal(commits,1);assert.equal(attempts,2);
 const saved:Saved=decode(f.store.values.get('room/DUEL')!.data);
 assert.ok(saved.members[0]!.receipts.includes('concurrent-a'));assert.ok(saved.members[1]!.receipts.includes('concurrent-b'));
 await f.call(0,'poll',{id:'concurrent-a',input:input(1,{fire:true})});assert.equal(attempts,2,'retries cannot mutate accepted commands');
});

test('950 ms HTTP gap advances all elapsed ticks rather than dropping time after 500 ms',async()=>{
 const f=fixture();await f.call(0,'join');await f.call(1,'join');
 const saved:Saved=decode(f.store.values.get('room/DUEL')!.data),r=new Room('DUEL',saved.room.seed,saved.room);
 try{r.load(saved.room);r.phase='playing';r.blocks.forEach(b=>b.destroyed=true);r.terrain.tiles.forEach(t=>t.kind='normal');Object.assign(r.players[0].position,{x:0,z:0});Object.assign(r.players[1].position,{x:0,z:10});saved.room=r.save();}finally{r.dispose();}
 f.store.values.set('room/DUEL',{data:encode(saved),etag:String(++f.store.revision)});
 const first=await f.call(0,'poll',{input:input(1,{moveX:1})});f.advance(950);
 const next=await f.call(0,'poll',{input:input(2,{moveX:1})});
 assert.equal(next.status,200);assert.ok(next.data.tick-first.data.tick>=28);assert.ok(next.data.self.x>4.5&&next.data.self.x<5);
 f.advance(2000);const stopped=await f.call(1,'poll');const stable=decode(f.store.values.get('room/DUEL')!.data).room.players[0].position.x;
 f.advance(1000);await f.call(1,'poll');assert.equal(decode(f.store.values.get('room/DUEL')!.data).room.players[0].position.x,stable,'stale movement still stops');assert.equal(stopped.status,200);
});
