import * as T from './three.js';
import {RACE_LENGTH} from './course.js?v=7';
// Soft, irregular sand shadows, without paired tire marks or a hard road edge.
export function makeRoute(scene){const batches=[[],[],[]];const quad=(o,a,b,z,c,d,n)=>o.push(a,-.115,z,b,-.115,z,c,-.115,n,b,-.115,z,d,-.115,n,c,-.115,n);
for(let z=60;z>-RACE_LENGTH-70;z-=3){for(let lane=-1;lane<=1;lane++){const center=t=>lane*10+Math.sin(t*.037+lane*2.4)*3.2+Math.sin(t*.011+lane)*2.1;const width=t=>1.1+.55*Math.sin(t*.049+lane)+.3*Math.cos(t*.09);for(let band=0;band<3;band++){const a=center(z),b=center(z-3),w=width(z)+band*.9,v=width(z-3)+band*.9;quad(batches[band],a-w,a+w,z,b-v,b+v,z-3);}}}
return batches.map((v,i)=>{const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.computeBoundingSphere();const m=new T.Mesh(geo,new T.MeshBasicMaterial({color:0x766348,opacity:[.025,.018,.012][i],transparent:true,depthWrite:false,side:T.DoubleSide}));m.userData.worldSpace=true;m.renderOrder=i+1;scene.add(m);return m;});}
