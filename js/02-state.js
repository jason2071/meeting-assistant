// 02-state.js — storage (store/skey/getKey) + state + DOM refs ($) + settings/model-select helpers + loadProvider
// (classic script; loaded in numeric order — top-level globals shared across files)

// ── Storage helpers ──
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} },
  remove(k){ try { localStorage.removeItem(k); } catch {} },
};
// ── IndexedDB (chat sessions — quota ใหญ่กว่า localStorage ~5MB) ──
// object store 'sessions' (keyPath id) เก็บ session เต็มทั้งก้อน. promise API จิ๋ว ไม่มี dep.
// ถ้า IDB ใช้ไม่ได้ (private mode/ไม่รองรับ) → idbReady = null, code ฝั่ง session fallback ไป localStorage
let _idb = null;
const idbReady = new Promise((resolve)=>{
  try{
    const req = indexedDB.open("ma_db", 1);
    req.onupgradeneeded = ()=>{ if(!req.result.objectStoreNames.contains("sessions")) req.result.createObjectStore("sessions",{keyPath:"id"}); };
    req.onsuccess = ()=>{ _idb=req.result; resolve(_idb); };
    req.onerror = ()=>{ console.warn("IndexedDB open failed — fallback localStorage"); resolve(null); };
  }catch(e){ resolve(null); }
});
function _idbTx(mode){ return _idb.transaction("sessions",mode).objectStore("sessions"); }
function idbGetAll(){   // → {id: session}
  return new Promise((resolve)=>{
    if(!_idb) return resolve({});
    try{ const r=_idbTx("readonly").getAll(); r.onsuccess=()=>{ const m={}; (r.result||[]).forEach(s=>{ if(s&&s.id) m[s.id]=s; }); resolve(m); }; r.onerror=()=>resolve({}); }
    catch{ resolve({}); }
  });
}
function idbPut(s){ try{ if(_idb) _idbTx("readwrite").put(s).onerror=()=>console.warn("idbPut fail",s&&s.id); }catch(e){} }
function idbDel(id){ try{ if(_idb) _idbTx("readwrite").delete(id); }catch(e){} }

// API keys live in sessionStorage only — cleared when the tab closes
const skey = {
  get(k){ try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { sessionStorage.setItem(k,v); } catch {} },
};
// migrate a key previously persisted in localStorage into sessionStorage, then purge it
function getKey(p){
  let k = skey.get(keyKey(p));
  if(k===null){ const old = store.get(keyKey(p)); if(old){ skey.set(keyKey(p), old); store.remove(keyKey(p)); k = old; } }
  // local-only fallback from config.local.js (window.__MA_KEYS__) — not persisted to sessionStorage
  if(!k){ const env = (window.__MA_KEYS__||{})[p]; if(env) return env; }
  return k || "";
}
// STT (สด+AI) ถอดเสียงผ่าน backend ไหน: provider=openrouter ที่มี credit → ยิงผ่าน OpenRouter (model audio-capable);
// ไม่งั้น Gemini native (ต้องมี Gemini key — provider=gemini ใช้ช่อง key หลัก, provider อื่นใส่ช่อง Gemini key แยก)
function sttBackend(){
  if(provider==="openrouter" && getKey("openrouter")) return { via:"openrouter", key:getKey("openrouter") };
  return { via:"gemini", key:getKey("gemini") };
}

// ── State ──
let provider = store.get("ma_provider") || "gemini";
let mode = "qa";
let lang = "th-TH";
let autoSend = true;
let micOn = false, screenOn = false, stopped = false;  // stopped = session เก่าที่ถูกล็อก view-only (backward-compat; web flow ใหม่ไม่สร้าง)
let voiceWrapEl = null, voiceLiveEl = null;  // qa/est: โชว์เสียงที่ถอดเป็น bubble สดในแชท (ไม่ลง textarea)
let busy = false;
let silenceMs = +store.get("ma_silence") || 1800;  // auto-send delay after silence (ปรับได้, default ถามสด)
let correctVoice = store.get("ma_correct")==="1";  // qa/est: แก้คำถอดเสียงด้วย LLM ก่อนส่ง (default ปิด)
let thinkOn = store.get("ma_think")==="1";  // ให้ model คิดก่อนตอบ (thinking/reasoning) — default ปิด (เร็ว+ไม่กิน token)
let floatMode = store.get("ma_float_mode") || "inpage";  // หน้าต่างลอย: inpage (โปร่ง มองทะลุ) | pip (Document PiP ลอยเหนือ/ซ่อนตอนแชร์หน้าต่าง)

