import {saveMesh,loadMesh} from './meshState';
import {shotgunCone} from './shotgun';
import {createAmmo,WEAPON_RULES} from './resources';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { createPistol } from './pistol';
import { firstWallImpact, firstArcImpact } from './ballistics';
import { blastTargets, swordTargets, SWORD_RANGE, SWORD_HALF_ANGLE, SWORD_SWING_DURATION, rocketDistance, grenadePoint, GRENADE_INTERVAL, ROCKET_LIFETIME, ROCKET_INTERVAL, BLAST_RADIUS } from './combat';
import type { Point, Obstacle } from './world';
import { firstActorImpact, swordHitsActor, type CombatTarget } from './actorCombat';

export type Weapon = 'pistol' | 'sword' | 'rocket' | 'grenade' | 'shotgun';
type Materials = { bullet: Material; steel: Material; fire: Material; slash: Material; blast: Material };
export function createArsenal(scene: Scene, materials: Materials, blocks: Obstacle[], hitBlock: (index: number, explosive?: boolean, melee?: boolean) => void, targets: CombatTarget[] = [], onExplosion?: (p: Point, weapon:'rocket'|'grenade',radius?:number)=>void, onFuel?: (p:Point)=>void, onCone?: (p:Point,yaw:number,ultimate?:boolean)=>void, onAttack?: (p:Point)=>void) {
  const ammo=createAmmo();
  const pistol = createPistol(scene, materials.bullet, blocks, hitBlock, targets);
  let volley:{position:Point;aim:Point;yaw:number;remaining:number;timer:number}|null=null;
  function launchVolley(position:Point,yaw:number,aim:Point){const dx=aim.x-position.x,dz=aim.z-position.z,d=Math.hypot(dx,dz),center=d>1e-6?Math.atan2(dx,dz):yaw,spread=Math.asin(Math.min(1,2/Math.max(d,2)));for(const offset of [-spread,0,spread])launchRocket(position,center+offset);}
  let selected: Weapon = 'pistol';
  let shotgunCooldown=0,pistolBoost=0;
  let swordCooldown = 0, rocketCooldown = 0, grenadeCooldown = 0;
  const grenades: {mesh: Mesh; start: Point; end: Point; age: number; duration: number; fuel:boolean;large:boolean}[] = [];
  let swingRemaining = 0;
  const rockets: { mesh: Mesh; dx: number; dz: number; age: number }[] = [];
  const effects: { mesh: Mesh; age: number; duration: number; kind: 'fan' | 'blade' | 'blast'; yaw: number; radius: number }[] = [];
  function effect(mesh: Mesh, duration: number, kind: 'fan' | 'blade' | 'blast', yaw = 0, radius = BLAST_RADIUS) {
    mesh.isPickable = false;
    effects.push({ mesh, age: 0, duration, kind, yaw, radius });
  }
  function explode(position: Point, weapon:'rocket'|'grenade'='rocket',radius=BLAST_RADIUS) {
    if (onExplosion) { onExplosion(position,weapon,radius); return; }
    for (const target of targets) if (Math.hypot(target.position.x-position.x,target.position.z-position.z)<=radius+target.radius) target.hit(weapon);
    // Select all targets before mutating terrain; one blast applies once per block.
    for (const index of blastTargets(position, blocks,radius)) hitBlock(index, true);
    showExplosion(position,radius);
  }
  function showExplosion(position: Point, radius=BLAST_RADIUS) {
    const ball = MeshBuilder.CreateSphere('rocket-explosion', { diameter: 2, segments: 16 }, scene);
    ball.position.set(position.x, 0.4, position.z);
    ball.material = materials.blast;
    effect(ball, 0.5, 'blast', 0, radius);
    const ring = MeshBuilder.CreateTorus('blast-radius', { diameter: 2, thickness: 0.045, tessellation: 64 }, scene);
    ring.position.set(position.x, 0.05, position.z);
    ring.material = materials.fire;
    effect(ring, 0.5, 'blast', 0, radius);
  }
  function slash(position: Point, yaw: number) {
    for (const target of targets) if (swordHitsActor(position,yaw,target,blocks)) target.hit('sword');
    for (const index of swordTargets(position, yaw, blocks)) hitBlock(index, false, true);
    const positions = [0, 0, 0], normals = [0, 1, 0], indices: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const angle = -SWORD_HALF_ANGLE + i / 32 * SWORD_HALF_ANGLE * 2;
      positions.push(Math.sin(angle) * SWORD_RANGE, 0, Math.cos(angle) * SWORD_RANGE);
      normals.push(0,1,0);
      if (i > 0) indices.push(0, i, i + 1);
    }
    const fan = new Mesh('sword-sweep-area', scene);
    const data = new VertexData(); data.positions = positions; data.normals = normals; data.indices = indices; data.applyToMesh(fan);
    fan.position.set(position.x, 0.07, position.z); fan.rotation.y = yaw; fan.material = materials.slash;
    effect(fan, SWORD_SWING_DURATION, 'fan');
    const blade = MeshBuilder.CreateBox('sword-sweep-blade', { width: 0.1, height: 0.08, depth: SWORD_RANGE }, scene);
    // Put the blade's pivot at the player by shifting its vertices along Z.
    blade.bakeTransformIntoVertices(Matrix.Translation(0, 0, SWORD_RANGE / 2));
    blade.position.set(position.x, 0.75, position.z); blade.material = materials.bullet;
    blade.rotation.y = yaw - SWORD_HALF_ANGLE;
    effect(blade, SWORD_SWING_DURATION, 'blade', yaw);
  }
  function launchGrenade(position:Point,yaw:number,aim:Point|undefined,fuel:boolean,large=false) {
        const end=aim ? {x:Math.max(-14.9,Math.min(14.9,aim.x)),z:Math.max(-14.9,Math.min(14.9,aim.z))} : {x:position.x+Math.sin(yaw)*8,z:position.z+Math.cos(yaw)*8};
        const mesh=MeshBuilder.CreateSphere(large?'large-grenade-shell':'grenade-shell',{diameter:large?.75:.36,segments:10},scene);
        mesh.material=materials.fire; mesh.isPickable=false; mesh.position.set(position.x,0.9,position.z);
        grenades.push({mesh,start:{x:position.x,z:position.z},end,age:0,fuel,large,duration:Math.max(1,Math.min(2.5,Math.hypot(end.x-position.x,end.z-position.z)/10))});
  }

  function launchRocket(position:Point,yaw:number) {
    const mesh=MeshBuilder.CreateSphere('rocket-shell',{diameter:.32,segments:12},scene);mesh.scaling.z=3;mesh.rotation.y=yaw;mesh.position.set(position.x,.9,position.z);mesh.material=materials.steel;mesh.isPickable=false;
    const exhaust=MeshBuilder.CreateSphere('rocket-exhaust',{diameter:.22,segments:8},scene);exhaust.parent=mesh;exhaust.position.z=-.18;exhaust.material=materials.fire;exhaust.isPickable=false;rockets.push({mesh,dx:Math.sin(yaw),dz:Math.cos(yaw),age:0});
  }
  function shootCone(position:Point,yaw:number,ultimate=false) {
    const cone=shotgunCone(position,yaw,blocks,targets,ultimate);onCone?.(position,yaw,ultimate);
    for(const target of cone.hitActors){target.hit('shotgun');target.knockback?.(position,yaw);}
    if(!ultimate)for(const index of cone.hitBlocks)for(let hit=0;hit<3;hit++)hitBlock(index);
    const fan=new Mesh('shotgun-cone',scene),data=new VertexData();data.positions=[0,0,0,...cone.ends.flatMap(p=>[p.x-position.x,0,p.z-position.z])];data.normals=Array.from({length:cone.ends.length+1},()=>[0,1,0]).flat();data.indices=[];for(let i=1;i<cone.ends.length;i++)data.indices.push(0,i,i+1);data.applyToMesh(fan);fan.position.set(position.x,.12,position.z);fan.material=materials.blast;effect(fan,ultimate?.4:.22,'fan');
  }
  return {
    save(){return {ammo:ammo.save(),pistol:pistol.save(),selected,shotgunCooldown,pistolBoost,swordCooldown,rocketCooldown,grenadeCooldown,swingRemaining,volley:volley?{...volley,position:{x:volley.position.x,z:volley.position.z}}:null,grenades:grenades.map(({mesh,...g})=>({...g,mesh:saveMesh(mesh)})),rockets:rockets.map(({mesh,...r})=>({...r,mesh:saveMesh(mesh)})),effects:effects.map(({mesh,...e})=>({...e,mesh:saveMesh(mesh)}))};},
    load(data:any,owner:Point){this.reset();ammo.load(data.ammo);pistol.load(data.pistol);selected=data.selected;shotgunCooldown=data.shotgunCooldown;pistolBoost=data.pistolBoost;swordCooldown=data.swordCooldown;rocketCooldown=data.rocketCooldown;grenadeCooldown=data.grenadeCooldown;swingRemaining=data.swingRemaining;volley=data.volley?{...data.volley,position:owner}:null;for(const g of data.grenades)grenades.push({...g,mesh:loadMesh(g.mesh,scene,materials.fire)});for(const r of data.rockets)rockets.push({...r,mesh:loadMesh(r.mesh,scene,materials.steel)});for(const e of data.effects)effects.push({...e,mesh:loadMesh(e.mesh,scene,materials.blast)});},
    cancelVolley(){volley=null;},
    get boostRemaining(){return pistolBoost;},
    ultimate(weapon:Weapon,position:Point,yaw:number,aim:Point) {
      if(weapon==='pistol'){pistolBoost=6;return;}
      onAttack?.(position);
      if(weapon==='rocket'){launchVolley(position,yaw,aim);volley={position,aim:{x:aim.x,z:aim.z},yaw,remaining:2,timer:.35};}
      if(weapon==='grenade')launchGrenade(position,yaw,aim,false,true);
      if(weapon==='shotgun')shootCone(position,yaw,true);
    },
    fuelGrenade(position:Point,yaw:number,aim:Point) {launchGrenade(position,yaw,aim,true);},
    get ammo(){return ammo.states[selected];},
    get capacity(){return WEAPON_RULES[selected].capacity;},
    reload(){ammo.reload(selected);},
    refill(){ammo.reset();},
    showExplosion,
    get selected() { return selected; },
    get movementLocked() { return swingRemaining > 0; },
    get cooldown() { return selected==='shotgun'?shotgunCooldown:selected === 'pistol' ? pistol.cooldown : selected === 'sword' ? swordCooldown : selected === 'rocket' ? rocketCooldown : grenadeCooldown; },
    select(weapon: Weapon) { selected = weapon; },
    fire(position: Point, yaw: number, aim?: Point) {
      if (swingRemaining > 0) return;
      if(selected==='shotgun') {
        if(shotgunCooldown>0||!ammo.consume('shotgun'))return;
        shotgunCooldown=WEAPON_RULES.shotgun.interval;onAttack?.(position);
        shootCone(position,yaw);return;
      }
      if (selected === 'pistol') { if(pistol.cooldown<=0 && ammo.consume('pistol')) {pistol.fire(position, yaw,pistolBoost>0);onAttack?.(position);} return; }
      if (selected === 'sword') {
        if (swordCooldown > 0) return;
        swordCooldown = WEAPON_RULES.sword.interval; swingRemaining = SWORD_SWING_DURATION; slash(position, yaw); return;
      }
      if (selected === 'grenade') {
        if (grenadeCooldown > 0 || !ammo.consume('grenade')) return;
        grenadeCooldown=GRENADE_INTERVAL;onAttack?.(position);
        launchGrenade(position,yaw,aim,false);
        return;
      }
      if (rocketCooldown > 0 || !ammo.consume('rocket')) return;
      rocketCooldown = ROCKET_INTERVAL;onAttack?.(position);
      launchRocket(position,yaw);
    },
    update(dt:number) {
      ammo.update(dt);pistolBoost=Math.max(0,pistolBoost-dt);shotgunCooldown=Math.max(0,shotgunCooldown-dt);
      grenadeCooldown=Math.max(0,grenadeCooldown-dt);swordCooldown=Math.max(0,swordCooldown-dt);rocketCooldown=Math.max(0,rocketCooldown-dt);swingRemaining=Math.max(0,swingRemaining-dt);pistol.update(dt);
      for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.age+=dt;if(e.age>=e.duration){e.mesh.dispose();effects.splice(i,1);continue;}const progress=e.age/e.duration;if(e.kind==='blade')e.mesh.rotation.y=e.yaw-SWORD_HALF_ANGLE+progress*SWORD_HALF_ANGLE*2;if(e.kind==='blast')e.mesh.scaling.setAll(.1+e.radius*Math.sin(progress*Math.PI));}
      for(let i=grenades.length-1;i>=0;i--){const g=grenades[i];let removed=false;const steps=Math.max(1,Math.ceil(dt/.01));for(let step=0;step<steps;step++){
        const from=grenadePoint(g.start,g.end,g.age/g.duration);g.age=Math.min(g.duration,g.age+dt/steps);const to=grenadePoint(g.start,g.end,g.age/g.duration),hit=firstArcImpact(from,to,blocks);g.mesh.position.set(to.x,to.y,to.z);
        if(hit||g.age>=g.duration){const point=hit?{x:from.x+(to.x-from.x)*hit.fraction,z:from.z+(to.z-from.z)*hit.fraction}:to;if(!hit||!blocks[hit.index].absorbsRocket){if(g.fuel)onFuel?.(point);else explode(point,'grenade',g.large?6:BLAST_RADIUS);}g.mesh.dispose();grenades.splice(i,1);removed=true;break;}
      }if(!removed)g.mesh.rotation.x+=dt*8;}
      for(let i=rockets.length-1;i>=0;i--){const r=rockets[i],time=Math.min(dt,ROCKET_LIFETIME-r.age),start=r.mesh.position,d=rocketDistance(r.age+time)-rocketDistance(r.age),end={x:start.x+r.dx*d,z:start.z+r.dz*d};const hit=firstWallImpact(start,end,blocks),actor=firstActorImpact(start,end,targets,hit?.fraction);r.age+=dt;
        if(actor||hit||r.age>=ROCKET_LIFETIME){const f=actor?.fraction??hit?.fraction??1,point={x:start.x+(end.x-start.x)*f,z:start.z+(end.z-start.z)*f};if(!actor&&hit&&blocks[hit.index].absorbsRocket){const puff=MeshBuilder.CreateSphere('rocket-absorbed',{diameter:.4,segments:8},scene);puff.position.set(point.x,.9,point.z);puff.material=materials.fire;effect(puff,.15,'fan');}else explode(point);r.mesh.dispose();rockets.splice(i,1);}else r.mesh.position.set(end.x,.9,end.z);
      }
      if(volley){volley.timer-=dt;while(volley&&volley.timer<=1e-8){onAttack?.(volley.position);launchVolley(volley.position,volley.yaw,volley.aim);volley.remaining--;volley.timer+=.35;if(!volley.remaining)volley=null;}}
    },
    reset(){volley=null;ammo.reset();pistolBoost=0;shotgunCooldown=0;pistol.reset();grenadeCooldown=swordCooldown=rocketCooldown=swingRemaining=0;for(const g of grenades)g.mesh.dispose();grenades.length=0;for(const r of rockets)r.mesh.dispose();rockets.length=0;for(const e of effects)e.mesh.dispose();effects.length=0;},
  };
}
