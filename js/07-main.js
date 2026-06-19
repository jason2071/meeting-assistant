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
  const key=keyInp.value.trim(), model=modelInp.value.trim();
  if(!key){ showError("ยังไม่ได้ใส่ API key — กลับไปตั้งค่าที่หน้าหลัก"); return; }
  busy=true; showError(""); $("input").value=""; finalText=""; clearVoicePreview(); $("sendBtn").classList.remove("ready");
  const image = screenOn ? captureFrame() : null;
  addUserMsg(q, !!image);

  if(mode==="qa"){
    const aiBubble=addAiMsg(); const ans=el("div","ans","▍"); aiBubble.appendChild(ans);
    try{
      const req=buildRequest(provider,key,model,{system:QA_SYSTEM+stackLine(),text:q,image,json:false,maxTokens:4096,think:thinkOn});  // maxTokens สูงกัน thinking กิน budget; ความสั้นคุมด้วย prompt
      const full=await streamLLM(req,(full)=>{ ans.innerHTML=mdToHtml(full); scrollBottom(); });
      if(!ans.textContent.trim()) ans.textContent="(ไม่มีคำตอบ)";
      if(full && full.trim()){ const tok=addCost(req.usageAcc); aiBubble.appendChild(tokBadge(tok)); saveItem({q, mode:"qa", hadImage:!!image, raw:full, tok}); }
    }catch(e){ ans.textContent=""; ans.appendChild(el("span","warn","⚠ "+esc(e.message))); }
  } else {
    const bubble=addAiMsg();
    const load=el("div","mono","กำลังประเมิน…"); load.style.color="var(--muted)"; bubble.appendChild(load);
    try{
      const req=buildRequest(provider,key,model,{system:EST_SYSTEM+stackLine(),text:q,image,json:true,maxTokens:4096,think:thinkOn});
      const raw=await streamLLM(req,null);
      const clean=raw.replace(/```json|```/g,"").trim();
      if(!clean || clean==="{") throw new Error("AI ตอบว่าง/ไม่เป็น JSON (อาจถูกตัดหรือ model ไม่รองรับ json mode) — ลองใหม่ หรือเปลี่ยน model");
      const est=looseJSON(clean);
      load.remove(); renderEstimate(bubble,est); const tok=addCost(req.usageAcc); bubble.appendChild(tokBadge(tok)); scrollBottom();
      saveItem({q, mode:"est", hadImage:!!image, raw:JSON.stringify(est), tok});
    }catch(e){ load.textContent=""; load.appendChild(el("span","warn","⚠ "+esc(e.message))); }
  }
  busy=false; scrollBottom();
}

refreshStatus();

// ── Sessions (history) + view routing ──
// เก็บใน IndexedDB (js/02). โหลดเข้า memory map SESS ตอน init แล้วอ่าน sync; เขียน IDB fire-and-forget.
let viewName="current", oldViewId=null, curId=store.get("ma_cur")||null, curSess=null;
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
  renderSessions(); showView("current");
}
function saveItem(item){
  ensureSession();
  curSess.items.push(item);
  curSess.updatedAt=Date.now(); curSess.provider=provider; curSess.model=modelInp.value; curSess.mode=mode;
  if(!curSess.title){ curSess.title=(item.q||"").slice(0,48); setCurTitle(curSess.title); }
  persistSess(curSess);
  updateTokTotal(); renderSessions();
}
function deleteSession(id){
  if(!confirm("ลบ session นี้? ไม่สามารถกู้คืนได้")) return;
  delete SESS[id]; idbDel(id);
  if(id===curId){ curId=null; curSess=null; store.remove("ma_cur"); results.innerHTML=""; items=0; bumpCount(); setCurTitle("Session ใหม่"); }
  if(viewName==="old" && oldViewId===id){ showView("home"); }
  renderSessions();
}
function renderSessions(){
  const ix=sessIndex();
  homeListEl.innerHTML = ix.length
    ? ix.map(s=>{
        const md=s.mode || (loadSess(s.id)||{}).mode || "qa";   // fallback ให้ session เก่าที่ index ยังไม่มี mode
        return `<div class="home-card transition-all hover:-translate-y-0.5 hover:shadow-xl" data-id="${s.id}"><span class="m mode-badge">${esc(MODE_LABEL[md]||MODE_LABEL.qa)}</span><div class="t">${esc(s.title||"Session ใหม่")}</div><span class="d">${fmtDate(s.updatedAt)}</span><button class="del" data-del="${s.id}" aria-label="ลบ session ${esc(s.title||"Session ใหม่")}">✕</button></div>`;
      }).join("")
    : `<div class="side-empty">ยังไม่มีประวัติ — กดเริ่มใหม่ด้านบน</div>`;
}
function showView(name){
  viewName=name;
  // chat views ต้องเป็น flex (column) ให้ header/composer fix + messages scroll; block จะทับ .chat-wrap พัง
  $("viewHome").style.display = name==="home"?"block":"none";
  $("viewSettings").style.display = name==="settings"?"block":"none";
  $("viewCurrent").style.display = name==="current"?"flex":"none";
  $("viewOld").style.display = name==="old"?"flex":"none";
  renderSessions();
}
function openSession(id){
  if(id===curId){ showView("current"); return; }
  const s=loadSess(id); if(!s){ showView("home"); return; }
  oldViewId=id;
  oldMetaEl.innerHTML=`<button class="back-btn" id="backToHome">← กลับ</button><h2>${esc(s.title||"Session")}</h2><div class="sub">${esc(MODE_LABEL[s.mode]||MODE_LABEL.qa)} · ${fmtDate(s.createdAt)} · ${esc(s.provider||"")} · ${esc(s.model||"")} · ${(s.items||[]).length} คำถาม</div>`;
  oldMetaEl.querySelector("#backToHome").onclick=()=>showView("home");
  renderSessionInto(resultsOld, s, false);
  showView("old");
}
function sessClick(e){
  const del=e.target.closest("[data-del]");
  if(del){ e.stopPropagation(); deleteSession(del.getAttribute("data-del")); return; }
  const it=e.target.closest("[data-id]");
  if(it) openSession(it.getAttribute("data-id"));
}
homeListEl.addEventListener("click", sessClick);
$("startBtn").onclick=()=>{ setMode(homeMode); newSession(); openOverlay(); };  // โหมดที่เลือกบนหน้าหลัก → ล็อกต่อ session + เปิดหน้าต่างลอย
$("curHomeLink").onclick=()=>{ closeOverlay(); showView("home"); };
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
