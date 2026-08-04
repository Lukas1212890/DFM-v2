
const KEY='dfm_v2_clean_data';
const uid=()=>crypto.randomUUID();

const defaults={
  drones:[
    {id:uid(),name:'Matrice 4T',model:'DJI Matrice 4T',manufacturer:'DJI',serial:'',status:'Aktivní',careUntil:'',notes:'',batteries:[
      {id:uid(),number:'Baterie 01',serial:'',cycles:0,notes:''},
      {id:uid(),number:'Baterie 02',serial:'',cycles:0,notes:''}
    ],accessories:[
      {id:uid(),name:'RC Plus',category:'Ovladač',serial:'',notes:''},
      {id:uid(),name:'Nabíjecí stanice',category:'Nabíječka',serial:'',notes:''},
      {id:uid(),name:'Přepravní kufr',category:'Kufr',serial:'',notes:''}
    ],accidents:[],claims:[],services:[]},
    {id:uid(),name:'Mavic 3M',model:'DJI Mavic 3 Multispectral',manufacturer:'DJI',serial:'',status:'Aktivní',careUntil:'',notes:'',batteries:[],accessories:[],accidents:[],claims:[],services:[]}
  ],
  pilots:[],flights:[],tasks:[]
};

let state=load();
let view='dashboard';
let selectedDrone=null;
let droneTab='equipment';
let editor={type:null,id:null,droneId:null};

const $=s=>document.querySelector(s);
const content=$('#content');
const sheet=$('#sheet');
const form=$('#sheetForm');
const fields=$('#fields');
const fab=$('#fab');

$('#today').textContent=new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeSheet);
$('#settingsBtn').onclick=renderSettings;
fab.onclick=()=>openCreate();
form.addEventListener('submit',saveForm);

