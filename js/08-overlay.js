// 08-overlay.js — หน้าต่างลอย (floating overlay)
//   • Electron (desktop): หน้าต่างลอยแยก always-on-top (mirror #results ผ่าน IPC) — gate ด้วย window.electronAPI
//   • Browser: Document PiP (fallback เดิม)
// เปิดตอนกด startBtn / toggle ปุ่ม 🪟. (classic script; โหลดท้ายสุดต่อจาก 07-main)

const IS_ELECTRON = !!(window.electronAPI && window.electronAPI.isElectron);
let floatObserver=null, floatSink=null, pipWin=null, elecOpen=false;

// ── mirror logic (#results → sink: DOM ของ PiP หรือ push ผ่าน IPC) — coalesce ด้วย rAF ──
function syncOverlay(){
  if(!floatSink) return;
  if(syncOverlay._raf) return;
  syncOverlay._raf=requestAnimationFrame(()=>{ syncOverlay._raf=null; if(floatSink) floatSink(results.innerHTML); });
}
function startMirror(sink, paintNow=true){
  floatSink=sink;
  if(paintNow && floatSink) floatSink(results.innerHTML);   // Electron: รอ "ready" ค่อย paint (paintNow=false) — overlay window โหลด async
  if(floatObserver) floatObserver.disconnect();
  floatObserver = new MutationObserver(syncOverlay);
  floatObserver.observe(results, {childList:true, subtree:true, characterData:true});
}
function stopMirror(){
  if(floatObserver){ floatObserver.disconnect(); floatObserver=null; }
  floatSink=null;
}

// ── Electron: หน้าต่างลอยแยก (transparent ความจางคุมด้วย win.setOpacity ฝั่ง main) ──
function openElectron(){
  electronAPI.openOverlay();
  elecOpen=true;
  // ไม่ eager push — overlay window จะส่ง "ready" กลับ แล้ว handler (ด้านล่าง) paint html+controls แรกเอง (กัน push หาย/ซ้ำ)
  startMirror((html)=>electronAPI.pushOverlayHTML(html), false);
  updateFloatBtn();
}
function closeElectron(){
  electronAPI.closeOverlay();
  elecOpen=false; stopMirror(); updateFloatBtn();
}

// ── Document PiP (browser fallback) ──
function copyStylesTo(win){
  [...document.styleSheets].forEach(ss=>{
    try{
      const css=[...ss.cssRules].map(r=>r.cssText).join("\n");
      const style=win.document.createElement("style"); style.textContent=css; win.document.head.appendChild(style);
    }catch(e){
      if(ss.href){ const link=win.document.createElement("link"); link.rel="stylesheet"; link.href=ss.href; win.document.head.appendChild(link); }
    }
  });
}
async function openPip(){
  if(!("documentPictureInPicture" in window)){
    showError("เบราว์เซอร์นี้ไม่รองรับหน้าต่างลอย (Document PiP) — ใช้ Chrome/Edge 116+ หรือ desktop app");
    updateFloatBtn(); return;
  }
  try{ pipWin = await documentPictureInPicture.requestWindow({width:360, height:480}); }
  catch(e){ return; }
  copyStylesTo(pipWin);
  const d=pipWin.document;
  d.body.className="pip-body";
  const head=d.createElement("div"); head.className="pip-head"; head.textContent="🎤 Meeting Assistant";
  const wrap=d.createElement("div"); wrap.className="chat-msgs pip-msgs"; wrap.id="pipResults";
  const comp=d.createElement("div"); comp.className="float-composer";
  comp.innerHTML='<button class="fc-mic mic"></button><button class="fc-stop pill stopbtn" style="display:none"></button><button class="fc-screen pill"></button><div class="fc-inputrow"><input class="fc-input" placeholder="พิมพ์คำถาม…" /><button class="fc-send send">➤</button></div>';
  d.body.appendChild(head); d.body.appendChild(wrap); d.body.appendChild(comp);
  startMirror((html)=>{ wrap.innerHTML=html; wrap.scrollTop=wrap.scrollHeight; });
  wireFloatControls(comp); syncFloatControls();
  pipWin.addEventListener("pagehide", ()=>{ stopMirror(); pipWin=null; updateFloatBtn(); });
  updateFloatBtn();
}
function closePip(){
  stopMirror();
  if(pipWin){ try{ pipWin.close(); }catch{} pipWin=null; }
  updateFloatBtn();
}

