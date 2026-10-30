import {createBlockStates} from './blockState';
import {SPAWN,type Point} from './world';

export const MATCH_SPAWNS=[{x:0,z:-13.5},{x:0,z:13.5}];
// Reproducible randomness: both clients receive the server's generated layout.
export function freshMapSeed(previous?:number):number {
 const seed=crypto.getRandomValues(new Uint32Array(1))[0];
 return seed===previous?(seed+1)>>>0:seed;
}
export function generateMap(seed:number) {
 let state=seed>>>0;
 const random=()=>{state=(state+0x6d2b79f5)>>>0;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
 const shuffle=<T>(items:T[])=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;};
 const blocks=createBlockStates();
 const occupied:Point[]=[];
 const spawns=[...MATCH_SPAWNS,SPAWN,{x:2,z:-8}];
 const cells:Point[]=[];for(let z=-13.5;z<=13.5;z++)for(let x=-13.5;x<=13.5;x++)cells.push({x,z});
 const allowed=(group:Point[])=>group.every(p=>Math.abs(p.x)<=13.5&&Math.abs(p.z)<=13.5&&spawns.every(s=>Math.hypot(p.x-s.x,p.z-s.z)>2)&&occupied.every(q=>Math.abs(p.x-q.x)>1||Math.abs(p.z-q.z)>1));
 // Separated single-cell-thick wall segments preserve routes around each wall.
 for(let wall=0;wall<6;wall++) {
  const candidates=shuffle(cells.flatMap(p=>[0,1].map(axis=>Array.from({length:5},(_,i)=>({x:p.x+(axis?0:i),z:p.z+(axis?i:0)})))));
  const group=candidates.find(allowed);
  if(!group)throw new Error('Unable to place map wall');
  group.forEach((p,i)=>Object.assign(blocks[43+wall*5+i],p));occupied.push(...group);
 }
 for(let i=0;i<43;i++) {
  const p=shuffle([...cells]).find(p=>allowed([p]));
  if(!p)throw new Error('Unable to place map block');
  Object.assign(blocks[i],p);occupied.push(p);
 }
 return blocks;
}
