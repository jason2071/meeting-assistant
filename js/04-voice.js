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
// 🧠 thinking toggle (default ปิด)
function applyThinkUI(){ $("thinkBtn").classList.toggle("on",thinkOn); $("thinkBtn").textContent=thinkOn?"เปิด":"ปิด"; $("thinkBtn").setAttribute("aria-pressed",String(thinkOn)); }
$("thinkBtn").onclick=()=>{ thinkOn=!thinkOn; store.set("ma_think", thinkOn?"1":"0"); applyThinkUI(); };
applyThinkUI();
// 🧵 multi-turn context toggle (default เปิด)
function applyContextUI(){ const b=$("contextBtn"); if(!b) return; b.classList.toggle("on",contextOn); b.textContent=contextOn?"เปิด":"ปิด"; b.setAttribute("aria-pressed",String(contextOn)); }
if($("contextBtn")) $("contextBtn").onclick=()=>{ contextOn=!contextOn; store.set("ma_context", contextOn?"1":"0"); applyContextUI(); };
applyContextUI();
// 💡 follow-up suggestions toggle (default เปิด)
function applyFollowupUI(){ const b=$("followupBtn"); if(!b) return; b.classList.toggle("on",followupOn); b.textContent=followupOn?"เปิด":"ปิด"; b.setAttribute("aria-pressed",String(followupOn)); }
if($("followupBtn")) $("followupBtn").onclick=()=>{ followupOn=!followupOn; store.set("ma_followup", followupOn?"1":"0"); applyFollowupUI(); };
applyFollowupUI();
// 💾 จำ key toggle (localStorage opt-in; default ปิด = sessionStorage)
function applyRememberUI(){ const b=$("rememberBtn"); if(!b) return; b.classList.toggle("on",rememberKey); b.textContent=rememberKey?"เปิด":"ปิด"; b.setAttribute("aria-pressed",String(rememberKey)); }
if($("rememberBtn")) $("rememberBtn").onclick=()=>{ setRememberKeys(!rememberKey); applyRememberUI(); };
applyRememberUI();
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
// ── เลือกไมโครโฟน (input device) — มีผลกับ สด+AI (getUserMedia); Web Speech ใช้ default ของระบบ ──
let micDeviceId = store.get("ma_mic")||"";
// ── แหล่งเสียง STT: mic (getUserMedia) | system (Electron loopback ผ่าน getDisplayMedia audio:'loopback') ──
// system = ฟังเสียงที่ออกลำโพง/ประชุม โดยไม่ต้อง virtual cable; ใช้กับ Soniox (Windows desktop)
let audioSrc = store.get("ma_audiosrc")||"mic";
function applyAudioSrcUI(){
  if($("asrcMic")) $("asrcMic").classList.toggle("on",audioSrc==="mic");
  if($("asrcSys")) $("asrcSys").classList.toggle("on",audioSrc==="system");
}
function setAudioSrc(s){ if(recOn||micOn) return; audioSrc=s; store.set("ma_audiosrc",s); applyAudioSrcUI(); }
if($("asrcMic")) $("asrcMic").onclick=()=>setAudioSrc("mic");
if($("asrcSys")) $("asrcSys").onclick=()=>setAudioSrc("system");
applyAudioSrcUI();
// คืน MediaStream เสียงสำหรับ STT — system → Electron loopback (ไม่ใช้ video), ไม่งั้น mic
async function getSttStream(){
  if(audioSrc==="system" && window.electronAPI && window.electronAPI.isElectron){
    window.electronAPI.prepLoopback();   // บอก main: request ถัดไป = loopback (auto-grant จอหลัก+เสียงระบบ ไม่เปิด picker)
    const s = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:true });
    s.getVideoTracks().forEach(t=>t.stop());   // เอาเฉพาะเสียง
    const at = s.getAudioTracks();
    if(!at.length) throw new Error("ไม่มีเสียงระบบ (loopback) — รองรับเฉพาะ Windows desktop");
    return new MediaStream(at);
  }
  return await navigator.mediaDevices.getUserMedia({audio: micDeviceId?{deviceId:{exact:micDeviceId}}:true});
}
async function loadMics(){
  const sel=$("micSel"); if(!sel||!navigator.mediaDevices) return;
  try{
    const devs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput");
    sel.innerHTML='<option value="">ค่าเริ่มต้นของระบบ</option>'+
      devs.map(d=>`<option value="${d.deviceId}">${esc(d.label||("ไมค์ "+(d.deviceId||"").slice(0,6)))}</option>`).join("");
    if([...sel.options].some(o=>o.value===micDeviceId)) sel.value=micDeviceId; else { micDeviceId=""; sel.value=""; }
  }catch{}
}
if($("micSel")) $("micSel").onchange=()=>{ micDeviceId=$("micSel").value; store.set("ma_mic",micDeviceId); };
if($("micRefresh")) $("micRefresh").onclick=async()=>{
  try{ const s=await navigator.mediaDevices.getUserMedia({audio:true}); s.getTracks().forEach(t=>t.stop()); }catch{}
  loadMics();
};
loadMics();  // โหลดครั้งแรก (ชื่ออาจว่างจนกว่าจะอนุญาต → กด ↻ หลังให้สิทธิ์)
let hybridRec=false, hybridText="";  // hybrid: Web Speech live preview ระหว่างอัด (Gemini ถอดจริงตอนจบ)
// ช่อง Gemini key แยก: โผล่เฉพาะตอนใช้ สด+AI แล้ว backend ต้องใช้ Gemini key (provider=openai/claude)
// — provider=gemini ใช้ช่อง key หลัก, provider=openrouter ถอดผ่าน credit (ไม่ต้องใส่ Gemini แยก)
function syncGeminiKeyRow(){
  const need = sttEngine==="gemini" && sttBackend().via==="gemini" && provider!=="gemini";
  $("geminiKeyRow").style.display = need ? "" : "none";
  if(need) $("geminiKey").value = getKey("gemini");
  const sxRow=$("sonioxKeyRow");   // Soniox key row โผล่เฉพาะตอนเลือก Soniox
  if(sxRow){ const ns=sttEngine==="soniox"; sxRow.style.display=ns?"":"none"; if(ns) $("sonioxKey").value=getKey("soniox"); }
}
$("geminiKey").oninput = ()=>skey.set(keyKey("gemini"), $("geminiKey").value.trim());
if($("sonioxKey")) $("sonioxKey").oninput = ()=>skey.set(keyKey("soniox"), $("sonioxKey").value.trim());
function applySttUI(){
  $("sttWeb").classList.toggle("on",sttEngine==="web");
  $("sttGemini").classList.toggle("on",sttEngine==="gemini");
  if($("sttSoniox")) $("sttSoniox").classList.toggle("on",sttEngine==="soniox");
  syncGeminiKeyRow();
}
function setStt(e){
  if(micOn||recOn) return;   // กำลังฟัง/อัด ห้ามสลับ
  if(e==="gemini" && !sttBackend().key){ showError("โหมดนี้ต้องมี key — ใช้ provider OpenRouter (มี credit) หรือใส่ Gemini key"); return; }
  sttEngine=e; store.set("ma_stt",e); applySttUI(); setMicUI();
  if(e==="soniox" && !getKey("soniox")) showError("ใส่ Soniox API key ด้านล่างก่อนเริ่มฟัง");
}
$("sttWeb").onclick=()=>setStt("web");
$("sttGemini").onclick=()=>setStt("gemini");
if($("sttSoniox")) $("sttSoniox").onclick=()=>setStt("soniox");
applySttUI();