// ── เปิด/ปิด (dispatch ตาม environment) ──
function openOverlay(){ if(IS_ELECTRON) openElectron(); else openPip(); }
function closeOverlay(){ if(IS_ELECTRON) closeElectron(); else closePip(); }
function isOverlayOpen(){ return IS_ELECTRON ? elecOpen : !!(pipWin && !pipWin.closed); }
function toggleOverlay(){ if(isOverlayOpen()) closeOverlay(); else openOverlay(); }
function updateFloatBtn(){ const on=isOverlayOpen(); $("floatBtn").classList.toggle("on",on); $("floatBtn").setAttribute("aria-pressed",String(on)); }
$("floatBtn").onclick=toggleOverlay;
updateFloatBtn();

// ── control bar ในหน้าต่างลอย (PiP): mic / แชร์จอ / input — proxy ไปปุ่มหลัก + submit ──
function wireFloatControls(scope){
  const mic=scope.querySelector(".fc-mic"), stop=scope.querySelector(".fc-stop"),
        screen=scope.querySelector(".fc-screen"), input=scope.querySelector(".fc-input"), send=scope.querySelector(".fc-send");
  if(mic) mic.onclick=()=>$("micBtn").click();
  if(stop) stop.onclick=()=>$("stopBtn").click();
  if(screen) screen.onclick=()=>$("screenBtn").click();
  const doSend=()=>{ const v=(input&&input.value||"").trim(); if(!v) return; input.value=""; submit(v); };
  if(send) send.onclick=doSend;
  if(input) input.addEventListener("keydown",e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); doSend(); } });
}
// sync ปุ่มในแผง (label/สถานะ on/ซ่อน) ตามปุ่มหลัก — Electron push ผ่าน IPC; PiP เขียน DOM ตรง
function syncFloatControls(){
  if(IS_ELECTRON){
    if(!elecOpen) return;
    const st={};
    [["mic","micBtn"],["stop","stopBtn"],["screen","screenBtn"]].forEach(([k,id])=>{
      const src=$(id); if(!src) return;
      st[k]={label:src.textContent, display:src.style.display, on:src.classList.contains("on")};
    });
    st.fs = document.documentElement.style.getPropertyValue("--fs") || "14px";   // ขนาดฟอนต์ → overlay
    electronAPI.pushOverlayControls(st);
    return;
  }
  if(!(pipWin && !pipWin.closed)) return;
  const s=pipWin.document.body;
  pipWin.document.documentElement.style.setProperty("--fs", document.documentElement.style.getPropertyValue("--fs")||"14px");  // ฟอนต์ตาม slider
  [["fc-mic","micBtn"],["fc-stop","stopBtn"],["fc-screen","screenBtn"]].forEach(([fc,id])=>{
    const el=s.querySelector("."+fc), src=$(id); if(!el||!src) return;
    el.textContent=src.textContent;
    el.style.display=src.style.display;
    el.classList.toggle("on", src.classList.contains("on"));
  });
}
// ปุ่มหลักเปลี่ยน (label/class/ซ่อน) → sync แผงตาม (decoupled เหมือน mirror)
const ctrlObserver=new MutationObserver(()=>syncFloatControls());
["micBtn","stopBtn","screenBtn"].forEach(id=>ctrlObserver.observe($(id),{attributes:true,childList:true,characterData:true,subtree:true}));

// ── Electron: รับ action จากหน้าต่างลอย + sync state ตอน overlay พร้อม ──
if(IS_ELECTRON){
  electronAPI.onOverlayAction(({action,payload})=>{
    if(action==="ready"){ if(floatSink) floatSink(results.innerHTML); syncFloatControls(); return; }
    if(action==="mic") $("micBtn").click();
    else if(action==="stop") $("stopBtn").click();
    else if(action==="screen") $("screenBtn").click();
    else if(action==="send") submit(payload);
  });
  electronAPI.onOverlayClosed(()=>{ elecOpen=false; stopMirror(); updateFloatBtn(); });
}
