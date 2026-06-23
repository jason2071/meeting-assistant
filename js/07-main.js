// 07-main.js — submit + sessions/routing + font + init (must load LAST)
// (classic script; loaded in numeric order — top-level globals shared across files)

// ── Submit ──
$("sendBtn").onclick=()=>submit();
$("input").addEventListener("keydown",(e)=>{ if((e.metaKey||e.ctrlKey)&&e.key==="Enter") submit(); });
$("input").addEventListener("input",()=>{ const v=$("input").value.trim(); $("sendBtn").classList.toggle("ready",!!v&&!busy); });

async function submit(override){
  // เสียง qa/est อยู่ใน finalText (ไม่ใช่ textarea) → ถ้าพิมพ์ใช้ค่าจาก textarea ก่อน ไม่งั้น fallback เสียง
  const q=(override!=null ? override : ($("input").value.trim() || finalText)).trim();
  if(!q||busy) return;
  plog("③ submit() start");
  const key=keyInp.value.trim(), model=modelInp.value.trim();
  if(!key){ showError("ยังไม่ได้ใส่ API key — กลับไปตั้งค่าที่หน้าหลัก"); return; }
  busy=true; showError(""); $("input").value=""; finalText=""; clearVoicePreview(); $("sendBtn").classList.remove("ready");
  const sess = (ensureSession(), curSess);   // ผูกคำตอบกับ session นี้ — สลับ session ระหว่างตอบ คำตอบไม่ข้าม
  const image = screenOn ? captureFrame() : null;
  // multi-turn: ประวัติ Q&A ก่อนหน้า (items มีแค่ turn เก่า — saveItem รันหลังตอบ); cap + gate ด้วย contextOn
  const MAX_TURNS=10;
  const history=(contextOn ? ((sess&&sess.items)||[]).slice(-MAX_TURNS) : [])
    .flatMap(it=>[{role:"user",text:it.q},{role:"assistant",text:it.raw}]);
  addUserMsg(q, !!image);

  if(mode==="qa"){
    const aiBubble=addAiMsg(); const ans=el("div","ans","▍"); aiBubble.appendChild(ans);
    try{
      const req=buildRequest(provider,key,model,{system:QA_SYSTEM+stackLine(),text:q,image,json:false,maxTokens:4096,think:thinkOn,history});  // maxTokens สูงกัน thinking กิน budget; ความสั้นคุมด้วย prompt
      let _ft=false;
      const full=await streamLLM(req,(full)=>{ if(!_ft){ _ft=true; plog("⑤ first token (เริ่มเห็นคำตอบ)"); } ans.innerHTML=mdToHtml(full); scrollBottom(); });
      plog("⑥ stream done (คำตอบครบ)");
      if(!ans.textContent.trim()) ans.textContent="(ไม่มีคำตอบ)";
      if(full && full.trim()){ const tok=addCost(req.usageAcc); aiBubble.appendChild(tokBadge(tok)); saveItem({q, mode:"qa", hadImage:!!image, raw:full, tok}, sess); genFollowups(aiBubble, q, full); }
    }catch(e){ ans.textContent=""; ans.appendChild(el("span","warn","⚠ "+esc(e.message))); }
  } else {
    const bubble=addAiMsg();
    const load=el("div","mono","กำลังประเมิน…"); load.style.color="var(--muted)"; bubble.appendChild(load);
    try{
      const req=buildRequest(provider,key,model,{system:EST_SYSTEM+stackLine(),text:q,image,json:true,maxTokens:4096,think:thinkOn,history});
      const raw=await streamLLM(req,null);
      const clean=raw.replace(/```json|```/g,"").trim();
      if(!clean || clean==="{") throw new Error("AI ตอบว่าง/ไม่เป็น JSON (อาจถูกตัดหรือ model ไม่รองรับ json mode) — ลองใหม่ หรือเปลี่ยน model");
      const est=looseJSON(clean);
      load.remove(); renderEstimate(bubble,est); const tok=addCost(req.usageAcc); bubble.appendChild(tokBadge(tok)); scrollBottom();
      saveItem({q, mode:"est", hadImage:!!image, raw:JSON.stringify(est), tok}, sess);
    }catch(e){ load.textContent=""; load.appendChild(el("span","warn","⚠ "+esc(e.message))); }
  }
  busy=false; scrollBottom();
}

refreshStatus();

// ── follow-up chips: ยิง LLM เบาๆ ขอคำถามต่อ 3 ข้อ (qa เท่านั้น, gate followupOn) ──
async function genFollowups(bubble, q, answer){
  if(!followupOn || mode!=="qa") return;
  const key=keyInp.value.trim(), model=modelInp.value.trim(); if(!key) return;
  try{
    const sys="เสนอคำถามต่อที่ผู้ใช้น่าจะถามต่อจากคำตอบ 3 ข้อ สั้นกระชับ (<=8 คำ) ภาษาไทย — ตอบเป็น JSON array ของ string เท่านั้น ห้ามมีอย่างอื่น";
    const req=buildRequest(provider,key,model,{system:sys,text:`คำถาม: ${q}\nคำตอบ: ${(answer||"").slice(0,1500)}`,json:false,maxTokens:256,think:false});
    const raw=await streamLLM(req,null);
    const m=(raw||"").match(/\[[\s\S]*\]/); if(!m) return;
    const arr=JSON.parse(m[0]); if(!Array.isArray(arr)) return;
    renderFollowups(bubble, arr.filter(x=>typeof x==="string"&&x.trim()).slice(0,3));
  }catch{}   // เงียบ — follow-up เป็น nice-to-have
}

