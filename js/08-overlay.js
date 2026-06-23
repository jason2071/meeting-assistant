// 08-overlay.js — หน้าต่างลอย (floating overlay)
//   • Electron (desktop): หน้าต่างลอยแยก always-on-top (mirror #results ผ่าน IPC) — gate ด้วย window.electronAPI
//   • Browser: Document PiP (fallback เดิม)
// เปิดตอนกด startBtn / toggle ปุ่ม 🪟. (classic script; โหลดท้ายสุดต่อจาก 07-main)

const IS_ELECTRON = !!(window.electronAPI && window.electronAPI.isElectron);
let floatObserver=null, floatSink=null, pipWin=null, elecOpen=false;
let floatReadonly=false;   // true = ดู session เก่าอย่างเดียว (ซ่อน composer ในหน้าต่างลอย)
const PIP_EMPTY_HINT='<div class="float-empty">พิมพ์หรือพูดคำถามด้านล่างเพื่อเริ่ม</div>';   // โชว์ตอน chat ว่าง
function quickChipsHTML(){ return (typeof QUICKASKS!=="undefined"?QUICKASKS:[]).map(a=>`<button type="button" class="chip-ask" data-ask="${esc(a)}">${esc(a)}</button>`).join(""); }

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

// ── Electron: หน้าต่างลอยแยก (transparent — ความจางคุมด้วย CSS bg alpha ฝั่ง overlay.html) ──
function openElectron(){
  if(elecOpen){ if(floatSink) floatSink(results.innerHTML); syncFloatControls(); return; }  // เปิดอยู่แล้ว → repaint+sync (เช่น สลับ live↔readonly)
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
  if(pipWin && !pipWin.closed){ if(floatSink) floatSink(results.innerHTML); syncFloatControls(); return; }  // เปิดอยู่แล้ว → repaint+sync
  if(!("documentPictureInPicture" in window)){
    showError("เบราว์เซอร์นี้ไม่รองรับหน้าต่างลอย (Document PiP) — ใช้ Chrome/Edge 116+ หรือ desktop app");
    updateFloatBtn(); return;
  }
  const pw=+store.get("ma_pip_w")||480, ph=+store.get("ma_pip_h")||640;   // จำขนาดที่ user ปรับ (default ใหญ่ขึ้น)
  try{ pipWin = await documentPictureInPicture.requestWindow({width:pw, height:ph}); }
  catch(e){ return; }
  let _pipRz; pipWin.addEventListener("resize",()=>{ clearTimeout(_pipRz); _pipRz=setTimeout(()=>{ if(pipWin&&!pipWin.closed){ store.set("ma_pip_w",pipWin.innerWidth); store.set("ma_pip_h",pipWin.innerHeight); } },300); });
  copyStylesTo(pipWin);
  const d=pipWin.document;
  d.body.className="pip-body";
  const head=d.createElement("div"); head.className="pip-head";
  head.innerHTML='<span class="pip-title">🎤 Meeting Assistant</span><span class="fc-stat mono"></span>';   // stat = ambient info ใน header
  // secondary controls (screen/auto/lang); mic+stop ย้ายลงข้าง input (ergonomic)
  const bar=d.createElement("div"); bar.className="fc-toolbar";
  bar.innerHTML='<button class="fc-screen pill"></button><button class="fc-img pill" title="ถามจากภาพจอที่แชร์ (ไม่ต้องพูด/พิมพ์)">📷 ถามภาพ</button><button class="fc-auto pill" title="ส่งอัตโนมัติหลังเงียบ">⚡</button><div class="seg fc-lang"><button class="fc-th">ไทย</button><button class="fc-en">Eng</button></div><button class="fc-clear iconbtn" title="ล้างแชท" style="margin-left:auto">🗑</button>';
  const wrap=d.createElement("div"); wrap.className="chat-msgs pip-msgs"; wrap.id="pipResults";
  const note=d.createElement("div"); note.className="pip-ro-note"; note.textContent="🔒 ดูอย่างเดียว";
  const stEl=d.createElement("div"); stEl.className="pip-status"; stEl.style.display="none";   // สถานะ (กำลังฟัง/เห็นจอ)
  const errEl=d.createElement("div"); errEl.className="pip-err"; errEl.style.display="none";   // error (mirror จาก #error)
  const comp=d.createElement("div"); comp.className="float-composer";
  comp.innerHTML='<div class="fc-quick">'+quickChipsHTML()+'</div><div class="fc-inputrow"><button class="fc-mic mic"></button><button class="fc-stop pill stopbtn" style="display:none"></button><input class="fc-input" placeholder="พิมพ์คำถาม…" /><button class="fc-send send">➤</button></div>';
  d.body.appendChild(head); d.body.appendChild(bar); d.body.appendChild(wrap); d.body.appendChild(note); d.body.appendChild(stEl); d.body.appendChild(errEl); d.body.appendChild(comp);
  startMirror((html)=>{   // sticky-bottom: เด้งล่างเฉพาะตอนอยู่ล่าง — scroll ขึ้น = คงตำแหน่ง (ไม่เด้ง)
    const atBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 60;
    const prevTop = wrap.scrollTop;
    wrap.innerHTML = html || PIP_EMPTY_HINT;
    wrap.scrollTop = atBottom ? wrap.scrollHeight : prevTop;
  });
  wireFloatControls(d.body); syncFloatControls();
  d.body.addEventListener("click",(e)=>{ const c=e.target.closest(".chip-ask"); if(c){ const t=c.getAttribute("data-ask"); if(t) submit(t); } });   // quick + follow-up chips → ถาม
  if(typeof hkMatch==="function") d.addEventListener("keydown", hkMatch);   // คีย์ลัด focus ในหน้าต่างลอย (browser)
  pipWin.addEventListener("pagehide", ()=>{ stopMirror(); pipWin=null; updateFloatBtn(); });
  updateFloatBtn();
}
function closePip(){
  stopMirror();
  if(pipWin){ try{ pipWin.close(); }catch{} pipWin=null; }
  updateFloatBtn();
}

