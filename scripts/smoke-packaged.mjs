import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {BlobsServer} from '@netlify/blobs/server';
import {setEnvironmentContext,getStore} from '@netlify/blobs';
import game from '../release-check/unpacked/netlify/functions/game.mjs';
const directory='release-check/blobs-'+Date.now();await mkdir(directory,{recursive:true});
// SDK 10.7.13 local emulator omits ETags on GET although its PUT compares them.
// Fill the missing GET header using the emulator's own file-version generator.
// This shim is test-only, never included in the deployed function.
class VersionedBlobsServer extends BlobsServer{async get(req){const response=await super.get(req);if(response.status===200&&!response.headers.has('etag')){const url=this.parseAPIRequest(req)?.url??new URL(req.url,this.address);const {dataPath}=this.getLocalPaths(url);if(dataPath)response.headers.set('etag',await BlobsServer.generateETag(dataPath));}return response;}}
const emulator=new VersionedBlobsServer({directory,token:'local-test-only',logger:()=>{}});
const address=await emulator.start();
setEnvironmentContext({apiURL:`http://127.0.0.1:${address.port}`,siteID:randomUUID(),token:'local-test-only'});
const times=[];
try{
 const tokens=[randomUUID(),randomUUID()];
 const send=async(slot,action,extra={})=>{const start=performance.now();const response=await game(new Request('https://arena.example/.netlify/functions/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:'PACKAGE',token:tokens[slot],id:randomUUID(),action,...extra})}));times.push(performance.now()-start);const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
 const health=await game(new Request('https://arena.example/.netlify/functions/game'));assert.equal(health.status,200);
 const a=await send(0,'join'),b=await send(1,'join');assert.equal(a.slot,0);assert.equal(b.slot,1);assert.equal(b.phase,'countdown');
 const blobs=getStore({name:'cover-arena-v1',consistency:'strong'});
 const version=await blobs.getWithMetadata('room/PACKAGE',{type:'text'});assert.ok(version.etag);
 const conflict=await blobs.set('room/PACKAGE','bad',{onlyIfMatch:'"stale"'});assert.equal(conflict.modified,false);
 let state=await send(0,'poll');assert.equal(state.self.hp,100);assert.equal(state.enemy,null);
 await send(1,'leave');state=await send(0,'poll');assert.equal(state.reason,'Opponent disconnected');
 const report={packagedFunction:'PASS',blobsSDK:'PASS',conditionalWriteConflict:'PASS',twoPlayers:'PASS',requests:times.length,localRequestMs:times.map(Math.round),note:'Local Blobs emulator with test-only missing-GET-ETag shim. Not cloud validation.'};await writeFile('release-check/packaged-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await emulator.stop();}
