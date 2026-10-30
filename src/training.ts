import {renderHud} from './hud';
import {randomSpawns} from './spawns';
import {createPickups} from './pickups';
import {createPickupView} from './pickupView';
import {createSight} from './fog';
import {pushFrom} from './shotgun';
import './style.css';
import {createVitals,dealDamage,updateVitals,resetVitals} from './vitals';
import {createRageSkills,SKILL_NAMES} from './rageSkills';
import {WEAPON_RULES} from './resources';
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
import { createArsenal, type Weapon } from './arsenal';
import {generateMap,freshMapSeed} from './map';
import { createTerrain, movementVelocity, WEAPON_SPEED, TERRAIN_SPEED } from './terrain';
import { createHazards, createCondition, conditionFlash } from './hazards';
import { createEnemy } from './enemy';
import { createFootsteps, createSoundHints } from './hearing';
import '@babylonjs/core/Culling/ray.js';
import { createVisibilityMaterials } from './visibility';
import { SPAWN, movePlayer, PLAYER_SCALE } from './world';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const errorPanel = document.querySelector<HTMLDivElement>('#error')!;
function showError(message: string) {
  errorPanel.hidden = false;
  errorPanel.textContent = `Unable to start scene: ${message}. Use a WebGL-capable desktop browser with hardware acceleration.`;
}
window.addEventListener('error', event => showError(event.message));

