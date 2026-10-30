// Creates only an isolated diagnostic room; never joins an existing match.
import {randomUUID} from 'node:crypto';
const base=process.argv[2];
if(!base||new URL(base).protocol!=='https:')throw Error('Provide the HTTPS game URL');
const url=new URL('/.netlify/functions/game',base);
const room='DIAG'+randomUUID().replaceAll('-','').slice(0,10);
const tokens=[randomUUID(),randomUUID()];
const results=[];
async function request(slot,action,seq=0){
 const start=performance.now();
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({room,token:tokens[slot],id:randomUUID(),action,...(action==='poll'?{input:{type:'input',seq,moveX:0,moveZ:0,aimX:0,aimZ:0,weapon:'pistol',fire:false,skill:false,reload:false}}:{})})});
 const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data={message:'Non-JSON response'};}
 const result={slot,action,status:response.status,ms:Math.round(performance.now()-start),bytes:raw.length,tick:data.tick,phase:data.phase,...(!response.ok?{error:data.message}:{})};
 results.push(result);console.log(JSON.stringify(result));return response.ok;
}
try{
 if(await request(0,'join')&&await request(1,'join'))for(let i=1;i<=6;i++)await Promise.all([request(0,'poll',i),request(1,'poll',i)]);
}finally{await Promise.allSettled(tokens.map((_,i)=>request(i,'leave')));}
const times=results.filter(r=>r.action==='poll'&&r.status===200).map(r=>r.ms).sort((a,b)=>a-b);
if(times.length)console.log(JSON.stringify({polls:times.length,medianMs:times[Math.floor(times.length/2)],maxMs:times.at(-1)}));
