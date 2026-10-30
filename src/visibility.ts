import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector2 } from '@babylonjs/core/Maths/math.vector.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { OBSTACLES, BLOCK_SIZE, sightContext, type Point, type Obstacle } from './world';
import { createFogMemory, surfacePeers, FOG_SIZE, EYE_HEIGHT } from './fog';
import type { TerrainKind, Tile } from './terrain';

const vertexSource = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vWorld = (world * vec4(position, 1.0)).xyz;
  vNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

const fragmentSource = `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
uniform vec3 tint;
uniform vec2 observer;
uniform vec4 blockers[${OBSTACLES.length}];
uniform vec4 sightAreas[${OBSTACLES.length}];
uniform vec4 surfaceSkip[${OBSTACLES.length}];
uniform vec4 heights[${OBSTACLES.length}];
uniform sampler2D explored;
uniform float persistent;
uniform float rememberOnly;
uniform float blockKnown;
uniform vec4 selfRect;
uniform float insideBush;
uniform float alwaysVisible;
uniform float selfBlocker;
uniform float grid;
uniform float unlit;
uniform float opacity;

bool blocked(vec3 target, vec4 rect, float height) {
  if (rect.z < 0.0) return false;
  vec2 d = target.xz - observer;
  vec2 lo = rect.xy - rect.zw;
  vec2 hi = rect.xy + rect.zw;
  float nearT = 0.0;
  float farT = 1.0;
  if (abs(d.x) < 0.00001) {
    if (observer.x < lo.x || observer.x > hi.x) return false;
  } else {
    float a = (lo.x-observer.x)/d.x;
    float b = (hi.x-observer.x)/d.x;
    nearT = max(nearT, min(a,b)); farT = min(farT, max(a,b));
  }
  if (abs(d.y) < 0.00001) {
    if (observer.y < lo.y || observer.y > hi.y) return false;
  } else {
    float a = (lo.y-observer.y)/d.y;
    float b = (hi.y-observer.y)/d.y;
    nearT = max(nearT, min(a,b)); farT = min(farT, max(a,b));
  }
  float dy = target.y-${EYE_HEIGHT.toFixed(3)};
  if (abs(dy)<0.00001) {
    if (${EYE_HEIGHT.toFixed(3)} > height) return false;
  } else {
    float a = -${EYE_HEIGHT.toFixed(3)}/dy;
    float b = (height-${EYE_HEIGHT.toFixed(3)})/dy;
    nearT=max(nearT,min(a,b)); farT=min(farT,max(a,b));
  }
  return farT >= nearT && farT > 0.001 && nearT < 0.999;
}
void main() {
  // Stable world-space disk filter: only visibility is softened, not the scene.
  float occlusion = 0.0;
  for (int sampleIndex=0; sampleIndex<16; sampleIndex++) {
    float angle = float(sampleIndex) * 2.39996323;
    float radius = (selfBlocker >= 0.0 ? 0.10 : 0.25) * sqrt((float(sampleIndex)+0.5)/16.0);
    vec2 target = vWorld.xz + vec2(cos(angle),sin(angle))*radius;
    // Keep the soft filter on this block's footprint. Do not sample adjacent
    // blocks across a shared edge, and never promote one visible pixel to a mesh.
    if (selfBlocker >= 0.0) {
      target = clamp(target, selfRect.xy-selfRect.zw+0.001, selfRect.xy+selfRect.zw-0.001);
    }
    if (insideBush > 0.5) {
      bool inArea = false;
      for (int i=0; i<${OBSTACLES.length}; i++) {
        vec4 area = sightAreas[i];
        if (area.z > 0.0 && all(lessThanEqual(abs(vWorld.xz-area.xy),area.zw))) inArea = true;
      }
      if (!inArea) { occlusion += 1.0/16.0; continue; }
    }
    for (int i=0; i<${OBSTACLES.length}; i++) {
      if (surfaceSkip[i].x < 0.5 && blocked(vec3(target.x,max(0.0,vWorld.y),target.y), blockers[i], heights[i].x)) {
        occlusion += 1.0/16.0;
        break;
      }
    }
  }
  if (alwaysVisible > 0.5) occlusion = 0.0;
  if (rememberOnly > 0.5) occlusion = 1.0;
  float light = max(dot(normalize(vNormal), normalize(vec3(-0.5,1.0,-0.4))),0.0);
  float band = 0.61 + 0.21*smoothstep(0.16,0.34,light) + 0.18*smoothstep(0.54,0.76,light);
  vec3 color = tint * mix(band, 1.0, unlit);
  if (grid > 0.5) {
    vec2 edge = abs(fract((vWorld.xz + 15.0) / ${BLOCK_SIZE.toFixed(6)}) - 0.5);
    float line = smoothstep(0.475,0.495,max(edge.x,edge.y));
    color = mix(color, color * 0.8, line);
    float rim = smoothstep(14.8,14.95,max(abs(vWorld.x),abs(vWorld.z)));
    color = mix(color, vec3(0.50,0.64,0.52),rim);
  }
  vec4 history = texture2D(explored,clamp((vWorld.xz+15.0)/30.0,vec2(0.001),vec2(0.999)));
  float remembered = persistent * (selfBlocker >= 0.0 ? blockKnown : history.r);
  float visible = 1.0-smoothstep(0.0,1.0,occlusion);
  vec3 dark = mix(vec3(0.006,0.009,0.008),color*0.24,remembered);
  color = mix(dark,color,visible);
  float alpha = opacity;
  if (persistent < 0.5 && alwaysVisible < 0.5) alpha *= visible;
  else if (opacity < 1.0) alpha *= max(visible,remembered*0.8);
  if (alpha < 0.001) discard;
  gl_FragColor = vec4(color,alpha);
}`;

