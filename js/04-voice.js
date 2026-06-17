// 04-voice.js — mode + toggles + error/status + screen share + voice listen state machine
// (classic script; loaded in numeric order — top-level globals shared across files)

// ── Mode (เลือกบนหน้าหลัก → ล็อกต่อ session) ──
const MODE_LABEL = { qa:"🧠 ถาม AI", est:"📊 ประเมินงาน" };
let homeMode = "qa";
function selectHomeMode(m){
  homeMode = m;
  $("homeModes").querySelectorAll(".mode-card").forEach(b=>b.classList.toggle("on", b.dataset.mode===m));
}
$("homeModes").addEventListener("click",(e)=>{ const b=e.target.closest(".mode-card"); if(b) selectHomeMode(b.dataset.mode); });
function setMode(m){
  mode=m;
  $("curMode").textContent = MODE_LABEL[m] || MODE_LABEL.qa;
  setMicUI();
  $("sendBtn").textContent = m==="qa" ? "➤ ถาม" : "➤ ประเมิน";
  $("input").placeholder = m==="qa"
    ? "พิมพ์หรือพูดคำถาม…"
    : "อธิบายงานสั้นๆ เพื่อประเมิน stack และเวลา";
}

// ── Toggles ──
$("autoBtn").onclick=()=>{ autoSend=!autoSend; $("autoBtn").classList.toggle("on",autoSend); $("autoBtn").setAttribute("aria-pressed", String(autoSend)); };
$("correctBtn").classList.toggle("on", correctVoice); $("correctBtn").setAttribute("aria-pressed", String(correctVoice));
$("correctBtn").onclick=()=>{ correctVoice=!correctVoice; $("correctBtn").classList.toggle("on",correctVoice); $("correctBtn").setAttribute("aria-pressed", String(correctVoice)); store.set("ma_correct", correctVoice?"1":"0"); };
silenceInp.value = (silenceMs/1000).toFixed(1);
silenceInp.onchange=()=>{
  let s=parseFloat(silenceInp.value); if(isNaN(s)) s=1.8; s=Math.min(6,Math.max(0.5,s));
  silenceMs=Math.round(s*1000); silenceInp.value=s.toFixed(1); store.set("ma_silence", silenceMs);
};
$("thBtn").onclick=()=>setLang("th-TH");
$("enBtn").onclick=()=>setLang("en-US");
function setLang(l){ lang=l; $("thBtn").classList.toggle("on",l==="th-TH"); $("enBtn").classList.toggle("on",l==="en-US"); if(rec) rec.lang=l; }

// ── STT engine: web (Web Speech, live ทีละคำ) | gemini (batch push-to-record, แม่นกว่า) ──
let sttEngine = store.get("ma_stt")||"web";
let recOn=false, mediaRec=null, audioChunks=[], audioStream=null;  // gemini push-to-record state
let hybridRec=false, hybridText="";  // hybrid: Web Speech live preview ระหว่างอัด (Gemini ถอดจริงตอนจบ)
function applySttUI(){ $("sttWeb").classList.toggle("on",sttEngine==="web"); $("sttGemini").classList.toggle("on",sttEngine==="gemini"); }
function setStt(e){
  if(micOn||paused||recOn) return;   // กำลังฟัง/อัด ห้ามสลับ
  if(e==="gemini" && !getKey("gemini")){ showError("โหมด AI ต้องมี Gemini key — เลือก provider Gemini แล้วใส่ key ก่อน"); return; }
  sttEngine=e; store.set("ma_stt",e); applySttUI(); setMicUI();
}
$("sttWeb").onclick=()=>setStt("web");
$("sttGemini").onclick=()=>setStt("gemini");
applySttUI();

