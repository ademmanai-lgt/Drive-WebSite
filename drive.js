/* ============ CONFIG ============ */
const PROXY = "https://drive-proxy.adem-manai.workers.dev"; // your Cloudflare Worker
const REFRESH_SECONDS = 20;                                 // how often the site re-checks Drive
const ALLOW_DOWNLOAD = false;                               // true = downloads/open-in-Drive enabled again
/* ================================ */

// View-only mode: hide download UI, block right-click, save/print/copy shortcuts, drag, and printing
if(!ALLOW_DOWNLOAD){
  document.body.classList.add("viewonly");
  document.addEventListener("contextmenu",e=>e.preventDefault());
  document.addEventListener("dragstart",e=>e.preventDefault());
  document.addEventListener("copy",e=>e.preventDefault());
  document.addEventListener("cut",e=>e.preventDefault());
  document.addEventListener("keydown",e=>{
    const k=e.key.toLowerCase();
    if((e.ctrlKey||e.metaKey) && ["s","p","c","u","a"].includes(k)) e.preventDefault();
    if(e.key==="F12" || e.key==="PrintScreen" || ((e.ctrlKey||e.metaKey) && e.shiftKey && ["i","j","c","s"].includes(k))) e.preventDefault();
  });
  window.addEventListener("keyup",e=>{ if(e.key==="PrintScreen"){ try{ navigator.clipboard.writeText(""); }catch{} } });
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
const $ = s => document.querySelector(s);
const state = {path:[{id:"root",name:"shared"}], items:[], cat:"all", q:"", sort:"name", view:"grid", hash:""};
document.getElementById("ivl").textContent = REFRESH_SECONDS;
document.getElementById("yr").textContent = new Date().getFullYear();

const CAT_COLOR = {iot:"var(--iot)"};
const CAT_LABEL = {iot:"IoT"};
function category(){ return "iot"; }
const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function fmtSize(b){ b=+b; if(!b) return "—"; const u=["B","KB","MB","GB"]; let i=0; while(b>=1024&&i<3){b/=1024;i++} return b.toFixed(i?1:0)+" "+u[i]; }
function fmtDate(d){ return new Date(d).toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"}); }
function ext(f){
  if(f.mimeType===FOLDER_MIME) return "DIR";
  if(f.mimeType.includes("document")) return "DOC";
  if(f.mimeType.includes("spreadsheet")) return "XLS";
  if(f.mimeType.includes("presentation")) return "PPT";
  const e=(f.name.split(".").pop()||"").toUpperCase();
  return e.length<=4 && f.name.includes(".") ? e : "FILE";
}
const isGoogleApp = f => f.mimeType.startsWith("application/vnd.google-apps.") && f.mimeType!==FOLDER_MIME;

function setStatus(kind,text){
  $("#dot").className = "dot"+(kind==="ok"?"":" "+kind);
  $("#stat").textContent = text;
}

async function listFolder(id){
  let out=[], token="";
  do{
    const chain = state.path.slice(1).map(p=>p.id).join(",");
    const url = `${PROXY}?folder=${encodeURIComponent(id)}${chain?`&path=${encodeURIComponent(chain)}`:""}${token?`&pageToken=${encodeURIComponent(token)}`:""}`;
    const r = await fetch(url,{cache:"no-store"});
    if(!r.ok){
      let msg=r.status+""; try{ msg=(await r.json()).error.message }catch{}
      throw new Error(msg);
    }
    const j = await r.json();
    out = out.concat(j.files||[]);
    token = j.nextPageToken||"";
  }while(token);
  return out;
}

async function load(silent){
  if(!silent){ setStatus("load","syncing…"); $("#view").innerHTML='<div class="grid">'+'<div class="skel"></div>'.repeat(6)+'</div>'; }
  try{
    const items = await listFolder(state.path.at(-1).id);
    const h = JSON.stringify(items.map(i=>[i.id,i.name,i.modifiedTime,i.size]));
    const changed = h!==state.hash;
    state.items = items; state.hash=h;
    setStatus("ok","live · synced "+new Date().toLocaleTimeString());
    if(changed||!silent) render();
  }catch(e){
    setStatus("err","error");
    if(!silent) $("#view").innerHTML=`<div class="empty"><b style="color:var(--red)">Drive error:</b> ${esc(e.message)}<br><br>Check: the folder is shared as “Anyone with the link” and the proxy is running.</div>`;
  }
}

function filtered(){
  let a = state.items.filter(f=>{
    if(state.q && !f.name.toLowerCase().includes(state.q)) return false;
    return true;
  });
  const s=state.sort;
  a.sort((x,y)=>{
    const fx=x.mimeType===FOLDER_MIME, fy=y.mimeType===FOLDER_MIME;
    if(fx!==fy) return fx?-1:1;
    if(s==="new") return new Date(y.modifiedTime)-new Date(x.modifiedTime);
    if(s==="size") return (+y.size||0)-(+x.size||0);
    return x.name.localeCompare(y.name,undefined,{numeric:true});
  });
  return a;
}

function render(){
  const all=state.items, files=all.filter(f=>f.mimeType!==FOLDER_MIME);
  $("#sFiles").textContent=files.length;
  $("#sFolders").textContent=all.length-files.length;
  $("#sSize").textContent=fmtSize(files.reduce((a,f)=>a+(+f.size||0),0));
  $("#sLast").textContent=all.length?fmtDate(Math.max(...all.map(f=>new Date(f.modifiedTime)))):"—";

  $("#crumbs").innerHTML = state.path.map((p,i)=> i===state.path.length-1
    ? `<span class="cur">${esc(p.name)}</span>`
    : `<a data-i="${i}">${esc(p.name)}</a><span>/</span>`).join(" ");
  $("#crumbs").querySelectorAll("a").forEach(a=>a.onclick=()=>{state.path=state.path.slice(0,+a.dataset.i+1);state.hash="";load();});

  const list=filtered();
  const view=$("#view");
  view.className = state.view==="list"?"list":"";
  if(!list.length){ view.innerHTML='<div class="empty mono">$ no results found</div>'; return; }
  const week = Date.now()-7*864e5;
  view.innerHTML = '<div class="grid">'+list.map((f,i)=>{
    const dir=f.mimeType===FOLDER_MIME, c=category(f.name), col=CAT_COLOR[c];
    const fresh=new Date(f.modifiedTime)>week && !dir;
    const dl=`https://drive.google.com/uc?export=download&id=${f.id}`;
    return `<div class="card" style="--c:${col};animation-delay:${Math.min(i,20)*25}ms" data-id="${f.id}" data-dir="${dir?1:0}">
      ${fresh?'<span class="new">NEW</span>':''}
      <div class="top"><div class="ico">${dir?'📁':ext(f)}</div><div><h3>${esc(f.name)}</h3></div></div>
      <div class="meta"><span>${dir?"folder":fmtSize(f.size)}</span><span>${fmtDate(f.modifiedTime)}</span></div>
      <span class="badge">${CAT_LABEL[c]}</span>
      <div class="actions">
        ${dir?`<span class="btn p">Open ›</span>`:
          `<span class="btn p" data-act="view">Preview</span>`+
          (ALLOW_DOWNLOAD?`<a class="btn" data-act="dl" target="_blank" rel="noopener" href="${isGoogleApp(f)?esc(f.webViewLink):dl}">${isGoogleApp(f)?"Open":"Download"}</a>`:"")}
      </div></div>`;
  }).join("")+'</div>';

  view.querySelectorAll(".card").forEach(card=>{
    const f=state.items.find(x=>x.id===card.dataset.id);
    card.onclick=e=>{
      if(e.target.closest('[data-act="dl"]')) return;
      if(card.dataset.dir==="1"){ state.path.push({id:f.id,name:f.name}); state.hash=""; state.q=""; $("#q").value=""; load(); }
      else openPreview(f);
    };
  });
}

function openPreview(f){
  $("#mtitle").textContent=f.name;
  $("#mframe").src=`https://drive.google.com/file/d/${f.id}/preview`;
  if(ALLOW_DOWNLOAD){
    $("#mdl").href = isGoogleApp(f)?f.webViewLink:`https://drive.google.com/uc?export=download&id=${f.id}`;
    $("#mdl").style.display="";
    $("#mframe").sandbox="allow-scripts allow-same-origin allow-popups";
  }else{
    $("#mdl").removeAttribute("href");
    $("#mdl").style.display="none";
    // no allow-popups: blocks Drive's "open in new window" pop-out button
    $("#mframe").sandbox="allow-scripts allow-same-origin";
  }
  $("#modal").classList.add("on");
}
function closeModal(){ $("#modal").classList.remove("on"); $("#mframe").src="about:blank"; }
$("#mclose").onclick=closeModal;
$("#modal").onclick=e=>{ if(e.target.id==="modal") closeModal(); };
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeModal(); });

$("#q").oninput=e=>{state.q=e.target.value.toLowerCase().trim();render();};
$("#sort").onchange=e=>{state.sort=e.target.value;render();};
$("#vGrid").onclick=()=>{state.view="grid";$("#vGrid").classList.add("on");$("#vList").classList.remove("on");render();};
$("#vList").onclick=()=>{state.view="list";$("#vList").classList.add("on");$("#vGrid").classList.remove("on");render();};

load();
setInterval(()=>{ if(!document.hidden && !$("#modal").classList.contains("on")) load(true); }, REFRESH_SECONDS*1000);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) load(true); });