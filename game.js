import {assetCar,assetProp,kitMesh,kitBox,sharedKitMaterials,sharedKitGeometries} from './quaternius.js?v=16';
import {makeRoute} from './route.js?v=16';
import {batchStatic} from './render-utils.js?v=16';
import {RACE_LENGTH,roadCenter,roadside,createCourse,contour,finishCrossings} from './course.js?v=16';
import * as T from './three.js';
import {SoftwareRenderer} from './software.js?v=16';
import {vehicle,step,collide,collideSolid,pickup,clamp} from './physics.js?v=16';
import {CARGO_SLOTS,PLAYER_START_CARGO,loadCargo,loadFactor,createStorm,stepStorm,dropCargo,stepLoose,grabCargo,cargoForImpact,caravanCargo,deliver,stickCar,holdStuck,tryRescue,incidentCandidate,STORM_EDGE,STORM_MAX_GAP} from './caravan.js?v=16';
const $=id=>document.getElementById(id);

// Graphics quality: full picture by default, economy mode trades resolution and frame rate for a quieter laptop.
let quality='high';try{if(localStorage.getItem('neverstop-quality')==='low')quality='low';}catch{}
let renderer;try{renderer=new T.WebGLRenderer({canvas:$('world'),antialias:false,powerPreference:'high-performance'});}catch(e){renderer=new SoftwareRenderer($('world'));}
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
document.body.classList.toggle('gpu',!!renderer.isWebGLRenderer);

const SKY='#d2b88d';
const solids=[],distant=[],scene=new T.Scene();scene.background=new T.Color(SKY);scene.fog=new T.FogExp2(SKY,.0042);
const camera=new T.PerspectiveCamera(38,1,.2,320);
const hemi=new T.HemisphereLight(0xbfd2e2,0x8a6a45,.72);scene.add(hemi);
// Low warm sun: long shadows make the props and pickups read as solid miniatures.
const sun=new T.DirectionalLight(0xffdcae,3.9);sun.castShadow=true;Object.assign(sun.shadow.camera,{left:-48,right:48,top:58,bottom:-58,near:1,far:160});sun.shadow.bias=-.0002;sun.shadow.normalBias=.04;sun.shadow.radius=3;scene.add(sun);scene.add(sun.target);
const fill=new T.DirectionalLight(0xa9c8e6,.5);scene.add(fill);scene.add(fill.target);
const skyCanvas=document.createElement('canvas');skyCanvas.width=512;skyCanvas.height=256;{const sx=skyCanvas.getContext('2d'),gr=sx.createLinearGradient(0,0,0,256);gr.addColorStop(0,'#8fb0c9');gr.addColorStop(.46,'#ead9bd');gr.addColorStop(.53,'#c2a173');gr.addColorStop(1,'#6a5236');sx.fillStyle=gr;sx.fillRect(0,0,512,256);}
const skyMap=new T.CanvasTexture(skyCanvas);skyMap.mapping=T.EquirectangularReflectionMapping;skyMap.colorSpace=T.SRGBColorSpace;scene.environment=skyMap;scene.environmentIntensity=.55;

const mat=(color,roughness=1,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
const sand=mat('#e8d5b4'),rubber=mat('#252722'),steel=mat('#4a463b',.6,.55),rust=mat('#74472d',.9,.25),fuelMat=mat('#ed7430',.6,.3);
const paints=['#a99b7e','#805a4b','#767c60','#64777c'];
// Sand detail: fine grains plus wind ripples; macro patches come from ground vertex colours.
const sandCanvas=document.createElement('canvas');sandCanvas.width=sandCanvas.height=512;{const sc=sandCanvas.getContext('2d');sc.fillStyle='#c2a679';sc.fillRect(0,0,512,512);for(let i=0;i<42000;i++){const x=Math.random()*512,y=Math.random()*512;sc.fillStyle=i%2?'rgba(70,48,22,.09)':'rgba(255,240,205,.13)';sc.fillRect(x,y,1+Math.random()*2,1);}for(let i=0;i<86;i++){sc.strokeStyle=i%2?'rgba(102,74,40,.07)':'rgba(255,236,196,.08)';sc.lineWidth=1.4;sc.beginPath();const y=i*6;for(let x=0;x<=512;x+=8)sc.lineTo(x,y+Math.sin(x*.025+i*.7)*3);sc.stroke();}}
const sandTexture=new T.CanvasTexture(sandCanvas);sandTexture.wrapS=sandTexture.wrapT=T.RepeatWrapping;sandTexture.repeat.set(14,14);sandTexture.colorSpace=T.SRGBColorSpace;sandTexture.anisotropy=8;sand.map=sandTexture;sand.bumpMap=sandTexture;sand.bumpScale=.28;
const groundMat=sand.clone();groundMat.vertexColors=true;
function box(g,w,h,d,x,y,z,m){const a=new T.Mesh(new T.BoxGeometry(w,h,d),m);a.position.set(x,y,z);a.castShadow=true;a.receiveShadow=true;g.add(a);return a;}
function strut(g,a,b,r,m){const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from);const mesh=new T.Mesh(new T.CylinderGeometry(r,r,delta.length(),6),m);mesh.position.copy(from.add(to).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());mesh.castShadow=true;g.add(mesh);return mesh;}
// A kit prop scaled to a target size; returns the group and its footprint half-sizes.
function kitProp(name,size,{wreck=false,by='y'}={}){const m=kitMesh(name,{wreck}),b=kitBox(name),s=b.getSize(new T.Vector3()),k=size/s[by];m.scale.setScalar(k);m.position.y=-b.min.y*k;const g=new T.Group();g.add(m);return {g,hx:s.x*k/2,hz:s.z*k/2,h:s.y*k};}

// Ground tiles recycle behind the convoy; dunes rise beyond the drivable band.
const noise=(x,z)=>Math.sin(x*.16+Math.sin(z*.035))*Math.cos(z*.12)*.7+Math.sin(x*.041+z*.023)*1.3;
// Ground tiles follow the road: each tile is reshaped around the winding centre line when it recycles.
const groundBase=new T.PlaneGeometry(420,180,52,24);groundBase.rotateX(-Math.PI/2);
function shapeGround(m){const geo=m.geometry,pos=geo.attributes.position,col=geo.attributes.color,base=groundBase.attributes.position;for(let i=0;i<pos.count;i++){const lx=base.getX(i),lz=base.getZ(i),wz=m.position.z+lz,x=lx-roadCenter(wz)+m.position.x,dune=clamp((Math.abs(x)-48)/22,0,1);pos.setY(i,noise(lx,wz)*1.7*dune+dune*dune*2.2-.16);const patch=.94+.08*Math.sin(lx*.05+wz*.031)*Math.cos(wz*.043-lx*.012)+.05*dune;col.setXYZ(i,patch*1.02,patch,patch*.95);}pos.needsUpdate=true;col.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();}
const grounds=[];for(let i=0;i<4;i++){const geo=groundBase.clone();geo.setAttribute('color',new T.BufferAttribute(new Float32Array(geo.attributes.position.count*3),3));const m=new T.Mesh(geo,groundMat);m.position.z=120-i*180;m.position.x=roadCenter(m.position.z);m.receiveShadow=true;shapeGround(m);scene.add(m);grounds.push(m);}
makeRoute(scene);

// Roadside junk recycles ahead of the convoy: pallets, blocks, tyres, bags and cones from the kit.
const props=[];const junk=[['pallet',1.25,'x'],['palletBroken',1.25,'x'],['block',.5,'x'],['tires',.85,'y'],['wheel',.8,'x'],['bag',.6,'y'],['sack',.6,'y'],['cone',.75,'y'],['plastic',.9,'y'],['pipes',3,'z']];
for(let i=0;i<64;i++){const side=i%2?1:-1,x=side*(21+Math.random()*16),z=80-Math.random()*650;let g;
 if(i%4===0){g=new T.Mesh(new T.DodecahedronGeometry(.5+Math.random()*2.2,0),mat(i%3?'#92846a':'#7c7963'));g.scale.y=.35+Math.random()*.5;g.castShadow=g.receiveShadow=true;g.geometry.computeBoundingBox();const b=g.geometry.boundingBox;solids.push({object:g,hx:(b.max.x-b.min.x)*.5,hz:(b.max.z-b.min.z)*.5});}
 else{const [name,size,by]=junk[i%junk.length];const p=kitProp(name,size*(.9+Math.random()*.3),{by});g=p.g;g.children[0].rotation.z=name==='cone'&&i%3===0?Math.PI/2.3:0;}
 g.rotation.y=Math.random()*6;g.position.set(roadside(z,x),0,z);g.userData.roadOffset=x;scene.add(g);props.push(g);}
