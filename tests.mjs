import assert from 'node:assert/strict';
import './tracking-regressions.mjs';
import {Game,features,MAX_CHARGE_MS} from './src/game.js';
const base=()=>Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
function pose(extended=false,side=1){let p=base();const coords={11:[.4,.35],12:[.6,.35],13:[.25,.51],14:[.64,.53],15:[.29,.56],16:[.34,.57],23:[.43,.64],24:[.57,.64]};for(const [i,[x,y]] of Object.entries(coords))p[i]={x,y,z:0,visibility:1};if(extended)for(const [i,x,y]of [[13,.61,.34],[14,.7,.36],[15,.82,.34],[16,.84,.38]])p[i]={x,y,z:i>14?-.4:-.18,visibility:1};if(side<0)p=p.map(v=>({...v,x:1-v.x}));return p}
const charge=features(pose()),fire=features(pose(true));assert.ok(charge.charge,JSON.stringify(charge));assert.ok(fire.extended,JSON.stringify(fire));
function genkiPose(){let p=base();const coords={11:[.4,.35],12:[.6,.35],13:[.4,.2],14:[.6,.2],15:[.43,.1],16:[.57,.1],23:[.43,.64],24:[.57,.64]};for(const [i,[x,y]] of Object.entries(coords))p[i]={x,y,z:0,visibility:1};return p}
const genki=features(genkiPose());assert.equal(genki.mode,'genki',JSON.stringify(genki));
assert.equal(MAX_CHARGE_MS,3000,'charge duration is restored to three seconds');
for(const dx of [-.55,.55]){
 const g=new Game();for(let n=0;n<3600;n+=50)g.step(n,50,genki);assert.equal(g.mode,'genki');assert.ok(g.charge>.3);
 const release={...genki,mode:null,charge:false,genkiCharge:false,kameCharge:false,relative:{x:dx,y:genki.relative.y+.3},sampleAt:3600};
 assert.equal(g.step(3600,50,release),null);assert.equal(g.step(3670,50,{...release,sampleAt:3670}),'fire');
 assert.equal(g.shot.mode,'genki');assert.equal(Math.sign(g.shot.direction.x),Math.sign(dx));
}
console.log('PASS: overhead charge selects genki; left/right lateral thrust fires a directional genki shot.');
function fill(g,amount=3600){for(let n=0;n<amount;n+=50)g.step(n,50,charge)}
for(const side of [-1,1]){const g=new Game(),c=features(pose(false,side)),f=features(pose(true,side));for(let n=0;n<3600;n+=50)g.step(n,50,c);assert.equal(g.phase,'charging');assert.ok(g.charge>.3);assert.equal(g.step(3550,0,f),null);assert.equal(g.step(3650,50,f),'fire');for(let n=3700;n<5000;n+=50)assert.notEqual(g.step(n,50,f),'fire');assert.equal(g.step(5150,50,f),'end');g.step(6100,50,f);assert.equal(g.phase,'idle')}
{const g=new Game();fill(g);for(let n=3600;n<4150;n+=50)g.step(n,50,null);assert.equal(g.phase,'idle');assert.equal(g.step(4200,50,fire),null)}
{const g=new Game();fill(g);const open={...charge,charge:false,close:false,releaseClose:false};for(let n=3600;n<5100;n+=50)g.step(n,50,open);assert.equal(g.phase,'idle')}
{const g=new Game();for(let n=0;n<200;n+=50)g.step(n,50,charge);assert.equal(g.phase,'idle');g.step(210,50,null);assert.equal(g.hold,0)}
{const g=new Game();fill(g,350);assert.notEqual(g.step(400,50,fire),'fire');g.reset();assert.equal(g.charge,0)}
{const p=pose();p[15].visibility=.1;assert.ok(features(p));assert.equal(features(p).gestureReady,false);assert.equal(features(null),null)}
// Full synthetic demonstration uses the same classifier and state machine.
{const g=new Game();let fires=0;for(let now=0;now<14000;now+=16){const t=(now/1000)%7,k=Math.max(0,Math.min(1,(t-3.65)/.28));const p=pose();for(const [i,x,y]of [[13,.61,.34],[14,.7,.36],[15,.82,.34],[16,.84,.38]]){p[i].x+=(x-p[i].x)*k;p[i].y+=(y-p[i].y)*k;p[i].z=-k*(i>14?.4:.18)}if(t>5.7){p[15].x=.23;p[16].x=.77;p[15].y=p[16].y=.75}if(g.step(now,16,features(p))==='fire')fires++}assert.equal(fires,2)}
// Local asset references resolve; no third-party runtime fetches in app code.
import {readFileSync,existsSync} from 'node:fs';
const vendorManifest=JSON.parse(readFileSync('vendor-manifest.json','utf8'));
for(const f of ['index.html','app.js','vision-worker.js','effects.js','audio.js']){
 const s=readFileSync('src/'+f,'utf8');
 for(const m of s.matchAll(/(?:src|href)="\.\/([^"#]+)"|from '\.\/([^']+)'/g)){
  const asset=m[1]||m[2];
  if(asset.startsWith('vendor/'))assert.ok(vendorManifest.some(v=>v.path===asset.slice('vendor/'.length)),m[0]);
  else assert.ok(existsSync('src/'+asset),m[0]);
 }
}
for(const asset of ['three.module.js','vision_bundle.mjs','pose.task','wasm/vision_wasm_internal.js','wasm/vision_wasm_internal.wasm','wasm/vision_wasm_nosimd_internal.js','wasm/vision_wasm_nosimd_internal.wasm'])assert.ok(vendorManifest.some(v=>v.path===asset),asset);
console.log('PASS: left/right charge → single fire → cooldown; tracking loss; release; brief pose; insufficient charge; reset; low visibility; demo 2 cycles; asset references.');

// Slow, short pushes with bent elbows and loosely separated hands now fire.
for(const scenario of ['inward','depth','lift']){
 const g=new Game();fill(g);
 const f={...charge,charge:false,extended:false,extension:100,close:false,releaseClose:true,
  relative:{...charge.relative},depth:charge.depth};
 if(scenario==='inward')f.relative.x+=.4;
 if(scenario==='depth')f.depth+=.34;
 if(scenario==='lift')f.relative.y-=.36;
 assert.equal(g.step(3600,50,{...f,sampleAt:3600}),null);
 assert.equal(g.step(3670,50,{...f,sampleAt:3670}),'fire',scenario);
 if(scenario==='depth')assert.equal(g.shot.direction.forward,true);
}
// Depth should keep a forward release even when perspective shifts the hands sideways.
{const g=new Game();fill(g);const f={...charge,charge:false,extended:false,extension:100,close:false,releaseClose:true,
 relative:{x:charge.relative.x+.55,y:charge.relative.y+.05},depth:charge.depth+.28};
 assert.equal(g.step(3600,50,{...f,sampleAt:3600}),null);
 assert.equal(g.step(3670,50,{...f,sampleAt:3670}),'fire');
 assert.equal(g.shot.direction.forward,true);
 assert.equal(g.shot.direction.x,0);
}
// A held observation, tiny jitter, downward release, or hand separation must not fire.
for(const scenario of ['same-frame','jitter','lower','separate']){
 const g=new Game();fill(g);
 const f={...charge,charge:false,extended:false,releaseClose:true,relative:{...charge.relative},sampleAt:1500};
 if(scenario==='same-frame')f.relative.x+=.5;
 if(scenario==='jitter'){f.relative.x+=.1;f.depth+=.1}
 if(scenario==='lower'){f.relative.x+=.5;f.relative.y+=.4}
 if(scenario==='separate'){f.relative.x+=.5;f.releaseClose=false}
 for(let t=3600;t<3900;t+=50)assert.notEqual(g.step(t,50,{...f,sampleAt:scenario==='same-frame'?3600:t}),'fire',scenario);
}
console.log('PASS: gentle inward/depth/upward push, bent elbows, wider hands; reject jitter, stale sample, lowering, and separated hands.');

import {People,COLORS} from './src/people.js';
const translated=(p,x)=>p.map(v=>({...v,x:v.x+x}));
const four=[0,.8,1.6,2.4].map(x=>translated(pose(),x));
{
 const people=new People();people.update(four,null,0);
 assert.equal(people.active(0).length,4);assert.equal(new Set(people.tracks.map(t=>t.slot)).size,4);
 const ids=people.tracks.map(t=>t.id);
 people.tracks[1].game.charge=.7;
 people.update([four[3],four[1],four[0],four[2]],null,100);
 for(let i=0;i<4;i++)assert.equal(people.tracks.find(t=>Math.abs(t.body.x-(.5+i*.8))<.01)?.id,ids[i]);
 assert.equal(people.tracks.find(t=>t.id===ids[1]).game.charge,.7);
 people.update([four[0],four[2],four[3]],null,200);assert.equal(people.active(200).length,4,'brief detector gap keeps the track rendered');people.update([four[0],four[2],four[3]],null,300);assert.equal(people.active(500).length,3,'the track expires after the render hold');
 people.update(four,null,400);assert.equal(people.tracks.find(t=>t.id===ids[1]).slot,1);
 assert.equal(people.active(1300).length,0);
 people.update([],null,1800);assert.equal(people.tracks.length,0);
 people.update([...four,four[0]],null,1900);assert.equal(people.active(1900).length,4);
}
{
 const p=pose();p[15].visibility=p[16].visibility=0;
 const people=new People();people.update([p],null,10);assert.equal(people.active(10).length,1);assert.equal(people.tracks[0].feature?.gestureReady,false,'aura remains when hands cannot be read');
}
{
 const people=new People();for(let now=0;now<3600;now+=100){people.update(four,null,now);for(const t of people.tracks)t.game.step(now,100,t.feature)}
 assert.ok(people.tracks.every(t=>t.game.phase==='charging'));
 const shots=four.map((p,i)=>translated(pose(i%2===0),i*.8));
 let events=[];for(let now=3600;now<=3700;now+=100){people.update(shots,null,now);events=people.tracks.map(t=>t.game.step(now,100,t.feature))}
 assert.equal(events.filter(e=>e==='fire').length,2);assert.equal(people.tracks.filter(t=>t.game.phase==='charging').length,2);
}
{
 const people=new People();people.update(four,null,0);const fresh=translated(pose(),4);
 people.update([four[0],four[1],four[2],fresh],null,100);
 assert.equal(people.active(100).length,4);assert.equal(new Set(people.active(100).map(t=>t.slot)).size,4);
 assert.equal(people.active(100).some(t=>t.body.x>4),false,'reserve the missing person\'s color during occlusion');
 for(let at=200;at<=1500;at+=100)people.update([four[0],four[1],four[2],fresh],null,at);
 assert.equal(people.active(1500).find(t=>t.body.x>4).game.charge,0,'a newcomer gets fresh state once the missing track expires');
}
// Execute all canvas effect paths using a numeric-checking context (not browser visual QA).
globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;
const context=new Proxy({}, {get(o,k){if(k==='createRadialGradient')return (...args)=>{args.forEach(n=>assert.ok(Number.isFinite(n)));return {addColorStop(pos){assert.ok(pos>=0&&pos<=1)}}};return o[k]??((...args)=>args.filter(a=>typeof a==='number').forEach(n=>assert.ok(Number.isFinite(n),k)))},set(o,k,v){o[k]=v;return true}});
const {Effects}=await import('./src/effects.js');const effects=new Effects({getContext:()=>context});effects.resize(390,844);
const actors=COLORS.map((color,i)=>({hue:color.hue,body:{x:55+i*90,top:150,bottom:660,width:35},point:{x:55+i*90,y:450},charge:i/3}));
effects.draw(1000,.016,{actors});COLORS.forEach((color,i)=>effects.fire({x:55+i*90,y:450},{x:i%2?0:55+i*90,y:420},.7,1000,color.hue));
effects.fire({x:170,y:420},{x:170,y:390},.7,1000,195,'kame',{x:0,y:0,forward:true});
effects.fire({x:230,y:420},{x:230,y:390},.7,1000,42,'genki',{x:1,y:0});
assert.equal(effects.blasts.length,4);assert.equal(effects.blasts.some(b=>b.forward),true);assert.equal(effects.blasts.at(-1).kind,'genki');effects.draw(1250,.016,{actors});effects.draw(2700,.016,{actors});assert.equal(effects.blasts.length,0);
console.log('PASS: 4 people, unique stable colors after detector reordering, temporary loss/rejoin, independent simultaneous charge/fire, aura without hands, fresh-person reset, four effect layers.');
// A lost charge becomes recoverable floating energy instead of being discarded.
{
 const g=new Game();for(let n=0;n<1200;n+=50)g.step(n,50,charge);assert.equal(g.phase,'charging');assert.ok(g.charge>.25&&g.charge<=1);
 let event=null;for(let n=1200;n<1600;n+=50)event=g.step(n,50,null)||event;
 assert.equal(event,'spill');const spill=g.takeSpill();assert.ok(spill.amount>.25&&spill.amount<=1);assert.equal(g.phase,'idle');assert.equal(g.charge,0);
 const recovered=new Game();assert.ok(recovered.addEnergy(spill.amount,spill.mode)>0);assert.ok(recovered.reserve>0);
}
{
 const people=new People();people.update([pose()],null,0);for(let n=0;n<1000;n+=50)people.tracks[0].game.step(n,50,charge);
 for(let n=1000;n<1500;n+=50){people.update([],null,n);for(const t of people.tracks){const event=t.game.step(n,50,null);if(event==='spill')people.scatterEnergy(t.game.takeSpill(),n)}}
 assert.ok(people.energy.length>0,'energy particles are created after tracking loss');
 const floatingBefore=people.energy.length;people.update([pose()],null,2000);const rejoined=people.active(2000)[0];
 assert.ok(rejoined.game.reserve>0,'rejoined person can collect floating energy');assert.ok(people.energy.length<floatingBefore,'collected particles are removed');
 people.update([],null,5500);assert.equal(people.energy.length,0,'uncollected energy fades out');
}
console.log('PASS: lost charge scatters, rejoin/other people can collect it, and uncollected energy expires.');

// Tracking smoothing follows fast joints while keeping short gaps drawable.
{
 const people=new People();people.update([pose()],null,0);const first=people.tracks[0].smooth;
 const moved=pose();for(const i of [11,12,23,24,13,14,15,16])moved[i].x+=.08;
 people.update([moved],null,50);const second=people.tracks[0].smooth;
 assert.ok(second.x>first.x,'body follows the new observation');
 assert.equal(people.featureForGame(people.tracks[0],100)?.gestureReady,true);
 assert.equal(people.featureForGame(people.tracks[0],250),null,'stale observations cannot drive gestures');
 people.update([],null,150);assert.equal(people.active(150).length,1);
 assert.ok(people.active(150)[0].smooth.x>=second.x,'brief gaps use predicted rendering');
}
console.log('PASS: adaptive pose smoothing, render prediction, and stale gesture rejection.');

// Rendering must not alter the observation state, and a new person must not reuse an occupied color.
{
 const left=translated(pose(),0),right=translated(pose(),.8),newcomer=translated(pose(),1.6);
 const people=new People();people.update([left,right],null,0);
 const originalSlots=people.tracks.map(t=>({x:t.body.x,slot:t.slot}));
 people.update([newcomer,left,right],null,50);
 assert.equal(new Set(people.tracks.map(t=>t.slot)).size,3,'new detection must not duplicate an existing color slot');
 for(const original of originalSlots){const track=people.tracks.find(t=>Math.abs(t.body.x-original.x)<.01);assert.equal(track?.slot,original.slot)}
 const run=(withRenders)=>{const p=new People();p.update([pose()],null,0);const moved=pose();for(const i of [11,12,23,24,13,14,15,16])moved[i].x+=.05;p.update([moved],null,50);if(withRenders)for(const at of [55,64,72,81,95])p.active(at);const movedAgain=pose();for(const i of [11,12,23,24,13,14,15,16])movedAgain[i].x+=.1;p.update([movedAgain],null,100);return {x:p.tracks[0].smooth.x,vx:p.tracks[0].vx}}
 const withoutRenders=run(false),withRenders=run(true);
 assert.ok(Math.abs(withoutRenders.x-withRenders.x)<1e-9,'render prediction must not change observed position');
 assert.ok(Math.abs(withoutRenders.vx-withRenders.vx)<1e-9,'render prediction must not change observed velocity');
}
console.log('PASS: occupied color slots stay unique and render timing does not alter tracking state.');

// A repeated result cannot charge a technique, while a partial torso remains trackable.
{
 const g=new Game(),same={...charge,observationId:1,sampleAt:0};
 for(let now=0;now<1000;now+=16)g.step(now,16,same);
 assert.equal(g.phase,'idle','repeated observation must not advance the charge hold');
 const oneHipMissing=pose();oneHipMissing[23].visibility=0;const partial=features(oneHipMissing);
 assert.ok(partial,'one hidden hip must not discard the torso');assert.equal(partial.bodyReady,true);
 const armsMissing=pose();armsMissing[15].visibility=armsMissing[16].visibility=0;const partialArms=features(armsMissing);
 assert.ok(partialArms);assert.equal(partialArms.gestureReady,false);
 const charging=new Game();fill(charging);let event=null;for(let now=3600;now<4100;now+=50)event=charging.step(now,50,partialArms)||event;
 assert.equal(event,null,'brief arm occlusion must hold the charge without firing or scattering');
}
console.log('PASS: repeated observations do not charge and partial occlusion preserves torso tracking.');

{
 const source=readFileSync('src/app.js','utf8'),snippet=source.slice(source.indexOf('function demoPose('),source.indexOf('\nfunction tick('));
 const demo=Function('clamp',`const demoAt=0;${snippet};return demoPose`)((v,a=0,b=1)=>Math.max(a,Math.min(b,v)));
 const people=new People(),fires=new Set();
 for(let now=0;now<15000;now+=10){
  if(now%100===0){const poses=Array.from({length:4},(_,i)=>demo(now-i*450).map(v=>({...v,x:.17+i*.22+(v.x-.5)*.38,y:.26+(v.y-.24)*.78,z:(v.z||0)*.5})));people.update(poses,null,now)}
  people.active(now);
  for(const t of people.tracks)if(t.game.step(now,10,people.featureForGame(t,now))==='fire')fires.add(t.slot);
 }
 assert.equal(fires.size,4,'all four demo people must charge and fire');
 console.log('PASS: actual four-person demo reaches a shot for every color.');
}


await import('./vfx-regressions.mjs');
