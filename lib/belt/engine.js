import { LOGO_SVG } from "./logo";

// The belt's views and interactions. Ported from the prototype: each view renders into the static markup.
// startBelt() returns a cleanup function so React can unmount it.
export function startBelt({ api, mePerson }) {
const ac=new AbortController();
const cleanups=[()=>ac.abort()];
const on=(target,type,fn)=>target.addEventListener(type,fn,{signal:ac.signal});

const STAGES=["Idea","Scope","Development","Testing","Commercial readiness","Launch"];
const HINT=["On the list","Shaping it up","Being built","Trying it out","Sales & marketing ready","Out there"];
const SCOL=["#AFC0C9","#8FCAE5","#219EBC","#F5BF08","#F6851F","#003046"];
const STATUS={ok:"On track",risk:"At risk",blocked:"Blocked",paused:"Paused"};
const ASTATE={todo:"To do",doing:"Doing",waiting:"Waiting",blocked:"Blocked",done:"Done"};
const NEXT={todo:"doing",doing:"done",done:"todo",blocked:"doing",waiting:"doing"};
const ROLES={admin:"Admin",lead:"Lead",member:"Member",viewer:"Viewer"};
const REGIONS={uk:"UK",ie:"Ireland",both:"UK & Ireland"};
const VIEWS=["week","roadmap","belt","lanes","people","nudges"];
const ADMIN_VIEWS=["people","nudges"];
const FILTER_VIEWS=["week","roadmap","belt","lanes"];
const DAY=864e5,WEEK=7*DAY;
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let db=api,me=mePerson.id,canWrite=true;
let projects=[],actions=[],miles=[],people=[],depts=[],absences=[],decisions=[],updates=[],meta={};
let view="week",who="all",deptF="all",regionF="all",q="",showDone=false,groupBy="person",win=12,capDept="all";
let openId=null,editing=false,pickedOwner=null,assigning=null,helping=null,blockingId=null,blockDraft=[],editingAct=null,handing=null,flashAct=null,nudgeFor=null,pendingOpen=null;
const myRole=()=>people.find(p=>p.id===me)?.role||mePerson.role||"viewer";
const placed=new Map();

/* ---------- dates ---------- */
const now=()=>Date.now();
const today0=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const monday=d=>{const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x};
const daysSince=iso=>iso?(now()-Date.parse(iso))/DAY:Infinity;
function ago(iso){if(!iso)return"never";const d=daysSince(iso);if(d<1/24)return"just now";if(d<1)return Math.round(d*24)+"h ago";if(d<14)return Math.round(d)+"d ago";return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}
const dt=s=>{if(!s)return null;const d=new Date(String(s).slice(0,10)+"T12:00:00");return isNaN(d)?null:d};
const iso10=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
function fmtDate(s,long){const d=dt(s);if(!d)return long?"Not set":"";return d.toLocaleDateString("en-GB",long?{day:"numeric",month:"short",year:"numeric"}:{day:"numeric",month:"short"})}
const fmtD=d=>d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});

/* ---------- people & departments ---------- */
function personFor(id){if(!id)return null;return people.find(p=>p.id===id)||null}
const personKey=p=>p.id;
const ownedBy=(id,p)=>!!id&&!!p&&id===p.id;
const deptById=id=>depts.find(x=>x.id===id);
const deptName=id=>deptById(id)?.name||"";
const internal=()=>depts.filter(d=>!d.external);
const externals=()=>depts.filter(d=>d.external);
const deptOfOwner=id=>personFor(id)?.dept||"";
const effDept=a=>(a.ownerId&&deptOfOwner(a.ownerId))||a.dept||"";
const isMe=id=>!!id&&!!me&&id===me;
const nm=id=>{if(!id)return"";return personFor(id)?.name||"Someone"};
const leadOf=x=>x.ownerId?nm(x.ownerId):(x.suggestedLead?x.suggestedLead+" (to claim)":"Unclaimed");
const short=s=>s.replace(" (to claim)","");
function initials(s){return(s||"?").replace(/\(.*\)/,"").trim().split(/[\s&/]+/).filter(Boolean).map(w=>w[0]).join("").slice(0,2).toUpperCase()||"?"}
function toast(t){const el=$("#toast");el.textContent=t;el.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("on"),2400)}
const dtag=id=>{const d=deptById(id);return d?`<span class="dtag ${d.external?"ext":""}">${esc(d.name)}</span>`:""};
const rtag=p=>p.region&&p.region!=="uk"?`<span class="rtag">${esc(REGIONS[p.region])}</span>`:"";
function deptOptions(sel,blank,withExt){
  const o=d=>`<option value="${esc(d.id)}" ${d.id===sel?"selected":""}>${esc(d.name)}</option>`;
  return(blank?`<option value="">${blank}</option>`:"")+internal().map(o).join("")+(withExt&&externals().length?`<optgroup label="External suppliers">${externals().map(o).join("")}</optgroup>`:"");
}
const peopleOptions=(sel,blank)=>(blank?`<option value="">${blank}</option>`:"")+people.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(personKey(p))}" ${sel&&ownedBy(sel,p)?"selected":""}>${esc(p.name)}${p.dept?" · "+esc(deptName(p.dept)):""}</option>`).join("");

/* ---------- projects & actions ---------- */
const regionOK=p=>regionF==="all"||!p.region||p.region===regionF||p.region==="both";
const vis=()=>projects.filter(regionOK);
const pIndex=pid=>projects.findIndex(p=>p.id===pid)+1;
const pcls=pid=>"pcol"+(((pIndex(pid)-1)%5)+1);
const projOf=a=>projects.find(p=>p.id===a.projectId);
const actsOf=pid=>actions.filter(a=>a.projectId===pid).sort((a,b)=>(a.order??0)-(b.order??0));
const isOpen=a=>a.state!=="done";
const isLate=a=>isOpen(a)&&a.due&&dt(a.due)<today0();
const staleAct=a=>isOpen(a)&&daysSince(a.updatedAt)>7;
const lastTouch=p=>[p.updatedAt,...actsOf(p.id).map(a=>a.updatedAt)].filter(Boolean).sort().pop();
const staleProj=p=>p.stage<5&&daysSince(lastTouch(p))>7;
const movedRecently=a=>a.updatedAt&&daysSince(a.updatedAt)<=7&&(Date.parse(a.updatedAt)-Date.parse(a.createdAt||a.updatedAt))>60000;
const stateRank={blocked:0,waiting:1,doing:2,todo:3,done:4};
const revised=x=>(x.dateLog||[]).length;
const revTag=x=>revised(x)?`<span class="revtag" title="${esc((x.dateLog||[]).map(l=>`${fmtDate(l.from)} → ${fmtDate(l.to)||"none"}${l.reason?": "+l.reason:""} (${ago(l.at)})`).join("\n"))}">Revised ×${revised(x)}</span>`:"";
const waitLabel=a=>"Waiting on "+(deptName(a.waitingOn)||"another team");
function stageStart(p){const log=(p.stageLog||[]).filter(l=>l.stage===(p.stage|0)).map(l=>l.at).sort();return dt(log.pop()||p.createdAt)||today0()}

/* ---------- planning assumptions ---------- */
function actualDurations(){
  const out=STAGES.map(()=>[]);
  for(const p of projects){const log=(p.stageLog||[]).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    for(let i=0;i<log.length-1;i++){const s=log[i].stage,n=log[i+1].stage;if(n>s){const w=(Date.parse(log[i+1].at)-Date.parse(log[i].at))/WEEK;if(w>=0)out[s].push(w)}}}
  return out;
}
const rule=s=>{const v=+((meta.assumptions||{}).weeks||{})[s];return v>0?v:null};
function projection(p){
  const cur=p.stage|0;if(cur>=5)return null;
  if(!rule(cur))return null;
  const segs=[];let t=Math.max(today0().getTime(),stageStart(p).getTime()+rule(cur)*WEEK);
  segs.push({s:cur,from:today0().getTime(),to:t});
  for(let s=cur+1;s<5;s++){if(!rule(s))break;segs.push({s,from:t,to:t+rule(s)*WEEK});t+=rule(s)*WEEK}
  const complete=segs[segs.length-1].s===4;
  return{segs,launch:complete?new Date(t):null};
}
const launchDate=p=>dt(p.due)||projection(p)?.launch||null;

/* ---------- permissions (mockup preview) ---------- */
const R=()=>canWrite?myRole():"viewer";
const isAdmin=()=>R()==="admin";
const canAdd=()=>R()!=="viewer";
const canLead=()=>R()==="admin"||R()==="lead";
const canEditProj=p=>R()==="admin"||(R()==="lead"&&isMe(p.ownerId));
const blockersOf=a=>(Array.isArray(a.blockedBy)?a.blockedBy:[]).map(id=>actions.find(x=>x.id===id)).filter(Boolean);
const openBlockers=a=>blockersOf(a).filter(isOpen);
const blocking=a=>actions.filter(d=>d.state==="blocked"&&Array.isArray(d.blockedBy)&&d.blockedBy.includes(a.id));
const blockedBy=a=>{if(a.state!=="blocked")return"";const parts=[];const ob=openBlockers(a);if(ob.length)parts.push(ob.map(b=>"“"+b.text+"”").join(", "));if(a.blockedReason)parts.push(a.blockedReason);return parts.join("; ")};
const readyToUnblock=a=>a.state==="blocked"&&blockersOf(a).length>0&&!openBlockers(a).length;
const helpersOf=a=>Array.isArray(a.helpers)?a.helpers.filter(Boolean):[];
const involves=(a,id)=>!!id&&(a.ownerId===id||helpersOf(a).includes(id));
const canEditAct=a=>{const r=R();if(r==="admin")return true;if(r==="viewer")return false;if(isMe(a.ownerId)||helpersOf(a).includes(me))return true;if(r==="lead"){const p=projOf(a);return!!p&&isMe(p.ownerId)}return false};
const canManageAct=a=>{const r=R();if(r==="admin")return true;if(r==="lead"){const p=projOf(a);return!!p&&isMe(p.ownerId)}return false};
const canClaim=a=>R()!=="viewer"&&!isMe(a.ownerId)&&(!a.ownerId||canManageAct(a));

function matches(a){
  const p=projOf(a);if(p&&!regionOK(p))return false;
  if(who==="mine"&&!involves(a,me))return false;
  if(who==="open"&&a.ownerId)return false;
  if(!["all","mine","open"].includes(who)&&!involves(a,who))return false;
  if(deptF!=="all"&&effDept(a)!==deptF&&a.waitingOn!==deptF)return false;
  if(q&&!`${a.text} ${a.suggestedLead||""} ${p?p.title:""} ${nm(a.ownerId)}`.toLowerCase().includes(q))return false;
  return true;
}
const filtering=()=>who!=="all"||deptF!=="all"||q;
function progress(list){
  const t=list.length||1,d=list.filter(a=>a.state==="done").length,g=list.filter(a=>a.state==="doing"||a.state==="waiting").length,b=list.filter(a=>a.state==="blocked").length;
  return `<div class="prog"><div class="trk"><span class="d" style="width:${d/t*100}%"></span><span class="g" style="width:${g/t*100}%"></span><span class="b" style="width:${b/t*100}%"></span></div><small>${list.length?`${d} of ${list.length} done${g?` · ${g} in progress`:""}${b?` · ${b} blocked`:""}`:"No actions yet"}</small></div>`;
}
function dlChip(a){
  const late=isLate(a);const txt=a.due?(late?"Date passed ":"Due ")+fmtDate(a.due):"Deadline";
  const rv=revised(a)?` <span title="${esc((a.dateLog||[]).map(l=>`${fmtDate(l.from)} → ${fmtDate(l.to)||"none"}`).join("\n"))}">· moved ×${revised(a)}</span>`:"";
  if(!canEditAct(a))return a.due?`<span class="dl ${late?"late":"set"}">📅 ${txt}${rv}</span>`:"";
  return `<label class="dl ${a.due?(late?"late":"set"):""}" title="${a.due?"Change or clear the deadline":"Set a deadline"}">📅 ${txt}${rv}<input type="date" data-due="${esc(a.id)}" value="${esc(a.due||"")}" aria-label="Deadline for ${esc(a.text)}"></label>`;
}
function nextLine(p){
  if(!p.nextStep)return `<div class="nextline none">Next step not set</div>`;
  const late=p.nextBy&&dt(p.nextBy)<today0();
  return `<div class="nextline"><b>Next:</b> ${esc(p.nextStep)}${p.nextOwner?` · ${esc(nm(p.nextOwner))}`:""}${p.nextBy?` · <span style="${late?"color:var(--orange-ink);font-weight:800":""}">by ${fmtDate(p.nextBy)}</span>`:""}</div>`;
}

