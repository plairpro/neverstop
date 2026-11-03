import * as T from './three.js';
const data=await fetch(new URL('./quaternius-models.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Model download failed');return r.json();});
const decode=(s,Type)=>{const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new Type(b.buffer);};
const templates={};
for(const [name,parts] of Object.entries(data))templates[name]=parts.map(p=>{
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(decode(p.p,Float32Array),3));geo.setAttribute('normal',new T.BufferAttribute(decode(p.n,Float32Array),3));
 const raw=decode(p.c,Uint8Array),colors=new Float32Array(raw.length);for(let i=0;i<raw.length;i++){const x=raw[i]/255;colors[i]=x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}
 geo.setAttribute('color',new T.BufferAttribute(colors,3));geo.computeBoundingSphere();return {...p,geo};
});
function mesh(part){const m=new T.Mesh(part.geo.clone(),new T.MeshStandardMaterial({vertexColors:true,roughness:.72,metalness:.12}));m.castShadow=m.receiveShadow=true;return m;}
export function assetCar(type){const g=new T.Group(),body=new T.Group(),wheels=[];g.add(body);for(const p of templates[type]){const m=mesh(p);if(p.name.includes('Wheel')){const pivot=new T.Group();pivot.position.fromArray(p.pivot);pivot.add(m);g.add(pivot);wheels.push({pivot,wheel:m,front:p.name.includes('Front')});}else body.add(m);}return {g,body,wheels};}
export function assetProp(type){const g=new T.Group();for(const p of templates[type])g.add(mesh(p));return g;}
