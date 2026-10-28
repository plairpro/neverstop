import {obstacleDepth,terrainHeight} from './course.js?v=6';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const CAR_TYPES=Object.freeze({
 sedan:Object.freeze({name:'Легковая',maxSpeed:96,capacity:80,drive:12.53,frontGrip:9.5,rearGrip:6.7,yawDamping:1.45}),
 pickup:Object.freeze({name:'Пикап',maxSpeed:78,capacity:120,drive:10.18,frontGrip:10.5,rearGrip:9.8,yawDamping:2.15})
});
export function vehicle(id,x,z,type='sedan'){const spec=CAR_TYPES[type]||CAR_TYPES.sedan;return{id,x,z,type:CAR_TYPES[type]?type:'sedan',spec,vx:0,vz:-16,yaw:0,fuel:spec.capacity,sink:0,dead:false,steer:0,yawRate:0,slip:0,lateralAccel:0,distance:0,hits:0,pickups:0,slow:0,boost:0,groundHeight:0,terrainPitch:0,finished:false,finishPlace:0};}
export function step(c,dt,pits,input=0){
 if(c.dead||c.finished)return;
 const speed=Math.hypot(c.vx,c.vz);
 const boostActive=c.boost>0;c.boost=Math.max(0,c.boost-dt);
 c.fuel=Math.max(0,c.fuel-dt*1.6);
 c.steer+=(clamp(input,-1,1)-c.steer)*(1-Math.exp(-dt*5.5));
 let deep=0,resistance=0,height=0,frontHeight=0,rearHeight=0;
 for(const p of pits){const depth=obstacleDepth(p,c.x,c.z);if(!depth)continue;if(p.kind==='pool'){deep=Math.max(deep,depth);resistance=Math.max(resistance,depth*4.2);}else{resistance=Math.max(resistance,depth*(p.kind==='dune'?1.1:1.8));height=Math.max(height,terrainHeight(p,c.x,c.z));const fx=Math.sin(c.yaw)*1.2,fz=-Math.cos(c.yaw)*1.2;frontHeight=Math.max(frontHeight,terrainHeight(p,c.x+fx,c.z+fz));rearHeight=Math.max(rearHeight,terrainHeight(p,c.x-fx,c.z-fz));}}
 c.groundHeight+=(height-c.groundHeight)*(1-Math.exp(-dt*12));c.terrainPitch+=(Math.atan2(frontHeight-rearHeight,2.4)-c.terrainPitch)*(1-Math.exp(-dt*8));
 const shoulder=clamp((Math.abs(c.x)-21)/9,0,1);
 const fx=Math.sin(c.yaw),fz=-Math.cos(c.yaw),rx=Math.cos(c.yaw),rz=Math.sin(c.yaw);
 const forward=c.vx*fx+c.vz*fz,lateral=c.vx*rx+c.vz*rz;
 const steerAngle=c.steer*(.43-.10*clamp(speed/26,0,1));
 const grip=1-deep*.58-shoulder*.35;
 // Separate axle slip and force saturation: rear traction breaks before the front.
 const frontSlip=Math.atan2(lateral+c.yawRate*1.35,Math.max(3,Math.abs(forward)))-steerAngle;
 const rearSlip=Math.atan2(lateral-c.yawRate*1.25,Math.max(3,Math.abs(forward)));
 const frontForce=-Math.tanh(frontSlip*6.5)*c.spec.frontGrip*grip;
 const rearForce=-Math.tanh(rearSlip*5.8)*c.spec.rearGrip*grip;
 c.yawRate+=((frontForce*1.35-rearForce*1.25)/3.1-c.yawRate*c.spec.yawDamping-c.yaw*.85)*dt;
 c.yawRate=clamp(c.yawRate,-1.1,1.1);
 c.yaw+=c.yawRate*dt;
 if(Math.abs(c.yaw)>1.12){c.yaw=clamp(c.yaw,-1.12,1.12);if(c.yawRate*c.yaw>0)c.yawRate*=Math.exp(-dt*12);}
 const drag=.47+resistance+shoulder*2.8;
 const drive=c.fuel>0?c.spec.drive*(boostActive?1.6:1):0;
 c.lateralAccel=frontForce+rearForce;
 c.vx+=(fx*drive+rx*c.lateralAccel-c.vx*drag)*dt;
 c.vz+=(fz*drive+rz*c.lateralAccel-c.vz*drag)*dt;
 c.slip=Math.atan2(lateral,Math.max(3,Math.abs(forward)));
 c.x+=c.vx*dt;c.z+=c.vz*dt;c.distance+=Math.max(0,-c.vz)*dt;
 const actual=Math.hypot(c.vx,c.vz);
 if(actual<3.3)c.sink+=dt*(.65+deep*.65);else c.sink=Math.max(0,c.sink-dt*1.7);
 if(c.sink>=3.8){c.dead=true;c.sink=3.8;}c.slow=deep;
}
export function collide(a,b){if(a.dead||b.dead||a.finished||b.finished)return false;const dx=b.x-a.x,dz=b.z-a.z;const d=Math.hypot(dx,dz);if(d>=2.7)return false;const nx=d>.001?dx/d:1,nz=d>.001?dz/d:0;const overlap=2.7-d;a.x-=nx*overlap*.5;a.z-=nz*overlap*.5;b.x+=nx*overlap*.5;b.z+=nz*overlap*.5;const rel=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;if(rel<0){const impulse=-rel*.78+1.2;a.vx-=nx*impulse;a.vz-=nz*impulse;b.vx+=nx*impulse;b.vz+=nz*impulse;const twist=clamp(nz*nx*impulse*.12,-.55,.55);a.yawRate=clamp(a.yawRate-twist,-1.1,1.1);b.yawRate=clamp(b.yawRate+twist,-1.1,1.1);a.hits++;b.hits++;return impulse>2;}return false;}
export function pickup(c,f){if(c.dead||c.finished||!f.active||Math.hypot(c.x-f.x,c.z-f.z)>2.1)return false;f.active=false;if(f.kind==='nitro'){c.boost=4;}else{c.fuel=Math.min(c.spec.capacity,c.fuel+33);c.pickups++;}return true;}
