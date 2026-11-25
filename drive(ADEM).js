/* ============ CONFIG — EDIT THESE TWO LINES ============ */
const FOLDER_ID = "18gGjbR0podkhjt4mMhlmAKeiaX_jt8p0";   // the ID at the end of the folder URL
const API_KEY   = "AIzaSyDPZdVG_iQEz7qdZ_otrhOCzSEi6IuS474";     // Google Drive API key (restrict it to your site!)
const REFRESH_SECONDS = 20;                    // how often the site re-checks Drive
/* ======================================================= */

const API = "https://www.googleapis.com/drive/v3/files";
const FIELDS = "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const $ = s => document.querySelector(s);
const state = {path:[{id:FOLDER_ID,name:"shared"}], items:[], cat:"all", q:"", sort:"name", view:"grid", hash:""};
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
    const url = `${API}?q=${encodeURIComponent(`'${id}' in parents and trashed=false`)}&fields=${encodeURIComponent(FIELDS)}&pageSize=1000&orderBy=folder,name&key=${API_KEY}${token?`&pageToken=${token}`:""}`;
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
  if(FOLDER_ID.startsWith("PUT_")||API_KEY.startsWith("PUT_")){ renderSetup(); setStatus("err","not configured"); return; }
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
    if(!silent) $("#view").innerHTML=`<div class="empty"><b style="color:var(--red)">Drive error:</b> ${esc(e.message)}<br><br>Check: folder is shared as “Anyone with the link”, Drive API is enabled, and the API key is allowed for this site.</div>`;
  }
}

function renderSetup(){
  $("#view").innerHTML=`<div class="setup"><h2>// setup required</h2>
  Open <code>index.html</code> and fill the two config lines at the top of the script:
  <ol>
   <li>In Google Drive, right-click your folder → <b>Share</b> → General access → <code>Anyone with the link: Viewer</code>.</li>
   <li>Copy the folder ID from its URL: <code>drive.google.com/drive/folders/<b>THIS_PART</b></code> → <code>FOLDER_ID</code>.</li>
   <li>Google Cloud Console → create project → enable <b>Google Drive API</b> → Credentials → <b>API key</b> → <code>API_KEY</code>.</li>
   <li>Restrict the key: <i>HTTP referrers</i> = your site's domain, <i>API restriction</i> = Drive API only.</li>
   <li>Upload the file to any static host (GitHub Pages, Netlify, Cloudflare Pages…).</li>
  </ol></div>`;
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
          `<span class="btn p" data-act="view">Preview</span>
           <a class="btn" data-act="dl" target="_blank" rel="noopener" href="${isGoogleApp(f)?esc(f.webViewLink):dl}">${isGoogleApp(f)?"Open":"Download"}</a>`}
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
  $("#mdl").href = isGoogleApp(f)?f.webViewLink:`https://drive.google.com/uc?export=download&id=${f.id}`;
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
