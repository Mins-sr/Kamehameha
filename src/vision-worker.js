import {FilesetResolver,PoseLandmarker} from './vendor/vision_bundle.mjs';
let detector;
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{
   const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',import.meta.url).href);
   const options={baseOptions:{modelAssetPath:new URL('./vendor/pose.task',import.meta.url).href,delegate:'GPU'},runningMode:'VIDEO',numPoses:4,minPoseDetectionConfidence:.45,minPosePresenceConfidence:.45,minTrackingConfidence:.5};
   try{detector=await PoseLandmarker.createFromOptions(files,options)}catch{options.baseOptions.delegate='CPU';detector=await PoseLandmarker.createFromOptions(files,options)}
   self.postMessage({type:'ready'});
  }catch(e){self.postMessage({type:'error',message:String(e)})}
 }else if(data.type==='frame'){
  try{const r=detector.detectForVideo(data.bitmap,data.time);self.postMessage({type:'result',landmarks:r.landmarks,world:r.worldLandmarks,session:data.session,time:data.time})}catch(e){self.postMessage({type:'frame-error',session:data.session,message:String(e)})}finally{data.bitmap.close()}
 }
};
