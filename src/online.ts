import type {GameConnection} from './connection';
import {LocalMotion,PoseSmoother} from './networkMotion';
import {renderHud} from './hud';
import {createPickupView} from './pickupView';
import {SKILL_NAMES} from './rageSkills';
import './style.css';



import {createTerrainView} from './terrainView';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { FxaaPostProcess } from '@babylonjs/core/PostProcesses/fxaaPostProcess.js';
import '@babylonjs/core/Shaders/fxaa.vertex.js';
import '@babylonjs/core/Shaders/fxaa.fragment.js';
import { createRoundedBox } from './roundedBox';


import { createTerrain } from './terrain';


import { createSoundHints } from './hearing';
import '@babylonjs/core/Culling/ray.js';
import { createVisibilityMaterials } from './visibility';
import { SPAWN, PLAYER_SCALE } from './world';


import type {Snapshot,PlayerView,InputMessage} from './protocol';
import type {WeaponKind} from './resources';
import {Mesh as EffectMesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
export function startOnline(initial:Snapshot,ws:GameConnection) {
const canvas=document.querySelector<HTMLCanvasElement>('#game')!;
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.055, 0.083, 0.075, 1);
  const camera = new FreeCamera('tactical-camera', new Vector3(0, 21, -28), scene);
  camera.setTarget(Vector3.Zero());
  camera.mode = Camera.PERSPECTIVE_CAMERA;
  camera.fov = 50 * Math.PI / 180;
  camera.minZ = 0.1;
  camera.maxZ = 100;
  new FxaaPostProcess('edge-antialiasing', 1, camera);
  // No camera controls: movement directions stay consistent on screen.
  function resize() {
    engine.resize();
    const aspect = engine.getRenderWidth() / engine.getRenderHeight();
    // Fit the arena in perspective, pulling back on narrow windows instead of
    // distorting the FOV. The (0, .6, -.8) direction keeps the 37-degree tilt.
    const tangent = Math.tan(camera.fov / 2);
    let distance = 35;
    for (const x of [-15.2, 15.2]) for (const z of [-15.2, 15.2]) for (const y of [0, 2.2]) {
      const depth = 0.6 * y - 0.8 * z;
      const up = 0.8 * y + 0.6 * z;
      distance = Math.max(distance, depth + 1.12 * Math.abs(x) / (tangent * aspect), depth + 1.12 * Math.abs(up) / tangent);
    }
    camera.position.set(0, distance * 0.6, -distance * 0.8);
    camera.setTarget(Vector3.Zero());
    camera.maxZ = distance + 60;
  }
  resize();
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);

  const blocks = initial.blocks.map(b=>({...b}));
  const terrain = createTerrain(blocks);
  const visibility = createVisibilityMaterials(scene, blocks, terrain.tiles, terrain.kindAt);
  const groundMaterials = {
    oil: visibility.make('ground-oil', '#24212c', -1, true),
    fire: visibility.make('ground-fire', '#e84b22', -1, true),
    marbleRubble: visibility.make('ground-marble-rubble', '#bfc3bf', -1, true),
    normal: visibility.make('ground-normal', '#6a8270', -1, true),
    bush: visibility.make('ground-bush', '#386342', -1, true),
    water: visibility.make('ground-water', '#459db6', -1, true),
    rubble: visibility.make('ground-rubble', '#978575', -1, true),
  };
  const updateTerrainView=createTerrainView(scene,terrain.tiles,groundMaterials);
  function refreshTerrain() {updateTerrainView(visibility.memory.knownTiles);}
  refreshTerrain();
  const plinth = MeshBuilder.CreateBox('arena-base', { width: 30.15, depth: 30.15, height: 0.35 }, scene);
  plinth.position.y = -0.19;
  plinth.material = visibility.make('base', '#293e35');
  const blockMeshes = blocks.map((b, i) => {
    const box = createRoundedBox(`obstacle-${i}`, b.width, b.height, b.depth, scene);
    box.position.set(b.x, b.height / 2, b.z);
    const colors = { wood: '#bca786', marble: '#e4e6df', bush: '#44834e', tank: '#7bd9ef', oil: '#171820' };
    box.material = visibility.make(`obstacle-material-${i}`, colors[b.material], i, false, false, b.material === 'tank' ? 0.35 : b.material === 'bush' ? 0.85 : 1);
    box.setEnabled(false);
    return box;
  });

