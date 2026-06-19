// 03-models.js — modelsReq + fetchModels + provider/model handlers + loadProvider() call + audio-device check
// (classic script; loaded in numeric order — top-level globals shared across files)

// ── Fetch model list per provider (parallel to buildRequest) ──
function modelsReq(p, key){
  if(p==="gemini") return {
    url:`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`,
    headers:{},
    // API ไม่ระบุ modality ราย model → กรอง chat (generateContent) + ตัด non-chat; gemini รุ่นใหม่ multimodal
    // free ตรวจไม่ได้จาก API (free เป็น account tier ของ AI Studio)
    extract:(j)=>(j.models||[])
      .filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent") && !/embedding|aqa|imagen|image-generation|tts|veo/i.test(m.name))
      .map(m=>({id:m.name.replace(/^models\//,"")})),
  };
  if(p==="claude") return {
    url:"https://api.anthropic.com/v1/models?limit=100",
    headers:{ "x-api-key":key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
    extract:(j)=>(j.data||[]).map(m=>({id:m.id})), // Claude models เป็น vision ทั้งหมด ไม่มี free
  };
  if(p==="openai") return {
    url:"https://api.openai.com/v1/models",
    headers:{ "Authorization":"Bearer "+key },
    // API ไม่ระบุ modality/pricing → heuristic: เอา chat family (gpt-5/4.1/4o, o-series)
    // ตัดพวก image-gen/audio/embedding/tts ที่ไม่ใช่ chat ออก
    extract:(j)=>(j.data||[]).map(m=>m.id)
      .filter(id=>/^(gpt-5|gpt-4\.1|gpt-4o|o[134])/.test(id)
        && !/image|audio|realtime|tts|transcribe|embedding|moderation|dall-e|search/i.test(id))
      .sort().map(id=>({id})),
  };
  // openrouter (public, ไม่ต้อง key) — pricing บอก free ได้จริง
  return {
    url:"https://openrouter.ai/api/v1/models",
    headers:{},
    // pin/pout = ราคา $/token จริงจาก OpenRouter → ใช้คำนวณ cost ต่อคำตอบ
    extract:(j)=>(j.data||[]).filter(m=>((m.architecture||{}).input_modalities||[]).includes("image"))
      .map(m=>({ id:m.id, free: !!(m.pricing && m.pricing.prompt==="0" && m.pricing.completion==="0"),
        pin:+((m.pricing||{}).prompt)||0, pout:+((m.pricing||{}).completion)||0 }))
      .sort((a,b)=>a.id.localeCompare(b.id)),
  };
}
async function fetchModels(){
  const key = keyInp.value.trim();
  if(!key && provider!=="openrouter"){ showError("ใส่ API key ก่อน fetch model"); return; }
  fetchBtn.disabled=true; fetchBtn.classList.add("spin"); modelStatus.textContent="โหลด models…"; showError("");
  try{
    const req=modelsReq(provider,key);
    const res=await fetch(req.url,{ headers:req.headers });
    if(!res.ok){ const t=await res.text(); throw new Error((t||res.statusText).slice(0,200)); }
    const items=req.extract(await res.json());
    if(!items||!items.length) throw new Error("ไม่พบ model");
    store.set(modelsKey(provider), JSON.stringify(items));
    setModelOptions(items);
    modelStatus.textContent=modelStatusText(items);
  }catch(e){
    showError("โหลด model ไม่สำเร็จ: "+e.message+" — ใช้ list สำรอง");
    modelStatus.textContent="";
  }finally{
    fetchBtn.disabled=false; fetchBtn.classList.remove("spin");
  }
}
fetchBtn.onclick = fetchModels;
providerSel.onchange = ()=>{ loadProvider(providerSel.value); if(typeof syncGeminiKeyRow==="function") syncGeminiKeyRow(); };
modelSel.onchange = ()=>{ modelInp.value=modelSel.value; store.set(modelKey(provider), modelSel.value); };
keyInp.oninput = ()=>skey.set(keyKey(provider), keyInp.value.trim());
// stack/บริบท (persist localStorage; default ว่าง = ไม่ pin ภาษา)
$("stackCtx").value = store.get("ma_stack") || "";
$("stackCtx").oninput = ()=>store.set("ma_stack", $("stackCtx").value.trim());
loadProvider(provider);

// settings อยู่หน้าหลักแล้ว ไม่มีปุ่ม gear
