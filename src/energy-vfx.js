// Layered Canvas VFX. All motion is elapsed-time based; no additional renderer,
// remote assets, camera access, or inference work is required.
import {clamp} from './game.js';

export const SHOT_LIFETIME_MS = 1600;
const TAU = Math.PI * 2;
const smooth = v => {v=clamp(v);return v*v*(3-2*v)};
const color = (h,l=75,a=1) => `hsla(${h},100%,${l}%,${clamp(a)})`;
const hash = (x,y,z) => {
  let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
};
function noise(x,y,z){
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const u=smooth(x-ix),v=smooth(y-iy),w=smooth(z-iz),mix=(a,b,t)=>a+(b-a)*t;
  const plane=k=>mix(mix(hash(ix,iy,k),hash(ix+1,iy,k),u),mix(hash(ix,iy+1,k),hash(ix+1,iy+1,k),u),v);
  return mix(plane(iz),plane(iz+1),w);
}

// Bake a seamless-looking plasma surface on a sphere, including limb shading.
// A 160px reusable texture avoids per-pixel calculations in the animation loop.
export function plasmaPixels(size,hue){
  const data=new Uint8ClampedArray(size*size*4),h=((hue%360)+360)%360/60;
  const x=1-Math.abs(h%2-1),rgb=h<1?[1,x,0]:h<2?[x,1,0]:h<3?[0,1,x]:h<4?[0,x,1]:h<5?[x,0,1]:[1,0,x];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=(x+.5)/size*2-1,ny=(y+.5)/size*2-1,d=nx*nx+ny*ny;
    if(d>=1)continue;
    const z=Math.sqrt(1-d),n=noise(nx*3+8,ny*3+8,z*3+8);
    const f=noise(nx*9+n*3+20,ny*9+n*3+20,z*9+20);
    const fine=noise(nx*24+f*2+40,ny*24+f*2+40,z*24+40);
    const filament=Math.pow(Math.max(0,1-Math.abs(f-.51)*9),3);
    const hot=clamp(.08+n*.25+filament*.68+fine*.09);
    const shade=.32+.68*Math.pow(z,.65),i=(y*size+x)*4;
    for(let j=0;j<3;j++)data[i+j]=255*(rgb[j]*(1-hot)+hot)*shade;
    data[i+3]=255*smooth((1-Math.sqrt(d))*size/2);
  }
  return data;
}

