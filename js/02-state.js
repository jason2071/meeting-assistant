// 02-state.js — storage (store/skey/getKey) + state + DOM refs ($) + settings/model-select helpers + loadProvider
// (classic script; loaded in numeric order — top-level globals shared across files)

// ── Storage helpers ──
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} },
  remove(k){ try { localStorage.removeItem(k); } catch {} },
};
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

// ── State ──
let provider = store.get("ma_provider") || "gemini";
let mode = "qa";
let lang = "th-TH";
let autoSend = true;
let micOn = false, screenOn = false, paused = false, stopped = false;  // paused = พัก (resume ได้); stopped = จบการฟัง session นี้ (ซ่อนปุ่ม mic/screen)
let voiceWrapEl = null, voiceLiveEl = null;  // qa/est: โชว์เสียงที่ถอดเป็น bubble สดในแชท (ไม่ลง textarea)
let busy = false;
let silenceMs = +store.get("ma_silence") || 1800;  // auto-send delay after silence (ปรับได้, default ถามสด)
let correctVoice = store.get("ma_correct")==="1";  // qa/est: แก้คำถอดเสียงด้วย LLM ก่อนส่ง (default ปิด)

// ── DOM ──
const $ = (id)=>document.getElementById(id);
const providerSel=$("provider"), modelInp=$("model"), modelSel=$("modelSel"), keyInp=$("apikey"), keyHint=$("keyHint");
const fetchBtn=$("fetchModels"), freeBtn=$("freeFilter"), modelStatus=$("modelStatus"), silenceInp=$("silenceSec");
const results=$("results"), empty=$("empty"), errBox=$("error"), statusEl=$("status");
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