// ── Sessions (history) + view routing ──
// เก็บใน IndexedDB (js/02). โหลดเข้า memory map SESS ตอน init แล้วอ่าน sync; เขียน IDB fire-and-forget.
let viewName="current", curId=store.get("ma_cur")||null, curSess=null;
let SESS = {};   // id → session เต็ม (in-memory cache ของ IndexedDB)
function sessIndex(){   // derive index จาก SESS (sort ใหม่→เก่า)
  return Object.values(SESS)
    .map(s=>({id:s.id,title:s.title,updatedAt:s.updatedAt,createdAt:s.createdAt,mode:s.mode}))
    .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
}
function loadSess(id){ return SESS[id] || null; }
function persistSess(s){ SESS[s.id]=s; idbPut(s); }   // memory + IDB (fire-and-forget)
function fmtDate(ts){ const d=new Date(ts); return d.toLocaleDateString("th-TH",{day:"numeric",month:"short"})+" "+d.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"}); }

function ensureSession(){
  if(curSess) return;
  curId="s"+Date.now();
  curSess={ id:curId, title:"", createdAt:Date.now(), updatedAt:Date.now(), provider, model:modelInp.value, mode, items:[] };
  persistSess(curSess);
  store.set("ma_cur", curId);
}
function setCurTitle(t){ curTitleEl.textContent=t; curTitleEl.title=t; }
// แนบ cost ($) ลง usage — เฉพาะ OpenRouter ที่มี pricing จริง (provider อื่น = token อย่างเดียว)
function addCost(tok){
  tok=tok||{}; if(provider==="openrouter"){ const p=modelPrice(); if(p) tok.cost=(tok.in||0)*p.pin+(tok.out||0)*p.pout; }
  return tok;
}
// token (+cost ถ้ามี) รวมของ current session โชว์ใน header
function updateTokTotal(){
  let i=0,o=0,c=0,hasC=false;
  ((curSess&&curSess.items)||[]).forEach(it=>{ if(it.tok){ i+=it.tok.in||0; o+=it.tok.out||0; if(it.tok.cost!=null){ c+=it.tok.cost; hasC=true; } } });
  $("tok").textContent = (i||o) ? `· ↑${fmtTok(i)} ↓${fmtTok(o)}`+(hasC?` · ${fmtCost(c)}`:"") : "";
}
function newSession(){
  resetListen();  // reset การฟังเป็น idle (ปุ่มกลับมา) เมื่อเริ่ม session ใหม่
  curId=null; curSess=null; ensureSession();
  results.innerHTML=""; clearVoicePreview(); items=0; bumpCount();
  setCurTitle("Session ใหม่");
  floatReadonly=false;                 // session ใหม่ = แก้ไขได้
  renderSessions(); showView("home"); openOverlay();   // chat อยู่ในหน้าต่างลอย — main window คง lobby
}
function saveItem(item, sess){
  sess = sess || (ensureSession(), curSess);
  sess.items.push(item);
  sess.updatedAt=Date.now(); sess.provider=provider; sess.model=modelInp.value; sess.mode=mode;
  if(!sess.title){ sess.title=(item.q||"").slice(0,48); if(sess===curSess) setCurTitle(sess.title); }
  persistSess(sess);
  if(sess===curSess) updateTokTotal();   // header token รวม = ของ session ที่กำลังดู
  renderSessions();
}
function deleteSession(id){
  if(!confirm("ลบ session นี้? ไม่สามารถกู้คืนได้")) return;
  delete SESS[id]; idbDel(id);
  if(id===curId){ curId=null; curSess=null; store.remove("ma_cur"); results.innerHTML=""; items=0; bumpCount(); setCurTitle("Session ใหม่"); }
  renderSessions();
}
function renderSessions(){
  const ix=sessIndex();
  homeListEl.innerHTML = ix.length
    ? ix.map(s=>{
        const sess=loadSess(s.id)||{};
        const md=s.mode || sess.mode || "qa";   // fallback ให้ session เก่าที่ index ยังไม่มี mode
        // "กำลังใช้" = session ปัจจุบัน + หน้าต่างลอยเปิดจริง + ยังไม่ปิด (stopped) — ปิดแชทแล้ว badge หาย
        const cur=s.id===curId && !sess.stopped && (typeof isOverlayOpen==="function" ? isOverlayOpen() : true);
        return `<div class="home-card${cur?" active":""} transition-all hover:-translate-y-0.5 hover:shadow-xl" data-id="${s.id}"><span class="m mode-badge">${esc(MODE_LABEL[md]||MODE_LABEL.qa)}</span>${cur?'<span class="cur-badge">● กำลังใช้</span>':''}<div class="t">${esc(s.title||"Session ใหม่")}</div><span class="d">${fmtDate(s.updatedAt)}</span><button class="del" data-del="${s.id}" aria-label="ลบ session ${esc(s.title||"Session ใหม่")}">✕</button></div>`;
      }).join("")
    : `<div class="side-empty">ยังไม่มีประวัติ — กดเริ่มใหม่ด้านบน</div>`;
  const rb=$("resumeBtn"); if(rb) rb.style.display = (curId && curSess) ? "flex" : "none";   // ปุ่มเปิด float กลับ
}
function showView(name){
  viewName=name;
  // เหลือแค่ home/settings ที่แสดงในหน้าต่างหลัก; chat เป็น headless — แสดงในหน้าต่างลอย
  $("viewHome").style.display = name==="home"?"block":"none";
  $("viewSettings").style.display = name==="settings"?"block":"none";
  $("viewCurrent").style.display = "none";   // headless engine (mirror source + composer proxy)
  renderSessions();
}
function openSession(id){
  if(id===curId){
    // resume session ที่ active → live ในหน้าต่างลอย (stopped → view-only)
    floatReadonly = !!(curSess && curSess.stopped);
    if(curSess){ renderSessionInto(results, curSess); setCurTitle(curSess.title||"Session ใหม่"); }  // กรณีถูก readonly view ทับ #results
    showView("home"); openOverlay(); return;
  }
  const s=loadSess(id); if(!s){ showView("home"); return; }
  // session เก่า → ดูอย่างเดียวในหน้าต่างลอย (ไม่แตะ curSess/curId — live session ยังอยู่ใน memory/IDB)
  floatReadonly=true;
  setCurTitle(s.title||"Session");
  renderSessionInto(results, s);       // วาดลง mirror #results → หน้าต่างลอยสะท้อนอัตโนมัติ
  showView("home"); openOverlay();
}
function sessClick(e){
  const del=e.target.closest("[data-del]");
  if(del){ e.stopPropagation(); deleteSession(del.getAttribute("data-del")); return; }
  const it=e.target.closest("[data-id]");
  if(it) openSession(it.getAttribute("data-id"));
}
homeListEl.addEventListener("click", sessClick);
$("startBtn").onclick=()=>{ setMode(homeMode); newSession(); };  // โหมดที่เลือกบนหน้าหลัก → ล็อกต่อ session; newSession เปิดหน้าต่างลอยเอง
$("resumeBtn").onclick=()=>{ if(curId) openSession(curId); };    // เปิดหน้าต่างลอยกลับสู่ session ปัจจุบัน
$("settingsBtn").onclick=()=>showView("settings");
$("settingsBack").onclick=()=>showView("home");

// ── Settings panel expand/collapse (persist) — #settingsWrap removed; settings is now its own view ──

// ── Font size ──
let fontPx = +store.get("ma_fontsize")||14;
function applyFont(px){ document.documentElement.style.setProperty("--fs", px+"px"); fontVal.textContent=px+"px"; }
fontRange.value=fontPx; applyFont(fontPx);
fontRange.oninput=()=>{ fontPx=+fontRange.value; applyFont(fontPx); store.set("ma_fontsize", fontPx); if(typeof syncFloatControls==="function") syncFloatControls(); };  // ดันขนาดฟอนต์ไปหน้าต่างลอยด้วย

// migrate session เก่าจาก localStorage (ma_sess_*) เข้า IndexedDB ครั้งเดียว (ตอน IDB ว่าง)
function migrateFromLocalStorage(){
  let n=0;
  try{
    for(const k of Object.keys(localStorage)){
      if(!k.startsWith("ma_sess_")) continue;
      try{ const s=JSON.parse(localStorage.getItem(k)); if(s&&s.id){ SESS[s.id]=s; idbPut(s); n++; } }catch{}
    }
  }catch{}
  return n;
}
// ── Init (async): โหลด session จาก IndexedDB → memory; always land on หน้าหลัก ──
(async function initSessions(){
  await idbReady;
  SESS = await idbGetAll();
  if(!Object.keys(SESS).length) migrateFromLocalStorage();   // ครั้งแรก: ย้ายของเก่า
  if(curId && loadSess(curId)){
    curSess=loadSess(curId);
    setMode(curSess.mode || "qa");   // restore โหมดของ session (label/badge/composer ให้ตรง)
    renderSessionInto(results, curSess);
    items=curSess.items.length; bumpCount();
    setCurTitle(curSess.title||"Session ใหม่");
    if(curSess.stopped){ stopped=true; lockComposer(true); setMicUI(); }  // session ที่จบแล้ว → view-only
  } else { setMode("qa"); bumpCount(); }
  renderSessions();
  showView("home");   // หน้า setting = หน้าหลัก เป็น default
})();
