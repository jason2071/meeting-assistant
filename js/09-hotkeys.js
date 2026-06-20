// 09-hotkeys.js — คีย์ลัดสั่ง action หลัก (แชร์จอ/ออโต้ส่ง/เริ่มฟัง/ส่งเลย)
//   • Electron: globalShortcut (กดได้แม้แอปไม่ focus — เหมาะตอนประชุม) ผ่าน main process
//   • Browser: keydown ใน window ที่ focus (main + PiP)
// proxy ไปปุ่มหลักด้วย .click() (เหมือน overlay). (classic script; โหลดท้ายสุดต่อจาก 08-overlay)

const HK_ACTIONS = [
  { key:"mic",    label:"🎤 เริ่ม/หยุดฟัง", btn:"micBtn"  },   // toggle ปุ่มเดียว
  { key:"send",   label:"✂️ ส่งเลย",         btn:"stopBtn" },   // one-shot (ส่งทันทีระหว่างฟัง)
  { key:"screen", label:"🖥 แชร์/หยุดจอ",   btn:"screenBtn" },  // toggle
  { key:"auto",   label:"⚡ เปิด/ปิดออโต้ส่ง", btn:"autoBtn" },  // toggle
];
const HK_MOD_CODES = ["ControlLeft","ControlRight","AltLeft","AltRight","ShiftLeft","ShiftRight","MetaLeft","MetaRight"];
function hkKey(a){ return "ma_hk_"+a; }
function getHK(a){ return store.get(hkKey(a)) || ""; }
function setHK(a, combo){ if(combo) store.set(hkKey(a), combo); else store.remove(hkKey(a)); renderHK(); applyGlobalHK(); }

// physical key (e.code) → ชื่อคีย์อังกฤษ; null = ไม่รับ (media/OEM/punct/คีย์นอก keyboard)
// ใช้ e.code → ไม่ขึ้นกับ layout (กดแป้นไทยก็ได้ตัวอังกฤษตามตำแหน่งจริง)
function codeToKey(code){
  let m;
  if(m=code.match(/^Key([A-Z])$/)) return m[1];           // A–Z
  if(m=code.match(/^Digit([0-9])$/)) return m[1];         // 0–9 (แถวบน)
  if(m=code.match(/^F([1-9]|1[0-9]|2[0-4])$/)) return code;  // F1–F24
  const named={ Space:"Space", Enter:"Enter", Tab:"Tab", Backspace:"Backspace", Delete:"Delete",
    ArrowUp:"Up", ArrowDown:"Down", ArrowLeft:"Left", ArrowRight:"Right",
    Home:"Home", End:"End", PageUp:"PageUp", PageDown:"PageDown", Insert:"Insert" };
  return named[code] || null;
}
// keydown event → canonical combo "Ctrl+Shift+L" (null ถ้ากดแค่ modifier / คีย์ไม่รับ)
function comboFromEvent(e){
  if(HK_MOD_CODES.includes(e.code)) return null;
  const k=codeToKey(e.code); if(!k) return null;          // รับเฉพาะคีย์จริงบน keyboard อังกฤษ
  const mods=[];
  if(e.ctrlKey) mods.push("Ctrl");
  if(e.altKey)  mods.push("Alt");
  if(e.shiftKey)mods.push("Shift");
  if(e.metaKey) mods.push("Meta");
  return mods.concat([k]).join("+");
}
function hasModifier(combo){ return /(^|\+)(Ctrl|Alt|Shift|Meta)\+/.test(combo+"+"); }
// "Ctrl+Shift+L" → Electron accelerator
function toAccelerator(combo){ return combo.replace(/\bCtrl\b/g,"CommandOrControl").replace(/\bMeta\b/g,"Super"); }

const IS_ELEC = !!(window.electronAPI && window.electronAPI.isElectron);

// ── Electron: ลงทะเบียน global shortcut ใหม่ทุกครั้งที่ค่าเปลี่ยน ──
function applyGlobalHK(){
  if(!IS_ELEC || !electronAPI.registerHotkeys) return;
  const combos={};
  HK_ACTIONS.forEach(a=>{ const c=getHK(a.key); if(c) combos[a.key]=toAccelerator(c); });
  electronAPI.registerHotkeys(combos);
}
if(IS_ELEC && electronAPI.onHotkey){
  electronAPI.onHotkey((action)=>{ const a=HK_ACTIONS.find(x=>x.key===action); if(a){ const b=$(a.btn); if(b) b.click(); } });
}

// ── trigger (browser focus / fallback): keydown ใน window ที่ focus → match → click ปุ่มหลัก ──
function hkMatch(e){
  if(hkRecording) return;            // กำลังบันทึก → ไม่ trigger
  const c=comboFromEvent(e); if(!c || !hasModifier(c)) return;
  for(const a of HK_ACTIONS){ if(getHK(a.key)===c){ e.preventDefault(); const b=$(a.btn); if(b) b.click(); return; } }
}
// Electron มี global แล้ว (ทำงานแม้ไม่ focus) → ไม่ต้องผูก keydown ซ้ำใน main window
if(!IS_ELEC) document.addEventListener("keydown", hkMatch);

// ── settings UI: บันทึกคีย์ (record) ──
let hkRecording=null;
function renderHK(){
  HK_ACTIONS.forEach(a=>{
    const b=document.querySelector('.hk-btn[data-hk="'+a.key+'"]'); if(!b) return;
    const c=getHK(a.key);
    b.textContent = (hkRecording===a.key) ? "กดคีย์…" : (c || "— ตั้งคีย์ —");
    b.classList.toggle("on", hkRecording===a.key || !!c);
    const clr=document.querySelector('.hk-clear[data-hk="'+a.key+'"]'); if(clr) clr.style.display = c ? "" : "none";
  });
}
document.addEventListener("click",(e)=>{
  const clr=e.target.closest(".hk-clear");
  if(clr){ setHK(clr.getAttribute("data-hk"), ""); return; }
  const rec=e.target.closest(".hk-btn");
  if(rec){ hkRecording=rec.getAttribute("data-hk"); renderHK(); return; }
  if(hkRecording){ hkRecording=null; renderHK(); }   // คลิกที่อื่น = ยกเลิก record
});
// บันทึกคีย์ (capture phase — ก่อน hkMatch); ต้องมี modifier (กัน global ยึดคีย์เดี่ยว)
document.addEventListener("keydown",(e)=>{
  if(!hkRecording) return;
  if(e.key==="Escape"){ e.preventDefault(); hkRecording=null; renderHK(); return; }
  const c=comboFromEvent(e); if(!c) return;          // กดแค่ modifier → รอคีย์จริง
  e.preventDefault();
  if(!hasModifier(c)){ return; }                     // ต้องมี Ctrl/Alt/Shift/Meta อย่างน้อย 1
  const target=hkRecording; hkRecording=null;        // เคลียร์ก่อน setHK → renderHK โชว์ combo ไม่ค้าง "กดคีย์…"
  HK_ACTIONS.forEach(a=>{ if(a.key!==target && getHK(a.key)===c) store.remove(hkKey(a.key)); });  // กันคีย์ซ้ำ
  setHK(target, c);
}, true);

renderHK();
applyGlobalHK();   // ลงทะเบียน global ที่บันทึกไว้ตอนโหลด