function renderFilters(){
  const el=$("#gfilters");el.hidden=!FILTER_VIEWS.includes(view);if(el.hidden)return;
  const f=document.activeElement;if(f&&f.matches&&f.matches("[data-search]")&&el.contains(f))return;
  const owners=[...new Set(actions.map(a=>a.ownerId).filter(Boolean))].filter(o=>!isMe(o));
  const chips=[["all","Everyone"],["mine","Mine"],["open","Unclaimed"],...owners.slice(0,6).map(o=>[o,nm(o)])];
  el.innerHTML=chips.map(([k,l])=>`<button class="chip" type="button" data-who="${esc(k)}" aria-pressed="${who===k}">${esc(l)}</button>`).join("")
    +`<select class="dsel" data-deptf aria-label="Department"><option value="all">All departments</option>${deptOptions(deptF===`all`?"":deptF,"",true)}</select>`
    +`<select class="dsel" data-regionf aria-label="Region"><option value="all">UK & Ireland</option><option value="uk" ${regionF==="uk"?"selected":""}>UK</option><option value="ie" ${regionF==="ie"?"selected":""}>Ireland</option></select>`
    +`<input class="search" type="search" data-search placeholder="Search" aria-label="Search actions" value="${esc(q)}"><span class="sp"></span>`
    +(canLead()?`<button class="btn btn-o btn-s" type="button" data-newinit>+ New initiative</button>`:"");
}

/* ---------- WEEK (review) ---------- */
function renderWeek(){
  const mon=monday(new Date());
  $("#w-sub").textContent="Solution Factory · week commencing "+mon.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
  const P=vis(),pids=new Set(P.map(p=>p.id));const A=actions.filter(a=>pids.has(a.projectId));const open=A.filter(isOpen);
  const s=[[A.filter(movedRecently).length,"Actions moved this week","var(--navy)"],[A.filter(a=>a.state==="done"&&a.doneAt&&daysSince(a.doneAt)<=7).length,"Done this week","var(--teal-ink)"],[open.filter(a=>a.state==="blocked").length,"Blocked","var(--red)"],[open.filter(a=>a.state==="waiting").length,"Waiting on others","var(--navy-3)"],[P.filter(p=>p.stage<5&&!p.nextStep).length,"Initiatives with no next step","var(--orange-ink)"]];
  $("#w-stats").innerHTML=s.map(([v,l,c])=>`<div class="card wstat"><b style="color:${c}">${v}</b><span>${l}</span></div>`).join("");
  $("#w-rows").innerHTML=P.map(p=>{
    const list=actsOf(p.id),st=p.status||"ok";
    const moved=list.filter(movedRecently).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,3);
    const flags=[];
    list.filter(a=>a.state==="blocked").forEach(a=>flags.push(["red","Blocked: "+a.text+(blockedBy(a)?" (by "+blockedBy(a)+")":"")]));
    if(p.blockers)flags.push(["red",p.blockers]);
    list.filter(a=>a.state==="waiting").forEach(a=>flags.push(["blue",`${waitLabel(a)}: ${a.text}`]));
    const late=list.filter(isLate).length;if(late)flags.push(["amber",`${late} past their date: revise or close`]);
    if(!p.ownerId)flags.push(["amber","Needs a lead"+(p.suggestedLead?` (suggested: ${p.suggestedLead})`:"")]);
    const un=list.filter(a=>isOpen(a)&&!a.ownerId).length;if(un)flags.push(["blue",`${un} action${un>1?"s":""} unclaimed`]);
    const ld=launchDate(p);
    return `<div class="wrow" data-pid="${esc(p.id)}" tabindex="0" role="button">
      <span class="light ${st}" role="img" aria-label="${STATUS[st]}"></span>
      <div style="display:grid;gap:3px"><span class="wtitle">${esc(p.title)} ${rtag(p)}</span><span class="wsub">${esc(leadOf(p))} · ${STAGES[p.stage|0]} · ${STATUS[st]}${ld?` · ${p.due?"target":"projected"} ${fmtD(ld)}`:""} ${revTag(p)}</span>${nextLine(p)}</div>
      <div style="padding-top:2px">${progress(list)}</div>
      <div class="wlist">${moved.length?moved.map(a=>`<span>${a.state==="done"?"✓":"→"} ${esc(a.text)} <span class="pill ${a.state}">${a.state==="waiting"?esc(waitLabel(a)):ASTATE[a.state]}</span></span>`).join(""):`<span style="color:var(--muted)">Nothing yet this week</span>`}</div>
      <div style="display:grid;gap:6px">${flags.slice(0,5).map(([c,t])=>`<span class="flag ${c}">${esc(t)}</span>`).join("")||`<span style="color:var(--muted);font-size:13px">All clear</span>`}</div>
    </div>`}).join("")||`<div class="empty-state">No initiatives${regionF!=="all"?" for this region":""} yet.</div>`;
  // launching soon
  const horizon=new Date(today0().getTime()+12*WEEK);
  const soon=P.filter(p=>p.stage<5&&(p.stage>=3||(launchDate(p)&&launchDate(p)<=horizon))).sort((a,b)=>(launchDate(a)||horizon*2)-(launchDate(b)||horizon*2));
  $("#w-launch").innerHTML=soon.map(p=>{const ld=launchDate(p);return `<button type="button" class="lcard" data-pid="${esc(p.id)}"><span class="stg" style="--sc:${SCOL[p.stage|0]}"><i></i>${STAGES[p.stage|0]}</span><b>${esc(p.title)}</b><span class="when">${ld?(p.due?"Target ":"Projected ")+ld.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"Date to be set"} ${revTag(p)}</span><span class="note">${esc(leadOf(p))}${p.region?" · "+esc(REGIONS[p.region]):""}</span></button>`}).join("")||`<p class="note">Nothing heading to launch in the next 12 weeks yet.</p>`;
  // changes since review
  const since=meta.review?.at?Date.parse(meta.review.at):now()-7*DAY;
  $("#w-chg-title").textContent="What's changed";
  $("#w-chg-sub").textContent=meta.review?.at?`Since the last review on ${new Date(meta.review.at).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}${meta.review.by?" (marked by "+nm(meta.review.by)+")":""}`:"In the last 7 days. Mark a review done to reset this.";
  $("[data-review]").hidden=!canLead();
  const ch=[];
  for(const p of P){for(const l of p.log||[])if(Date.parse(l.at)>since)ch.push({at:l.at,i:"•",t:l.text,s:`${p.title} · ${nm(l.by)||"Someone"}`});
    for(const l of p.dateLog||[])if(Date.parse(l.at)>since)ch.push({at:l.at,i:"📅",t:`Target moved ${fmtDate(l.from)} → ${fmtDate(l.to)||"none"}${l.reason?": "+l.reason:""}`,s:p.title})}
  for(const a of A){
    if(a.doneAt&&Date.parse(a.doneAt)>since&&a.state==="done")ch.push({at:a.doneAt,i:"✓",t:"Done: "+a.text,s:`${projOf(a)?.title||""} · ${nm(a.ownerId)||""}`});
    for(const l of a.dateLog||[])if(Date.parse(l.at)>since)ch.push({at:l.at,i:"📅",t:`Date moved ${fmtDate(l.from)} → ${fmtDate(l.to)||"none"}: ${a.text}`,s:projOf(a)?.title||""});
    if(a.createdAt&&Date.parse(a.createdAt)>since&&movedRecently({...a,updatedAt:a.createdAt,createdAt:"2000-01-01"})&&a.updatedBy)ch.push({at:a.createdAt,i:"+",t:"Added: "+a.text,s:projOf(a)?.title||""});
    else if(a.state!=="done"&&a.updatedAt&&Date.parse(a.updatedAt)>since&&movedRecently(a))ch.push({at:a.updatedAt,i:"→",t:`${a.state==="waiting"?waitLabel(a):ASTATE[a.state]}: ${a.text}`,s:`${projOf(a)?.title||""}${a.ownerId?" · "+nm(a.ownerId):""}`});
  }
  ch.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  $("#w-chg").innerHTML=ch.slice(0,10).map(c=>`<li><span>${c.i}</span><span>${esc(c.t)}<small>${esc(c.s)} · ${esc(ago(c.at))}</small></span></li>`).join("")+(ch.length>10?`<li><span></span><span class="note">+${ch.length-10} more</span></li>`:"")||`<li><span></span><span class="note">Nothing has changed yet.</span></li>`;
  // decisions
  const ds=decisions.slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,8);
  $("#w-dec").innerHTML=ds.map(d=>`<li><b>${esc(new Date(d.at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}))}</b><span>${esc(d.text)}<small>${esc(projects.find(p=>p.id===d.projectId)?.title||"General")} · ${esc(nm(d.by)||"Someone")}</small></span>${isAdmin()?`<button class="lnk red" type="button" data-deldec="${esc(d.id)}">Remove</button>`:"<span></span>"}</li>`).join("")||`<li><span></span><span class="note">No decisions recorded yet.</span><span></span></li>`;
  $("#dec-form").hidden=!canLead();
  const dp=$("#dec-pid");const keep=dp.value;dp.innerHTML=`<option value="">General</option>`+projects.map(p=>`<option value="${esc(p.id)}" ${p.id===keep?"selected":""}>${esc(p.title)}</option>`).join("");
  // coming up + needs
  const t0=today0();
  const coming=[...miles.map(m=>({d:dt(m.date),t:m.label,k:m.kind==="release"?"Supplier release":"Milestone"})),...absences.map(x=>({d:dt(x.from),t:`${people.find(p=>p.id===x.personId)?.name||"Someone"} off${x.to&&x.to!==x.from?" until "+fmtDate(x.to):""}`,k:x.note||"Time off"})),...A.filter(a=>isOpen(a)&&a.due).map(a=>({d:dt(a.due),t:a.text,k:(projOf(a)?.title||"")+(a.ownerId?" · "+nm(a.ownerId):"")})),...P.filter(p=>p.due).map(p=>({d:dt(p.due),t:p.title+" target launch",k:"Initiative"}))].filter(x=>x.d&&x.d>=t0).sort((a,b)=>a.d-b.d).slice(0,7);
  $("#w-coming").innerHTML=coming.map(c=>`<li><b>${c.d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:c.d.getFullYear()!==t0.getFullYear()?"numeric":undefined})}</b> · ${esc(c.t)} <span style="color:var(--sky);font-size:12px">${esc(c.k)}</span></li>`).join("")||`<li style="color:var(--soft)">Nothing dated yet.</li>`;
  const needs=[...P.filter(p=>!p.ownerId).map(p=>`<b>${esc(p.title)}</b> needs a lead${p.suggestedLead?` (suggested: ${esc(p.suggestedLead)})`:""}`),...P.filter(p=>p.stage<5&&!p.nextStep).map(p=>`<b>${esc(p.title)}</b>: agree the next step`),...open.filter(a=>a.state==="waiting").map(a=>`<b>${esc(deptName(a.waitingOn)||"Another team")}</b> to pick up: ${esc(a.text)}`),...open.filter(a=>a.state==="blocked").map(a=>`Unblock: ${esc(a.text)}${blockedBy(a)?` <span style="color:var(--red-ink)">· blocked by ${esc(blockedBy(a))}</span>`:""}`)];
  $("#w-needs").innerHTML=needs.slice(0,8).map(n=>`<li>${n}</li>`).join("")||`<li style="color:var(--muted)">Nothing waiting.</li>`;
  $("#w-belt").innerHTML=`<div class="belt-strip" aria-hidden="true"></div>`+P.map((p,i)=>{const n=P.slice(0,i).filter(x=>(x.stage|0)===(p.stage|0)).length;return `<button type="button" class="${pcls(p.id)}" data-pid="${esc(p.id)}" style="left:${((p.stage|0)+.5)/6*100}%;bottom:${18+n*26}px">${esc(p.title)}</button>`}).join("");
  $("#w-belt").style.height=(56+Math.max(0,...STAGES.map((_,s)=>P.filter(p=>(p.stage|0)===s).length-1))*26)+"px";
}