function makePawn(color:string) {
  const pawn = new TransformNode('player', scene);
  pawn.scaling.setAll(PLAYER_SCALE);
  pawn.position.set(SPAWN.x, 0, SPAWN.z);
  const teal = visibility.make('player-teal', color, -1, false, false, 1, true);
  const dark = visibility.make('player-dark', '#274d47', -1, false, false, 1, true);
  const body = MeshBuilder.CreateCylinder('pawn-body', { height: 0.9, diameterTop: 0.57, diameterBottom: 0.78, tessellation: 12 }, scene);
  body.position.y = 0.65;
  body.parent = pawn;
  body.material = teal;
  const head = MeshBuilder.CreateSphere('pawn-head', { diameter: 0.62, segments: 8 }, scene);
  head.position.y = 1.27;
  head.parent = pawn;
  head.material = teal;
  const visor = MeshBuilder.CreateBox('facing-visor', { width: 0.38, height: 0.16, depth: 0.17 }, scene);
  visor.position.set(0, 1.29, 0.27);
  visor.parent = pawn;
  visor.material = dark;
  const pointer = MeshBuilder.CreateCylinder('direction-pointer', { height: 0.5, diameterTop: 0, diameterBottom: 0.32, tessellation: 3 }, scene);
  pointer.rotation.x = Math.PI / 2;
  pointer.position.set(0, 0.3, 0.7);
  pointer.parent = pawn;
  pointer.material = visibility.make('pointer', '#e2ffd4', -1, false, true, 1, true);
  const ring = MeshBuilder.CreateTorus('player-ring', { diameter: 1.05, thickness: 0.045, tessellation: 40 }, scene);
  ring.position.y = 0.035;
  ring.parent = pawn;
  ring.material = visibility.make('ring', '#8df5cc', -1, false, true, 1, true);

return {pawn,body,head,teal};}

 const self=makePawn('#83efd1'),enemy=makePawn('#ed8876');
 const white=visibility.make('hit-white','#ffffff',-1,false,true,1,true),red=visibility.make('burn-red','#ff2020',-1,false,true,1,true);
 const gold=visibility.make('projectile','#ffe69a',-1,false,true),blast=visibility.make('blast','#ffac4f',-1,false,true,.35),slash=visibility.make('slash','#abf6ed',-1,false,true,.4);
 const effects=new Map<number,Mesh>();
 const effectMotion=new Map<number,PoseSmoother>();
 const enemyMotion=new PoseSmoother();
 const localMotion=new LocalMotion(terrain.movementObstacles,terrain.kindAt);
 const predictLocal=ws.roundTripMs!==undefined;
 let lastSnapshotAt=performance.now()/1000,firstSnapshot=true,localAttackLock=0;
 const hints=createSoundHints(p=>{const q=Vector3.Project(new Vector3(p.x,1.2,p.z),Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));const rect=canvas.getBoundingClientRect();return {x:rect.left+q.x*canvas.clientWidth/engine.getRenderWidth(),y:rect.top+q.y*canvas.clientHeight/engine.getRenderHeight()};},()=>canvas.clientWidth);
 let state=initial,round=initial.round,lastCue=0,lastCombatCue=0;
 const pickupView=createPickupView(scene);
 const keys=new Set<string>();let weapon:WeaponKind='pistol',fire=false,skill=false,reload=false,seq=initial.ackSeq??0;
 let aim={x:0,z:0};
 const result=document.querySelector<HTMLElement>('#round-result')!;
 const leave=document.createElement('button');leave.id='leave-room';leave.textContent='Leave match';leave.onclick=()=>{ws.close();location.href='/';};document.querySelector('.game-hud footer')!.append(leave);
 document.querySelector('header p')!.textContent='1v1 DUEL · Q Ultimate · F Reload';
 document.querySelector('.legend small')!.textContent='Dim terrain is remembered · Water extinguishes fire · Oil tanks can chain-react';
 document.querySelector('#reset')!.textContent='Rematch · R';
 const rematch=()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'rematch'}));};
 document.querySelector('#reset')!.addEventListener('click',rematch);
 const weapons:WeaponKind[]=['pistol','sword','rocket','grenade','shotgun'];
 document.querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach(b=>b.onclick=()=>{weapon=b.dataset.weapon as WeaponKind;canvas.focus();});
 window.addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyF','KeyR','Digit1','Digit2','Digit3','Digit4','Digit5'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyQ')skill=true;if(e.code==='KeyF')reload=true;if(e.code==='KeyR')rematch();const n=Number(e.key)-1;if(weapons[n])weapon=weapons[n];});
 window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();fire=skill=reload=false;});
 canvas.addEventListener('pointerdown',e=>{if(e.button===0){fire=true;if(weapon==='sword'&&state.self.cooldown<=0&&state.phase==='playing')localAttackLock=.12;canvas.focus();}});

 window.addEventListener('pointercancel',()=>fire=false);canvas.addEventListener('pointerleave',()=>fire=false);document.addEventListener('visibilitychange',()=>{keys.clear();fire=skill=reload=false;});
 canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();const ray=scene.createPickingRay((e.clientX-r.left)*engine.getRenderWidth()/r.width,(e.clientY-r.top)*engine.getRenderHeight()/r.height,Matrix.Identity(),camera);if(Math.abs(ray.direction.y)>.00001){const t=-ray.origin.y/ray.direction.y;if(t>0)aim={x:Math.max(-15,Math.min(15,ray.origin.x+ray.direction.x*t)),z:Math.max(-15,Math.min(15,ray.origin.z+ray.direction.z*t))};}});
 const timer=setInterval(()=>{if(ws.readyState!==WebSocket.OPEN){clearInterval(timer);return;}const input:InputMessage={type:'input',seq:++seq,moveX:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),moveZ:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),aimX:aim.x,aimZ:aim.z,weapon,fire,skill,reload};ws.send(JSON.stringify(input));fire=skill=reload=false;},1000/30);
 function place(actor:ReturnType<typeof makePawn>,p:PlayerView|null) {actor.pawn.setEnabled(!!p&&p.hp>0);if(!p)return;actor.pawn.position.set(p.x,0,p.z);actor.pawn.rotation.y=p.yaw;const lit=Math.floor(p.phase/.12)%2===0;const m=lit&&(p.burning||p.flammable||p.flash>0)?p.burning?red:white:actor.teal;actor.body.material=actor.head.material=m;}
 function effect(kind:string,vertices?:number[]):Mesh {
  if(kind==='shotgun-cone'&&vertices){const m=new EffectMesh(kind,scene),d=new VertexData();d.positions=vertices;d.normals=Array.from({length:vertices.length/3},()=>[0,1,0]).flat();d.indices=[];for(let i=1;i<vertices.length/3-1;i++)d.indices.push(0,i,i+1);d.applyToMesh(m);m.material=blast;return m;}
  if(kind==='sword-sweep-area') {const m=new EffectMesh(kind,scene),d=new VertexData();const p=[0,0,0],n=[0,1,0],idx:number[]=[];for(let i=0;i<=32;i++){const a=-Math.PI/3+i/32*Math.PI*2/3;p.push(Math.sin(a)*2.8,0,Math.cos(a)*2.8);n.push(0,1,0);if(i)idx.push(0,i,i+1);}d.positions=p;d.normals=n;d.indices=idx;d.applyToMesh(m);m.material=slash;return m;}
  if(kind==='sword-sweep-blade'){const m=MeshBuilder.CreateBox(kind,{width:.1,height:.08,depth:2.8},scene);m.bakeTransformIntoVertices(Matrix.Translation(0,0,1.4));m.material=gold;return m;}
  const m=kind==='blast-radius'?MeshBuilder.CreateTorus(kind,{diameter:2,thickness:.045},scene):MeshBuilder.CreateSphere(kind,{diameter:kind==='rocket-explosion'?2:kind==='large-grenade-shell'?.75:kind==='pistol-bullet'?.13:kind==='bullet-impact'?.22:kind==='rocket-shell'?.32:.36,segments:8},scene);m.material=kind.includes('explosion')||kind==='blast-radius'?blast:gold;return m;
 }
 function accept(next:Snapshot) {
  const now=performance.now()/1000,interval=now-lastSnapshotAt,reset=firstSnapshot||round!==next.round;
  lastSnapshotAt=now;firstSnapshot=false;
  state=next;if(round!==next.round){round=next.round;visibility.reset();hints.reset();keys.clear();fire=skill=reload=false;}
  blocks.forEach((b,i)=>{Object.assign(b,next.blocks[i]);blockMeshes[i].position.set(b.x,b.height/2,b.z);});terrain.tiles.forEach((t,i)=>t.kind=next.tiles[i]);visibility.invalidate();
  pickupView.update(next.pickups);
  place(self,next.self);place(enemy,next.enemy);
  const age=next.stateAgeMs===undefined?undefined:next.stateAgeMs+Math.max(0,(ws.roundTripMs??0)-(next.serverElapsedMs??0))/2;
  localMotion.receive(next.self,next.phase==='playing',now,ws.roundTripMs??0,reset,age);
  if(predictLocal){const p=localMotion.display();self.pawn.position.set(p.x,0,p.z);}
  enemyMotion.receive(next.enemy&&next.enemy.hp>0?{...next.enemy,y:0}:null,now,interval,reset);
  const ids=new Set(next.effects.map(e=>e.id));for(const [id,m] of effects)if(!ids.has(id)){m.dispose();effects.delete(id);effectMotion.delete(id);}
  for(const e of next.effects){let m=effects.get(e.id);if(!m){m=effect(e.kind,e.vertices);effects.set(e.id,m);}let motion=effectMotion.get(e.id);if(!motion){motion=new PoseSmoother();effectMotion.set(e.id,motion);}motion.receive(e,now,interval,reset);m.position.set(e.x,e.y,e.z);m.scaling.set(e.sx,e.sy,e.sz);m.rotation.y=e.yaw;}
  for(const cue of next.sounds)if(cue.id>lastCue){hints.emit(cue,{x:next.self.x,z:next.self.z});lastCue=cue.id;}
  document.querySelector('.status')!.textContent=`Room ${next.room} · ${next.slot+1}P · Round ${next.round}/3 · ${next.scores[next.slot]} – ${next.scores[1-next.slot]}${ws.roundTripMs!==undefined?` · Sync ${ws.roundTripMs} ms · ${Math.round(engine.getFps())} FPS`:''}`;
  for(const cue of next.combatCues)if(cue.id>lastCombatCue){hints.emit(cue,{x:next.self.x,z:next.self.z},cue.kind==='shot'?'GUNFIRE':'EXPLOSION');lastCombatCue=cue.id;}
  renderHud(next.self,next.enemy?.hp??(next.phase==='finished'&&next.winner===next.slot?0:null));
  if(next.phase!=='playing')fire=skill=reload=false;

  document.querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weapon===next.self.weapon)));
  result.hidden=next.phase==='playing';
  document.querySelector<HTMLButtonElement>('#reset')!.disabled=next.seriesComplete;
  result.textContent=next.seriesComplete?`FINAL · ${next.seriesWinner===null?'DRAW':next.seriesWinner===next.slot?'VICTORY':'DEFEAT'} · ${next.scores[next.slot]} – ${next.scores[1-next.slot]} · Return to lobby for a new room`:next.phase==='waiting'?`Room ${next.room} · Waiting for opponent`:next.phase==='countdown'?`${Math.ceil(next.countdown)} s to start`:next.phase==='finished'?`${next.winner===null?'Draw':next.winner===next.slot?'Victory':'Defeat'} · ${next.reason} · ${next.ready[next.slot]?'Ready · waiting for opponent':'Press R for next round'}`:'';
 }
 accept(initial);
 engine.runRenderLoop(()=>{
  const dt=Math.min(.05,engine.getDeltaTime()/1000),now=performance.now()/1000;
  localAttackLock=Math.max(0,localAttackLock-dt);
  if(predictLocal){const p=localMotion.update(now,dt,{x:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),z:Number(keys.has('KeyW'))-Number(keys.has('KeyS'))},weapon,localAttackLock>0);self.pawn.position.set(p.x,0,p.z);
   if(state.phase==='playing'&&state.self.hp>0&&state.self.stun<=0&&!state.self.movementLocked&&state.self.skillPhase==='idle'&&localAttackLock<=0)self.pawn.rotation.y=Math.atan2(aim.x-p.x,aim.z-p.z);
  }
  const opponent=enemyMotion.sample(now);if(opponent){enemy.pawn.position.set(opponent.x,opponent.y,opponent.z);enemy.pawn.rotation.y=opponent.yaw;}
  for(const [id,motion]of effectMotion){const p=motion.sample(now),m=effects.get(id);if(p&&m){m.position.set(p.x,p.y,p.z);m.rotation.y=p.yaw;}}
  // Exploration remains authoritative; predicted motion must not reveal cover.
  if(visibility.update({x:state.self.x,z:state.self.z},dt)){refreshTerrain();blockMeshes.forEach((m,i)=>m.setEnabled(visibility.memory.knownBlocks[i]===false));}hints.update(dt);scene.render();
 });
 window.addEventListener('pagehide',()=>{clearInterval(timer);ws.close();engine.dispose();},{once:true});
 return accept;
}



