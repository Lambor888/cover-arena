export const MAX_HP=100;
export const RAGE_PER_SECOND=5;
export function createVitals() {return {hp:MAX_HP,rage:0,stun:0};}
export type Vitals=ReturnType<typeof createVitals>;
export function dealDamage(v:Vitals,amount:number,attacker?:Vitals) {
  if(v.hp<=0 || !Number.isFinite(amount) || amount<=0) return 0;
  const actual=Math.min(v.hp,amount);v.hp-=actual;
  if(attacker && attacker!==v && attacker.hp>0) attacker.rage=Math.min(100,attacker.rage+actual*.5);
  return actual;
}
export function updateVitals(v:Vitals,dt:number) {
  v.stun=Math.max(0,v.stun-dt);
  if(v.hp>0) v.rage=Math.min(100,v.rage+dt*RAGE_PER_SECOND);
}
export function resetVitals(v:Vitals) {v.hp=MAX_HP;v.rage=0;v.stun=0;}
