// Caravan rules: cargo in pickup beds, loose cargo on the sand, partners getting stuck and the sandstorm behind the convoy.
// The player is the rear guard: pushes stuck partners free, catches dropped cargo, keeps ahead of the storm.
// Pure logic without Three.js so it can be checked in Node.
import {clamp} from './physics.js?v=16';

export const CARGO_SLOTS=8;
export const PLAYER_START_CARGO=3;  // the rear guard runs light, with room for what the others drop
export const CARGO_KINDS=['crate','barrel','sack','tires','crate','barrel','sack','crate'];
export const STORM_START=30;      // metres behind the start line
export const STORM_MAX_GAP=50;    // the storm never lags further behind the rearmost pickup
export const STORM_EDGE=14;       // depth of the dusty front where pickups start to choke
export const ALLY_PACE=1.07;      // partners run slightly quicker so the player stays at the back

export function loadCargo(c,count=CARGO_SLOTS){c.cargo=CARGO_KINDS.slice(0,count);c.delivered=0;c.lostCargo=0;c.stormDepth=0;c.cover=0;c.stuck=false;c.stuckTime=0;c.rescues=0;c.catches=0;return c;}

// Each item weighs the pickup down a little: an empty bed is about 9% quicker.
export function loadFactor(c){return (1-(c.cargo?.length??0)*.012)*(c.id?ALLY_PACE:1);}

export function createStorm(){return {z:STORM_START,speed:12.5,swallowed:0};}

export function stormSpeed(time){return Math.min(17,12+time*.055);}

export function stepStorm(storm,cars,dt,time){
 let rear=-Infinity;for(const c of cars)if(!c.dead&&!c.finished)rear=Math.max(rear,c.z);
 // The front creeps slower once it is close, leaving room to brake, reverse and grab a crate.
 const gap=rear>-Infinity?storm.z-rear:99;storm.speed=stormSpeed(time)*(gap<0?.3:gap<30?.45+.55*gap/30:1);storm.z-=storm.speed*dt;
 if(rear>-Infinity)storm.z=Math.min(storm.z,rear+STORM_MAX_GAP);
 for(const c of cars){
  if(c.dead||c.finished){c.stormDepth=0;continue;}
  // 0 ahead of the front edge, 1 deep inside the wall.
  c.stormDepth=clamp((c.z-(storm.z-STORM_EDGE))/STORM_EDGE,0,1);
  // Inside the wall dust builds up gradually; drive out and it clears. Fully covered means lost.
  if(c.stormDepth>0){c.cover=Math.min(1,c.cover+dt*(.05+.1*c.stormDepth));const k=Math.exp(-dt*.12*c.stormDepth);c.vx*=k;c.vz*=k;}
  else c.cover=Math.max(0,c.cover-dt*.35);
  if(c.cover>=1){c.dead=true;c.stuck=false;}
 }
}

// A stuck partner spins its wheels in place. It does not sink on its own; only the storm can take it.
export function stickCar(c){c.stuck=true;c.stuckTime=0;c.boost=0;}
export function holdStuck(c,dt){if(!c.stuck||c.dead)return;c.stuckTime+=dt;const k=Math.exp(-dt*3.5);c.vx*=k;c.vz*=k;c.yawRate*=k;if(!c.stormDepth)c.sink=Math.min(c.sink,.9);}
// A bump from behind frees the partner and shoves it forward.
export function tryRescue(helper,c,relativeSpeed){
 if(helper.id!==0||!c.stuck||c.dead||helper.dead||relativeSpeed<2.2)return false;
 c.stuck=false;c.sink=0;c.vz=Math.min(c.vz,-11);helper.rescues++;return true;
}
// Partner in view ahead of the player who can get into trouble next.
export function incidentCandidate(cars,player,rand=Math.random){
 const pool=cars.filter(c=>c.id&&!c.dead&&!c.finished&&!c.stuck&&c.z<player.z-18&&c.z>player.z-75);
 return pool.length?pool[Math.floor(rand()*pool.length)]:null;
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

// Only the rear guard collects loose cargo; the partners keep their line.
export function grabCargo(c,it){
 if(c.id!==0||c.dead||c.finished||!it.active||c.cargo.length>=CARGO_SLOTS)return false;
 if(it.owner===c.id&&it.age<1.2)return false;
 if(Math.hypot((c.x-it.x)/3.6,(c.z-it.z)/3.4)>1)return false;
 it.active=false;c.cargo.push(it.kind);if(it.owner!==c.id)c.catches++;return true;
}

// Impact strength in m/s mapped to items shaken loose.
export function cargoForImpact(strength){return strength>13?2:strength>6.5?1:0;}

export function caravanCargo(cars){return cars.reduce((n,c)=>n+(c.dead?0:c.finished?c.delivered:c.cargo.length),0);}

export function deliver(c){if(c.finished&&!c.delivered){c.delivered=c.cargo.length;}}