const scrubMat=mat('#737a4c'),twigMat=mat('#6a5a40');
for(let i=0;i<110;i++){const g=new T.Group(),side=i%2?1:-1,x=side*(20+Math.random()*14),z=65-Math.random()*640;
 if(i%4===0){const rock=new T.Mesh(new T.DodecahedronGeometry(.18+Math.random()*.45,0),mat('#a2957c'));rock.scale.set(1,.5,1.3);rock.castShadow=true;g.add(rock);}
 else{const h=.35+Math.random()*.65;for(let j=0;j<3;j++){const a=j*2.1+i;strut(g,[0,0,0],[Math.cos(a)*.4,h,Math.sin(a)*.4],.035,twigMat);const leaf=new T.Mesh(new T.IcosahedronGeometry(.25+Math.random()*.18,0),scrubMat);leaf.position.set(Math.cos(a)*.35,h,Math.sin(a)*.35);leaf.scale.y=.7;leaf.castShadow=true;g.add(leaf);}}
 g.position.set(roadside(z,x),0,z);g.userData.roadOffset=x;batchStatic(g);scene.add(g);props.push(g);}

// Landmarks along the 1.6 km: containers, wrecked cars, water towers and barriers, all solid.
function place(g,x,z,turn,hx,hz){g.position.set(x,0,z);g.rotation.y=turn;scene.add(g);distant.push(g);solids.push({object:g,hx,hz});}
for(let i=0;i<Math.floor(RACE_LENGTH/39);i++){const z=-50-i*39,side=i%2?1:-1,kind=i%8;
 if(kind===0){const g=assetProp('tower'),b=new T.Box3().setFromObject(g),s=b.getSize(new T.Vector3()),k=9/s.y;g.scale.setScalar(k);g.children.forEach(c=>c.position.y-=b.min.y);place(g,roadside(z,side*36),z,i*.7,s.x*k/2,s.z*k/2);}
 else if(kind===1||kind===5){const p=kitProp(i%3?'containerRed':'containerGreen',6,{by:'x'});if(i%4===1){const top=kitProp('containerGreen',6,{by:'x'});top.g.position.y=p.h-.02;top.g.rotation.y=.12;p.g.add(top.g);}place(p.g,roadside(z,side*(27+i%3*3)),z,Math.PI/2+side*.25+(i%5)*.15,p.hx,p.hz);}
 else if(kind===2||kind===6){const name=['wreckPickup','wreckTruck','wreckSports'][i%3],p=kitProp(name,name==='wreckTruck'?6:5,{wreck:true,by:'z'});p.g.children[0].rotation.z=i%4===2?.18:-.06;place(p.g,roadside(z,side*(23+i%4*1.5)),z,i*1.37,p.hx,p.hz);}
 else if(kind===3){const p=kitProp('barrier2',1.3,{by:'x'});for(let j=1;j<4;j++){const q=kitProp('barrier2',1.3,{by:'x'});q.g.position.x=j*1.25;q.g.rotation.y=(j%2?.18:-.12);p.g.add(q.g);}place(p.g,roadside(z,side*22.5),z,Math.PI/2+side*.2,2.6,.5);}
 else if(kind===4){const g=assetProp('barrel'),k=1.25/1.15;g.scale.setScalar(k);place(g,roadside(z,side*24),z,i,.4,.4);const p=kitProp('tires',1.1);p.g.position.set(1.3,0,.6);g.add(p.g);}
 else{const p=kitProp('couch',1.1);place(p.g,roadside(z,side*(25+i%3)),z,i*.9,p.hx,p.hz);}}
