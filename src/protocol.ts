import type {BlockState} from './blockState';
import type {TerrainKind} from './terrain';
import type {WeaponKind} from './resources';
export type InputMessage={type:'input';seq:number;moveX:number;moveZ:number;aimX:number;aimZ:number;weapon:WeaponKind;fire:boolean;skill:boolean;reload:boolean};
export type PlayerView={vx?:number;vz?:number;movementLocked?:boolean;x:number;z:number;yaw:number;hp:number;rage:number;stun:number;flammable:boolean;burning:boolean;flash:number;phase:number;weapon:WeaponKind;ammo:number|null;reserve:number|null;capacity:number|null;reload:number;cooldown:number;boost:number;speedBoost:number;skillPhase:string};
export type EffectView={vertices?:number[];id:number;kind:string;x:number;y:number;z:number;sx:number;sy:number;sz:number;yaw:number};
export type Snapshot={stateAgeMs?:number;serverElapsedMs?:number;ackSeq?:number;scores:number[];seriesComplete:boolean;seriesWinner:number|null;type:'state';room:string;slot:number;round:number;tick:number;phase:'waiting'|'countdown'|'playing'|'finished';countdown:number;winner:number|null;reason:string;ready:boolean[];seed:number;blocks:BlockState[];tiles:TerrainKind[];self:PlayerView;enemy:PlayerView|null;effects:EffectView[];combatCues:import('./combatCues').CombatCue[];pickups:import('./pickups').Pickup[];sounds:{id:number;x:number;z:number}[]};
export type ServerMessage=Snapshot|{type:'error';message:string};