/* ---------- ROADMAP ---------- */
function renderRoadmap(){
  const t0=today0();const P=vis();
  $("#t-win").innerHTML=[[8,"8 weeks"],[12,"12 weeks"],[0,"Everything"]].map(([k,l])=>`<button type="button" data-win="${k}" aria-pressed="${win===k}">${l}</button>`).join("");
  let start,end;
  if(win){start=new Date(monday(t0).getTime()-WEEK);end=new Date(start.getTime()+(win+1)*WEEK)}
  else{start=new Date(t0.getFullYear(),t0.getMonth(),1);const ds=[...P.map(launchDate),...actions.map(a=>dt(a.due)),...miles.map(m=>dt(m.date))].filter(Boolean).map(d=>d.getTime());end=new Date(Math.max(new Date(2027,7,31).getTime(),...ds));end=new Date(end.getFullYear(),end.getMonth()+2,1)}
  const span=end-start;const pos=d=>Math.max(0,Math.min(100,((+d)-start)/span*100));
  const seg=(from,to,s,cls,label)=>{const l=pos(from),r=pos(to);if(r-l<=0.05)return"";return `<div class="gseg ${cls}" style="--sc:${SCOL[s]};left:${l}%;width:${r-l}%">${label&&r-l>6?`<span>${esc(label)}</span>`:""}</div>`};
  let ticks="",grid="";
  if(win){for(let d=new Date(start);d<end;d=new Date(d.getTime()+WEEK)){const first=d.getDate()<=7||+d===+start;ticks+=`<span style="left:${pos(d)}%">${first?`<b>${d.toLocaleDateString("en-GB",{month:"short"})}</b>`:"<b>&nbsp;</b>"}${d.getDate()}</span>`;grid+=`<i style="left:${pos(d)}%"></i>`}}
  else{for(let d=new Date(start);d<end;d=new Date(d.getFullYear(),d.getMonth()+1,1)){ticks+=`<span style="left:${pos(d)}%"><b>${d.getMonth()===0||+d===+start?d.getFullYear():"&nbsp;"}</b>${d.toLocaleDateString("en-GB",{month:"short"})}</span>`;grid+=`<i style="left:${pos(d)}%"></i>`}}
  const anyDates=P.some(p=>launchDate(p))||actions.some(a=>a.due);
  $("#t-prompt").innerHTML=anyDates?"":`<div class="prompt" style="margin-top:18px"><b>The roadmap fills in as dates go on.</b><span>Give initiatives a target launch (Edit details), tap 📅 on actions, or set rules of thumb under Planning assumptions to sketch dates automatically.</span></div>`;
  const tp=pos(t0);
  const rows=P.map(p=>{
    const log=(p.stageLog||[]).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    let hist="";
    if(log.length){for(let i=0;i<log.length;i++){const f=dt(log[i].at),t=i<log.length-1?dt(log[i+1].at):t0;hist+=seg(f,new Date(Math.max(t,+f+DAY)),log[i].stage,"hist",STAGES[log[i].stage])}}
    else{const f=dt(p.createdAt)||t0;hist=seg(f,new Date(Math.max(+t0,+f+DAY)),p.stage|0,"hist",STAGES[p.stage|0])}
    const pr=projection(p);let plan="";
    if(pr)plan=pr.segs.map((x,i)=>seg(x.from,x.to,x.s,"plan",i===0?"":STAGES[x.s])).join("");
    const due=dt(p.due);const ld=launchDate(p);
    const tail=!pr&&!due&&p.stage<5?`<div class="tl-tail" style="left:${tp}%;right:0"></div><span class="tl-due" style="right:6px">Target not set</span>`:"";
    const flag=due?`<div class="tl-flag" style="left:${pos(due)}%" title="Target launch ${fmtDate(p.due,true)}"></div><span class="tl-due" style="left:${Math.min(pos(due)+.6,88)}%;top:2px">${fmtDate(p.due)} ${revised(p)?"(revised)":""}</span>`:pr&&pr.launch?`<span class="tl-due" style="left:${Math.min(pos(pr.launch),88)}%;top:2px;color:var(--muted)">≈ ${fmtD(pr.launch)}</span>`:"";
    const waits=actsOf(p.id).filter(a=>a.state==="waiting");
    const dots=actsOf(p.id).filter(a=>a.due&&dt(a.due)>=start&&dt(a.due)<=end).map(a=>`<span class="tl-dot ${a.state}" style="left:${pos(dt(a.due))}%;top:56px" title="${esc(a.text)} · ${esc(nm(a.ownerId)||"Unclaimed")} · ${fmtDate(a.due)}"></span>`).join("");
    return `<div class="tl-row ${pcls(p.id)}" data-pid="${esc(p.id)}" tabindex="0" role="button">
      <div class="tl-lab"><b>${esc(p.title)} ${rtag(p)}</b><span>${esc(short(leadOf(p)))} · ${STAGES[p.stage|0]}</span>${p.nextStep?`<span style="color:var(--orange-ink)">Next: ${esc(p.nextStep)}</span>`:""}</div>
      <div class="tl-track">${hist}${plan}${tail}${flag}${dots}${waits.length?`<span class="tl-wait" style="left:${Math.min(tp+1,80)}%">⏳ ${esc(waits.map(a=>deptName(a.waitingOn)).filter((v,i,x)=>v&&x.indexOf(v)===i).join(", ")||"Waiting")}</span>`:""}</div></div>`}).join("")||`<div class="empty-state">No initiatives yet.</div>`;
  const absIn=absences.filter(x=>{const f=dt(x.from),t=dt(x.to)||f;return f&&t>=start&&f<=end});
  const absRows=absIn.length?`<div class="tl-sec"><b>People off</b><div class="tr" style="height:${Math.max(30,8+absIn.length*22)}px">${absIn.map((x,i)=>{const f=dt(x.from),t=new Date((dt(x.to)||f).getTime()+DAY);return `<span class="abs" style="top:${6+i*22}px;left:${pos(f)}%;width:${Math.max(1.5,pos(t)-pos(f))}%" title="${esc(x.note||"Time off")}">${esc(people.find(p=>p.id===x.personId)?.name||"Someone")}</span>`}).join("")}</div></div>`:"";
  const ms=miles.filter(m=>dt(m.date)&&dt(m.date)>=start&&dt(m.date)<=end);
  $("#tl").innerHTML=`
    <div class="tl-weeks"><span></span><div class="tl-wk">${ticks}</div></div>
    <div class="tl-body">
      <div class="tl-grid">${grid}<div class="tl-today" style="left:${tp}%"><span>Today</span></div></div>
      ${rows}${absRows}
      <div class="tl-miles"><b style="font-size:13px;color:var(--muted);padding-top:2px">Milestones &amp; releases</b><div class="tl-mtrack">${ms.map(m=>{const x=pos(dt(m.date));return `<div class="tl-mile${x>82?" r":""} ${m.kind==="release"?"rel":""}" style="${x>82?`right:${100-x}%`:`left:${x}%`}"><i></i><b>${esc(m.label)}</b><span>${fmtDate(m.date,true)}</span></div>`}).join("")||`<span class="note" style="position:absolute;left:8px;top:6px">None in this window</span>`}</div></div>
    </div>`;
  $("#t-key").innerHTML=STAGES.map((s,i)=>`<span style="--sc:${SCOL[i]}"><i></i>${s}</span>`).join("")+`<span>Solid = where it's been · Dashed = sketched from planning assumptions · ⚑ = target launch</span>`;
  $("#t-miles").innerHTML=miles.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(m=>`<li><b>${esc(fmtDate(m.date,true))}</b><span style="flex:1">${esc(m.label)} ${m.kind==="release"?`<span class="dtag ext">Release</span>`:""}</span>${canLead()?`<button class="lnk red" type="button" data-delmile="${esc(m.id)}">Remove</button>`:""}</li>`).join("")||`<li style="color:var(--muted)">No milestones yet.</li>`;
  $("#t-mform").hidden=!canLead();
  renderAbsences();
  const act=actualDurations();
  const f=document.activeElement;const editingRule=f&&f.dataset&&f.dataset.rule;
  if(!editingRule)$("#t-assume").innerHTML=STAGES.slice(0,5).map((s,i)=>{const a=act[i];const avg=a.length?a.reduce((x,y)=>x+y,0)/a.length:null;return `<tr><td><span class="stg" style="--sc:${SCOL[i]}"><i></i>${s}</span></td><td>${avg!==null?`<b>${avg<1?Math.round(avg*7)+" days":avg.toFixed(1)+" weeks"}</b> <small class="note">from ${a.length}</small>`:`<span class="note">No history yet</span>`}</td><td>${canLead()?`<input type="number" min="0" max="52" step="0.5" data-rule="${i}" value="${rule(i)??""}" placeholder="weeks" aria-label="Rule of thumb for ${s} in weeks">`:(rule(i)?rule(i)+" weeks":"–")}</td></tr>`}).join("");
}

