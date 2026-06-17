// 05-llm.js — buildRequest + streamLLM (LLM core)
// (classic script; loaded in numeric order — top-level globals shared across files)

// ── LLM call (streaming) ──
function buildRequest(p, key, model, {system, text, image, json, maxTokens=1024, think=false}){
  if(p==="gemini"){
    const parts=[{text}];
    if(image) parts.push({inline_data:{mime_type:"image/jpeg",data:image}});
    return {
      url:`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
      headers:{"Content-Type":"application/json"},
      body:{ systemInstruction:{parts:[{text:system}]}, contents:[{role:"user",parts}],
        generationConfig:{ maxOutputTokens:maxTokens, ...(think?{}:{thinkingConfig:{thinkingBudget:0}}),   // think=false → ปิด thinking
          ...(json?{responseMimeType:"application/json"}:{}) } },
      extract:(j)=>(j.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join(""),
      usage:(j)=>j.usageMetadata?{in:j.usageMetadata.promptTokenCount,out:j.usageMetadata.candidatesTokenCount}:null,
    };
  }
  if(p==="claude"){
    const content = image
      ? [{type:"image",source:{type:"base64",media_type:"image/jpeg",data:image}},{type:"text",text}]
      : [{type:"text",text}];
    // Claude has no JSON-mode flag — prefill the assistant turn with "{" to force a JSON object.
    const messages=[{role:"user",content}];
    if(json) messages.push({role:"assistant",content:"{"});
    return {
      url:"https://api.anthropic.com/v1/messages",
      headers:{ "Content-Type":"application/json","x-api-key":key,
        "anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true" },
      body:{ model, max_tokens:maxTokens, system, stream:true, messages },
      extract:(j)=>(j.type==="content_block_delta"&&j.delta?.type==="text_delta")?(j.delta.text||""):"",
      // claude: input ใน message_start, output (cumulative) ใน message_delta
      usage:(j)=>{ if(j.type==="message_start"&&j.message?.usage) return {in:j.message.usage.input_tokens}; if(j.type==="message_delta"&&j.usage) return {out:j.usage.output_tokens}; return null; },
      prefill: json ? "{" : "",
    };
  }
  // openai-compatible: openai, openrouter
  const userContent = image
    ? [{type:"text",text},{type:"image_url",image_url:{url:`data:image/jpeg;base64,${image}`}}]
    : text;
  const url = p==="openrouter" ? "https://openrouter.ai/api/v1/chat/completions"
                               : "https://api.openai.com/v1/chat/completions";
  const headers={ "Content-Type":"application/json","Authorization":"Bearer "+key };
  if(p==="openrouter"){ headers["HTTP-Referer"]="http://localhost"; headers["X-Title"]="Meeting Assistant"; }
  return {
    url, headers,
    // ไม่ใส่ max_tokens สำหรับ openai/openrouter — gpt-5 reasoning เผา token แล้วเหลือ output ว่าง (est ได้ JSON ว่าง),
    // และบาง model reject max_tokens (ต้อง max_completion_tokens). ปล่อยใช้ default ของ model (กว้างพอ)
    body:{ model, stream:true, stream_options:{include_usage:true}, messages:[{role:"system",content:system},{role:"user",content:userContent}],
      ...(p==="openrouter"&&!think?{reasoning:{enabled:false}}:{}),   // OpenRouter: think=false → ปิด reasoning
      ...(json?{response_format:{type:"json_object"}}:{}) },
    extract:(j)=>j.choices?.[0]?.delta?.content||"",
    usage:(j)=>j.usage?{in:j.usage.prompt_tokens,out:j.usage.completion_tokens}:null,  // chunk ท้าย (stream_options)
  };
}

async function streamLLM(req, onToken){
  const res=await fetch(req.url,{ method:"POST", headers:req.headers, body:JSON.stringify(req.body) });
  if(!res.ok){ const t=await res.text(); throw new Error((t||res.statusText).slice(0,400)); }
  const reader=res.body.getReader(); const dec=new TextDecoder();
  let buf="", full=req.prefill||"";
  req.usageAcc={in:0,out:0};   // เก็บ token usage (อ่านหลัง await: req.usageAcc)
  while(true){
    const {done,value}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true});
    const lines=buf.split("\n"); buf=lines.pop();
    for(const line of lines){
      const l=line.trim();
      if(!l||!l.startsWith("data:")) continue;
      const data=l.slice(5).trim();
      if(data==="[DONE]") continue;
      try{
        const j=JSON.parse(data);
        const tok=req.extract(j); if(tok){ full+=tok; onToken&&onToken(full); }
        if(req.usage){ const u=req.usage(j); if(u){ if(u.in!=null) req.usageAcc.in=u.in; if(u.out!=null) req.usageAcc.out=u.out; } }
      }catch{}
    }
  }
  return full;
}

// ── Gemini audio STT (batch) — decode recorded blob → mono WAV → Gemini transcribe ──
async function blobToWav(blob){
  const ab=await blob.arrayBuffer();
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const buf=await ctx.decodeAudioData(ab); ctx.close();
  const ch=buf.numberOfChannels, len=buf.length, sr=buf.sampleRate;
  const data=new Float32Array(len);
  for(let c=0;c<ch;c++){ const d=buf.getChannelData(c); for(let i=0;i<len;i++) data[i]+=d[i]/ch; }  // mono mixdown
  const out=new ArrayBuffer(44+len*2), v=new DataView(out);
  const ws=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  ws(0,"RIFF"); v.setUint32(4,36+len*2,true); ws(8,"WAVE"); ws(12,"fmt "); v.setUint32(16,16,true);
  v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,sr,true); v.setUint32(28,sr*2,true);
  v.setUint16(32,2,true); v.setUint16(34,16,true); ws(36,"data"); v.setUint32(40,len*2,true);
  let o=44; for(let i=0;i<len;i++){ let s=Math.max(-1,Math.min(1,data[i])); v.setInt16(o,s<0?s*0x8000:s*0x7FFF,true); o+=2; }
  return new Blob([out],{type:"audio/wav"});
}
const STT_PROMPT =
  "ถอดเสียงนี้เป็นข้อความแบบ verbatim ภาษาไทยผสมศัพท์เทคนิคอังกฤษ — ถอดครบตามที่พูด ห้ามสรุป ห้ามย่อ ห้ามตัดทอน. "+
  "**ถอดเฉพาะคำที่ได้ยินจริงเท่านั้น ห้ามเดา ห้ามเติม ห้ามแต่งประโยคที่ไม่ได้พูด** โดยเฉพาะช่วงต้นและท้ายคลิปที่เสียงอาจขาด/ไม่ชัด — ถ้าช่วงไหนไม่ชัดหรือไม่มีเสียงพูดให้ข้ามไป อย่าสร้างขึ้นมาเอง. "+
  "ขึ้นต้นด้วยคำพูดแรกที่ได้ยินทันที **ห้ามมีคำนำ/บทเกริ่น/คำขึ้นต้นเชิงสนทนาเด็ดขาด** (เช่น 'ได้เลยครับ', 'นี่คือข้อความที่ถอด...', '...แบบ verbatim ครับ'). "+
  "ตอบกลับเฉพาะข้อความที่ถอดได้ล้วนๆ ไม่ต้องอธิบาย ไม่ต้องใส่ timestamp";
// ถอดเสียง (สด+AI): เลือก backend ตาม sttBackend() — openrouter (ใช้ credit, model google/gemini-2.5-flash audio) หรือ Gemini native
async function transcribeAudio(blob){
  const be=sttBackend();
  if(!be.key) throw new Error("ต้องมี key สำหรับถอดเสียง — ใช้ provider OpenRouter (มี credit) หรือใส่ Gemini key");
  const wav=await blobToWav(blob);
  const b64=await new Promise((res,rej)=>{ const r=new FileReader(); r.onloadend=()=>res(String(r.result).split(",")[1]); r.onerror=rej; r.readAsDataURL(wav); });
  let text;
  if(be.via==="openrouter"){
    // OpenRouter chat/completions — audio input ผ่าน content type input_audio (base64 wav); model audio-capable
    const body={ model:"google/gemini-2.5-flash", temperature:0,
      messages:[{role:"user",content:[
        {type:"text",text:STT_PROMPT},
        {type:"input_audio",input_audio:{data:b64,format:"wav"}} ]}] };
    const res=await fetch("https://openrouter.ai/api/v1/chat/completions",{ method:"POST",
      headers:{ "Content-Type":"application/json","Authorization":"Bearer "+be.key,"HTTP-Referer":"http://localhost","X-Title":"Meeting Assistant" },
      body:JSON.stringify(body) });
    if(!res.ok){ const t=await res.text(); throw new Error((t||res.statusText).slice(0,200)); }
    const j=await res.json();
    text=(j.choices?.[0]?.message?.content||"").trim();
  } else {
    // Gemini native (generateContent + inline audio)
    const model=(provider==="gemini" ? modelInp.value.trim() : "") || "gemini-3-flash-preview";
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(be.key)}`;
    const body={ contents:[{role:"user",parts:[
      {text:STT_PROMPT},
      {inline_data:{mime_type:"audio/wav",data:b64}}]}],
      generationConfig:{maxOutputTokens:1024, temperature:0, ...(thinkOn?{}:{thinkingConfig:{thinkingBudget:0}})} };  // temp 0 ลด hallucination; thinking ตาม toggle 🧠
    const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(!res.ok){ const t=await res.text(); throw new Error((t||res.statusText).slice(0,200)); }
    const j=await res.json();
    text=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("").trim();
  }
  // กัน preamble เชิงสนทนาหลุดปน (เช่น "ได้เลยครับ นี่คือข้อความที่ถอด...verbatim ครับ") — ตัดบรรทัดนำที่พูดถึงการถอด/verbatim
  text=text.replace(/^[^\n]{0,120}?(ถอด(เสียง|จาก)|verbatim|transcri)[^\n]*\n+/i,"").trim();
  return text;
}
