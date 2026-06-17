// 01-config.js — Provider config + system prompts + stackLine
// (classic script; loaded in numeric order — top-level globals shared across files)

// ── Provider config ──────────────────────────────────────
// preset/defaults เน้น fast tier (app นี้เป็น real-time) — กด ↻ ดึง list จริงเพิ่มได้
const PROVIDERS = {
  openrouter: { label:"OpenRouter", defaultModel:"google/gemini-3-flash-preview",
    hint:"จาก openrouter.ai/keys", vision:true,
    models:["google/gemini-3-flash-preview","google/gemini-3.1-flash-lite","openai/gpt-5.4-mini","anthropic/claude-haiku-4.5"] },
  gemini: { label:"Gemini", defaultModel:"gemini-3-flash-preview",
    hint:"จาก aistudio.google.com/apikey · free tier (Flash/Flash-Lite)", vision:true,
    models:["gemini-3-flash-preview","gemini-3.1-flash-lite","gemini-3.5-flash","gemini-3.1-pro-preview"] },
  openai: { label:"OpenAI", defaultModel:"gpt-5.4-mini",
    hint:"จาก platform.openai.com/api-keys", vision:true,
    models:["gpt-5.4-mini","gpt-5.4","gpt-5.5","gpt-4.1-nano"] },
  claude: { label:"Claude", defaultModel:"claude-haiku-4-5",
    hint:"จาก console.anthropic.com · haiku ไว, sonnet/opus ฉลาดขึ้นแต่ช้ากว่า", vision:true,
    models:["claude-haiku-4-5","claude-sonnet-4-6","claude-opus-4-8","claude-fable-5"] },
};

const QA_SYSTEM =
  "คุณเป็นผู้ช่วยในที่ประชุมทีม dev ตอบ**สั้นที่สุดที่ตอบโจทย์** — รวมทั้งคำตอบไม่เกินประมาณ 6 บรรทัด " +
  "ตอบเป็นย่อหน้าสั้น หรือ bullet ไม่เกิน 4-5 ข้อ ข้อละ 1 บรรทัด. " +
  "ห้ามใส่หัวข้อ (heading) หลายหัวข้อ ห้ามแตกเป็น section (considerations/architecture/database/trade-off/summary) เว้นแต่ผู้ใช้ถามเจาะส่วนนั้นตรงๆ. " +
  "ถ้าคำถามกว้าง ให้ตอบแกนหลักสั้นๆ แล้วปิดท้ายด้วยบรรทัดเดียวถามกลับว่าให้เจาะส่วนไหนต่อ — อย่าลงรายละเอียดทุกมุมเอง. " +
  "โค้ดให้เฉพาะ snippet สั้นที่จำเป็น ไม่ต้องตัวอย่างเต็ม. " +
  "ใช้ภาษาไทยผสม technical term อังกฤษ ครอบคลุมหลายภาษา/stack (Go, JS, TS, PHP, Python, Rust, HTML/CSS, SQL ฯลฯ) ตอบตามภาษาที่คำถามเกี่ยว. " +
  "ตอบเฉพาะคำตอบสุดท้ายเท่านั้น ห้ามแสดงความคิด/ขั้นตอนการคิด/ข้อความ meta (เช่น 'Wait, I see the prompt', 'Maybe', 'Let me'). " +
  "ข้อความที่ได้มาเป็นเสียงพูดถอดสด อาจไม่ครบ/กำกวม — ถ้าสั้นมาก ไม่ใช่คำถาม หรือฟังดูถอดเสียงขาด อย่าเดาตอบยาว ให้ถามกลับสั้นๆ ว่าต้องการถามอะไร. " +
  "ถ้ามีภาพหน้าจอแนบมาให้ดูประกอบ.";

const EST_SYSTEM =
  "คุณเป็น senior tech lead ช่วยประเมินงาน dev ในที่ประชุม แนะนำ stack ตามที่เหมาะกับงานจริง " +
  "ถ้ามีภาพหน้าจอแนบมาให้ใช้ประกอบ ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่นหรือ markdown fence " +
  'รูปแบบ: {"summary":string,"stack":string[],"totalTime":string,' +
  '"breakdown":[{"task":string,"time":string}],"risks":string[]} ' +
  "totalTime เช่น '3-5 วัน' ภาษาไทยผสม term อังกฤษ ประเมินตามจริง สมมติ dev 1 คนถ้าไม่บอกเป็นอย่างอื่น";

const CORRECT_SYSTEM =
  "คุณเป็นตัวแก้ข้อความถอดเสียง (ASR) ภาษาไทยปนศัพท์ technical อังกฤษ จากประชุมทีม dev " +
  "หน้าที่: แก้คำเพี้ยน/คำผิด/ศัพท์เทคนิคที่ถอดมาผิดให้ถูกต้อง (เช่น 'เทียร์'→'tier', 'เอ็กซ์แพนคอนแทรค'→'expand-contract', 'โพสเกรส'→'PostgreSQL') " +
  "คงความหมายและภาษาเดิมไว้ (ไทยยังเป็นไทย อังกฤษยังเป็นอังกฤษ) ห้ามเพิ่ม/ตัดเนื้อหา ห้ามสรุป ห้ามแปล ห้ามอธิบาย " +
  "ตอบกลับเฉพาะข้อความที่แก้แล้วล้วนๆ ไม่มี markdown fence ไม่มีคำนำ/คำลงท้าย";

// stack/บริบท ตั้งค่าได้ (หน้าหลัก) — ต่อท้าย system prompt ของ qa/est; ว่าง = ไม่ pin ภาษา/stack ตอบกลางๆ ตามคำถาม
function stackLine(){
  const s=($("stackCtx").value||"").trim();
  return s ? ` บริบท: ผู้ถาม/ทีมใช้ stack ${s} — แต่ถ้าคำถามเกี่ยวกับภาษา/stack อื่นให้ตอบตามนั้น`
           : ` ไม่มีการ pin ภาษา/stack — ตอบตามภาษาที่คำถามเกี่ยวข้อง อย่าสมมติเทคโนโลยีเอง`;
}
