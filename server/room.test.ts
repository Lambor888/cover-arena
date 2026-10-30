import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Room,validInput} from './room';
import {generateMap,SPAWNS} from './map';
import {canStand} from '../src/world';
import {createServer} from 'node:http';
import {WebSocket,WebSocketServer} from 'ws';
import {attachGameServer} from './network';
const input=(seq:number,extra={})=>({type:'input',seq,moveX:0,moveZ:0,aimX:0,aimZ:3,weapon:'pistol',fire:false,skill:false,reload:false,...extra});
test('maps deterministic and spawn positions clear',()=>{for(let seed=0;seed<4;seed++){const map=generateMap(seed);assert.deepEqual(map,generateMap(seed));for(const p of SPAWNS)assert.ok(canStand(p,map));}});
test('authoritative movement, input validation, hits, ammo, death and rematch',()=>{
 const r=new Room('TEST',0);try{
 r.join(0);r.join(1);for(let n=0;n<91;n++)r.step();assert.equal(r.phase,'playing');
 r.blocks.forEach(b=>b.destroyed=true);Object.assign(r.players[0].position,{x:0,z:0});Object.assign(r.players[1].position,{x:0,z:3});
 assert.equal(validInput(input(1,{moveX:NaN})),false);assert.equal(validInput(input(1,{weapon:'invalid'})),false);
 assert.ok(r.accept(0,input(1,{fire:true,hp:999,x:12})));assert.equal(r.accept(0,input(1)),false);
 r.step();r.accept(0,input(2));for(let n=0;n<9;n++)r.step();assert.equal(r.players[1].vitals.hp,88);assert.equal(r.players[0].vitals.hp,100);assert.equal(r.arsenals[0].ammo.ammo,9);assert.equal(r.players[0].position.x,0);
 for(let shot=2;shot<=9;shot++){r.accept(0,input(shot*2-1,{fire:true}));r.step();r.accept(0,input(shot*2));for(let n=0;n<9;n++)r.step();}
 assert.equal(r.phase,'finished');assert.equal(r.winner,0);assert.equal(r.players[1].vitals.hp,0);
 r.rematch(0);assert.equal(r.phase,'finished');r.rematch(1);assert.equal(r.phase,'countdown');assert.equal(r.players[1].vitals.hp,100);assert.equal(r.arsenals[0].ammo.ammo,10);
 r.leave(1);assert.equal(r.reason,'Opponent disconnected');
 }finally{r.dispose();}
});
test('room isolation and visibility filtering',()=>{const a=new Room('A',0),b=new Room('B',0);try{a.join(0);a.join(1);a.phase='playing';a.blocks.forEach(x=>x.destroyed=true);Object.assign(a.blocks[0],{x:0,z:0,width:3,depth:1,height:2,destroyed:false,seeThrough:false});Object.assign(a.players[0].position,{x:0,z:-2});Object.assign(a.players[1].position,{x:0,z:2});assert.equal(a.view(0).enemy,null);a.blocks[0].destroyed=true;assert.ok(a.view(0).enemy);assert.equal(b.players[0].vitals.hp,100);}finally{a.dispose();b.dispose();}});
test('two WebSocket clients join same room; third rejected; independent room and disconnect',async()=>{
 const server=createServer();const close=attachGameServer(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;
 const sockets:WebSocket[]=[];
 const connect=async(room:string)=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);sockets.push(ws);const messages:any[]=[];ws.on('message',data=>messages.push(JSON.parse(data.toString())));await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});ws.send(JSON.stringify({type:'join',room}));return {ws,messages};};
 const wait=async(check:()=>boolean)=>{const deadline=Date.now()+10000;while(!check()){if(Date.now()>deadline)throw Error('Snapshot timeout');await new Promise(r=>setTimeout(r,20));}};
 try {const a=await connect('DUEL'),b=await connect('duel');await wait(()=>a.messages.some(m=>m.phase==='countdown')&&b.messages.some(m=>m.phase==='countdown'));
 assert.equal(a.messages[0].slot,0);assert.equal(b.messages[0].slot,1);assert.deepEqual(a.messages[0].blocks,b.messages[0].blocks);
 const c=await connect('DUEL');await wait(()=>c.messages.some(m=>m.type==='error'));
 const d=await connect('OTHER');await wait(()=>d.messages.some(m=>m.phase==='waiting'));
 await wait(()=>a.messages.some(m=>m.phase==='playing'));
 const before=a.messages.at(-1).self.x;a.ws.send(JSON.stringify(input(1,{moveX:1,hp:999})));await wait(()=>a.messages.at(-1).self.x>before);assert.equal(a.messages.at(-1).self.hp,100);
 b.ws.close();await wait(()=>a.messages.some(m=>m.reason==='Opponent disconnected'));
 }finally{sockets.forEach(s=>s.terminate());close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('game socket leaves unrelated upgrades available for Vite HMR',async()=>{
 const server=createServer(),close=attachGameServer(server),hmr=new WebSocketServer({noServer:true});
 server.on('upgrade',(req,socket,head)=>{if(req.url==='/hmr')hmr.handleUpgrade(req,socket,head,ws=>ws.send('ok'));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;
 const ws=new WebSocket(`ws://127.0.0.1:${port}/hmr`);
 try{const message=await new Promise<string>((resolve,reject)=>{ws.once('message',m=>resolve(m.toString()));ws.once('error',reject);});assert.equal(message,'ok');}
 finally{ws.terminate();for(const c of hmr.clients)c.terminate();hmr.close();close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});


test('100 random layouts are distinct, grid aligned, connected and preserve all materials',()=>{
 const signatures=new Set<string>();
 for(let seed=0;seed<100;seed++){
  const map=generateMap(seed);assert.equal(map.length,73);assert.ok(map.every(b=>!b.destroyed));
  const cells=new Set(map.map(b=>`${b.x},${b.z}`));assert.equal(cells.size,73);
  signatures.add(JSON.stringify(map.map(b=>[b.x,b.z])));
  for(const b of map){assert.ok(Number.isInteger(b.x+.5));assert.ok(Number.isInteger(b.z+.5));}
  for(const p of [...SPAWNS,{x:0,z:-9},{x:2,z:-8}])assert.ok(canStand(p,map));
  for(let i=43;i<73;i+=5){const wall=map.slice(i,i+5);assert.ok(wall.every(b=>b.x===wall[0].x)||wall.every(b=>b.z===wall[0].z));}
  const open=new Set<number>();for(let z=0;z<30;z++)for(let x=0;x<30;x++)if(canStand({x:x-14.5,z:z-14.5},map))open.add(z*30+x);
  const queue=[open.values().next().value!],seen=new Set(queue);
  for(let i=0;i<queue.length;i++){const cell=queue[i],x=cell%30,z=Math.floor(cell/30);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz,n=nz*30+nx;if(nx>=0&&nx<30&&nz>=0&&nz<30&&open.has(n)&&!seen.has(n)){seen.add(n);queue.push(n);}}}
  assert.equal(seen.size,open.size,`unreachable ground in seed ${seed}`);
 }
 assert.equal(signatures.size,100);
});
test('rematch replaces layout and seed for both players, rubble collision follows new blocks',()=>{
 const r=new Room('RANDOM',42);try{
 const old=JSON.stringify(r.blocks);r.join(0);r.join(1);r.phase='finished';r.rematch(0);r.rematch(1);
 assert.notEqual(r.seed,42);assert.notEqual(JSON.stringify(r.blocks),old);assert.deepEqual(r.view(0).blocks,r.view(1).blocks);assert.equal(r.view(0).seed,r.view(1).seed);
 const marble=r.blocks.find(b=>b.material==='marble')!;marble.destroyed=true;r.terrain.onDestroyed(marble);assert.equal(canStand(marble,r.terrain.movementObstacles),false);
 }finally{r.dispose();}
});

