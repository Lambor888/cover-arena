import type {InputMessage,ServerMessage,Snapshot} from './protocol';
export type GameConnection=Pick<WebSocket,'readyState'|'send'|'close'> & {roundTripMs?:number;onopen:((event:any)=>void)|null;onmessage:((event:any)=>void)|null;onclose:((event:any)=>void)|null;onerror:((event:any)=>void)|null};
export class HttpGameConnection implements GameConnection{
 roundTripMs=0;
 readyState=0;onopen:GameConnection['onopen']=null;onmessage:GameConnection['onmessage']=null;onclose:GameConnection['onclose']=null;onerror:GameConnection['onerror']=null;
 private room='';private token='';private pending:InputMessage|undefined;private rematch=false;private timer:ReturnType<typeof setTimeout>|undefined;private closed=false;
 constructor(){queueMicrotask(()=>{this.readyState=1;this.onopen?.({});});}
 send(raw:string){if(this.closed)return;const m=JSON.parse(raw);if(m.type==='join'){this.room=m.room.toUpperCase();const key='arena-session-'+this.room;this.token=sessionStorage.getItem(key)??crypto.randomUUID();sessionStorage.setItem(key,this.token);void this.loop('join');}else if(m.type==='input'){this.pending={...m,fire:m.fire||this.pending?.fire||false,skill:m.skill||this.pending?.skill||false,reload:m.reload||this.pending?.reload||false};}else if(m.type==='rematch')this.rematch=true;}
 private async loop(action='poll'){
  if(this.closed)return;
  const input=this.pending;this.pending=undefined;if(this.rematch){action='rematch';this.rematch=false;}
  const started=performance.now();
  const body=JSON.stringify({room:this.room,token:this.token,id:crypto.randomUUID(),action,input});
  for(let retry=0;retry<5&&!this.closed;retry++){
   try{const response=await fetch('/.netlify/functions/game',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(8000)});const data=await response.json();
    if(!response.ok){if((response.status===409&&data.message==='Room busy. Retrying…')||response.status>=500)throw new Error(data.message);this.onmessage?.({data:JSON.stringify({type:'error',message:data.message})});this.shutdown();return;}
    this.roundTripMs=Math.round(performance.now()-started);
    if(!this.closed)this.onmessage?.({data:JSON.stringify(data)});this.timer=setTimeout(()=>void this.loop(),Math.max(0,100-(performance.now()-started)));return;
   }catch{if(retry===4){this.onerror?.({});this.shutdown();return;}await new Promise(resolve=>setTimeout(resolve,250*(retry+1)));}
  }
 }
 private shutdown(){if(this.closed)return;this.closed=true;this.readyState=3;clearTimeout(this.timer);this.onclose?.({});}
 close(){if(this.closed)return;if(this.room)void fetch('/.netlify/functions/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:this.room,token:this.token,id:crypto.randomUUID(),action:'leave'}),keepalive:true}).catch(()=>{});this.shutdown();}
}
export function connectGame():GameConnection{
 const env=(import.meta as any).env;
 return env.VITE_GAME_TRANSPORT==='netlify'?new HttpGameConnection():new WebSocket(env.VITE_GAME_WS_URL||`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
}

