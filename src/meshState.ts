import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
// Persist only render data. Never serialize engine/scene references.
export function saveMesh(m:Mesh){return {name:m.name,p:m.position.asArray(),s:m.scaling.asArray(),r:m.rotation.asArray(),id:m.metadata?.renderId,positions:Array.from(m.getVerticesData('position')??[]),normals:Array.from(m.getVerticesData('normal')??[]),indices:Array.from(m.getIndices()??[])};}
export function loadMesh(s:ReturnType<typeof saveMesh>,scene:Scene,material:Material){const m=new Mesh(s.name,scene),d=new VertexData();d.positions=s.positions;d.normals=s.normals;d.indices=s.indices;d.applyToMesh(m);m.position.fromArray(s.p);m.scaling.fromArray(s.s);m.rotation.fromArray(s.r);m.material=material;m.isPickable=false;m.metadata={renderId:s.id};return m;}