// Electron (desktop): Web Speech (SpeechRecognition) ใช้ไม่ได้ (error network) → ซ่อนปุ่ม "สด"
// เหลือ "สด+AI" (gemini near-live) + "Soniox สด" (realtime ทีละคำ) ที่ทำงานได้ใน Electron
if(window.electronAPI && window.electronAPI.isElectron){
  if(sttEngine==="web"){ sttEngine="gemini"; store.set("ma_stt","gemini"); applySttUI(); }
  $("sttWeb").style.display="none";
  const hint=$("sttHint"); if(hint) hint.textContent="desktop: 'Soniox สด' (ทีละคำ realtime) หรือ 'สด+AI' (ถอดแม่นตอนจบ) — Web Speech ใช้ใน Electron ไม่ได้";
  const ar=$("audioSrcRow"); if(ar) ar.style.display="";   // loopback เสียงระบบ มีเฉพาะ desktop
}

// ── status ── (showError ย้ายไป js/02 เพราะ fetchModels ใน js/03 เรียกตอน load ก่อน js/04)
function refreshStatus(){
  const parts=[];
  if(recOn) parts.push('<span style="color:var(--red)">● กำลังฟัง ('+(sttEngine==="soniox"?"Soniox สด":"สด+AI")+') — เงียบแล้วถอด+ส่งเอง</span>');
  else if(micOn) parts.push('<span style="color:var(--red)">● กำลังฟัง</span>');
  else if(stopped) parts.push('<span style="color:var(--muted)">⏹ จบการฟังแล้ว — พิมพ์ต่อได้ หรือเริ่ม session ใหม่เพื่อฟังอีก</span>');
  if(screenOn) parts.push('<span style="color:var(--teal)">🖼 AI เห็นจอด้วยทุกครั้งที่ถาม</span>');
  statusEl.innerHTML = parts.join("");
  statusEl.style.display = parts.length?"flex":"none";
  $("ctrl").classList.toggle("active", micOn||screenOn||recOn);
  dot.className = "dot"+((micOn||recOn)?" live":"");
}
// ปุ่มฟัง: toggle เดียว idle(🎤 เริ่มฟัง) ⇄ listening(⏹ หยุด) + ✂️ ส่งเลย — เหมือน gemini (หยุด=ไม่ terminal)
function setMicUI(){
  // จบ (stopped) → ซ่อนปุ่ม mic + screen + stop ทั้งหมด (ฟังอีกต้องเริ่ม session ใหม่)
  if(stopped){
    $("micBtn").style.display="none"; $("stopBtn").style.display="none"; $("screenBtn").style.display="none";
    return;
  }
  $("micBtn").style.display=""; $("screenBtn").style.display="";
  const b=$("micBtn");
  if(sttEngine==="gemini" || sttEngine==="soniox"){   // recOn-based toggle (gemini auto-cut / soniox realtime)
    b.className = "mic" + (recOn?" on":"");
    b.textContent = recOn ? "⏹ หยุด" : "🎤 เริ่มฟัง";
    $("stopBtn").textContent="✂️ ส่งเลย";   // gemini=ตัด clip ถอด+ส่ง; soniox=ส่งข้อความที่ถอดได้ทันที — แล้วฟังต่อ
    $("stopBtn").style.display = recOn ? "" : "none";
    return;
  }
  b.className = "mic" + (micOn?" on":"");   // web: toggle เริ่ม/หยุด + ✂️ ส่งเลย (mirror gemini)
  b.textContent = micOn ? "⏹ หยุด" : "🎤 เริ่มฟัง";
  $("stopBtn").textContent="✂️ ส่งเลย";   // ส่ง finalText ที่ฟังได้ทันที (ไม่รอเงียบ) แล้วฟังต่อ
  $("stopBtn").style.display = micOn ? "" : "none";
}

