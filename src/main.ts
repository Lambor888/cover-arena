import {connectGame,type GameConnection} from './connection';
import './style.css';
if(new URLSearchParams(location.search).has('training')) {await import('./training');}
else {
 document.body.classList.add('in-lobby');
 const lobby=document.createElement('section');lobby.id='lobby';
 lobby.innerHTML=`<div class="lobby-layout"><div class="lobby-card"><span class="eyebrow">TACTICAL DUELS / 01</span><h1>COVER<br><em>ARENA.</em></h1><p class="lead">Break cover. Chain your weapons.<br>Be the last one standing.</p><form id="join-form"><label for="room-code">ROOM CODE</label><input id="room-code" maxlength="16" pattern="[A-Za-z0-9_-]+" required placeholder="ARENA01" autocomplete="off"><button>CREATE / JOIN ROOM <span>↗</span></button></form><p id="connection-status" role="status">Share a code with a friend. The duel starts when both players join.</p><a class="training-link" href="?training=1">Explore the training arena →</a><div class="lobby-note">2 PLAYERS · DESTRUCTIBLE COVER · FOG OF WAR</div></div><div class="rules-panel"><span class="eyebrow">FIELD MANUAL</span><h2>Know the arena.</h2><div class="rule-grid"><article><b>01 / WIN THE DUEL</b><p>Both players start with 100 HP at hidden random positions. Reduce your opponent to zero. Play three rounds; the highest score wins. Both press R between rounds.</p></article><article><b>02 / READ THE TERRAIN</b><p>Unexplored areas are black. Explored terrain stays dim and updates when seen again. Hidden footsteps, gunfire and explosions give approximate clues.</p></article><article><b>03 / BREAK & COMBINE</b><p>Wood breaks after three pistol hits. Explosives break marble, leaving impassable low rubble. Bushes hide and slow players and absorb rockets and grenades.</p></article><article><b>04 / USE THE ELEMENTS</b><p>Water is slippery and extinguishes burning. Oil is extra slippery and makes you flammable. Fire deals damage; burning players ignite bushes.</p></article></div><details open><summary>WEAPONS & ULTIMATES <span>Q · 100 RAGE</span></summary><ul class="skill-list"><li><b>1 Pistol</b><span>10-round magazine, unlimited reserve. Q: faster fire and bullets for 6s.</span></li><li><b>2 Sword</b><span>Close-range slash. Q: delayed dash to your cursor, break cover and collect items. Marble rubble stops you.</span></li><li><b>3 Launcher</b><span>4 total rockets. Q: three waves of three rockets around your target.</span></li><li><b>4 Grenade</b><span>6 total grenades. Arc over cover. Q: a bomb with a 6-tile blast radius.</span></li><li><b>5 Shotgun</b><span>4 loaded + 4 reserve. 90° cone, 7-tile reach. Q: 9-tile reach and cover destruction.</span></li></ul><p class="rule-note">Rage builds while alive and from damage dealt. Ultimates use rage, not regular ammo. Each click attacks once; holding does not repeat.</p></details><div class="pickup-guide"><span class="health-dot">+ HEALTH <b>+35 HP</b></span><span class="rage-dot">Q RAGE <b>+35 RAGE</b></span><span class="ammo-dot">AM AMMO <b>FULL REFILL</b></span></div><p class="rule-note">Walk over pickups to collect them. One spawns every 8s on passable ground, up to 9 at once. Limited ammo only returns through ammo pickups.</p><div class="controls-guide"><span><kbd>W A S D</kbd> Move</span><span><kbd>MOUSE</kbd> Aim</span><span><kbd>LMB</kbd> Attack</span><span><kbd>1–5</kbd> Weapon</span><span><kbd>Q</kbd> Ultimate</span><span><kbd>F</kbd> Reload</span></div></div></div>`;
 document.body.append(lobby);
 const status=lobby.querySelector<HTMLElement>('#connection-status')!;
 let socket:GameConnection|undefined;
 lobby.querySelector('form')!.addEventListener('submit',async e=>{
  e.preventDefault();if(socket)return;
  const room=lobby.querySelector<HTMLInputElement>('input')!.value.trim();
  status.textContent='Connecting…';
  const ws=connectGame();socket=ws;
  let started=false,accept:((s:import('./protocol').Snapshot)=>void)|undefined;
  const pending:import('./protocol').Snapshot[]=[];
  const timeout=setTimeout(()=>{if(!started){status.textContent='Connection timed out. Check that the server is running.';ws.close();socket=undefined;}},45000);
  ws.onopen=()=>ws.send(JSON.stringify({type:'join',room}));
  ws.onmessage=async event=>{
   const m=JSON.parse(event.data) as import('./protocol').ServerMessage;
   if(m.type==='error'){status.textContent=m.message;ws.close();return;}
   if(accept){accept(m);return;}pending.push(m);if(started)return;started=true;clearTimeout(timeout);
   try{const {startOnline}=await import('./online');document.body.classList.remove('in-lobby');accept=startOnline(m,ws);lobby.remove();pending.forEach(accept);}catch(err){document.body.classList.add('in-lobby');status.textContent=`Unable to start scene: ${err}`;ws.close();}
  };
  ws.onclose=()=>{clearTimeout(timeout);socket=undefined;if(started&&!document.body.classList.contains('in-lobby')){const panel=document.querySelector<HTMLElement>('#round-result')!;panel.hidden=false;panel.textContent='Disconnected. Return to the lobby to rejoin.';}else if(status.textContent==='Connecting…')status.textContent='Connection failed. Restart the game server and retry.';};
  ws.onerror=()=>{status.textContent='Server unavailable. Launch the game using the start script.';};
 });
}