// Obstacles on the road share their contours with the physics.
const poolMat=mat('#4f4535',.75),poolInner=mat('#3a3529',.45,.1),rockMat=mat('#8b7d62',.95);
function makeObstacle(p){const g=new T.Group(),verts=[],idx=[],segments=24,rings=p.kind==='pool'?2:5;
 for(let k=0;k<=rings;k++)for(let j=0;j<=segments;j++){const a=j/segments*Math.PI*2,t=k/rings,edge=contour(a,p.seed);const h=p.kind==='pool'?.025:Math.sin((1-t)*Math.PI/2)**1.5*p.height;verts.push(Math.cos(a)*p.rx*edge*t,h,Math.sin(a)*p.rz*edge*t);}
 for(let k=0;k<rings;k++)for(let j=0;j<segments;j++){const a=k*(segments+1)+j,b=a+segments+1;idx.push(a,a+1,b,b,a+1,b+1);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.setIndex(idx);geo.computeVertexNormals();
 const material=p.kind==='pool'?poolMat:p.kind==='rock'?rockMat:sand;
 const mesh=new T.Mesh(geo,material);mesh.receiveShadow=true;mesh.castShadow=p.kind!=='pool';g.add(mesh);
 if(p.kind==='pool'){const inner=new T.Mesh(geo,poolInner);inner.scale.set(.72,1,.78);inner.position.set(p.rx*.08,.008,-p.rz*.08);g.add(inner);}
 g.rotation.y=-p.angle;g.position.set(p.x,0,p.z);scene.add(g);return {...p,g};}

let pits=[],fuels=[],cars=[],models=[],loose=[],storm=createStorm(),playing=false,paused=false,ended=false,time=0,acc=0,toast=0,muted=false,finishCount=0,watching=false;
const keys=new Set();let touch=0,volume=.7;const steeringPointers=new Map();const names=['ТЫ','RUST','JACKAL','DUST'];
const nitroMat=mat('#59c4d3',.4,.45),chromeSupply=mat('#b4bdad',.35,.6),labelMat=mat('#ffe4a4');
const zoneFuel=new T.MeshBasicMaterial({color:0xd9ae62,transparent:true,opacity:.18,depthWrite:false}),zoneNitro=new T.MeshBasicMaterial({color:0x79aeb5,transparent:true,opacity:.18,depthWrite:false}),zoneGeo=new T.CircleGeometry(1,28);zoneGeo.rotateX(-Math.PI/2);
function makeSupply(f){const g=new T.Group(),item=new T.Group();g.add(item);
 if(f.kind==='fuel'){box(item,.75,1,.36,0,.8,0,fuelMat);box(item,.4,.13,.36,0,1.42,0,steel);box(item,.11,.25,.36,-.23,1.3,0,fuelMat);box(item,.11,.25,.36,.23,1.3,0,fuelMat);box(item,.56,.09,.39,0,.83,0,labelMat);}
 else{const bottle=new T.Mesh(new T.CylinderGeometry(.27,.32,1.2,16),nitroMat);bottle.position.y=.8;bottle.castShadow=true;item.add(bottle);box(item,.2,.2,.18,0,1.5,0,chromeSupply);box(item,.55,.12,.1,0,1.58,0,steel);for(const y of[.38,1.17]){const band=new T.Mesh(new T.CylinderGeometry(.33,.33,.1,16),chromeSupply);band.position.y=y;item.add(band);}}
 item.scale.setScalar(1.35);batchStatic(item);const zone=new T.Mesh(zoneGeo,f.kind==='fuel'?zoneFuel:zoneNitro);zone.scale.set(f.kind==='fuel'?5.5:4,1,3.5);zone.position.y=.04;g.add(zone);g.position.set(f.x,0,f.z);scene.add(g);return {...f,g,item,active:true};}

// Cargo in the pickup bed. Slots fill the bottom row first, two items ride on top.
const BED=[[-.42,.84,.55],[.42,.84,.55],[-.42,.84,1.12],[.42,.84,1.12],[-.42,.84,1.7],[.42,.84,1.7],[-.36,1.3,.62],[.36,1.3,1.2]];
const CARGO_LOOK={crate:['crate',.56,'x'],barrel:['barrel',.7,'y'],sack:['bag',.5,'y'],tires:['tires',.5,'y']};
const woodMat=mat('#8a6a43',.9),slatMat=mat('#5e4529',.9),crateGeo=new T.BoxGeometry(.58,.4,.46),slatGeo=new T.BoxGeometry(.62,.07,.5);
// Low-poly wooden crate: the kit chest is 3k triangles, too heavy for 32 copies with shadows.
function crate(){const g=new T.Group(),body=new T.Mesh(crateGeo,woodMat);body.position.y=.2;body.castShadow=body.receiveShadow=true;g.add(body);for(const y of[.07,.33]){const s=new T.Mesh(slatGeo,slatMat);s.position.y=y;s.castShadow=true;g.add(s);}return g;}
function cargoMesh(kind){if(kind==='crate')return crate();const [name,size,by]=CARGO_LOOK[kind];if(name==='barrel'){const g=assetProp('barrel');g.scale.setScalar(size/1.15);return g;}return kitProp(name,size,{by}).g;}
const tarpMat=mat('#8a7a55',.95),ropeMat=mat('#a58c5d',.9);
function makeCar(color){const model=assetCar('pickup',color);const bed=new T.Group();model.body.add(bed);model.bed=bed;model.slots=[];
 // A rolled tarp behind the cab keeps the caravan look even when the bed empties.
 const tarp=new T.Mesh(new T.CylinderGeometry(.2,.2,1.5,10),tarpMat);tarp.rotation.z=Math.PI/2;tarp.position.set(0,1.18,.22);tarp.castShadow=true;model.body.add(tarp);
 scene.add(model.g);return model;}
function syncCargo(model,c){const n=c.cargo.length;while(model.slots.length>n){const m=model.slots.pop();model.bed.remove(m);disposeRaceObject(m);}
 while(model.slots.length<n){const i=model.slots.length,m=cargoMesh(c.cargo[i]);const [x,y,z]=BED[i];m.position.set(x,y,z);m.rotation.y=(i*1.7)%1*.5-.25;model.bed.add(m);model.slots.push(m);}}
// Loose cargo lies on the sand until someone picks it up or the storm takes it.
const ringMat=new T.MeshBasicMaterial({color:0xffe2a0,transparent:true,opacity:.34,depthWrite:false}),beamMat=new T.MeshBasicMaterial({color:0xffd27a,transparent:true,opacity:.38,depthWrite:false,blending:T.AdditiveBlending}),beamGeo=new T.CylinderGeometry(.09,.22,5,8,1,true);
const loosePool=[];function looseMesh(kind){let entry=loosePool.find(e=>!e.used&&e.kind===kind);if(!entry){entry={kind,m:cargoMesh(kind),used:false};const ring=new T.Mesh(zoneGeo,ringMat);ring.scale.set(2.4,1,2.4);ring.position.y=.03;entry.m.add(ring);const beam=new T.Mesh(beamGeo,beamMat);beam.position.y=2.6;entry.m.add(beam);scene.add(entry.m);loosePool.push(entry);}entry.used=true;entry.m.visible=true;return entry;}
function releaseLoose(){for(const e of loosePool){e.used=false;e.m.visible=false;}}

// Oasis settlement at the finish: adobe houses around a wide shed roof the caravan parks under.
const oasis=new T.Group();{const post=mat('#4a4237',.7,.4),sheetA=mat('#8a5a3a',.85,.35),sheetB=mat('#6f6b5e',.75,.45),adobe=[mat('#c9a77f'),mat('#b88f66'),mat('#d4b994')],trim=mat('#7d6046'),hole=mat('#2e2a24'),awning=mat('#8d4d2c',.95);
 // Shed roof over the finish: steel posts, cross beams and rippled sheet panels. Pickups stop beneath it.
 // Posts only at the sides so the whole road stays open underneath.
 for(const x of[-21.5,21.5])for(const z of[5,-1,-7]){strut(oasis,[x,0,z],[x,5.4,z],.2,post);strut(oasis,[x,4.2,z],[x*.86,5.4,z],.08,post);}
 for(const z of[5,-7])box(oasis,43,.3,.3,0,5.4,z,post);for(const x of[-21,0,21])box(oasis,.3,.3,12.4,x,5.55,-1,post);
 for(let i=0;i<11;i++){const s=box(oasis,4.1,.08,13.6,-20.5+i*4.1,5.75+(i%2)*.05,-1,i%3===1?sheetB:sheetA);s.rotation.z=(i%2?.03:-.03);s.rotation.x=.05;}
 // Houses: flat-roofed adobe boxes with parapets, dark doorways, small windows and the odd awning.
 function house(x,z,w,d,h,turn,k){const g=new T.Group(),m=adobe[k%3];box(g,w,h,d,0,h/2,0,m);box(g,w+.2,.35,d+.2,0,h+.17,0,trim);box(g,1.1,2,.1,-w*.2,1,d/2+.03,hole);
  for(const wx of[w*.18,w*.38])if(wx+.5<w/2)box(g,.7,.6,.1,wx,h*.62,d/2+.03,hole);box(g,.1,.6,.7,w/2+.03,h*.62,0,hole);
  if(k%2===0){const a=box(g,w*.55,.06,1.6,w*.12,2.45,d/2+.8,awning);a.rotation.x=-.18;strut(g,[w*.12-w*.25,0,d/2+1.5],[w*.12-w*.25,2.35,d/2+1.5],.05,post);strut(g,[w*.12+w*.25,0,d/2+1.5],[w*.12+w*.25,2.35,d/2+1.5],.05,post);}
  if(k%3===1){const t=assetProp('barrel');t.scale.setScalar(.75);t.position.set(w*.3,h+.34,-d*.2);g.add(t);}
  g.position.set(x,0,z);g.rotation.y=turn;batchStatic(g);oasis.add(g);}
 const homes=[[-30,2,8,6,3.6,Math.PI/2],[-31,-12,7,7,4.2,Math.PI/2],[-28,-26,9,6,3.4,Math.PI/2.2],[30,-2,7,6,3.8,-Math.PI/2],[33,-16,8,7,3.2,-Math.PI/2],[29,-30,6,6,4.4,-Math.PI/2.3],[-12,-30,8,6,3.5,0],[6,-34,9,7,4,0.1],[-40,-6,6,5,3,Math.PI/2],[42,-24,7,5,3.4,-Math.PI/2]];
 homes.forEach((h,i)=>house(...h,i));
 const shack=kitProp('containerGreen',6,{by:'x'});shack.g.position.set(19,0,-24);shack.g.rotation.y=.2;oasis.add(shack.g);
 const tower=assetProp('tower'),tb=new T.Box3().setFromObject(tower),k=11/tb.getSize(new T.Vector3()).y;tower.scale.setScalar(k);tower.position.set(38,-tb.min.y*k,8);oasis.add(tower);
 const pond=new T.Mesh(new T.CircleGeometry(7,32),new T.MeshStandardMaterial({color:'#3e6b66',roughness:.15,metalness:.2}));pond.rotation.x=-Math.PI/2;pond.scale.set(1.5,.8,1);pond.position.set(-14,.05,-44);oasis.add(pond);
 const trunk=mat('#7a5e3c'),frond=mat('#5f7a3e');for(let i=0;i<6;i++){const x=-26+i*5+Math.sin(i)*2,z=-40-(i%3)*5,h=5+i%3*1.4;strut(oasis,[x,0,z],[x+.8,h,z+.4],.18,trunk);for(let j=0;j<6;j++){const a=j/6*Math.PI*2,leaf=box(oasis,3,.08,.6,x+.8+Math.cos(a)*1.3,h-.3,z+.4+Math.sin(a)*1.3,frond);leaf.rotation.set(0,-a,-.35);}}
 for(let i=0;i<6;i++){const p=kitProp('barrier2',1.2,{by:'x'});p.g.position.set((i<3?-1:1)*(23.5+i%3*.3),0,16-i%3*1.6);p.g.rotation.y=Math.PI/2;oasis.add(p.g);}
 oasis.position.set(roadCenter(-RACE_LENGTH),0,-RACE_LENGTH);scene.add(oasis);}

// Broken walls and poles mark the outside of bends.
const concrete=mat('#a29880'),burnt=mat('#49483e');
function brokenWall(g,w,h,x,z,turn=0){const shape=new T.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(w/2,h*.63);shape.lineTo(w*.3,h*.88);shape.lineTo(w*.15,h*.69);shape.lineTo(-w*.05,h);shape.lineTo(-w*.2,h*.82);shape.lineTo(-w/2,h*.92);shape.closePath();const geo=new T.ExtrudeGeometry(shape,{depth:.38,bevelEnabled:false});const mesh=new T.Mesh(geo,concrete);mesh.position.set(x,0,z);mesh.rotation.y=turn;mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);(g.userData.wallParts??=[]).push({mesh,w});}
for(let i=0;i<Math.floor(RACE_LENGTH/71)-1;i++){const g=new T.Group(),side=i%2?1:-1;brokenWall(g,5,2.8,-3,0);brokenWall(g,5,3.5,3,0);box(g,2,.6,.38,0,2.7,0,concrete);brokenWall(g,6,2.6,-5.5,-3,Math.PI/2);if(i%2)brokenWall(g,4,1.7,5.5,-2,Math.PI/2);for(let j=0;j<7;j++){const rubble=box(g,.4+j*.07,.25,.65,Math.sin(j*4)*5,.12,-1-j*.6,concrete);rubble.rotation.y=j;}
 const z=-70-i*71;g.position.set(roadside(z,side*(29+i%3*4)),0,z);g.updateMatrixWorld(true);for(const part of g.userData.wallParts){const center=part.mesh.localToWorld(new T.Vector3(0,0,.19));solids.push({x:center.x,z:center.z,hx:part.w/2,hz:.19,angle:-part.mesh.rotation.y});}delete g.userData.wallParts;batchStatic(g);scene.add(g);distant.push(g);}
for(let i=0;i<Math.floor(RACE_LENGTH/70)-1;i++){const z=-30-i*70,side=i%2?1:-1,x=roadside(z,side*22);let g;
 if(i%3===1){g=kitProp('lamp',6.6).g;g.children[0].rotation.set(side*.16,side>0?Math.PI:0,0);}
 else{g=new T.Group();strut(g,[0,0,0],[side*.8,4.8,0],.12,steel);strut(g,[side*.8,4.8,0],[side*-1.1,4.55,0],.075,steel);box(g,.55,.16,.3,side*-1.1,4.45,0,burnt);batchStatic(g);}
 g.position.set(x,0,z);scene.add(g);distant.push(g);solids.push({object:g,hx:.3,hz:.3});}

