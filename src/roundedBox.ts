import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type { Scene } from '@babylonjs/core/scene.js';

/** Rounded visual shell inside the unchanged box collision bounds. */
export function createRoundedBox(name: string, width: number, height: number, depth: number, scene: Scene): Mesh {
  const half = [width / 2, height / 2, depth / 2];
  const radius = Math.min(0.12, width*0.1, depth*0.1, height*0.1);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const coordinates = (h: number) => [-h, -h+radius*0.25, -h+radius*0.6, -h+radius, h-radius, h-radius*0.6, h-radius*0.25, h];
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const sign of [-1, 1]) {
      const start = positions.length / 3;
      const us = coordinates(half[u]), vs = coordinates(half[v]);
      for (const a of us) for (const b of vs) {
        const p = [0,0,0]; p[axis] = half[axis] * sign; p[u] = a; p[v] = b;
        const inner = p.map((value, i) => Math.max(-half[i]+radius, Math.min(half[i]-radius, value)));
        const delta = p.map((value, i) => value-inner[i]);
        const length = Math.hypot(...delta);
        const normal = delta.map(value => value/length);
        positions.push(...inner.map((value, i) => value+normal[i]*radius));
        normals.push(...normal);
      }
      for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) {
        const p = start+a*8+b, q = p+8;
        // Babylon's default left-handed front faces use clockwise winding.
        if (sign > 0) indices.push(p,p+1,q, p+1,q+1,q);
        else indices.push(p,q,p+1, p+1,q,q+1);
      }
    }
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions; data.normals = normals; data.indices = indices;
  data.applyToMesh(mesh);
  return mesh;
}
