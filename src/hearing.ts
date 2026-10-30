import type { Point } from './world';

export const HEARING_RANGE=12;
export function createFootsteps(random = Math.random) {
  let traveled=0, cooldown=0;
  return {
    save(){return {traveled,cooldown};},
    load(data:{traveled:number;cooldown:number}){traveled=data.traveled;cooldown=data.cooldown;},
    reset() {traveled=0;cooldown=0;},
    update(dt: number, observer: Point, enemy: Point, moved: number, visible: boolean): Point|null {
      cooldown=Math.max(0,cooldown-dt);
      traveled+=moved;
      if (moved<=0.0001 || traveled<0.75 || cooldown>0) return null;
      traveled=0; cooldown=0.65;
      if (visible || Math.hypot(enemy.x-observer.x,enemy.z-observer.z)>HEARING_RANGE) return null;
      // A noisy, coarse location sampled once per footstep, never a tracking marker.
      return {x:Math.max(-14,Math.min(14,Math.round(enemy.x/3)*3+(random()-0.5)*1.2)),
        z:Math.max(-14,Math.min(14,Math.round(enemy.z/3)*3+(random()-0.5)*1.2))};
    },
  };
}

export function createSoundHints(project: (p: Point)=>{x:number;y:number}, width: ()=>number) {
  const active: {point:Point; age:number; element:HTMLDivElement}[]=[];
  let audio: AudioContext|undefined;
  const unlock=()=>{
    try { audio ??= new AudioContext(); if(audio.state==='suspended') void audio.resume().catch(()=>{}); } catch { /* visual cues remain available */ }
  };
  window.addEventListener('pointerdown',unlock);
  window.addEventListener('keydown',unlock);
  return {
    emit(point: Point, observer: Point, label?:string) {
      const element=document.createElement('div'); element.className='sound-hint'; element.textContent=label??'!' ;
      element.setAttribute('aria-label',label??'Footsteps nearby');if(label)element.classList.add('combat-cue'); document.body.appendChild(element);
      active.push({point:{...point},age:0,element});
      if (!label && audio?.state==='running') {
        const source=audio.createBufferSource(), gain=audio.createGain(), pan=audio.createStereoPanner();
        const buffer=audio.createBuffer(1,Math.floor(audio.sampleRate*0.07),audio.sampleRate);
        const data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*6);
        source.buffer=buffer;
        gain.gain.value=0.06*(1-Math.min(0.8,Math.hypot(point.x-observer.x,point.z-observer.z)/HEARING_RANGE));
        pan.pan.value=Math.max(-1,Math.min(1,(point.x-observer.x)/8));
        source.connect(gain);gain.connect(pan);pan.connect(audio.destination);source.start();
        source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();};
      }
    },
    update(dt: number) {
      for(let i=active.length-1;i>=0;i--) {
        const cue=active[i];cue.age+=dt;
        if(cue.age>=1.1) {cue.element.remove();active.splice(i,1);continue;}
        const screen=project(cue.point);
        cue.element.style.left=`${Math.max(24,Math.min(width()-24,screen.x))}px`;
        cue.element.style.top=`${screen.y-cue.age*36}px`;
        cue.element.style.opacity=String(Math.min(1,(1.1-cue.age)*3));
      }
    },
    reset() {for(const cue of active)cue.element.remove();active.length=0;},
  };
}
