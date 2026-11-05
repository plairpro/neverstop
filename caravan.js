// Caravan rules: cargo in pickup beds, loose cargo on the sand and the sandstorm behind the convoy.
// Pure logic without Three.js so it can be checked in Node.
import {clamp} from './physics.js?v=15';

export const CARGO_SLOTS=8;
export const CARGO_KINDS=['crate','barrel','sack','tires','crate','barrel','sack','crate'];
export const STORM_START=40;      // metres behind the start line
export const STORM_MAX_GAP=42;    // the storm never lags further behind the rearmost pickup
export const STORM_EDGE=9;        // depth of the dusty front where pickups start to choke

export function loadCargo(c){c.cargo=CARGO_KINDS.slice(0,CARGO_SLOTS);c.delivered=0;c.lostCargo=0;c.stormDepth=0;return c;}

// Each item weighs the pickup down a little: an empty bed is about 9% quicker.
export function loadFactor(c){return 1-(c.cargo?.length??0)*.012;}

export function createStorm(){return {z:STORM_START,speed:13.5,swallowed:0};}

export function stormSpeed(time){return Math.min(19.6,13.5+time*.075);}

export function stepStorm(storm,cars,dt,time){
 storm.speed=stormSpeed(time);storm.z-=storm.speed*dt;
 let rear=-Infinity;for(const c of cars)if(!c.dead&&!c.finished)rear=Math.max(rear,c.z);
 if(rear>-Infinity)storm.z=Math.min(storm.z,rear+STORM_MAX_GAP);
 for(const c of cars){
  if(c.dead||c.finished){c.stormDepth=0;continue;}
  // 0 ahead of the front edge, 1 deep inside the wall.
  c.stormDepth=clamp((c.z-(storm.z-STORM_EDGE))/STORM_EDGE,0,1);
  if(c.stormDepth>0){c.sink+=dt*(1.7+1.9*c.stormDepth)*c.stormDepth;c.vx*=Math.exp(-dt*.55*c.stormDepth);c.vz*=Math.exp(-dt*.55*c.stormDepth);if(c.sink>=3.8){c.sink=3.8;c.dead=true;}}
 }
}

// Hard hits shake cargo loose. Returns the dropped items.
export function dropCargo(c,count,loose,rand=Math.random){
 const dropped=[];
 for(let k=0;k<count&&c.cargo.length;k++){
  const kind=c.cargo.pop(),side=rand()<.5?-1:1;
  const item={kind,x:c.x+Math.cos(c.yaw)*side*.9,z:c.z+1.8,vx:c.vx*.55+Math.cos(c.yaw)*side*(2.5+rand()*2.5),vz:c.vz*.55+1.5,spin:(rand()-.5)*8,yaw:rand()*6,age:0,active:true,owner:c.id,lost:false};
  loose.push(item);dropped.push(item);c.lostCargo++;
 }
 return dropped;
}

export function stepLoose(loose,storm,dt){
 for(const it of loose){
  if(!it.active)continue;it.age+=dt;
  const k=Math.exp(-dt*2.6);it.vx*=k;it.vz*=k;it.x+=it.vx*dt;it.z+=it.vz*dt;it.yaw+=it.spin*dt;it.spin*=k;
  if(it.z>storm.z-2){it.active=false;it.lost=true;storm.swallowed++;}
 }
}

export function grabCargo(c,it){
 if(c.dead||c.finished||!it.active||c.cargo.length>=CARGO_SLOTS)return false;
 if(it.owner===c.id&&it.age<1.2)return false;
 if(Math.hypot((c.x-it.x)/3.4,(c.z-it.z)/3.2)>1)return false;
 it.active=false;c.cargo.push(it.kind);return true;
}

// Impact strength in m/s mapped to items shaken loose.
export function cargoForImpact(strength){return strength>13?2:strength>6.5?1:0;}

export function caravanCargo(cars){return cars.reduce((n,c)=>n+(c.dead?0:c.finished?c.delivered:c.cargo.length),0);}

export function deliver(c){if(c.finished&&!c.delivered){c.delivered=c.cargo.length;}}
