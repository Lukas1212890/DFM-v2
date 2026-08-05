const STORAGE_KEY='dfm_react_pwa_v1';
const OFFICE_KEY='dfm_selected_drone_office';
const OFFICES=['Zlín','Praha'];
const norm=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');
let bypassNavigation=false;
let refreshTimer=0;
let writeGuard=false;

function readData(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}
  catch{return{drones:[]}}
}

function currentOffice(){
  const value=localStorage.getItem(OFFICE_KEY)||'';
  return OFFICES.includes(value)?value:'';
}

function setOffice(office){
  if(OFFICES.includes(office))localStorage.setItem(OFFICE_KEY,office);
}

function migrateExistingDrones(){
  const data=readData();
  if(!Array.isArray(data.drones)||!data.drones.some(drone=>!drone.office))return;
  data.drones=data.drones.map(drone=>drone.office?drone:{...drone,office:'Zlín'});
  writeGuard=true;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  writeGuard=false;
}

function officeCounts(){
  const drones=readData().drones||[];
  return Object.fromEntries(OFFICES.map(office=>[office,drones.filter(drone=>(drone.office||'Zlín')===office).length]));
}

function closePicker(){
  document.querySelector('.drone-office-overlay')?.remove();
}

function openPicker(sourceButton=null){
  closePicker();
  const counts=officeCounts();
  const overlay=document.createElement('div');
  overlay.className='drone-office-overlay';
  overlay.innerHTML=`<section class="drone-office-panel" role="dialog" aria-modal="true" aria-label="Vyberte pobočku">
    <header><div><small>Evidence dronů</small><h2>Vyberte pobočku</h2></div><button type="button" class="drone-office-close" aria-label="Zavřít">×</button></header>
    <p>Drony jsou rozdělené podle kanceláře.</p>
    <div class="drone-office-options">
      ${OFFICES.map(office=>`<button type="button" data-office="${office}"><span>${office==='Zlín'?'🏢':'🏙️'}</span><div><strong>${office}</strong><small>${counts[office]} ${counts[office]===1?'dron':'dronů'}</small></div><b>›</b></button>`).join('')}
    </div>
  </section>`;
  overlay.addEventListener('click',event=>{if(event.target===overlay)closePicker()});
  overlay.querySelector('.drone-office-close')?.addEventListener('click',closePicker);
  overlay.querySelectorAll('[data-office]').forEach(button=>button.addEventListener('click',()=>{
    setOffice(button.dataset.office);
    closePicker();
    if(sourceButton){
      bypassNavigation=true;
      sourceButton.click();
      bypassNavigation=false;
    }
    scheduleRefresh();
  }));
  document.body.appendChild(overlay);
}

function isDroneNavigationButton(button){
  if(!(button instanceof HTMLElement))return false;
  const small=button.querySelector('small')?.textContent?.trim();
  if(norm(small)==='drony')return true;
  return button.classList.contains('dashboard-button')&&norm(button.textContent).startsWith('drony');
}

function isDroneList(){
  return [...document.querySelectorAll('.section-title h2')].some(node=>norm(node.textContent)==='drony')&&!document.querySelector('.detail-hero');
}

function addOfficeHeader(){
  const title=[...document.querySelectorAll('.section-title h2')].find(node=>norm(node.textContent)==='drony');
  if(!title)return;
  const section=title.closest('.section-title');
  const office=currentOffice();
  if(!office)return;
  let bar=document.querySelector('.drone-office-current');
  if(!bar){
    bar=document.createElement('section');
    bar.className='drone-office-current';
    section?.insertAdjacentElement('afterend',bar);
  }
  const count=(readData().drones||[]).filter(drone=>(drone.office||'Zlín')===office).length;
  bar.innerHTML=`<div><small>Pobočka</small><strong>${office}</strong><span>${count} ${count===1?'dron':'dronů'}</span></div><button type="button">Změnit</button>`;
  bar.querySelector('button')?.addEventListener('click',()=>openPicker());
}

function filterDroneCards(){
  if(!isDroneList())return;
  const office=currentOffice();
  if(!office){
    if(!document.querySelector('.drone-office-overlay'))openPicker();
    return;
  }
  addOfficeHeader();
  const drones=readData().drones||[];
  const title=[...document.querySelectorAll('.section-title h2')].find(node=>norm(node.textContent)==='drony');
  const content=title?.closest('.content')||document.querySelector('main.content');
  const list=content?.querySelector('.list');
  if(!list)return;
  const cards=[...list.querySelectorAll(':scope > .list-item')];
  let visible=0;
  const used=new Set();
  cards.forEach(card=>{
    const name=card.querySelector('.item-main h3,h3')?.textContent?.trim()||'';
    const model=card.querySelector('.item-main p,p')?.textContent?.trim()||'';
    const index=drones.findIndex((drone,i)=>!used.has(i)&&norm(drone.name)===norm(name)&&(model.includes(drone.model||'')||!drone.model));
    const drone=index>=0?drones[index]:null;
    if(index>=0)used.add(index);
    const show=Boolean(drone&&(drone.office||'Zlín')===office);
    card.hidden=!show;
    card.style.display=show?'':'none';
    if(show)visible++;
  });
  let empty=list.querySelector('.drone-office-empty');
  if(!visible){
    if(!empty){
      empty=document.createElement('div');
      empty.className='empty drone-office-empty';
      list.appendChild(empty);
    }
    empty.innerHTML=`<strong>V pobočce ${office} zatím nejsou žádné drony.</strong><span>Přidejte první dron zeleným tlačítkem +.</span>`;
  }else empty?.remove();
}

function markDroneEditor(){
  const panels=[...document.querySelectorAll('.sheet-panel')];
  panels.forEach(panel=>{
    const heading=norm(panel.querySelector('.sheet-header h2')?.textContent);
    const eyebrow=norm(panel.querySelector('.sheet-header .eyebrow')?.textContent);
    if(heading!=='drone'||eyebrow!=='nová položka'||panel.querySelector('.drone-office-editor-note'))return;
    const office=currentOffice()||'Zlín';
    const note=document.createElement('div');
    note.className='drone-office-editor-note';
    note.innerHTML=`<small>Pobočka</small><strong>${office}</strong>`;
    panel.querySelector('.form-fields')?.prepend(note);
  });
}

function scheduleRefresh(){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>{
    filterDroneCards();
    markDroneEditor();
  },70);
}

function patchStorage(){
  if(Storage.prototype.__dfmOfficePatched)return;
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&key===STORAGE_KEY&&!writeGuard){
      try{
        const data=JSON.parse(value);
        if(Array.isArray(data.drones)){
          const office=currentOffice()||'Zlín';
          data.drones=data.drones.map(drone=>drone.office?drone:{...drone,office});
          value=JSON.stringify(data);
        }
      }catch{}
    }
    const result=original.call(this,key,value);
    if(this===localStorage&&key===STORAGE_KEY)scheduleRefresh();
    return result;
  };
  Storage.prototype.__dfmOfficePatched=true;
}

function start(){
  patchStorage();
  migrateExistingDrones();
  document.addEventListener('click',event=>{
    if(bypassNavigation)return;
    const button=event.target.closest('button');
    if(!isDroneNavigationButton(button))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openPicker(button);
  },true);
  new MutationObserver(records=>{
    if(records.some(record=>record.addedNodes.length||record.removedNodes.length))scheduleRefresh();
  }).observe(document.body,{childList:true,subtree:true});
  addEventListener('storage',event=>{if(event.key===STORAGE_KEY||event.key===OFFICE_KEY)scheduleRefresh()});
  scheduleRefresh();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
