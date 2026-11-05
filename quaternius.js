import * as T from './three.js';
const toLinear=x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};
const decode=(s,Type)=>{const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new Type(b.buffer);};
const [data,kit]=await Promise.all(['./quaternius-models.json','./kit-models.json'].map(f=>fetch(new URL(f,import.meta.url)).then(r=>{if(!r.ok)throw Error('Model download failed');return r.json();})));
const templates={};
for(const [name,parts] of Object.entries(data))templates[name]=parts.map(p=>{
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(decode(p.p,Float32Array),3));geo.setAttribute('normal',new T.BufferAttribute(decode(p.n,Float32Array),3));
 geo.setAttribute('color',new T.BufferAttribute(Float32Array.from(decode(p.c,Uint8Array),toLinear),3));geo.computeBoundingSphere();return {...p,geo};
});
// Zombie Apocalypse Kit props: quantised positions and normals, atlas colours baked per vertex.
const kitGeometry={};
for(const [name,k] of Object.entries(kit)){
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.BufferAttribute(Float32Array.from(decode(k.p,Int16Array),v=>v/32767*k.s),3));
 geo.setAttribute('normal',new T.BufferAttribute(Float32Array.from(decode(k.n,Int8Array),v=>v/127),3));
 geo.setAttribute('color',new T.BufferAttribute(Float32Array.from(decode(k.c,Uint8Array),toLinear),3));
 geo.setIndex(new T.BufferAttribute(decode(k.i,k.i32?Uint32Array:Uint16Array),1));
 geo.computeBoundingBox();geo.computeBoundingSphere();kitGeometry[name]=geo;
}
const kitMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:.08});
// Wrecks share one weathered material: atlas colours pulled towards rust and dust.
const wreckMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:.15,color:'#b39a7c'});
export function kitSize(name){return kitGeometry[name].boundingBox.getSize(new T.Vector3());}
export function kitBox(name){return kitGeometry[name].boundingBox;}
export function kitMesh(name,{wreck=false,shadow=true}={}){const m=new T.Mesh(kitGeometry[name],wreck?wreckMaterial:kitMaterial);m.castShadow=shadow;m.receiveShadow=true;return m;}
export const sharedKitMaterials=[kitMaterial,wreckMaterial];
export const sharedKitGeometries=Object.values(kitGeometry);
function mesh(part){const m=new T.Mesh(part.geo.clone(),new T.MeshStandardMaterial({vertexColors:true,roughness:.66,metalness:.18}));m.castShadow=m.receiveShadow=true;return m;}
export function assetCar(type,paint='#9f947a'){const g=new T.Group(),body=new T.Group(),wheels=[];g.add(body);for(const p of templates[type]){const m=mesh(p);const colors=m.geometry.attributes.color,tint=new T.Color(paint);for(let i=0;i<colors.count;i++){const r=colors.getX(i),g=colors.getY(i),b=colors.getZ(i),hi=Math.max(r,g,b);if((r>.35&&g>.25&&b<g*.35)||(b>.3&&g>.25&&r<g*.65)){const k=.6+hi*.4;colors.setXYZ(i,tint.r*k,tint.g*k,tint.b*k);}}colors.needsUpdate=true;if(p.name.includes('Wheel')){const pivot=new T.Group();pivot.position.fromArray(p.pivot);pivot.add(m);g.add(pivot);wheels.push({pivot,wheel:m,front:p.name.includes('Front')});}else body.add(m);}return {g,body,wheels};}
export function assetProp(type){const g=new T.Group();for(const p of templates[type])g.add(mesh(p));return g;}
