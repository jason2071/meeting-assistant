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

1. กด ⚙ → เลือก **provider** + ใส่ **API key**
2. เลือกโหมด **🧠 ถาม AI** หรือ **📊 ประเมินงาน**
3. พิมพ์ หรือกด 🎤 เริ่มฟัง / 🖥 แชร์จอ แล้วถามได้เลย (`⌘/Ctrl + Enter` เพื่อส่ง)

## API keys

| Provider | ที่ขอ key | Default model |
|---|---|---|
| OpenRouter | openrouter.ai/keys | `openai/gpt-4o-mini` |
| Google Gemini | aistudio.google.com/apikey (ฟรี) | `gemini-2.5-flash` |
| OpenAI | platform.openai.com/api-keys | `gpt-4o-mini` |
| Anthropic (Claude) | console.anthropic.com | `claude-opus-4-8` |

Key เก็บใน `localStorage` ของเครื่องนี้เท่านั้น — เรียก provider API ตรงจาก browser ไม่ผ่าน server กลาง

## Architecture

ทุกอย่าง (HTML/CSS/JS) อยู่ใน `index.html` ไม่มี dependency

- **`PROVIDERS` / `buildRequest` / `streamLLM`** — แกนหลัก รวม 4 provider API ที่ request/auth/SSE ต่างกันให้เป็น interface เดียว เพิ่ม provider หรือเปลี่ยน model แก้แค่ 2 จุดนี้
- **`QA_SYSTEM` / `EST_SYSTEM`** — system prompt ของแต่ละโหมด (hardcode stack + โทนของทีม) แก้ที่นี่เพื่อปรับพฤติกรรม AI
- **voice loop** (`buildRec` / `voiceSend`), **screen capture** (`captureFrame`), **localStorage** (`store`)

ดูรายละเอียดเพิ่มใน [`CLAUDE.md`](./CLAUDE.md)

## Notes

- Claude ใช้ `anthropic-dangerous-direct-browser-access` header เพื่อยิง API ตรงจาก browser (CORS)
- โหมดประเมินงานบังคับ JSON: provider ส่วนใหญ่ใช้ json mode, Claude ใช้ prefill `{` เพราะไม่มี `response_format` flag
