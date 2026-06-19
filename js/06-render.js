// 06-render.js — el/esc/highlight/inline/mdToHtml/renderEstimate + chat bubbles + voice preview + looseJSON
// (classic script; loaded in numeric order — top-level globals shared across files)

// ── Rendering ──
let items=0;
function bumpCount(){
  countEl.textContent=items+" คำถาม";
  $("clear").style.display=items?"flex":"none";
  updateTokTotal();   // อัปเดต token รวม session (def js/07)
  if(!items){
    const hasKey = !!(keyInp.value.trim() || getKey(provider));
    if(hasKey){
      empty.textContent = "พิมพ์หรือพูดคำถามด้านล่างเพื่อเริ่ม";
    } else {
      // dead-end เดิม → ทำปุ่มคลิกไปตั้งค่าได้จริง
      empty.innerHTML = "ยังไม่ได้ใส่ API key — ";
      const b=el("button","link-btn","ไปตั้งค่าที่หน้าหลัก");
      b.type="button"; b.onclick=()=>showView("home");
      empty.appendChild(b);
    }
    empty.style.display="block";
  } else {
    empty.style.display="none";
  }
}
function scrollBottom(){ results.scrollTop = results.scrollHeight; }
$("clear").onclick=()=>{ results.innerHTML=""; clearVoicePreview(); items=0; bumpCount(); if(curSess){ curSess.items=[]; persistSess(curSess); renderSessions(); } };
// copy code blocks (delegated — survives stream re-renders)
results.addEventListener("click",(e)=>{
  const btn=e.target.closest(".codecopy"); if(!btn) return;
  const code=btn.closest(".codeblock")?.querySelector("code");
  if(!code) return;
  navigator.clipboard?.writeText(code.textContent).then(()=>{
    btn.textContent="copied"; setTimeout(()=>{ btn.textContent="copy"; },1200);
  }).catch(()=>{});
});