// ── pre-warm connection: warm TLS ตอนเปิดแชท + ทุก 15s กัน connection idle หลุด (TTFB เร็วขึ้น) ──
let _warmTimer=null;
function startWarmLoop(){
  if(typeof prewarmConn!=="function") return;
  prewarmConn();   // warm ทันทีตอนเปิด → request แรกก็ warm
  if(_warmTimer) return;
  _warmTimer=setInterval(()=>{ if(isOverlayOpen()) prewarmConn(); else stopWarmLoop(); }, 15000);
}
function stopWarmLoop(){ if(_warmTimer){ clearInterval(_warmTimer); _warmTimer=null; } }

// ── เปิด/ปิด (dispatch ตาม environment) ──
function openOverlay(){ if(IS_ELECTRON) openElectron(); else openPip(); startWarmLoop(); }
function closeOverlay(){ if(IS_ELECTRON) closeElectron(); else closePip(); stopWarmLoop(); }
function isOverlayOpen(){ return IS_ELECTRON ? elecOpen : !!(pipWin && !pipWin.closed); }
function toggleOverlay(){ if(isOverlayOpen()) closeOverlay(); else openOverlay(); }
function updateFloatBtn(){ const on=isOverlayOpen(); $("floatBtn").classList.toggle("on",on); $("floatBtn").setAttribute("aria-pressed",String(on)); if(typeof renderSessions==="function") renderSessions(); }   // refresh badge "กำลังใช้" ตามสถานะเปิด/ปิด
$("floatBtn").onclick=toggleOverlay;
updateFloatBtn();