// ── status ── (showError ย้ายไป js/02 เพราะ fetchModels ใน js/03 เรียกตอน load ก่อน js/04)
function refreshStatus(){
  const parts=[];
  if(recOn) parts.push('<span style="color:var(--red)">● กำลังฟัง (สด+AI) — เงียบแล้วถอด+ส่งเอง</span>');
  else if(micOn) parts.push('<span style="color:var(--red)">● กำลังฟัง</span>');
  else if(paused) parts.push('<span style="color:var(--amber)">⏸ พักอยู่ — กด "ฟังต่อ" เพื่อฟังต่อ</span>');
  else if(stopped) parts.push('<span style="color:var(--muted)">⏹ จบการฟังแล้ว — พิมพ์ต่อได้ หรือเริ่ม session ใหม่เพื่อฟังอีก</span>');
  if(screenOn) parts.push('<span style="color:var(--teal)">🖼 AI เห็นจอด้วยทุกครั้งที่ถาม</span>');
  statusEl.innerHTML = parts.join("");
  statusEl.style.display = parts.length?"flex":"none";
  $("ctrl").classList.toggle("active", micOn||screenOn||paused||recOn);
  dot.className = "dot"+((micOn||recOn)?" live":"");
}
// ปุ่มฟัง: idle(🎤 เริ่มฟัง) → listening(⏸ พัก + ⏹ จบ) → paused(▶ ฟังต่อ + ⏹ จบ). จบ=resume ไม่ได้, พัก=resume ได้
function setMicUI(){
  // จบ (stopped) → ซ่อนปุ่ม mic + screen + stop ทั้งหมด (ฟังอีกต้องเริ่ม session ใหม่)
  if(stopped){
    $("micBtn").style.display="none"; $("stopBtn").style.display="none"; $("screenBtn").style.display="none";
    return;
  }
  $("micBtn").style.display=""; $("screenBtn").style.display="";
  const b=$("micBtn");
  if(sttEngine==="gemini"){   // สด+AI auto-cut: idle / ฟังต่อเนื่อง (เงียบ→ถอด+ส่งเอง)
    b.className = "mic" + (recOn?" on":"");
    b.textContent = recOn ? "⏹ หยุด" : "🎤 เริ่มฟัง";
    $("stopBtn").style.display="none";
    return;
  }
  b.className = "mic" + (micOn?" on":"") + (paused?" paused":"");
  b.textContent = micOn ? "⏸ พัก" : (paused ? "▶ ฟังต่อ" : "🎤 เริ่มฟัง");
  $("stopBtn").style.display = (micOn||paused) ? "" : "none";
}

// ── Screen share ──
const video=$("screenVideo");
let screenStream=null;
$("screenBtn").onclick=async()=>{
  if(screenOn){
    screenStream && screenStream.getTracks().forEach(t=>t.stop());
    screenStream=null; video.srcObject=null; screenOn=false;
    $("screenBtn").classList.remove("on"); $("screenBtn").textContent="🖥 แชร์จอ"; refreshStatus(); return;
  }
  try{
    screenStream = await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
    video.srcObject = screenStream; await video.play();
    screenStream.getVideoTracks()[0].onended = ()=>{ screenStream=null; screenOn=false;
      $("screenBtn").classList.remove("on"); $("screenBtn").textContent="🖥 แชร์จอ"; refreshStatus(); };
    screenOn=true; $("screenBtn").classList.add("on"); $("screenBtn").textContent="🖥 หยุดแชร์";
    showError(""); refreshStatus();
  }catch(e){ showError("เริ่มแชร์จอไม่สำเร็จ หรือถูกยกเลิก"); }
};
function captureFrame(){
  if(!video.videoWidth) return null;
  const max=1280, sc=Math.min(1, max/Math.max(video.videoWidth,video.videoHeight));
  const c=document.createElement("canvas");
  c.width=Math.round(video.videoWidth*sc); c.height=Math.round(video.videoHeight*sc);
  c.getContext("2d").drawImage(video,0,0,c.width,c.height);
  try{ return c.toDataURL("image/jpeg",0.7).split(",")[1]; }catch{ return null; }
}

// ── Voice ──
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec=null, finalText="", silenceTimer=null, processing=false;
if(!SR) $("supportWarn").style.display="flex";

