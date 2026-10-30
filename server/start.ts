import {createServer} from 'node:http';
import {attachGameServer} from './network';

const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const origins=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
if(process.env.NODE_ENV==='production'&&!origins.length)throw Error('ALLOWED_ORIGINS required in production');
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.url==='/health'&&req.method==='GET'){
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({status:'ok',transport:'websocket',service:'cover-arena'}));
 }else{res.writeHead(404);res.end('Not found');}
});
const closeGame=attachGameServer(server,origins.length?new Set(origins):undefined);
server.on('upgrade',(req,socket)=>{if(req.url?.split('?')[0]!=='/ws')socket.destroy();});
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Cover Arena listening on ${process.env.HOST||'127.0.0.1'}:${port}`));
let stopping=false;
function stop(){if(stopping)return;stopping=true;closeGame();server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
