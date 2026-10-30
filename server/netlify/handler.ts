import {createHash,randomUUID} from 'node:crypto';
import {Room,validInput} from '../room';
import {freshMapSeed} from '../../src/map';
export const encode=(data:unknown)=>JSON.stringify(data,(_k,v)=>v===Infinity?'__infinity__':v);
export const decode=(data:string)=>JSON.parse(data,(_k,v)=>v==='__infinity__'?Infinity:v);
export interface Store{read(key:string):Promise<{data:string;etag:string}|null>;write(key:string,data:string,etag?:string):Promise<boolean>}
type Member={hash:string;seen:number;receipts:string[]}|null;
export type Saved={version:1;generation?:string;revision:string;time:number;updated:number;members:Member[];room:ReturnType<Room['save']>};
type Envelope={id:string;at:number;input?:import('../../src/protocol').InputMessage};
type Inbox={entries:Envelope[]};
const generation=(state:Saved)=>state.generation??`legacy-${state.room.seed}-${state.members.map(m=>m?.hash??'').join('-')}`;
const inboxKey=(name:string,state:Saved,identity:string)=>`input/${name}/${generation(state)}/${identity}`;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createHandler(store:Store,clock=Date.now){return async(request:Request):Promise<Response>=>{
 const started=clock();
 if(request.method==='GET')return reply({service:'Cover Arena',protocol:1,storage:'Netlify Blobs',transport:'HTTP',rounds:3});
 if(request.method!=='POST')return reply({message:'Method not allowed'},405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return reply({message:'Origin not allowed'},403);
 if(Number(request.headers.get('content-length')??0)>8192)return reply({message:'Request too large'},413);
 let body:any;try{const text=await request.text();if(text.length>8192)return reply({message:'Request too large'},413);body=JSON.parse(text);}catch{return reply({message:'Invalid JSON'},400);}
 if(!body||typeof body.room!=='string'||!/^[A-Za-z0-9_-]{1,16}$/.test(body.room)||typeof body.token!=='string'||!/^[a-f0-9-]{36,64}$/i.test(body.token)||typeof body.id!=='string'||body.id.length>64||!['join','poll','leave','rematch'].includes(body.action))return reply({message:'Invalid room request'},400);
 if(body.input!==undefined&&!validInput(body.input))return reply({message:'Invalid input'},400);
 const name=body.room.toUpperCase(),key='room/'+name,identity=hash(body.token);
 let publishedGeneration:string|undefined;
 try{for(let attempt=0;attempt<6;attempt++){
  const now=clock(),stored=await store.read(key);let saved:Saved|undefined=stored?decode(stored.data):undefined;
  if(saved&&saved.version!==1)return reply({message:'Room version changed. Use a new room code.'},409);
  const expired=!saved||now-saved.updated>3600000||saved.members.every(m=>!m||now-m.seen>60000);
  if(expired&&body.action!=='join')return reply({message:'Room expired. Return to lobby.'},410);
  // Each player publishes to their own input mailbox. A competing simulation
  // can commit BOTH players' inputs, allowing the losing request to just read
  // that committed snapshot instead of repeatedly rewriting the same room.
  if(!expired&&body.action==='poll'){
   const member=saved!.members.find(m=>m?.hash===identity);
   if(!member)return reply({message:'Not a member of this room'},403);
   const slot=saved!.members.indexOf(member);
   if(!saved!.room.connected[slot])return reply({message:'Session ended. Return to lobby.'},410);
   if(member.receipts.includes(body.id)){
    const existing=new Room(name,saved!.room.seed,saved!.room);
    try{existing.load(saved!.room);return reply({...existing.view(slot),ackSeq:existing.players[slot].lastSeq,stateAgeMs:Math.max(0,clock()-saved!.time),serverElapsedMs:clock()-started});}finally{existing.dispose();}
   }
   if(publishedGeneration!==generation(saved!)){
    const mailbox=inboxKey(name,saved!,identity);let published=false;
    for(let retry=0;retry<6;retry++){
     const old=await store.read(mailbox),inbox:Inbox=old?decode(old.data):{entries:[]};
     inbox.entries=inbox.entries.filter(e=>!member.receipts.includes(e.id)&&now-e.at<20000);
     if(inbox.entries.some(e=>e.id===body.id)){published=true;break;}
     if(inbox.entries.length>=32)return reply({message:'Room busy. Retrying…'},409);
     inbox.entries.push({id:body.id,at:clock(),input:body.input});
     if(await store.write(mailbox,encode(inbox),old?.etag)){published=true;break;}
    }
    if(!published)return reply({message:'Room busy. Retrying…'},409);
    publishedGeneration=generation(saved!);
   }
  }
  let room:Room;
  if(expired){room=new Room(name,freshMapSeed());saved={version:1,generation:randomUUID(),revision:randomUUID(),time:now,updated:now,members:[null,null],room:room.save()};}
  else{room=new Room(name,saved!.room.seed,saved!.room);room.load(saved!.room);}
  try{
   const state=saved!;let slot=state.members.findIndex(m=>m?.hash===identity);
   if(body.action==='join'&&slot<0){slot=state.members.indexOf(null);if(slot<0||room.phase!=='waiting')return reply({message:'Room full or already playing. Use another room code.'},409);state.members[slot]={hash:identity,seen:now,receipts:[]};room.join(slot);}
   if(slot<0||!state.members[slot])return reply({message:'Not a member of this room'},403);
   if(body.action!=='join'&&!room.connected[slot])return reply({message:'Session ended. Return to lobby.'},410);
   const mailboxes=await Promise.all(state.members.map(m=>m?store.read(inboxKey(name,state,m.hash)):Promise.resolve(null)));
   const queued=mailboxes.flatMap((stored,i)=>stored?(decode(stored.data) as Inbox).entries.filter(e=>!state.members[i]!.receipts.includes(e.id)).map(e=>({...e,slot:i})):[]).sort((a,b)=>a.at-b.at||a.slot-b.slot);
   const simulationNow=clock();
   // HTTP latency can exceed half a second. Catch up bounded real elapsed time
   // and apply inputs at their SERVER arrival time, never client timestamps.
   room.inputTimeoutTicks=45;
   state.time=Math.max(state.time,simulationNow-1500);
   const consume=(until:number)=>{while(queued.length&&queued[0].at<=until){const e=queued.shift()!,m=state.members[e.slot]!;if(room.connected[e.slot]&&e.input)room.accept(e.slot,e.input);m.seen=Math.max(m.seen,e.at);m.receipts.push(e.id);if(m.receipts.length>64)m.receipts.shift();}};
   const steps=Math.min(45,Math.max(0,Math.floor((simulationNow-state.time)/(1000/30))));
   for(let n=0;n<steps;n++){consume(state.time);room.step();state.time+=1000/30;}
   consume(simulationNow);
   state.members.forEach((m,i)=>{if(m&&i!==slot&&now-m.seen>20000&&room.connected[i])room.leave(i);});
   const member=state.members[slot]!;member.seen=Math.max(member.seen,now);
   if(!member.receipts.includes(body.id)){
    if(body.input)room.accept(slot,body.input);
    if(body.action==='rematch')room.rematch(slot);
    if(body.action==='leave'){room.leave(slot);if(room.phase==='waiting')state.members[slot]=null;}
    member.receipts.push(body.id);if(member.receipts.length>32)member.receipts.shift();
   }
   const snapshot={...room.view(slot),ackSeq:room.players[slot].lastSeq};
   state.room=room.save();state.updated=now;state.revision=randomUUID();
   if(await store.write(key,encode(state),stored?.etag))return reply({...snapshot,stateAgeMs:Math.max(0,clock()-state.time),serverElapsedMs:clock()-started});
  }finally{room.dispose();}
  await new Promise(resolve=>setTimeout(resolve,10+Math.random()*25));
 }
 return reply({message:'Room busy. Retrying…'},409);
 }catch(error){console.error('Game request failed',error instanceof Error?error.message:'Unknown error');return reply({message:'Game service unavailable. Please retry.'},503);}
};}
