export const RACE_LENGTH=1200;
// Deterministic layout for comparable races; random outline parameters are shared by visuals and physics.
export function contour(a,seed=0){return 1+.16*Math.sin(3*a+seed)+.10*Math.sin(5*a-seed*.7)+.06*Math.cos(7*a+seed);}
export function obstacleDepth(p,x,z){const dx=x-p.x,dz=z-p.z,co=Math.cos(p.angle||0),si=Math.sin(p.angle||0);const u=(dx*co+dz*si)/p.rx,v=(-dx*si+dz*co)/p.rz;const radius=contour(Math.atan2(v,u),p.seed);return Math.max(0,Math.min(1,1-Math.hypot(u,v)/radius));}
export function terrainHeight(p,x,z){return p.kind==='pool'?0:Math.sin(obstacleDepth(p,x,z)*Math.PI/2)**1.5*p.height;}
export function createCourse(seed=517){let state=seed>>>0;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};const supplies=[];
 for(let i=0;i<7;i++)supplies.push({kind:'fuel',x:(rand()-.5)*24,z:-95-i*165});
 for(let i=0;i<6;i++)supplies.push({kind:'nitro',x:(rand()-.5)*27,z:-155-i*170});
 const obstacles=[];for(let i=0;i<50;i++){const kind=['pool','dune','rock'][i%3],rx=kind==='dune'?3+rand()*2:1.8+rand()*2,rz=kind==='dune'?4+rand()*2:2+rand()*2;const p={kind,x:(rand()-.5)*34,z:-55-i*22,rx,rz,r:Math.max(rx,rz)*1.35,angle:rand()*Math.PI,seed:rand()*10,height:kind==='dune'?1.1:kind==='rock'?.75:0};if(supplies.some(f=>Math.hypot(f.x-p.x,f.z-p.z)<p.r+4))continue;obstacles.push(p);}
 return {obstacles,supplies};
}
export function finishCrossings(cars,previous,time,dt,count){const crossings=[];for(let i=0;i<cars.length;i++){const c=cars[i];if(!c.dead&&!c.finished&&c.z<=-RACE_LENGTH){const fraction=Math.max(0,Math.min(1,(previous[i]+RACE_LENGTH)/(previous[i]-c.z)));crossings.push({c,t:time-dt+fraction*dt});}}crossings.sort((a,b)=>a.t-b.t||a.c.id-b.c.id);for(const {c,t} of crossings){c.finished=true;c.finishPlace=++count;c.finishTime=t;c.z=-RACE_LENGTH;c.vx=c.vz=0;c.boost=0;}return count;}
