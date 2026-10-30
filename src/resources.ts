export const WEAPON_RULES = {
  shotgun: {capacity:4,reload:3.5,interval:.8,damage:30},
  pistol: {capacity:10,reload:2,interval:.075,damage:12},
  sword: {capacity:Infinity,reload:0,interval:.55,damage:25},
  rocket: {capacity:1,reload:4,interval:2.5,damage:45},
  grenade: {capacity:2,reload:3,interval:1.8,damage:40},
};
export type WeaponKind=keyof typeof WEAPON_RULES;
export const AMMO_TOTAL={pistol:Infinity,sword:Infinity,rocket:4,grenade:6,shotgun:8};
export function createAmmo() {
  const states=Object.fromEntries(Object.entries(WEAPON_RULES).map(([key,r])=>[key,{ammo:r.capacity,remaining:0,reserve:Number.isFinite(AMMO_TOTAL[key as WeaponKind])?AMMO_TOTAL[key as WeaponKind]-r.capacity:Infinity}])) as Record<WeaponKind,{ammo:number;remaining:number;reserve:number}>;
  function reload(w:WeaponKind) {
    const s=states[w],r=WEAPON_RULES[w];
    if(s.remaining>0 || s.ammo===r.capacity || !r.reload || s.reserve<=0) return;
    s.remaining=r.reload;
  }
  return {states,reload,
    save(){return structuredClone(states);},
    load(data:typeof states){for(const w of Object.keys(states) as WeaponKind[])Object.assign(states[w],data[w]);},
    consume(w:WeaponKind) {
      const s=states[w];if(s.remaining>0 || s.ammo<=0) return false;
      if(Number.isFinite(s.ammo)) s.ammo--;
      if(s.ammo===0) reload(w);
      return true;
    },
    update(dt:number) {for(const w of Object.keys(states) as WeaponKind[]) {const s=states[w];if(s.remaining>0) {s.remaining=Math.max(0,s.remaining-dt);if(!s.remaining){const amount=Math.min(WEAPON_RULES[w].capacity-s.ammo,s.reserve);s.ammo+=amount;if(Number.isFinite(s.reserve))s.reserve-=amount;}}}},
    reset() {for(const w of Object.keys(states) as WeaponKind[]) {states[w].ammo=WEAPON_RULES[w].capacity;states[w].remaining=0;states[w].reserve=Number.isFinite(AMMO_TOTAL[w])?AMMO_TOTAL[w]-WEAPON_RULES[w].capacity:Infinity;}},
  };
}

