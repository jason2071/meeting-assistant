// 08-overlay.js — หน้าต่างลอย (floating overlay): Document PiP ลอยเหนือแอปอื่น (always-on-top)
// mirror #results เข้าหน้าต่าง PiP ด้วย MutationObserver. เปิดตอนกด startBtn / toggle ปุ่ม 🪟.
// (classic script; โหลดท้ายสุดต่อจาก 07-main — เรียก openOverlay/closeOverlay ตอน runtime)

let floatObserver=null, floatTarget=null, pipWin=null;

// ── mirror logic (#results → หน้าต่าง PiP) ──
function syncOverlay(){
  if(!floatTarget) return;
  floatTarget.innerHTML = results.innerHTML;
  floatTarget.scrollTop = floatTarget.scrollHeight;
}
function startMirror(targetEl){
  floatTarget = targetEl;
  syncOverlay();
  if(floatObserver) floatObserver.disconnect();
  floatObserver = new MutationObserver(syncOverlay);
  floatObserver.observe(results, {childList:true, subtree:true, characterData:true});
}
function stopMirror(){
  if(floatObserver){ floatObserver.disconnect(); floatObserver=null; }
  floatTarget=null;
}

// ── Document PiP (ลอยเหนือ/ซ่อนตอนแชร์หน้าต่าง) ──
function copyStylesTo(win){
  [...document.styleSheets].forEach(ss=>{
    try{
      const css=[...ss.cssRules].map(r=>r.cssText).join("\n");
      const style=win.document.createElement("style"); style.textContent=css; win.document.head.appendChild(style);
    }catch(e){
      // cross-origin (เช่น Tailwind CDN) — อ่าน cssRules ไม่ได้ → link แทน
      if(ss.href){ const link=win.document.createElement("link"); link.rel="stylesheet"; link.href=ss.href; win.document.head.appendChild(link); }
    }
  });
}
async function openPip(){
  if(!("documentPictureInPicture" in window)){
    showError("เบราว์เซอร์นี้ไม่รองรับหน้าต่างลอย (Document PiP) — ใช้ Chrome/Edge 116+");
    updateFloatBtn(); return;
  }
  try{ pipWin = await documentPictureInPicture.requestWindow({width:360, height:480}); }
  catch(e){ return; }   // ผู้ใช้ยกเลิก/ไม่มี gesture
  copyStylesTo(pipWin);
  const d=pipWin.document;
  d.body.className="pip-body";
  const head=d.createElement("div"); head.className="pip-head"; head.textContent="🎤 Meeting Assistant";
  const wrap=d.createElement("div"); wrap.className="chat-msgs pip-msgs"; wrap.id="pipResults";
  const comp=d.createElement("div"); comp.className="float-composer";
  comp.innerHTML='<button class="fc-mic mic"></button><button class="fc-stop pill stopbtn" style="display:none"></button><button class="fc-screen pill"></button><div class="fc-inputrow"><input class="fc-input" placeholder="พิมพ์คำถาม…" /><button class="fc-send send">➤</button></div>';
  d.body.appendChild(head); d.body.appendChild(wrap); d.body.appendChild(comp);
  startMirror(wrap);
  wireFloatControls(comp); syncFloatControls();
  pipWin.addEventListener("pagehide", ()=>{ stopMirror(); pipWin=null; updateFloatBtn(); });
  updateFloatBtn();
}
function closePip(){
  stopMirror();
  if(pipWin){ try{ pipWin.close(); }catch{} pipWin=null; }
  updateFloatBtn();
}

// ── เปิด/ปิด ──
function openOverlay(){ openPip(); }
function closeOverlay(){ closePip(); }
function isOverlayOpen(){ return !!(pipWin && !pipWin.closed); }
function toggleOverlay(){ if(isOverlayOpen()) closeOverlay(); else openOverlay(); }
function updateFloatBtn(){ const on=isOverlayOpen(); $("floatBtn").classList.toggle("on",on); $("floatBtn").setAttribute("aria-pressed",String(on)); }
$("floatBtn").onclick=toggleOverlay;
updateFloatBtn();

// ── control bar ในหน้าต่างลอย: mic / แชร์จอ / input — proxy ไปปุ่มหลัก + submit ──
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
// sync ปุ่มในแผง PiP (label/สถานะ on/ซ่อน) ตามปุ่มหลัก
function syncFloatControls(){
  if(!(pipWin && !pipWin.closed)) return;
  const s=pipWin.document.body;
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
