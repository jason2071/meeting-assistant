# Meeting Assistant

ผู้ช่วยในที่ประชุมแบบ real-time สำหรับทีม dev — ฟังเสียงพูด, แชร์จอ, แล้วให้ AI ตอบคำถามหรือประเมินงานสด รันใน browser ไม่มี backend ไม่มี build step (`index.html` + `styles.css` + `js/0N-*.js`)

## Features

- **🎤 ฟังเสียง** — ใช้ Web Speech API ถอดเสียงพูด (ไทย/Eng) แบบต่อเนื่อง ส่งคำถามอัตโนมัติเมื่อหยุดพูด
- **🖥 แชร์จอ** — แนบภาพหน้าจอไปกับคำถาม ให้ AI อ่าน error / code / diagram / ตาราง ประกอบ
- **🧠 ถาม AI** — ตอบสดแบบ stream token-by-token
- **📊 ประเมินงาน** — ป้อนงาน → ได้ผลเป็น JSON (สรุป, stack, เวลารวม, breakdown, ความเสี่ยง)
- **✨ แก้คำถอดเสียง (option)** — toggle ใน header; เปิดแล้วเสียงที่ถอดจะถูก LLM แก้คำเพี้ยน/ศัพท์เทคนิคก่อนส่ง (ไทยปนอังกฤษแม่นขึ้น) — เพิ่ม 1 LLM call, default ปิด
- **🎙 ถอดเสียง: สด / สด+AI / เรียลไทม์** — toggle ในตั้งค่า:
  - **สด** = Web Speech (live ทีละคำ ฟรี)
  - **สด+AI แม่น** (hybrid) = พูด→เห็นสด (Web Speech)→กดจบ→ Gemini ถอด clip ใหม่ (แม่นกว่า, Gemini key; fallback ข้อความสด)
  - **เรียลไทม์** (experimental) = Gemini Live API streaming (WebSocket) ถอดสดทุกคำ realtime, ตัดประโยคอัตโนมัติ (Gemini key + project ที่เข้าถึง Live model ได้)
    - **แปลสด** (option ข้างๆ): เลือก "แปล→ไทย/Eng/日本語/中文" → ใช้ `gemini-3.5-live-translate-preview` แปลสดขณะพูด (อ่านข้อความที่แปลแล้ว). ต้องมีสิทธิ์ preview model; ถ้าไม่มีจะขึ้น error เฉยๆ ไม่กระทบโหมดอื่น
- **Multi-provider** — OpenRouter, Google Gemini, OpenAI (GPT), Anthropic (Claude) — ทุกตัว vision-capable
- **Session history** — บันทึกแต่ละ session อัตโนมัติ (localStorage) เปิดดูย้อนหลังได้
- **Custom font size** — slider ในตั้งค่า ⚙ ปรับขนาดฟอนต์คำตอบ

## Layout

**3 view (lobby → chat)** ไม่มี sidebar/navbar — แต่งด้วย Tailwind:
- **หน้าหลัก / lobby** (`#viewHome`) — settings (provider/model/key/silence/font) + **เลือกโหมด** (ถาม AI / ประเมินงาน) + ปุ่ม **▶ เริ่ม session** + ประวัติ session (badge บอกโหมด, คลิกเปิด, × ลบ มี confirm)
- **current session** (`#viewCurrent`) — แสดงแบบ **chat**: bubble ชิดซ้ายหมด มี role label (🗣 คนถาม teal / 🤖 AI), composer ติดล่าง (mic/screen + input); header มี ← หน้าหลัก + badge โหมด + ไทย/Eng + ⚡ + ✨
- **session เก่า** (`#viewOld`) — chat ย้อนหลัง readonly + ปุ่มกลับ

**หน้าหลัก = default** ตอนเปิดแอป (ตั้งค่าก่อนเริ่ม); current auto-save ต่อเนื่อง; เริ่มแชท = session ใหม่; reload → กลับหน้าหลัก (session เดิมอยู่ในประวัติ คลิกเปิดต่อได้). settings อยู่หน้าหลักที่เดียว (ในแชทกด ← หน้าหลักไปแก้)