// ── DOM ──
const $ = (id)=>document.getElementById(id);
const providerSel=$("provider"), modelInp=$("model"), modelSel=$("modelSel"), keyInp=$("apikey"), keyHint=$("keyHint");
const fetchBtn=$("fetchModels"), freeBtn=$("freeFilter"), modelStatus=$("modelStatus"), silenceInp=$("silenceSec");
const results=$("results"), empty=$("empty"), errBox=$("error"), statusEl=$("status");
function showError(msg){ errBox.style.display=msg?"flex":"none"; errBox.textContent = msg?("⚠ "+msg):""; }
const dot=$("dot"), countEl=$("count");
const homeListEl=$("homeList"), oldMetaEl=$("oldMeta"), resultsOld=$("resultsOld"),
  curTitleEl=$("curTitle"), fontRange=$("fontRange"), fontVal=$("fontVal");

// ── Settings init ──
function modelKey(p){ return "ma_model_"+p; }
function keyKey(p){ return "ma_key_"+p; }
function modelsKey(p){ return "ma_models_"+p; }
// model list items can be plain id strings (presets) or {id, free} objects (fetched)
function normModels(list){ return (list||[]).map(m=> typeof m==="string" ? {id:m} : m); }
function modelStatusText(items){
  const free=items.filter(m=>m.free).length;
  return items.length+" model"+(free?` · ${free} free`:"");
}
// current normalized model list + "free only" toggle (re-filters without refetching)
// modelInp (hidden) holds the canonical selected id; modelSel is the picker.
let modelsList=[], freeOnly=false;
// ราคา $/token ของ model ปัจจุบัน (เฉพาะ OpenRouter ที่มี pricing จริง) → null ถ้าไม่รู้ราคา
function modelPrice(){ const m=modelsList.find(x=>x.id===modelInp.value); return (m&&(m.pin||m.pout)) ? {pin:m.pin,pout:m.pout} : null; }
function renderModelOptions(){
  const items = freeOnly ? modelsList.filter(m=>m.free) : modelsList;
  modelSel.innerHTML = items.map(m=>`<option value="${m.id}">${m.id}${m.free?" · free":""}</option>`).join("");
  const ids=items.map(m=>m.id);
  if(ids.includes(modelInp.value)){ modelSel.value = modelInp.value; }
  else if(ids.length){ modelSel.value = ids[0]; modelInp.value = ids[0]; store.set(modelKey(provider), ids[0]); }
}
// Set the full list, keeping modelInp.value selected (or "custom").
function setModelOptions(list){
  modelsList = normModels(list);
  const hasFree = modelsList.some(m=>m.free);
  freeBtn.disabled = !hasFree;
  if(!hasFree && freeOnly){ freeOnly=false; freeBtn.classList.remove("on"); }
  renderModelOptions();
}
freeBtn.onclick = ()=>{ freeOnly=!freeOnly; freeBtn.classList.toggle("on",freeOnly); renderModelOptions(); };
function loadProvider(p){
  provider = p; providerSel.value = p;
  modelInp.value = store.get(modelKey(p)) || PROVIDERS[p].defaultModel;
  const cached = JSON.parse(store.get(modelsKey(p)) || "null");
  setModelOptions(cached || PROVIDERS[p].models || []);
  keyInp.value = getKey(p);
  keyHint.textContent = "· "+PROVIDERS[p].hint;
  modelStatus.textContent = cached ? modelStatusText(normModels(cached)) : "";
  store.set("ma_provider", p);
  // auto-fetch real model list the first time (no cache yet) when we can reach the API
  if(!cached && (keyInp.value.trim() || p==="openrouter")) fetchModels();
}
