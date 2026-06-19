// 08-overlay.js — หน้าต่างลอย (floating overlay) 2 โหมด: inpage (โปร่ง มองทะลุ) / pip (Document PiP ลอยเหนือ)
// mirror #results เข้าเป้าหมายที่ active ด้วย MutationObserver ตัวเดียว. เปิดตอนกด startBtn.
// (classic script; โหลดท้ายสุดต่อจาก 07-main — เรียก openOverlay/closeOverlay ตอน runtime)

let floatObserver=null, floatTarget=null, pipWin=null;

// ── mirror logic (ใช้ร่วมทั้ง 2 โหมด — ต่างกันแค่ floatTarget อยู่ไหน) ──
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

// ── In-page overlay (โปร่ง มองทะลุ) ──
function applyFloatOpacity(v){ $("floatPanel").style.setProperty("--float-bg-a", (v/100).toFixed(2)); }
function openInpage(){
  const panel=$("floatPanel");
  panel.style.display="flex";
  // restore ความโปร่ง + ตำแหน่ง
  const op = +store.get("ma_float_op") || +$("floatOpacity").value;
  $("floatOpacity").value = op; applyFloatOpacity(op);
  const pos = store.get("ma_float_pos");
  if(pos){ try{ const p=JSON.parse(pos); panel.style.left=p.left+"px"; panel.style.top=p.top+"px"; panel.style.right="auto"; panel.style.bottom="auto"; }catch{} }
  startMirror($("floatResults"));
}
function closeInpage(){
  $("floatPanel").style.display="none";
  if(floatTarget===$("floatResults")) stopMirror();
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
  if(!("documentPictureInPicture" in window)){   // ไม่รองรับ → fallback in-page
    floatMode="inpage"; store.set("ma_float_mode","inpage"); applyFloatModeUI();
    showError("เบราว์เซอร์นี้ไม่รองรับหน้าต่างลอยเหนือ (Document PiP) — ใช้โหมดโปร่งแทน");
    openInpage(); return;
  }
  try{ pipWin = await documentPictureInPicture.requestWindow({width:360, height:480}); }
  catch(e){ return; }   // ผู้ใช้ยกเลิก/ไม่มี gesture
  copyStylesTo(pipWin);
  const d=pipWin.document;
  d.body.className="pip-body";
  const head=d.createElement("div"); head.className="pip-head"; head.textContent="🎤 Meeting Assistant";
  const wrap=d.createElement("div"); wrap.className="chat-msgs pip-msgs"; wrap.id="pipResults";
  d.body.appendChild(head); d.body.appendChild(wrap);
  startMirror(wrap);
  pipWin.addEventListener("pagehide", ()=>{ stopMirror(); pipWin=null; });
}
function closePip(){
  stopMirror();
  if(pipWin){ try{ pipWin.close(); }catch{} pipWin=null; }
}

// ── เปิด/ปิด (dispatch ตาม floatMode) ──
function openOverlay(){
  if(floatMode==="pip"){ closeInpage(); openPip(); }
  else { closePip(); openInpage(); }
}
function closeOverlay(){ closeInpage(); closePip(); }

// ── โหมด toggle (segmented บน home + ปุ่ม ⇄ บนแผง) ──
function applyFloatModeUI(){
  $("floatInpage").classList.toggle("on", floatMode==="inpage");
  $("floatPip").classList.toggle("on", floatMode==="pip");
}
function setFloatMode(m){
  if(m===floatMode) return;
  floatMode=m; store.set("ma_float_mode", m); applyFloatModeUI();
  // ถ้าเปิดอยู่ → สลับทันที (เรียกจาก click ของปุ่ม = user gesture → PiP เปิดได้)
  const isOpen = $("floatPanel").style.display!=="none" || pipWin;
  if(isOpen) openOverlay();
}
$("floatInpage").onclick=()=>setFloatMode("inpage");
$("floatPip").onclick=()=>setFloatMode("pip");
$("floatSwitch").onclick=()=>setFloatMode(floatMode==="inpage"?"pip":"inpage");
$("floatClose").onclick=closeOverlay;
applyFloatModeUI();

// ── drag (in-page overlay — ลากแถบหัวย้ายตำแหน่ง, clamp ในจอ, persist) ──
(function(){
  const panel=$("floatPanel"), head=$("floatHead");
  let dragging=false, ox=0, oy=0;
  head.addEventListener("pointerdown",(e)=>{
    if(e.target.closest("button,input")) return;   // ไม่ลากตอนกดปุ่ม/สไลเดอร์
    dragging=true; const r=panel.getBoundingClientRect();
    ox=e.clientX-r.left; oy=e.clientY-r.top;
    panel.style.right="auto"; panel.style.bottom="auto";
    try{ head.setPointerCapture(e.pointerId); }catch{}
  });
  head.addEventListener("pointermove",(e)=>{
    if(!dragging) return;
    let left=e.clientX-ox, top=e.clientY-oy;
    left=Math.max(0, Math.min(left, innerWidth-panel.offsetWidth));
    top =Math.max(0, Math.min(top,  innerHeight-panel.offsetHeight));
    panel.style.left=left+"px"; panel.style.top=top+"px";
  });
  head.addEventListener("pointerup",(e)=>{
    if(!dragging) return; dragging=false;
    try{ head.releasePointerCapture(e.pointerId); }catch{}
    store.set("ma_float_pos", JSON.stringify({left:panel.offsetLeft, top:panel.offsetTop}));
  });
})();

// ── opacity slider ──
$("floatOpacity").oninput=()=>{ const v=+$("floatOpacity").value; applyFloatOpacity(v); store.set("ma_float_op", v); };