export class EnergyVFX {
  constructor(fx){this.fx=fx;this.textures=new Map()}
  texture(hue){
    if(this.textures.has(hue))return this.textures.get(hue);
    if(typeof document==='undefined')return null;
    const size=160,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const c=canvas.getContext('2d');if(!c)return null;
    const pixels=c.createImageData(size,size);pixels.data.set(plasmaPixels(size,hue));c.putImageData(pixels,0,0);
    if(this.textures.size>=4)this.textures.delete(this.textures.keys().next().value);
    this.textures.set(hue,canvas);return canvas;
  }
  sphere(x,y,r,t,opacity=1){
    const {c,hue,reduced}=this.fx,tex=this.texture(hue);
    c.save();c.globalAlpha=clamp(opacity);c.globalCompositeOperation='lighter';
    this.fx.glow(x,y,r*1.65,.25);
    // Preserve the silhouette and darker limb instead of whitening the whole ball.
    c.globalCompositeOperation='source-over';
    const base=c.createRadialGradient(x-r*.16,y-r*.18,r*.03,x,y,r);
    base.addColorStop(0,color(hue,90));base.addColorStop(.45,color(hue,63));base.addColorStop(1,color(hue,20));
    c.fillStyle=base;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
    if(tex){
      c.save();c.translate(x,y);c.rotate(reduced?0:t*.00016);c.drawImage(tex,-r,-r,2*r,2*r);
      c.globalCompositeOperation='screen';c.globalAlpha=opacity*.5;c.rotate(reduced?.7:-t*.00029+.7);c.drawImage(tex,-r,-r,2*r,2*r);c.restore();
    }
    c.globalCompositeOperation='lighter';
    this.fx.glow(x-r*.12,y-r*.1,r*.73,.38);
    // Short filaments wrap around the sphere; never a permanent wire cage.
    for(let j=0;j<6;j++){
      c.beginPath();const phase=j*1.618+(reduced?0:t*.0003);
      for(let k=0;k<=28;k++){
        const a=phase+k/28*1.65,rr=r*(.91+.035*Math.sin(a*8+phase*3));
        const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;
        k?c.lineTo(px,py):c.moveTo(px,py);
      }
      c.strokeStyle=color(hue,84,.35);c.lineWidth=Math.max(.7,r*.009);c.stroke();
    }
    c.restore();
  }
  charge(p,q,t){
    const {c,hue,reduced}=this.fx,r=18+q*58,clock=reduced?0:t;
    c.save();c.globalCompositeOperation='lighter';
    // Curved streams feed the ball. Each mote follows its own continuous path.
    for(let j=0;j<24;j++){
      const u=(j*.618+clock*.00022)%1,a=j*2.399+u*.85;
      const d=r+(1-u)*(60+q*150),x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d*.72;
      c.globalAlpha=Math.sin(u*Math.PI)*(.35+q*.45);c.strokeStyle=color(hue,80);c.lineWidth=.7+(j%3)*.35;
      c.beginPath();c.moveTo(x,y);
      c.quadraticCurveTo(x+Math.sin(a)*10,y-Math.cos(a)*10,p.x+Math.cos(a+.14)*(d+14),p.y+Math.sin(a+.14)*(d+14)*.72);c.stroke();
      c.fillStyle=color(hue,92);c.beginPath();c.arc(x,y,1+(j%3)*.45,0,TAU);c.fill();
    }
    c.restore();this.sphere(p.x,p.y,r*(1+Math.sin(clock*.002)*.015),clock);
  }
  geometry(b,age){
    const {W,H}=this.fx,forward=b.forward||b.toward,travel=clamp(age/(b.kind==='genki'?.95:.62));
    const radius=b.kind==='genki'?24+b.power*48:18+b.power*30;
    // A forward shot follows the screen ray through the palms; no lateral fallback.
    const x=forward?b.origin.x+(b.origin.x-W*.5)*travel*1.2:b.origin.x+b.dx*Math.max(W,H)*1.3*travel;
    const y=forward?b.origin.y+(b.origin.y-H*.5)*travel*1.2:b.origin.y+b.dy*Math.max(W,H)*1.3*travel;
    const r=forward?Math.min(radius*(1+Math.pow(travel,1.8)*4.4),Math.min(W,H)*.62):radius;
    return {x,y,r,forward,travel};
  }
  ribbon(p,head,index,t,alpha,width=1){
    const {c,hue,reduced}=this.fx,dx=head.x-p.x,dy=head.y-p.y,len=Math.hypot(dx,dy);
    const nx=len>1?-dy/len:1,ny=len>1?dx/len:0;
    const phase=index*2.399+(reduced?0:t*.009),spread=head.r;
    c.beginPath();
    for(let k=0;k<=32;k++){
      const u=k/32,angle=u*10-phase;
      const envelope=Math.sin(u*Math.PI)*(.15+u*.85);
      const wave=Math.sin(angle)*spread*envelope*(.4+index*.08);
      const px=p.x+dx*u+(head.forward?Math.cos(angle)*spread*u*.75:nx*wave);
      const py=p.y+dy*u+(head.forward?Math.sin(angle)*spread*u*.7:ny*wave);
      k?c.lineTo(px,py):c.moveTo(px,py);
    }
    c.strokeStyle=color(hue,index%3?76:93,alpha);c.lineWidth=width;c.stroke();
  }
  beam(b,g,t,alpha){
    const {c,hue}=this.fx,p=b.origin;
    const dx=g.x-p.x,dy=g.y-p.y,len=Math.hypot(dx,dy),nx=len>1?-dy/len:1,ny=len>1?dx/len:0;
    c.save();c.globalCompositeOperation='lighter';
    // Broad low-opacity envelope, colored body, then narrow luminous core.
    for(const [scale,light,a] of [[1.4,52,.08],[.85,62,.2],[.42,79,.5],[.15,97,.88]]){
      const tail=(6+b.power*12)*scale,head=g.r*scale;
      c.beginPath();c.moveTo(p.x+nx*tail,p.y+ny*tail);
      c.lineTo(g.x+nx*head,g.y+ny*head);
      c.quadraticCurveTo(g.x+dx*.08,g.y+dy*.08,g.x-nx*head,g.y-ny*head);
      c.lineTo(p.x-nx*tail,p.y-ny*tail);c.closePath();c.fillStyle=color(hue,light,alpha*a);c.fill();
    }
    for(let j=0;j<7;j++)this.ribbon(p,g,j,t,alpha*(j%3?.3:.55),1+(j%3)*.65);
    this.fx.glow(p.x,p.y,38+b.power*36,alpha*.7);
    // Foreshortened head creates depth even when the screen ray has zero length.
    this.fx.glow(g.x,g.y,g.r*1.6,alpha*.32);
    const face=c.createRadialGradient(g.x,g.y,0,g.x,g.y,g.r);
    face.addColorStop(0,color(hue,100,alpha*.98));
    face.addColorStop(.38,color(hue,98,alpha*.94));
    face.addColorStop(.68,color(hue,82,alpha*.72));
    face.addColorStop(.87,color(hue,59,alpha*.36));
    face.addColorStop(1,color(hue,50,0));
    c.fillStyle=face;c.beginPath();c.arc(g.x,g.y,g.r,0,TAU);c.fill();
    // Plasma wisps break up the rim. Short arcs rather than concentric hoops.
    for(let j=0;j<9;j++){
      c.beginPath();
      for(let k=0;k<=24;k++){
        const a=j*2.399+k/24*1.1+t*.001,rr=g.r*(.72+(j%3)*.11)*(1+.045*Math.sin(a*11-t*.014+j));
        const x=g.x+Math.cos(a)*rr,y=g.y+Math.sin(a)*rr*(g.forward?.91:.65);
        k?c.lineTo(x,y):c.moveTo(x,y);
      }
      c.strokeStyle=color(hue,84+(j%3)*5,alpha*.6);c.lineWidth=1.2+(j%3)*1.1;c.stroke();
    }
    this.fx.glow(g.x,g.y,g.r*.42,alpha*.9);c.restore();
  }
  shot(b,now,count){
    const {c,hue,reduced}=this.fx,age=Math.max(0,(now-b.at)/1000);
    if(age>=SHOT_LIFETIME_MS/1000)return;
    const g=this.geometry(b,Math.min(age,.98));
    const alive=(1-smooth((age-.62)/.4))*smooth(age/.065);
    // Keep overlapping four-player shots readable without changing their colors.
    const exposure=1/Math.sqrt(Math.max(1,count));
    c.save();c.globalAlpha=exposure;
    if(alive>.001&&b.kind==='genki'){
      // A short curved wake, never a beam attached to the palms.
      const vx=g.x-b.origin.x,vy=g.y-b.origin.y;
      const tail={x:g.x-vx*.26,y:g.y-vy*.26};
      c.globalCompositeOperation='lighter';
      for(let j=0;j<4;j++)this.ribbon(tail,g,j,now,alive*.38,1.4);
      this.sphere(g.x,g.y,g.r,now,alive*exposure);
    }else if(alive>.001)this.beam(b,g,reduced?0:now,alive);
    // Two transient pressure waves at release, then only curved fragments remain.
    c.globalCompositeOperation='lighter';
    if(!reduced)for(let j=0;j<2;j++){
      const u=(age-j*.09)/.48;if(u<=0||u>=1)continue;
      c.strokeStyle=color(hue,86,(1-u)*.5);c.lineWidth=1.3+(1-u)*2;
      c.beginPath();c.ellipse(b.origin.x,b.origin.y,(24+u*140)*(1+b.power*.3),(16+u*100)*(1+b.power*.3),0,0,TAU);c.stroke();
    }
    const remnant=smooth((age-.65)/.2)*(1-smooth((age-1.05)/.55));
    for(let j=0;j<8;j++){
      const a=j*2.399,u=(j+.5)/8,x=b.origin.x+(g.x-b.origin.x)*u,y=b.origin.y+(g.y-b.origin.y)*u;
      const drift=(age-.65)*22;
      c.strokeStyle=color(hue,76,remnant*.25);c.lineWidth=.8;
      c.beginPath();c.arc(x+Math.cos(a)*drift,y+Math.sin(a)*drift,Math.max(2,g.r*(.15+u*.3)),a,a+.75);c.stroke();
      this.fx.glow(x+Math.cos(a)*drift,y+Math.sin(a)*drift,4+(j%3)*2,remnant*.5);
    }
    c.restore();
  }
}
