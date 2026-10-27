import {Game,features,clamp} from './game.js';
export const COLORS=[{name:'青',hue:195},{name:'金',hue:42},{name:'桃',hue:320},{name:'緑',hue:140}];
const TRACK_MAX_AGE_MS=1400;
const RENDER_HOLD_MS=220;
const GAME_FRESH_MS=130;
const PREDICT_LIMIT_MS=60;
const ASSOCIATION_MARGIN=.22;
const TORSO_JOINTS=[11,12,23,24];
const visible=(p,min=.22)=>p&&(p.visibility??p.presence??0)>min&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:((a.z||0)+(b.z||0))/2});
export function body(p){
 if(!p||![11,12].some(i=>visible(p[i]))||[0,11,12,23,24].filter(i=>visible(p[i])).length<2)return null;
 const shoulders=[p[11],p[12]].filter(v=>visible(v)),s=shoulders.length===2?midpoint(...shoulders):shoulders[0];
 const hips=[p[23],p[24]].filter(v=>visible(v));
 const width=Math.max(.06,shoulders.length===2?Math.hypot(p[11].x-p[12].x,p[11].y-p[12].y):.13);
 const hip=hips.length===2?midpoint(...hips):hips[0]||{x:s.x,y:s.y+width*1.25};
 const scale=Math.max(width,Math.hypot(hip.x-s.x,hip.y-s.y)*.8,.07);
 const top=visible(p[0])?Math.min(p[0].y-scale*.35,s.y-scale*.45):s.y-scale*.8;
 const feet=[p[27],p[28]].filter(v=>visible(v)),bottom=feet.length?Math.max(hip.y+scale*.4,...feet.map(v=>v.y))+scale*.1:hip.y+scale*1.5;
 return {x:(s.x+hip.x)/2,y:(s.y+hip.y)/2,scale,top,bottom,shoulder:s,hip,width};
}
function signature(b,points){
 return {orientation:Math.atan2(b.hip.y-b.shoulder.y,b.hip.x-b.shoulder.x),width:b.width,scale:b.scale,
  widthReliable:[11,12].every(i=>visible(points[i])),torsoReliable:TORSO_JOINTS.every(i=>visible(points[i]))};
}
function associationCost(t,d,at){
 // Use observations, never the render filter, to extrapolate a person's path.
 const dt=Math.min(.45,Math.max(0,(at-t.at)/1000)),b=t.body;
 const dx=t.vx*dt,dy=t.vy*dt,s=Math.max(.06,b.scale,d.body.scale);
 const distance=Math.hypot(d.body.x-b.x-dx,d.body.y-b.y-dy)/s;
 if(distance>1.25)return Infinity;
 const joints=TORSO_JOINTS.filter(i=>visible(t.points[i])&&visible(d.points[i]));
 const jointDistance=joints.length?joints.reduce((sum,i)=>sum+Math.hypot(d.points[i].x-t.points[i].x-dx,d.points[i].y-t.points[i].y-dy)/s,0)/joints.length:distance;
 const a=t.signature,c=d.signature;
 const width=a.widthReliable&&c.widthReliable?Math.abs(Math.log(Math.max(.02,c.width)/Math.max(.02,a.width))):0;
 // Shoulder width is supporting evidence, not a hard identity gate: turning
 // sideways can sharply shrink it without changing the person.
 const orientation=a.torsoReliable&&c.torsoReliable?Math.abs(Math.atan2(Math.sin(c.orientation-a.orientation),Math.cos(c.orientation-a.orientation))):0;
 return distance+.35*jointDistance+.45*width+.12*orientation+.25*Math.abs(Math.log(c.scale/a.scale));
}
function assignment(costs,forbiddenI=-1,forbiddenJ=-1){
 let best={cost:Infinity,pairs:[]};
 const visit=(i,used,sum,pairs)=>{
  if(sum>=best.cost)return;
  if(i===costs.length){best={cost:sum,pairs:[...pairs]};return}
  visit(i+1,used,sum+1.5,[...pairs,-1]);
  for(let j=0;j<costs[i].length;j++)if(!used.has(j)&&!(i===forbiddenI&&j===forbiddenJ)&&costs[i][j]<1.5){
   used.add(j);visit(i+1,used,sum+costs[i][j],[...pairs,j]);used.delete(j);
  }
 };
 visit(0,new Set(),0,[]);return best;
}
function smoothPose(previous,next,dt,previousVelocity=[]){
 if(!next)return {points:previous||[],velocities:previousVelocity};
 if(!previous)return {points:next.map(v=>({...v})),velocities:next.map(()=>({x:0,y:0,z:0}))};
 const safeDt=Math.max(.016,dt),points=[],velocities=[];
 for(let i=0;i<next.length;i++){
  const p=next[i],q=previous[i],old=previousVelocity[i]||{x:0,y:0,z:0};
  if(!visible(p,.05)){
   points.push(q?{...q,visibility:Math.max(0,(q.visibility??0)*.82)}:{...p});
   velocities.push({x:old.x*.72,y:old.y*.72,z:old.z*.72});
   continue;
  }
  const raw={x:((p.x??q?.x??0)-(q?.x??p.x??0))/safeDt,y:((p.y??q?.y??0)-(q?.y??p.y??0))/safeDt,z:((p.z??q?.z??0)-(q?.z??p.z??0))/safeDt};
  const speed=Math.hypot(raw.x,raw.y);
  const alpha=clamp(.22+speed*1.35,.22,.9);
  const confidence=Math.max(.25,Math.min(1,(p.visibility??p.presence??1)));
  const w=clamp(alpha*(.55+.45*confidence),.18,.92);
  points.push({...p,x:(q?.x??p.x)*(1-w)+p.x*w,y:(q?.y??p.y)*(1-w)+p.y*w,z:(q?.z??p.z??0)*(1-w)+(p.z??0)*w});
  velocities.push({x:old.x*.55+raw.x*.45,y:old.y*.55+raw.y*.45,z:old.z*.55+raw.z*.45});
 }
 return {points,velocities};
}
function predictPose(points,seconds,velocities=[]){
 if(!points)return null;
 const t=Math.min(seconds*1000,PREDICT_LIMIT_MS)/1000;
 return points.map((p,i)=>{const v=velocities[i]||{x:0,y:0};return {...p,x:p.x+v.x*t,y:p.y+v.y*t}});
}
function displayFeature(feature,points){
 if(!feature||!points)return feature;
 const wrists=[points[15],points[16]].filter(v=>visible(v,.05));
 const hand=wrists.length===2?midpoint(...wrists):wrists[0]||feature.hand;
 const shoulder=[points[11],points[12]].filter(v=>visible(v,.05));
 const shoulderPoint=shoulder.length===2?midpoint(...shoulder):feature.shoulder;
 return {...feature,hand,shoulder:shoulderPoint,chargePoint:hand};
}
function predictTrack(t,at){
 const age=Math.max(0,at-t.at);
 if(t.associationAmbiguous||age>RENDER_HOLD_MS||!t.renderPoints)return;
 const predicted=predictPose(t.renderPoints,age/1000,t.jointVelocity);
 const predictedBody=body(predicted);
 if(predictedBody){t.renderBody=predictedBody;t.renderFeature=displayFeature(t.feature,predicted)}
 t.present=true;t.missedMs=age;t.observationFresh=age<=GAME_FRESH_MS;
}
export class People{
 constructor(){this.reset()}
 reset(){this.tracks=[];this.nextId=1;this.observationId=1;this.energy=[];this.energyAt=null;this.energyId=1;this.collectedEnergy=0}
 update(poses,world,at,aspect=1){
  this.advanceEnergy(at);this.collectedEnergy=0;
  const detections=(poses||[]).map((p,i)=>{
   if(!Array.isArray(p))return null;
   const points=p.map(v=>({...v,x:v.x*aspect}));
   const b=body(points);if(!b)return null;
   const f=features(points,world?.[i]);
   return {body:b,points,feature:f,signature:signature(b,points)};
  }).filter(Boolean).slice(0,COLORS.length);
  this.tracks=this.tracks.filter(t=>at-t.at<TRACK_MAX_AGE_MS);
  const old=this.tracks;
  // Score the entire frame before mutating any track. Compare competing global
  // assignments so a merge, split or crossing cannot silently swap game state.
  const costs=detections.map(d=>old.map(t=>associationCost(t,d,at)));
  const best=assignment(costs),ambiguousTracks=new Set(),ambiguousDetections=new Set();
  for(let i=0;i<best.pairs.length;i++){
   const j=best.pairs[i];if(j<0)continue;
   const alternative=assignment(costs,i,j);
   if(alternative.cost-best.cost>=ASSOCIATION_MARGIN)continue;
   for(let k=0;k<best.pairs.length;k++)if(best.pairs[k]!==alternative.pairs[k]){
    ambiguousDetections.add(k);
    if(best.pairs[k]>=0)ambiguousTracks.add(best.pairs[k]);
    if(alternative.pairs[k]>=0)ambiguousTracks.add(alternative.pairs[k]);
   }
  }
  const retained=[],usedSlots=new Set(old.map(t=>t.slot)),matchedOld=new Set();
  for(const j of ambiguousTracks){old[j].associationAmbiguous=true;old[j].pending=null}
  const updateTrack=(t,d)=>{
   const dt=Math.min(.4,Math.max(.016,(at-t.at)/1000));
   const previous=t.body,gap=at-t.at;
   t.vx=gap>650?0:.35*t.vx+.65*(d.body.x-previous.x)/dt;
   t.vy=gap>650?0:.35*t.vy+.65*(d.body.y-previous.y)/dt;
   if(gap>650)t.game.reset();
   const filtered=smoothPose(t.renderPoints||t.points,d.points,dt,t.jointVelocity);
   t.renderPoints=filtered.points;t.jointVelocity=filtered.velocities;
   t.smooth=body(t.renderPoints)||d.body;t.renderBody=t.smooth;
   t.body=d.body;t.points=d.points;t.feature=d.feature;t.renderFeature=displayFeature(d.feature,t.renderPoints);
   t.signature=d.signature;t.at=at;t.lastSeenAt=at;t.missedMs=0;t.present=true;t.observationFresh=true;
   t.associationAmbiguous=false;t.pending=null;
   t.observationId=this.observationId++;t.feature&&(t.feature.sampleAt=at,t.feature.observationId=t.observationId);
   return t;
  };
  for(let i=0;i<detections.length;i++){
   const d=detections[i],j=best.pairs[i];
   if(ambiguousDetections.has(i)||(j>=0&&ambiguousTracks.has(j)))continue;
   if(j>=0){
    const t=old[j];
    if(t.associationAmbiguous||at-t.at>RENDER_HOLD_MS){
     // Require a second consistent observation before reattaching an occluded
     // track. Pending candidates never overwrite its trusted pose or velocity.
     const pending=t.pending;
     const consistent=pending&&at-pending.at<=350&&Math.hypot(d.body.x-pending.body.x,d.body.y-pending.body.y)<d.body.scale*.75;
     if(!consistent||at-pending.since<60){
      t.pending={body:d.body,at,since:consistent?pending.since:at};t.associationAmbiguous=true;continue;
     }
     t.associationBlockedUntil=at+180;
    }
    retained.push(updateTrack(t,d));matchedOld.add(j);continue;
   }
   const free=COLORS.findIndex((_,slot)=>!usedSlots.has(slot));
   if(free<0)continue;
   const observationId=this.observationId++;
   if(d.feature){d.feature.sampleAt=at;d.feature.observationId=observationId}
   const t={id:this.nextId++,slot:free,game:new Game(),vx:0,vy:0,jointVelocity:d.points.map(()=>({x:0,y:0,z:0})),body:d.body,smooth:d.body,renderBody:d.body,renderPoints:d.points,points:d.points,feature:d.feature,renderFeature:displayFeature(d.feature,d.points),signature:d.signature,at, lastSeenAt:at,missedMs:0,present:true,observationFresh:true,observationId,associationAmbiguous:false,associationBlockedUntil:0};
   retained.push(t);usedSlots.add(free);
  }
  for(let i=0;i<old.length&&retained.length<4;i++){
   const t=old[i];if(matchedOld.has(i)||at-t.at>=TRACK_MAX_AGE_MS)continue;
   t.present=false;t.observationFresh=false;predictTrack(t,at);
   retained.push(t);usedSlots.add(t.slot);
  }
  retained.sort((a,b)=>a.slot-b.slot);
  this.tracks=retained.slice(0,4);
  this.collectEnergy(at);
  return this.active(at);
 }
 featureForGame(t,at){return t&&t.present&&at-t.at<=GAME_FRESH_MS&&at>=(t.associationBlockedUntil??0)&&!t.associationAmbiguous?t.feature:null}
 advanceEnergy(at){
  if(this.energyAt===null){this.energyAt=at;return}
  const dt=Math.max(0,(at-this.energyAt)/1000);this.energyAt=at;if(!dt)return;
  this.energy=this.energy.map(e=>{const life=e.life-dt*1000;return {...e,x:e.x+e.vx*dt,y:e.y+e.vy*dt,vy:e.vy+e.gravity*dt,life,amount:e.initialAmount*clamp(life/e.maxLife)}}).filter(e=>e.life>0&&e.amount>.001);
 }
 scatterEnergy(spill,at){
  if(!spill||!(spill.amount>.02))return;
  const count=14,share=spill.amount/count;
  for(let i=0;i<count;i++){
   const angle=i*2.399963,speed=.028+((i*17)%7)*.004;
   this.energy.push({id:this.energyId++,x:spill.x+Math.cos(angle)*.015,y:spill.y+Math.sin(angle)*.015,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-.012,gravity:.018,amount:share,initialAmount:share,life:3200,maxLife:3200,availableAt:at+450,mode:spill.mode||'kame',hue:spill.hue??195});
  }
  this.energyAt=at;this.energy=this.energy.slice(-160);
 }
 collectEnergy(at){
  if(!this.energy.length)return;
  const present=this.tracks.filter(t=>t.body&&this.featureForGame(t,at));
  for(const particle of this.energy){
   if(at<particle.availableAt)continue;
   let target=null,best=Infinity;
   for(const t of present){
    const points=[];if(t.feature?.hand)points.push({point:t.feature.hand,radius:t.body.scale*.95});
    points.push({point:{x:t.body.x,y:t.body.y},radius:t.body.scale*1.05});
    for(const {point,radius}of points){const d=Math.hypot(particle.x-point.x,particle.y-point.y);if(d<radius&&d<best){best=d;target=t}}
   }
   if(!target)continue;
   const got=target.game.addEnergy(particle.amount,particle.mode);particle.amount-=got;this.collectedEnergy+=got;
  }
  this.energy=this.energy.filter(e=>e.amount>.001&&e.life>0);
 }
 active(now){
  for(const t of this.tracks){
   const age=Math.max(0,now-t.at);
   if(!t.associationAmbiguous&&age<=RENDER_HOLD_MS){t.present=true;predictTrack(t,now)}else{t.present=false;t.observationFresh=false;t.renderBody=t.smooth;t.renderFeature=t.feature}
  }
  return this.tracks.filter(t=>t.present&&now-t.at<=RENDER_HOLD_MS);
 }
}

