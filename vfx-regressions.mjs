import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Effects} from './src/effects.js';
import {EnergyVFX,plasmaPixels,SHOT_LIFETIME_MS} from './src/energy-vfx.js';

globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;
// Canvas call trace, rounded only for cross-platform floating point stability.
export function traceContext(){
  const calls=[];
  const value=v=>typeof v==='number'?Math.round(v*1e6)/1e6:v;
  const context=new Proxy({}, {
    get(o,k){
      if(k==='createRadialGradient')return (...args)=>{
        assert.ok(args.every(Number.isFinite));calls.push([k,...args.map(value)]);
        return {addColorStop:(p,col)=>{assert.ok(p>=0&&p<=1);calls.push(['stop',p,col])}};
      };
      return o[k]??((...args)=>{assert.ok(args.filter(a=>typeof a==='number').every(Number.isFinite),k);calls.push([k,...args.map(value)])});
    },
    set(o,k,v){if(typeof v==='number')assert.ok(Number.isFinite(v));o[k]=v;calls.push([k,typeof v==='object'?'gradient':value(v)]);return true}
  });
  return {context,calls};
}
const approved=JSON.parse(readFileSync(new URL('./tests/kame-charge-traces.json',import.meta.url),'utf8'));
for(const sample of approved){
  const {context,calls}=traceContext(),fx=new Effects({getContext:()=>context});fx.hue=sample.hue;
  fx.orb({x:140,y:330},sample.charge,sample.time,'kame');
  assert.equal(createHash('sha256').update(JSON.stringify(calls)).digest('hex'),sample.sha256,'approved kame charge must stay identical');
}

// The generated sprite has an alpha edge, an opaque interior, visible surface
// variation, and no random state (seeking/replaying must not change the texture).
for(const hue of [195,35,145,285]){
  const size=64,p=plasmaPixels(size,hue);
  assert.deepEqual(p,plasmaPixels(size,hue));assert.equal(p.length,size*size*4);
  assert.equal(p[3],0);assert.equal(p[((size/2)*size+size/2)*4+3],255);
  const inner=[];for(let y=20;y<44;y++)for(let x=20;x<44;x++)inner.push(p[(y*size+x)*4]+p[(y*size+x)*4+1]+p[(y*size+x)*4+2]);
  assert.ok(Math.max(...inner)-Math.min(...inner)>20,'surface retains texture');
}

const {context}=traceContext(),fx=new Effects({getContext:()=>context});fx.resize(390,844);
const vfx=new EnergyVFX(fx),base={origin:{x:195,y:422},power:1,kind:'kame',dx:1,dy:0,forward:true};
for(const kind of ['kame','genki']){
  const near=vfx.geometry({...base,kind},0),far=vfx.geometry({...base,kind},.6);
  assert.equal(far.x,195);assert.equal(far.y,422,'centered forward shot must never fall back to lateral motion');
  assert.ok(far.r>near.r);
  for(const dx of [-1,1]){
    const side=vfx.geometry({...base,kind,forward:false,dx},.4);
    assert.equal(Math.sign(side.x-195),dx);assert.equal(side.y,422);
  }
}

for(const reduced of [false,true])for(const kind of ['kame','genki'])for(const forward of [false,true]){
  fx.reset();fx.reduced=reduced;
  const actor={hue:195,body:{x:195,top:180,bottom:780,width:80},point:{x:195,y:140},charge:1,kind};
  fx.draw(700,.016,{actors:[actor]});
  for(let i=0;i<12;i++)fx.fire({x:195,y:422},{x:195,y:300},1,1000,195,kind,{forward,x:1,y:0});
  assert.equal(fx.blasts.length,4);assert.ok(fx.particles.length<=160,'rapid shots must have bounded debris');
  for(const age of [0,30,120,450,800,1180,1590])fx.draw(1000+age,.016,{actors:[]});
  fx.draw(1000+SHOT_LIFETIME_MS,.06,{actors:[]});assert.equal(fx.blasts.length,0);
  fx.reset();assert.equal(fx.particles.length,0);
}
console.log('PASS: approved kame charge traces; plasma alpha/texture; forward/lateral geometry; every VFX phase; reduced motion; bounded debris and expiry.');