// ── Screen share ──
const video=$("screenVideo");
let screenStream=null, screenBusy=false;
$("screenBtn").onclick=async()=>{
  if(screenBusy) return;   // กันกดเบิ้ลระหว่าง getDisplayMedia ค้าง → picker ซ้อน
  if(screenOn){
    screenStream && screenStream.getTracks().forEach(t=>t.stop());
    screenStream=null; video.srcObject=null; screenOn=false;
    $("screenBtn").classList.remove("on"); $("screenBtn").textContent="🖥 แชร์จอ"; refreshStatus(); return;
  }
  screenBusy=true; $("screenBtn").classList.add("on"); $("screenBtn").textContent="🖥 กำลังเลือก…";
  try{
    screenStream = await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
    video.srcObject = screenStream; await video.play();
    screenStream.getVideoTracks()[0].onended = ()=>{ screenStream=null; screenOn=false;
      $("screenBtn").classList.remove("on"); $("screenBtn").textContent="🖥 แชร์จอ"; refreshStatus(); };
    screenOn=true; $("screenBtn").classList.add("on"); $("screenBtn").textContent="🖥 หยุดแชร์";
    showError(""); refreshStatus();
  }catch(e){ $("screenBtn").classList.remove("on"); $("screenBtn").textContent="🖥 แชร์จอ"; showError("เริ่มแชร์จอไม่สำเร็จ หรือถูกยกเลิก"); }
  finally{ screenBusy=false; }
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
// Electron: Web Speech พัง (network) → gemini hybrid ใช้ energy VAD (Web Audio) แทนเป็นตัวตัดเงียบ
const VAD_AUDIO = !!(window.electronAPI && window.electronAPI.isElectron);
if(!SR && !VAD_AUDIO) $("supportWarn").style.display="flex";

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
      // ตัดเมื่อเงียบครบ — floor 2.8s (กันตัดกลางประโยคตอนหยุดคิด) + ต้องมีข้อความพอควร (กันตัดเศษ)
      if(hybridText.trim().length>=4){ clearTimeout(silenceTimer); silenceTimer=setTimeout(cutHybridClip, Math.max(silenceMs,3500)); }
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
// toggle เริ่ม/หยุด (เหมือน gemini): หยุด=หยุด recognizer เฉยๆ (เก็บ finalText+preview, ไม่ lock); เริ่ม=ฟังต่อ/สะสม buffer
function startWebListen(){ showError(""); micOn=true; stopped=false; startRec(); setMicUI(); refreshStatus(); }
function stopWebListen(){ micOn=false; clearTimeout(silenceTimer); try{rec&&rec.stop();}catch{} if(!finalText.trim()) clearVoicePreview(); setMicUI(); refreshStatus(); }
// ล็อก/ปลดล็อก composer (stop → session view ได้อย่างเดียว)
function lockComposer(lock){ $("composer").style.display = lock?"none":""; $("roNote").style.display = lock?"block":"none"; }
// reset → กลับ idle (ปุ่ม+composer กลับมา) ใช้ตอนเริ่ม session ใหม่
function resetListen(){
  micOn=false; stopped=false; clearTimeout(silenceTimer); try{rec&&rec.stop();}catch{} stopVad();
  if(sttEngine==="soniox" && recOn){ stopSoniox(); }
  if(recOn){ recOn=false; hybridRec=false; try{mediaRec&&mediaRec.state!=="inactive"&&mediaRec.stop();}catch{} try{audioStream&&audioStream.getTracks().forEach(t=>t.stop());}catch{} hybridQ=[]; }
  finalText=""; clearVoicePreview(); lockComposer(false); setMicUI(); refreshStatus();
}
// จบ — ล้างทิ้ง + ปิดแชร์จอ + ล็อก composer (session นี้ view ได้อย่างเดียว, resume ไม่ได้)
function stopListen(){
  micOn=false; stopped=true; clearTimeout(silenceTimer); try{rec&&rec.stop();}catch{}
  finalText=""; clearVoicePreview();
  if(screenOn){ screenStream&&screenStream.getTracks().forEach(t=>t.stop()); screenStream=null; video.srcObject=null; screenOn=false; $("screenBtn").classList.remove("on"); $("screenBtn").textContent="🖥 แชร์จอ"; }
  if(curSess){ curSess.stopped=true; persistSess(curSess); }   // persist → reload ยัง view-only
  lockComposer(true); setMicUI(); refreshStatus();
}
$("micBtn").onclick=()=>{
  if(sttEngine==="soniox") return toggleSonioxRecord();   // Soniox realtime ทีละคำ
  if(sttEngine==="gemini") return toggleGeminiRecord();   // สด+AI auto-cut
  micOn ? stopWebListen() : startWebListen();             // web: toggle เริ่ม/หยุด
};
$("stopBtn").onclick=()=>{   // ✂️ ส่งเลย (ทุกโหมดฟังต่อหลังส่ง)
  if(sttEngine==="soniox"){ if(recOn) sonioxFlush(); return; }
  if(sttEngine==="gemini" && recOn) cutHybridClip(); else if(micOn) voiceSend();
};

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
  // ยังไม่ได้พูดอะไร (Web Speech ไม่จับ + คลิปแทบไม่มีเสียง) → ข้าม ไม่ต้องโชว์ "กำลังถอด"/ยิง transcribe
  if(!fallback && blob.size < 2000){ clearVoicePreview(); return; }
  // คงข้อความ rough ไว้ + "กำลังถอด" กันจอว่างระหว่างรอ Gemini (~1-2s) — จะถูกแทนด้วย bubble จริงตอนส่ง
  updateVoicePreview((fallback?fallback+"  ":"")+"✨ กำลังถอด…");
  let text=fallback;
  try{ const g=await transcribeAudio(blob); if(g && g.trim()) text=g.trim(); }catch(e){ clearVoicePreview(); if(!fallback) showError("ถอดเสียงไม่สำเร็จ: "+esc(e.message)); }
  text=(text||"").trim();
  if(text){ hybridQ.push(text); _drainHybridQ(); }   // submit จะ clearVoicePreview + เพิ่ม bubble จริง (ไม่มีจอว่าง)
  else clearVoicePreview();
}
async function toggleGeminiRecord(){
  if(recOn){  // หยุด: ปิด Web Speech/VAD + ตัดคลิปสุดท้าย (recOn=false → ไม่อัดต่อ) + ปิด stream
    recOn=false; hybridRec=false; clearTimeout(silenceTimer);
    try{ rec && rec.stop(); }catch{}
    stopVad();
    const willFinalize = mediaRec && mediaRec.state!=="inactive";
    try{ if(willFinalize) mediaRec.stop(); }catch{}   // → _hybridClipDone ถอด+ส่งคลิปท้าย (เคลียร์ preview เอง)
    try{ audioStream && audioStream.getTracks().forEach(t=>t.stop()); }catch{}
    if(!willFinalize) clearVoicePreview();   // ไม่มีคลิปจะ finalize → เคลียร์ "(กำลังฟัง…)" ที่ค้าง
    setMicUI(); refreshStatus(); return;
  }
  if(typeof MediaRecorder==="undefined"){ showError("เบราว์เซอร์นี้ไม่รองรับ MediaRecorder"); return; }
  if(!sttBackend().key){ showError("โหมด AI ต้องมี key — provider OpenRouter (credit) หรือ Gemini key"); return; }
  try{ audioStream=await navigator.mediaDevices.getUserMedia({audio: micDeviceId?{deviceId:{exact:micDeviceId}}:true}); }
  catch(e){ showError("ไมค์ถูกบล็อก — เปิดสิทธิ์ใน browser แล้วรีโหลด"); return; }
  loadMics();   // ได้สิทธิ์แล้ว → เติมชื่อ device ใน dropdown
  showError(""); finalText=""; hybridText=""; hybridQ=[];
  recOn=true; hybridRec=true;
  startHybridClip();   // คลิปแรก
  if(VAD_AUDIO) startVad(audioStream);   // Electron: energy VAD (Web Speech พัง)
  else startRec();                       // browser: Web Speech (preview + VAD ตัดคลิป)
  updateVoicePreview("(กำลังฟัง…)"); setMicUI(); refreshStatus();
}
// VAD: Web Speech เงียบครบ silenceMs → ตัดคลิปปัจจุบัน (stop → _hybridClipDone → ถอด+ส่ง; startHybridClip คลิปใหม่)
function cutHybridClip(){
  if(!recOn) return;
  clearTimeout(silenceTimer);
  try{ if(mediaRec && mediaRec.state!=="inactive") mediaRec.stop(); }catch{}
}

