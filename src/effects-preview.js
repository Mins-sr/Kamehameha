import {Effects} from './effects.js';
import {COLORS} from './people.js';
const $=id=>document.getElementById(id),stage=$('stage'),fx=new Effects($('effects')),figure=$('figure'),c=figure.getContext('2d');
let W=1,H=1,playing=false,time=2.7,last=performance.now(),samples=[];
$('reduced').checked=fx.reduced;
function resize(){W=stage.clientWidth;H=stage.clientHeight;fx.resize(W,H);figure.width=W;figure.height=H;render()}
function actors(){
  const count=Number($('people').value),genki=$('kind').value==='genki',scale=count===1?1:.56;
  return Array.from({length:count},(_,i)=>{
    const x=W*(count===1?.5:.17+i*.22),h=H*.68*scale,bottom=H*.94,top=bottom-h;
    return {hue:COLORS[i].hue,body:{x,top,bottom,width:h*.24},point:{x:x-(genki?0:h*.2),y:genki?top-h*.16:top+h*.48},charge:Math.min(1,time/3),kind:genki?'genki':'kame'};
  });
}
function mannequin(a,release){
  const b=a.body,h=b.bottom-b.top,x=b.x,head=b.top+h*.08,shoulder=b.top+h*.23,hip=b.top+h*.62;
  const p=release?{x:x+h*.06,y:shoulder+h*.15}:a.point;
  c.strokeStyle='#92a9bc';c.lineWidth=Math.max(2,h*.018);c.lineCap='round';c.lineJoin='round';
  c.beginPath();c.arc(x,head,h*.07,0,Math.PI*2);c.stroke();
  for(const side of [-1,1]){
    c.beginPath();c.moveTo(x,hip);c.lineTo(x+side*h*.12,b.bottom-h*.18);c.lineTo(x+side*h*.19,b.bottom);
    c.moveTo(x,hip);c.lineTo(x+side*h*.12,shoulder);c.lineTo(x+side*h*.22,(shoulder+p.y)*.5);c.lineTo(p.x+side*h*.025,p.y);c.stroke();
  }
  c.beginPath();c.moveTo(x-h*.12,shoulder);c.lineTo(x+h*.12,shoulder);c.stroke();
}
function render(){
  const start=performance.now(),list=actors(),firing=time>=3;
  c.clearRect(0,0,W,H);fx.reset();fx.reduced=$('reduced').checked;
  for(const a of list){
    mannequin(a,firing);
    if(firing){
      const h=a.body.bottom-a.body.top,origin={x:a.body.x+h*.06,y:a.body.top+h*.38};
      const direction=$('direction').value;
      fx.fire(origin,{x:a.body.x,y:a.body.top+h*.23},1,3000,a.hue,a.kind,{forward:direction==='forward',x:direction==='left'?-1:1,y:0});
    }
  }
  // Seeking is deterministic: time-dependent shot ribbons and sphere surfaces
  // use the production renderer; random one-shot debris is omitted on this page.
  fx.particles=[];
  fx.draw(time*1000,0,{actors:list.map(a=>({...a,charge:firing?0:a.charge}))});
  $('state').textContent=time<3?'ためる':time<3.85?'発射':'余韻';
  $('time').value=String(time);$('clock').textContent=time.toFixed(2)+' s';
  samples.push(performance.now()-start);if(samples.length>120)samples.shift();
  const sorted=[...samples].sort((a,b)=>a-b);
  $('status').textContent=`描画 ${list.length}人 · 直近${samples.length}フレームの処理時間 p95 ${sorted[Math.floor((sorted.length-1)*.95)].toFixed(1)} ms · エラーなし`;
}
function pause(){playing=false;$('play').textContent='再生'}
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'一時停止':'再生';last=performance.now()};
$('time').oninput=()=>{pause();time=Number($('time').value);render()};
for(const button of document.querySelectorAll('[data-time]'))button.onclick=()=>{pause();time=Number(button.dataset.time);render()};
$('reset').onclick=()=>{pause();time=0;samples=[];render()};
for(const id of ['kind','direction','people','reduced'])$(id).onchange=()=>{samples=[];render()};
window.addEventListener('error',event=>{$('status').textContent='描画エラー: '+event.message;pause()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();last=performance.now()});
new ResizeObserver(resize).observe(stage);
function tick(now){if(playing&&!document.hidden){time=(time+Math.min(.06,(now-last)/1000))%4.8;render()}last=now;requestAnimationFrame(tick)}
requestAnimationFrame(tick);