// Soft dust sprites instead of faceted spheres.
function softTexture(size=128,lumpy=false){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');const n=lumpy?7:1;for(let i=0;i<n;i++){const cx=size/2+(lumpy?(Math.random()-.5)*size*.35:0),cy=size/2+(lumpy?(Math.random()-.5)*size*.3:0),r=size*(lumpy?.22+Math.random()*.18:.5);const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(255,255,255,'+(lumpy?.55:1)+')');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,size,size);}const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
const puffTex=softTexture(64),cloudTex=softTexture(256,true);
const dust=[];for(let i=0;i<36;i++){const m=new T.Sprite(new T.SpriteMaterial({map:puffTex,color:0xd6bd93,transparent:true,opacity:0,depthWrite:false}));m.visible=false;scene.add(m);dust.push({m,life:0,vx:0,vz:0});}let dustIndex=0;
function puff(c){const p=dust[dustIndex++%(quality==='high'?36:18)];p.life=1;p.m.visible=true;p.m.position.set(c.x+(Math.random()-.5)*2.1,.4,c.z+2);p.m.scale.setScalar(.8+Math.random()*.6);p.vx=-c.vx*.15+(Math.random()-.5)*(1.5+Math.abs(c.slip)*8);p.vz=2+Math.random()*2;}
// The sandstorm: layered dust walls with billowing clouds along the front edge.
const stormWall=new T.Group();scene.add(stormWall);
const wallCanvas=document.createElement('canvas');wallCanvas.width=256;wallCanvas.height=128;{const w=wallCanvas.getContext('2d');const gr=w.createLinearGradient(0,0,0,128);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.35,'rgba(255,255,255,.75)');gr.addColorStop(1,'rgba(255,255,255,1)');w.fillStyle=gr;w.fillRect(0,0,256,128);w.globalCompositeOperation='destination-out';for(let i=0;i<70;i++){const x=Math.random()*256,y=Math.random()*70,r=8+Math.random()*24,g=w.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(0,0,0,.6)');g.addColorStop(1,'rgba(0,0,0,0)');w.fillStyle=g;w.fillRect(x-r,y-r,r*2,r*2);}}
const wallTex=new T.CanvasTexture(wallCanvas);wallTex.wrapS=T.RepeatWrapping;wallTex.colorSpace=T.SRGBColorSpace;
const wallLayers=[];for(let i=0;i<6;i++){const t=wallTex.clone();t.wrapS=T.RepeatWrapping;t.repeat.set(2.5,1);const m=new T.Mesh(new T.PlaneGeometry(240,18),new T.MeshBasicMaterial({map:t,color:i<2?0x9a6a3c:0x6f4a29,transparent:true,opacity:.6+i*.07,depthWrite:false,fog:false}));m.position.set(0,8.5,i*5);m.userData.base=m.material.opacity;stormWall.add(m);wallLayers.push(m);}
const clouds=[];for(let i=0;i<40;i++){const m=new T.Sprite(new T.SpriteMaterial({map:cloudTex,color:i%3?0x8f6036:0x6e4626,transparent:true,opacity:.95,depthWrite:false,fog:false}));stormWall.add(m);clouds.push({m,x:(i/40-.5)*120,y:.8+Math.random()*4,z:-STORM_EDGE*.7+Math.random()*9,s:6+Math.random()*7,ph:Math.random()*6});}

// Single draw call for all tyre marks.
const trackCount=240,trackPositions=new Float32Array(trackCount*18),trackGeo=new T.BufferGeometry();trackGeo.setAttribute('position',new T.BufferAttribute(trackPositions,3).setUsage(T.DynamicDrawUsage));const trackMesh=new T.Mesh(trackGeo,new T.MeshBasicMaterial({color:0x6b5a3f,transparent:true,opacity:.2,depthWrite:false,side:T.DoubleSide}));trackMesh.frustumCulled=false;trackMesh.userData.worldSpace=true;scene.add(trackMesh);let ti=0;
function track(c){for(const side of[-1,1]){const cx=c.x+side*Math.cos(c.yaw)*.8,cz=c.z+side*Math.sin(c.yaw)*.8,co=Math.cos(c.yaw),si=Math.sin(c.yaw),offset=(ti++%trackCount)*18;const corners=[[-.13,-.65],[.13,-.65],[.13,.65],[-.13,-.65],[.13,.65],[-.13,.65]];corners.forEach(([x,z],j)=>{trackPositions[offset+j*3]=cx+x*co-z*si;trackPositions[offset+j*3+1]=.012;trackPositions[offset+j*3+2]=cz+x*si+z*co;});}trackGeo.attributes.position.needsUpdate=true;}

// Lens pass: tilt-shift edges, a light colour grade and the storm's brown tint.
let rt=null;const postScene=new T.Scene(),postCam=new T.OrthographicCamera(-1,1,1,-1,0,1);
const post=new T.ShaderMaterial({uniforms:{map:{value:null},res:{value:new T.Vector2(1,1)},blurAmount:{value:1},storm:{value:0}},vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform sampler2D map;uniform vec2 res;uniform float blurAmount;uniform float storm;varying vec2 uvv;void main(){float nearBlur=1.-smoothstep(.0,.17,uvv.y);float farBlur=smoothstep(.83,1.,uvv.y);float b=max(nearBlur,farBlur)*5.*blurAmount;vec2 d=vec2(b)/res;vec4 c=vec4(0.);float total=0.;if(b<.1){c=texture2D(map,uvv);total=1.;}else for(int x=-1;x<=1;x++){for(int y=-1;y<=1;y++){vec2 q=vec2(float(x),float(y));float w=exp(-dot(q,q)*.48);c+=texture2D(map,uvv+q*d*.5)*w;total+=w;}}gl_FragColor=c/total;
#include <tonemapping_fragment>
#include <colorspace_fragment>
vec3 g=gl_FragColor.rgb;float l=dot(g,vec3(.299,.587,.114));g=mix(vec3(l),g,1.12);g=(g-.5)*1.1+.49;g*=vec3(1.03,1.,.93);
float s=storm*smoothstep(.55,0.,uvv.y)+storm*storm*.25;g=mix(g,vec3(.62,.45,.28)*(.75+.35*l),clamp(s,0.,.85));gl_FragColor=vec4(g,1.);}`});postScene.add(new T.Mesh(new T.PlaneGeometry(2,2),post));
let fpsCap=60;
function applyQuality(){const high=quality==='high';fpsCap=high?60:30;const size=high?2048:1024;if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}if(renderer.isWebGLRenderer){rt?.dispose();rt=new T.WebGLRenderTarget(1,1,{samples:high?4:0,type:T.HalfFloatType});post.uniforms.map.value=rt.texture;}for(const d of dust.slice(high?36:18)){d.life=0;d.m.visible=false;}resize();for(const input of document.querySelectorAll('input[name=quality]'))input.checked=input.value===quality;}
var menuDirty=true;function resize(){menuDirty=true;const w=innerWidth,h=innerHeight;const ratio=quality==='high'?Math.min(devicePixelRatio,1.5,Math.sqrt(2.4e6/(w*h))):Math.min(1,1280/w,900/h);renderer.setPixelRatio(ratio);renderer.setSize(w,h);if(rt){rt.setSize(Math.round(w*ratio),Math.round(h*ratio));post.uniforms.res.value.set(rt.width,rt.height);}camera.aspect=w/h;camera.updateProjectionMatrix();}addEventListener('resize',resize);

let audio,engine,engine2,gain,filter,wind,windGain,windPan,rumble,howls=[],radioBus,hiss,hissGain,musicGain;
function audioStart(){if(!audio){audio=new(window.AudioContext||window.webkitAudioContext)();// Engine: sawtooth plus a square an octave down, driven through a soft clipper for growl; the filter opens with revs.
 engine=audio.createOscillator();engine.type='sawtooth';engine2=audio.createOscillator();engine2.type='square';engine2.detune.value=-1200;const sub=audio.createGain();sub.gain.value=.35;
 const shaper=audio.createWaveShaper(),curve=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/511.5-1;curve[i]=Math.tanh(x*1.3);}shaper.curve=curve;
 gain=audio.createGain();gain.gain.value=0;filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=300;filter.Q.value=.9;
 engine.connect(shaper);engine2.connect(sub);sub.connect(shaper);shaper.connect(filter);filter.connect(gain);gain.connect(audio.destination);engine.start();engine2.start();
 // Storm wind: a low rumble plus two whistling bands, placed behind the listener and swirling around.
 wind=audio.createBufferSource();const b=audio.createBuffer(1,audio.sampleRate*3,audio.sampleRate),s=b.getChannelData(0);for(let i=0;i<s.length;i++)s[i]=Math.random()*2-1;wind.buffer=b;wind.loop=true;
 windGain=audio.createGain();windGain.gain.value=0;windPan=audio.createPanner();Object.assign(windPan,{panningModel:'HRTF',distanceModel:'inverse',refDistance:60,rolloffFactor:.2});windPan.positionZ.value=8;
 rumble=audio.createBiquadFilter();rumble.type='lowpass';rumble.frequency.value=160;const rg=audio.createGain();rg.gain.value=1.6;wind.connect(rumble);rumble.connect(rg);rg.connect(windGain);
 for(const [f,q,lvl] of [[380,9,.9],[640,14,.55]]){const bp=audio.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;const hg=audio.createGain();hg.gain.value=lvl;wind.connect(bp);bp.connect(hg);hg.connect(windGain);howls.push({bp,hg,f,lvl});}
 windGain.connect(windPan);windPan.connect(audio.destination);wind.start();
 // Cab radio: a narrow speaker band. Static hiss and Geiger-like crackle grow as the storm nears; music will play through it too.
 radioBus=audio.createGain();radioBus.gain.value=0;const hp=audio.createBiquadFilter(),lp=audio.createBiquadFilter(),body=audio.createBiquadFilter();hp.type='highpass';hp.frequency.value=320;lp.type='lowpass';lp.frequency.value=3000;body.type='peaking';body.frequency.value=1500;body.gain.value=5;body.Q.value=.8;
 radioBus.connect(hp);hp.connect(body);body.connect(lp);lp.connect(audio.destination);
 hiss=audio.createBufferSource();hiss.buffer=b;hiss.loop=true;hissGain=audio.createGain();hissGain.gain.value=0;const hf=audio.createBiquadFilter();hf.type='bandpass';hf.frequency.value=2200;hf.Q.value=.6;hiss.connect(hf);hf.connect(hissGain);hissGain.connect(radioBus);hiss.start();
 musicGain=audio.createGain();musicGain.gain.value=.3;musicGain.connect(radioBus);}audio.resume();}
// Louder, higher and closer behind you as the storm approaches; gusts and a slow swirl keep it alive.
// Radio static: clicks fall at random like a Geiger counter, a few per second far away, a dense rattle up close.
function crackleUpdate(on,prox,dt){if(!radioBus)return;const at=audio.currentTime;radioBus.gain.setTargetAtTime(on?volume:0,at,.1);hissGain.gain.setTargetAtTime(on?.004+prox**2*.05:0,at,.25);musicGain.gain.setTargetAtTime(.3*(1-prox*.55),at,.4);
 if(!on)return;const rate=.6+prox**2.2*38;let n=0;const expect=rate*dt;for(let k=0;k<6;k++)if(Math.random()<expect/6)n++;
 for(let k=0;k<n;k++){const t=at+.01+Math.random()*dt,s=noiseSource(),f=audio.createBiquadFilter(),g=audio.createGain(),big=Math.random()<.12+prox*.15,len=big?.02+Math.random()*.03:.002+Math.random()*.006;
  f.type='bandpass';f.frequency.value=1200+Math.random()*2600;f.Q.value=big?1.2:2.5;g.gain.setValueAtTime((big?.22:.12)*(.5+Math.random()*.5)*(.6+prox*.6),t);g.gain.exponentialRampToValueAtTime(.0001,t+len);
  s.connect(f);f.connect(g);g.connect(radioBus);s.start(t,Math.random()*.9);s.stop(t+len+.01);}}
// Music for the cab radio goes here: file names relative to the game, played quietly through the same speaker band.
const RADIO_TRACKS=['audio/radio.mp3'];let radioTrack=null;
function radioMusic(on){if(!RADIO_TRACKS.length||!musicGain)return;if(!radioTrack){radioTrack=new Audio(RADIO_TRACKS[0]);radioTrack.loop=true;radioTrack.crossOrigin='anonymous';audio.createMediaElementSource(radioTrack).connect(musicGain);}if(on&&radioTrack.paused)radioTrack.play().catch(()=>{});else if(!on&&!radioTrack.paused)radioTrack.pause();}
function windUpdate(on,prox,t){const at=audio.currentTime,gust=.7+.3*Math.sin(t*2.3)*Math.sin(t*.61)+.1*Math.sin(t*5.7);windGain.gain.setTargetAtTime(on?(.012+prox**1.6*.3)*gust*volume:0,at,.15);
 const r=2+prox*2,swirl=t*(.6+prox*.9);windPan.positionX.setTargetAtTime(Math.sin(swirl)*r,at,.1);windPan.positionZ.setTargetAtTime(1.5+(1-prox)*14+Math.cos(swirl*.7)*1.2,at,.1);
 rumble.frequency.setTargetAtTime(120+prox*160,at,.2);for(const [i,h] of howls.entries()){h.bp.frequency.setTargetAtTime(h.f*(.85+prox*.45)+Math.sin(t*(.9+i*.6)+i)*90+Math.sin(t*2.7+i*2)*35,at,.08);h.hg.gain.setTargetAtTime(h.lvl*(.3+prox*.9)*(.6+.4*Math.sin(t*1.3+i*1.7)),at,.1);}}
// No beeps: every sound is a physical thud, a hiss or an engine.
let noiseBuffer=null;function noiseSource(){if(!noiseBuffer){noiseBuffer=audio.createBuffer(1,audio.sampleRate,audio.sampleRate);const d=noiseBuffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}const s=audio.createBufferSource();s.buffer=noiseBuffer;return s;}
function sfxOk(){return audio&&!muted&&volume>0;}
function env(node,t,peak,attack,decay){node.gain.setValueAtTime(.0001,t);node.gain.exponentialRampToValueAtTime(peak,t+attack);node.gain.exponentialRampToValueAtTime(.0001,t+attack+decay);}
function lowThud(t,from,to,peak,decay){const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+decay);env(g,t,peak,.008,decay);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+decay+.05);}
function noiseHit(t,type,freq,q,peak,decay,offset=0){const s=noiseSource(),f=audio.createBiquadFilter(),g=audio.createGain();f.type=type;f.frequency.value=freq;f.Q.value=q;env(g,t,peak,.005,decay);s.connect(f);f.connect(g);g.connect(audio.destination);s.start(t,offset);s.stop(t+decay+.05);}
// Something heavy dropped into a steel van: a dull knock with a hollow metal ring.
function loadSound(){if(!sfxOk())return;const t=audio.currentTime,v=volume;lowThud(t,110,48,.32*v,.22);noiseHit(t,'lowpass',520,.7,.22*v,.12);noiseHit(t,'bandpass',190,14,.5*v,.45,.3);noiseHit(t+.02,'bandpass',310,18,.22*v,.3,.6);}
// Bumper against bumper: deep and short.
function pushSound(){if(!sfxOk())return;const t=audio.currentTime,v=volume;lowThud(t,80,34,.45*v,.28);noiseHit(t,'lowpass',380,.8,.32*v,.18);noiseHit(t,'bandpass',140,8,.25*v,.35,.2);}
// Nitro valve: a short pressurised hiss.
function hissSound(){if(!sfxOk())return;const t=audio.currentTime,v=volume;noiseHit(t,'highpass',2400,.6,.12*v,.5);noiseHit(t,'bandpass',900,1.2,.08*v,.35,.4);}
// Four engines cranking up one after another, revving and settling to idle.
function startEngines(){if(!sfxOk())return;const t0=audio.currentTime+.05;[52,57,49,61].forEach((base,i)=>{const t=t0+i*.22,o=audio.createOscillator(),o2=audio.createOscillator(),f=audio.createBiquadFilter(),g=audio.createGain();o.type='sawtooth';o2.type='square';f.type='lowpass';f.Q.value=3;
 for(const osc of[o,o2]){osc.frequency.setValueAtTime(base*.45,t);osc.frequency.exponentialRampToValueAtTime(base*2.6,t+.5);osc.frequency.exponentialRampToValueAtTime(base*1.5,t+1.2);osc.frequency.exponentialRampToValueAtTime(base*1.15,t+2.6);}o2.detune.value=-1200+i*7;
 f.frequency.setValueAtTime(180,t);f.frequency.exponentialRampToValueAtTime(900,t+.5);f.frequency.exponentialRampToValueAtTime(320,t+2.6);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.07*volume,t+.12);g.gain.setTargetAtTime(.05*volume,t+.6,.3);g.gain.exponentialRampToValueAtTime(.0001,t+3.2);
 o.connect(f);o2.connect(f);f.connect(g);g.connect(audio.destination);o.start(t);o2.start(t);o.stop(t+3.3);o2.stop(t+3.3);lowThud(t,60,30,.18*volume,.35);noiseHit(t,'lowpass',300,.7,.08*volume,.6);});}
function say(s){$('status').textContent=s;toast=2;}
let lastImpact=-1,impactBuffer;
function impactSound(strength=8,distance=0){if(!audio||muted||volume===0||audio.currentTime-lastImpact<.09||distance>35)return;lastImpact=audio.currentTime;const t=audio.currentTime,level=clamp(strength/20,.12,1)*volume*.22/(1+distance*.08);if(!impactBuffer){impactBuffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*.22),audio.sampleRate);const samples=impactBuffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/samples.length*5);}
 const source=audio.createBufferSource(),tone=audio.createBiquadFilter(),envelope=audio.createGain();source.buffer=impactBuffer;tone.type='bandpass';tone.frequency.value=850;tone.Q.value=.7;envelope.gain.setValueAtTime(level,t);envelope.gain.exponentialRampToValueAtTime(.0001,t+.22);source.connect(tone);tone.connect(envelope);envelope.connect(audio.destination);source.start(t);source.onended=()=>{source.disconnect();tone.disconnect();envelope.disconnect();};
 const thud=audio.createOscillator(),low=audio.createGain();thud.type='triangle';thud.frequency.setValueAtTime(145,t);thud.frequency.exponentialRampToValueAtTime(42,t+.16);low.gain.setValueAtTime(level*1.4,t);low.gain.exponentialRampToValueAtTime(.0001,t+.18);thud.connect(low);low.connect(audio.destination);thud.start(t);thud.stop(t+.2);thud.onended=()=>{thud.disconnect();low.disconnect();};}
const shared=new Set([woodMat,slatMat,steel,rubber,rust,fuelMat,sand,nitroMat,chromeSupply,labelMat,poolMat,poolInner,rockMat,tarpMat,ropeMat,zoneFuel,zoneNitro,ringMat,beamMat,...sharedKitMaterials]),sharedGeo=new Set([beamGeo,crateGeo,slatGeo,zoneGeo,...sharedKitGeometries]);
function disposeRaceObject(g){scene.remove(g);const materials=new Set(),geometries=new Set();g.traverse(o=>{if(o.isMesh){if(!sharedGeo.has(o.geometry))geometries.add(o.geometry);if(!shared.has(o.material))materials.add(o.material);}});geometries.forEach(a=>a.dispose());materials.forEach(a=>a.dispose());}

// Caravan formation: three partners lead, the player is the rear guard.
const START=[[0,0],[-6,-16],[6,-19],[0,-33]];let TOTAL=0,nextStuck=0,nextDrop=0;
function reset(){menuDirty=true;for(const m of models)disposeRaceObject(m.g);for(const p of pits)disposeRaceObject(p.g);for(const f of fuels)disposeRaceObject(f.g);releaseLoose();loose=[];
 cars=START.map(([x,z],i)=>loadCargo(vehicle(i,x,z,'pickup'),i?CARGO_SLOTS:PLAYER_START_CARGO));TOTAL=caravanCargo(cars);cars[0].freeTurn=true;nextStuck=8;nextDrop=4.5;models=cars.map((c,i)=>makeCar(paints[i]));cars.forEach((c,i)=>{c.loadFactor=loadFactor(c);c.cooldown=0;syncCargo(models[i],c);});
 storm=createStorm();const course=createCourse();pits=course.obstacles.map(makeObstacle);fuels=course.supplies.map(makeSupply);finishCount=0;watching=false;trackPositions.fill(0);trackGeo.attributes.position.needsUpdate=true;ti=0;for(const p of dust){p.life=0;p.m.visible=false;}
 time=0;acc=0;ended=false;paused=false;$('modal').hidden=true;$('status').textContent='';$('sink').style.display='none';$('boost').hidden=true;}
function start(){reset();playing=true;audioStart();startEngines();$('menu').hidden=true;$('footer').hidden=true;$('hud').hidden=false;$('pause').hidden=false;document.body.classList.add('playing');audioStart();clearSteering();}
let rosterMarkup='';function updateRaceHud(){const total=caravanCargo(cars);const value=total+'<span>из '+TOTAL+'</span>';if($('alive').innerHTML!==value)$('alive').innerHTML=value;
 const markup=cars.map(a=>`<div style="opacity:${a.dead?.45:1}"><i style="background:${paints[a.id]}"></i><b>${names[a.id]}</b><span class="${a.stuck?'stuck':a.finished?'done':''}">${a.dead?'Буря':a.finished?'В посёлке '+a.delivered:a.stuck?'Застрял':a.cargo.length}</span></div>`).join('');if(markup!==rosterMarkup){$('roster').innerHTML=markup;rosterMarkup=markup;}}
function finish(){updateRaceHud();ended=true;playing=false;watching=false;clearSteering();document.body.classList.remove('stormy');const arrived=cars.filter(c=>c.finished).length,delivered=cars.reduce((n,c)=>n+(c.finished?c.delivered:0),0);
 $('modal').hidden=false;$('resultLabel').hidden=true;$('resultDetail').hidden=false;$('settings').hidden=true;
 $('resultTitle').innerHTML=arrived===0?'Буря забрала<br>караван':arrived===4?'Караван<br>дошёл':'Дошли<br>не все';
 $('resultDetail').innerHTML=`<span>Доехали<b>${arrived} из 4</b></span><span>Груз в посёлке<b>${delivered} из ${TOTAL}</b></span><span>Ты вытолкнул<b>${cars[0].rescues}</b></span><span>Ты подобрал<b>${cars[0].catches}</b></span>`;
 $('again').textContent='Ещё заезд';$('pause').hidden=true;$('again').focus();}
function pause(){if(ended||!playing)return;paused=!paused;if(paused&&gain){gain.gain.setTargetAtTime(0,audio.currentTime,.05);windGain.gain.setTargetAtTime(0,audio.currentTime,.05);}$('modal').hidden=!paused;if(paused){$('resultLabel').hidden=true;$('resultTitle').innerHTML='Переведи<br>дух';$('resultDetail').hidden=true;$('settings').hidden=false;$('settings').open=false;$('again').textContent='Продолжить';$('again').focus();}else{$('pause').focus();}keys.clear();clearSteering();}
function updateSound(){const enabled=!muted&&volume>0;$('sound').setAttribute('aria-label',enabled?'Выключить звук':'Включить звук');$('sound').setAttribute('aria-pressed',String(enabled));$('sound').classList.toggle('muted',!enabled);}
$('volume').oninput=e=>{volume=Number(e.target.value)/100;muted=volume===0;updateSound();};
$('blur').onchange=e=>{post.uniforms.blurAmount.value=e.target.checked?1:0;document.body.classList.toggle('no-blur',!e.target.checked);menuDirty=true;};
for(const input of document.querySelectorAll('input[name=quality]'))input.addEventListener('change',()=>{quality=input.value;try{localStorage.setItem('neverstop-quality',quality);}catch{}applyQuality();});
$('start').onclick=start;$('again').onclick=()=>paused?pause():start();$('pause').onclick=pause;$('home').onclick=()=>{playing=false;paused=false;ended=false;$('modal').hidden=true;$('hud').hidden=true;$('pause').hidden=true;$('menu').hidden=false;$('footer').hidden=false;document.body.classList.remove('playing','lowfuel','stormy');reset();};$('sound').onclick=()=>{muted=!muted;if(!muted&&volume===0){volume=.7;$('volume').value=70;}updateSound();};
for(const [id,value] of [['gas',1],['brake',-1]]){const b=$(id);b.addEventListener('pointerdown',e=>{if(!playing||paused||ended)return;e.preventDefault();e.stopPropagation();pedals.set(e.pointerId,value);b.setPointerCapture(e.pointerId);b.classList.add('held');});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,e=>{pedals.delete(e.pointerId);b.classList.toggle('held',[...pedals.values()].includes(value));});}
function clearSteering(){steeringPointers.clear();pedals.clear();$('gas').classList.remove('held');$('brake').classList.remove('held');touch=0;$('left').classList.remove('held');$('right').classList.remove('held');}
function updateSteering(){touch=steeringPointers.size?[...steeringPointers.values()].at(-1):0;$('left').classList.toggle('held',touch<0);$('right').classList.toggle('held',touch>0);}
document.addEventListener('pointerdown',e=>{if(!playing||paused||ended||e.button!==0)return;const button=e.target.closest('button');if(button&&button.id!=='left'&&button.id!=='right')return;if(e.target.closest('#pedals'))return;if(e.target.closest('input,summary,details,a'))return;e.preventDefault();const side=button?.id==='left'?-1:button?.id==='right'?1:e.clientX<innerWidth/2?-1:1;steeringPointers.set(e.pointerId,side);document.body.setPointerCapture(e.pointerId);updateSteering();});
document.addEventListener('pointermove',e=>{if(!steeringPointers.has(e.pointerId))return;steeringPointers.set(e.pointerId,e.clientX<innerWidth/2?-1:1);updateSteering();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(event,e=>{steeringPointers.delete(e.pointerId);updateSteering();});
addEventListener('keydown',e=>{if(e.target.matches('input,summary'))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat&&(e.code==='Escape'||e.code==='KeyP'))pause();});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();clearSteering();if(playing&&!paused)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused)pause();});
const pedals=new Map();
function throttleInput(){let v=(keys.has('ArrowUp')||keys.has('KeyW')?1:0)-(keys.has('ArrowDown')||keys.has('KeyS')?1:0);for(const p of pedals.values())v+=p;const gp=navigator.getGamepads?.()[0];if(gp)v+=(gp.buttons[7]?.value||0)-(gp.buttons[6]?.value||0);return clamp(v,-1,1);}
function control(){let v=touch+(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);const gp=navigator.getGamepads?.()[0];if(gp&&Math.abs(gp.axes[0])>.22)v+=gp.axes[0];return clamp(v,-1,1);}
// Caravan partners hold a lane, refuel when low and keep clear of other pickups.
// With ?debug autopilot the player's pickup plays the rear guard: stuck partners first, then loose cargo.
const LANE=[0,-6,6,0];
// Targets are lateral offsets from the road centre at their own distance, so they stay valid on bends.
function ai(c){const lat=o=>o.x-roadCenter(o.z),my=lat(c);let off=LANE[c.id]+Math.sin(time*.35+c.id*2)*2.5,best=Infinity;
 if(c.fuel<c.spec.capacity*.8)for(const f of fuels){const dz=c.z-f.z;if(f.active&&f.kind==='fuel'&&dz>4&&dz<70){const score=dz+Math.abs(lat(f)-my)*2;if(score<best){best=score;off=lat(f);}}}
 if(c.id===0){best=Infinity;for(const o of cars){const dz=c.z-o.z;if(o.stuck&&!o.dead&&dz>0&&dz<70&&dz<best){best=dz;off=lat(o);}}if(best===Infinity&&c.cargo.length<CARGO_SLOTS)for(const it of loose){const dz=c.z-it.z;if(it.active&&dz>3&&dz<45){const score=dz*.6+Math.abs(lat(it)-my)*1.6;if(score<best){best=score;off=lat(it);}}}}
 for(const o of cars){if(o===c||o.dead||o.finished||(c.id===0&&o.stuck))continue;const dz=c.z-o.z,dx=lat(o)-my;if(dz>-3&&dz<14&&Math.abs(dx)<4.5){off=lat(o)+(dx>0?-6:6);break;}}
 for(const p of pits){const dz=c.z-p.z,po=lat(p);if(p.kind!=='dune'&&dz>0&&dz<24&&Math.abs(off-po)<p.r+2.5){off=po+(my>po?1:-1)*(p.r+4);break;}}
 off=clamp(off,-12,12);
 // Feed-forward the road heading, then correct the lateral error.
 const s=(roadCenter(c.z-9)-roadCenter(c.z-7))/2,err=roadCenter(c.z)+off-c.x,desired=clamp(Math.atan(s)+clamp(err*.09,-.5,.5),-1.05,1.05);return clamp((desired-c.yaw)*2.4-c.yawRate*1.1,-1,1);}
function lose(c,count){if(count<=0||c.cooldown>0||!c.cargo.length)return;c.cooldown=.6;const dropped=dropCargo(c,count,loose);for(const it of dropped)it.entry=looseMesh(it.kind);c.loadFactor=loadFactor(c);if(c.id===0&&!watching)say(dropped.length>1?'Выпало '+dropped.length+' места груза':'Груз выпал из кузова');}
function freeLoose(it){if(it.entry){it.entry.used=false;it.entry.m.visible=false;it.entry=null;}}
// Trouble ahead for the rear guard: a partner bogs down, or a load works loose.
function incidents(dt){if(watching||cars[0].dead)return;nextStuck-=dt;nextDrop-=dt;
 if(nextStuck<=0){const c=incidentCandidate(cars,cars[0]);if(c){stickCar(c);say(names[c.id]+' застрял, толкни его');toast=3;nextStuck=14+Math.random()*7;}else nextStuck=1.5;}
 if(nextDrop<=0){const c=incidentCandidate(cars.filter(o=>o.cargo.length>3),cars[0]);if(c){c.cooldown=0;lose(c,1);say(names[c.id]+' потерял груз, подбери');nextDrop=10+Math.random()*5;}else nextDrop=1.5;}}
function tick(dt){if(time===0)say('Ты замыкаешь караван, буря позади');time+=dt;for(const c of cars){c.prevX=c.x;c.prevZ=c.z;c.cooldown=Math.max(0,c.cooldown-dt);}const previous=cars.map(c=>c.z);for(const c of cars){const own=!c.id&&!autopilot;step(c,dt,pits,own?control():ai(c),own?throttleInput():0);holdStuck(c,dt);}
 for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const a=cars[i],b=cars[j],strength=Math.hypot(a.vx-b.vx,a.vz-b.vz);
  if(Math.hypot(a.x-b.x,a.z-b.z)<2.95&&(a.stuck||b.stuck)){const helper=a.stuck?b:a,stuck=a.stuck?a:b;if(tryRescue(helper,stuck,strength)){collide(a,b);stuck.vz=Math.min(stuck.vz,-11);if(helper.id===0){pushSound();say(names[stuck.id]+' снова в пути');}continue;}}
  if(collide(a,b)){impactSound(strength,Math.hypot(a.x-cars[0].x,a.z-cars[0].z));const n=a.id&&b.id?0:cargoForImpact(strength);lose(a,n);lose(b,n);}}
 for(const c of cars)for(const solid of solids){const impact=collideSolid(c,solid);if(impact>1){impactSound(impact,Math.hypot(c.x-cars[0].x,c.z-cars[0].z));lose(c,cargoForImpact(impact));}}

 {const me=cars[0],sp=Math.hypot(me.vx,me.vz);if(!me.dead&&!me.finished){if(me.duneDepth>.3&&!me.onDune&&sp>8){me.cooldown=0;lose(me,sp>17?2:1);}me.onDune=me.duneDepth>.12;}}
 const lostBefore=cars.map(c=>c.dead);stepStorm(storm,cars,dt,time);cars.forEach((c,i)=>{if(c.dead&&!lostBefore[i]&&i&&!watching){say('Буря забрала '+names[i]);}});
 incidents(dt);stepLoose(loose,storm,dt);for(const it of loose)if(!it.active)freeLoose(it);
 finishCount=finishCrossings(cars,previous,time,dt,finishCount);for(const c of cars)deliver(c);
 for(const c of cars){for(const f of fuels)if(pickup(c,f)){f.g.visible=false;if(c.id===0&&!watching){f.kind==='nitro'?hissSound():loadSound();}}
  for(const it of loose)if(grabCargo(c,it)){c.loadFactor=loadFactor(c);freeLoose(it);if(c.id===0&&!watching){say(it.owner?'Груз '+names[it.owner]+' у тебя':'Груз подобран');loadSound();}}}
 loose=loose.filter(it=>it.active);
 for(let i=0;i<4;i++)syncCargo(models[i],cars[i]);
 if(cars.every(c=>c.dead||c.finished)){finish();return;}
 // When the player is out, keep watching the rest of the caravan.
 if(!watching&&(cars[0].dead||cars[0].finished)){watching=true;clearSteering();$('status').textContent=cars[0].finished?'Ты в посёлке, ждём остальных':'Тебя накрыла буря, караван ещё в пути';toast=4;}
}
function focusCar(){if(!watching)return cars[0];let f=null;for(const c of cars)if(!c.dead&&!c.finished&&(!f||c.z>f.z))f=c;return f||cars[0];}
if(location.search.includes('debug'))window.__ns={rc:roadCenter,T,scene,camera,get cars(){return cars},get models(){return models},get storm(){return storm},renderer,post,set view(v){debugView=v},press(code,on=true){on?keys.add(code):keys.delete(code)},sim(seconds,auto=true){autopilot=auto;for(let t=0;t<seconds*60&&playing;t++)tick(1/60);return {time:+time.toFixed(1),storm:+storm.z.toFixed(0),cars:cars.map(c=>({z:+c.z.toFixed(0),cargo:c.cargo.length,dead:c.dead,fin:c.finished,del:c.delivered,fuel:+c.fuel.toFixed(0),lost:c.lostCargo,stuck:c.stuck,resc:c.rescues,catch:c.catches})),loose:loose.length,swallowed:storm.swallowed}}};let autopilot=false;let debugView=null;
const helpTags=[null,1,2,3].map(i=>{if(!i)return null;const d=document.createElement('div');d.className='helptag';d.hidden=true;d.textContent='Толкни';$('hud').appendChild(d);return d;});
let last=performance.now(),lastHud=0,frame=0;applyQuality();reset();camera.position.set(24,35,36);const look=new T.Vector3(),camTarget=new T.Vector3(),fogBase=new T.Color(SKY),fogStorm=new T.Color('#9f774c');
function render(now){requestAnimationFrame(render);if(document.hidden||paused||ended||(!playing&&!menuDirty)){last=now;return;}const interval=1000/(playing?fpsCap:10);if(now-last<interval-1)return;let dt=Math.min(.1,(now-last)/1000);last=now;frame++;
 if(playing&&!paused){acc+=dt*(watching?2:1);while(acc>=1/60&&playing){tick(1/60);acc-=1/60;}}
 const c=focusCar(),narrow=innerWidth<650,active=playing||ended;const viewZ=active?c.z:0;
 if(active){camTarget.set(c.x,narrow?50:40,viewZ+44);if(camera.position.distanceTo(camTarget)>60)camera.position.copy(camTarget);else camera.position.lerp(camTarget,1-Math.exp(-dt*(watching?2.5:4)));}else camera.position.set(26+Math.sin(now*.00006)*4,30,29);
 look.set(active?c.x:3,0,viewZ-(narrow?8:5));camera.lookAt(look);
 sun.position.set(c.x-40,26,viewZ+22);sun.target.position.set(c.x,0,viewZ-14);fill.position.set(c.x+30,25,viewZ-40);fill.target.position.set(c.x,0,viewZ);
 for(const g of grounds){let moved=false;while(g.position.z>viewZ+220){g.position.z-=720;moved=true;}while(g.position.z<viewZ-500){g.position.z+=720;moved=true;}if(moved){g.position.x=roadCenter(g.position.z);shapeGround(g);}}
 for(const p of props){p.visible=p.position.z>viewZ-150&&p.position.z<viewZ+65;if(p.position.z>viewZ+80)p.position.z=viewZ-550-Math.random()*80;if(p.position.z<viewZ-700)p.position.z=viewZ+70;p.position.x=roadside(p.position.z,p.userData.roadOffset);}
 for(const g of distant)g.visible=Math.abs(g.position.z-viewZ)<120;oasis.visible=Math.abs(oasis.position.z-viewZ)<170;for(const p of pits)p.g.visible=Math.abs(p.z-viewZ)<150;for(const f of fuels)f.g.visible=f.active&&Math.abs(f.z-viewZ)<150;
 // The storm wall follows the road and churns; it tints the frame as it closes in.
 const sz=active?storm.z:60;stormWall.position.set(roadCenter(sz),0,sz);stormWall.visible=sz-viewZ<90;const outside=active?clamp((storm.z-c.z+2)/10,0,1):1;for(let i=0;i<wallLayers.length;i++){const w=wallLayers[i];w.material.map.offset.x=now*.00002*(i%2?1:-1.4)+i*.17;w.material.opacity=w.userData.base*outside;w.visible=outside>.01;}
 for(const q of clouds){const t=now*.001+q.ph;q.m.position.set(q.x+Math.sin(t*.4)*3,q.y+Math.sin(t*.7)*1.2,q.z+Math.sin(t*.5)*1.5);q.m.scale.setScalar(q.s*(1+Math.sin(t*.6)*.08));q.m.material.rotation=t*.05;}
 const near=active?clamp(1-(storm.z-c.z-8)/26,0,1):0;scene.fog.density=.0042+near*.004+(watching?0:cars[0].cover||0)*.012;scene.fog.color.copy(fogBase).lerp(fogStorm,near*.45);scene.background.copy(scene.fog.color);const veil=watching?0:cars[0].cover||0;post.uniforms.storm.value=near*.5+(c.stormDepth||0)*.3+veil*.5;$('dustveil').style.opacity=(veil**1.3).toFixed(3);document.body.classList.toggle('stormy',near>.55&&playing);
 for(let i=0;i<cars.length;i++){const a=cars[i],m=models[i],sp=Math.hypot(a.vx,a.vz);m.g.position.set(a.x,a.groundHeight-a.sink*.5-a.slow*.2,a.z);m.g.rotation.y=-a.yaw;m.body.rotation.z+=(-a.lateralAccel*.012-m.body.rotation.z)*(1-Math.exp(-dt*8));m.body.rotation.x=a.terrainPitch+Math.sin(now*.012+i)*.012*(sp/20);for(const w of m.wheels){w.pivot.rotation.y=w.front?-a.steer*.4:0;if(playing&&!paused)w.wheel.rotateX(-(a.stuck?22:sp)*dt*2);}if(a.stuck&&playing&&!paused&&frame%2===0)puff(a);
  for(let k=0;k<m.slots.length;k++)m.slots[k].position.y=BED[k][1]+Math.max(0,Math.sin(now*.02+k*1.3))*.025*(sp/20);
  if(playing&&!paused&&!a.dead&&!a.finished){if(frame%(fpsCap>30?3:2)===0||Math.abs(a.slip)>.15)puff(a);if(frame%(fpsCap>30?4:3)===0)track(a);}}
 for(const it of loose)if(it.entry){const m=it.entry.m;m.position.set(it.x,0,it.z);m.rotation.y=it.yaw;m.visible=Math.abs(it.z-viewZ)<120;}
 for(const f of fuels)if(f.active&&f.g.visible){f.item.rotation.y=now*.001;f.item.position.y=Math.sin(now*.003+f.z)*.08;}
 for(const p of dust)if(p.life>0&&!paused){p.life-=dt*.7;p.m.position.x+=p.vx*dt;p.m.position.z+=p.vz*dt;p.m.position.y+=dt*.9;p.m.scale.addScalar(dt*2.4);p.m.material.opacity=Math.max(0,p.life*.32);if(p.life<=0)p.m.visible=false;}
 if(debugView)debugView(camera,now);camera.updateMatrixWorld(true);
 for(let i=1;i<4;i++){const tag=helpTags[i],a=cars[i];if(!(playing&&!watching&&a.stuck&&!a.dead)){tag.hidden=true;continue;}const p=models[i].g.position.clone().add(new T.Vector3(0,3.2,0)).project(camera);tag.hidden=p.z>1;tag.style.left=clamp((p.x*.5+.5)*innerWidth,48,innerWidth-48)+'px';tag.style.top=clamp((-p.y*.5+.5)*innerHeight,128,innerHeight-150)+'px';tag.classList.toggle('urgent',storm.z-a.z<STORM_EDGE+8);}

 const me=cars[0];if(active&&now-lastHud>=100){lastHud=now;$('fuelMeter').setAttribute('aria-valuenow',String(Math.ceil(me.fuel/me.spec.capacity*100)));$('fuelBar').style.width=(me.fuel/me.spec.capacity*100)+'%';document.body.classList.toggle('lowfuel',me.fuel/me.spec.capacity<.25&&!watching);$('speed').textContent=Math.round(Math.hypot(c.vx,c.vz)*3.6);document.body.classList.toggle('reversing',!watching&&(me.vx*Math.sin(me.yaw)-me.vz*Math.cos(me.yaw))<-.5);$('distance').textContent='До посёлка '+(Math.max(0,RACE_LENGTH+c.z)/1000).toFixed(2).replace('.',',')+' км';
  
  $('boost').hidden=me.boost<=0||watching;$('boost').textContent='Нитро '+Math.ceil(me.boost)+' с';updateRaceHud();const cover=me.cover||0;$('sink').style.display=!watching&&(me.sink>.15||cover>.02)?'block':'none';$('sinkTitle').textContent=cover>.02?'Выбирайся из бури':'Не останавливайся';$('sinkNote').textContent=cover>.02?'Буря затягивает':'Песок затягивает';$('sinkBar').style.width=(Math.max(me.sink/3.8,cover)*100)+'%';}
 if(toast>0&&!paused){toast-=dt;if(toast<=0)$('status').textContent='';}
 if(gain){const on=playing&&!paused&&!muted;{const sp=Math.hypot(me.vx,me.vz),gear=(sp%9)/9,rpm=42+sp*1.7+gear*14+(throttleInput()>0?8:0),at=audio.currentTime;gain.gain.setTargetAtTime(on&&!watching&&!me.dead&&!me.finished?(.035+Math.min(1,sp/25)*.02)*volume:0,at,.1);engine.frequency.setTargetAtTime(rpm,at,.08);engine2.frequency.setTargetAtTime(rpm,at,.08);filter.frequency.setTargetAtTime(220+sp*14+(throttleInput()>0?120:0),at,.15);}{const gap=storm.z-me.z,prox=watching?.25:clamp(1-(gap-6)/55,0,1)*.85+(me.cover||0)*.15+(me.stormDepth>0?.15:0);windUpdate(on,Math.min(1,prox),now/1000);crackleUpdate(on,Math.min(1,prox),dt);radioMusic(on);}}
 menuDirty=false;renderer.shadowMap.autoUpdate=quality==='high'||frame%2===0||!playing;
 if(!renderer.isWebGLRenderer){renderer.setRenderTarget(null);renderer.render(scene,camera);}else{renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(postScene,postCam);}}
$('start').disabled=false;$('start').textContent='В путь';requestAnimationFrame(render);