// ── Energy VAD (Web Audio) — ใช้แทน Web Speech ตอน Electron: วัด RMS, เงียบครบ → cutHybridClip ──
let vadCtx=null, vadSrc=null, vadAn=null, vadTimer=null, vadSpoke=false, vadSilentSince=0;
function startVad(stream){
  stopVad();
  try{
    vadCtx=new (window.AudioContext||window.webkitAudioContext)();
    vadSrc=vadCtx.createMediaStreamSource(stream);
    vadAn=vadCtx.createAnalyser(); vadAn.fftSize=512; vadSrc.connect(vadAn);
    const data=new Uint8Array(vadAn.fftSize);
    vadSpoke=false; vadSilentSince=0;
    vadTimer=setInterval(()=>{                       // setInterval (ไม่ใช่ rAF) — ทำงานต่อแม้ window หลังฉาก
      vadAn.getByteTimeDomainData(data);
      let sum=0; for(let i=0;i<data.length;i++){ const d=(data[i]-128)/128; sum+=d*d; }
      const rms=Math.sqrt(sum/data.length);
      if(rms>0.02){ vadSpoke=true; vadSilentSince=0; updateVoicePreview("🗣 (กำลังพูด…)"); }
      else if(vadSpoke){
        if(!vadSilentSince) vadSilentSince=performance.now();
        else if(performance.now()-vadSilentSince > Math.max(silenceMs,1500)){ vadSpoke=false; vadSilentSince=0; cutHybridClip(); }
      }
    },100);
  }catch(e){}
}
function stopVad(){
  if(vadTimer){ clearInterval(vadTimer); vadTimer=null; }
  try{ vadSrc && vadSrc.disconnect(); }catch{}
  try{ vadCtx && vadCtx.close(); }catch{}
  vadCtx=vadSrc=vadAn=null; vadSpoke=false; vadSilentSince=0;
}

