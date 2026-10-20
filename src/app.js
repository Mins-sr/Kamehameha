import {clamp} from './game.js';
import {People,COLORS} from './people.js';
import {Sound} from './audio.js';
import {Effects} from './effects.js';
const $=id=>document.getElementById(id),app=$('app'),video=$('video'),people=new People(),fx=new Effects($('effects'));
let mode='intro',facing='user',stream=null,worker=null,detector=null,visionPromise=null,busy=false,session=0,frameErrors=0,lastPredict=0,lastVideo=-1,lastResult=0,current=[],lastTime=performance.now(),demoAt=0,W=innerWidth,H=innerHeight,messageTimer;
const sound=new Sound(state=>{$('sound').dataset.state=state;$('audioMark').textContent=state==='running'?'':state==='muted'?'×':'!';$('sound').setAttribute('aria-label',state==='running'?'音を消す':state==='muted'?'音を有効にして試聴':'音を再試行して試聴');$('sound').setAttribute('aria-pressed',String(state==='running'))});
function message(text,persistent=false){clearTimeout(messageTimer);$('message').textContent=text;$('message').hidden=false;if(!persistent)messageTimer=setTimeout(()=>$('message').hidden=true,4000)}
function resize(){W=app.clientWidth;H=app.clientHeight;fx.resize(W,H)}new ResizeObserver(resize).observe(app);resize();
function audioStart(){sound.unlock().then(ok=>{if(!ok)message('♪ をタップして音を再試行')})}
function stopCamera(){stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null}
function clearGame(){current=[];lastResult=0;people.reset();fx.reset();sound.stopLoop();$('viewport').style.transform='';$('chargeLine').firstElementChild.style.width='0%'}
function home(){session++;stopCamera();sound.pause();clearGame();mode='intro';app.className='';$('intro').hidden=false;$('intro').scrollTop=0;$('loading').hidden=true;$('hud').hidden=true;$('demoTag').hidden=true;$('message').hidden=true;$('flip').disabled=false;lastVideo=-1}
function play(next){clearGame();mode=next;app.className=next;$('intro').hidden=true;$('loading').hidden=true;$('hud').hidden=false;$('demoTag').hidden=next!=='demo';$('flip').disabled=next==='demo';$('message').hidden=true;demoAt=performance.now();lastVideo=-1;lastPredict=0;frameErrors=0}
async function openCamera(token){
 if(!navigator.mediaDevices?.getUserMedia)throw new Error('ブラウザで開いてください');
 const s=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}});
 if(token!==session){s.getTracks().forEach(t=>t.stop());return false}stream=s;video.srcObject=s;await video.play();if(token!==session)return false;video.style.transform=facing==='user'?'scaleX(-1)':'none';return true;
}
function cameraError(e){if(e.name==='NotAllowedError')return 'カメラを許可して、もう一度。';if(e.name==='NotFoundError')return 'カメラがありません。デモで遊べます。';if(e.name==='NotReadableError')return '使用中のカメラを閉じて、もう一度。';return '開始できませんでした。もう一度お試しください。'}
async function startCamera(){audioStart();const token=++session;stopCamera();clearGame();mode='loading';$('loading').hidden=false;$('loadingText').textContent='カメラを準備中…';$('message').hidden=true;
 try{if(!await openCamera(token))return;$('loadingText').textContent='気を準備中…';await initVision();if(token===session)play('camera')}
 catch(e){if(token!==session)return;home();message(cameraError(e),true);console.error(e)}
}
function startDemo(){audioStart();session++;stopCamera();play('demo')}
async function initVision(){
 if(visionPromise)return visionPromise;
 visionPromise=(async()=>{
  if(window.Worker&&window.OffscreenCanvas&&window.createImageBitmap){try{
   const w=new Worker(new URL('./vision-worker.js',import.meta.url),{type:'module'});worker=w;
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker timeout')),25000);w.onerror=e=>{clearTimeout(timer);reject(Error(e.message))};w.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timer);resolve()}else if(data.type==='error'){clearTimeout(timer);reject(Error(data.message))}};w.postMessage({type:'init'})});
   w.onmessage=({data})=>{busy=false;if(data.session!==session)return;if(data.type==='result'){frameErrors=0;accept(data.landmarks,data.world,data.time)}else if(data.type==='frame-error'&&++frameErrors>=3)fallback()};w.onerror=()=>fallback();return;
  }catch(e){worker?.terminate();worker=null}}
  await mainDetector();
 })().catch(e=>{visionPromise=null;throw e});return visionPromise;
}
async function mainDetector(){const {FilesetResolver,PoseLandmarker}=await import('./vendor/vision_bundle.mjs');const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',import.meta.url).href);const opt={baseOptions:{modelAssetPath:new URL('./vendor/pose.task',import.meta.url).href,delegate:'GPU'},runningMode:'VIDEO',numPoses:4,minPoseDetectionConfidence:.45,minPosePresenceConfidence:.45,minTrackingConfidence:.5};try{detector=await PoseLandmarker.createFromOptions(files,opt)}catch{opt.baseOptions.delegate='CPU';detector=await PoseLandmarker.createFromOptions(files,opt)}}
async function fallback(){if(!worker)return;worker.terminate();worker=null;busy=true;clearGame();try{visionPromise=mainDetector();await visionPromise;frameErrors=0}catch(e){visionPromise=null;if(mode==='camera'){home();message('認識を再開できません。もう一度。',true)}}finally{busy=false}}
const capture=document.createElement('canvas'),captureCtx=capture.getContext('2d');
async function detect(now){
 if(mode!=='camera'||busy||document.hidden||video.readyState<2||video.paused||now-lastPredict<85||video.currentTime===lastVideo)return;
 busy=true;lastPredict=now;lastVideo=video.currentTime;const token=session;
 try{if(worker){const s=Math.min(1,512/video.videoWidth);capture.width=Math.round(video.videoWidth*s);capture.height=Math.round(video.videoHeight*s);captureCtx.drawImage(video,0,0,capture.width,capture.height);const bitmap=await createImageBitmap(capture);if(token!==session||!worker){bitmap.close();busy=false;return}worker.postMessage({type:'frame',bitmap,time:now,session:token},[bitmap])}else if(detector){const r=detector.detectForVideo(video,now);if(token===session)accept(r.landmarks,r.worldLandmarks,now);busy=false}else busy=false}
 catch(e){busy=false;if(++frameErrors>=3){if(worker)fallback();else{home();message('認識が停止しました。もう一度。',true)}}}
}
function accept(landmarks,world,at){if(mode!=='camera')return;lastResult=at;people.update(landmarks,world,at,video.videoWidth/video.videoHeight)}
function map(p){if(mode==='demo')return {x:p.x*W,y:p.y*H};const s=Math.min(W/video.videoWidth,H/video.videoHeight),vw=video.videoWidth*s,vh=video.videoHeight*s;const u=p.x/(video.videoWidth/video.videoHeight);return {x:(W-vw)/2+(facing==='user'?1-u:u)*vw,y:(H-vh)/2+p.y*vh}}
function demoPose(now){const elapsed=(now-demoAt)/1000,cycle=Math.floor(elapsed/7),t=((elapsed%7)+7)%7,k=clamp((t-3.65)/.28),genki=cycle%2===1;const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));const pts=genki?{0:[.5,.24],11:[.4,.35],12:[.6,.35],13:[.4,.2],14:[.6,.2],15:[.43,.1],16:[.57,.1],23:[.43,.64],24:[.57,.64],25:[.34,.86],26:[.67,.86],27:[.33,.96],28:[.69,.96]}:{0:[.5,.24],11:[.4,.35],12:[.6,.35],13:[.25,.51],14:[.64,.53],15:[.29,.56],16:[.34,.57],23:[.43,.64],24:[.57,.64],25:[.34,.86],26:[.67,.86],27:[.33,.96],28:[.69,.96]};for(const [i,[x,y]]of Object.entries(pts))p[i]={x,y,z:0,visibility:1};
 const release=genki?[[13,.7,.22],[14,.82,.23],[15,.83,.13],[16,.91,.17]]:[[13,.61,.34],[14,.7,.36],[15,.82,.34],[16,.84,.38]];
 for(const [i,x,y]of release){p[i].x+=(x-p[i].x)*k;p[i].y+=(y-p[i].y)*k;p[i].z=-k*(i>14?.4:.18)}
 if(t>5.7){if(genki){p[13].x=.7;p[14].x=.82;p[15].x=.83;p[16].x=.91;p[13].y=.5;p[14].y=.52;p[15].y=.48;p[16].y=.5}else{p[15].x=.23;p[16].x=.77;p[15].y=p[16].y=.75}}
 return p;
}
function tick(now){requestAnimationFrame(tick);const dt=Math.min(60,now-lastTime);lastTime=now;if(document.hidden)return;
 if(mode==='camera')detect(now);
 else if(mode==='demo'&&now-lastPredict>90){
  const poses=Array.from({length:4},(_,i)=>demoPose(now-i*450).map(v=>({...v,x:.17+i*.22+(v.x-.5)*.38,y:.26+(v.y-.24)*.78,z:(v.z||0)*.5})));
  people.update(poses,null,now);lastPredict=now;
 }
 current=mode==='camera'||mode==='demo'?people.active(now):[];
 const activeIds=new Set(current.map(t=>t.id));let loudest=0,chargingLoudest=0;let firedShot=null;
 for(const t of people.tracks){const event=t.game.step(now,dt,activeIds.has(t.id)?t.feature:null);
  if(event==='spill'){const spill=t.game.takeSpill();if(spill){spill.hue=COLORS[t.slot].hue;people.scatterEnergy(spill,now)}}
  if(event==='fire'){const shot=t.game.shot;const direction=shot.direction?{...shot.direction,x:mode==='camera'&&facing==='user'?-shot.direction.x:shot.direction.x}:null;fx.fire(map(shot.hand),map(shot.shoulder),shot.power,now,COLORS[t.slot].hue,shot.mode,direction);if(!firedShot||shot.power>firedShot.power)firedShot=shot}
  if(activeIds.has(t.id)&&t.game.phase==='charging'){chargingLoudest=Math.max(chargingLoudest,t.game.charge);loudest=Math.max(loudest,t.game.charge)}
  if(activeIds.has(t.id)&&t.game.phase==='idle'&&t.game.reserve>0)loudest=Math.max(loudest,t.game.reserve);
 }
 if(firedShot){sound.blast(firedShot.power,firedShot.mode,Boolean(firedShot.direction?.forward));navigator.vibrate?.([30,25,90])}
 if(chargingLoudest)sound.charge(chargingLoudest);else sound.stopLoop();
 if(mode==='camera'||mode==='demo'){
  $('tracking').dataset.state=loudest?'charge':current.length?'found':'search';$('tracking').setAttribute('aria-label',current.length?`${current.length}人を認識中`:'人を探しています');
  [...$('tracking').children].forEach((dot,i)=>{const t=current[i];dot.style.background=t?`hsl(${COLORS[t.slot].hue} 95% 70%)`:'';dot.style.boxShadow=t?`0 0 9px hsl(${COLORS[t.slot].hue} 95% 65%)`:''});
  $('chargeLine').firstElementChild.style.width=`${loudest*100}%`;
 }
 const age=fx.blasts.length?(now-Math.max(...fx.blasts.map(b=>b.at)))/1000:99;if(age<.55&&!fx.reduced){const s=(1-age/.55)*7; $('viewport').style.transform=`translate(${Math.sin(now*.071)*s}px,${Math.cos(now*.083)*s}px) scale(1.015)`}else $('viewport').style.transform='';
  people.advanceEnergy(now);
  const actors=current.map(t=>{const b=t.smooth,c=map(b),top=map({x:b.x,y:b.top}),bottom=map({x:b.x,y:b.bottom}),edge=map({x:b.x+b.scale,y:b.y}),energyLevel=t.game.phase==='charging'?t.game.charge:t.game.reserve,chargeFeature=t.feature?.chargePoint??t.feature?.hand??(energyLevel?{x:b.x,y:b.y}:null);return {id:t.id,hue:COLORS[t.slot].hue,body:{x:c.x,y:c.y,top:top.y,bottom:bottom.y,width:Math.abs(edge.x-c.x)},point:chargeFeature?map(chargeFeature):null,charge:energyLevel,kind:t.game.phase==='charging'?t.game.mode:t.feature?.mode??t.game.reserveMode??'kame',guide:mode==='demo'?t.points.map(map):null}});
  const energy=people.energy.map(e=>{const p=map(e);return {...e,x:p.x,y:p.y}});
  fx.draw(now,dt/1000,{actors,energy,intro:false});
}
$('start').onclick=startCamera;$('demo').onclick=startDemo;$('stop').onclick=home;$('cancel').onclick=home;
$('sound').onclick=()=>{if(sound.status()==='running')sound.mute();else audioStart()};
$('flip').onclick=async()=>{if(mode!=='camera')return;const token=++session;$('flip').disabled=true;stopCamera();clearGame();lastVideo=-1;facing=facing==='user'?'environment':'user';try{await openCamera(token)}catch(e){if(token===session){home();message(cameraError(e),true)}}finally{if(token===session)$('flip').disabled=false}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(mode!=='intro')home();else sound.pause()}else lastTime=performance.now()});
window.addEventListener('pagehide',()=>{home();worker?.terminate();worker=null;detector?.close();detector=null;visionPromise=null;busy=false});
window.addEventListener('pageshow',e=>{if(e.persisted)home()});
const lifecycle=new AbortController();if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_energy_state',title:'気の状態',description:'Read game mode, pose availability, charge and audio status. Does not return camera images.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw Error('Expected empty object');return {mode,detected:current.length,people:current.map(t=>({color:COLORS[t.slot].name,phase:t.game.phase,charge:t.game.phase==='charging'?t.game.charge:t.game.reserve})),floatingEnergy:people.energy.length,audio:sound.status()}}},{signal:lifecycle.signal})).catch(()=>{})}catch{}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
requestAnimationFrame(tick);
