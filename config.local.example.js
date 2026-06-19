// Optional LOCAL-ONLY API key config.
//
// คัดลอกเป็น config.local.js (gitignored) แล้วเติม key — แอปจะใช้เป็น "fallback"
// เฉพาะตอนที่ยังไม่ได้พิมพ์ key ในหน้า ⚙ (key ที่พิมพ์เองชนะเสมอ และไม่ถูกบันทึก
// ลง sessionStorage จากไฟล์นี้)
//
// ⚠️ key เป็น plaintext ที่ browser อ่านได้ — ใช้เฉพาะเครื่องตัวเองตอน dev
//    ห้าม deploy / แชร์ build ที่มี config.local.js เด็ดขาด
//
// key ของ object ต้องตรงกับ provider id: openrouter | gemini | openai | claude

window.__MA_KEYS__ = {
  openrouter: '',
  gemini: '',
  openai: '',
  claude: '',
  soniox: '',
};