function buildRec(){
  const r=new SR(); r.continuous=true; r.interimResults=true; r.lang=lang;
  r.onresult=(ev)=>{
    let interim="";
    // hybrid auto-cut (gemini mode): Web Speech โชว์สด + เป็น VAD; เงียบ → ตัดคลิป → Gemini ถอด → ส่ง
    if(hybridRec){
      for(let i=ev.resultIndex;i<ev.results.length;i++){
        const t=ev.results[i][0].transcript;
        if(ev.results[i].isFinal) hybridText+=t+" "; else interim+=t;
      }
      updateVoicePreview((hybridText+interim).trim()||"(กำลังฟัง…)");
      if(hybridText.trim()){ clearTimeout(silenceTimer); silenceTimer=setTimeout(cutHybridClip, silenceMs); }  // เงียบครบ → ตัด
      return;
    }
    for(let i=ev.resultIndex;i<ev.results.length;i++){
      const t=ev.results[i][0].transcript;
      if(ev.results[i].isFinal) finalText+=t+" "; else interim+=t;
    }
    updateVoicePreview(finalText+interim);   // โชว์ในแชทสดๆ ไม่ลง textarea
    if(autoSend && finalText.trim()){
      clearTimeout(silenceTimer);
      silenceTimer=setTimeout(voiceSend,silenceMs);
    }
  };
  r.onerror=(e)=>{ if(e.error==="not-allowed") showError("ไมค์ถูกบล็อก — เปิดสิทธิ์ใน browser แล้วรีโหลด"); };
  r.onend=()=>{ if((micOn||hybridRec) && !processing){ try{r.start();}catch{} } };
  return r;
}
function startRec(){ if(!rec) rec=buildRec(); if(!rec){ $("supportWarn").style.display="flex"; return; } rec.lang=lang; try{rec.start();}catch{} }
function startListen(){ showError(""); finalText=""; $("input").value=""; micOn=true; paused=false; stopped=false; startRec(); setMicUI(); refreshStatus(); }
function pauseListen(){ micOn=false; paused=true; clearTimeout(silenceTimer); try{rec&&rec.stop();}catch{} setMicUI(); refreshStatus(); }  // เก็บ finalText + preview ไว้ resume ต่อ
function resumeListen(){ showError(""); micOn=true; paused=false; startRec(); setMicUI(); refreshStatus(); }
// ล็อก/ปลดล็อก composer (stop → session view ได้อย่างเดียว)
function lockComposer(lock){ $("composer").style.display = lock?"none":""; $("roNote").style.display = lock?"block":"none"; }
// reset → กลับ idle (ปุ่ม+composer กลับมา) ใช้ตอนเริ่ม session ใหม่
function resetListen(){
  micOn=false; paused=false; stopped=false; clearTimeout(silenceTimer); try{rec&&rec.stop();}catch{}
  if(recOn){ recOn=false; hybridRec=false; try{mediaRec&&mediaRec.state!=="inactive"&&mediaRec.stop();}catch{} try{audioStream&&audioStream.getTracks().forEach(t=>t.stop());}catch{} hybridQ=[]; }
  finalText=""; clearVoicePreview(); lockComposer(false); setMicUI(); refreshStatus();
}
// จบ — ล้างทิ้ง + ปิดแชร์จอ + ล็อก composer (session นี้ view ได้อย่างเดียว, resume ไม่ได้)
function stopListen(){
  micOn=false; paused=false; stopped=true; clearTimeout(silenceTimer); try{rec&&rec.stop();}catch{}
  finalText=""; clearVoicePreview();
  if(screenOn){ screenStream&&screenStream.getTracks().forEach(t=>t.stop()); screenStream=null; video.srcObject=null; screenOn=false; $("screenBtn").classList.remove("on"); $("screenBtn").textContent="🖥 แชร์จอ"; }
  if(curSess){ curSess.stopped=true; persistSess(curSess); }   // persist → reload ยัง view-only
  lockComposer(true); setMicUI(); refreshStatus();
}
$("micBtn").onclick=()=>{
  if(sttEngine==="gemini") return toggleGeminiRecord();   // push-to-record (Gemini batch STT)
  if(micOn) pauseListen(); else if(paused) resumeListen(); else startListen();
};
$("stopBtn").onclick=stopListen;

