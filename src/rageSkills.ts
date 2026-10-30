import {WEAPON_RULES,type WeaponKind} from './resources';
export const SKILL_NAMES:Record<WeaponKind,string>={pistol:'Rapid Fire',sword:'Dash Strike',rocket:'Triple Barrage',grenade:'Mega Bomb',shotgun:'Breach Blast'};
import {canStand,PLAYER_RADIUS,type Point,type Obstacle} from './world';
import type {BlockState} from './blockState';
import type {Vitals} from './vitals';
import {dealDamage} from './vitals';
export function createRageSkills(player:Vitals,position:Point,enemy:Vitals,enemyPosition:Point,blocks:BlockState[],movement:Obstacle[],breakWood:(i:number)=>void,throwBomb:(p:Point,yaw:number,aim:Point)=>void,cast?:(weapon:WeaponKind,p:Point,yaw:number,aim:Point)=>void,onStep?:()=>void) {
  let phase:'idle'|'windup'|'dash'|'recover'='idle',time=0,distance=0,yaw=0,speedTime=0,targetDistance=0,hitEnemy=false;
  const recover=()=>{phase='recover';time=.15;speedTime=4;};
  return {
    save(){return {phase,time,distance,yaw,speedTime,targetDistance,hitEnemy};},
    load(data:any){({phase,time,distance,yaw,speedTime,targetDistance,hitEnemy}=data);},
    get speedRemaining(){return speedTime;},get speedMultiplier(){return speedTime>0?1.4:1;},
    get locked(){return phase!=='idle';},get phase(){return phase;},get yaw(){return yaw;},
    activate(weapon:string,angle:number,aim:Point) {
      if(player.hp<=0 || player.stun>0 || player.rage<100 || phase!=='idle' || !Object.hasOwn(WEAPON_RULES,weapon) || (weapon!=='sword'&&weapon!=='grenade'&&!cast)) return false;
      player.rage-=100;yaw=angle;
      if(weapon==='grenade') {throwBomb(position,yaw,{x:aim.x,z:aim.z});phase='recover';time=.15;}
      else if(weapon==='sword') {phase='windup';time=.35;distance=0;hitEnemy=false;const x=Math.max(-14.65,Math.min(14.65,aim.x)),z=Math.max(-14.65,Math.min(14.65,aim.z));yaw=Math.atan2(x-position.x,z-position.z);targetDistance=Math.hypot(x-position.x,z-position.z);}
      else {cast!(weapon as WeaponKind,position,yaw,{x:aim.x,z:aim.z});phase='recover';time=.15;}
      return true;
    },
    update(dt:number) {
      speedTime=Math.max(0,speedTime-dt);
      if(player.hp<=0 || player.stun>0) {phase='idle';if(player.hp<=0)speedTime=0;return;}
      if(phase==='idle') return;
      if(phase==='windup'||phase==='recover') {time-=dt;if(time<=0)phase=phase==='windup'?'dash':'idle';return;}
      let travel=Math.min(16*dt,targetDistance-distance);
      while(travel>1e-6 && phase==='dash') {
        const step=Math.min(.04,travel),next={x:position.x+Math.sin(yaw)*step,z:position.z+Math.cos(yaw)*step};
        // Only collision proxies (marble rubble) and map edges stop the dash.
        if(!canStand(next,movement.filter(b=>!blocks.includes(b as BlockState)))) {recover();break;}
        blocks.forEach((b,i)=>{if(!b.destroyed && Math.hypot(Math.max(0,Math.abs(next.x-b.x)-b.width/2),Math.max(0,Math.abs(next.z-b.z)-b.depth/2))<PLAYER_RADIUS) breakWood(i);});
        position.x=next.x;position.z=next.z;distance+=step;travel-=step;onStep?.();
        if(!hitEnemy && enemy.hp>0 && Math.hypot(next.x-enemyPosition.x,next.z-enemyPosition.z)<=2*PLAYER_RADIUS) {
          dealDamage(enemy,15,player);enemy.stun=.6;hitEnemy=true;
        }
      }
      if(distance>=targetDistance-1e-6) {recover();}
    },
    reset(){phase='idle';time=0;distance=0;speedTime=0;},
  };
}