function load(){try{return JSON.parse(localStorage.getItem(KEY))||structuredClone(defaults)}catch{return structuredClone(defaults)}}
function persist(){localStorage.setItem(KEY,JSON.stringify(state))}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function fmtDate(v){if(!v)return 'Neuvedeno';try{return new Intl.DateTimeFormat('cs-CZ').format(new Date(v+'T00:00:00'))}catch{return v}}
function switchView(v){view=v;selectedDrone=null;document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));render()}
function render(){fab.hidden=false;if(view==='dashboard')return dashboard();if(view==='drones')return drones();if(view==='pilots')return collection('pilots');if(view==='flights')return collection('flights');if(view==='tasks')return collection('tasks')}
function dashboard(){
  const batteries=state.drones.reduce((n,d)=>n+d.batteries.length,0);
  const openTasks=state.tasks.filter(t=>!t.done).length;
  content.innerHTML=`<section class="hero"><p class="eyebrow">DFM v2</p><h2>Celá flotila v jednom hangáru</h2><p>Dron je hlavní sestava. Uvnitř má baterie, příslušenství, nehody, reklamace a servisní historii.</p></section>
  <section class="grid stats">
    ${stat('Drony',state.drones.length,'evidovaných')}
    ${stat('Baterie',batteries,'u dronů')}
    ${stat('Piloti',state.pilots.length,'evidovaných')}
    ${stat('Úkoly',openTasks,'otevřených')}
  </section>
  <div class="section-head"><div><p class="eyebrow">Flotila</p><h2>Drony</h2></div><span class="badge">${state.drones.length}</span></div>
  <section class="list">${state.drones.map(droneCard).join('')||empty('Zatím žádný dron.')}</section>
  <div class="section-head"><div><p class="eyebrow">Co řešit</p><h2>Otevřené úkoly</h2></div></div>
  <section class="list">${state.tasks.filter(t=>!t.done).slice(0,4).map(taskCard).join('')||empty('Všechno je hotové.')}</section>`;
  bindDroneCards();bindTaskActions();
}
function stat(a,b,c){return `<article class="card stat"><span>${a}</span><strong>${b}</strong><small>${c}</small></article>`}
function drones(){
  if(selectedDrone)return droneDetail();
  content.innerHTML=`<div class="section-head"><div><p class="eyebrow">Evidence</p><h2>Drony</h2></div><span class="badge">${state.drones.length} položek</span></div>
  <div class="search"><input id="search" placeholder="Hledat dron…"></div><section class="list" id="droneList">${state.drones.map(droneCard).join('')||empty('Přidej první dron tlačítkem +.')}</section>`;
  $('#search').oninput=e=>{const q=e.target.value.toLowerCase();$('#droneList').innerHTML=state.drones.filter(d=>JSON.stringify(d).toLowerCase().includes(q)).map(droneCard).join('')||empty('Nic nenalezeno.');bindDroneCards()};
  bindDroneCards();
}
function droneCard(d){return `<article class="list-item" data-drone="${d.id}"><div class="item-icon">✈</div><div class="item-main"><h3>${esc(d.name)}</h3><div class="meta">${esc(d.model)} · ${d.batteries.length} baterií · ${d.accessories.length} příslušenství</div></div><span class="badge ${d.status==='Aktivní'?'green':d.status==='Servis'?'orange':''}">${esc(d.status)}</span></article>`}
function bindDroneCards(){document.querySelectorAll('[data-drone]').forEach(x=>x.onclick=()=>{selectedDrone=x.dataset.drone;view='drones';droneTab='equipment';droneDetail()})}
function droneDetail(){
  const d=state.drones.find(x=>x.id===selectedDrone);if(!d){selectedDrone=null;return drones()}
  fab.hidden=true;
  content.innerHTML=`<button class="button secondary" id="back">‹ Zpět na drony</button>
  <section class="card detail-hero">
    <div class="detail-row"><div class="detail-icon">✈</div><div><h2>${esc(d.name)}</h2><p>${esc(d.model)}</p></div><span class="badge green">${esc(d.status)}</span></div>
    <div class="toolbar"><button class="button primary" data-edit-drone>Upravit dron</button><button class="button secondary" data-add-equipment>Přidat vybavení</button></div>
  </section>
  <section class="detail-grid">
    ${cell('Výrobce',d.manufacturer||'Neuveden')}
    ${cell('Výrobní číslo',d.serial||'Neuvedeno')}
    ${cell('DJI Care',d.careUntil?fmtDate(d.careUntil):'Neuvedeno')}
    ${cell('Poznámka',d.notes||'Bez poznámky')}
  </section>
  <div class="tabs">
    ${tab('equipment','Sestava')}
    ${tab('accidents','Nehody')}
    ${tab('claims','Reklamace')}
    ${tab('services','Servis')}
  </div>
  <section id="tabContent"></section>`;
  $('#back').onclick=()=>{selectedDrone=null;drones()};
  $('[data-edit-drone]').onclick=()=>openForm('drone',d.id,d.id);
  $('[data-add-equipment]').onclick=()=>openEquipmentPicker(d.id);
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{droneTab=b.dataset.tab;droneDetail()});
  renderDroneTab(d);
}
function cell(a,b){return `<article class="detail-cell"><span>${esc(a)}</span><strong>${esc(b)}</strong></article>`}
function tab(id,label){return `<button class="${droneTab===id?'active':''}" data-tab="${id}">${label}</button>`}
function renderDroneTab(d){
  const box=$('#tabContent');
  if(droneTab==='equipment'){
    box.innerHTML=`<div class="section-head"><div><p class="eyebrow">Baterie</p><h2>${d.batteries.length} kusů</h2></div><button class="button secondary" data-add-battery>+ Baterie</button></div>
    <div class="list">${d.batteries.map(batteryCard).join('')||empty('Žádná baterie.')}</div>
    <div class="section-head"><div><p class="eyebrow">Příslušenství</p><h2>${d.accessories.length} položek</h2></div><button class="button secondary" data-add-accessory>+ Příslušenství</button></div>
    <div class="list">${d.accessories.map(accessoryCard).join('')||empty('Žádné příslušenství.')}</div>`;
    $('[data-add-battery]').onclick=()=>openForm('battery',null,d.id);
    $('[data-add-accessory]').onclick=()=>openForm('accessory',null,d.id);
    document.querySelectorAll('[data-battery-edit]').forEach(b=>b.onclick=e=>{e.stopPropagation();openForm('battery',b.dataset.batteryEdit,d.id)});
    document.querySelectorAll('[data-accessory-edit]').forEach(b=>b.onclick=e=>{e.stopPropagation();openForm('accessory',b.dataset.accessoryEdit,d.id)});
  }else{
    const labels={accidents:['Nehody','nehodu'],claims:['Reklamace','reklamaci'],services:['Servis','servisní záznam']};
    const [title,single]=labels[droneTab];
    box.innerHTML=`<div class="section-head"><div><p class="eyebrow">Historie dronu</p><h2>${title}</h2></div><button class="button secondary" data-add-history>+ Přidat</button></div>
    <div class="list">${d[droneTab].map(x=>historyCard(x,droneTab)).join('')||empty(`Zatím žádná ${single}.`)}</div>`;
    $('[data-add-history]').onclick=()=>openForm(droneTab.slice(0,-1),null,d.id);
    document.querySelectorAll('[data-history-edit]').forEach(b=>b.onclick=()=>openForm(droneTab.slice(0,-1),b.dataset.historyEdit,d.id));
  }
}
function batteryCard(b){return `<article class="list-item"><div class="item-icon">▣</div><div class="item-main"><h3>${esc(b.number)}</h3><div class="meta">${b.cycles||0} cyklů${b.serial?' · S/N '+esc(b.serial):''}</div></div><button class="mini" data-battery-edit="${b.id}">✎</button></article>`}
function accessoryCard(a){return `<article class="list-item"><div class="item-icon">🧰</div><div class="item-main"><h3>${esc(a.name)}</h3><div class="meta">${esc(a.category||'Příslušenství')}${a.serial?' · S/N '+esc(a.serial):''}</div></div><button class="mini" data-accessory-edit="${a.id}">✎</button></article>`}
function historyCard(x,type){const icons={accidents:'⚠️',claims:'↩',services:'🛠'};return `<article class="list-item"><div class="item-icon">${icons[type]}</div><div class="item-main"><h3>${esc(x.title||x.description||'Záznam')}</h3><div class="meta">${fmtDate(x.date)}${x.status?' · '+esc(x.status):''}</div></div><button class="mini" data-history-edit="${x.id}">✎</button></article>`}
function collection(type){
  const labels={pilots:['Piloti','Pilot'],flights:['Letový deník','Let'],tasks:['Úkoly','Úkol']};
  const [title]=labels[type];
  const renderer={pilots:pilotCard,flights:flightCard,tasks:taskCard}[type];
  content.innerHTML=`<div class="section-head"><div><p class="eyebrow">Evidence</p><h2>${title}</h2></div><span class="badge">${state[type].length}</span></div><section class="list">${state[type].map(renderer).join('')||empty('Zatím žádné položky.')}</section>`;
  if(type==='pilots')document.querySelectorAll('[data-pilot-edit]').forEach(b=>b.onclick=()=>openForm('pilot',b.dataset.pilotEdit));
  if(type==='flights')document.querySelectorAll('[data-flight-edit]').forEach(b=>b.onclick=()=>openForm('flight',b.dataset.flightEdit));
  if(type==='tasks')bindTaskActions();
}
function pilotCard(p){return `<article class="list-item"><div class="item-icon">👤</div><div class="item-main"><h3>${esc(p.name)}</h3><div class="meta">${esc(p.license||'Licence neuvedena')} · ${esc(p.phone||'bez telefonu')}</div></div><button class="mini" data-pilot-edit="${p.id}">✎</button></article>`}
function flightCard(f){const drone=state.drones.find(d=>d.id===f.droneId);const pilot=state.pilots.find(p=>p.id===f.pilotId);return `<article class="list-item"><div class="item-icon">🛫</div><div class="item-main"><h3>${esc(f.location||'Let')}</h3><div class="meta">${fmtDate(f.date)} · ${esc(drone?.name||'Dron')} · ${esc(pilot?.name||'Pilot')}</div></div><button class="mini" data-flight-edit="${f.id}">✎</button></article>`}
function taskCard(t){return `<article class="list-item"><div class="item-icon">${t.done?'✓':'○'}</div><div class="item-main"><h3>${esc(t.type==='Ostatní'?(t.custom||'Ostatní'):t.type)}</h3><div class="meta">${t.dueDate?fmtDate(t.dueDate):'Bez termínu'}${t.assignedTo?' · '+esc(t.assignedTo):''}</div></div><button class="mini" data-task-toggle="${t.id}">${t.done?'↺':'✓'}</button></article>`}
function bindTaskActions(){document.querySelectorAll('[data-task-toggle]').forEach(b=>b.onclick=()=>{const t=state.tasks.find(x=>x.id===b.dataset.taskToggle);t.done=!t.done;persist();render()})}
function empty(t){return `<div class="empty">${esc(t)}</div>`}