try {
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

  let mapSeed=freshMapSeed();
  const blocks = generateMap(mapSeed);
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
  const debrisMaterial = visibility.make('wood-debris', '#bca786');
  const marbleDebris = visibility.make('marble-debris', '#e4e6df');
  const leafDebris = visibility.make('leaf-debris', '#69aa50');
  const waterDebris = visibility.make('water-splash', '#82ddf4', -1, false, true, 0.65);
  const fragments: { mesh: Mesh; velocity: Vector3; life: number }[] = [];
  function blockDestroyed(index: number) {
    const block = blocks[index];
    visibility.invalidate();
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const mesh = MeshBuilder.CreateBox('wood-fragment', { width: block.width*0.32, height: block.height*0.32, depth: block.depth*0.32 }, scene);
      mesh.position.set(block.x + x * block.width*0.225, block.height/2 + y * block.height*0.225, block.z + z * block.depth*0.225);
      mesh.material = { wood: debrisMaterial, marble: marbleDebris, bush: leafDebris, tank: waterDebris, oil: marbleDebris }[block.material];
      mesh.isPickable = false;
      fragments.push({ mesh, velocity: new Vector3(x * 2.2, 2.6 + y, z * 2.2), life: 0.75 });
    }
  }
  function updateFragments(dt: number) {
    for (let i = fragments.length - 1; i >= 0; i--) {
      const part = fragments[i];
      part.life -= dt;
      if (part.life <= 0) { part.mesh.dispose(); fragments.splice(i, 1); continue; }
      part.velocity.y -= 12 * dt;
      part.mesh.position.addInPlace(part.velocity.scale(dt));
      part.mesh.position.y = Math.max(0.2, part.mesh.position.y);
      part.mesh.rotation.x += dt * 3;
      part.mesh.rotation.z += dt * 2;
      part.mesh.scaling.setAll(Math.min(1, part.life / 0.3));
    }
  }

  const pawn = new TransformNode('player', scene);
  pawn.scaling.setAll(PLAYER_SCALE);
  pawn.position.set(SPAWN.x, 0, SPAWN.z);
  const teal = visibility.make('player-teal', '#83efd1', -1, false, false, 1, true);
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

  const reticle = MeshBuilder.CreateTorus('aim-point', { diameter: 0.42, thickness: 0.035, tessellation: 32 }, scene);
  reticle.position.y = 0.025;
  reticle.material = visibility.make('reticle', '#e0edb8', -1, false, true);
  reticle.setEnabled(false);
  const playerVitals=createVitals(),enemyVitals=createVitals();
  let roundOver=false;

  const resultPanel=document.querySelector<HTMLElement>('#round-result')!;
  const playerCondition=createCondition(pawn.position);
  const hitWhite=visibility.make('player-hit','#ffffff',-1,false,true,1,true);
  const burnRed=visibility.make('player-burning','#ff2020',-1,false,true,1,true);
  const enemy=createEnemy(scene,visibility,blocks,terrain.kindAt,terrain.movementObstacles);
  const enemyCondition=createCondition(enemy.target.position);
  const hazards=createHazards(blocks,terrain,[playerCondition,enemyCondition],blockDestroyed,(p,r)=>{arsenal.showExplosion(p,r);if(!createSight(pawn.position,blocks).visible(p,.4))soundHints.emit(combatSoundArea(p),pawn.position,'EXPLOSION');},(actor,amount)=>{
    if(actor===enemyCondition) dealDamage(enemyVitals,amount,playerVitals);
    else dealDamage(playerVitals,amount);
  });
  const opponentTarget={...enemy.target,knockback(origin:{x:number;z:number},yaw:number){if(enemyVitals.hp<=0)return;pushFrom(enemy.target.position,origin,yaw,terrain.movementObstacles);enemyVitals.stun=Math.max(enemyVitals.stun,.2);},hit(weapon: keyof typeof WEAPON_RULES) {
    if(enemyVitals.hp<=0)return;
    dealDamage(enemyVitals,WEAPON_RULES[weapon].damage,playerVitals);
    enemy.target.hit(weapon);
  }};
  const footsteps=createFootsteps();
  const soundHints=createSoundHints(point=>{
    const screen=Vector3.Project(new Vector3(point.x,1.2,point.z),Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
    const rect=canvas.getBoundingClientRect();
    return {x:rect.left+screen.x*canvas.clientWidth/engine.getRenderWidth(),y:rect.top+screen.y*canvas.clientHeight/engine.getRenderHeight()};
  },()=>canvas.clientWidth);
  const arsenal = createArsenal(scene, {
    bullet: visibility.make('bullet-gold', '#ffe69a', -1, false, true),
    steel: visibility.make('rocket-steel', '#c6cdd0'),
    fire: visibility.make('rocket-fire', '#ffb34f', -1, false, true),
    slash: visibility.make('sword-area', '#abf6ed', -1, false, true, 0.35),
    blast: visibility.make('explosion', '#ffb34f', -1, false, true, 0.3),
  }, blocks, hazards.attackBlock, [opponentTarget], (p,w,radius=3)=>{hazards.explode(p,radius,false,WEAPON_RULES[w].damage);visibility.invalidate();},p=>{hazards.spreadFuel(p);visibility.invalidate();},(p,yaw,ultimate)=>{hazards.igniteCone(p,yaw,ultimate);visibility.invalidate();});
  const skills=createRageSkills(playerVitals,pawn.position,enemyVitals,enemy.target.position,blocks,terrain.movementObstacles,i=>{hazards.breakForDash(i);},(p,yaw,aim)=>arsenal.ultimate('grenade',p,yaw,aim),(weapon,p,yaw,aim)=>arsenal.ultimate(weapon,p,yaw,aim),()=>pickups.update(0,[{position:pawn.position,vitals:playerVitals,refill:()=>arsenal.refill()}]));
  const chargeMarker=MeshBuilder.CreateBox('charge-direction',{width:.12,height:.035,depth:4},scene);
  chargeMarker.material=visibility.make('charge-warning','#ffce62',-1,false,true,1,true);chargeMarker.isPickable=false;chargeMarker.setEnabled(false);
  const weaponButtons = document.querySelectorAll<HTMLButtonElement>('[data-weapon]');

  function selectWeapon(weapon: Weapon) {
    if(skills.locked || roundOver)return;
    arsenal.select(weapon);
    weaponButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.weapon === weapon)));
  }
  weaponButtons.forEach(button => button.addEventListener('click', () => { selectWeapon(button.dataset.weapon as Weapon); canvas.focus(); }));
  let shotRequested = false, skillRequested=false;
  const pickups=createPickups(terrain),pickupView=createPickupView(scene);
  function placeSpawns(){const pair=randomSpawns(blocks);pawn.position.set(pair[0].x,0,pair[0].z);Object.assign(enemy.target.position,pair[1]);}
  placeSpawns();
  const keys = new Set<string>();
  const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  let mouse: { x: number; y: number } | null = null;
  let verticalVelocity = 0;
  let velocity = { x: 0, z: 0 };
  function reset() {
    pawn.setEnabled(true);
    pawn.position.set(SPAWN.x, 0, SPAWN.z);
    pawn.rotation.y = 0;
    verticalVelocity = 0;
    velocity = { x: 0, z: 0 };
    keys.clear();
    shotRequested = false;
    arsenal.reset();skills.reset();resetVitals(playerVitals);resetVitals(enemyVitals);
    roundOver=false;resultPanel.hidden=true;skillRequested=false;chargeMarker.setEnabled(false);
    enemy.reset(); hazards.reset(); footsteps.reset(); soundHints.reset();
    mapSeed=freshMapSeed(mapSeed);const nextMap=generateMap(mapSeed);
    blocks.forEach((block,index)=>{Object.assign(block,nextMap[index]);blockMeshes[index].position.set(block.x,block.height/2,block.z);blockMeshes[index].setEnabled(false);});
    terrain.reset();placeSpawns();pickups.reset();pickupView.update([]); visibility.reset(); refreshTerrain();
    for (const fragment of fragments) fragment.mesh.dispose();
    fragments.length = 0;
  }
  document.querySelector('#reset')!.addEventListener('click', () => { reset(); canvas.focus(); });
  window.addEventListener('keydown', event => {
    if (movementKeys.includes(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.code === 'KeyR' && !event.repeat) reset();
    if(event.code==='KeyQ' && !event.repeat) skillRequested=true;
    if(event.code==='KeyF' && !event.repeat && !roundOver && !skills.locked && !arsenal.movementLocked) arsenal.reload();
    if (event.code === 'Digit1') selectWeapon('pistol');
    if (event.code === 'Digit2') selectWeapon('sword');
    if (event.code === 'Digit5') selectWeapon('shotgun');
    if (event.code === 'Digit4') selectWeapon('grenade');
    if (event.code === 'Digit3') selectWeapon('rocket');
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); shotRequested = false; skillRequested=false; });
  document.addEventListener('visibilitychange', () => { keys.clear(); shotRequested = false; skillRequested=false; });
  canvas.addEventListener('pointermove', event => {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  });
  canvas.addEventListener('pointerleave', () => { shotRequested=false;mouse = null; reticle.setEnabled(false); });
  canvas.addEventListener('pointerdown', event => {
    canvas.focus();
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    shotRequested = true;
  });


  window.addEventListener('pointercancel',()=>shotRequested=false);
  let fpsTime = 0;
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    if(roundOver) {scene.render();return;}
    updateVitals(playerVitals,dt);updateVitals(enemyVitals,dt);
    arsenal.update(dt);
    skills.update(dt);
    chargeMarker.setEnabled(skills.phase==='windup');
    if(skills.phase==='windup') {chargeMarker.position.set(pawn.position.x+Math.sin(skills.yaw)*2,.06,pawn.position.z+Math.cos(skills.yaw)*2);chargeMarker.rotation.y=skills.yaw;}
    let x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    let z = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    verticalVelocity -= 20 * dt;
    pawn.position.y += verticalVelocity * dt;
    if (pawn.position.y < 0) { pawn.position.y = 0; verticalVelocity = 0; }
    if (mouse) {
      const ray = scene.createPickingRay(mouse.x, mouse.y, Matrix.Identity(), camera);
      const t = -ray.origin.y / ray.direction.y;
      if (t > 0) {
        const target = ray.origin.add(ray.direction.scale(t));
        if (!arsenal.movementLocked && !skills.locked) pawn.rotation.y = Math.atan2(target.x - pawn.position.x, target.z - pawn.position.z);
        reticle.position.set(target.x, 0.025, target.z);
        reticle.setEnabled(Math.abs(target.x) < 15 && Math.abs(target.z) < 15);
      }
    }
    updateFragments(dt);
    if(skillRequested) {
      if(!arsenal.movementLocked && playerVitals.hp>0) skills.activate(arsenal.selected,pawn.rotation.y,reticle.isEnabled()?reticle.position:{x:pawn.position.x+Math.sin(pawn.rotation.y)*8,z:pawn.position.z+Math.cos(pawn.rotation.y)*8});
      skillRequested=false;
    }
    if (shotRequested) {
      shotRequested=false;
      if(!skills.locked && playerVitals.hp>0 && playerVitals.stun<=0) arsenal.fire(pawn.position, pawn.rotation.y, reticle.isEnabled() ? reticle.position : undefined);
    }
    // Process attacks first so even the starting frame of a swing stays planted.
    const surface = terrain.kindAt(pawn.position);
    velocity = movementVelocity(velocity, { x, z }, arsenal.selected, surface, dt, arsenal.movementLocked || skills.locked || playerVitals.stun>0 || playerVitals.hp<=0,skills.speedMultiplier);
    const next = movePlayer(pawn.position, velocity.x * dt, velocity.z * dt, terrain.movementObstacles);
    if (Math.abs(next.x-pawn.position.x) < 0.000001) velocity.x = 0;
    if (Math.abs(next.z-pawn.position.z) < 0.000001) velocity.z = 0;
    pawn.position.x = next.x; pawn.position.z = next.z;
    hazards.update(dt);
    pickups.update(dt,[{position:pawn.position,vitals:playerVitals,refill:()=>arsenal.refill()},{position:enemy.target.position,vitals:enemyVitals,refill:()=>{}}]);
    const pickupSight=createSight(pawn.position,blocks);pickupView.update(pickups.items.filter(p=>pickupSight.visible(p,.45)));
    const flash=conditionFlash(playerCondition);
    body.material=head.material=flash==='red' ? burnRed : flash==='white' ? hitWhite : teal;
    if(enemyVitals.stun>0) enemyCondition.flash=Math.max(enemyCondition.flash,.1);
    enemy.setHazardFlash(conditionFlash(enemyCondition),enemyCondition.burning);
    const opponent=enemy.update(dt,pawn.position,enemyVitals.stun>0,enemyVitals.hp<=0);
    const sound=footsteps.update(dt,pawn.position,opponent.position,opponent.moved,opponent.visible);
    if(sound) soundHints.emit(sound,pawn.position);
    soundHints.update(dt);
    if (visibility.update(pawn.position, dt)) {
      refreshTerrain();
      blockMeshes.forEach((mesh,i)=>mesh.setEnabled(visibility.memory.knownBlocks[i] === false));
    }
    if(playerVitals.hp<=0 || enemyVitals.hp<=0) {
      pawn.setEnabled(playerVitals.hp>0);
      roundOver=true;arsenal.reset();skills.reset();chargeMarker.setEnabled(false);keys.clear();soundHints.reset();footsteps.reset();
      resultPanel.hidden=false;resultPanel.textContent=playerVitals.hp<=0 && enemyVitals.hp<=0 ? 'Draw · Press R to restart' : enemyVitals.hp<=0 ? 'Victory · Press R to restart' : 'Defeat · Press R to restart';
    }

    renderHud({hp:playerVitals.hp,rage:playerVitals.rage,weapon:arsenal.selected,ammo:Number.isFinite(arsenal.ammo.ammo)?arsenal.ammo.ammo:null,capacity:Number.isFinite(arsenal.capacity)?arsenal.capacity:null,reserve:Number.isFinite(arsenal.ammo.reserve)?arsenal.ammo.reserve:null,reload:arsenal.ammo.remaining,cooldown:arsenal.cooldown,boost:arsenal.boostRemaining,speedBoost:skills.speedRemaining,burning:playerCondition.burning,flammable:playerCondition.flammable},opponent.visible?enemyVitals.hp:enemyVitals.hp<=0?0:null);

    scene.render();
    fpsTime += dt;
    if (fpsTime > 0.5) {
      document.querySelector('#fps')!.textContent = `${Math.round(engine.getFps())} FPS`;
      fpsTime = 0;
    }
  });
  // Read-only state for repeatable browser smoke checks.
  Object.defineProperty(window, '__arena', { get: () => ({ x: pawn.position.x, y: pawn.position.y, z: pawn.position.z, yaw: pawn.rotation.y, ready: scene.isReady() }) });
} catch (error) {
  showError(error instanceof Error ? error.message : String(error));
}


import {combatSoundArea} from './combatCues';
