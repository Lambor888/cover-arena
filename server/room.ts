import {randomSpawns} from '../src/spawns';
import {createPickups} from '../src/pickups';
import {createCombatCues} from '../src/combatCues';
import {pushFrom} from '../src/shotgun';
import {freshMapSeed} from '../src/map';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {createArsenal} from '../src/arsenal';
import {createTerrain,movementVelocity} from '../src/terrain';
import {createCondition,createHazards} from '../src/hazards';
import {createVitals,dealDamage,updateVitals,resetVitals} from '../src/vitals';
import {createRageSkills} from '../src/rageSkills';
import {WEAPON_RULES,type WeaponKind} from '../src/resources';
import {movePlayer,PLAYER_RADIUS} from '../src/world';
import {createSight} from '../src/fog';
import {createFootsteps} from '../src/hearing';
import type {InputMessage,PlayerView,Snapshot} from '../src/protocol';
import {generateMap,SPAWNS} from './map';

export function validInput(v:unknown):v is InputMessage {
  if(!v || typeof v!=='object')return false;
  const i=v as InputMessage;
  return i.type==='input' && Number.isSafeInteger(i.seq) && i.seq>=0 &&
    [i.moveX,i.moveZ,i.aimX,i.aimZ].every(n=>typeof n==='number'&&Number.isFinite(n)) &&
    Math.abs(i.moveX)<=1 && Math.abs(i.moveZ)<=1 && Math.abs(i.aimX)<=15 && Math.abs(i.aimZ)<=15 &&
    Object.hasOwn(WEAPON_RULES,i.weapon) && [i.fire,i.skill,i.reload].every(b=>typeof b==='boolean');
}
const idle=():InputMessage=>({type:'input',seq:0,moveX:0,moveZ:0,aimX:0,aimZ:0,weapon:'pistol',fire:false,skill:false,reload:false});
export class Room {
  inputTimeoutTicks=15;
  engine=new NullEngine(); scene=new Scene(this.engine); material=new StandardMaterial('headless',this.scene);
  blocks;terrain;hazards;pickups;players;arsenals;skills;private combatCues=createCombatCues();
  scores=[0,0];seriesComplete=false;seriesWinner:number|null=null;private renderId=0;
  phase:Snapshot['phase']='waiting';countdown=3;winner:number|null=null;reason='';tick=0;round=1;
  connected=[false,false];ready=[false,false];private activeOwner:number|null=null;
  private burnOwner=new Map<ReturnType<typeof createCondition>,number>();
  private sounds=[createFootsteps(),createFootsteps()];private cues:Snapshot['sounds'][]=[[],[]];private cueId=0;
  constructor(public name:string,public seed:number, restored?:{blocks:ReturnType<typeof generateMap>;players:{position:{x:number;z:number}}[]}) {
    this.blocks=restored?restored.blocks.map(b=>({...b})):generateMap(seed);this.terrain=createTerrain(this.blocks);
    this.pickups=createPickups(this.terrain);
    this.players=(restored?restored.players.map(p=>p.position):randomSpawns(this.blocks)).map(p=>{const position={...p};return {position,velocity:{x:0,z:0},yaw:p.z<0?0:Math.PI,vitals:createVitals(),condition:createCondition(position),input:idle(),lastSeq:-1,lastInput:0};});
    this.hazards=createHazards(this.blocks,this.terrain,this.players.map(p=>p.condition),()=>{},(p,r)=>{this.combatCues.emit('explosion',p,this.activeOwner,this.tick,this.players.map(p=>p.position),this.blocks);this.arsenals[this.activeOwner??0].showExplosion(p,r);},(condition,amount)=>{
      const target=this.players.find(p=>p.condition===condition)!;
      if(this.activeOwner!==null) this.burnOwner.set(condition,this.activeOwner);
      const owner=this.activeOwner??this.burnOwner.get(condition);
      dealDamage(target.vitals,amount,owner===undefined?undefined:this.players[owner].vitals);
    });
    this.arsenals=this.players.map((p,slot)=>createArsenal(this.scene,{bullet:this.material,steel:this.material,fire:this.material,slash:this.material,blast:this.material},this.blocks,this.hazards.attackBlock,[{
      position:this.players[1-slot].position,radius:PLAYER_RADIUS,knockback:(origin,yaw)=>{const other=this.players[1-slot];if(other.vitals.hp<=0)return;pushFrom(other.position,origin,yaw,this.terrain.movementObstacles);other.velocity={x:0,z:0};other.vitals.stun=Math.max(other.vitals.stun,.2);this.skills[1-slot].reset();},hit:weapon=>{
        const other=this.players[1-slot];if(other.vitals.hp<=0)return;
        dealDamage(other.vitals,WEAPON_RULES[weapon].damage,p.vitals);other.condition.flash=.4;
      },
    }],(point,weapon,radius=3)=>this.hazards.explode(point,radius,false,WEAPON_RULES[weapon].damage),point=>this.hazards.spreadFuel(point),(point,yaw,ultimate)=>this.hazards.igniteCone(point,yaw,ultimate),point=>this.combatCues.emit('shot',point,slot,this.tick,this.players.map(p=>p.position),this.blocks)));
    this.skills=this.players.map((p,slot)=>createRageSkills(p.vitals,p.position,this.players[1-slot].vitals,this.players[1-slot].position,this.blocks,this.terrain.movementObstacles,i=>{
      this.hazards.breakForDash(i);
    },(point,yaw,aim)=>this.arsenals[slot].ultimate('grenade',point,yaw,aim),(weapon,point,yaw,aim)=>this.arsenals[slot].ultimate(weapon,point,yaw,aim),()=>this.pickups.update(0,[{position:p.position,vitals:p.vitals,refill:()=>this.arsenals[slot].refill()}])));
  }
  join(slot:number) {this.players[slot].lastSeq=-1;this.players[slot].input=idle();this.connected[slot]=true;if(this.connected.every(Boolean)){this.phase='countdown';this.countdown=3;}}
  leave(slot:number) {
    this.connected[slot]=false;
    if(this.phase!=='waiting') {this.phase='finished';this.winner=this.connected[1-slot]?1-slot:null;this.reason='Opponent disconnected';}
    this.players[slot].input=idle();
  }
  accept(slot:number,input:unknown) {
    if(!this.connected[slot] || !validInput(input))return false;
    const p=this.players[slot];if(input.seq<=p.lastSeq)return false;
    p.lastSeq=input.seq;p.lastInput=this.tick;if(this.phase!=='playing')return true;
    p.input={...input,fire:input.fire||p.input.fire,skill:input.skill||p.input.skill,reload:input.reload||p.input.reload};return true;
  }
  rematch(slot:number) {
    if(this.phase!=='finished'||!this.connected.every(Boolean))return;
    if(this.seriesComplete)return;
    this.ready[slot]=true;if(!this.ready.every(Boolean))return;
    this.seed=freshMapSeed(this.seed);const map=generateMap(this.seed);this.blocks.forEach((b,i)=>Object.assign(b,map[i]));this.terrain.reset();this.hazards.reset();this.burnOwner.clear();
    const spawns=randomSpawns(this.blocks);this.pickups.reset();
    this.players.forEach((p,i)=>{Object.assign(p.position,spawns[i]);p.velocity={x:0,z:0};p.yaw=i===0?0:Math.PI;p.input=idle();resetVitals(p.vitals);this.arsenals[i].reset();this.skills[i].reset();this.sounds[i].reset();});
    this.combatCues.reset();this.cues=[[],[]];this.ready=[false,false];this.phase='countdown';this.countdown=3;this.round++;this.winner=null;this.reason='';
  }
  step(dt=1/30) {
    this.tick++;
    if(this.phase==='countdown'){this.countdown=Math.max(0,this.countdown-dt);if(this.countdown<=.00001)this.phase='playing';return;}
    if(this.phase!=='playing')return;
    this.players.forEach((p,i)=>{updateVitals(p.vitals,dt);this.activeOwner=i;if(p.vitals.hp<=0)this.arsenals[i].cancelVolley();this.arsenals[i].update(dt);this.skills[i].update(dt);});
    this.activeOwner=null;
    const moved=[0,0];
    this.players.forEach((p,i)=>{
      const a=this.arsenals[i],s=this.skills[i],input=p.input;
      if(this.tick-p.lastInput>this.inputTimeoutTicks){input.moveX=0;input.moveZ=0;input.fire=false;input.skill=false;input.reload=false;}
      const locked=p.vitals.hp<=0||p.vitals.stun>0;
      if(!locked && !s.locked && !a.movementLocked){a.select(input.weapon);p.yaw=Math.atan2(input.aimX-p.position.x,input.aimZ-p.position.z);}
      this.activeOwner=i;
      if(!locked && !a.movementLocked && input.skill)s.activate(a.selected,p.yaw,{x:input.aimX,z:input.aimZ});
      if(!locked && !s.locked && !a.movementLocked && input.reload)a.reload();
      if(!locked && !s.locked && input.fire)a.fire(p.position,p.yaw,{x:input.aimX,z:input.aimZ});
      input.fire=input.skill=input.reload=false;this.activeOwner=null;
      p.velocity=movementVelocity(p.velocity,{x:input.moveX,z:input.moveZ},a.selected,this.terrain.kindAt(p.position),dt,locked||s.locked||a.movementLocked,s.speedMultiplier);
      const next=movePlayer(p.position,p.velocity.x*dt,p.velocity.z*dt,this.terrain.movementObstacles);
      moved[i]=Math.hypot(next.x-p.position.x,next.z-p.position.z);Object.assign(p.position,next);
    });
    this.hazards.update(dt);
    this.pickups.update(dt,this.players.map((p,i)=>({position:p.position,vitals:p.vitals,refill:()=>this.arsenals[i].refill()})));
    this.players.forEach((p,i)=>{
      const other=this.players[1-i],sight=createSight(p.position,this.blocks);
      const visible=[-.2,0,.2].some(dx=>sight.visible({x:other.position.x+dx,z:other.position.z},1));
      const cue=this.sounds[i].update(dt,p.position,other.position,moved[1-i],visible);
      if(cue) {this.cues[i].push({...cue,id:++this.cueId});if(this.cues[i].length>4)this.cues[i].shift();}
    });
    if(this.players.some(p=>p.vitals.hp<=0)) {this.phase='finished';this.winner=this.players.every(p=>p.vitals.hp<=0)?null:this.players[0].vitals.hp>0?0:1;this.reason=this.winner===null?'Draw':'Round ended';if(this.winner!==null)this.scores[this.winner]++;if(this.round>=3){this.seriesComplete=true;this.seriesWinner=this.scores[0]===this.scores[1]?null:this.scores[0]>this.scores[1]?0:1;}}
  }
  view(slot:number):Snapshot {
    const player=(i:number):PlayerView=>{
      const p=this.players[i],a=this.arsenals[i];
      return {vx:p.velocity.x,vz:p.velocity.z,movementLocked:a.movementLocked||this.skills[i].locked,x:p.position.x,z:p.position.z,yaw:p.yaw,...p.vitals,flammable:p.condition.flammable,burning:p.condition.burning,flash:p.condition.flash,phase:p.condition.phase,weapon:a.selected,ammo:Number.isFinite(a.ammo.ammo)?a.ammo.ammo:null,reserve:Number.isFinite(a.ammo.reserve)?a.ammo.reserve:null,capacity:Number.isFinite(a.capacity)?a.capacity:null,reload:a.ammo.remaining,cooldown:a.cooldown,boost:a.boostRemaining,speedBoost:this.skills[i].speedRemaining,skillPhase:this.skills[i].phase};
    };
    const sight=createSight(this.players[slot].position,this.blocks),other=this.players[1-slot];
    const visible=this.connected[1-slot]&&other.vitals.hp>0&&[-.2,0,.2].some(dx=>sight.visible({x:other.position.x+dx,z:other.position.z},1));
    for(const m of this.scene.meshes){m.metadata??={};m.metadata.renderId??=++this.renderId;}
    return {scores:[...this.scores],seriesComplete:this.seriesComplete,seriesWinner:this.seriesWinner,type:'state',room:this.name,slot,seed:this.seed,round:this.round,tick:this.tick,phase:this.phase,countdown:this.countdown,winner:this.winner,reason:this.reason,ready:[...this.ready],blocks:this.blocks.map(b=>({...b})),tiles:this.terrain.tiles.map(t=>this.terrain.kindAt(t)),self:player(slot),enemy:visible?player(1-slot):null,
      pickups:this.pickups.items.filter(p=>sight.visible(p,.45)),effects:this.scene.meshes.filter(m=>!m.parent&&sight.visible(m.position,m.position.y)).map(m=>({id:m.metadata.renderId,kind:m.name,vertices:m.name==='shotgun-cone'?Array.from(m.getVerticesData('position')??[]):undefined,x:m.position.x,y:m.position.y,z:m.position.z,sx:m.scaling.x,sy:m.scaling.y,sz:m.scaling.z,yaw:m.rotation.y})),sounds:this.cues[slot],combatCues:this.combatCues.view(slot,this.tick),};
  }
  save(){return {version:1,name:this.name,seed:this.seed,tick:this.tick,round:this.round,phase:this.phase,countdown:this.countdown,winner:this.winner,reason:this.reason,connected:[...this.connected],ready:[...this.ready],scores:[...this.scores],seriesComplete:this.seriesComplete,seriesWinner:this.seriesWinner,renderId:this.renderId,blocks:this.blocks.map(b=>({...b})),tiles:this.terrain.tiles.map(t=>t.kind),players:this.players.map(p=>({...p,position:{...p.position},condition:{...p.condition,position:undefined}})),arsenals:this.arsenals.map(a=>a.save()),skills:this.skills.map(s=>s.save()),pickups:this.pickups.save(),combatCues:this.combatCues.save(),sounds:this.sounds.map(s=>s.save()),cues:structuredClone(this.cues),cueId:this.cueId,burnOwner:[...this.burnOwner].map(([condition,owner])=>[this.players.findIndex(p=>p.condition===condition),owner])};}
  load(data:any){
    if(data.version!==1)throw new Error('Unsupported room state version');
    for(const key of ['seed','tick','round','phase','countdown','winner','reason','connected','ready','scores','seriesComplete','seriesWinner','renderId'] as const)(this as any)[key]=data[key];
    this.blocks.forEach((b,i)=>Object.assign(b,data.blocks[i]));this.terrain.tiles.forEach((t,i)=>t.kind=data.tiles[i]);
    this.players.forEach((p,i)=>{const saved=data.players[i];Object.assign(p.position,saved.position);Object.assign(p.vitals,saved.vitals);Object.assign(p.condition,saved.condition,{position:p.position});p.velocity={...saved.velocity};p.input={...saved.input};p.yaw=saved.yaw;p.lastSeq=saved.lastSeq;p.lastInput=saved.lastInput;this.arsenals[i].load(data.arsenals[i],p.position);this.skills[i].load(data.skills[i]);this.sounds[i].load(data.sounds[i]);});
    this.pickups.load(data.pickups);this.combatCues.load(data.combatCues);this.cues=data.cues;this.cueId=data.cueId;this.burnOwner.clear();for(const [slot,owner]of data.burnOwner)this.burnOwner.set(this.players[slot].condition,owner);
  }
  dispose(){this.scene.dispose();this.engine.dispose();}
}



