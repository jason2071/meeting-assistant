// 08-stt-live.js — Gemini Live API realtime STT (WebSocket bidi streaming) [experimental]
// (classic script; loaded last — globals shared. liveOn ประกาศใน js/04-voice.js)
//
// streaming จริง: WS connect → setup(inputAudioTranscription) → mic→PCM16/16k→realtimeInput.audio
//   → server ส่ง serverContent.inputTranscription.text (สดทุกคำ) + turnComplete (จบประโยค) → autoSend/preview
// model native-audio: ต้อง generationConfig.responseModalities:["AUDIO"] (ไม่ใช่ top-level, ไม่ใช่ TEXT); audio output ทิ้ง
// แปล: gemini-3.5-live-translate-preview + translationConfig → อ่าน outputTranscription (ข้อความที่แปลแล้ว)

const LIVE_MODEL = "gemini-3.1-flash-live-preview";
const TRANSLATE_MODEL = "gemini-3.5-live-translate-preview";
let liveWS=null, liveCtx=null, liveProc=null, liveSrc=null, liveStream=null, liveTurnText="", liveTr="";

// Float32 (native rate) → downsample 16kHz → PCM16 LE → base64
function _f32To16kPCM16B64(f32, inRate){
  const ratio=inRate/16000;
  const outLen=ratio>1?Math.floor(f32.length/ratio):f32.length;
  const buf=new ArrayBuffer(outLen*2), view=new DataView(buf);
  for(let i=0;i<outLen;i++){ let s=f32[Math.floor(i*ratio)]; s=Math.max(-1,Math.min(1,s||0)); view.setInt16(i*2, s<0?s*0x8000:s*0x7FFF, true); }
  let bin="", u=new Uint8Array(buf); for(let i=0;i<u.length;i++) bin+=String.fromCharCode(u[i]);
  return btoa(bin);
}
function _liveFinalize(){   // จบ turn → ส่ง (autoSend) หรือรอกดส่ง
  const t=liveTurnText.trim(); liveTurnText="";
  if(!t){ clearVoicePreview(); return; }
  if(autoSend){ clearVoicePreview(); submit(t); }
  else { finalText=t; updateVoicePreview(t); }
}
async function startLive(){
  const key=getKey("gemini"); if(!key){ showError("โหมดเรียลไทม์ต้องมี Gemini key"); return; }
  if(typeof WebSocket==="undefined" || !(window.AudioContext||window.webkitAudioContext)){ showError("เบราว์เซอร์ไม่รองรับ realtime audio"); return; }
  showError(""); finalText=""; liveTurnText="";
  liveTr=($("liveTranslate") && $("liveTranslate").value) || "";
  try{ liveStream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ showError("ไมค์ถูกบล็อก — เปิดสิทธิ์ใน browser แล้วรีโหลด"); return; }
  const url="wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key="+encodeURIComponent(key);
  liveWS=new WebSocket(url);
  liveWS.onopen=()=>{
    const setup = liveTr
      ? { model:"models/"+TRANSLATE_MODEL, generationConfig:{responseModalities:["AUDIO"]},
          inputAudioTranscription:{}, outputAudioTranscription:{},
          translationConfig:{ targetLanguageCode:liveTr, echoTargetLanguage:true } }
      : { model:"models/"+LIVE_MODEL, generationConfig:{responseModalities:["AUDIO"]}, inputAudioTranscription:{} };
    liveWS.send(JSON.stringify({ setup }));
  };
  liveWS.onmessage=async(ev)=>{
    let raw=(ev.data instanceof Blob)?await ev.data.text():ev.data;
    let msg; try{ msg=JSON.parse(raw); }catch{ return; }
    if(msg.setupComplete){ _liveBeginCapture(); return; }
    const sc=msg.serverContent;
    if(sc){
      const t = liveTr ? (sc.outputTranscription && sc.outputTranscription.text)
                       : (sc.inputTranscription && sc.inputTranscription.text);
      if(t){ liveTurnText+=t; updateVoicePreview(liveTurnText.trim()||"(กำลังฟัง…)"); }
      if(sc.turnComplete) _liveFinalize();
    }
  };
  liveWS.onerror=()=>{ showError("Gemini Live error — ตรวจ key/สิทธิ์เข้าถึง model หรือ network"); stopLive(); };
  liveWS.onclose=(e)=>{ if(liveOn){ liveOn=false; if(!e || e.code!==1000) showError("Gemini Live หลุดการเชื่อมต่อ"+(e&&e.reason?": "+e.reason:"")); setMicUI(); refreshStatus(); } };
  liveOn=true; setMicUI(); refreshStatus(); updateVoicePreview("(กำลังเชื่อมต่อ…)");
}
function _liveBeginCapture(){
  try{
    liveCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(liveCtx.state==="suspended") liveCtx.resume();
    const inRate=liveCtx.sampleRate;
    liveSrc=liveCtx.createMediaStreamSource(liveStream);
    liveProc=liveCtx.createScriptProcessor(4096,1,1);
    liveProc.onaudioprocess=(e)=>{
      if(!liveWS || liveWS.readyState!==1) return;
      const b64=_f32To16kPCM16B64(e.inputBuffer.getChannelData(0), inRate);
      try{ liveWS.send(JSON.stringify({ realtimeInput:{ audio:{ data:b64, mimeType:"audio/pcm;rate=16000" } } })); }catch{}
    };
    liveSrc.connect(liveProc); liveProc.connect(liveCtx.destination);   // processor เงียบ (ไม่เขียน output) → ไม่ echo
    updateVoicePreview("(กำลังฟัง…)");
  }catch(err){ showError("เริ่ม audio ไม่สำเร็จ: "+esc(err.message)); stopLive(); }
}
function stopLive(){
  liveOn=false;
  try{ liveProc&&liveProc.disconnect(); }catch{}
  try{ liveSrc&&liveSrc.disconnect(); }catch{}
  try{ liveCtx&&liveCtx.close(); }catch{}
  try{ liveStream&&liveStream.getTracks().forEach(t=>t.stop()); }catch{}
  try{ liveWS&&liveWS.close(1000); }catch{}
  liveProc=liveSrc=liveCtx=liveStream=liveWS=null;
  _liveFinalize();   // turn ที่ค้างตอนหยุด → ใช้
  setMicUI(); refreshStatus();
}
function toggleLive(){ if(liveOn) stopLive(); else startLive(); }