// ── สด+AI (gemini mode): auto-cut ต่อเนื่อง — กดเริ่มครั้งเดียว พูดเรื่อยๆ, Web Speech เป็น VAD,
//    เงียบ → ตัดคลิป → Gemini ถอด → ส่ง → ฟังต่อ (hands-free + แม่น). กดอีกครั้ง = หยุด
let hybridQ=[];   // คิวข้อความรอส่ง (กัน busy ชนกันตอน AI กำลังตอบ)
async function _drainHybridQ(){
  if(busy || !hybridQ.length) return;
  const t=hybridQ.shift();
  await submit(t);
  _drainHybridQ();
}
function startHybridClip(){
  audioChunks=[];
  mediaRec=new MediaRecorder(audioStream);
  mediaRec.ondataavailable=e=>{ if(e.data && e.data.size) audioChunks.push(e.data); };
  mediaRec.onstop=_hybridClipDone;
  mediaRec.start();
}
async function _hybridClipDone(){
  const blob=new Blob(audioChunks,{type:(mediaRec&&mediaRec.mimeType)||"audio/webm"});
  const fallback=hybridText.trim(); hybridText="";   // Web Speech ของคลิปนี้ (สำรองถ้า Gemini ล้ม)
  if(recOn) startHybridClip();   // เริ่มอัดคลิปถัดไปทันที (ไม่ให้ขาดช่วง) ถ้ายังไม่หยุด
  clearVoicePreview();
  let text=fallback;
  try{ const g=await transcribeAudioGemini(blob); if(g && g.trim()) text=g.trim(); }catch(e){ if(!fallback) showError("ถอดเสียงไม่สำเร็จ: "+esc(e.message)); }
  text=(text||"").trim();
  if(text){ hybridQ.push(text); _drainHybridQ(); }   // auto-cut = ส่งเสมอ (hands-free); คิวกัน busy
}
async function toggleGeminiRecord(){
  if(recOn){  // หยุด: ปิด Web Speech + ตัดคลิปสุดท้าย (recOn=false → ไม่อัดต่อ) + ปิด stream
    recOn=false; hybridRec=false; clearTimeout(silenceTimer);
    try{ rec && rec.stop(); }catch{}
    try{ mediaRec && mediaRec.state!=="inactive" && mediaRec.stop(); }catch{}   // → _hybridClipDone ถอด+ส่งคลิปท้าย
    try{ audioStream && audioStream.getTracks().forEach(t=>t.stop()); }catch{}
    setMicUI(); refreshStatus(); return;
  }
  if(typeof MediaRecorder==="undefined"){ showError("เบราว์เซอร์นี้ไม่รองรับ MediaRecorder"); return; }
  if(!getKey("gemini")){ showError("โหมด AI ต้องมี Gemini key"); return; }
  try{ audioStream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ showError("ไมค์ถูกบล็อก — เปิดสิทธิ์ใน browser แล้วรีโหลด"); return; }
  showError(""); finalText=""; hybridText=""; hybridQ=[];
  recOn=true; hybridRec=true;
  startHybridClip();   // คลิปแรก
  startRec();          // Web Speech (preview + VAD ตัดคลิป)
  updateVoicePreview("(กำลังฟัง…)"); setMicUI(); refreshStatus();
}
// VAD: Web Speech เงียบครบ silenceMs → ตัดคลิปปัจจุบัน (stop → _hybridClipDone → ถอด+ส่ง; startHybridClip คลิปใหม่)
function cutHybridClip(){
  if(!recOn) return;
  clearTimeout(silenceTimer);
  try{ if(mediaRec && mediaRec.state!=="inactive") mediaRec.stop(); }catch{}
}

async function voiceSend(){
  const text=finalText.trim();
  if(!text||processing) return;
  processing=true; clearTimeout(silenceTimer); finalText="";
  try{rec&&rec.stop();}catch{}
  let toSend=text;
  if(correctVoice){  // แก้คำถอดเสียงด้วย LLM ก่อนส่ง (toggle ✨)
    if(voiceLiveEl) voiceLiveEl.textContent="✨ กำลังแก้คำ…";
    try{ toSend=await correctText(text); }catch{ toSend=text; }
  }
  await submit(toSend);
  processing=false;
  if(micOn) startRec();
}