// ── Soniox realtime STT (สด ทีละคำ, ไทย+อังกฤษสลับได้) — stream PCM s16le ผ่าน WebSocket ──
//   live: non-final tokens โชว์สดทันที, final tokens สะสม; endpoint = token {"text":"<end>"} → ส่ง utterance (hands-free)
let sxWS=null, sxCtx=null, sxSrc=null, sxProc=null, sxGain=null, sxFinal="", sxReady=false;
let sxPending="", sxSendTimer=null;   // debounce-merge: รวมท่อนที่ endpoint ตัดติดๆกัน (หยุดคิด) ส่งเป็นก้อนเดียวเมื่อเงียบจริง
function sxMergeMs(){ return Math.max(silenceMs, 2500); }   // รอหลัง endpoint ก่อนส่ง — มีพูดต่อ=ยกเลิก รวมต่อ
async function toggleSonioxRecord(){
  if(recOn){ stopSoniox(); return; }
  const key=getKey("soniox");
  if(!key){ showError("ต้องใส่ Soniox API key ก่อน (เลือก Soniox สด แล้วใส่ key ที่หน้าหลัก)"); return; }
  try{ audioStream=await getSttStream(); }   // mic หรือ เสียงระบบ (loopback) ตาม audioSrc
  catch(e){ showError(audioSrc==="system" ? (e.message||"เปิดเสียงระบบไม่สำเร็จ") : "ไมค์ถูกบล็อก — เปิดสิทธิ์แล้วลองใหม่"); return; }
  loadMics();
  showError(""); sxFinal=""; sxPending=""; clearTimeout(sxSendTimer); sxSendTimer=null; sxReady=false; hybridQ=[]; finalText="";
  recOn=true; hybridRec=false;
  try{
    sxCtx=new (window.AudioContext||window.webkitAudioContext)();
    sxSrc=sxCtx.createMediaStreamSource(audioStream);
    sxProc=sxCtx.createScriptProcessor(4096,1,1);
    sxGain=sxCtx.createGain(); sxGain.gain.value=0;   // กัน feedback (ScriptProcessor ต้องต่ออยู่ใน graph ถึงจะยิง onaudioprocess)
    sxWS=new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
    sxWS.binaryType="arraybuffer";
    sxWS.onopen=()=>{
      sxReady=true;
      sxWS.send(JSON.stringify({
        api_key:key, model:"stt-rt-v5",
        audio_format:"pcm_s16le", sample_rate:Math.round(sxCtx.sampleRate), num_channels:1,
        language_hints:["th","en"], enable_language_identification:true,
        enable_endpoint_detection:true, max_endpoint_delay_ms:3000, endpoint_sensitivity:-0.3   // ตัดช้าลง กันหั่นกลางประโยคตอนหยุดคิด
      }));
    };
    sxWS.onmessage=(ev)=>{
      let res; try{ res=JSON.parse(ev.data); }catch{ return; }
      if(res.error_code){ showError("Soniox: "+(res.error_message||res.error_type||res.error_code)); stopSoniox(); return; }
      let partial="";
      for(const tk of (res.tokens||[])){
        if(tk.text==="<end>" || tk.text==="<fin>"){   // endpoint (เงียบ) → ย้าย final เข้า pending + ตั้ง timer ส่ง (debounce)
          if(sxFinal.trim()){ sxPending=(sxPending?sxPending+" ":"")+sxFinal.trim(); sxFinal=""; }
          clearTimeout(sxSendTimer); sxSendTimer=setTimeout(sxCommit, sxMergeMs());
          continue;
        }
        clearTimeout(sxSendTimer); sxSendTimer=null;   // มี token จริง = ยังพูดอยู่ → ยกเลิกส่งที่ค้าง (รวมต่อ)
        if(tk.is_final) sxFinal+=tk.text; else partial+=tk.text;
      }
      const prev=((sxPending?sxPending+" ":"")+sxFinal+partial).trim();
      updateVoicePreview(prev?("🗣 "+prev):"(กำลังฟัง…)");
    };
    sxWS.onerror=()=>{ showError("เชื่อมต่อ Soniox ไม่สำเร็จ — เช็ค key/เน็ต"); };
    sxProc.onaudioprocess=(e)=>{
      if(!sxReady || !sxWS || sxWS.readyState!==1) return;
      const f=e.inputBuffer.getChannelData(0);
      const i16=new Int16Array(f.length);
      for(let i=0;i<f.length;i++){ let s=Math.max(-1,Math.min(1,f[i])); i16[i]=s<0?s*0x8000:s*0x7FFF; }
      sxWS.send(i16.buffer);
    };
    sxSrc.connect(sxProc); sxProc.connect(sxGain); sxGain.connect(sxCtx.destination);
  }catch(e){ showError("เริ่ม Soniox ไม่สำเร็จ: "+esc(e.message)); stopSoniox(); return; }
  updateVoicePreview("(กำลังฟัง…)"); setMicUI(); refreshStatus();
}
// commit: รวม pending + final ที่สะสม → ส่งเป็นก้อนเดียว (เรียกจาก debounce timer หลังเงียบจริง)
function sxCommit(){
  clearTimeout(sxSendTimer); sxSendTimer=null;
  const txt=((sxPending?sxPending+" ":"")+sxFinal).trim();
  sxPending=""; sxFinal="";
  clearVoicePreview();
  if(txt){ hybridQ.push(txt); _drainHybridQ(); }
}
// กด ✂️ ส่งเลย / หยุด → ส่งทุกอย่างที่ถอดได้ทันที (ไม่รอ debounce)
function sonioxFlush(){ sxCommit(); }
function stopSoniox(){
  recOn=false;
  sonioxFlush();   // ส่งเศษสุดท้าย
  try{ if(sxProc) sxProc.onaudioprocess=null; sxProc&&sxProc.disconnect(); }catch{}
  try{ sxGain&&sxGain.disconnect(); }catch{}
  try{ sxSrc&&sxSrc.disconnect(); }catch{}
  try{ sxCtx&&sxCtx.close(); }catch{}
  try{ if(sxWS && sxWS.readyState===1) sxWS.send(""); }catch{}   // empty frame = จบ stream
  const w=sxWS; if(w) setTimeout(()=>{ try{w.close();}catch{} }, 600);
  sxWS=null; sxCtx=sxSrc=sxProc=sxGain=null; sxReady=false;
  try{ audioStream&&audioStream.getTracks().forEach(t=>t.stop()); }catch{}
  clearVoicePreview(); setMicUI(); refreshStatus();
}

async function voiceSend(){
  const text=finalText.trim();
  if(!text||processing) return;
  processing=true; clearTimeout(silenceTimer); finalText="";
  try{rec&&rec.stop();}catch{}
  await submit(text);
  processing=false;
  if(micOn) startRec();
}
