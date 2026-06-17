// 05-llm.js — buildRequest + streamLLM (LLM core)
// (classic script; loaded in numeric order — top-level globals shared across files)

// ── LLM call (streaming) ──
function buildRequest(p, key, model, {system, text, image, json, maxTokens=1024}){
  if(p==="gemini"){
    const parts=[{text}];
    if(image) parts.push({inline_data:{mime_type:"image/jpeg",data:image}});
    return {
      url:`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
      headers:{"Content-Type":"application/json"},
      body:{ systemInstruction:{parts:[{text:system}]}, contents:[{role:"user",parts}],
        generationConfig:{ maxOutputTokens:maxTokens, ...(json?{responseMimeType:"application/json"}:{}) } },
      extract:(j)=>(j.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join(""),
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
    body:{ model, stream:true, messages:[{role:"system",content:system},{role:"user",content:userContent}],
      ...(json?{response_format:{type:"json_object"}}:{}) },
    extract:(j)=>j.choices?.[0]?.delta?.content||"",
  };
}

async function streamLLM(req, onToken){
  const res=await fetch(req.url,{ method:"POST", headers:req.headers, body:JSON.stringify(req.body) });
  if(!res.ok){ const t=await res.text(); throw new Error((t||res.statusText).slice(0,400)); }
  const reader=res.body.getReader(); const dec=new TextDecoder();
  let buf="", full=req.prefill||"";
  while(true){
    const {done,value}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true});
    const lines=buf.split("\n"); buf=lines.pop();
    for(const line of lines){
      const l=line.trim();
      if(!l||!l.startsWith("data:")) continue;
      const data=l.slice(5).trim();
      if(data==="[DONE]") continue;
      try{ const tok=req.extract(JSON.parse(data)); if(tok){ full+=tok; onToken&&onToken(full); } }catch{}
    }
  }
  return full;
}