const schemas={
  drone:[['name','Název','text',1],['model','Model','text',1],['manufacturer','Výrobce','text'],['serial','Výrobní číslo','text'],['status','Stav','select',['Aktivní','Servis','Vyřazený']],['careUntil','DJI Care do','date'],['notes','Poznámka','textarea']],
  battery:[['number','Číslo / označení baterie','text',1],['serial','Sériové číslo','text'],['cycles','Počet cyklů','number'],['notes','Poznámka','textarea']],
  accessory:[['name','Název','text',1],['category','Kategorie','select',['Ovladač','Kufr','Nabíječka','RTK','Kamera','Ostatní']],['serial','Sériové číslo','text'],['notes','Poznámka','textarea']],
  accident:[['date','Datum','date',1],['title','Název / stručný popis','text',1],['pilot','Pilot','text'],['description','Popis nehody','textarea'],['status','Vyřešeno','select',['Ne','Ano']]],
  claim:[['date','Datum','date',1],['title','Předmět reklamace','text',1],['description','Popis','textarea'],['status','Stav','select',['Založeno','Probíhá','Vyřízeno']]],
  service:[['date','Datum','date',1],['title','Název servisu','text',1],['technician','Technik / servis','text'],['price','Cena','number'],['description','Popis','textarea']],
  pilot:[['name','Jméno','text',1],['phone','Telefon','tel'],['email','E-mail','email'],['license','Licence','text'],['notes','Poznámka','textarea']],
  flight:[['date','Datum','date',1],['pilotId','Pilot','pilotSelect',1],['droneId','Dron','droneSelect',1],['battery','Baterie','batterySelect'],['location','Lokalita','text',1],['purpose','Účel letu','text'],['notes','Poznámka','textarea']],
  task:[['type','Typ úkolu','select',['Nabít baterie','Aktualizovat firmware','Poslat dron do servisu','Objednat vrtule','Ostatní']],['custom','Vlastní úkol','text'],['dueDate','Termín','date'],['assignedTo','Přiřazeno','text'],['done','Splněno','select',['Ne','Ano']]]
};
function openCreate(){if(view==='dashboard'||view==='drones')openForm('drone');else if(view==='pilots')openForm('pilot');else if(view==='flights')openForm('flight');else if(view==='tasks')openForm('task')}
function openEquipmentPicker(droneId){openForm('accessory',null,droneId)}
function openForm(type,id=null,droneId=null){
  editor={type,id,droneId};
  const obj=getObject(type,id,droneId)||{};
  $('#sheetEyebrow').textContent=id?'Úprava položky':'Nová položka';
  $('#sheetTitle').textContent=labelFor(type);
  fields.innerHTML=schemas[type].map(f=>fieldHtml(f,obj[f[0]])).join('');
  sheet.classList.add('open');sheet.setAttribute('aria-hidden','false');
  if(type==='flight')bindBatterySelect();
}
function getObject(type,id,droneId){
  if(!id)return null;
  if(type==='drone')return state.drones.find(x=>x.id===id);
  if(['battery','accessory','accident','claim','service'].includes(type)){
    const d=state.drones.find(x=>x.id===droneId);const key=type==='battery'?'batteries':type==='accessory'?'accessories':type+'s';return d?.[key].find(x=>x.id===id)
  }
  const key=type==='pilot'?'pilots':type==='flight'?'flights':'tasks';return state[key].find(x=>x.id===id)
}
function labelFor(t){return ({drone:'Dron',battery:'Baterie',accessory:'Příslušenství',accident:'Nehoda',claim:'Reklamace',service:'Servisní záznam',pilot:'Pilot',flight:'Let',task:'Úkol'})[t]}
function fieldHtml([name,label,type,req],value=''){
  let input='';
  if(type==='textarea')input=`<textarea name="${name}" ${req?'required':''}>${esc(value)}</textarea>`;
  else if(type==='select')input=`<select name="${name}" ${req?'required':''}>${arguments[0][3].map(o=>`<option ${String(value)===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  else if(type==='pilotSelect')input=`<select name="${name}" required><option value="">Vyber pilota</option>${state.pilots.map(p=>`<option value="${p.id}" ${value===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
  else if(type==='droneSelect')input=`<select name="${name}" required><option value="">Vyber dron</option>${state.drones.map(d=>`<option value="${d.id}" ${value===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select>`;
  else if(type==='batterySelect')input=`<select name="${name}" id="batterySelect"><option value="">Bez výběru</option></select>`;
  else input=`<input name="${name}" type="${type}" value="${esc(value)}" ${req?'required':''}>`;
  return `<div class="field ${type==='textarea'?'full':''}"><label>${esc(label)}${req?' *':''}</label>${input}</div>`;
}
function bindBatterySelect(){
  const droneSel=form.elements.droneId;const batSel=form.elements.battery;
  const refresh=()=>{const d=state.drones.find(x=>x.id===droneSel.value);batSel.innerHTML='<option value="">Bez výběru</option>'+((d?.batteries||[]).map(b=>`<option value="${esc(b.number)}">${esc(b.number)}</option>`).join(''))};
  droneSel.onchange=refresh;refresh();
}
function closeSheet(){sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true');form.reset();editor={type:null,id:null,droneId:null}}
function saveForm(e){
  e.preventDefault();
  const data=Object.fromEntries(new FormData(form));
  if(editor.type==='task')data.done=data.done==='Ano';
  const existing=getObject(editor.type,editor.id,editor.droneId);
  if(existing)Object.assign(existing,data);
  else{
    data.id=uid();
    if(editor.type==='drone'){Object.assign(data,{batteries:[],accessories:[],accidents:[],claims:[],services:[]});state.drones.push(data)}
    else if(['battery','accessory','accident','claim','service'].includes(editor.type)){
      const d=state.drones.find(x=>x.id===editor.droneId);const key=editor.type==='battery'?'batteries':editor.type==='accessory'?'accessories':editor.type+'s';d[key].push(data)
    }else{const key=editor.type==='pilot'?'pilots':editor.type==='flight'?'flights':'tasks';state[key].push(data)}
  }
  persist();closeSheet();render();
}
function renderSettings(){
  fab.hidden=true;
  content.innerHTML=`<div class="section-head"><div><p class="eyebrow">Nastavení</p><h2>Záloha dat</h2></div></div>
  <section class="card" style="padding:16px"><p class="meta">Data jsou zatím uložená pouze v tomto telefonu. Doporučená je pravidelná záloha.</p>
  <div class="toolbar"><button class="button primary" id="export">Exportovat JSON</button><label class="button secondary" style="text-align:center">Importovat JSON<input id="import" type="file" accept="application/json" hidden></label></div></section>`;
  $('#export').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='dfm-zaloha.json';a.click();URL.revokeObjectURL(a.href)};
  $('#import').onchange=async e=>{try{state=JSON.parse(await e.target.files[0].text());persist();switchView('dashboard')}catch{alert('Soubor se nepodařilo načíst.')}};
}
render();
