import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {BLOCK_SIZE} from './world';
import {MARBLE_RUBBLE_HEIGHT,type Tile,type TerrainKind} from './terrain';

// One mesh per terrain material, rather than thousands of separate draw calls.
export function createTerrainView(scene:Scene,tiles:Tile[],materials:Record<TerrainKind,Material>) {
  const meshes=Object.fromEntries(Object.entries(materials).map(([kind,material])=>{
    const mesh=new Mesh(`terrain-${kind}`,scene);mesh.material=material;mesh.isPickable=false;
    return [kind,mesh];
  })) as Record<TerrainKind,Mesh>;
  let last:string[]=[];
  return (known:readonly (TerrainKind|null)[])=>{
    const kinds=known.map(k=>k??'normal');
    if(kinds.every((k,i)=>last[i]===k)) return;
    last=kinds;
    for(const kind of Object.keys(meshes) as TerrainKind[]) {
      const positions:number[]=[],normals:number[]=[],indices:number[]=[];
      function quad(points:number[][],normal:number[]) {
        const base=positions.length/3;
        for(const p of points) {positions.push(...p);normals.push(...normal);}
        indices.push(base,base+2,base+1,base,base+3,base+2);
      }
      tiles.forEach((tile,i)=>{
        if(kinds[i]!==kind) return;
        const l=tile.x-BLOCK_SIZE/2,r=tile.x+BLOCK_SIZE/2,b=tile.z-BLOCK_SIZE/2,f=tile.z+BLOCK_SIZE/2;
        const y=kind==='marbleRubble'?MARBLE_RUBBLE_HEIGHT:0;
        quad([[l,y,b],[l,y,f],[r,y,f],[r,y,b]],[0,1,0]);
        if(y) {
          quad([[l,0,b],[l,y,b],[r,y,b],[r,0,b]],[0,0,-1]);
          quad([[r,0,f],[r,y,f],[l,y,f],[l,0,f]],[0,0,1]);
          quad([[l,0,f],[l,y,f],[l,y,b],[l,0,b]],[-1,0,0]);
          quad([[r,0,b],[r,y,b],[r,y,f],[r,0,f]],[1,0,0]);
        }
      });
      const mesh=meshes[kind];mesh.setEnabled(positions.length>0);
      if(positions.length) {const data=new VertexData();data.positions=positions;data.normals=normals;data.indices=indices;data.applyToMesh(mesh);}
    }
  };
}