**Tailwind** มาจาก [Play CDN](https://cdn.tailwindcss.com) (`corePlugins.preflight:false` กัน reset ทับ CSS เดิม) — ต้องต่อเน็ตตอนโหลดหน้า

## Usage

เปิด `index.html` ใน browser ได้เลย (ต้องเสิร์ฟผ่าน `http://` ไม่ใช่ `file://` — เบราว์เซอร์บล็อก `getUserMedia`/`getDisplayMedia` บน `file://`):

```bash
python3 -m http.server 8000
# เปิด http://localhost:8000/index.html
```

> ต้องใช้ **Chrome / Edge** — `SpeechRecognition` (ฟังเสียง) ไม่รองรับบน Firefox/Safari ส่วน text input ใช้ได้ทุกเบราว์เซอร์

1. กด ⚙ → เลือก **provider** + ใส่ **API key** → เลือก **model** (กด ↻ ดึงรายชื่อ model จริงจาก provider มาเลือก, ปุ่ม Free กรองเฉพาะตัวฟรี)
2. เลือกโหมด **🧠 ถาม AI** / **📊 ประเมินงาน** บนหน้าหลัก **ก่อนกดเริ่ม** — โหมดล็อกต่อ session (อยากเปลี่ยนโหมด = กลับหน้าหลักเริ่ม session ใหม่; ไม่มี tab สลับในแชท). header ในแชทมี badge บอกโหมดปัจจุบัน
3. พิมพ์ หรือกด 🎤 เริ่มฟัง / 🖥 แชร์จอ แล้วถามได้เลย (`⌘/Ctrl + Enter` เพื่อส่ง) — เสียงที่ถอดโชว์เป็น bubble สดในแชท
   - เปิด **✨** ใน header ถ้าอยากให้ LLM แก้คำถอดเสียงก่อนส่ง (ไทยปนศัพท์ dev แม่นขึ้น)

## ถอดเสียงประชุม (system audio) — macOS + BlackHole

`SpeechRecognition` ฟังจาก **mic เท่านั้น** — เสียงคนอื่นในประชุม (ออกลำโพง/ผ่าน Zoom·Meet·Teams) ไม่เข้า mic. แก้ด้วยการ route เสียงระบบ → mic เสมือนด้วย [BlackHole](https://github.com/ExistentialAudio/BlackHole) (virtual audio driver ฟรี) แล้วแอปจะถอดเสียงประชุมเหมือนพูดเอง — ใช้ได้กับทุกแอป รวม Zoom native

> วิธีนี้ไม่ต้องแก้ code — เป็น audio routing ระดับ OS
>
> 💡 ในแอปมี helper **"🎧 ฟังเสียงผู้ถามจากระบบ (BlackHole)"** บนหน้าหลัก — มีขั้นตอนย่อ + ปุ่ม **ตรวจอุปกรณ์เสียง** (เช็คว่ามี BlackHole/virtual device ติดตั้งไหม). ตั้ง input เสร็จ → กด 🎤 แอปถอดเสียงผู้ถาม → AI ตอบ (โหมดถาม AI, auto-send เมื่อเงียบ)

**1. ติดตั้ง BlackHole 2ch**
```bash
brew install blackhole-2ch
# หรือโหลด installer จาก existential.audio/blackhole
```

**2. สร้าง Multi-Output Device** (เพื่อให้ยังได้ยินเสียงเอง ขณะส่งเข้า BlackHole)
- เปิด **Audio MIDI Setup** (`/Applications/Utilities`)
- กด **＋** ล่างซ้าย → **Create Multi-Output Device**
- ติ๊ก **BlackHole 2ch** + **ลำโพง/หูฟัง** ที่ใช้จริง
- ตั้ง Multi-Output นี้เป็น **output** ของเครื่อง (เมนูเสียงบนแถบบน) → เสียงประชุมจะไปทั้งหูฟังและ BlackHole

**3. ตั้ง input ของ browser เป็น BlackHole**
- macOS: System Settings → Sound → **Input = BlackHole 2ch** (หรือเลือกใน site permission ของ Chrome)
- หรือทำ **Aggregate Device** (BlackHole + mic จริง) ถ้าอยากให้ AI ได้ยินทั้งเสียงประชุม + เสียงเราพร้อมกัน

**4. ใช้งาน** — กด 🎤 ในแอป → SpeechRecognition จะถอดเสียงที่วิ่งผ่าน BlackHole (= เสียงประชุม)

> เลิกใช้: สลับ output/input กลับเป็นลำโพง/mic ปกติ
>
> **ข้อจำกัด:** getDisplayMedia จับ system audio ทั้งเครื่องบน macOS ไม่ได้ (จับได้แค่ tab audio) — BlackHole จึงเป็นทางเดียวที่ครอบ Zoom/Teams native บน mac

## API keys

Default เลือกตัว fast tier เพราะแอปเป็น real-time (กด ↻ ดึง model ปัจจุบันเพิ่มได้)

| Provider | ที่ขอ key | Default model |
|---|---|---|
| Google Gemini | aistudio.google.com/apikey · free tier (Flash/Flash-Lite) | `gemini-3-flash-preview` |
| OpenAI | platform.openai.com/api-keys | `gpt-5.4-mini` |
| Anthropic (Claude) | console.anthropic.com | `claude-haiku-4-5` |
| OpenRouter | openrouter.ai/keys | `google/gemini-3-flash-preview` |

Key เก็บใน `sessionStorage` ของ tab นี้เท่านั้น (ล้างเมื่อปิด tab) — เรียก provider API ตรงจาก browser ไม่ผ่าน server กลาง

**Local dev**: คัดลอก `config.local.example.js` → `config.local.js` (gitignored) แล้วใส่ key เพื่อ auto-fill ตอนเปิด ไม่ต้องพิมพ์ทุกครั้ง (ใช้เป็น fallback เฉพาะตอน key ว่าง, key ที่พิมพ์เองชนะเสมอ). ⚠️ key เป็น plaintext ที่ browser อ่านได้ — ใช้เฉพาะเครื่องตัวเอง **ห้าม deploy/แชร์ build ที่มี `config.local.js`**

## Architecture

ไม่มี build/dependency. `index.html` (shell + tailwind config) + `styles.css` (component CSS) + logic แยกเป็น classic script ใน `js/` โหลดตามลำดับเลข แชร์ global เดียวกัน:
`01-config` (providers/prompts) · `02-state` (storage/state/DOM/$) · `03-models` (fetch model/device check) · `04-voice` (mode/voice/screen) · `05-llm` (buildRequest/streamLLM) · `06-render` (markdown/bubbles/correctText) · `07-main` (submit/sessions/init). `config.local.js` (optional) โหลดก่อน `js/*`

- **`PROVIDERS` / `buildRequest` / `streamLLM` / `modelsReq`** — แกนหลัก รวม 4 provider API ที่ request/auth/SSE ต่างกันให้เป็น interface เดียว (`buildRequest` = chat, `modelsReq` = ดึงรายชื่อ model กรอง vision) เพิ่ม provider แก้แค่จุดนี้
- **ปุ่ม ↻ fetch models** — ดึง model list จริงจาก provider (vision-only) cache ใน localStorage; fetch ล้มเหลว (CORS/key ผิด) → fallback เป็น preset ใน `PROVIDERS[p].models`. OpenRouter ตรวจ free model จาก `pricing` → ติด " · free" ต่อท้าย option + นับใน status (provider อื่น API ไม่บอก pricing ราย model). ปุ่ม **Free** toggle กรองโชว์เฉพาะ free (กรอง list ที่ fetch แล้ว ไม่ยิงซ้ำ; disable ถ้า provider ไม่มี free)
- **`QA_SYSTEM` / `EST_SYSTEM`** — system prompt ของแต่ละโหมด (hardcode stack + โทนของทีม) แก้ที่นี่เพื่อปรับพฤติกรรม AI
- **voice loop** (`buildRec` / `voiceSend`), **screen capture** (`captureFrame`), **storage** — `store` (localStorage: provider/model/cache) + `skey` (sessionStorage: API keys)

ดูรายละเอียดเพิ่มใน [`CLAUDE.md`](./CLAUDE.md)

## Notes

- Claude ใช้ `anthropic-dangerous-direct-browser-access` header เพื่อยิง API ตรงจาก browser (CORS)
- โหมดประเมินงานบังคับ JSON: provider ส่วนใหญ่ใช้ json mode, Claude ใช้ prefill `{` เพราะไม่มี `response_format` flag