export function createVisibilityMaterials(scene: Scene, obstacles: Obstacle[], tiles: Tile[], kindAt: (p: Point)=>TerrainKind) {
  const materials: ShaderMaterial[] = [];
  const selves: number[] = [];
  const memory = createFogMemory(obstacles,tiles);
  const explored = RawTexture.CreateRGBATexture(memory.pixels,FOG_SIZE,FOG_SIZE,scene,false,false,Texture.NEAREST_SAMPLINGMODE);
  explored.wrapU = explored.wrapV = Texture.CLAMP_ADDRESSMODE;
  let elapsed = 1;
  let dirty = true;
  const pack = (hidden: Obstacle[] = []) => obstacles.flatMap(b => [b.x, b.z,
    b.destroyed || b.seeThrough || hidden.includes(b) ? -1 : b.width / 2, b.depth / 2]);
  const packed = pack();
  return {
    memory,
    invalidate() { dirty = true; },
    reset() { memory.reset(); explored.update(memory.pixels); dirty = true; elapsed = 1; },
    make(name: string, color: string, self = -1, grid = false, unlit = false, opacity = 1, alwaysVisible = false) {
      const material = new ShaderMaterial(name, scene, { vertexSource, fragmentSource }, {
        attributes: ['position', 'normal'],
        uniforms: ['world', 'worldViewProjection', 'tint', 'observer', 'blockers', 'sightAreas', 'surfaceSkip', 'heights', 'insideBush', 'selfRect', 'alwaysVisible', 'selfBlocker', 'grid', 'unlit', 'opacity', 'persistent', 'rememberOnly', 'blockKnown'],
        samplers: ['explored'],
        needAlphaBlending: opacity < 1,
      });
      material.setColor3('tint', Color3.FromHexString(color));
      material.setArray4('blockers', packed);
      material.setTexture('explored',explored);
      material.setFloat('persistent',self >= 0 || grid || name==='base' ? 1 : 0);
      material.setFloat('rememberOnly',0);
      material.setFloat('blockKnown',0);
      material.setArray4('heights',obstacles.flatMap(b=>[b.height,0,0,0]));
      material.setArray4('surfaceSkip',obstacles.flatMap((_,i)=>[i===self ? 1 : 0,0,0,0]));
      material.setArray4('sightAreas', obstacles.flatMap(b=>[b.x,b.z,-1,-1]));
      material.setFloat('insideBush', 0);
      material.setFloat('alwaysVisible', alwaysVisible ? 1 : 0);
      const rect = obstacles[self];
      material.setArray4('selfRect', rect ? [rect.x,rect.z,rect.width/2,rect.depth/2] : [0,0,0,0]);
      material.setFloat('selfBlocker', self);
      material.setFloat('grid', grid ? 1 : 0);
      material.setFloat('unlit', unlit ? 1 : 0);
      material.setFloat('opacity', opacity);
      if (opacity < 1) { material.backFaceCulling = self >= 0; material.disableDepthWrite = true; }
      material.setVector2('observer', new Vector2(0, -9));
      materials.push(material);
      selves.push(self);
      return material;
    },
    update(p: Point, dt = 0.016) {
      elapsed += dt;
      const refreshed = dirty || elapsed >= 0.1;
      if (refreshed) { memory.update(p,kindAt); explored.update(memory.pixels); elapsed=0; dirty=false; }
      const context = sightContext(p,obstacles);
      const blockers = pack(context.inside ? context.group : []);
      const areas = obstacles.flatMap(b=>[b.x,b.z,context.group.includes(b) ? b.width/2 : -1,b.depth/2]);
      for (let i=0; i<materials.length; i++) {
        const material = materials[i];
        const self = selves[i];
        const rect=obstacles[self];
        if(rect) material.setArray4('selfRect',[rect.x,rect.z,rect.width/2,rect.depth/2]);
        const peers = self >= 0 ? surfacePeers(self,obstacles) : [];
        material.setArray4('surfaceSkip',obstacles.flatMap((_,j)=>[peers.includes(j) ? 1 : 0,0,0,0]));
        material.setFloat('rememberOnly',self >= 0 && obstacles[self].destroyed ? 1 : 0);
        material.setFloat('blockKnown',self >= 0 && memory.knownBlocks[self] !== null ? 1 : 0);
        material.setVector2('observer', new Vector2(context.observer.x, context.observer.z));
        material.setArray4('blockers', blockers);
        material.setArray4('sightAreas', areas);
        material.setFloat('insideBush', context.inside ? 1 : 0);
      }
      return refreshed;
    },
  };
}

