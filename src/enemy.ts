import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { createVisibilityMaterials } from './visibility';
import { createSight } from './fog';
import { movePlayer, PLAYER_RADIUS, PLAYER_SCALE, type Point, type Obstacle } from './world';
import { movementVelocity, type TerrainKind } from './terrain';
import type { CombatTarget } from './actorCombat';

export const ENEMY_SPAWN = {x:2,z:-8};
export function createRoamer(random = Math.random) {
  const position = {...ENEMY_SPAWN};
  let heading=0, remaining=1.2, paused=true, velocity={x:0,z:0};
  return { position,
    reset() { Object.assign(position,ENEMY_SPAWN); remaining=1.2; paused=true; velocity={x:0,z:0}; },
    update(dt: number, blocks: Obstacle[], kindAt: (p: Point)=>TerrainKind) {
      remaining-=dt;
      if (remaining<=0) {
        paused=random()<0.18;
        heading=random()*Math.PI*2;
        remaining=paused ? 0.4+random()*0.6 : 1+random()*2;
      }
      velocity=movementVelocity(velocity,paused ? {x:0,z:0} : {x:Math.sin(heading),z:Math.cos(heading)},'pistol',kindAt(position),dt,false);
      const old={...position};
      const next=movePlayer(position,velocity.x*0.48*dt,velocity.z*0.48*dt,blocks);
      Object.assign(position,next);
      const moved=Math.hypot(next.x-old.x,next.z-old.z);
      if (!paused && moved<0.1*dt) { remaining=0; velocity={x:0,z:0}; }
      return moved;
    },
  };
}

export function createEnemy(scene: Scene, visibility: ReturnType<typeof createVisibilityMaterials>, blocks: Obstacle[], kindAt: (p: Point)=>TerrainKind, movementObstacles=blocks) {
  const roamer=createRoamer();
  const root=new TransformNode('enemy-player',scene);
  root.scaling.setAll(PLAYER_SCALE);
  const red=visibility.make('enemy-red','#f08772');
  const flash=visibility.make('enemy-hit-flash','#ffffff',-1,false,true);
  const burnRed=visibility.make('enemy-burning','#ff2020',-1,false,true);
  const dark=visibility.make('enemy-visor','#612e35');
  const body=MeshBuilder.CreateCylinder('enemy-body',{height:0.9,diameterTop:0.57,diameterBottom:0.78,tessellation:12},scene);
  body.parent=root; body.position.y=0.65;
  const head=MeshBuilder.CreateSphere('enemy-head',{diameter:0.62,segments:8},scene);
  head.parent=root; head.position.y=1.27;
  const visor=MeshBuilder.CreateBox('enemy-facing',{width:0.38,height:0.16,depth:0.17},scene);
  visor.parent=root; visor.position.set(0,1.29,0.27); visor.material=dark;
  let flashTime=0, hazardFlash:'red'|'white'|null=null, burning=false;
  let hits=0;
  const target: CombatTarget={position:roamer.position,radius:PLAYER_RADIUS,hit() { flashTime=0.4; hits++; }};
  function reset() { roamer.reset(); root.position.set(roamer.position.x,0,roamer.position.z); flashTime=0;hazardFlash=null;burning=false;hits=0;root.setEnabled(false); }
  reset();
  return { target, reset, setHazardFlash(value:'red'|'white'|null,isBurning=false) {hazardFlash=value;burning=isBurning;}, get hits() {return hits;},
    update(dt: number, observer: Point, stopped=false,dead=false) {
      const previous={...roamer.position};
      const moved=stopped || dead ? 0 : roamer.update(dt,movementObstacles,kindAt);
      root.position.set(roamer.position.x,0,roamer.position.z);
      if (moved>0.0001) root.rotation.y=Math.atan2(roamer.position.x-previous.x,roamer.position.z-previous.z);
      flashTime=Math.max(0,flashTime-dt);
      head.material=body.material=hazardFlash==='red' ? burnRed : hazardFlash==='white' || (!burning && flashTime>0 && Math.floor(flashTime/0.055)%2===1) ? flash : red;
      const sight=createSight(observer,blocks);
      const visible=!dead && [-0.2,0,0.2].some(x=>sight.visible({x:roamer.position.x+x,z:roamer.position.z},1.0));
      root.setEnabled(visible);
      return {position:roamer.position,visible,moved};
    },
  };
}
