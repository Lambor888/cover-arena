import {movePlayer,type Point,type Obstacle} from './world';
import {movementVelocity,type TerrainKind} from './terrain';
import type {PlayerView} from './protocol';
import type {WeaponKind} from './resources';

type Frame={end:number;dt:number;move:Point;weapon:WeaponKind;locked:boolean};
// Presentation only. Never sends positions, damage, pickups or terrain changes.
// Replay a bounded recent input window from each authoritative snapshot, then
// smooth small corrections. This is latency estimation, not exact tick replay.
export class LocalMotion {
 position:Point={x:0,z:0};
 private velocity:Point={x:0,z:0};
 private offset:Point={x:0,z:0};
 private frames:Frame[]=[];
 private received=-Infinity;
 private state!:PlayerView;
 private active=false;
 constructor(private obstacles:Obstacle[],private kindAt:(p:Point)=>TerrainKind){}
 receive(state:PlayerView,playing:boolean,now:number,rttMs:number,reset=false,stateAgeMs?:number){
  const before=this.display();
  this.state=state;this.active=playing&&state.hp>0;this.received=now;
  this.position={x:state.x,z:state.z};
  this.velocity={x:state.vx??0,z:state.vz??0};
  const locked=!this.active||state.stun>0||state.movementLocked||state.skillPhase!=='idle';
  if(reset||locked){this.frames=[];this.offset={x:0,z:0};return;}
  const since=now-Math.min(1.2,Math.max(0,(stateAgeMs??rttMs/2)/1000));
  for(const f of this.frames){const dt=Math.min(f.dt,Math.max(0,f.end-since));if(dt>0)this.integrate(f,dt);}
  const dx=before.x-this.position.x,dz=before.z-this.position.z;
  this.offset=Math.hypot(dx,dz)>2?{x:0,z:0}:{x:dx,z:dz};
 }
 private integrate(f:Frame,dt:number){
  const locked=!this.active||this.state.stun>0||!!this.state.movementLocked||this.state.skillPhase!=='idle'||f.locked;
  this.velocity=movementVelocity(this.velocity,f.move,f.weapon,this.kindAt(this.position),dt,locked,this.state.speedBoost>0?1.4:1);
  this.position=movePlayer(this.position,this.velocity.x*dt,this.velocity.z*dt,this.obstacles);
 }
 update(now:number,dt:number,move:Point,weapon:WeaponKind,locked=false){
  dt=Math.max(0,Math.min(dt,.05));
  const f:Frame={end:now,dt,move:{...move},weapon,locked};
  this.frames.push(f);this.frames=this.frames.filter(f=>now-f.end<1.5);
  // Never keep walking indefinitely through a lost or stalled connection.
  if(now-this.received<1.2)this.integrate(f,dt);
  else this.velocity={x:0,z:0};
  const fade=Math.exp(-dt/0.075);this.offset.x*=fade;this.offset.z*=fade;
  return this.display();
 }
 display():Point{return movePlayer(this.position,this.offset.x,this.offset.z,this.obstacles);}
}

export type Pose={x:number;y:number;z:number;yaw:number};
export class PoseSmoother {
 private from:Pose|null=null;private to:Pose|null=null;private start=0;private duration=0;
 receive(p:Pose|null,now:number,duration:number,reset=false){
  if(!p){this.from=this.to=null;return;}
  const current=this.sample(now);
  this.from=reset||!current?{...p}:current;this.to={...p};this.start=now;
  this.duration=reset?0:Math.max(.016,Math.min(.16,duration));
 }
 sample(now:number):Pose|null{
  if(!this.to||!this.from)return null;
  const t=this.duration?Math.max(0,Math.min(1,(now-this.start)/this.duration)):1;
  const angle=Math.atan2(Math.sin(this.to.yaw-this.from.yaw),Math.cos(this.to.yaw-this.from.yaw));
  return {x:this.from.x+(this.to.x-this.from.x)*t,y:this.from.y+(this.to.y-this.from.y)*t,z:this.from.z+(this.to.z-this.from.z)*t,yaw:this.from.yaw+angle*t};
 }
}
