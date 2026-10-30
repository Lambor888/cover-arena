import {saveMesh,loadMesh} from './meshState';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { HALF_SIZE, type Point, type Obstacle } from './world';
import { firstWallImpact } from './ballistics';
import { firstActorImpact, type CombatTarget } from './actorCombat';

export function createPistol(scene: Scene, material: Material, obstacles: Obstacle[], onHit: (index: number) => void, targets: CombatTarget[] = []) {
  const speed = 36, range = 28, shotInterval = 0.075;
  const bullets: { mesh: Mesh; dx: number; dz: number; remaining: number; speed:number }[] = [];
  const impacts: { mesh: Mesh; life: number }[] = [];
  let cooldown = 0;
  return {
    save(){return {cooldown,bullets:bullets.map(({mesh,...b})=>({...b,mesh:saveMesh(mesh)})),impacts:impacts.map(({mesh,...b})=>({...b,mesh:saveMesh(mesh)}))};},
    load(data:any){this.reset();cooldown=data.cooldown;for(const b of data.bullets)bullets.push({...b,mesh:loadMesh(b.mesh,scene,material)});for(const b of data.impacts)impacts.push({...b,mesh:loadMesh(b.mesh,scene,material)});},
    get cooldown() { return cooldown; },
    fire(position: Point, yaw: number, boosted=false) {
      if (cooldown > 0) return;
      cooldown = boosted ? .0375 : shotInterval;
      const mesh = MeshBuilder.CreateSphere('pistol-bullet', { diameter: 0.13, segments: 6 }, scene);
      mesh.material = material;
      mesh.isPickable = false;
      mesh.scaling.z = 3.5;
      mesh.rotation.y = yaw;
      // Start at the player, not beyond a wall when standing close to cover.
      mesh.position.set(position.x, 0.9, position.z);
      bullets.push({ mesh, dx: Math.sin(yaw), dz: Math.cos(yaw), remaining: range, speed:boosted?60:speed });
    },
    update(dt: number) {
      cooldown = Math.max(0, cooldown - dt);
      for (let i = impacts.length - 1; i >= 0; i--) {
        const impact = impacts[i];
        impact.life -= dt;
        if (impact.life <= 0) { impact.mesh.dispose(); impacts.splice(i, 1); }
        else impact.mesh.scaling.setAll(impact.life / 0.12);
      }
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const distance = Math.min(bullet.speed * dt, bullet.remaining);
        const start = bullet.mesh.position;
        const end = { x: start.x + bullet.dx * distance, z: start.z + bullet.dz * distance };
        const hit = firstWallImpact(start, end, obstacles, 0.9, 'bullet');
        const actor = firstActorImpact(start,end,targets,hit?.fraction);
        if (actor) actor.target.hit('pistol');
        if (hit !== null || actor) {
          const spark = MeshBuilder.CreateSphere('bullet-impact', { diameter: 0.22, segments: 6 }, scene);
          spark.material = material;
          spark.isPickable = false;
          const travel = Math.max(0, distance * (actor?.fraction ?? hit!.fraction) - 0.05);
          spark.position.set(start.x + bullet.dx * travel, 0.9, start.z + bullet.dz * travel);
          impacts.push({ mesh: spark, life: 0.12 });
          if (!actor && hit) onHit(hit.index);
        }
        bullet.remaining -= distance;
        if (hit !== null || actor || bullet.remaining <= 0 || Math.abs(end.x) > HALF_SIZE || Math.abs(end.z) > HALF_SIZE) {
          bullet.mesh.dispose(); bullets.splice(i, 1);
        } else bullet.mesh.position.set(end.x, 0.9, end.z);
      }
    },
    reset() {
      for (const bullet of bullets) bullet.mesh.dispose();
      for (const impact of impacts) impact.mesh.dispose();
      bullets.length = 0; impacts.length = 0; cooldown = 0;
    },
  };
}