// ── control bar ในหน้าต่างลอย (PiP): mic / แชร์จอ / input — proxy ไปปุ่มหลัก + submit ──
function wireFloatControls(scope){
  const mic=scope.querySelector(".fc-mic"), stop=scope.querySelector(".fc-stop"),
        screen=scope.querySelector(".fc-screen"), input=scope.querySelector(".fc-input"), send=scope.querySelector(".fc-send");
  if(mic) mic.onclick=()=>$("micBtn").click();
  if(stop) stop.onclick=()=>$("stopBtn").click();
  if(screen) screen.onclick=()=>$("screenBtn").click();
  const img=scope.querySelector(".fc-img"); if(img) img.onclick=()=>askImageOnly();   // 📷 ถามจากภาพจอ
  const doSend=()=>{ const v=(input&&input.value||"").trim(); if(!v) return; input.value=""; submit(v); };
  if(send) send.onclick=doSend;
  if(input) input.addEventListener("keydown",e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); doSend(); } });
  // cold controls (ย้ายมาจาก chat header) → proxy ไปปุ่มหลัก
  const th=scope.querySelector(".fc-th"), en=scope.querySelector(".fc-en"), auto=scope.querySelector(".fc-auto");
  if(th) th.onclick=()=>$("thBtn").click();
  if(en) en.onclick=()=>$("enBtn").click();
  if(auto) auto.onclick=()=>$("autoBtn").click();
  const clear=scope.querySelector(".fc-clear");
  if(clear) clear.onclick=()=>{ if((scope.ownerDocument.defaultView||window).confirm("ล้างแชททั้งหมด?")) $("clear").click(); };
}
// sync ปุ่มในแผง (label/สถานะ on/ซ่อน) ตามปุ่มหลัก — Electron push ผ่าน IPC; PiP เขียน DOM ตรง
function syncFloatControls(){
  const title=(curTitleEl&&curTitleEl.textContent)||"Meeting Assistant";
  const modeLbl=($("curMode")&&$("curMode").textContent)||"";
  // readonly = ดู session เก่า → stat ของ session ปัจจุบันไม่เกี่ยว → ซ่อน
  const statTxt=floatReadonly ? "" : ((($("count")&&$("count").textContent)||"")+" "+(($("tok")&&$("tok").textContent)||"")).trim();
  const langShow=(typeof sttEngine==="undefined") || sttEngine==="web";   // ไทย/Eng ใช้เฉพาะ Web Speech STT
  const errTxt=(errBox&&errBox.style.display!=="none") ? (errBox.textContent||"") : "";   // mirror error เข้า float
  const statusTxt=(statusEl&&statusEl.style.display!=="none") ? (statusEl.textContent||"") : "";   // mirror status (กำลังฟัง/เห็นจอ)
  if(IS_ELECTRON){
    if(!elecOpen) return;
    const st={ readonly:floatReadonly, title, mode:modeLbl, stat:statTxt, langShow, error:errTxt, status:statusTxt,
      quick:(typeof QUICKASKS!=="undefined"?QUICKASKS:[]),
      th:$("thBtn")&&$("thBtn").classList.contains("on"), en:$("enBtn")&&$("enBtn").classList.contains("on"),
      auto:$("autoBtn")&&$("autoBtn").classList.contains("on") };
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
  s.classList.toggle("readonly", floatReadonly);   // readonly → CSS ซ่อน composer/toolbar + โชว์ note
  const ttl=s.querySelector(".pip-title"); if(ttl) ttl.textContent=(modeLbl?modeLbl+" · ":"")+title;
  pipWin.document.documentElement.style.setProperty("--fs", document.documentElement.style.getPropertyValue("--fs")||"14px");  // ฟอนต์ตาม slider
  [["fc-mic","micBtn"],["fc-stop","stopBtn"],["fc-screen","screenBtn"]].forEach(([fc,id])=>{
    const el=s.querySelector("."+fc), src=$(id); if(!el||!src) return;
    el.textContent=src.textContent;
    el.style.display=src.style.display;
    el.classList.toggle("on", src.classList.contains("on"));
  });
  // cold controls sync
  const langSeg=s.querySelector(".fc-lang"); if(langSeg) langSeg.style.display=langShow?"":"none";
  const th=s.querySelector(".fc-th"); if(th&&$("thBtn")) th.classList.toggle("on",$("thBtn").classList.contains("on"));
  const en=s.querySelector(".fc-en"); if(en&&$("enBtn")) en.classList.toggle("on",$("enBtn").classList.contains("on"));
  const auto=s.querySelector(".fc-auto"); if(auto&&$("autoBtn")) auto.classList.toggle("on",$("autoBtn").classList.contains("on"));
  const stat=s.querySelector(".fc-stat"); if(stat) stat.textContent=statTxt;
  const errEl=s.querySelector(".pip-err"); if(errEl){ errEl.textContent=errTxt; errEl.style.display=errTxt?"block":"none"; }
  const stEl=s.querySelector(".pip-status"); if(stEl){ stEl.textContent=statusTxt; stEl.style.display=statusTxt?"block":"none"; }
}
// ปุ่มหลัก/error/status เปลี่ยน → sync แผงตาม (decoupled เหมือน mirror)
const ctrlObserver=new MutationObserver(()=>syncFloatControls());
["micBtn","stopBtn","screenBtn","thBtn","enBtn","autoBtn","count","tok","error","status"].forEach(id=>{ const e=$(id); if(e) ctrlObserver.observe(e,{attributes:true,childList:true,characterData:true,subtree:true}); });

// ── Electron: รับ action จากหน้าต่างลอย + sync state ตอน overlay พร้อม ──
if(IS_ELECTRON){
  electronAPI.onOverlayAction(({action,payload})=>{
    // "ready" = overlay window พร้อมจริง → ยืนยัน elecOpen (authoritative) แล้ว paint แรก
    if(action==="ready"){ elecOpen=true; if(floatSink) floatSink(results.innerHTML); syncFloatControls(); updateFloatBtn(); return; }
    if(action==="mic") $("micBtn").click();
    else if(action==="stop") $("stopBtn").click();
    else if(action==="screen") $("screenBtn").click();
    else if(action==="askImage") askImageOnly();   // 📷 ถามจากภาพจอ
    else if(action==="send") submit(payload);
    else if(action==="th") $("thBtn").click();
    else if(action==="en") $("enBtn").click();
    else if(action==="auto") $("autoBtn").click();
    else if(action==="clear") $("clear").click();   // ล้างแชท (confirm ฝั่ง overlay แล้ว)
    else if(action==="closeSession"){ if(!floatReadonly && typeof stopListen==="function") stopListen(); closeOverlay(); }   // ปิด ✕ = จบ session (confirm ฝั่ง overlay แล้ว) + ปิดหน้าต่าง
    else if(action==="ask") submit(payload);   // quick/follow-up chip จากหน้าต่างลอย
  });
  electronAPI.onOverlayClosed(()=>{ elecOpen=false; stopMirror(); updateFloatBtn(); });
}
