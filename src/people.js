import {Game,features,clamp} from './game.js';
export const COLORS=[{name:'青',hue:195},{name:'金',hue:42},{name:'桃',hue:320},{name:'緑',hue:140}];
const visible=p=>p&&(p.visibility??0)>.3&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
export function body(p){
 if(!p||![11,12].some(i=>visible(p[i]))||[0,11,12,23,24].filter(i=>visible(p[i])).length<2)return null;
 const shoulders=[p[11],p[12]].filter(visible),s=shoulders.length===2?midpoint(...shoulders):shoulders[0];
 const hips=[p[23],p[24]].filter(visible);
 const width=Math.max(.06,shoulders.length===2?Math.hypot(p[11].x-p[12].x,p[11].y-p[12].y):.13);
 const hip=hips.length===2?midpoint(...hips):hips[0]||{x:s.x,y:s.y+width*1.25};
 const scale=Math.max(width,Math.hypot(hip.x-s.x,hip.y-s.y)*.8,.07);
 const top=visible(p[0])?Math.min(p[0].y-scale*.35,s.y-scale*.45):s.y-scale*.8;
 const feet=[p[27],p[28]].filter(visible),bottom=feet.length?Math.max(hip.y+scale*.4,...feet.map(v=>v.y))+scale*.1:hip.y+scale*1.5;
 return {x:(s.x+hip.x)/2,y:(s.y+hip.y)/2,scale,top,bottom,shoulder:s,hip};
}
// Spatial tracking only: no identity recognition or persistent person data.
export class People{
 constructor(){this.reset()}
 reset(){this.tracks=[];this.nextId=1;this.energy=[];this.energyAt=null;this.energyId=1;this.collectedEnergy=0}
 update(poses,world,at,aspect=1){
  this.advanceEnergy(at);this.collectedEnergy=0;
  const detections=poses.slice(0,4).map((p,i)=>{const points=p.map(v=>({...v,x:v.x*aspect}));const b=body(points);if(!b)return null;const f=features(points,world?.[i]);if(f)f.sampleAt=at;return {body:b,points,feature:f}}).filter(Boolean);
  this.tracks=this.tracks.filter(t=>at-t.at<1400);
  const old=this.tracks;
  const cost=(t,d)=>{const dt=Math.min(.35,Math.max(0,(at-t.at)/1000)),s=Math.max(t.body.scale,d.body.scale);const distance=Math.hypot(d.body.x-t.body.x-t.vx*dt,d.body.y-t.body.y-t.vy*dt)/s;return distance>1.45?Infinity:distance+.25*Math.abs(Math.log(d.body.scale/t.body.scale))};
  let best={cost:Infinity,pairs:[]};
  function assign(i,used,sum,pairs){if(sum>=best.cost)return;if(i===detections.length){best={cost:sum,pairs:[...pairs]};return}assign(i+1,used,sum+1.5,[...pairs,-1]);for(let j=0;j<old.length;j++)if(!used.has(j)){const c=cost(old[j],detections[i]);if(c<1.5){used.add(j);assign(i+1,used,sum+c,[...pairs,j]);used.delete(j)}}}
  assign(0,new Set(),0,[]);old.forEach(t=>t.present=false);
  const matched=new Set(best.pairs.filter(i=>i>=0));
  // Retain missing colors briefly, but never withhold a slot from a visible person.
  let retained=old.filter((t,i)=>matched.has(i));
  for(let i=0;i<detections.length;i++){
   const d=detections[i],j=best.pairs[i];let t=j>=0?old[j]:null;
   if(t){const dt=Math.max(.04,(at-t.at)/1000);t.vx=.55*t.vx+.45*(d.body.x-t.body.x)/dt;t.vy=.55*t.vy+.45*(d.body.y-t.body.y)/dt;
    if(at-t.at>650)t.game.reset();
    const s=t.smooth;t.smooth={...d.body,x:s.x*.3+d.body.x*.7,y:s.y*.3+d.body.y*.7,scale:s.scale*.3+d.body.scale*.7,top:s.top*.3+d.body.top*.7,bottom:s.bottom*.3+d.body.bottom*.7};
   }else{const slot=COLORS.findIndex((_,k)=>!retained.some(t=>t.slot===k));t={id:this.nextId++,slot,game:new Game(),vx:0,vy:0,smooth:d.body};retained.push(t)}
   Object.assign(t,d,{at,present:true});
  }
  for(const t of old)if(!t.present&&retained.length<4&&!retained.some(r=>r.slot===t.slot))retained.push(t);
  this.tracks=retained;
  this.collectEnergy(at);
  return this.active(at);
 }
 advanceEnergy(at){
  if(this.energyAt===null){this.energyAt=at;return}
  const dt=Math.max(0,(at-this.energyAt)/1000);this.energyAt=at;if(!dt)return;
  this.energy=this.energy.map(e=>{const life=e.life-dt*1000;return {...e,x:e.x+e.vx*dt,y:e.y+e.vy*dt,vy:e.vy+e.gravity*dt,life,amount:e.initialAmount*clamp(life/e.maxLife)}}).filter(e=>e.life>0&&e.amount>.001);
 }
 scatterEnergy(spill,at){
  if(!spill||!(spill.amount>.02))return;
  const count=14,share=spill.amount/count;
  for(let i=0;i<count;i++){
   const angle=i*2.399963, speed=.028+((i*17)%7)*.004;
   this.energy.push({id:this.energyId++,x:spill.x+Math.cos(angle)*.015,y:spill.y+Math.sin(angle)*.015,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-.012,gravity:.018,amount:share,initialAmount:share,life:3200,maxLife:3200,availableAt:at+450,mode:spill.mode||'kame',hue:spill.hue??195});
  }
  this.energyAt=at;this.energy=this.energy.slice(-160);
 }
 collectEnergy(at){
  if(!this.energy.length)return;
  const present=this.tracks.filter(t=>t.present&&t.body);
  for(const particle of this.energy){
   if(at<particle.availableAt)continue;
   let target=null,best=Infinity;
   for(const t of present){
    const points=[];if(t.feature?.hand)points.push({point:t.feature.hand,radius:t.body.scale*.95});
    points.push({point:{x:t.body.x,y:t.body.y},radius:t.body.scale*1.05});
    for(const {point,radius} of points){const d=Math.hypot(particle.x-point.x,particle.y-point.y);if(d<radius&&d<best){best=d;target=t}}
   }
   if(!target)continue;
   const got=target.game.addEnergy(particle.amount,particle.mode);particle.amount-=got;this.collectedEnergy+=got;
  }
  this.energy=this.energy.filter(e=>e.amount>.001&&e.life>0);
 }
 active(now){return this.tracks.filter(t=>t.present&&now-t.at<950)}
}