/* ---------- BELT ---------- */
function crate(p,i){
  const key=p.id+":"+p.stage;const fresh=placed.get(p.id)!==key;placed.set(p.id,key);
  const st=p.status||"ok";const list=actsOf(p.id);
  const done=list.filter(a=>a.state==="done").length;const pct=list.length?Math.round(done/list.length*100):0;
  const dim=filtering()&&!list.some(matches);
  return `<button class="crate ${st} ${dim?"dim":""}" type="button" data-pid="${esc(p.id)}" ${fresh?`data-enter style="--d:${i*120}ms"`:""}>
    <span style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="num">${esc(p.stream||"Initiative")} ${rtag(p)}</span><span class="pill ${st}">${STATUS[st]}</span></span>
    <span class="c-title">${esc(p.title)}</span>
    <span class="big"><b>${pct}%</b><span>${done} of ${list.length} done</span></span>
    ${progress(list).replace(/<small>.*<\/small>/,"")}
    <span class="nextup"><span>${p.nextStep?"Next step":"Next step not set"}</span><b>${esc(p.nextStep||"Agree at the next review")}</b>${p.nextOwner||p.nextBy?`<span style="color:var(--muted);font-weight:700">${esc(nm(p.nextOwner))}${p.nextBy?" · by "+fmtDate(p.nextBy):""}</span>`:""}</span>
    <span class="c-foot"><span class="av ${p.ownerId?"":"open"}">${esc(initials(leadOf(p)))}</span><span class="nm">${esc(short(leadOf(p)))}</span><span class="upd ${staleProj(p)?"stale":""}">${esc(ago(lastTouch(p)))}</span></span>
  </button>`;
}
const helperAvs=a=>helpersOf(a).map(h=>`<span class="av hav" title="Helping: ${esc(nm(h))}">${esc(initials(nm(h)))}</span>`).join("");
const helperNames=a=>helpersOf(a).length?`<span class="note">+ ${esc(helpersOf(a).map(h=>nm(h).split(" ")[0]).join(", "))}</span>`:"";
const achip=(a,helpingFor)=>`<button type="button" class="achip ${a.state} ${pcls(a.projectId)}" data-pid="${esc(a.projectId)}" data-aid="${esc(a.id)}">${esc(a.text)}${a.state==="waiting"?`<em>${esc(waitLabel(a))}</em>`:a.state!=="todo"?`<em>${ASTATE[a.state]}</em>`:""}${isLate(a)?`<em style="color:var(--orange-ink)">Date passed</em>`:""}${helpingFor?`<em style="color:var(--teal-ink)">Helping</em>`:""}</button>`;
function renderBelt(){
  const P=vis();let i=0;
  $("#cols").innerHTML=STAGES.map((s,si)=>`<div class="col" aria-label="${s}">${P.filter(p=>(p.stage|0)===si).map(p=>crate(p,i++)).join("")}</div>`).join("");
  if(!$("#stages").childElementCount){
    $("#stages").innerHTML=STAGES.map((s,si)=>`<div><i>${si+1}</i><span>${s}<br><small>${HINT[si]}</small></span></div>`).join("");
    $("#rollers").innerHTML=Array.from({length:40},()=>`<span class="roller"></span>`).join("");
  }
  $("#b-group").innerHTML=[["person","By person"],["dept","By department"]].map(([k,l])=>`<button type="button" data-group="${k}" aria-pressed="${groupBy===k}">${l}</button>`).join("");
  $("#b-key").innerHTML=P.slice(0,8).map(p=>`<span class="${pcls(p.id)}"><i></i>${esc(p.title)}</span>`).join("");
  const open=actions.filter(a=>isOpen(a)&&matches(a));
  const groups=new Map();
  if(groupBy==="dept"){
    for(const a of open){const k=a.state==="waiting"?(a.waitingOn||""):effDept(a);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a)}
    const rows=[...groups.entries()].map(([k,list])=>({k,name:deptName(k)||"No department yet",ext:deptById(k)?.external,list:list.sort((a,b)=>stateRank[a.state]-stateRank[b.state])})).sort((a,b)=>(!!b.k-!!a.k)||b.list.length-a.list.length);
    $("#b-people").innerHTML=rows.map(r=>{const ppl=people.filter(p=>p.dept===r.k).map(p=>p.name.split(" ")[0]).join(", ");return `<div class="prow"><div class="pname"><span class="av lg ${r.k?"":"open"}">${esc(initials(r.name))}</span><span>${esc(r.name)}<small>${r.ext?"External supplier":esc(ppl||(r.k?"Nobody added yet":"Unclaimed, no team set"))}</small></span></div><div class="pacts">${r.list.map(a=>achip(a)).join("")}</div><span class="pcount">${r.list.length}</span></div>`}).join("")||`<div class="empty-state">No open actions${filtering()?" match":""}.</div>`;
  }else{
    const add=(k,a,h)=>{if(!groups.has(k))groups.set(k,[]);groups.get(k).push(h?{...a,_helping:true}:a)};
    for(const a of open){add(a.ownerId?"u:"+a.ownerId:"s:"+(a.suggestedLead||""),a,false);for(const h of helpersOf(a))if(h!==a.ownerId)add("u:"+h,a,true)}
    const rows=[...groups.entries()].map(([k,list])=>{const owned=k.startsWith("u:");const id=k.slice(2);const name=owned?nm(id):"Unclaimed";const sub=owned?deptName(deptOfOwner(id)):(id?"Suggested: "+id:"No suggestion yet");return{owned,name,sub,list:list.sort((a,b)=>stateRank[a.state]-stateRank[b.state])}}).sort((a,b)=>(b.owned-a.owned)||b.list.length-a.list.length);
    $("#b-people").innerHTML=rows.map(r=>`<div class="prow"><div class="pname"><span class="av lg ${r.owned?"":"open"}">${esc(initials(r.owned?r.name:r.sub.replace("Suggested: ","")||"?"))}</span><span>${esc(r.name)}${r.sub?`<small>${esc(r.sub)}</small>`:""}</span></div><div class="pacts">${r.list.map(a=>achip(a,a._helping)).join("")}</div><span class="pcount">${r.list.length}</span></div>`).join("")||`<div class="empty-state">No open actions${filtering()?" match":""}.</div>`;
  }
  const list=actions.filter(a=>(showDone||isOpen(a))&&matches(a)).sort((a,b)=>daysSince(b.updatedAt)-daysSince(a.updatedAt));
  $("#rows").innerHTML=list.map(a=>{const p=projOf(a);return `<tr data-pid="${esc(a.projectId)}" data-aid="${esc(a.id)}" tabindex="0">
    <td data-l="Action"><b>${esc(a.text)}</b></td><td data-l="Initiative">${esc(p?p.title:"")}</td><td data-l="Owner">${esc(leadOf(a))}</td>
    <td data-l="Dept">${dtag(effDept(a))||"–"}</td>
    <td data-l="State"><span class="pill ${a.state||"todo"}">${a.state==="waiting"?esc(waitLabel(a)):ASTATE[a.state]||"To do"}</span></td>
    <td data-l="Deadline"><span class="${isLate(a)?"upd stale":""}">${esc(a.due?(isLate(a)?"Passed ":"")+fmtDate(a.due):"–")}</span> ${revised(a)?`<span class="revtag">×${revised(a)}</span>`:""}</td>
    <td data-l="Updated"><span class="upd ${staleAct(a)?"stale":""}">${esc(ago(a.updatedAt))}</span></td></tr>`}).join("")||`<tr><td colspan="7" class="empty-state">${actions.length?"Nothing matches. Clear the filters.":"No actions yet."}</td></tr>`;
}

/* ---------- LANES ---------- */
function tile(a){
  const btn=canEditAct(a)?`<button class="mv" type="button" data-cycle="${esc(a.id)}" aria-label="Move ${esc(a.text)} to ${ASTATE[NEXT[a.state]]}">${a.state==="done"?"Reopen":a.state==="doing"?"Done ✓":a.state==="waiting"||a.state==="blocked"?"Back →":"Start →"}</button>`:canClaim(a)?`<button class="mv" type="button" data-take="${esc(a.id)}">Take it</button>`:"";
  return `<div class="tile ${a.state}"><button class="tt" type="button" data-pid="${esc(a.projectId)}" data-aid="${esc(a.id)}">${esc(a.text)}</button>
    <div class="tm"><span class="av ${a.ownerId?"":"open"}">${esc(initials(leadOf(a)))}</span>${helperAvs(a)}<span>${esc(short(leadOf(a)))}</span>${helperNames(a)}${dtag(effDept(a))}${a.state!=="done"||a.due?dlChip(a):""}${a.state==="blocked"?`<span class="pill blocked">Blocked</span>`:""}${readyToUnblock(a)?`<span class="blockby ok">✓ Blockers done: ready to go</span>`:blockedBy(a)?`<span class="blockby">⛔ ${esc(blockedBy(a))}</span>`:""}${isOpen(a)&&blocking(a).length?`<span class="blockby amber">⛓ Holding up ${blocking(a).length} action${blocking(a).length>1?"s":""}</span>`:""}${a.state==="waiting"?`<span class="pill waiting">${esc(waitLabel(a))}</span>`:""}${btn}</div></div>`;
}
function renderLanes(){
  $("#lane-list").innerHTML=vis().map(p=>{
    const list=actsOf(p.id),v=list.filter(matches);
    if(filtering()&&!v.length)return"";
    const col=(k,label,keys)=>{const items=v.filter(a=>keys.includes(a.state)).sort((a,b)=>stateRank[a.state]-stateRank[b.state]);const shown=k==="done"?items.slice(-6):items;return `<div class="lcol ${k}"><h4><span>${label}</span><span>${items.length}</span></h4>${shown.map(tile).join("")}${k==="done"&&items.length>6?`<span class="note">+${items.length-6} more done</span>`:""}</div>`};
    return `<section class="card lane">
      <div class="lhead"><span class="lnum" style="background:${SCOL[p.stage|0]};color:${(p.stage|0)===5||(p.stage|0)===2?"#fff":"var(--navy)"}" title="${STAGES[p.stage|0]}">${(p.stage|0)+1}</span><button type="button" class="t" data-pid="${esc(p.id)}" style="border:0;background:none;text-align:left;padding:0"><h3>${esc(p.title)} ${rtag(p)}</h3><span>${esc(leadOf(p))} · ${STAGES[p.stage|0]}${launchDate(p)?` · ${p.due?"target":"projected"} ${fmtD(launchDate(p))}`:""}</span>${nextLine(p)}</button><span class="pill ${p.status||"ok"}">${STATUS[p.status||"ok"]}</span>${progress(list)}</div>
      <div class="lcols">${col("todo","To do",["todo","blocked"])}${col("doing","Doing",["doing","waiting"])}${col("done","Done",["done"])}</div>
      ${canAdd()?`<div class="addrow"><input data-quickadd="${esc(p.id)}" maxlength="160" placeholder="Add an action to ${esc(p.title)}" aria-label="Add an action to ${esc(p.title)}"><input type="date" data-quickdue="${esc(p.id)}" aria-label="Deadline (optional)" title="Deadline (optional)"><button class="btn btn-o btn-s" type="button" data-addto="${esc(p.id)}">Add</button></div>`:""}
    </section>`}).join("")||`<div class="empty-state card">Nothing matches.</div>`;
}

function renderAbsences(){
  const ps=$("#abs-pid");const keep=ps.value;ps.innerHTML=people.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.id)}" ${p.id===keep||(!keep&&isMe(personKey(p)))?"selected":""}>${esc(p.name)}</option>`).join("");
  const up=absences.filter(x=>(dt(x.to)||dt(x.from))>=today0()).sort((a,b)=>(a.from||"").localeCompare(b.from||""));
  $("#c-abs").innerHTML=up.map(x=>{const p=people.find(y=>y.id===x.personId);const can=isAdmin()||(p&&isMe(personKey(p)));return `<li><b>${esc(fmtDate(x.from))}${x.to&&x.to!==x.from?" – "+esc(fmtDate(x.to)):""}</b><span style="flex:1">${esc(p?.name||"Someone")}${x.note?" · "+esc(x.note):""}</span>${can?`<button class="lnk red" type="button" data-delabs="${esc(x.id)}">Remove</button>`:""}</li>`}).join("")||`<li style="color:var(--muted)">No time off booked.</li>`;
  $("#abs-form").hidden=!canAdd();
}

