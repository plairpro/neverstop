import {roadCenter,RACE_LENGTH} from './course.js?v=13';
export function zombieLayout(){return Array.from({length:42},(_,i)=>{const z=-85-i*(RACE_LENGTH-180)/41;return {x:roadCenter(z)+Math.sin(i*2.39)*13,z,homeX:roadCenter(z)+Math.sin(i*2.39)*13,phase:i*1.73,hit:false,age:0,vx:0,vz:0};});}
export function hitZombie(car,z){if(car.dead||car.finished||z.hit)return false;
 const ax=car.prevX??car.x,az=car.prevZ??car.z,dx=car.x-ax,dz=car.z-az,l=dx*dx+dz*dz;
 const t=l?Math.max(0,Math.min(1,((z.x-ax)*dx+(z.z-az)*dz)/l)):0;
 if(Math.hypot(z.x-ax-dx*t,z.z-az-dz*t)>1.9)return false;
 z.hit=true;z.age=0;z.vx=car.vx*.25+(z.x>car.x?2:-2);z.vz=car.vz*.24;
 car.vx*=.78;car.vz*=.78;return true;
}
