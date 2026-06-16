# Meeting Assistant

ผู้ช่วยในที่ประชุมแบบ real-time สำหรับทีม dev — ฟังเสียงพูด, แชร์จอ, แล้วให้ AI ตอบคำถามหรือประเมินงานสด ทุกอย่างรันใน browser ไฟล์เดียว ไม่มี backend ไม่มี build step

## Features

- **🎤 ฟังเสียง** — ใช้ Web Speech API ถอดเสียงพูด (ไทย/Eng) แบบต่อเนื่อง ส่งคำถามอัตโนมัติเมื่อหยุดพูด
- **🖥 แชร์จอ** — แนบภาพหน้าจอไปกับคำถาม ให้ AI อ่าน error / code / diagram / ตาราง ประกอบ
- **🧠 ถาม AI** — ตอบสดแบบ stream token-by-token
- **📊 ประเมินงาน** — ป้อนงาน → ได้ผลเป็น JSON (สรุป, stack, เวลารวม, breakdown, ความเสี่ยง)
- **Multi-provider** — OpenRouter, Google Gemini, OpenAI (GPT), Anthropic (Claude) — ทุกตัว vision-capable

## Usage

เปิด `index.html` ใน browser ได้เลย (ต้องเสิร์ฟผ่าน `http://` ไม่ใช่ `file://` — เบราว์เซอร์บล็อก `getUserMedia`/`getDisplayMedia` บน `file://`):

```bash
python3 -m http.server 8000
# เปิด http://localhost:8000/index.html
```

> ต้องใช้ **Chrome / Edge** — `SpeechRecognition` (ฟังเสียง) ไม่รองรับบน Firefox/Safari ส่วน text input ใช้ได้ทุกเบราว์เซอร์

1. กด ⚙ → เลือก **provider** + ใส่ **API key** → เลือก **model** (กด ↻ ดึงรายชื่อ model จริงจาก provider มาเลือก, ปุ่ม Free กรองเฉพาะตัวฟรี)
2. เลือกโหมด **🧠 ถาม AI** หรือ **📊 ประเมินงาน**
3. พิมพ์ หรือกด 🎤 เริ่มฟัง / 🖥 แชร์จอ แล้วถามได้เลย (`⌘/Ctrl + Enter` เพื่อส่ง)

## API keys

| Provider | ที่ขอ key | Default model |
|---|---|---|
| OpenRouter | openrouter.ai/keys | `openai/gpt-4o-mini` |
| Google Gemini | aistudio.google.com/apikey (ฟรี) | `gemini-2.5-flash` |
| OpenAI | platform.openai.com/api-keys | `gpt-4o-mini` |
| Anthropic (Claude) | console.anthropic.com | `claude-opus-4-8` |

Key เก็บใน `sessionStorage` ของ tab นี้เท่านั้น (ล้างเมื่อปิด tab) — เรียก provider API ตรงจาก browser ไม่ผ่าน server กลาง

**Local dev**: คัดลอก `config.local.example.js` → `config.local.js` (gitignored) แล้วใส่ key เพื่อ auto-fill ตอนเปิด ไม่ต้องพิมพ์ทุกครั้ง (ใช้เป็น fallback เฉพาะตอน key ว่าง, key ที่พิมพ์เองชนะเสมอ). ⚠️ key เป็น plaintext ที่ browser อ่านได้ — ใช้เฉพาะเครื่องตัวเอง **ห้าม deploy/แชร์ build ที่มี `config.local.js`**

## Architecture

ทุกอย่าง (HTML/CSS/JS) อยู่ใน `index.html` ไม่มี dependency

- **`PROVIDERS` / `buildRequest` / `streamLLM` / `modelsReq`** — แกนหลัก รวม 4 provider API ที่ request/auth/SSE ต่างกันให้เป็น interface เดียว (`buildRequest` = chat, `modelsReq` = ดึงรายชื่อ model กรอง vision) เพิ่ม provider แก้แค่จุดนี้
- **ปุ่ม ↻ fetch models** — ดึง model list จริงจาก provider (vision-only) cache ใน localStorage; fetch ล้มเหลว (CORS/key ผิด) → fallback เป็น preset ใน `PROVIDERS[p].models`. OpenRouter ตรวจ free model จาก `pricing` → ติด " · free" ต่อท้าย option + นับใน status (provider อื่น API ไม่บอก pricing ราย model). ปุ่ม **Free** toggle กรองโชว์เฉพาะ free (กรอง list ที่ fetch แล้ว ไม่ยิงซ้ำ; disable ถ้า provider ไม่มี free)
- **`QA_SYSTEM` / `EST_SYSTEM`** — system prompt ของแต่ละโหมด (hardcode stack + โทนของทีม) แก้ที่นี่เพื่อปรับพฤติกรรม AI
- **voice loop** (`buildRec` / `voiceSend`), **screen capture** (`captureFrame`), **storage** — `store` (localStorage: provider/model/cache) + `skey` (sessionStorage: API keys)

ดูรายละเอียดเพิ่มใน [`CLAUDE.md`](./CLAUDE.md)

## Notes

- Claude ใช้ `anthropic-dangerous-direct-browser-access` header เพื่อยิง API ตรงจาก browser (CORS)
- โหมดประเมินงานบังคับ JSON: provider ส่วนใหญ่ใช้ json mode, Claude ใช้ prefill `{` เพราะไม่มี `response_format` flag