/* ---------- PEOPLE (admin) ---------- */
function renderPeople(){
  const openCount=p=>actions.filter(a=>isOpen(a)&&ownedBy(a.ownerId,p)).length;
  const sorted=people.slice().sort((a,b)=>(deptName(a.dept)||"~").localeCompare(deptName(b.dept)||"~")||a.name.localeCompare(b.name));
  $("#p-rows").innerHTML=sorted.map(p=>`<tr>
    <td data-l="Name"><b>${esc(p.name)}</b>${p.email?`<small>${esc(p.email)}</small>`:""}</td>
    <td data-l="Department"><select data-person="${esc(p.id)}" data-pfield="dept" aria-label="Department for ${esc(p.name)}">${deptOptions(p.dept,"No department")}</select></td>
    <td data-l="Role"><select data-person="${esc(p.id)}" data-pfield="role" aria-label="Role for ${esc(p.name)}">${Object.entries(ROLES).map(([k,l])=>`<option value="${k}" ${p.role===k?"selected":""}>${l}</option>`).join("")}</select></td>
    <td data-l="Sign-in">${p.userId?`<span class="sigs on">✓ Signed in</span>`:p.email?`<span class="sigs inv">Invited</span>`:`<span class="sigs off">Needs an email</span>`}</td>
    <td data-l="Open actions"><b>${openCount(p)}</b></td>
    <td><button class="lnk red" type="button" data-delperson="${esc(p.id)}">Remove</button></td></tr>`).join("")||`<tr><td colspan="7" class="empty-state">Nobody added yet.</td></tr>`;
  const sel=$("#p-dept");const keep=sel.value;sel.innerHTML=deptOptions(keep,"No department");
  const chip=d=>`<span class="dchip ${d.external?"ext":""}">${esc(d.name)} <small style="color:var(--muted)">${d.external?"supplier":people.filter(p=>p.dept===d.id).length}</small><button type="button" data-deldept="${esc(d.id)}" aria-label="Remove ${esc(d.name)}">×</button></span>`;
  $("#d-chips").innerHTML=internal().map(chip).join("")+(externals().length?`<span style="flex-basis:100%;font-size:12px;font-weight:800;color:var(--muted);margin-top:4px">External suppliers</span>`+externals().map(chip).join(""):"")||`<span class="note">No departments yet.</span>`;
}

/* ---------- NUDGES (admin) ---------- */
function renderNudges(){
  const sel=$("#n-who");
  if(!nudgeFor||!people.find(p=>p.id===nudgeFor)){const withWork=people.find(p=>actions.some(a=>isOpen(a)&&ownedBy(a.ownerId,p)));nudgeFor=(withWork||people[0]||{}).id||null}
  sel.innerHTML=people.map(p=>`<option value="${esc(p.id)}" ${p.id===nudgeFor?"selected":""}>${esc(p.name)}${p.dept?" · "+esc(deptName(p.dept)):""}</option>`).join("");
  const p=people.find(x=>x.id===nudgeFor);
  if(!p){$("#n-mail").innerHTML=`<div class="card empty-state">Add people on the People tab to preview their nudges.</div>`;$("#n-chat").innerHTML="";return}
  const mine=actions.filter(a=>isOpen(a)&&ownedBy(a.ownerId,p));
  const wk=new Date(today0().getTime()+WEEK);
  const late=mine.filter(isLate);
  const soon=mine.filter(a=>!isLate(a)&&a.due&&dt(a.due)<=wk);
  const doing=mine.filter(a=>["doing","blocked","waiting"].includes(a.state)&&!late.includes(a)&&!soon.includes(a));
  const todo=mine.filter(a=>a.state==="todo"&&!late.includes(a)&&!soon.includes(a));
  const waiting=p.dept?actions.filter(a=>a.state==="waiting"&&a.waitingOn===p.dept):[];
  const nexts=projects.filter(x=>x.stage<5&&ownedBy(x.nextOwner,p));
  const assisting=actions.filter(a=>isOpen(a)&&helpersOf(a).includes(p.id)&&a.ownerId!==p.id);
  const li=a=>`<li>${esc(a.text)}<small>${esc(projOf(a)?.title||"")}${a.due?" · "+(isLate(a)?"date passed ":"due ")+fmtDate(a.due):""}${a.state==="blocked"?" · blocked"+(blockedBy(a)?" by "+esc(blockedBy(a)):""):""}${a.state==="waiting"?" · "+esc(waitLabel(a).toLowerCase()):""}</small></li>`;
  const sec=(cls,title,list,fn=li)=>list.length?`<div class="mail-sec ${cls}"><h4>${title} (${list.length})</h4><ul>${list.slice(0,5).map(fn).join("")}</ul></div>`:"";
  const first=p.name.split(" ")[0];
  $("#n-mail").innerHTML=`<div class="mail">
    <div class="mail-meta"><div><b>From</b> <span>Conveyor Belt</span></div><div><b>To</b> <span>${esc(p.name)}${p.email?" &lt;"+esc(p.email)+"&gt;":""}</span></div><div><b>Subject</b> Your week on the belt: ${mine.length} open${late.length?`, ${late.length} past their date`:""}${nexts.length?`, ${nexts.length} next step${nexts.length>1?"s":""} with you`:""}</div></div>
    <div class="mail-top">${LOGO_SVG}<h3>Morning ${esc(first)}, here's your week</h3></div>
    <div class="mail-body">
      ${mine.length||waiting.length||nexts.length||assisting.length?"":`<p>Nothing on your plate this week. Enjoy it, or grab something unclaimed.</p>`}
      ${sec("soon","You own the next step on",nexts,x=>`<li>${esc(x.nextStep)}<small>${esc(x.title)}${x.nextBy?" · by "+fmtDate(x.nextBy):""}</small></li>`)}
      ${sec("late","Date passed: revise or close",late)}${sec("soon","Due in the next 7 days",soon)}${sec("doing","In progress",doing)}${sec("wait",`Waiting on ${esc(deptName(p.dept)||"your team")}, anyone can pick these up`,waiting)}${sec("todo","Still to start",todo)}${sec("doing","Helping with",assisting,a=>`<li>${esc(a.text)}<small>${esc(projOf(a)?.title||"")} · owner ${esc(nm(a.ownerId)||"unclaimed")}${a.due?" · due "+fmtDate(a.due):""}</small></li>`)}
      <div><span class="btn btn-o">Open my lanes</span></div>
      <p class="mail-foot">Sent every Monday at 8am to everyone with open actions or a next step. Change what you get from your profile.</p>
    </div></div>`;
  const recent=mine.slice().sort((a,b)=>Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0))[0];
  const w=waiting[0];
  const card=(head,sub,a,by,btns)=>`<div class="chatmsg"><span class="chatav">CB</span><div><div class="chatname">Conveyor Belt<span>App</span><small>Now</small></div>
    <div class="chatcard"><header><b>${head}</b><span>${sub}</span></header><div class="kv"><div><span>Action</span>${esc(a.text)}</div><div><span>Initiative</span>${esc(projOf(a)?.title||"")}</div><div><span>Deadline</span>${a.due?fmtDate(a.due,true):"Not set"}</div>${by?`<div><span>From</span>${esc(by)}</div>`:""}</div><div class="cbtns">${btns.map(b=>`<span>${b}</span>`).join("")}</div></div></div></div>`;
  $("#n-chat").innerHTML=`<div class="chatwrap">${recent?card("👋 You've been assigned an action",`Hi ${esc(first)}, this one's yours now`,recent,recent.updatedBy?nm(recent.updatedBy):"",["Start it","Open on the belt"]):""}${w?card(`🔁 Handed to ${esc(deptName(p.dept))}`,"Anyone in the team can take it",w,w.updatedBy?nm(w.updatedBy):"",["Take it","Open on the belt"]):""}${!recent&&!w?`<p class="note">${esc(first)} has nothing assigned yet, so there's no card to show.</p>`:""}</div>`;
}

/* ---------- routing + render ---------- */
function renderRoles(){
  document.querySelectorAll("[data-admin]").forEach(a=>a.hidden=!isAdmin());
  const mp=personFor(me);
  $("#who").textContent=(mp?mp.name:"Solution Factory")+(mp?.dept?" · "+deptName(mp.dept):"")+" · "+ROLES[R()];
}
function setView(v){if(v==="timeline")v="roadmap";view=VIEWS.includes(v)?v:"week";if(ADMIN_VIEWS.includes(view)&&!isAdmin())view="week";document.querySelectorAll("[data-v]").forEach(s=>s.hidden=s.dataset.v!==view);document.querySelectorAll(".tabs a").forEach(a=>a.setAttribute("aria-current",a.dataset.view===view?"page":"false"));render()}
function render(){
  renderRoles();
  if(ADMIN_VIEWS.includes(view)&&!isAdmin()){setView("week");return}
  renderFilters();
  const f=document.activeElement;const qa=f&&f.dataset&&f.dataset.quickadd;const qaVal=qa?f.value:"";
  const qd={};document.querySelectorAll("[data-quickdue]").forEach(el=>{if(el.value)qd[el.dataset.quickdue]=el.value});
  ({week:renderWeek,roadmap:renderRoadmap,belt:renderBelt,lanes:renderLanes,people:renderPeople,nudges:renderNudges})[view]();
  for(const k in qd){const el=document.querySelector(`[data-quickdue="${CSS.escape(k)}"]`);if(el)el.value=qd[k]}
  if(qa){const el=document.querySelector(`[data-quickadd="${CSS.escape(qa)}"]`);if(el){el.value=qaVal;el.focus()}}
  if(openId&&!editing)renderDrawer();
}
on(window,"hashchange",()=>setView(location.hash.slice(1)));

