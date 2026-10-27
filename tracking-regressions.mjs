import assert from 'node:assert/strict';
import {Game,features} from './src/game.js';
import {People} from './src/people.js';

function pose(x=0,size=1,release=false){
 const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
 const coords={0:[.5,.24],11:[.4,.35],12:[.6,.35],13:[.25,.51],14:[.64,.53],15:[.29,.56],16:[.34,.57],23:[.43,.64],24:[.57,.64],27:[.4,.95],28:[.6,.95]};
 if(release)Object.assign(coords,{13:[.61,.34],14:[.7,.36],15:[.82,.34],16:[.84,.38]});
 for(const [i,[px,py]] of Object.entries(coords))p[i]={x:px,y:py,z:release&&+i>=13&&+i<=16?-.4:0,visibility:1};
 return p.map(v=>({...v,x:.5+(v.x-.5)*size+x,y:.5+(v.y-.5)*size}));
}

// Camera inference and rAF have different cadences. Several repeated renders
// between two real release observations must neither cancel nor trigger a shot.
for(const cadence of [33,80,100])for(const mode of ['kame','genki'])for(const withId of [true,false]){
 const g=new Game(),charge=features(pose());
 if(mode==='genki')Object.assign(charge,{mode:'genki',relative:{x:0,y:-1},charge:true});
 let f=null,fires=0,firstFire=null;
 for(let now=0;now<4000;now++){
  if(now%cadence===0){
   const releasing=now>=3500;
   f={...charge,charge:!releasing,sampleAt:now,
    relative:releasing?{x:charge.relative.x+.6,y:charge.relative.y}:charge.relative};
   if(withId)f.observationId=now/cadence;
  }
  if(now%10===0&&g.step(now,10,f)==='fire'){fires++;firstFire=now}
 }
 assert.equal(fires,1,`${mode}: ${cadence}ms inference / 10ms render, id=${withId}`);
 assert.ok(firstFire>=3500+65,'two separate observations must confirm a sustained push');
}
{
 const people=new People();let fires=0;
 for(let now=0;now<4000;now+=10){
  if(now%100===0)people.update([pose(0,1,now>=3500)],null,now);
  people.active(now);
  for(const t of people.tracks)if(t.game.step(now,10,people.featureForGame(t,now))==='fire')fires++;
 }
 assert.equal(fires,1,'the People → Game path fires with interleaved renders');
}
console.log('PASS: camera/render cadence regression; kame and genki fire once with fresh release observations.');

// One merged skeleton is compatible with two tracks. No track is allowed to
// consume it, change its anchor, collect energy, or be drawn on the other person.
for(const reverse of [false,true]){
 const people=new People(),poses=[pose(-.025),pose(.025)];
 people.update(reverse?poses.reverse():poses,null,0);
 const before=people.tracks.map(t=>({id:t.id,x:t.body.x,at:t.at,slot:t.slot}));
 people.scatterEnergy({x:.5,y:.495,amount:.6,mode:'kame'},0);
 people.update([pose()],null,500);
 assert.equal(people.tracks.length,2,'a merged observation must not create a third identity');
 for(const previous of before){
  const t=people.tracks.find(t=>t.id===previous.id);
  assert.equal(t.at,previous.at,'ambiguous detection cannot overwrite the observation timestamp');
  assert.equal(t.body.x,previous.x,'ambiguous detection cannot drag the trusted skeleton');
  assert.equal(t.slot,previous.slot);assert.equal(t.game.reserve,0,'ambiguous tracks cannot collect energy');
  assert.equal(people.featureForGame(t,500),null);
 }
 assert.equal(people.active(500).length,0,'ambiguous overlays are hidden');
 people.update([pose(),pose()],null,600);
 assert.ok(people.tracks.every(t=>t.at===0),'duplicate detections must not break an ambiguous tie');
}
console.log('PASS: merged and duplicate skeletons cannot move trusted tracks or collect energy.');

// Two same-sized people cross, disappear into one detection, and separate.
// Reversing detector order must not reverse their velocities, colors or charges.
for(const merge of [false,true])for(const reverse of [false,true]){
 const people=new People();let ids,accepted=0;
 for(let frame=0;frame<=12;frame++){
  const at=frame*100,x=-.24+frame*.04,poses=[pose(x),pose(-x)];
  const detections=merge&&frame===6?[pose()]:((frame%2===0)===reverse?poses.reverse():poses);
  people.update(detections,null,at);
  if(frame===0){
   ids=[people.tracks.find(t=>t.body.x<.5).id,people.tracks.find(t=>t.body.x>.5).id];
   people.tracks.find(t=>t.id===ids[0]).game.reserve=.2;
   people.tracks.find(t=>t.id===ids[1]).game.reserve=.7;
  }
  assert.equal(people.tracks.length,2,'crossing must not create replacement tracks');
  for(let i=0;i<2;i++){
   const t=people.tracks.find(t=>t.id===ids[i]);assert.ok(t,'original track retained');
   if(t.at===at&&!t.associationAmbiguous){
    assert.ok(Math.abs(t.body.x-(.5+(i===0?x:-x)))<1e-8,`identity swap at ${at}, merge=${merge}, reverse=${reverse}`);accepted++;
   }
   assert.equal(t.game.reserve,i===0?.2:.7,'charge state stays with its original path');
  }
 }
 assert.ok(accepted>=16,'tracking must recover, not just suppress all observations');
 assert.ok(people.tracks.every(t=>t.at===1200&&!t.associationAmbiguous),'both tracks recovered after separation');
}
console.log('PASS: reordered two-person crossings and merged occlusion preserve paths, IDs, colors and energy.');

// Shape is useful even below 0.5 normalized shoulder width; the former clamp
// discarded that evidence. Motion alone cannot separate these centered people.
{
 const people=new People();people.update([pose(0,.75),pose(0,1.25)],null,0);
 const ids=people.tracks.map(t=>t.id);
 people.update([pose(0,1.25),pose(0,.75)],null,100);
 assert.equal(people.tracks.find(t=>t.body.width<.2).id,ids[0]);
 assert.equal(people.tracks.find(t=>t.body.width>.2).id,ids[1]);
 assert.ok(people.tracks.every(t=>!t.associationAmbiguous));
}
{
 const people=new People();people.update([pose()],null,0);const t=people.tracks[0];
 people.update([],null,300);people.update([pose(.02)],null,400);
 assert.equal(t.at,0,'first reappearance is only a candidate');
 assert.equal(people.featureForGame(t,400),null);
 people.update([pose(.025)],null,500);
 assert.equal(t.at,500,'second consistent observation recovers the track');
 assert.equal(people.featureForGame(t,500),null,'recovery must rearm before gameplay');
 people.update([pose(.03)],null,600);people.update([pose(.035)],null,700);
 assert.ok(people.featureForGame(t,700));
}
console.log('PASS: torso shape separates centered detections; occluded tracks require consistent reacquisition and rearming.');
{
 const people=new People();people.update([pose()],null,0);const id=people.tracks[0].id;
 const turned=pose().map(p=>({...p,x:.5+(p.x-.5)*.4}));
 people.update([turned],null,100);
 assert.equal(people.tracks.length,1,'turning sideways must not create a new person');
 assert.equal(people.tracks[0].id,id);assert.equal(people.tracks[0].at,100);
 assert.ok(people.featureForGame(people.tracks[0],100));
}
console.log('PASS: turning sideways preserves a confidently tracked person.');
