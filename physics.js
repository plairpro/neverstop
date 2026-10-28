export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function vehicle(id,x,z){return{id,x,z,vx:0,vz:-16,yaw:0,fuel:90,sink:0,dead:false,steer:0,yawRate:0,slip:0,lateralAccel:0,distance:0,hits:0,pickups:0,slow:0};}
export function step(c,dt,pits,input=0){
 if(c.dead)return;
 const speed=Math.hypot(c.vx,c.vz);
 c.fuel=Math.max(0,c.fuel-dt*1.6);
 c.steer+=(clamp(input,-1,1)-c.steer)*(1-Math.exp(-dt*5.5));
 let deep=0;
 for(const p of pits){const d=Math.hypot(c.x-p.x,c.z-p.z);if(d<p.r+1)deep=Math.max(deep,clamp((p.r+1-d)/p.r,0,1));}
 const shoulder=clamp((Math.abs(c.x)-21)/9,0,1);
 const fx=Math.sin(c.yaw),fz=-Math.cos(c.yaw),rx=Math.cos(c.yaw),rz=Math.sin(c.yaw);
 const forward=c.vx*fx+c.vz*fz,lateral=c.vx*rx+c.vz*rz;
 const steerAngle=c.steer*(.43-.10*clamp(speed/26,0,1));
 const grip=1-deep*.58-shoulder*.35;
 // Separate axle slip and force saturation: rear traction breaks before the front.
 const frontSlip=Math.atan2(lateral+c.yawRate*1.35,Math.max(3,Math.abs(forward)))-steerAngle;
 const rearSlip=Math.atan2(lateral-c.yawRate*1.25,Math.max(3,Math.abs(forward)));
 const frontForce=-Math.tanh(frontSlip*6.5)*9.5*grip;
 const rearForce=-Math.tanh(rearSlip*5.8)*7.4*grip;
 c.yawRate+=((frontForce*1.35-rearForce*1.25)/3.1-c.yawRate*1.6-c.yaw*.85)*dt;
 c.yawRate=clamp(c.yawRate,-1.1,1.1);
 c.yaw+=c.yawRate*dt;
 if(Math.abs(c.yaw)>1.12){c.yaw=clamp(c.yaw,-1.12,1.12);if(c.yawRate*c.yaw>0)c.yawRate*=Math.exp(-dt*12);}
 const drag=.47+deep*5.3+shoulder*2.8;
 const drive=c.fuel>0?11:0;
 c.lateralAccel=frontForce+rearForce;
 c.vx+=(fx*drive+rx*c.lateralAccel-c.vx*drag)*dt;
 c.vz+=(fz*drive+rz*c.lateralAccel-c.vz*drag)*dt;
 c.slip=Math.atan2(lateral,Math.max(3,Math.abs(forward)));
 c.x+=c.vx*dt;c.z+=c.vz*dt;c.distance+=Math.max(0,-c.vz)*dt;
 const actual=Math.hypot(c.vx,c.vz);
 if(actual<3.3)c.sink+=dt*(.65+deep*.65);else c.sink=Math.max(0,c.sink-dt*1.7);
 if(c.sink>=3.8){c.dead=true;c.sink=3.8;}c.slow=deep;
}
export function collide(a,b){if(a.dead||b.dead)return false;const dx=b.x-a.x,dz=b.z-a.z;const d=Math.hypot(dx,dz);if(d>=2.7)return false;const nx=d>.001?dx/d:1,nz=d>.001?dz/d:0;const overlap=2.7-d;a.x-=nx*overlap*.5;a.z-=nz*overlap*.5;b.x+=nx*overlap*.5;b.z+=nz*overlap*.5;const rel=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;if(rel<0){const impulse=-rel*.78+1.2;a.vx-=nx*impulse;a.vz-=nz*impulse;b.vx+=nx*impulse;b.vz+=nz*impulse;const twist=clamp(nz*nx*impulse*.12,-.55,.55);a.yawRate=clamp(a.yawRate-twist,-1.1,1.1);b.yawRate=clamp(b.yawRate+twist,-1.1,1.1);a.hits++;b.hits++;return impulse>2;}return false;}
export function pickup(c,f){if(c.dead||!f.active||Math.hypot(c.x-f.x,c.z-f.z)>2.1)return false;f.active=false;c.fuel=Math.min(100,c.fuel+33);c.pickups++;return true;}
