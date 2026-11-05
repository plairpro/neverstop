import * as T from './three.js';
import {RACE_LENGTH,roadCenter} from './course.js?v=16';
// Faint winding sand shadows, split into short sections for frustum culling.
export function makeRoute(scene){const meshes=[];
for(let start=60;start>-RACE_LENGTH-80;start-=80)for(let band=0;band<3;band++){
 const v=[],mid=start-40;const quad=(a,b,z,c,d,n)=>v.push(a,-.115,z-mid,b,-.115,z-mid,c,-.115,n-mid,b,-.115,z-mid,d,-.115,n-mid,c,-.115,n-mid);
 for(let z=start;z>start-80;z-=4)for(const lane of[-1,0,1]){const center=t=>roadCenter(t)+lane*9+Math.sin(t*.037+lane)*1.1;const w=1.5+band*.8;quad(center(z)-w,center(z)+w,z,center(z-4)-w,center(z-4)+w,z-4);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.computeBoundingSphere();const m=new T.Mesh(geo,new T.MeshBasicMaterial({color:0x766348,opacity:[.035,.024,.014][band],transparent:true,depthWrite:false,side:T.DoubleSide}));m.position.z=mid;m.userData.faintRoute=true;scene.add(m);meshes.push(m);
}return meshes;}
