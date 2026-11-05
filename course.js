export const RACE_LENGTH=5000;
export const ROAD_HALF=18;
// Long sweeping bends (about 840 m apart) on top of small wiggles; the first stretch eases in straight.
export function roadCenter(z){const d=-z,ease=Math.min(1,Math.max(0,d/350));return 18*Math.sin(d*.008)+8*Math.sin(d*.017)+ease*(70*Math.sin(d*.0075)+22*Math.sin(d*.0031+1.7));}
// A point beside the road at a perpendicular distance, so roadside objects keep clear of the bends.
export function roadside(z,off){const s=(roadCenter(z-1)-roadCenter(z+1))/2;return roadCenter(z)+off*Math.sqrt(1+s*s);}
// Deterministic layout for comparable races; random outline parameters are shared by visuals and physics.
export function contour(a,seed=0){return 1+.16*Math.sin(3*a+seed)+.10*Math.sin(5*a-seed*.7)+.06*Math.cos(7*a+seed);}
export function obstacleDepth(p,x,z){const dx=x-p.x,dz=z-p.z,co=Math.cos(p.angle||0),si=Math.sin(p.angle||0);const u=(dx*co+dz*si)/p.rx,v=(-dx*si+dz*co)/p.rz;const radius=contour(Math.atan2(v,u),p.seed);return Math.max(0,Math.min(1,1-Math.hypot(u,v)/radius));}
export function terrainHeight(p,x,z){return p.kind==='pool'?0:Math.sin(obstacleDepth(p,x,z)*Math.PI/2)**1.5*p.height;}
export function createCourse(seed=517){let state=seed>>>0;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};const supplies=[];
 // One can every 150 m on alternating sides: about 33 cans, enough for 5 km only if you collect most of them.
 const cans=Math.floor((RACE_LENGTH-120)/150);for(let i=0;i<cans;i++){const z=-80-i*150,side=i%2?1:-1;supplies.push({kind:'fuel',x:roadCenter(z)+side*(3+rand()*6),z});}
 for(let i=0;i<Math.floor((RACE_LENGTH-200)/400);i++){const z=-200-i*400;supplies.push({kind:'nitro',x:roadCenter(z)+(rand()-.5)*20,z});}
 const obstacles=[];for(let i=0;i<Math.floor((RACE_LENGTH-120)/23);i++){const kind=['pool','dune','rock'][i%3],rx=kind==='dune'?3+rand()*2:1.8+rand()*2,rz=kind==='dune'?4+rand()*2:2+rand()*2;const p={kind,x:roadCenter(-75-i*23)+(rand()-.5)*30,z:-75-i*23,rx,rz,r:Math.max(rx,rz)*1.35,angle:rand()*Math.PI,seed:rand()*10,height:kind==='dune'?1.1:kind==='rock'?.75:0};if(supplies.some(f=>Math.hypot(f.x-p.x,f.z-p.z)<p.r+4))continue;obstacles.push(p);}
 return {obstacles,supplies};
}
export function finishCrossings(cars,previous,time,dt,count){const crossings=[];for(let i=0;i<cars.length;i++){const c=cars[i];if(!c.dead&&!c.finished&&c.z<=-RACE_LENGTH){const fraction=Math.max(0,Math.min(1,(previous[i]+RACE_LENGTH)/(previous[i]-c.z)));crossings.push({c,t:time-dt+fraction*dt});}}crossings.sort((a,b)=>a.t-b.t||a.c.id-b.c.id);for(const {c,t} of crossings){c.finished=true;c.finishPlace=++count;c.finishTime=t;c.z=-RACE_LENGTH;c.vx=c.vz=0;c.boost=0;}return count;}
export function raceOrder(cars){return [...cars].sort((a,b)=>{if(a.finished||b.finished){if(a.finished&&b.finished)return a.finishPlace-b.finishPlace;return a.finished?-1:1;}if(a.dead!==b.dead)return a.dead?1:-1;return a.z-b.z||a.id-b.id;});}
