import {makeRoute} from './route.js?v=9';
import {batchStatic} from './render-utils.js?v=7';
import {RACE_LENGTH,createCourse,contour,finishCrossings,raceOrder} from './course.js?v=7';
import * as T from './three.js';
import {SoftwareRenderer} from './software.js?v=9';
import{vehicle,step,collide,collideSolid,pickup,clamp}from './physics.js?v=9';
const $=id=>document.getElementById(id);let renderer;try{renderer=new T.WebGLRenderer({canvas:$('world'),antialias:true,powerPreference:'high-performance'});}catch(e){renderer=new SoftwareRenderer($('world'));document.querySelector('.tag').textContent='ОБЛЕГЧЁННАЯ ГРАФИКА';}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
document.body.classList.toggle('gpu',!!renderer.isWebGLRenderer);
const solids=[];const distant=[];const scene=new T.Scene();scene.background=new T.Color('#cbb996');scene.fog=new T.FogExp2('#cbb996',.006);const camera=new T.PerspectiveCamera(38,1,.2,300);scene.add(new T.HemisphereLight(0xc5d5e1,0x9d815b,1.05));const sun=new T.DirectionalLight(0xffe5bc,3.3);sun.position.set(-35,55,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-55,right:55,top:65,bottom:-65,near:1,far:150});sun.shadow.bias=-.00015;sun.shadow.normalBias=.045;sun.shadow.radius=4;scene.add(sun);scene.add(sun.target);const fill=new T.DirectionalLight(0xb8d4ed,.4);fill.position.set(30,25,-40);scene.add(fill);scene.add(fill.target);
// Soft sky reflections bring out glass, panel bevels and metal trim.
const skyCanvas=document.createElement('canvas');skyCanvas.width=512;skyCanvas.height=256;const skyCtx=skyCanvas.getContext('2d'),skyGradient=skyCtx.createLinearGradient(0,0,0,256);skyGradient.addColorStop(0,'#9db8ce');skyGradient.addColorStop(.46,'#e6ded0');skyGradient.addColorStop(.53,'#c1ab86');skyGradient.addColorStop(1,'#736048');skyCtx.fillStyle=skyGradient;skyCtx.fillRect(0,0,512,256);const skyMap=new T.CanvasTexture(skyCanvas);skyMap.mapping=T.EquirectangularReflectionMapping;skyMap.colorSpace=T.SRGBColorSpace;scene.environment=skyMap;scene.environmentIntensity=.65;
const mat=(color,roughness=1,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});const sand=mat('#d0bd97'),rubber=mat('#252722'),steel=mat('#454339',.65,.5),glass=mat('#283c3c',.4,.5),rust=mat('#704c35',.9,.2),fuelMat=mat('#ed7430',.65,.3);const paints=['#b7c8bf','#ab4934','#bd9648','#6a777c'];
const sandCanvas=document.createElement('canvas');sandCanvas.width=sandCanvas.height=512;const sc=sandCanvas.getContext('2d');sc.fillStyle='#c0a77f';sc.fillRect(0,0,512,512);for(let i=0;i<28000;i++){const x=Math.random()*512,y=Math.random()*512;sc.fillStyle=i%2?'rgba(65,48,24,.08)':'rgba(255,238,198,.12)';sc.fillRect(x,y,1+Math.random()*2,1);}for(let i=0;i<95;i++){sc.strokeStyle='rgba(110,86,51,.04)';sc.beginPath();const y=i*6;for(let x=0;x<512;x+=8)sc.lineTo(x,y+Math.sin(x*.03+i)*2);sc.stroke();}const sandTexture=new T.CanvasTexture(sandCanvas);sandTexture.wrapS=sandTexture.wrapT=T.RepeatWrapping;sandTexture.repeat.set(12,12);sandTexture.colorSpace=T.SRGBColorSpace;sand.map=sandTexture;sand.bumpMap=sandTexture;sand.bumpScale=.22;sandTexture.anisotropy=8;
function box(g,w,h,d,x,y,z,m){const a=new T.Mesh(new T.BoxGeometry(w,h,d),m);a.position.set(x,y,z);a.castShadow=true;a.receiveShadow=true;g.add(a);return a;}
// Bevelled panels and tapered glazing keep the cars readable as small-scale models.
function panel(g,w,h,d,x,y,z,m,r=.07){
 const shape=new T.Shape(),hx=w/2-r,hy=h/2-r;
 shape.moveTo(-hx-r,-hy);shape.lineTo(-hx-r,hy);shape.quadraticCurveTo(-hx-r,hy+r,-hx,hy+r);shape.lineTo(hx,hy+r);shape.quadraticCurveTo(hx+r,hy+r,hx+r,hy);shape.lineTo(hx+r,-hy);shape.quadraticCurveTo(hx+r,-hy-r,hx,-hy-r);shape.lineTo(-hx,-hy-r);shape.quadraticCurveTo(-hx-r,-hy-r,-hx-r,-hy);
 const geo=new T.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r*.45,bevelSegments:2,steps:1,curveSegments:3});geo.translate(0,0,-d/2+r);
 const mesh=new T.Mesh(geo,m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;
}
function strut(g,a,b,r,m){const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from);const mesh=new T.Mesh(new T.CylinderGeometry(r,r,delta.length(),6),m);mesh.position.copy(from.add(to).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());mesh.castShadow=true;g.add(mesh);return mesh;}
function glazing(g,points,m){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();const mesh=new T.Mesh(geo,m);g.add(mesh);return mesh;}
function makeCar(color,variant=0){
 const g=new T.Group(),body=new T.Group();g.add(body);g.userData.car=true;
 const paint=mat(color,.48,.42),trim=mat('#655e50',.55,.6),chrome=mat('#a49d89',.33,.72),window=mat('#263d43',.18,.55);window.side=T.DoubleSide;
 const dusty=mat('#a79473',.95,.05),dark=mat('#292923',.8,.25),lamp=mat('#e8d8a6',.3,.15);lamp.emissive=new T.Color('#89713d');lamp.emissiveIntensity=.16;
 panel(body,2.04,.4,4.35,0,.78,0,paint);panel(body,2.03,.2,4.15,0,.59,0,dark,.05);
 // Long hood, separate front fenders and a gently sloping bonnet.
 const hood=panel(body,1.67,.21,1.57,0,1.01,-1.25,paint);hood.rotation.x=-.045;
 for(const x of[-.94,.94]){panel(body,.24,.36,1.66,x,.96,-1.23,paint,.04);panel(body,.25,.33,1.43,x,.92,1.35,paint,.04);panel(body,.12,.14,3.65,x,.63,.05,dusty,.025);}
 const pickup=variant===2,roofFront=-.33,roofRear=pickup?.56:.93,back=pickup?.95:1.38;
 panel(body,1.57,.12,roofRear-roofFront+.1,0,1.65,(roofFront+roofRear)/2,paint,.035);
 glazing(body,[[-.88,1.03,-.91],[.88,1.03,-.91],[.73,1.6,roofFront],[-.73,1.6,roofFront]],window);
 glazing(body,[[.86,1.04,back],[-.86,1.04,back],[-.73,1.6,roofRear],[.73,1.6,roofRear]],window);
 for(const side of[-1,1]){
  glazing(body,[[side*.89,1.06,-.85],[side*.89,1.06,back-.06],[side*.74,1.59,roofRear],[side*.74,1.59,roofFront]],window);
  strut(body,[side*.9,1.01,-.94],[side*.76,1.66,roofFront],.045,paint);strut(body,[side*.88,1.01,back],[side*.76,1.66,roofRear],.055,paint);
  strut(body,[side*.89,1.05,.35],[side*.75,1.63,.35],.035,dark);
  strut(body,[side*.91,1.06,-.9],[side*.91,1.06,back],.025,chrome);
  panel(body,.045,.3,1.05,side*1.035,.9,-.05,paint,.012);
  box(body,.035,.035,.22,side*1.065,1.01,.27,chrome);
  panel(body,.24,.14,.28,side*1.12,1.18,-.6,paint,.025);
  // Lower-panel chips and dust are geometry details, visible without texture loading.
  for(let j=0;j<6;j++)box(body,.018,.018+(j%3)*.009,.08+(j%2)*.07,side*1.055,.7+(j%3)*.055,-.85+j*.35,j%2?rust:dusty);
 }
 if(pickup){panel(body,1.75,.12,1.1,0,.94,1.52,dark);for(const x of[-.9,.9]){panel(body,.12,.35,1.25,x,1.08,1.48,paint,.03);strut(body,[x,1.4,.95],[x,1.4,2.03],.035,trim);}panel(body,1.8,.32,.12,0,1.08,2.06,paint,.03);}
 else {panel(body,1.78,.18,.75,0,1.02,1.72,paint);if(variant===1){for(const x of[-.65,.65])box(body,.06,.3,.08,x,1.21,1.82,steel);panel(body,2,.08,.38,0,1.38,1.85,dark,.025);}}
 panel(body,2.2,.17,.2,0,.66,-2.23,chrome,.04);panel(body,2.2,.16,.2,0,.65,2.23,trim,.04);
 box(body,1.15,.24,.05,0,.88,-2.18,dark);for(let i=0;i<6;i++)box(body,.025,.21,.065,-.5+i*.2,.88,-2.21,chrome);
 for(const x of[-.76,.76]){panel(body,.36,.19,.09,x,.95,-2.18,lamp,.03);panel(body,.34,.13,.08,x,.9,2.18,mat('#a9442c',.4),.025);box(body,.13,.07,.04,x,.72,-2.22,mat('#cc8b3d'));}
 if(variant===0||variant===1){panel(body,.65,.17,.54,0,1.2,-1.15,dark,.04);for(let j=0;j<3;j++)box(body,.5,.025,.04,0,1.29,-1.32+j*.13,chrome);}
 // Exterior cage and strapped equipment retain the wasteland setting.
 if(variant===3){for(const x of[-.67,.67])strut(body,[x,1.78,-.2],[x,1.78,.8],.035,trim);for(const z of[-.2,.3,.8])strut(body,[-.67,1.78,z],[.67,1.78,z],.035,trim);panel(body,1.03,.22,.55,0,1.87,.35,rust);for(const x of[-.35,.35])box(body,.045,.25,.57,x,1.88,.35,dark);}
 strut(body,[.86,.52,1.4],[.86,.52,2.38],.065,steel);
 const wheels=[];for(const x of[-1.04,1.04])for(const z of[-1.35,1.36]){
  const pivot=new T.Group();pivot.position.set(x,.49,z);
  const wheel=new T.Mesh(new T.CylinderGeometry(.49,.49,.36,24),rubber);wheel.rotation.z=Math.PI/2;wheel.castShadow=true;pivot.add(wheel);
  const hub=new T.Mesh(new T.CylinderGeometry(.28,.28,.375,16),trim);hub.rotation.z=Math.PI/2;pivot.add(hub);
  const cap=new T.Mesh(new T.CylinderGeometry(.115,.115,.39,12),chrome);cap.rotation.z=Math.PI/2;pivot.add(cap);
  for(let j=0;j<8;j++){const a=j*Math.PI/4;const spoke=box(pivot,.4,.06,.085,0,Math.sin(a)*.19,Math.cos(a)*.19,dark);spoke.rotation.x=-a;}
  const tread=new T.TorusGeometry(.455,.045,4,24);for(const side of[-.16,.16]){const ring=new T.Mesh(tread,dark);ring.rotation.y=Math.PI/2;ring.position.x=side;pivot.add(ring);}
  const spin=new T.Group();for(const part of [...pivot.children])spin.add(part);batchStatic(spin);pivot.add(spin);g.add(pivot);wheels.push({pivot,wheel:spin,front:z<0});
 }
 batchStatic(body);scene.add(g);return{g,body,wheels};
}
// Ground tiles recycle behind the convoy. Noise is stable in world space.
const noise=(x,z)=>Math.sin(x*.16+Math.sin(z*.035))*Math.cos(z*.12)*.7+Math.sin(x*.041+z*.023)*1.3;
const groundGeo=new T.PlaneGeometry(190,180,40,36);groundGeo.rotateX(-Math.PI/2);const base=groundGeo.attributes.position;for(let i=0;i<base.count;i++){const x=base.getX(i),z=base.getZ(i);base.setY(i,noise(x,z)*clamp((Math.abs(x)-23)/22,0,1)-.16);}groundGeo.computeVertexNormals();const grounds=[];for(let i=0;i<4;i++){const m=new T.Mesh(groundGeo,sand);m.position.z=120-i*180;m.receiveShadow=true;scene.add(m);grounds.push(m);}
makeRoute(scene);
const props=[];for(let i=0;i<95;i++){const side=i%2?1:-1,x=side*(25+Math.random()*58),z=80-Math.random()*650;let mesh;if(i%5===0){mesh=new T.Mesh(new T.BoxGeometry(2+Math.random()*4,1.2+Math.random()*3,3+Math.random()*4),rust);mesh.rotation.set(Math.random()*.25,Math.random()*6,Math.random()*.25);}else{mesh=new T.Mesh(new T.DodecahedronGeometry(.4+Math.random()*2.4,0),mat(i%3?'#92846a':'#7c7963'));mesh.scale.y=.35+Math.random()*.6;mesh.rotation.y=Math.random()*6;}mesh.position.set(x,noise(x,z)*.3,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);props.push(mesh);mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox;solids.push({object:mesh,hx:Math.max(.2,(bounds.max.x-bounds.min.x)*mesh.scale.x/2),hz:Math.max(.2,(bounds.max.z-bounds.min.z)*mesh.scale.z/2)});}
const scrubMat=mat('#777b51'),twigMat=mat('#6f6046');
for(let i=0;i<115;i++){
 const g=new T.Group(),side=i%2?1:-1,x=side*(19+Math.random()*62),z=65-Math.random()*640;
 if(i%4===0){const rock=new T.Mesh(new T.DodecahedronGeometry(.18+Math.random()*.45,0),mat('#a2957c'));rock.scale.set(1,.5,1.3);rock.castShadow=true;g.add(rock);}
 else {const h=.35+Math.random()*.65;for(let j=0;j<3;j++){const a=j*2.1+i;strut(g,[0,0,0],[Math.cos(a)*.4,h,Math.sin(a)*.4],.035,twigMat);const leaf=new T.Mesh(new T.IcosahedronGeometry(.25+Math.random()*.18,0),scrubMat);leaf.position.set(Math.cos(a)*.35,h,Math.sin(a)*.35);leaf.scale.y=.7;leaf.castShadow=true;g.add(leaf);}}
 g.position.set(x,Math.max(0,noise(x,z)*.3),z);scene.add(g);props.push(g);
}
// Irregular pools and low, traversable terrain share their contours with the physics.
function makeObstacle(p){const g=new T.Group(),verts=[],idx=[],segments=40,rings=p.kind==='pool'?2:8;
 for(let k=0;k<=rings;k++)for(let j=0;j<=segments;j++){const a=j/segments*Math.PI*2,t=k/rings,edge=contour(a,p.seed);const h=p.kind==='pool'?.025:Math.sin((1-t)*Math.PI/2)**1.5*p.height;verts.push(Math.cos(a)*p.rx*edge*t,h,Math.sin(a)*p.rz*edge*t);}
 for(let k=0;k<rings;k++)for(let j=0;j<segments;j++){const a=k*(segments+1)+j,b=a+segments+1;idx.push(a,a+1,b,b,a+1,b+1);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.setIndex(idx);geo.computeVertexNormals();
 const material=p.kind==='pool'?mat('#514838',.8):p.kind==='rock'?mat('#897d65',.95):sand;
 const mesh=new T.Mesh(geo,material);mesh.receiveShadow=true;mesh.castShadow=p.kind!=='pool';g.add(mesh);
 if(p.kind==='pool'){const inner=new T.Mesh(geo,mat('#423e32',.63));inner.scale.set(.72,1,.78);inner.position.set(p.rx*.08,.008,-p.rz*.08);g.add(inner);}
 g.rotation.y=-p.angle;g.position.set(p.x,0,p.z);scene.add(g);return {...p,g};
}
let selectedCar='sedan';try{const saved=localStorage.getItem('neverstop-car');if(['sedan','pickup'].includes(saved))selectedCar=saved;}catch{}
let pits=[],fuels=[],cars=[],models=[],playing=false,paused=false,ended=false,time=0,acc=0,toast=0,muted=false,finishCount=0;const keys=new Set();let touch=0;let volume=.7;const steeringPointers=new Map();const names=['ТЫ','RUST','JACKAL','DUST'];
const nitroMat=mat('#59c4d3',.4,.45);
function makeSupply(f){const g=new T.Group(),item=new T.Group();g.add(item);
 if(f.kind==='fuel'){box(item,.75,1,.36,0,.8,0,fuelMat);box(item,.4,.13,.36,0,1.42,0,steel);box(item,.11,.25,.36,-.23,1.3,0,fuelMat);box(item,.11,.25,.36,.23,1.3,0,fuelMat);box(item,.56,.09,.39,0,.83,0,mat('#ffe4a4'));}
 else {const bottle=new T.Mesh(new T.CylinderGeometry(.27,.32,1.2,16),nitroMat);bottle.position.y=.8;bottle.castShadow=true;item.add(bottle);box(item,.2,.2,.18,0,1.5,0,chromeSupply);box(item,.55,.12,.1,0,1.58,0,steel);for(const y of[.38,1.17]){const band=new T.Mesh(new T.CylinderGeometry(.33,.33,.1,16),chromeSupply);band.position.y=y;item.add(band);}const bolt=box(item,.1,.46,.035,0,.85,-.325,mat('#efffff'));bolt.rotation.z=-.4;}
 batchStatic(item);g.position.set(f.x,0,f.z);scene.add(g);return {...f,g,item,active:true};
}
const chromeSupply=mat('#b4bdad',.35,.6);
// A physical finish gate spans the route; the result is triggered by crossing its plane.
const gate=new T.Group(),gatePaint=mat('#d3c4a4'),gateDark=mat('#35382f');
for(const x of[-23,23]){box(gate,.5,8,.5,x,4,0,rust);strut(gate,[x,0,4],[x,7,0],.12,steel);}
box(gate,46,.25,.3,0,8,0,steel);
for(let i=0;i<24;i++)for(let row=0;row<2;row++)box(gate,46/24,.65,.1,-23+(i+.5)*46/24,6.9+row*.65,0,(i+row)%2?gatePaint:gateDark);
for(let i=0;i<24;i++)box(gate,46/24,.025,1.1,-23+(i+.5)*46/24,.025,0,i%2?gatePaint:gateDark);
gate.position.z=-RACE_LENGTH;scene.add(gate);
// Roofless ruins and stripped wrecks sit beyond the driveable shoulders.
const concrete=mat('#a29880'),burnt=mat('#49483e');
function brokenWall(g,w,h,x,z,turn=0){const shape=new T.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(w/2,h*.63);shape.lineTo(w*.3,h*.88);shape.lineTo(w*.15,h*.69);shape.lineTo(-w*.05,h);shape.lineTo(-w*.2,h*.82);shape.lineTo(-w/2,h*.92);shape.closePath();const geo=new T.ExtrudeGeometry(shape,{depth:.38,bevelEnabled:false});const mesh=new T.Mesh(geo,concrete);mesh.position.set(x,0,z);mesh.rotation.y=turn;mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);(g.userData.wallParts??=[]).push({mesh,w});}
for(let i=0;i<24;i++){const g=new T.Group(),side=i%2?1:-1;
 if(i%3===0){panel(g,2,.35,4.3,0,.55,0,rust);panel(g,1.7,.14,1.5,0,.87,-1.2,burnt);for(const x of[-.8,.8]){strut(g,[x,.8,-.6],[x*.8,1.5,0],.055,rust);strut(g,[x*.8,1.5,0],[x*.8,1.5,.9],.055,rust);strut(g,[x*.8,1.5,.9],[x,.8,1.4],.055,rust);}box(g,1.7,.1,.8,0,.85,1.6,rust);for(const x of[-1,1])for(const z of[-1.25,1.3]){const wheel=new T.Mesh(new T.CylinderGeometry(.4,.4,.3,10),burnt);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.35,z);g.add(wheel);}g.rotation.set(.1,i*.7,.13);}
 else {brokenWall(g,5,2.8,-3,0);brokenWall(g,5,3.5,3,0);box(g,2,.6,.38,0,2.7,0,concrete);brokenWall(g,6,2.6,-5.5,-3,Math.PI/2);if(i%2)brokenWall(g,4,1.7,5.5,-2,Math.PI/2);for(let j=0;j<7;j++){const rubble=box(g,.4+j*.07,.25,.65,Math.sin(j*4)*5,.12,-1-j*.6,concrete);rubble.rotation.y=j;}}
 g.position.set(side*(25+i%3*4),0,-35-i*49);g.updateMatrixWorld(true);if(g.userData.wallParts){for(const part of g.userData.wallParts){const center=part.mesh.localToWorld(new T.Vector3(0,0,.19));solids.push({x:center.x,z:center.z,hx:part.w/2,hz:.19,angle:-part.mesh.rotation.y});}delete g.userData.wallParts;}else solids.push({x:g.position.x,z:g.position.z,hx:1.15,hz:2.2,angle:-g.rotation.y});batchStatic(g);scene.add(g);distant.push(g);
}
const dustGeo=new T.SphereGeometry(1,6,4),dustMat=new T.MeshBasicMaterial({color:0xcbb38a,transparent:true,opacity:.2,depthWrite:false});const dust=[];for(let i=0;i<48;i++){const m=new T.Mesh(dustGeo,dustMat.clone());m.visible=false;scene.add(m);dust.push({m,life:0,vx:0,vz:0});}let dustIndex=0;function puff(c){const p=dust[dustIndex++%dust.length];p.life=1;p.m.visible=true;p.m.position.set(c.x+(Math.random()-.5)*2.1,.3,c.z+1.7);p.m.scale.setScalar(.25+Math.random()*.3);p.vx=-c.vx*.18+(Math.random()-.5)*(1.5+Math.abs(c.slip)*8);p.vz=2+Math.random()*2;}
// One draw call for all tire marks instead of hundreds of separate meshes.
const trackCount=240,trackPositions=new Float32Array(trackCount*18),trackGeo=new T.BufferGeometry();trackGeo.setAttribute('position',new T.BufferAttribute(trackPositions,3).setUsage(T.DynamicDrawUsage));const trackMesh=new T.Mesh(trackGeo,new T.MeshBasicMaterial({color:0x695c44,transparent:true,opacity:.17,depthWrite:false,side:T.DoubleSide}));trackMesh.frustumCulled=false;trackMesh.userData.worldSpace=true;scene.add(trackMesh);let ti=0;
function track(c){for(const side of[-1,1]){const cx=c.x+side*Math.cos(c.yaw),cz=c.z+side*Math.sin(c.yaw),co=Math.cos(c.yaw),si=Math.sin(c.yaw),offset=(ti++%trackCount)*18;const corners=[[-.115,-.65],[.115,-.65],[.115,.65],[-.115,-.65],[.115,.65],[-.115,.65]];corners.forEach(([x,z],j)=>{trackPositions[offset+j*3]=cx+x*co-z*si;trackPositions[offset+j*3+1]=.012;trackPositions[offset+j*3+2]=cz+x*si+z*co;});}trackGeo.attributes.position.needsUpdate=true;}
// Depth-sensitive miniature-lens pass: foreground and distant sand blur, driving area stays sharp.
const rt=new T.WebGLRenderTarget(1,1),postScene=new T.Scene(),postCam=new T.OrthographicCamera(-1,1,1,-1,0,1);const post=new T.ShaderMaterial({uniforms:{map:{value:rt.texture},res:{value:new T.Vector2(1,1)},focus:{value:.49},blurAmount:{value:1}},vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform sampler2D map;uniform vec2 res;uniform float focus;uniform float blurAmount;varying vec2 uvv;void main(){float nearBlur=1.-smoothstep(.015,.36,uvv.y);float farBlur=smoothstep(.57,.97,uvv.y);float b=max(nearBlur,farBlur)*22.*blurAmount;vec2 d=vec2(b)/res;vec4 c=vec4(0.);float total=0.;for(int x=-2;x<=2;x++){for(int y=-2;y<=2;y++){vec2 q=vec2(float(x),float(y));float w=exp(-dot(q,q)*.48);c+=texture2D(map,uvv+q*d*.5)*w;total+=w;}}gl_FragColor=c/total;
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});postScene.add(new T.Mesh(new T.PlaneGeometry(2,2),post));
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);rt.setSize(w*renderer.getPixelRatio(),h*renderer.getPixelRatio());post.uniforms.res.value.set(rt.width,rt.height);camera.aspect=w/h;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
let audio,engine,gain,filter;function audioStart(){if(!audio){audio=new(window.AudioContext||window.webkitAudioContext)();engine=audio.createOscillator();engine.type='sawtooth';gain=audio.createGain();filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=220;engine.connect(filter);filter.connect(gain);gain.connect(audio.destination);engine.start();}audio.resume();}function beep(freq=400,duration=.16){if(!audio||muted)return;const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.55,audio.currentTime+duration);g.gain.setValueAtTime(.08*volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
function say(s){$('status').textContent=s;toast=2;}
let lastImpact=-1,impactBuffer;
function impactSound(strength=8,distance=0){if(!audio||muted||volume===0||audio.currentTime-lastImpact<.09||distance>35)return;lastImpact=audio.currentTime;const t=audio.currentTime,level=clamp(strength/20,.12,1)*volume*.22/(1+distance*.08);if(!impactBuffer){impactBuffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*.22),audio.sampleRate);const samples=impactBuffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/samples.length*5);}
const source=audio.createBufferSource(),tone=audio.createBiquadFilter(),envelope=audio.createGain();source.buffer=impactBuffer;tone.type='bandpass';tone.frequency.value=850;tone.Q.value=.7;envelope.gain.setValueAtTime(level,t);envelope.gain.exponentialRampToValueAtTime(.0001,t+.22);source.connect(tone);tone.connect(envelope);envelope.connect(audio.destination);source.start(t);source.onended=()=>{source.disconnect();tone.disconnect();envelope.disconnect();};
const thud=audio.createOscillator(),low=audio.createGain();thud.type='triangle';thud.frequency.setValueAtTime(145,t);thud.frequency.exponentialRampToValueAtTime(42,t+.16);low.gain.setValueAtTime(level*1.4,t);low.gain.exponentialRampToValueAtTime(.0001,t+.18);thud.connect(low);low.connect(audio.destination);thud.start(t);thud.stop(t+.2);thud.onended=()=>{thud.disconnect();low.disconnect();};}
function disposeRaceObject(g){scene.remove(g);const shared=new Set([steel,rubber,rust,glass,fuelMat,sand,nitroMat,chromeSupply]),materials=new Set(),geometries=new Set();g.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);if(!shared.has(o.material))materials.add(o.material);}});geometries.forEach(a=>a.dispose());materials.forEach(a=>a.dispose());}
function reset(){for(const m of models)disposeRaceObject(m.g);for(const p of pits)disposeRaceObject(p.g);for(const f of fuels)disposeRaceObject(f.g);cars=[vehicle(0,-4,0,selectedCar),vehicle(1,4,-1,'sedan'),vehicle(2,-10,-5,'pickup'),vehicle(3,10,-7,'pickup')];models=cars.map((c,i)=>makeCar(paints[i],c.type==='pickup'?2:i===0?0:1));const course=createCourse();pits=course.obstacles.map(makeObstacle);fuels=course.supplies.map(makeSupply);finishCount=0;trackPositions.fill(0);trackGeo.attributes.position.needsUpdate=true;ti=0;for(const p of dust){p.life=0;p.m.visible=false;}time=0;acc=0;ended=false;paused=false;$('modal').hidden=true;$('status').textContent='';$('sink').style.display='none';$('boost').hidden=true;$('playerTag').hidden=true;}
function start(){reset();playing=true;$('menu').hidden=true;$('footer').hidden=true;$('hud').hidden=false;$('pause').hidden=false;document.body.classList.add('playing');audioStart();clearSteering();}
let raceMarkup='';function updateRaceHud(){const ordered=raceOrder(cars),position=ordered.findIndex(c=>c.id===0)+1;const value=position+'<span>из 4</span>';if($('alive').innerHTML!==value)$('alive').innerHTML=value;const markup=ordered.map((a,i)=>`<div style="color:${paints[a.id]};opacity:${a.dead?.35:1}">${i+1} ${names[a.id]}${a.dead?' — выбыл':''}</div>`).join('');if(markup!==raceMarkup){$('roster').innerHTML=markup;raceMarkup=markup;}}
function finish(win){updateRaceHud();ended=true;playing=false;clearSteering();$('modal').hidden=false;$('resultLabel').hidden=true;$('resultDetail').hidden=false;$('settings').hidden=true;$('resultTitle').textContent=cars[0].finished?(cars[0].finishPlace===1?'Первое место':'Финиш'):'Песок догнал';$('resultDetail').innerHTML=`<span>${(cars[0].distance/1000).toFixed(2).replace('.',',')} км</span><span>${Math.floor(time)} сек</span><span>${cars[0].finished?'Место '+cars[0].finishPlace+' из 4':'До финиша '+Math.max(0,Math.ceil(RACE_LENGTH+cars[0].z))+' м'}</span>`;$('again').textContent='Ещё заезд';$('pause').hidden=true;beep(win?640:100,.5);$('again').focus();}
function pause(){if(ended||!playing)return;paused=!paused;if(paused&&gain)gain.gain.setTargetAtTime(0,audio.currentTime,.05);$('modal').hidden=!paused;if(paused){$('resultLabel').hidden=true;$('resultTitle').innerHTML='Переведи<br>дух';$('resultDetail').hidden=true;$('settings').hidden=false;$('settings').open=false;$('again').textContent='Продолжить';$('again').focus();}else{$('pause').focus();}keys.clear();clearSteering();}
function updateSound(){const enabled=!muted&&volume>0;$('sound').setAttribute('aria-label',enabled?'Выключить звук':'Включить звук');$('sound').setAttribute('aria-pressed',String(enabled));$('sound').classList.toggle('muted',!enabled);}
$('volume').oninput=e=>{volume=Number(e.target.value)/100;muted=volume===0;updateSound();};
$('blur').onchange=e=>{post.uniforms.blurAmount.value=e.target.checked?1:0;document.body.classList.toggle('no-blur',!e.target.checked);};
function selectCar(type){selectedCar=type;try{localStorage.setItem('neverstop-car',type);}catch{}for(const input of document.querySelectorAll('input[name=car]'))input.checked=input.value===type;if(models.length){disposeRaceObject(models[0].g);models[0]=makeCar(paints[0],type==='pickup'?2:0);cars[0]=vehicle(0,-4,0,type);}}
for(const input of document.querySelectorAll('input[name=car]')){input.checked=input.value===selectedCar;input.addEventListener('change',()=>selectCar(input.value));}
$('start').onclick=start;$('again').onclick=()=>paused?pause():start();$('pause').onclick=pause;$('home').onclick=()=>{playing=false;paused=false;ended=false;$('modal').hidden=true;$('hud').hidden=true;$('pause').hidden=true;$('menu').hidden=false;$('footer').hidden=false;document.body.classList.remove('playing','lowfuel');reset();};$('sound').onclick=()=>{muted=!muted;if(!muted&&volume===0){volume=.7;$('volume').value=70;}updateSound();};
function clearSteering(){steeringPointers.clear();touch=0;$('left').classList.remove('held');$('right').classList.remove('held');}
function updateSteering(){touch=steeringPointers.size?[...steeringPointers.values()].at(-1):0;$('left').classList.toggle('held',touch<0);$('right').classList.toggle('held',touch>0);}
document.addEventListener('pointerdown',e=>{if(!playing||paused||ended||e.button!==0)return;const button=e.target.closest('button');if(button&&button.id!=='left'&&button.id!=='right')return;if(e.target.closest('input,summary,details,a'))return;e.preventDefault();const side=button?.id==='left'?-1:button?.id==='right'?1:e.clientX<innerWidth/2?-1:1;steeringPointers.set(e.pointerId,side);document.body.setPointerCapture(e.pointerId);updateSteering();});
document.addEventListener('pointermove',e=>{if(!steeringPointers.has(e.pointerId))return;steeringPointers.set(e.pointerId,e.clientX<innerWidth/2?-1:1);updateSteering();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(event,e=>{steeringPointers.delete(e.pointerId);updateSteering();});
addEventListener('keydown',e=>{if(e.target.matches('input,summary'))return;if(['ArrowLeft','ArrowRight','KeyA','KeyD','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat&&(e.code==='Escape'||e.code==='KeyP'))pause();});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();clearSteering();if(playing&&!paused)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused)pause();});
function control(){let v=touch+(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);const gp=navigator.getGamepads?.()[0];if(gp&&Math.abs(gp.axes[0])>.22)v+=gp.axes[0];return clamp(v,-1,1);}
function ai(c){let target=Math.sin(time*.4+c.id)*10;let nearest=Infinity;for(const f of fuels){const dz=c.z-f.z;if(f.active&&dz>0&&dz<75){const score=dz+Math.abs(f.x-c.x)*1.8;if(score<nearest){nearest=score;target=f.x;}}}for(const p of pits){const dz=c.z-p.z;if(dz>0&&dz<24&&Math.abs(c.x-p.x)<p.r+2){target=p.x+(c.x>p.x?1:-1)*(p.r+4);break;}}const desired=clamp((target-c.x)*.12,-.65,.65);return clamp((desired-c.yaw)*3,-1,1);}
function tick(dt){time+=dt;const previous=cars.map(c=>c.z);for(const c of cars)step(c,dt,pits,c.id?ai(c):control());
 for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const a=cars[i],b=cars[j],strength=Math.hypot(a.vx-b.vx,a.vz-b.vz);if(collide(a,b))impactSound(strength,Math.hypot(a.x-cars[0].x,a.z-cars[0].z));}
 for(const c of cars)for(const solid of solids){const impact=collideSolid(c,solid);if(impact>1)impactSound(impact,Math.hypot(c.x-cars[0].x,c.z-cars[0].z));}
 finishCount=finishCrossings(cars,previous,time,dt,finishCount);
 for(const c of cars)for(const f of fuels)if(pickup(c,f)){f.g.visible=false;if(c.id===0){say(f.kind==='nitro'?'Нитро на 4 секунды':'+5 л');beep(f.kind==='nitro'?980:740,.19);}}
 if(cars[0].finished)finish(cars[0].finishPlace===1);else if(cars[0].dead)finish(false);
}
let last=performance.now(),lastHud=0,frame=0;reset();camera.position.set(24,35,36);const look=new T.Vector3();function render(now){requestAnimationFrame(render);if(document.hidden||paused){last=now;return;}const interval=1000/(playing?30:15);if(now-last<interval-1)return;let dt=Math.min(.1,(now-last)/1000);last=now;frame++;if(playing&&!paused){acc+=dt;while(acc>=1/60&&playing){tick(1/60);acc-=1/60;}}const c=cars[0];const viewZ=playing||ended?c.z:0;const desired=playing||ended?new T.Vector3(c.x*(innerWidth<650?.85:.55),innerWidth<650?43:35,viewZ+38):new T.Vector3(26+Math.sin(now*.00006)*4,30,29);camera.position.lerp(desired,1-Math.exp(-dt*4));look.set(playing||ended?c.x*(innerWidth<650?.85:.55):3,0,viewZ-(innerWidth<650?13:12));camera.lookAt(look);sun.position.set(c.x-36,30,viewZ+26);fill.position.set(c.x+30,25,viewZ-40);fill.target.position.set(c.x,0,viewZ);sun.target.position.set(c.x,0,viewZ-15);for(const g of grounds){while(g.position.z>viewZ+220)g.position.z-=720;while(g.position.z<viewZ-500)g.position.z+=720;}for(const p of props){p.visible=p.position.z>viewZ-150&&p.position.z<viewZ+65;if(p.position.z>viewZ+80)p.position.z=viewZ-550-Math.random()*80;if(p.position.z<viewZ-700)p.position.z=viewZ+70;}
for(const g of distant)g.visible=Math.abs(g.position.z-viewZ)<150;gate.visible=Math.abs(gate.position.z-viewZ)<150;for(const p of pits)p.g.visible=Math.abs(p.z-viewZ)<150;for(const f of fuels)f.g.visible=f.active&&Math.abs(f.z-viewZ)<150;
for(let i=0;i<cars.length;i++){const a=cars[i],m=models[i],sp=Math.hypot(a.vx,a.vz);m.g.position.set(a.x,a.groundHeight-a.sink*.5-a.slow*.2,a.z);m.g.rotation.y=-a.yaw;m.body.rotation.z+=(-a.lateralAccel*.012-m.body.rotation.z)*(1-Math.exp(-dt*8));m.body.rotation.x=a.terrainPitch+Math.sin(now*.012+i)*.012*(sp/20);for(const w of m.wheels){w.pivot.rotation.y=w.front?-a.steer*.4:0;if(playing&&!paused){w.wheel.rotateX(-sp*dt*2);}}if(playing&&!paused&&!a.dead){if(frame%2===0||Math.abs(a.slip)>.15)puff(a);if(frame%3===0)track(a);}}
for(const f of fuels)if(f.active){f.item.rotation.y=now*.001;f.item.position.y=Math.sin(now*.003+f.z)*.08;}for(const p of dust)if(p.life>0&&!paused){p.life-=dt*.65;p.m.position.x+=p.vx*dt;p.m.position.z+=p.vz*dt;p.m.position.y+=dt*.8;p.m.scale.addScalar(dt*1.8);p.m.material.opacity=Math.max(0,p.life*.16);if(p.life<=0)p.m.visible=false;}
if(playing){const anchor=new T.Vector3(c.x,c.groundHeight+3.5,c.z).project(camera);$('playerTag').hidden=anchor.z>1;$('playerTag').style.left=((anchor.x*.5+.5)*innerWidth)+'px';$('playerTag').style.top=((-anchor.y*.5+.5)*innerHeight)+'px';}else $('playerTag').hidden=true;
if((playing||ended)&&now-lastHud>=100){lastHud=now;$('fuelMeter').setAttribute('aria-valuenow',String(Math.ceil(c.fuel/c.spec.capacity*100)));$('fuelBar').style.width=(c.fuel/c.spec.capacity*100)+'%';document.body.classList.toggle('lowfuel',c.fuel/c.spec.capacity<.25);$('speed').textContent=Math.round(Math.hypot(c.vx,c.vz)*3.6);$('distance').textContent='До финиша '+(Math.max(0,RACE_LENGTH+c.z)/1000).toFixed(2).replace('.',',')+' км';$('boost').hidden=c.boost<=0;$('boost').textContent='Нитро '+Math.ceil(c.boost)+' с';updateRaceHud();$('sink').style.display=c.sink>.15?'block':'none';$('sinkBar').style.width=(c.sink/3.8*100)+'%';}if(toast>0&&!paused){toast-=dt;if(toast<=0)$('status').textContent='';}if(gain){gain.gain.setTargetAtTime(playing&&!paused&&!muted?.04*volume:0,audio.currentTime,.1);engine.frequency.setTargetAtTime(35+Math.hypot(c.vx,c.vz)*2.5,audio.currentTime,.1);}renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(postScene,postCam);}
requestAnimationFrame(render);