/* ---------- drawer ---------- */
function openDrawer(id,aid,edit){openId=id;editing=!!edit;pickedOwner=null;assigning=null;helping=null;blockingId=null;editingAct=null;handing=null;flashAct=aid||null;renderDrawer();$("#scrim").classList.add("on");$("#drawer").classList.add("on");setTimeout(()=>{const el=aid&&document.getElementById("act-"+aid);if(el)el.scrollIntoView({block:"center"});else if(edit&&$("#f [name=title]")){$("#f [name=title]").focus();$("#f [name=title]").select()}else $("#drawer .x")&&$("#drawer .x").focus()},80)}
function closeDrawer(){openId=null;editing=false;assigning=null;helping=null;blockingId=null;editingAct=null;handing=null;flashAct=null;$("#scrim").classList.remove("on");$("#drawer").classList.remove("on")}
function renderDrawer(){
  const p=projects.find(x=>x.id===openId);if(!p){closeDrawer();return}
  const keep=document.activeElement&&document.activeElement.id;const val=$("#newact")?$("#newact").value:"";const dueVal=$("#newdue")?$("#newdue").value:"";const noteVal=$("#note-in")?$("#note-in").value:"";
  $("#d-head").innerHTML=`<span class="sub">${esc(p.stream||"Initiative")}${p.region?" · "+esc(REGIONS[p.region]):""}</span><h2 id="d-title">${esc(p.title)}</h2><button class="x" type="button" aria-label="Close">×</button>`;
  $("#d-body").innerHTML=editing?formHTML(p):viewHTML(p);
  if($("#newact"))$("#newact").value=val;if($("#newdue"))$("#newdue").value=dueVal;if($("#note-in"))$("#note-in").value=noteVal;
  if(keep&&document.getElementById(keep))document.getElementById(keep).focus();
}
function actRow(a){
  const st=a.state||"todo";const ed=canEditAct(a),mg=canManageAct(a);
  if(editingAct===a.id)return `<li class="act ${st}" id="act-${esc(a.id)}"><div class="a-edit"><input id="act-edit" value="${esc(a.text)}" maxlength="160" aria-label="Action text"><input id="act-due" type="date" value="${esc(a.due||"")}" aria-label="Deadline">${a.ownerId?"":`<select id="act-dept" aria-label="Department" style="width:auto">${deptOptions(a.dept,"Any department")}</select>`}<button class="btn btn-o btn-s" type="button" data-act="save-act" data-aid="${esc(a.id)}">Save</button><button class="btn btn-g btn-s" type="button" data-act="cancel-act">Cancel</button></div></li>`;
  return `<li class="act ${st} ${flashAct===a.id?"flash":""}" id="act-${esc(a.id)}">
    <button class="a-state ${st}" type="button" data-cycle="${esc(a.id)}" ${ed?"":"disabled"} title="${ed?"Click to move on: To do → Doing → Done":"Only the owner or a helper can move this"}">${ASTATE[st]}</button>
    <span class="a-text">${esc(a.text)}</span>
    <div class="a-meta"><span class="av ${a.ownerId?"":"open"}">${esc(initials(leadOf(a)))}</span>${helperAvs(a)}<span>${esc(leadOf(a))}</span>${helperNames(a)}${dtag(effDept(a))}${st==="waiting"?`<span class="pill waiting">${esc(waitLabel(a))}</span>`:""}${dlChip(a)}<span class="upd ${staleAct(a)?"stale":""}">· ${esc(ago(a.updatedAt))}</span>
      ${canClaim(a)&&me?`<button class="lnk" type="button" data-act="claim-act" data-aid="${esc(a.id)}">Take it</button>`:""}
      ${ed||mg?`<button class="lnk" type="button" data-act="assign" data-aid="${esc(a.id)}">Assign</button><button class="lnk" type="button" data-act="helpers" data-aid="${esc(a.id)}">Helpers${helpersOf(a).length?" ("+helpersOf(a).length+")":""}</button>`:""}
      ${ed&&st!=="done"&&st!=="waiting"&&depts.length?`<button class="lnk" type="button" data-act="handoff" data-aid="${esc(a.id)}">Hand off / waiting on</button>`:""}
${ed&&st!=="done"?`<button class="lnk red" type="button" data-act="block" data-aid="${esc(a.id)}">${st==="blocked"?"Edit blocker":"Mark blocked"}</button>`:""}
      ${ed?`<button class="lnk" type="button" data-act="edit-act" data-aid="${esc(a.id)}">Edit</button>`:""}
      ${mg?`<button class="lnk red" type="button" data-act="del-act" data-aid="${esc(a.id)}">Remove</button>`:""}
    </div>
    ${st==="blocked"&&blockingId!==a.id?`<div class="a-blocked">${readyToUnblock(a)?`<div class="ready">✓ Everything it was waiting on is done. ${ed?`<button class="btn btn-n btn-s" type="button" data-act="unblock" data-aid="${esc(a.id)}">Unblock it</button>`:""}</div>`:`<b>⛔ Blocked</b>`}${blockersOf(a).length?`<ul class="blist">${blockersOf(a).map(b=>`<li class="${isOpen(b)?"":"bdone"}"><button type="button" class="lnk" data-goto="${esc(b.id)}">${esc(b.text)}</button> <span class="note">${esc(projOf(b)?.title||"")} · ${esc(nm(b.ownerId)||"Unclaimed")}${b.due?" · due "+fmtDate(b.due):""}</span> <span class="pill ${b.state}">${ASTATE[b.state]}</span></li>`).join("")}</ul>`:""}${a.blockedReason?`<div>${esc(a.blockedReason)}</div>`:""}${!blockersOf(a).length&&!a.blockedReason?`<span class="note">No reason given${ed?". Click Edit blocker to add one":""}</span>`:""}</div>`:""}
    ${isOpen(a)&&blocking(a).length&&blockingId!==a.id?`<div class="a-holding">⛓ Holding up: ${blocking(a).map(d=>`<button type="button" class="lnk" data-goto="${esc(d.id)}">${esc(d.text)}</button>`).join(", ")}</div>`:""}
    ${blockingId===a.id?`<div class="a-edit picker" style="display:grid;gap:8px">
      <b style="font-size:13px">Blocked by other actions</b>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${blockDraft.map(id=>{const b=actions.find(x=>x.id===id);return b?`<span class="dchip">${esc(b.text)}<button type="button" data-unblocker="${esc(id)}" aria-label="Remove">×</button></span>`:""}).join("")||`<span class="note">None yet</span>`}</div>
      <input id="blocker-in" autocomplete="off" placeholder="Search actions on any initiative" aria-label="Find the action it's waiting on"><div class="hits" id="bhits"></div>
      <b style="font-size:13px">Anything else? (optional)</b>
      <input id="block-in" maxlength="160" value="${esc(a.blockedReason||"")}" placeholder="e.g. Waiting on Permutive logins from Stuart" aria-label="Other reason">
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-o btn-s" type="button" data-act="do-block" data-aid="${esc(a.id)}">${st==="blocked"?"Save":"Mark blocked"}</button>${st==="blocked"?`<button class="btn btn-g btn-s" type="button" data-act="unblock" data-aid="${esc(a.id)}">Unblock</button>`:""}<button class="btn btn-g btn-s" type="button" data-act="cancel-block">Cancel</button></div>
      <span class="note">When everything it's waiting on is done, it unblocks itself.</span></div>`:""}
    ${assigning===a.id?`<div class="a-edit picker"><input id="assign-in" autocomplete="off" placeholder="Search anyone, any department" aria-label="Assign to"><div class="hits" id="hits"></div></div>`:""}
    ${helping===a.id?`<div class="a-edit picker" style="display:grid;gap:8px"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><b style="font-size:13px">Helping:</b>${helpersOf(a).map(h=>`<span class="dchip">${esc(nm(h))}<button type="button" data-unhelp="${esc(h)}" data-aid="${esc(a.id)}" aria-label="Remove ${esc(nm(h))}">×</button></span>`).join("")||`<span class="note">Nobody yet</span>`}</div><input id="helper-in" autocomplete="off" placeholder="Add a helper: search anyone" aria-label="Add a helper"><div class="hits" id="hits"></div><span class="note">${esc(nm(a.ownerId)||"The owner")} stays responsible and gets the reminders. Helpers see it under Mine and can update it.</span></div>`:""}
    ${handing===a.id?`<div class="a-edit"><span style="font-size:13px;font-weight:700">Waiting on</span><select id="hand-dept" aria-label="Team or supplier" style="width:auto">${deptOptions(internal().find(d=>d.id!==effDept(a))?.id,"",true)}</select><label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="hand-keep" style="width:18px;height:18px;min-height:0" ${a.ownerId?"checked":""}> Keep my name on it</label><button class="btn btn-o btn-s" type="button" data-act="do-handoff" data-aid="${esc(a.id)}">Confirm</button><button class="btn btn-g btn-s" type="button" data-act="cancel-hand">Cancel</button><span class="note" style="flex-basis:100%">Hand to another team (they get a nudge until someone takes it) or mark it as waiting on a supplier like Naviga. Keep your name on it if you're still chasing.</span></div>`:""}
  </li>`;
}
function viewHTML(p){
  const st=p.status||"ok";const pe=canEditProj(p);const ro=pe?"":"disabled";const list=actsOf(p.id);const log=(p.log||[]).slice(0,20);const ld=launchDate(p);
  return `
  ${!p.ownerId?`<div class="claim"><span><b>No lead yet.</b> ${p.suggestedLead?`Suggested: ${esc(p.suggestedLead)}.`:""}</span>${canLead()&&me?`<button class="btn btn-n" type="button" data-act="claim">Lead it</button>`:""}</div>`:""}
  <div class="blk"><h3>Next step</h3>${nextLine(p)}</div>
  <div class="blk"><h3>Stage</h3><div class="track">${STAGES.map((s,i)=>`<button type="button" data-stage="${i}" class="${i<p.stage?"done":i===(p.stage|0)?"now":""}" ${ro} aria-pressed="${i===(p.stage|0)}">${s}</button>`).join("")}</div></div>
  <div class="blk"><h3>Action points</h3>${progress(list)}
    <ul class="acts">${list.map(actRow).join("")||`<li style="color:var(--muted)">No actions yet.</li>`}</ul>
    ${canAdd()?`<div class="addrow"><input id="newact" maxlength="160" placeholder="Add an action point" aria-label="New action point"><input id="newdue" type="date" aria-label="Deadline (optional)" title="Deadline (optional)"><button class="btn btn-o" type="button" data-act="add-act">Add</button></div>`:""}
  </div>
  <div class="blk"><h3>Overall status</h3><div class="seg">${Object.entries(STATUS).map(([k,l])=>`<button type="button" data-status="${k}" aria-pressed="${st===k}" ${ro}>${l}</button>`).join("")}</div></div>
  <div class="facts"><div class="fact"><span>Lead</span><b>${esc(leadOf(p))}</b></div><div class="fact"><span>${p.due?"Target launch":"Projected launch"}</span><b>${ld?esc(ld.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})):"Not set"} ${revTag(p)}</b></div><div class="fact"><span>Region</span><b>${esc(REGIONS[p.region]||"Not set")}</b></div><div class="fact"><span>Teams involved</span><b>${esc([...new Set(list.flatMap(a=>[effDept(a),a.waitingOn]).filter(Boolean))].map(deptName).join(", ")||"–")}</b></div></div>
  ${p.summary?`<div class="blk"><h3>What it is</h3><p>${esc(p.summary)}</p></div>`:""}
  ${p.blockers?`<div class="blk warn"><h3>What's holding it up</h3><p>${esc(p.blockers)}</p></div>`:""}
  ${p.link&&/^https?:\/\//.test(p.link)?`<div class="blk"><h3>Link</h3><p><a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.link)}</a></p></div>`:""}
  <div class="blk"><h3>Updates</h3>
    ${canAdd()?`<textarea id="note-in" placeholder="A quick note on where it's at" aria-label="New update"></textarea><div class="actions"><button class="btn btn-o" type="button" data-act="post">Post update</button><span class="err" id="d-err"></span></div>`:""}
    ${log.length?`<ul class="log">${log.map(l=>`<li><span class="av">${esc(initials(nm(l.by)))}</span><div><div class="meta">${esc(nm(l.by)||"Someone")} · ${esc(ago(l.at))}</div><p>${esc(l.text)}</p></div></li>`).join("")}</ul>`:`<p style="color:var(--muted)">No updates yet.</p>`}
  </div>
  ${pe?`<div class="actions"><button class="btn btn-g" type="button" data-act="edit">Edit details and next step</button>${isAdmin()?`<button class="lnk red" type="button" data-act="del-proj">Remove initiative</button>`:""}</div>`:""}`;
}
function formHTML(p){
  return `<form class="form" id="f" novalidate>
    <label>Initiative<input name="title" required maxlength="90" value="${esc(p.title)}"></label>
    <div class="row2"><label>Workstream<input name="stream" maxlength="40" value="${esc(p.stream||"")}" placeholder="e.g. Gemstone, Sales tools"></label><label>Region<select name="region"><option value="">Not set</option>${Object.entries(REGIONS).map(([k,l])=>`<option value="${k}" ${p.region===k?"selected":""}>${l}</option>`).join("")}</select></label></div>
    <label class="picker">Lead<input id="owner-in" autocomplete="off" placeholder="Search anyone" value="${esc(p.ownerId?nm(p.ownerId):"")}"><div class="hits" id="hits"></div></label>
    <fieldset style="border:1.5px solid var(--orange);border-radius:12px;padding:12px 14px;display:grid;gap:10px;margin:0"><legend style="font-weight:800;color:var(--orange-ink);font-size:13px;padding:0 6px">Next step</legend>
      <label>What needs to happen next<input name="nextStep" maxlength="140" value="${esc(p.nextStep||"")}" placeholder="e.g. Confirm the Naviga release slot"></label>
      <div class="row2"><label>Who<select name="nextOwner">${peopleOptions(p.nextOwner,"Not set")}</select></label><label>By when<input type="date" name="nextBy" value="${esc(p.nextBy||"")}"></label></div>
    </fieldset>
    <div class="row2"><label>Target launch<input type="date" name="due" value="${esc(p.due||"")}"></label><label>If the date's moving, why?<input name="reason" maxlength="100" placeholder="e.g. Naviga release pushed"></label></div>
    <label>What it is<textarea name="summary" maxlength="1200">${esc(p.summary||"")}</textarea></label>
    <label>What's holding it up<textarea name="blockers" maxlength="600" placeholder="Leave empty if nothing's in the way">${esc(p.blockers||"")}</textarea></label>
    <label>Link (optional)<input name="link" type="url" placeholder="https://" value="${esc(p.link||"")}"></label>
    <div class="actions"><button class="btn btn-o" type="submit">Save changes</button><button class="btn btn-g" type="button" data-act="cancel">Cancel</button><span class="err" id="d-err"></span></div>
  </form>`;
}

/* ---------- writes ---------- */
let busy=false;
async function write(fn,okMsg){
  if(!db){toast("Saving isn't available here");return false}
  if(busy)return false;busy=true;
  try{const r=await fn();if(okMsg)toast(okMsg);queueReload("projects");queueReload("actions");queueReload("updates");queueReload("milestones");queueReload("people");queueReload("departments");queueReload("absences");queueReload("decisions");queueReload("settings");return r||true}
  catch(e){console.error(e);toast(e&&e.code==="forbidden"?"You don't have permission to change that.":"Couldn't save. Try again.");return false}
  finally{busy=false}
}
const nowIso=()=>new Date().toISOString();
const stamp=()=>({updatedAt:nowIso(),updatedBy:me||null});
async function patchP(p,data,logText,msg){const body={...data,...stamp()};return write(async()=>{if(Object.keys(data).length)await db.doc("projects/"+p.id).update(body);if(logText)await db.collection("updates").add({projectId:p.id,text:logText,by:me})},msg)}
async function patchA(a,data,msg){return write(()=>db.doc("actions/"+a.id).update({...data,...stamp()}),msg)}
async function unblockDependents(a){for(const d of blocking(a)){const rest=(d.blockedBy||[]).filter(id=>id!==a.id&&actions.find(x=>x.id===id&&isOpen(x)));if(rest.length||d.blockedReason)continue;try{await db.doc("actions/"+d.id).update({state:"todo",blockedBy:[],...stamp()})}catch(e){/* no permission: the panel shows it as ready to unblock */}}}
async function cycle(a){const n=NEXT[a.state||"todo"];const ok=await patchA(a,{state:n,...(a.state==="blocked"?{blockedReason:"",blockedBy:[]}:{}),...(n==="done"?{doneAt:nowIso()}:{}),...(a.state==="waiting"?{waitingOn:""}:{})},ASTATE[n]);if(ok&&n==="done")await unblockDependents(a);return ok}
async function setDue(a,v){const data={due:v};if(a.due)data.dateLog=[...(a.dateLog||[]),{from:a.due,to:v,at:nowIso(),by:me||null}].slice(-20);return patchA(a,data,v?"Deadline set for "+fmtDate(v):"Deadline cleared")}
async function addAction(pid,inp,dinp){
  const v=inp.value.trim();if(!v){toast("Type the action first");return}
  const order=Math.max(0,...actsOf(pid).map(a=>a.order||0))+1;
  if(await write(()=>db.collection("actions").add({projectId:pid,text:v,state:"todo",ownerId:me||null,suggestedLead:"",dept:"",waitingOn:"",due:dinp&&dinp.value||"",order,createdAt:nowIso(),...stamp()}),"Action added")){inp.value="";if(dinp)dinp.value="";inp.focus()}
}
async function saveForm(form){
  const fd=new FormData(form);const title=(fd.get("title")||"").trim();
  if(!title){$("#d-err").textContent="Give it a name first.";return}
  const p=projects.find(x=>x.id===openId);
  const data={title,stream:(fd.get("stream")||"").trim(),region:fd.get("region")||"",due:fd.get("due")||"",summary:(fd.get("summary")||"").trim(),blockers:(fd.get("blockers")||"").trim(),link:(fd.get("link")||"").trim(),nextStep:(fd.get("nextStep")||"").trim(),nextOwner:fd.get("nextOwner")||"",nextBy:fd.get("nextBy")||""};
  if(pickedOwner)data.ownerId=pickedOwner;
  const reason=(fd.get("reason")||"").trim();let logText="Updated the details";
  if(p.due&&data.due!==p.due){data.dateLog=[...(p.dateLog||[]),{from:p.due,to:data.due,at:nowIso(),by:me||null,reason}].slice(-20);logText=`Target moved ${fmtDate(p.due)} → ${fmtDate(data.due)||"none"}${reason?": "+reason:""}`}
  else if(data.nextStep&&data.nextStep!==p.nextStep)logText="Next step: "+data.nextStep;
  if(await patchP(p,data,logText,"Saved")){editing=false;renderDrawer()}
}

/* ---------- events ---------- */
on(document,"click",async e=>{
  const t=e.target;
  const chip=t.closest("[data-who]");if(chip){who=chip.dataset.who;render();return}
  const gb=t.closest("[data-group]");if(gb){groupBy=gb.dataset.group;render();return}
  const wb=t.closest("[data-win]");if(wb){win=+wb.dataset.win;render();return}
  if(t.closest("[data-newinit]")){const order=Math.max(0,...projects.map(p=>p.order||0))+1;const at=nowIso();const ref=await write(()=>db.collection("projects").add({title:"New initiative",stage:0,status:"ok",order,region:"",stageLog:[{stage:0,at}],createdAt:at,...stamp()}),"Initiative added");if(ref&&ref.id){pendingOpen=ref.id;if(projects.find(p=>p.id===ref.id)){pendingOpen=null;openDrawer(ref.id,null,true)}}return}
  if(t.closest("[data-review]")){if(await write(()=>db.doc("meta/review").set({at:nowIso(),by:me||null}),"Review marked done"))render();return}
  if(t.closest(".x")||t===$("#scrim")){closeDrawer();return}
  const hit=t.closest("[data-uid]");
  if(hit&&helping){const a=actions.find(x=>x.id===helping);const id=hit.dataset.uid;if(a&&id!==a.ownerId&&!helpersOf(a).includes(id))await patchA(a,{helpers:[...helpersOf(a),id]},hit.dataset.name+" is helping");$("#helper-in")&&($("#helper-in").value="");renderDrawer();if($("#helper-in"))$("#helper-in").focus();return}
  const unh=t.closest("[data-unhelp]");if(unh){const a=actions.find(x=>x.id===unh.dataset.aid);if(a)await patchA(a,{helpers:helpersOf(a).filter(h=>h!==unh.dataset.unhelp)},"Removed");renderDrawer();return}
  if(hit){if(assigning){const a=actions.find(x=>x.id===assigning);assigning=null;if(a)await patchA(a,{ownerId:hit.dataset.uid,helpers:helpersOf(a).filter(h=>h!==hit.dataset.uid),...(a.state==="waiting"&&!deptById(a.waitingOn)?.external?{state:"todo",waitingOn:""}:{})},"Assigned to "+hit.dataset.name);renderDrawer()}else{pickedOwner=hit.dataset.uid;$("#owner-in").value=hit.dataset.name;$("#hits").classList.remove("on")}return}
  const bh=t.closest("[data-blocker]");if(bh){if(!blockDraft.includes(bh.dataset.blocker))blockDraft.push(bh.dataset.blocker);const keep=$("#block-in")?.value;renderDrawer();if($("#block-in"))$("#block-in").value=keep||"";$("#blocker-in")?.focus();searchBlockers("");return}
  const ub=t.closest("[data-unblocker]");if(ub){blockDraft=blockDraft.filter(x=>x!==ub.dataset.unblocker);const keep=$("#block-in")?.value;renderDrawer();if($("#block-in"))$("#block-in").value=keep||"";return}
  const gt=t.closest("[data-goto]");if(gt){const b=actions.find(x=>x.id===gt.dataset.goto);if(b){closeDrawer();openDrawer(b.projectId,b.id)}return}
  const cy=t.closest("[data-cycle]");if(cy){const a=actions.find(x=>x.id===cy.dataset.cycle);if(a&&canEditAct(a))await cycle(a);return}
  const tk=t.closest("[data-take]");if(tk){const a=actions.find(x=>x.id===tk.dataset.take);if(a&&me)await patchA(a,{ownerId:me,...(a.state==="waiting"&&!deptById(a.waitingOn)?.external?{state:"todo",waitingOn:""}:{})},"It's yours");return}
  const addto=t.closest("[data-addto]");if(addto){const inp=document.querySelector(`[data-quickadd="${CSS.escape(addto.dataset.addto)}"]`);if(inp)await addAction(addto.dataset.addto,inp,document.querySelector(`[data-quickdue="${CSS.escape(addto.dataset.addto)}"]`));return}
  for(const [attr,col] of [["delmile","milestones"],["delperson","people"],["deldept","departments"],["delabs","absences"],["deldec","decisions"]]){
    const b=t.closest(`[data-${attr}]`);if(b){if(b.dataset.sure){await write(()=>db.doc(col+"/"+b.dataset[attr]).delete(),"Removed")}else{b.dataset.sure="1";if(attr==="deldept"){b.textContent="?";toast("Click again to remove it")}else b.textContent="Sure?"}return}
  }
  if(!openId){const c=t.closest("[data-pid]");if(c){openDrawer(c.dataset.pid,c.dataset.aid);return}}
  const p=projects.find(x=>x.id===openId);
  const sb=t.closest("[data-stage]");if(sb&&p&&canEditProj(p)){const s=+sb.dataset.stage;if(s!==p.stage)await patchP(p,{stage:s,stageLog:[...(p.stageLog||[{stage:p.stage|0,at:p.createdAt||nowIso()}]),{stage:s,at:nowIso()}].slice(-30)},`Moved to ${STAGES[s]}`,`Moved to ${STAGES[s]}`);return}
  const ss=t.closest("[data-status]");if(ss&&p&&canEditProj(p)){const s=ss.dataset.status;if(s!==p.status)await patchP(p,{status:s},`Status: ${STATUS[s]}`,STATUS[s]);return}
  const act=t.closest("[data-act]");if(!act)return;
  const k=act.dataset.act;const a=act.dataset.aid?actions.find(x=>x.id===act.dataset.aid):null;
  if(k==="edit"){editing=true;renderDrawer();return}
  if(k==="cancel"){editing=false;renderDrawer();return}
  if(k==="del-proj"&&p){if(act.dataset.sure){const ok=await write(()=>db.doc("projects/"+p.id).delete(),"Initiative removed");if(ok)closeDrawer()}else{act.dataset.sure="1";act.textContent="Sure? Its actions stay in the data. Click again"}return}
  if(k==="claim"&&p){await patchP(p,{ownerId:me},"Took the lead","You're leading this");return}
  if(k==="claim-act"&&a){await patchA(a,{ownerId:me,...(a.state==="waiting"&&!deptById(a.waitingOn)?.external?{state:"todo",waitingOn:""}:{})},"It's yours");return}
  if(k==="block"&&a){blockDraft=Array.isArray(a.blockedBy)?[...a.blockedBy]:[];blockingId=blockingId===a.id?null:a.id;assigning=null;helping=null;handing=null;editingAct=null;renderDrawer();$("#blocker-in")&&$("#blocker-in").focus();searchBlockers("");return}
  if(k==="cancel-block"){blockingId=null;renderDrawer();return}
  if(k==="do-block"&&a){const r=($("#block-in")?.value||"").trim();const by=[...blockDraft];blockingId=null;await patchA(a,{state:"blocked",blockedReason:r,blockedBy:by},"Marked blocked");renderDrawer();return}
  if(k==="unblock"&&a){blockingId=null;await patchA(a,{state:"doing",blockedReason:"",blockedBy:[]},"Unblocked");renderDrawer();return}
  if(k==="helpers"&&a){helping=helping===a.id?null:a.id;assigning=null;editingAct=null;handing=null;renderDrawer();if($("#helper-in")){$("#helper-in").focus();searchPeople("")}return}
  if(k==="assign"&&a){assigning=assigning===a.id?null:a.id;helping=null;editingAct=null;handing=null;renderDrawer();if($("#assign-in")){$("#assign-in").focus();searchPeople("")}return}
  if(k==="handoff"&&a){handing=handing===a.id?null:a.id;assigning=null;editingAct=null;renderDrawer();return}
  if(k==="cancel-hand"){handing=null;renderDrawer();return}
  if(k==="do-handoff"&&a){const d=$("#hand-dept").value;if(!d)return;const keepMe=$("#hand-keep").checked;const ext=deptById(d)?.external;handing=null;await patchA(a,{state:"waiting",waitingOn:d,...(keepMe?{}:{ownerId:null,dept:ext?a.dept||effDept(a):d})},ext?"Waiting on "+deptName(d):"Handed to "+deptName(d));renderDrawer();return}
  if(k==="edit-act"&&a){editingAct=a.id;assigning=null;handing=null;renderDrawer();$("#act-edit")&&$("#act-edit").focus();return}
  if(k==="cancel-act"){editingAct=null;renderDrawer();return}
  if(k==="save-act"&&a){const v=$("#act-edit").value.trim(),d=$("#act-due").value||"";const ch={};if(v&&v!==a.text)ch.text=v;if(d!==(a.due||"")){ch.due=d;if(a.due)ch.dateLog=[...(a.dateLog||[]),{from:a.due,to:d,at:nowIso(),by:me||null}].slice(-20)}if($("#act-dept")&&$("#act-dept").value!==(a.dept||""))ch.dept=$("#act-dept").value;if(Object.keys(ch).length)await patchA(a,ch,"Saved");editingAct=null;renderDrawer();return}
  if(k==="del-act"&&a){if(act.dataset.sure){await write(()=>db.doc("actions/"+a.id).delete(),"Removed")}else{act.dataset.sure="1";act.textContent="Sure? Click again"}return}
  if(k==="add-act"&&p){await addAction(p.id,$("#newact"),$("#newdue"));return}
  if(k==="post"&&p){const v=$("#note-in").value.trim();if(!v){$("#d-err").textContent="Write something first.";return}if(await patchP(p,{},v,"Update posted")&&$("#note-in"))$("#note-in").value="";return}
});
on(document,"submit",async e=>{
  if(e.target.matches("[data-native]"))return;
  e.preventDefault();const f=e.target;const fd=new FormData(f);
  if(f.id==="f")saveForm(f);
  if(f.id==="t-mform"){const label=(fd.get("label")||"").trim(),date=fd.get("date")||"";if(!label||!date){toast("Add a name and a date");return}if(await write(()=>db.collection("milestones").add({label,date,kind:fd.get("kind")||"milestone",createdAt:nowIso(),...stamp()}),"Added"))f.reset()}
  if(f.id==="p-form"){const name=(fd.get("name")||"").trim();if(!name){toast("Add a name");return}if(await write(()=>db.collection("people").add({name,email:(fd.get("email")||"").trim(),dept:fd.get("dept")||"",role:fd.get("role")||"member",createdAt:nowIso(),...stamp()}),name+" added"))f.reset()}
  if(f.id==="d-form"){const name=(fd.get("name")||"").trim();if(!name)return;if(await write(()=>db.collection("departments").add({name,external:!!fd.get("external"),order:depts.length+1,createdAt:nowIso(),...stamp()}),name+" added"))f.reset()}
  if(f.id==="abs-form"){const pid=fd.get("pid"),from=fd.get("from"),to=fd.get("to")||fd.get("from");if(!pid||!from){toast("Pick a person and a start date");return}if(to<from){toast("The end date is before the start");return}if(await write(()=>db.collection("absences").add({personId:pid,from,to,note:(fd.get("note")||"").trim(),createdAt:nowIso(),...stamp()}),"Time off added"))f.reset()}
  if(f.id==="dec-form"){const text=(fd.get("text")||"").trim();if(!text)return;if(await write(()=>db.collection("decisions").add({text,projectId:fd.get("pid")||"",at:nowIso(),by:me||null}),"Decision recorded"))f.reset()}
});
on(document,"input",e=>{
  if(e.target.matches("[data-search]")){q=e.target.value.trim().toLowerCase();render();return}
  if(e.target.id==="owner-in"){pickedOwner=null;searchPeople(e.target.value)}
  if(e.target.id==="assign-in"||e.target.id==="helper-in")searchPeople(e.target.value);
  if(e.target.id==="blocker-in")searchBlockers(e.target.value);
});
on(document,"change",async e=>{
  const t=e.target;
  if(t.id==="showdone"){showDone=t.checked;render();return}
  if(t.matches("[data-deptf]")){deptF=t.value||"all";render();return}
  if(t.matches("[data-regionf]")){regionF=t.value;render();return}
    if(t.id==="n-who"){nudgeFor=t.value;render();return}
  if(t.dataset.rule){const w={...((meta.assumptions||{}).weeks||{})};const v=t.value===""?null:+t.value;if(v)w[t.dataset.rule]=v;else delete w[t.dataset.rule];await write(()=>db.doc("meta/assumptions").set({weeks:w,...stamp()}),"Rule of thumb saved");return}
  if(t.dataset.person){await write(()=>db.doc("people/"+t.dataset.person).update({[t.dataset.pfield]:t.value,...stamp()}),"Saved");return}
  const d=t.dataset.due;
  if(d){const a=actions.find(x=>x.id===d);const v=t.value||"";if(a&&canEditAct(a)&&v!==(a.due||""))await setDue(a,v)}
});
on(document,"focusin",e=>{if(e.target.id==="owner-in")searchPeople(e.target.value);if(e.target.id==="blocker-in")searchBlockers(e.target.value)});
on(document,"keydown",e=>{
  if(e.key==="Escape"&&openId){closeDrawer();return}
  if(e.key==="Enter"&&e.target.id==="newact"){e.preventDefault();const p=projects.find(x=>x.id===openId);if(p)addAction(p.id,e.target,$("#newdue"));return}
  if(e.key==="Enter"&&e.target.dataset&&e.target.dataset.quickadd){e.preventDefault();addAction(e.target.dataset.quickadd,e.target,document.querySelector(`[data-quickdue="${CSS.escape(e.target.dataset.quickadd)}"]`));return}
  if(e.key==="Enter"&&e.target.id==="block-in"){e.preventDefault();$('[data-act="do-block"]').click();return}
  if(e.key==="Enter"&&(e.target.id==="act-edit"||e.target.id==="act-due")){e.preventDefault();$('[data-act="save-act"]').click();return}
  if(e.key==="Enter"&&!openId&&e.target.matches("[data-pid][tabindex]"))openDrawer(e.target.dataset.pid,e.target.dataset.aid);
});
function searchBlockers(term){
  const box=$("#bhits");if(!box)return;const t=(term||"").toLowerCase();
  const self=actions.find(z=>z.id===blockingId);
  const list=actions.filter(x=>isOpen(x)&&x.id!==blockingId&&!blockDraft.includes(x.id)&&(!t||`${x.text} ${projOf(x)?.title||""} ${nm(x.ownerId)}`.toLowerCase().includes(t)))
    .sort((x,y)=>(self&&y.projectId===self.projectId?1:0)-(self&&x.projectId===self.projectId?1:0)).slice(0,8);
  box.innerHTML=list.map(x=>`<button type="button" data-blocker="${esc(x.id)}">${esc(x.text)} <small style="color:var(--muted);font-weight:600">· ${esc(projOf(x)?.title||"")} · ${esc(nm(x.ownerId)||"Unclaimed")}</small></button>`).join("");
  box.classList.toggle("on",list.length>0);
}
async function searchPeople(term){
  const box=$("#hits");if(!box)return;
  const t=(term||"").toLowerCase();
  const local=people.filter(p=>!t||`${p.name} ${deptName(p.dept)}`.toLowerCase().includes(t)).slice(0,8).map(p=>({id:personKey(p),name:p.name,sub:deptName(p.dept)}));
  let list=local;
  if(helping){const a=actions.find(x=>x.id===helping);if(a)list=list.filter(h=>!involves(a,h.id))}
  if(!$("#hits"))return;
  box.innerHTML=list.map(h=>`<button type="button" data-uid="${esc(h.id)}" data-name="${esc(h.name)}">${esc(h.name)}${h.sub?` <small style="color:var(--muted);font-weight:600">· ${esc(h.sub)}</small>`:""}</button>`).join("");
  box.classList.toggle("on",list.length>0);
}

/* ---------- start ---------- */
setView(location.hash.slice(1));
const note=$("#note");
function settle(){
  const open=actions.filter(isOpen).length;
  note.textContent=projects.length?`${projects.length} initiative${projects.length===1?"":"s"} on the line, ${open} open action${open===1?"":"s"}, ${people.length} people across ${internal().length} departments. Changes appear live.`:"The belt's empty. Add an initiative to get it moving.";
}
const SETTERS={
  projects:v=>{projects=v.sort((a,b)=>(a.order||0)-(b.order||0))},
  actions:v=>{actions=v},
  updates:v=>{updates=v},
  milestones:v=>{miles=v},
  people:v=>{people=v},
  departments:v=>{depts=v.sort((a,b)=>(a.order||0)-(b.order||0))},
  absences:v=>{absences=v},
  decisions:v=>{decisions=v},
  settings:v=>{meta=Object.fromEntries(v.map(r=>[r.key,r.value||{}]))},
};
function derive(){
  const byProject={};
  for(const u of updates)(byProject[u.projectId]||=[]).push({at:u.createdAt,by:u.by,text:u.text});
  for(const p of projects)p.log=(byProject[p.id]||[]).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
}
function after(){
  derive();settle();
  if(pendingOpen&&projects.find(p=>p.id===pendingOpen)){const id=pendingOpen;pendingOpen=null;openDrawer(id,null,true)}
  render();
}
const pending=new Set();let reloadTimer=null;
function queueReload(table){
  pending.add(table);clearTimeout(reloadTimer);
  reloadTimer=setTimeout(async()=>{
    const tables=[...pending];pending.clear();
    try{const res=await Promise.all(tables.map(t=>db.load(t)));tables.forEach((t,i)=>SETTERS[t](res[i]));after()}
    catch(e){console.error(e);note.textContent="The belt stopped updating. Reload the page to reconnect."}
  },150);
}
(async()=>{
  try{const all=await db.loadAll();for(const t in all)SETTERS[t](all[t]);after()}
  catch(e){console.error(e);note.textContent="Couldn't load the belt. Reload the page to try again.";return}
  cleanups.push(db.subscribe(queueReload));
})();

return()=>cleanups.forEach(f=>{try{f()}catch(e){}});
}
