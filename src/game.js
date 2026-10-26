export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const MAX_CHARGE_MS=3000;
const LOSS_TO_SPILL_MS=350;
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:((a.z||0)+(b.z||0))/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const confidence=p=>Number(p?.visibility??p?.presence??0);
const visible=(p,threshold=.28)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&confidence(p)>=threshold;
function angle(a,b,c){
 const u=[a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0)],v=[c.x-b.x,c.y-b.y,(c.z||0)-(b.z||0)];
 return Math.acos(clamp(u.reduce((s,x,i)=>s+x*v[i],0)/(Math.hypot(...u)*Math.hypot(...v)||1),-1,1))*180/Math.PI;
}
// Image coordinates are aspect-corrected; all gesture distances use torso scale.
// Torso tracking remains available when one or more arm landmarks are missing.
// Gesture actions require a fresh, high-quality upper-body observation.
export function features(p,world){
 if(!p||[11,12,23,24].some(i=>!visible(p[i],.24)))return null;
 const shoulder=mid(p[11],p[12]),hip=mid(p[23],p[24]);
 const wrists=[p[15],p[16]].filter(v=>visible(v,.28));
 const elbows=[p[13],p[14]].filter(v=>visible(v,.28));
 const hand=wrists.length===2?midpoint(p[15],p[16]):wrists[0]||shoulder;
 const scale=Math.max(.07,dist(shoulder,hip)*.8,dist(p[11],p[12]));
 const gestureReady=wrists.length===2&&elbows.length===2;
 const q=world?.length===33?world:p;
 const extension=gestureReady?(angle(q[11],q[13],q[15])+angle(q[12],q[14],q[16]))/2:0;
 const shoulderDepth=Math.hypot(q[11].x-q[12].x,q[11].y-q[12].y,(q[11].z||0)-(q[12].z||0))||scale;
 const depth=gestureReady?((q[11].z+q[12].z-q[15].z-q[16].z)/2)/shoulderDepth:0;
 const handGap=gestureReady?dist(p[15],p[16])/scale:Infinity;
 const close=gestureReady&&handGap<.95;
 const relative={x:(hand.x-shoulder.x)/scale,y:(hand.y-shoulder.y)/scale};
 const beside=Math.abs(relative.x)>.26&&Math.abs(relative.x)<1.8;
 const low=relative.y>.15&&hand.y<hip.y+scale*.5;
 const wristsAboveShoulders=gestureReady&&p[15].y<shoulder.y-scale*.28&&p[16].y<shoulder.y-scale*.28;
 const overhead=wristsAboveShoulders&&hand.y<shoulder.y-scale*.48;
 const genkiCharge=overhead&&handGap<1.8;
 const kameCharge=close&&beside&&low&&extension<148;
 const mode=genkiCharge?'genki':kameCharge?'kame':null;
 return {hand,shoulder,hip,scale,relative,depth,extension,close,releaseClose:gestureReady&&handGap<1.55,
  overhead,genkiCharge,kameCharge,mode,charge:Boolean(mode),chargePoint:hand,
  extended:gestureReady&&close&&(extension>147||depth>1.05),gestureReady,
  quality:{torso:Math.min(...[11,12,23,24].map(i=>confidence(p[i]))),arms:Math.min(...[13,14,15,16].map(i=>confidence(p[i])))}
 };
}
function midpoint(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:((a.z||0)+(b.z||0))/2}}
export class Game{
 constructor(){this.reset()}
 reset({keepReserve=false}={}){
  const reserve=keepReserve?this.reserve??0:0,reserveMode=keepReserve?this.reserveMode??null:null;
  this.phase='idle';this.mode=null;this.charge=0;this.chargeTime=0;this.hold=0;this.lost=0;this.anchor=null;this.until=0;this.shot=null;this.last=null;this.previousAt=0;this.pushSince=null;this.pushSample=null;this.spill=null;this.reserve=reserve;this.reserveMode=reserveMode;
 }
 addEnergy(amount,mode=null){
  if(!(amount>0)||this.phase==='blast'||this.phase==='cooldown')return 0;
  if(this.phase==='charging'){
   const room=1-this.charge,added=Math.min(room,amount);
   this.chargeTime=Math.min(MAX_CHARGE_MS,this.chargeTime+added*MAX_CHARGE_MS);this.charge=this.chargeTime/MAX_CHARGE_MS;return added;
  }
  const room=1-this.reserve,added=Math.min(room,amount);
  this.reserve+=added;if(added>0&&mode&&!this.reserveMode)this.reserveMode=mode;return added;
 }
 takeSpill(){const spill=this.spill;this.spill=null;return spill}
 step(now,dt,f){
  const gestureAvailable=Boolean(f&&f.gestureReady!==false);
  if(this.phase==='blast'){if(now>=this.until){this.phase='cooldown';this.until=now+900;return 'end'}return null}
  if(this.phase==='cooldown'){if(now>=this.until)this.reset();return null}
  if(!gestureAvailable){
   this.pushSince=null;this.pushSample=null;this.hold=0;this.lost+=dt;
   if(this.lost>LOSS_TO_SPILL_MS&&this.phase==='charging'&&this.charge>.02){
    const last=this.last,spill={x:last?.hand?.x??this.anchor?.x??0,y:last?.hand?.y??this.anchor?.y??0,amount:this.charge,mode:this.mode};
    this.reset();this.spill=spill;return 'spill';
   }
   return null;
  }
  this.lost=0;this.last=f;this.previousAt=now;
  if(this.phase==='idle'){
   this.hold=f.charge?this.hold+dt:0;
   if(this.hold>=280){this.phase='charging';this.mode=f.mode||this.reserveMode||'kame';this.anchor={...f.relative,depth:f.depth,extension:f.extension};this.chargeTime=Math.min(MAX_CHARGE_MS,200+this.reserve*MAX_CHARGE_MS);this.reserve=0;this.reserveMode=null;this.charge=this.chargeTime/MAX_CHARGE_MS;return 'charge'}return null;
  }
  const dx=f.relative.x-this.anchor.x,dy=f.relative.y-this.anchor.y;
  const movement=Math.hypot(dx,dy),depthMove=f.depth-this.anchor.depth;
  const towardCenter=-Math.sign(this.anchor.x)*dx;
  const extending=f.extension-this.anchor.extension>8;
  const lateral=Math.abs(dx)>.28&&Math.abs(dx)>Math.abs(dy)*.45;
  const forwardPush=depthMove>.24&&Math.abs(dx)<.75&&Math.abs(dy)<.95;
  const projectedPush=this.mode==='genki'
   ? movement>.30&&lateral
   : movement>.32&&(towardCenter>.26||dy<-.28||lateral||(Math.abs(dx)>.36&&extending));
  const handsTogether=f.releaseClose??f.close;
  const releaseHeight=this.mode==='genki'?dy<.72:dy<.2;
  const pushing=this.charge>.18&&handsTogether&&releaseHeight&&(projectedPush||forwardPush);
  if(pushing){
   const sample=f.sampleAt??now;
   if(this.pushSince===null){this.pushSince=now;this.pushSample=sample}
   if(now-this.pushSince>=65&&sample!==this.pushSample){
    const forward=forwardPush;
    const directionX=forward?0:Math.sign(Math.abs(dx)>.12?dx:f.relative.x||-this.anchor.x)||1;
    const directionY=forward?0:Math.max(-.16,Math.min(.16,dy));
    const directionLength=Math.hypot(directionX,directionY)||1;
    this.phase='blast';this.until=now+1450;
    this.shot={...f,power:this.charge,at:now,mode:this.mode,direction:{x:directionX/directionLength,y:directionY/directionLength,forward}};
    return 'fire';
   }
  }else{this.pushSince=null;this.pushSample=null}
  if(f.charge){this.chargeTime=Math.min(MAX_CHARGE_MS,this.chargeTime+dt);this.charge=this.chargeTime/MAX_CHARGE_MS;this.hold=0}
  else{this.hold+=dt;if(!(f.releaseClose??f.close)||this.hold>1100){this.chargeTime=Math.max(0,this.chargeTime-dt*(MAX_CHARGE_MS/650));this.charge=this.chargeTime/MAX_CHARGE_MS;if(this.charge===0){this.reset();return 'cancel'}}}
  return null;
 }
}

