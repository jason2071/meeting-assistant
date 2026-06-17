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
    const ans=el("div","ans","▍"); addAiMsg().appendChild(ans);
    try{
      const req=buildRequest(provider,key,model,{system:QA_SYSTEM+stackLine(),text:q,image,json:false,maxTokens:900});
      const full=await streamLLM(req,(full)=>{ ans.innerHTML=mdToHtml(full); scrollBottom(); });
      if(!ans.textContent.trim()) ans.textContent="(ไม่มีคำตอบ)";
      if(full && full.trim()) saveItem({q, mode:"qa", hadImage:!!image, raw:full});
    }catch(e){ ans.textContent=""; ans.appendChild(el("span","warn","⚠ "+esc(e.message))); }
  } else {
    const bubble=addAiMsg();
    const load=el("div","mono","กำลังประเมิน…"); load.style.color="var(--muted)"; bubble.appendChild(load);
    try{
      const req=buildRequest(provider,key,model,{system:EST_SYSTEM+stackLine(),text:q,image,json:true});
      const raw=await streamLLM(req,null);
      const clean=raw.replace(/```json|```/g,"").trim();
      if(!clean || clean==="{") throw new Error("AI ตอบว่าง/ไม่เป็น JSON (อาจถูกตัดหรือ model ไม่รองรับ json mode) — ลองใหม่ หรือเปลี่ยน model");
      const est=looseJSON(clean);
      load.remove(); renderEstimate(bubble,est); scrollBottom();
      saveItem({q, mode:"est", hadImage:!!image, raw:JSON.stringify(est)});
    }catch(e){ load.textContent=""; load.appendChild(el("span","warn","⚠ "+esc(e.message))); }
  }
  busy=false; scrollBottom();
}

refreshStatus();

// ── Sessions (history) + view routing ──
let viewName="current", oldViewId=null, curId=store.get("ma_cur")||null, curSess=null;
function sessIndex(){ try{ return JSON.parse(store.get("ma_sessions")||"[]"); }catch{ return []; } }
function saveIndex(ix){ store.set("ma_sessions", JSON.stringify(ix)); }
function loadSess(id){ try{ return JSON.parse(store.get("ma_sess_"+id)||"null"); }catch{ return null; } }
function persistSess(s){ store.set("ma_sess_"+s.id, JSON.stringify(s)); }
function fmtDate(ts){ const d=new Date(ts); return d.toLocaleDateString("th-TH",{day:"numeric",month:"short"})+" "+d.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"}); }

function ensureSession(){
  if(curSess) return;
  curId="s"+Date.now();
  curSess={ id:curId, title:"", createdAt:Date.now(), updatedAt:Date.now(), provider, model:modelInp.value, mode, items:[] };
  persistSess(curSess);
  const ix=sessIndex(); ix.unshift({id:curId,title:"Session ใหม่",createdAt:curSess.createdAt,updatedAt:curSess.updatedAt,mode}); saveIndex(ix);
  store.set("ma_cur", curId);
}
function setCurTitle(t){ curTitleEl.textContent=t; curTitleEl.title=t; }
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
  const ix=sessIndex(); const e=ix.find(x=>x.id===curId);
  if(e){ e.title=curSess.title||"Session ใหม่"; e.updatedAt=curSess.updatedAt; e.mode=mode; ix.sort((a,b)=>b.updatedAt-a.updatedAt); saveIndex(ix); }
  renderSessions();
}
function deleteSession(id){
  if(!confirm("ลบ session นี้? ไม่สามารถกู้คืนได้")) return;
  store.remove("ma_sess_"+id);
  saveIndex(sessIndex().filter(x=>x.id!==id));
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
$("startBtn").onclick=()=>{ setMode(homeMode); newSession(); };  // โหมดที่เลือกบนหน้าหลัก → ล็อกต่อ session
$("curHomeLink").onclick=()=>showView("home");

// ── Font size ──
let fontPx = +store.get("ma_fontsize")||14;
function applyFont(px){ document.documentElement.style.setProperty("--fs", px+"px"); fontVal.textContent=px+"px"; }
fontRange.value=fontPx; applyFont(fontPx);
fontRange.oninput=()=>{ fontPx=+fontRange.value; applyFont(fontPx); store.set("ma_fontsize", fontPx); };

// ── Init: always land on หน้าหลัก (settings/lobby); restore last session into memory ──
(function initSessions(){
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
