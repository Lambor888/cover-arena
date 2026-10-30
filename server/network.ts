import {WebSocketServer,WebSocket} from 'ws';
import type {Server,IncomingMessage} from 'node:http';
import type {Duplex} from 'node:stream';
import {freshMapSeed} from '../src/map';
import {Room} from './room';
export function attachGameServer(server:Server,allowedOrigins?:Set<string>) {
 const wss=new WebSocketServer({noServer:true,maxPayload:2048});
 const upgrade=(req:IncomingMessage,socket:Duplex,head:Buffer)=>{if(req.url?.split('?')[0]!=='/ws')return;if(allowedOrigins&&(!req.headers.origin||!allowedOrigins.has(req.headers.origin))){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));};
 server.on('upgrade',upgrade);
 const rooms=new Map<string,{game:Room;clients:(WebSocket|null)[]}>();
 wss.on('connection',ws=>{
  let membership:{entry:ReturnType<typeof rooms.get>&{};slot:number}|undefined;
  let count=0,windowAt=Date.now();
  const error=(message:string)=>ws.send(JSON.stringify({type:'error',message}));
  ws.on('message',raw=>{
   if(Date.now()-windowAt>1000){count=0;windowAt=Date.now();}if(++count>100){ws.close(1008,'Rate limit');return;}
   let m;try{m=JSON.parse(raw.toString());}catch{return error('Invalid message format');}
   if(!m||typeof m!=='object')return;
   if(m.type==='join'&&!membership){
    if(typeof m.room!=='string'||!/^[A-Za-z0-9_-]{1,16}$/.test(m.room))return error('Room codes must contain 1–16 letters, numbers, underscores or hyphens');
    const name=m.room.toUpperCase();let entry=rooms.get(name);
    if(!entry){if(rooms.size>=32)return error('Server room limit reached');entry={game:new Room(name,freshMapSeed()),clients:[null,null]};rooms.set(name,entry);}
    const slot=entry.clients.indexOf(null);
    if(slot<0||entry.game.phase!=='waiting')return error('Room full or match in progress. Try another room code.');
    entry.clients[slot]=ws;membership={entry,slot};entry.game.join(slot);ws.send(JSON.stringify(entry.game.view(slot)));
   }else if(membership){const {entry,slot}=membership;if(m.type==='input')entry.game.accept(slot,m);else if(m.type==='rematch')entry.game.rematch(slot);}
  });
  ws.on('error',()=>{});
  ws.on('close',()=>{if(!membership)return;const {entry,slot}=membership;entry.clients[slot]=null;entry.game.leave(slot);if(entry.clients.every(c=>!c)){entry.game.dispose();rooms.delete(entry.game.name);}});
 });
 let tick=0,last=performance.now(),accumulator=0;
 const timer=setInterval(()=>{const now=performance.now();accumulator=Math.min(accumulator+(now-last)/1000,5/30);last=now;while(accumulator>=1/30){for(const {game,clients} of rooms.values()){game.step();if(tick%2===0)clients.forEach((ws,i)=>{if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<256000)ws.send(JSON.stringify(game.view(i)));});}tick++;accumulator-=1/30;}},1000/30);
 const alive=new WeakSet<WebSocket>();
 wss.on('connection',ws=>{alive.add(ws);ws.on('pong',()=>alive.add(ws));});
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!alive.has(ws)){ws.terminate();continue;}alive.delete(ws);ws.ping();}},15000);
 return ()=>{clearInterval(timer);clearInterval(heartbeat);server.off('upgrade',upgrade);for(const ws of wss.clients)ws.terminate();for(const e of rooms.values())e.game.dispose();rooms.clear();wss.close();};
}



