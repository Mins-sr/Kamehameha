import {FilesetResolver,PoseLandmarker} from './vendor/vision_bundle.mjs';
let detector;
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{
   const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',import.meta.url).href);
   const options={baseOptions:{modelAssetPath:new URL('./vendor/pose.task',import.meta.url).href,delegate:'GPU'},runningMode:'VIDEO',numPoses:4,minPoseDetectionConfidence:.35,minPosePresenceConfidence:.35,minTrackingConfidence:.35};
   try{detector=await PoseLandmarker.createFromOptions(files,options)}catch{options.baseOptions.delegate='CPU';detector=await PoseLandmarker.createFromOptions(files,options)}
   self.postMessage({type:'ready'});
  }catch(e){self.postMessage({type:'error',message:String(e)})}
 }else if(data.type==='frame'){
  const started=performance.now();
  try{
   const r=detector.detectForVideo(data.bitmap,data.time);
   self.postMessage({type:'result',landmarks:r.landmarks,world:r.worldLandmarks,session:data.session,frameSeq:data.frameSeq,time:data.time,inferenceMs:performance.now()-started});
  }catch(e){self.postMessage({type:'frame-error',session:data.session,frameSeq:data.frameSeq,message:String(e)})}
  finally{data.bitmap.close()}
 }
};

