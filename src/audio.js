export class Sound{
 constructor(update){this.update=update;this.ctx=null;this.wanted=true;this.loop=null;this.nodes=new Set();this.maxPingAt=-Infinity}
 status(){return !this.wanted?'muted':this.ctx?.state==='running'?'running':this.ctx?'retry':'unstarted'}
 async unlock(){
  this.wanted=true;
  try{
   if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('unsupported');this.ctx=new C();this.master=this.ctx.createGain();this.master.gain.value=.55;const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=8;this.master.connect(limiter).connect(this.ctx.destination);this.ctx.onstatechange=()=>this.update(this.status())}
   const resumed=this.ctx.resume();await resumed;if(this.ctx.state!=='running')throw Error('suspended');this.master.gain.setTargetAtTime(.55,this.ctx.currentTime,.02);this.update(this.status());this.tone(660,990,.15,.12);return true;
  }catch(e){this.update('retry');return false}
 }
 mute(){this.wanted=false;this.stopLoop();if(this.ctx)this.master.gain.setTargetAtTime(0,this.ctx.currentTime,.02);this.update(this.status())}
 remember(node){this.nodes.add(node);node.onended=()=>{this.nodes.delete(node);node.disconnect()};return node}
 tone(from,to,duration,level=.2,type='sine'){
  if(this.status()!=='running')return;const c=this.ctx,t=c.currentTime,o=this.remember(c.createOscillator()),g=c.createGain();o.type=type;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+duration);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(level,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g).connect(this.master);o.start();o.stop(t+duration+.03);
 }
 charge(amount){
  if(this.status()!=='running'){this.stopLoop();return}
  const c=this.ctx,t=c.currentTime;
  if(!this.loop){const g=c.createGain();g.gain.value=0;g.connect(this.master);const os=[0,1,2].map(i=>{const o=this.remember(c.createOscillator());o.type=i===2?'sine':'triangle';o.frequency.value=85+i*40;o.connect(g);o.start();return o});this.loop={g,os}}
  this.loop.g.gain.setTargetAtTime(.025+amount*.08,t,.08);
  this.loop.os.forEach((o,i)=>o.frequency.setTargetAtTime((85+amount*285)*(1+i*.503),t,.07));
  if(amount>.97&&t-this.maxPingAt>.8){this.maxPingAt=t;this.tone(620,1240,.22,.16,'sine')}
 }
 stopLoop(){if(!this.loop)return;const {g,os}=this.loop;this.loop=null;g.gain.setTargetAtTime(.0001,this.ctx.currentTime,.025);os.forEach(o=>{try{o.stop(this.ctx.currentTime+.12)}catch{}})}
 blast(power,kind='kame',forward=false){
  this.stopLoop();if(this.status()!=='running')return;const c=this.ctx,t=c.currentTime,d=forward?2.1:kind==='genki'?1.9:1.7,b=c.createBuffer(1,Math.ceil(c.sampleRate*d),c.sampleRate),a=b.getChannelData(0);let low=0;for(let i=0;i<a.length;i++){low=(low+.08*(Math.random()*2-1))/1.08;a[i]=low*4+(Math.random()*2-1)*.35}
  const n=this.remember(c.createBufferSource()),f=c.createBiquadFilter(),g=c.createGain();n.buffer=b;f.type='lowpass';f.frequency.setValueAtTime(forward?4200:5500,t);f.frequency.exponentialRampToValueAtTime(110,t+d);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(.55+power*.35,t+.035);g.gain.exponentialRampToValueAtTime(.001,t+d);n.connect(f).connect(g).connect(this.master);n.start();
  this.tone(forward?110:kind==='genki'?150:190,forward?22:32,forward?1.7:1.25,.55);
  this.tone(kind==='genki'?420:980,80,kind==='genki'?1.1:.65,kind==='genki'?.24:.18,'sawtooth');
  if(forward)this.tone(72,18,1.8,.28,'triangle');
 }
 pause(){this.stopLoop();for(const n of this.nodes){try{n.stop()}catch{}}this.nodes.clear();if(this.ctx)this.ctx.suspend().catch(()=>this.update('retry'))}
}
