import WebSocket from 'ws';
const url=process.argv[2]||'wss://34.130.69.170/ws';
const origin=process.argv[3]||'https://cover-arena.netlify.app';
const room='CHK'+Date.now().toString(36).toUpperCase();
const sockets=[];
const wait=async check=>{const until=Date.now()+15000;while(!check()){if(Date.now()>until)throw Error('Snapshot timeout');await new Promise(r=>setTimeout(r,20));}};
try{
 const peers=[];
 for(let n=0;n<2;n++){
  const ws=new WebSocket(url,{origin});sockets.push(ws);
  const peer={messages:[],times:[],ws};peers.push(peer);
  ws.on('message',data=>{const m=JSON.parse(data.toString());peer.messages.push(m);peer.times.push(performance.now());});
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  ws.send(JSON.stringify({type:'join',room}));
 }
 await wait(()=>peers.every(p=>p.messages.some(m=>m.phase==='playing')));
 const before=peers[0].messages.at(-1).self;
 peers[0].ws.send(JSON.stringify({type:'input',seq:1,moveX:1,moveZ:0,aimX:before.x+3,aimZ:before.z,weapon:'pistol',fire:true,skill:false,reload:false}));
 await wait(()=>peers[0].messages.at(-1).self.ammo===9);
 const shotConfirmed=true;
 peers[0].ws.send(JSON.stringify({type:'input',seq:2,moveX:0,moveZ:0,aimX:before.x+3,aimZ:before.z,weapon:'pistol',fire:false,skill:false,reload:false}));
 const rtts=[];
 for(let n=0;n<12;n++){
  const start=performance.now();
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Ping timeout')),5000);peers[0].ws.once('pong',()=>{clearTimeout(timer);resolve();});peers[0].ws.ping();});
  rtts.push(Math.round(performance.now()-start));
  await new Promise(r=>setTimeout(r,100));
 }
 const intervals=peers[0].times.slice(1).map((t,i)=>t-peers[0].times[i]).sort((a,b)=>a-b);
 const denied=await new Promise((resolve,reject)=>{
  const ws=new WebSocket(url,{origin:'https://unapproved.invalid'});sockets.push(ws);
  const timer=setTimeout(()=>{ws.terminate();reject(Error('Origin check timeout'));},5000);
  ws.on('error',()=>{});
  ws.once('unexpected-response',(_,res)=>{clearTimeout(timer);res.resume();ws.terminate();resolve(res.statusCode);});
  ws.once('open',()=>{clearTimeout(timer);reject(Error('Unapproved origin accepted'));});
 });
 if(denied!==403)throw Error('Expected 403 for unapproved origin');
 console.log(JSON.stringify({url,room,slots:peers.map(p=>p.messages[0].slot),phases:peers.map(p=>p.messages.at(-1).phase),shotConfirmed,unapprovedOriginStatus:denied,pingMs:rtts,snapshotIntervalMs:{median:Math.round(intervals[Math.floor(intervals.length/2)]),p95:Math.round(intervals[Math.floor(intervals.length*.95)])}},null,2));
 if(peers.some(p=>p.messages.some(m=>m.type==='error')))throw Error('Server returned error');
}finally{sockets.forEach(ws=>ws.terminate());}