function el(tag,cls,html){ const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
function esc(s){ return (s||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
// lightweight, language-agnostic syntax highlighting for code blocks (input is HTML-escaped). No deps.
const HL_KW=new Set("func return if else elif for range while switch case default break continue var let const type struct interface enum class extends implements new import export from package map chan go defer select public private protected static void def self async await yield try catch finally throw throws in of is as with lambda pass this super fn use mut match where and or not nil null None undefined true false True False".split(" "));
function highlightCode(code){
  const TOKEN=/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\w.]*\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;
  return code.replace(TOKEN,(m,com,str,num,word,paren)=>{
    if(com) return `<span class="hl-com">${com}</span>`;
    if(str) return `<span class="hl-str">${str}</span>`;
    if(num) return `<span class="hl-num">${num}</span>`;
    if(word){
      if(HL_KW.has(word)) return `<span class="hl-kw">${word}</span>`+(paren||"");
      if(paren) return `<span class="hl-fn">${word}</span>`+paren;
    }
    return m;
  });
}
// minimal markdown → HTML for streamed answers (escape first, then format). No deps.
function inline(s){ return s.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>"); }
function mdToHtml(src){
  const blocks=[]; const Z=String.fromCharCode(0);   // NUL placeholder delimiter (trim ไม่ลบ ไม่ชนข้อความปกติ)
  const stash=(c,lang)=>{ blocks.push({code:c.replace(/\n$/,""),lang:lang||""}); return Z+(blocks.length-1)+Z; };
  let s = esc(src)
    .replace(/```(\w+)?\n?([\s\S]*?)```/g,(m,lang,c)=>stash(c,lang))
    .replace(/```(\w+)?\n?([\s\S]*)$/,(m,lang,c)=>stash(c,lang));   // fence ไม่ปิด (stream/ตัด) -> render ส่วนที่เหลือเป็น code
  const lines=s.split("\n"); let html="", list=null, tbl=[];
  const close=()=>{ if(list){ html+=`</${list}>`; list=null; } };
  const cells=r=>r.replace(/^\s*\|/,"").replace(/\|\s*$/,"").split("|").map(c=>inline(c.trim()));
  const flushTbl=()=>{
    if(!tbl.length) return; const rows=tbl; tbl=[];
    if(rows.length>=2 && /^[\s|:\-]+$/.test(rows[1]) && rows[1].includes("-")){   // header + separator -> ตาราง
      close();
      const head=cells(rows[0]), body=rows.slice(2).map(cells);
      html+=`<div class="tablewrap"><table><thead><tr>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${body.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    } else { close(); rows.forEach(r=>{ if(r.trim()) html+=`<p>${inline(r)}</p>`; }); }   // ไม่ใช่ตารางจริง -> paragraph
  };
  for(let line of lines){
    const fence=line.trim().match(new RegExp("^"+Z+"(\\d+)"+Z+"$"));
    if(fence){ flushTbl(); close(); const b=blocks[+fence[1]]; html+=`<div class="codeblock"><div class="codebar"><span>${b.lang||"code"}</span><button class="codecopy" type="button">copy</button></div><pre><code>${highlightCode(b.code)}</code></pre></div>`; continue; }
    if(/^\s*\|.*\|\s*$/.test(line)){ tbl.push(line); continue; }   // เก็บแถวตาราง
    flushTbl();
    let m;
    if(m=line.match(/^\s*#{1,6}\s+(.*)$/)){ close(); html+=`<h4>${inline(m[1])}</h4>`; }
    else if(m=line.match(/^\s*[-*]\s+(.*)$/)){ if(list!=="ul"){close();html+="<ul>";list="ul";} html+=`<li>${inline(m[1])}</li>`; }
    else if(m=line.match(/^\s*\d+[.)]\s+(.*)$/)){ if(list!=="ol"){close();html+="<ol>";list="ol";} html+=`<li>${inline(m[1])}</li>`; }
    else if(line.trim()){ close(); html+=`<p>${inline(line)}</p>`; }
    else close();
  }
  flushTbl(); close();
  return html;
}

// ── chat bubbles ──
// qa/est: ฝั่งพูด/ถาม = "คนถาม" (คนบอก detail งาน ไม่ใช่ฉัน/operator); AI ตอบ
function roleLabel(who){ return el("div","role", who==="user"?"🗣 ผู้ถาม":"🤖 AI"); }
function addUserMsg(q, hadImage){
  const m=el("div","msg user");
  m.appendChild(roleLabel("user"));
  m.appendChild(el("div","bubble",esc(q)));
  if(hadImage) m.appendChild(el("div","meta","🖼 เห็นจอ"));
  results.appendChild(m); items++; bumpCount(); scrollBottom();
  return m;
}
function addAiMsg(){
  const m=el("div","msg ai");
  m.appendChild(roleLabel("ai"));
  const b=el("div","bubble"); m.appendChild(b);
  results.appendChild(m); scrollBottom();
  return b; // bubble content element (stream/estimate target)
}
// qa/est: live preview ของเสียงที่กำลังถอด — โชว์เป็น bubble ในแชท (ไม่ลง textarea); หายตอน submit/clear
function updateVoicePreview(txt){
  txt=(txt||"").trim();
  if(!txt){ clearVoicePreview(); return; }
  if(!voiceWrapEl){
    voiceWrapEl=el("div","msg user voice-live");
    voiceWrapEl.appendChild(el("div","role","🗣 ผู้ถาม (กำลังพูด…)"));
    voiceLiveEl=el("div","bubble"); voiceLiveEl.style.whiteSpace="pre-wrap";
    voiceWrapEl.appendChild(voiceLiveEl);
    results.appendChild(voiceWrapEl);
  }
  voiceLiveEl.textContent=txt; scrollBottom();
  $("sendBtn").classList.toggle("ready", !!finalText.trim() && !busy);  // มี voice แล้ว → ปุ่มส่งพร้อม (กดส่งเองได้แม้ auto ปิด)
}
function clearVoicePreview(){
  if(voiceWrapEl){ voiceWrapEl.remove(); } voiceWrapEl=null; voiceLiveEl=null;
  $("sendBtn").classList.toggle("ready", !!$("input").value.trim() && !busy);
}
// rebuild saved messages into a container (chronological, readonly)
function renderSessionInto(container, sess){
  container.innerHTML="";
  (sess.items||[]).forEach((it)=>{
    const u=el("div","msg user"); u.appendChild(roleLabel("user")); u.appendChild(el("div","bubble",esc(it.q)));
    if(it.hadImage) u.appendChild(el("div","meta","🖼 เห็นจอ"));
    container.appendChild(u);
    const m=el("div","msg ai"); m.appendChild(roleLabel("ai"));
    const b=el("div","bubble"); m.appendChild(b);
    if(it.mode==="est"){ try{ renderEstimate(b, JSON.parse(it.raw)); }catch{ b.appendChild(el("div","ans",esc(it.raw))); } }
    else b.appendChild(el("div","ans",mdToHtml(it.raw||"")));
    if(it.tok) b.appendChild(tokBadge(it.tok));   // token ต่อคำตอบ
    container.appendChild(m);
  });
}
// token badge ใต้คำตอบ AI
function fmtTok(n){ n=n||0; return n>=1000 ? (n/1000).toFixed(1).replace(/\.0$/,"")+"k" : String(n); }
function fmtCost(c){ c=c||0; return "$"+(c>=0.01 ? c.toFixed(2) : c.toFixed(4)); }
function tokBadge(u){ let s=`↑ ${fmtTok(u&&u.in)} · ↓ ${fmtTok(u&&u.out)}`; if(u&&u.cost!=null) s+=` · ${fmtCost(u.cost)}`; return el("div","tok",s); }

function renderEstimate(card, e){
  const body=el("div");
  if(e.summary) body.appendChild(el("div",null,esc(e.summary))).style.cssText="font-size:14px;margin-bottom:12px";
  const time=el("div",null,"🕐 "+esc(e.totalTime||"")); time.style.cssText="color:var(--amber);font-weight:600;font-size:14px;margin-bottom:12px"; body.appendChild(time);
  if(e.stack?.length){
    body.appendChild(el("div","lbl","STACK"));
    const wrap=el("div"); wrap.style.cssText="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 12px";
    e.stack.forEach(s=>wrap.appendChild(el("span","stack mono",esc(s)))); body.appendChild(wrap);
  }
  if(e.breakdown?.length){
    body.appendChild(el("div","lbl","BREAKDOWN"));
    const list=el("div"); list.style.margin="6px 0 12px";
    e.breakdown.forEach((b,i)=>{
      const r=el("div"); r.style.cssText="display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:6px 0;"+(i?"border-top:1px solid var(--border)":"");
      r.appendChild(el("span",null,esc(b.task)));
      const t=el("span","mono",esc(b.time)); t.style.cssText="color:var(--muted);white-space:nowrap"; r.appendChild(t);
      list.appendChild(r);
    });
    body.appendChild(list);
  }
  if(e.risks?.length){
    body.appendChild(el("div","lbl","⚠ ความเสี่ยง / ข้อควรระวัง"));
    const ul=el("ul"); ul.style.cssText="margin:6px 0 0;padding-left:18px;font-size:13px;color:var(--muted);line-height:1.6";
    e.risks.forEach(r=>ul.appendChild(el("li",null,esc(r)))); body.appendChild(ul);
  }
  card.appendChild(body);
}

// แปลง JSON ที่ LLM ตอบมาแบบหลวมๆ — ลองซ่อมทีละชั้น (parse strict ก่อน แล้วค่อยซ่อมสะสม)
function looseJSON(s){
  const a=s.indexOf("{"), b=s.lastIndexOf("}");
  let t=(a>=0 && b>a) ? s.slice(a,b+1) : s;   // ตัดข้อความนำ/ตาม เอา {…} ก้อนนอกสุด
  const fixes=[
    x=>x,                                                              // ตามที่ได้มา
    x=>x.replace(/\/\/[^\n]*/g,"").replace(/\/\*[\s\S]*?\*\//g,""),     // ลบ comment // และ /* */
    x=>x.replace(/("(?:[^"\\]|\\.)*")(\s*)(["{[])/g,"$1,$2$3")          // แทรก comma ที่ขาดหลัง string ก่อน value ถัดไป
        .replace(/([}\]])(\s*)(["{[])/g,"$1,$2$3"),                    // …หลัง }/] ก่อน value ถัดไป
    x=>x.replace(/,(\s*[}\]])/g,"$1"),                                 // ลบ trailing comma
  ];
  let cur=t, err;
  for(const f of fixes){
    cur=f(cur);
    try{ return JSON.parse(cur); }catch(e){ err=e; }
  }
  throw err;  // ซ่อมไม่ได้ → โยน error ล่าสุดให้เห็น
}
