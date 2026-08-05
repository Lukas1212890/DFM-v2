const STORAGE_KEY='dfm_react_pwa_v1';
const OFFICE_KEY='dfm_selected_drone_office';
const OFFICES=['Zlín','Praha'];
const norm=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');
let bypassNavigation=false;
let refreshTimer=0;

function readData(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}
  catch{return{drones:[]}}
}
function currentOffice(){
  const value=localStorage.getItem(OFFICE_KEY)||'';
  return OFFICES.includes(value)?value:'';
}
function setOffice(value){
  if(OFFICES.includes(value))localStorage.setItem(OFFICE_KEY,value);
}
function officeOf(drone){return drone?.office||'Zlín'}
function counts(){
  const drones=readData().drones||[];
  return Object.fromEntries(OFFICES.map(office=>[office,drones.filter(drone=>officeOf(drone)===office).length]));
}
function closePicker(){document.querySelector('.drone-office-overlay')?.remove()}
function isDroneButton(button){
  if(!(button instanceof HTMLElement))return false;
  const label=norm(button.querySelector('small')?.textContent);
  if(label==='drony')return true;
  return Boolean(button.closest('.dashboard-stats'))&&norm(button.textContent).startsWith('drony');
}
function droneTitle(){return[...document.querySelectorAll('.section-title h2')].find(node=>norm(node.textContent)==='drony')}
function isDroneList(){return Boolean(droneTitle())&&!document.querySelector('.detail-hero')}
function getDroneCards(){
  const title=droneTitle();
  const content=title?.closest('main,.content')||document.querySelector('main.content');
  const list=content?.querySelector('.list');
  if(!list)return{list:null,cards:[]};
  const cards=[...list.children].filter(node=>node instanceof HTMLElement&&node.querySelector('h3')&&!node.classList.contains('drone-office-empty'));
  return{list,cards};
}
function addOfficeHeader(){
  if(!isDroneList())return;
  const office=currentOffice();
  if(!office)return;
  const title=droneTitle();
  const titleSection=title.closest('.section-title')||title.parentElement;
  let bar=document.querySelector('.drone-office-current');
  if(!bar){
    bar=document.createElement('section');
    bar.className='drone-office-current';
    titleSection.insertAdjacentElement('afterend',bar);
  }
  const count=counts()[office];
  const signature=`${office}:${count}`;
  if(bar.dataset.signature===signature)return;
  bar.dataset.signature=signature;
  bar.innerHTML=`<div><small>Pobočka</small><strong>${office}</strong><span>${count} ${count===1?'dron':'dronů'}</span></div><button type="button">Změnit</button>`;
  bar.querySelector('button').addEventListener('click',()=>openPicker(null));
}
function applyOfficeView(){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>{
    if(!isDroneList()){
      document.querySelector('.drone-office-current')?.remove();
      return;
    }
    const office=currentOffice();
    if(!office)return;
    addOfficeHeader();
    const drones=readData().drones||[];
    const {list,cards}=getDroneCards();
    if(!list)return;
    let visible=0;
    cards.forEach(card=>{
      const name=card.querySelector('h3')?.textContent?.trim()||'';
      const drone=drones.find(item=>norm(item.name)===norm(name));
      const show=Boolean(drone&&officeOf(drone)===office);
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
  },100);
}
function openPicker(sourceButton=null){
  closePicker();
  const total=counts();
  const overlay=document.createElement('div');
  overlay.className='drone-office-overlay';
  overlay.innerHTML=`<section class="drone-office-panel" role="dialog" aria-modal="true" aria-label="Vyberte pobočku"><header><div><small>Evidence dronů</small><h2>Vyberte pobočku</h2></div><button type="button" class="drone-office-close" aria-label="Zavřít">×</button></header><p>Drony jsou rozdělené podle kanceláře.</p><div class="drone-office-options">${OFFICES.map(office=>`<button type="button" data-office="${office}"><span>${office==='Zlín'?'🏢':'🏙️'}</span><div><strong>${office}</strong><small>${total[office]} ${total[office]===1?'dron':'dronů'}</small></div><b>›</b></button>`).join('')}</div></section>`;
  overlay.addEventListener('click',event=>{if(event.target===overlay)closePicker()});
  overlay.querySelector('.drone-office-close').addEventListener('click',closePicker);
  overlay.querySelectorAll('[data-office]').forEach(button=>button.addEventListener('click',()=>{
    setOffice(button.dataset.office);
    closePicker();
    if(sourceButton){
      bypassNavigation=true;
      sourceButton.click();
      bypassNavigation=false;
    }
    applyOfficeView();
  }));
  document.body.appendChild(overlay);
}
function patchNewDroneSaves(){
  if(Storage.prototype.__dfmSafeOfficePatched)return;
  const original=Storage.prototype.setItem;
  let knownIds=new Set((readData().drones||[]).map(drone=>drone.id));
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&key===STORAGE_KEY){
      try{
        const data=JSON.parse(value);
        if(Array.isArray(data.drones)){
          const office=currentOffice()||'Zlín';
          data.drones=data.drones.map(drone=>drone.office||knownIds.has(drone.id)?drone:{...drone,office});
          knownIds=new Set(data.drones.map(drone=>drone.id));
          value=JSON.stringify(data);
        }
      }catch{}
    }
    const result=original.call(this,key,value);
    if(this===localStorage&&key===STORAGE_KEY)applyOfficeView();
    return result;
  };
  Storage.prototype.__dfmSafeOfficePatched=true;
}
function start(){
  patchNewDroneSaves();
  document.addEventListener('click',event=>{
    if(bypassNavigation)return;
    const button=event.target.closest('button');
    if(!isDroneButton(button))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openPicker(button);
  },true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
