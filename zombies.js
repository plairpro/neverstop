import * as T from './three.js';
import {zombieLayout,hitZombie} from './zombie-physics.js?v=13';
const data=await fetch(new URL('./zombie-model.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Zombie asset download failed');return r.json();});
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const positions=data.frames.map(s=>Float32Array.from(new Int16Array(bytes(s).buffer),v=>v/5000));
const rgb=bytes(data.colors),colors=Float32Array.from(rgb,v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
const frames=positions.map((p,i)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));g.setAttribute('color',new T.BufferAttribute(colors,3));g.computeVertexNormals();g.morphAttributes.position=[new T.BufferAttribute(positions[(i+1)%positions.length],3)];g.computeBoundingSphere();return g;});
const material=new T.MeshStandardMaterial({vertexColors:true,roughness:1});
export function makeZombies(scene){return zombieLayout().map(z=>{const mesh=new T.Mesh(frames[0],material);mesh.castShadow=false;mesh.receiveShadow=true;scene.add(mesh);return {...z,mesh};});}
export function resetZombies(zombies){const layout=zombieLayout();zombies.forEach((z,i)=>{Object.assign(z,layout[i]);z.mesh.rotation.set(0,0,0);z.mesh.visible=false;});}
export function stepZombies(zombies,cars,dt,time,onHit){for(const z of zombies){if(z.hit){z.age+=dt;if(z.age<2){z.x+=z.vx*dt;z.z+=z.vz*dt;z.vx*=Math.exp(-dt*2);z.vz*=Math.exp(-dt*2);}continue;}z.x=z.homeX+Math.sin(time*.36+z.phase)*2;for(const c of cars)if(hitZombie(c,z)){onHit(c);break;}}}
export function renderZombies(zombies,time,viewZ){for(const z of zombies){const m=z.mesh;m.visible=z.z>viewZ-95&&z.z<viewZ+15&&(!z.hit||z.age<3);if(!m.visible)continue;
 const t=((time+z.phase)%data.duration)/data.duration*frames.length,index=Math.floor(t);m.geometry=frames[index];m.morphTargetInfluences[0]=t-index;
 m.position.set(z.x,z.hit?Math.max(.15,Math.sin(Math.min(1,z.age)*Math.PI)*1.2):0,z.z);m.rotation.set(z.hit?Math.min(Math.PI/2,z.age*6):0,z.hit?z.phase:Math.cos(time*.36+z.phase)>0?Math.PI/2:-Math.PI/2,0);if(z.hit)m.position.y-=Math.max(0,z.age-2)*.4;
}}
