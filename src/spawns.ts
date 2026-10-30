import {canStand,type Point} from './world';
import {createSight} from './fog';
import type {BlockState} from './blockState';
import {createTerrain} from './terrain';
export function randomSpawns(blocks:BlockState[],random=Math.random):Point[]{
 const terrain=createTerrain(blocks),cells=terrain.tiles.filter(p=>terrain.kindAt(p)==='normal'&&canStand(p,terrain.movementObstacles)).map(p=>({x:p.x,z:p.z}));
 for(let i=cells.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}
 const hidden=(a:Point,b:Point)=>{const sight=createSight(a,blocks);return [-.34,0,.34].every(dx=>[-.34,0,.34].every(dz=>!sight.visible({x:b.x+dx,z:b.z+dz},1)));};
 for(const a of cells)for(const b of cells)if(Math.hypot(a.x-b.x,a.z-b.z)>=10&&hidden(a,b)&&hidden(b,a))return [a,b];
 throw new Error('Map has no mutually hidden spawn pair');
}
