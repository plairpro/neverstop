import * as T from './three.js';
import {RACE_LENGTH} from './course.js?v=7';
// Three batched, world-space meshes: travelled sand, shoulders and old wheel ruts.
export function makeRoute(scene){
 const batches=[[],[],[]];
 const quad=(out,l0,r0,z0,l1,r1,z1,y)=>out.push(l0,y,z0,r0,y,z0,l1,y,z1,r0,y,z0,r1,y,z1,l1,y,z1);
 for(let z=60;z>-RACE_LENGTH-70;z-=5){const next=z-5;
  const center=t=>Math.sin(t*.009)*1.2;
  const half=t=>18.8+Math.sin(t*.045)*.55+Math.sin(t*.11)*.22;
  const l=center(z)-half(z),r=center(z)+half(z),ln=center(next)-half(next),rn=center(next)+half(next);
  quad(batches[0],l,r,z,ln,rn,next,-.115);
  quad(batches[1],l-1.7,l,z,ln-1.7,ln,next,-.12);quad(batches[1],r,r+1.7,z,rn,rn+1.7,next,-.12);
  for(let lane=-1;lane<=1;lane++)for(const wheel of[-1,1]){
   const rut=t=>lane*8+wheel*1.05+Math.sin(t*.016+lane*2)*1.5+Math.sin(t*.044+lane)*.28;
   const width=.16+.05*(1+Math.sin(z*.23+lane));const a=rut(z),b=rut(next);
   quad(batches[2],a-width,a+width,z,b-width,b+width,next,-.10);

  }
 }
 const materials=[new T.MeshBasicMaterial({color:0x766348,opacity:.10,transparent:true,depthWrite:false,side:T.DoubleSide}),new T.MeshBasicMaterial({color:0x766348,opacity:.06,transparent:true,depthWrite:false,side:T.DoubleSide}),new T.MeshBasicMaterial({color:0x5b4b33,opacity:.16,transparent:true,depthWrite:false,side:T.DoubleSide})];
 return batches.map((vertices,i)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeBoundingSphere();const mesh=new T.Mesh(g,materials[i]);mesh.userData.worldSpace=true;mesh.renderOrder=i+1;scene.add(mesh);return mesh;});
}
