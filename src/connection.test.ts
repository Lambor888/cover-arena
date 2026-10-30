import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HttpGameConnection} from './connection';
test('HTTP transport keeps click events while coalescing movement and retries with identical request id',async()=>{
 const oldFetch=globalThis.fetch,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');const cache=new Map<string,string>();Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>cache.get(k)??null,setItem:(k:string,v:string)=>cache.set(k,v)}});
 const messages:any[]=[];let polls=0;let resolveDone!:()=>void;const done=new Promise<void>(r=>resolveDone=r);const connection=new HttpGameConnection();
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/.netlify/functions/game');const body=JSON.parse(options!.body as string);messages.push(body);if(body.action==='poll'&&++polls===1)return Response.json({message:'Room busy. Retrying…'},{status:409});return Response.json({type:'state'});};
 connection.onopen=()=>connection.send(JSON.stringify({type:'join',room:'TEST'}));
 connection.onmessage=()=>{if(messages.at(-1).action==='join'){connection.send(JSON.stringify({type:'input',seq:1,moveX:0,moveZ:0,aimX:1,aimZ:2,weapon:'pistol',fire:true,skill:true,reload:false}));connection.send(JSON.stringify({type:'input',seq:2,moveX:1,moveZ:0,aimX:2,aimZ:3,weapon:'pistol',fire:false,skill:false,reload:false}));}else resolveDone();};
 try{await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('HTTP transport timeout')),3000))]);const sent=messages.filter(m=>m.action==='poll');assert.equal(sent.length,2);assert.equal(sent[0].id,sent[1].id);assert.equal(sent[0].input.seq,2);assert.equal(sent[0].input.fire,true);assert.equal(sent[0].input.skill,true);assert.equal(sent[0].input.moveX,1);}finally{connection.close();globalThis.fetch=oldFetch;if(oldStorage)Object.defineProperty(globalThis,'sessionStorage',oldStorage);else delete (globalThis as any).sessionStorage;}
});
