import {clamp} from './game.js';
export class Effects{
 constructor(canvas){this.canvas=canvas;this.c=canvas.getContext('2d');this.W=1;this.H=1;this.particles=[];this.blasts=[];this.hue=195;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches}
 resize(W,H){this.W=W;this.H=H;const d=Math.min(devicePixelRatio,1.7);this.canvas.width=Math.round(W*d);this.canvas.height=Math.round(H*d);this.c.setTransform(d,0,0,d,0,0)}
 reset(){this.particles=[];this.blasts=[];this.hue=195}
 fire(origin,shoulder,power,now,hue=195,kind='kame',direction=null){
  const forward=Boolean(direction?.forward);
  let dx=forward?0:direction?.x??origin.x-shoulder.x,dy=forward?0:direction?.y??origin.y-shoulder.y;
  const mag=Math.hypot(dx,dy),toward=!direction&&mag<this.W*.19;
  if(!mag){dx=1;dy=0}else{dx/=mag;dy/=mag}
  this.blasts.push({origin,dx,dy,power,at:now,toward,hue,kind,forward});
  this.blasts=this.blasts.slice(-4);
  for(let i=0;i<(kind==='genki'?105:70);i++){
   const angle=Math.random()*Math.PI*2,s=(kind==='genki'?90:120)+Math.random()*(kind==='genki'?720:650);
   this.particles.push({hue,x:origin.x,y:origin.y,vx:Math.cos(angle)*s,vy:Math.sin(angle)*s,life:.4+Math.random()*1.1,max:1.5,size:1+Math.random()*4});
  }
 }
 glow(x,y,r,alpha=1){const c=this.c;if(r<=0)return;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(255,255,255,${alpha})`);g.addColorStop(.13,`hsla(${this.hue},100%,88%,${alpha})`);g.addColorStop(.3,`hsla(${this.hue},100%,62%,${alpha*.8})`);g.addColorStop(.6,`hsla(${this.hue},100%,50%,${alpha*.26})`);g.addColorStop(1,'rgba(0,70,255,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2)}
 orb(p,q,t,kind='kame'){const c=this.c,r=(kind==='genki'?18:14)+q*(kind==='genki'?58:45),pulse=1+Math.sin(t*.009)*.04;c.save();c.globalCompositeOperation='lighter';this.glow(p.x,p.y,r*4,.25+q*.5);this.glow(p.x,p.y,r*pulse,1);for(let j=0;j<(kind==='genki'?5:3);j++){c.save();c.translate(p.x,p.y);c.rotate(t*.001*(j%2?1:-1)+j*1.3);c.strokeStyle=`hsla(${this.hue},100%,78%,${.35+q*.45})`;c.lineWidth=1+j*.6;c.beginPath();c.ellipse(0,0,r*(1.2+j*.24),r*(kind==='genki'?.4+j*.08:.4),0,0,Math.PI*2);c.stroke();c.restore()}
 for(let i=0;i<42;i++){const k=(i*.618+t*.00025*(.4+q))%1,angle=i*2.4+t*.0003,d=(1-k)*(75+q*180)+r*.3;const x=p.x+Math.cos(angle)*d,y=p.y+Math.sin(angle)*d;c.globalAlpha=Math.sin(k*Math.PI)*(.4+q*.6);c.strokeStyle=`hsl(${this.hue} 100% 78%)`;c.lineWidth=i%3?1:2;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(angle)*12*(1-k),y+Math.sin(angle)*12*(1-k));c.stroke()}
 c.globalAlpha=1;if(q>.5){for(let j=0;j<(kind==='genki'?5:3);j++){c.beginPath();for(let i=0;i<14;i++){let a=i/13*Math.PI*1.2+j*2.1+t*.001;let rr=r*(1.2+.12*Math.sin(i*17+t*.019));const x=p.x+Math.cos(a)*rr,y=p.y+Math.sin(a)*rr;i?c.lineTo(x,y):c.moveTo(x,y)}c.strokeStyle=`hsl(${this.hue} 100% 88%)`;c.lineWidth=1;c.stroke()}}if(q>.86){c.globalAlpha=.65;for(let j=0;j<12;j++){const a=j*2.399+t*.002,rr=r*(1.65+(j%3)*.16);c.beginPath();c.moveTo(p.x+Math.cos(a)*rr,p.y+Math.sin(a)*rr);c.lineTo(p.x+Math.cos(a)*rr*1.35,p.y+Math.sin(a)*rr*1.35);c.strokeStyle=`hsl(${this.hue} 100% 90%)`;c.lineWidth=1.5;c.stroke()}}c.restore()}
 aura(b,charge,t){
  const c=this.c,hue=this.hue,height=Math.max(b.width*2,b.bottom-b.top),cx=b.x,cy=(b.top+b.bottom)/2,rx=Math.max(20,b.width*(.85+charge*.15)),ry=height*.55;
  c.save();c.translate(cx,cy);c.scale(rx,ry);c.globalCompositeOperation='lighter';
  const haze=c.createRadialGradient(0,0,.1,0,0,1.3);haze.addColorStop(0,`hsla(${hue},100%,64%,.04)`);haze.addColorStop(.55,`hsla(${hue},100%,55%,${.11+charge*.08})`);haze.addColorStop(.88,`hsla(${hue},100%,58%,${.26+charge*.1})`);haze.addColorStop(1,`hsla(${hue},100%,45%,0)`);c.fillStyle=haze;c.fillRect(-1.3,-1.3,2.6,2.6);c.restore();
  c.save();c.globalCompositeOperation='lighter';
  // Continuous flame ribbons rise around the body rather than covering the face.
  for(let side of [-1,1])for(let j=0;j<3;j++){
   c.beginPath();for(let k=0;k<=26;k++){
    const u=k/26,y=b.bottom-height*u,x=cx+side*(rx*Math.sin(Math.PI*(u*.88+.05))*(.82+j*.12)+Math.sin(u*19-t*.003+j*2)*b.width*.08*(1-u));
    k?c.lineTo(x,y):c.moveTo(x,y);
   }c.strokeStyle=`hsla(${hue},100%,${70+j*7}%,${.3+charge*.15-j*.045})`;c.lineWidth=j===0?2.5:1.2;c.stroke();
  }
  for(let i=0;i<22;i++){
   const u=(i*.618+t*.00016*(1+charge))%1,side=i%2?1:-1,x=cx+side*rx*(.8+.3*Math.sin(i*7+u*3)),y=b.bottom-height*u;
   c.globalAlpha=Math.sin(u*Math.PI)*(.5+charge*.25);c.fillStyle=`hsl(${hue} 100% 80%)`;c.beginPath();c.ellipse(x,y,1+(i%3)*.5,3+charge*4,side*.2,0,7);c.fill();
  }
  c.globalAlpha=.4;c.strokeStyle=`hsl(${hue} 100% 75%)`;c.lineWidth=1.5;c.beginPath();c.ellipse(cx,b.bottom,rx*.95,Math.max(5,b.width*.17),0,0,Math.PI*2);c.stroke();c.restore();
 }
 drawEnergy(clouds,now){
  const c=this.c;
  c.save();c.globalCompositeOperation='lighter';
  for(const e of clouds){
   this.hue=e.hue??195;
   const life=clamp(e.life/(e.maxLife||3200)),strength=clamp(e.amount/(e.initialAmount||e.amount));
   const r=3+Math.min(18,Math.sqrt(Math.max(0,e.amount))*30);
   this.glow(e.x,e.y,r*3,life*strength*.34);this.glow(e.x,e.y,r,life*strength*.9);
   c.globalAlpha=life*strength*.7;c.fillStyle=`hsl(${this.hue} 100% 88%)`;c.beginPath();c.arc(e.x,e.y,Math.max(1.2,r*.24),0,7);c.fill();
   c.globalAlpha=life*strength*.42;c.strokeStyle=`hsl(${this.hue} 100% 78%)`;c.lineWidth=1.3;c.beginPath();c.moveTo(e.x-e.vx*70,e.y-e.vy*70);c.lineTo(e.x,e.y);c.stroke();
   for(let j=0;j<3;j++){const a=now*.001*(j%2?-.8:.65)+j*2.1,r2=r*(1.4+j*.45);c.globalAlpha=life*strength*.28;c.beginPath();c.moveTo(e.x+Math.cos(a)*r*.7,e.y+Math.sin(a)*r*.7);c.lineTo(e.x+Math.cos(a)*r2,e.y+Math.sin(a)*r2);c.stroke()}
  }
  c.restore();
 }
 draw(now,dt,{actors=[],energy=[],intro=false}={}){
  const c=this.c,W=this.W,H=this.H;c.clearRect(0,0,W,H);
  if(intro){this.hue=195;const p={x:W*.5,y:H*.4};this.orb(p,.6,now);c.save();const g=c.createRadialGradient(p.x,p.y,50,p.x,p.y,Math.max(W,H)*.65);g.addColorStop(0,'#0a9fff00');g.addColorStop(1,'#01050ebb');c.fillStyle=g;c.fillRect(0,0,W,H);c.restore()}
  this.drawEnergy(energy,now);
  for(const actor of actors){this.hue=actor.hue;this.aura(actor.body,actor.charge,now);const {guide,point,charge,kind}=actor;
  if(guide){c.save();c.strokeStyle=`hsla(${this.hue},90%,85%,.3)`;c.lineWidth=9;c.lineCap='round';for(const [a,b] of [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[24,26]]){c.beginPath();c.moveTo(guide[a].x,guide[a].y);c.lineTo(guide[b].x,guide[b].y);c.stroke()}c.beginPath();c.arc(guide[0].x,guide[0].y,19,0,7);c.stroke();c.restore()}
  if(point&&charge>0){this.orb(point,charge,now,kind)}
  }
  let flash=0;
  for(const b of this.blasts){this.hue=b.hue;const age=(now-b.at)/1000,p=b.origin,power=b.power;const fade=clamp((1.5-age)/.5),growth=clamp(age/.17);c.save();c.globalCompositeOperation='lighter';
   if(b.forward){
    const progress=clamp(age/.95),x=p.x,y=p.y;
    const radius=(b.kind==='genki'?28+power*54:22+power*34)*(1+progress*4.8);
    this.glow(x,y,radius*1.9,fade*.55);this.glow(x,y,radius,fade);
    c.strokeStyle=`hsla(${this.hue},100%,88%,${fade*.9})`;c.lineWidth=2+power*3;
    for(let j=0;j<7;j++){const pulse=radius*(.45+j*.2);c.globalAlpha=fade*(.9-j*.1);c.beginPath();c.ellipse(x,y,pulse,pulse*(.72+j*.035),now*.001*(j%2?1:-1),0,7);c.stroke()}
    c.globalAlpha=fade*.45;c.lineWidth=3+power*5;c.beginPath();c.arc(x,y,radius*.52,0,7);c.stroke();
    if(b.kind==='kame'){for(let j=0;j<22;j++){const a=j*2.399,r0=radius*.62,r1=radius*(1.1+(j%4)*.18);c.beginPath();c.moveTo(x+Math.cos(a)*r0,y+Math.sin(a)*r0);c.lineTo(x+Math.cos(a)*r1,y+Math.sin(a)*r1);c.stroke()}}
   }else if(b.kind==='genki'){
    const travel=Math.max(W,H)*1.25*clamp(age/.95),x=p.x+b.dx*travel,y=p.y+b.dy*travel;
    const radius=(24+power*48)*(1+.18*Math.sin(now*.025));
    this.glow(x,y,radius*4.8,fade*.46);this.glow(x,y,radius,fade);
    c.strokeStyle=`hsla(${this.hue},100%,88%,${fade*.85})`;c.lineWidth=2+power*3;
    for(let j=0;j<4;j++){c.beginPath();c.ellipse(x,y,radius*(1.05+j*.2),radius*(.72+j*.13),now*.001*(j%2?1:-1)+j*.6,0,7);c.stroke()}
    c.strokeStyle=`hsla(${this.hue},100%,76%,${fade*.5})`;c.lineWidth=3;
    c.beginPath();c.moveTo(p.x,p.y);c.lineTo(x-b.dx*radius*.7,y-b.dy*radius*.7);c.stroke();
    for(let j=0;j<14;j++){const a=j*2.399+now*.002,r=radius*(1.4+(j%4)*.3);c.globalAlpha=fade*.42;c.beginPath();c.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);c.lineTo(x+Math.cos(a)*r*1.5,y+Math.sin(a)*r*1.5);c.stroke()}
   }else if(b.toward){const radius=(22+Math.pow(clamp(age/.7),.65)*Math.max(W,H)*.95)*(.55+power*.45);this.glow(p.x,p.y,radius,fade*.95);for(let j=0;j<5;j++){const cycle=(age*1.6-j*.17);if(cycle>0&&cycle<1.2){c.strokeStyle=`hsla(${this.hue},100%,82%,${fade*(1-cycle/1.2)*.8})`;c.lineWidth=3+power*5;c.beginPath();c.ellipse(p.x,p.y,cycle*W*1.5,cycle*H*.95,0,0,7);c.stroke()}}}
   else{const len=Math.max(W,H)*1.7*growth,base=(14+power*42)*(1+Math.sin(now*.035)*.07);c.translate(p.x,p.y);c.rotate(Math.atan2(b.dy,b.dx));for(let j=4;j>=0;j--){const widths=[.55,1,1.7,2.7,4.5],col=[96,86,65,52,45].map(l=>`hsl(${this.hue} 100% ${l}%)`);c.globalAlpha=fade*(j>2?.14:.75);c.fillStyle=col[j];c.beginPath();c.moveTo(0,-base*widths[j]*.5);c.lineTo(len,-base*widths[j]*1.9);c.quadraticCurveTo(len+base*2,0,len,base*widths[j]*1.9);c.lineTo(0,base*widths[j]*.5);c.closePath();c.fill()}
    for(let j=0;j<9;j++){const u=((age*2+j/9)%1)*len;c.strokeStyle=`hsl(${this.hue} 100% 88%)`;c.globalAlpha=fade*.45;c.lineWidth=2;c.beginPath();c.ellipse(u,0,base*.25,base*(.6+u/len),0,0,7);c.stroke()}c.setTransform(this.canvas.width/W,0,0,this.canvas.height/H,0,0);this.glow(p.x,p.y,130+power*110,fade)}
   c.restore();if(age<.16&&!this.reduced){flash=Math.max(flash,.42*(1-age/.16))}
   if(!this.reduced){c.save();c.strokeStyle=`hsl(${this.hue} 100% 80%)`;c.lineWidth=1;for(let i=0;i<36;i++){const a=i*2.399,r=Math.max(W,H)*(.25+((i*.19+age*.8)%1));c.globalAlpha=fade*.22;c.beginPath();c.moveTo(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r);c.lineTo(p.x+Math.cos(a)*r*1.35,p.y+Math.sin(a)*r*1.35);c.stroke()}c.restore()}

  }
  if(flash){c.fillStyle=`rgba(218,250,255,${flash})`;c.fillRect(0,0,W,H)}
  this.blasts=this.blasts.filter(b=>now-b.at<1600);
  c.save();c.globalCompositeOperation='lighter';for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=60*dt;c.globalAlpha=clamp(p.life/p.max);c.fillStyle=`hsl(${p.hue} 100% 85%)`;c.beginPath();c.arc(p.x,p.y,p.size,0,7);c.fill()}c.restore();this.particles=this.particles.filter(p=>p.life>0);
 }
}
