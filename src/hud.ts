import {SKILL_NAMES} from './rageSkills';
import type {WeaponKind} from './resources';
export const WEAPON_NAMES:Record<WeaponKind,string>={pistol:'Pistol',sword:'Sword',rocket:'Launcher',grenade:'Grenade',shotgun:'Shotgun'};
const previous=new Map<string,string>();
function markup(selector:string,html:string){if(previous.get(selector)===html)return;document.querySelector(selector)!.innerHTML=html;previous.set(selector,html);}
export function renderHud(p:{hp:number;rage:number;weapon:WeaponKind;ammo:number|null;capacity:number|null;reserve:number|null;reload:number;cooldown:number;boost:number;speedBoost:number;burning?:boolean;flammable?:boolean},enemyHP:number|null){
 const hp=Math.max(0,Math.min(100,p.hp)),rage=Math.max(0,Math.min(100,p.rage));
 markup('#combat-hud',`<div class="hud-heading">YOU <span>${p.burning?'BURNING':p.flammable?'FLAMMABLE':''}</span></div><div class="health-value">${Math.ceil(hp)}<small>/ 100 HP</small></div><div class="meter"><i style="width:${hp}%"></i></div><div class="rage-line"><kbd>Q</kbd><strong>${Math.floor(rage)}<small> / 100</small></strong><span>${rage>=100?'READY':SKILL_NAMES[p.weapon]}</span></div><div class="meter rage"><i style="width:${rage}%"></i></div><div class="buff">${p.boost>0?'RAPID FIRE '+p.boost.toFixed(1)+'s':p.speedBoost>0?'SPEED BOOST '+p.speedBoost.toFixed(1)+'s':''}</div>`);
 markup('#enemy-hud',`<div class="hud-heading">OPPONENT</div><div class="health-value">${enemyHP===null?'—':Math.ceil(Math.max(0,enemyHP))}<small>${enemyHP===null?'OUT OF SIGHT':'/ 100 HP'}</small></div><div class="meter enemy"><i style="width:${enemyHP===null?0:Math.max(0,Math.min(100,enemyHP))}%"></i></div>`);
 markup('#weapon-status',`<div class="weapon-name">${WEAPON_NAMES[p.weapon]}<span>${p.reload>0?'RELOADING '+p.reload.toFixed(1)+'s':p.cooldown>0?'COOLDOWN '+p.cooldown.toFixed(1)+'s':p.ammo===0?'EMPTY · FIND AMMO':'READY'}</span></div><div class="ammo-value">${p.ammo??'∞'}<small>/ ${p.capacity??'∞'}</small><span>RESERVE <b>${p.reserve??'∞'}</b></span></div>`);
}
