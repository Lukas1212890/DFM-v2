const STORAGE_KEY='dfm_react_pwa_v1';
const OFFICE_KEY='dfm_selected_drone_office';
const OFFICES=['Zlín','Praha'];
const norm=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');
let bypassNavigation=false;
let lastScreen='';

function readData(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}
  catch{return{drones:[]}}
}
function currentOffice(){
  const value=localStorage.getItem(OFFICE_KEY)||'';
  return OFFICES.includes(value)?value:'';
}
function setOffice(value){localStorage.setItem(OFFICE_KEY,value)}
function migrateExistingDrones(){
  const data=readData();
  if(!Array.isArray(data.drones))return;
  let changed=false;
  data.drones=data.drones.map(drone=>{
    if(drone.office)return drone;
    changed=true;
    return{...drone,office:'Zlín'};
  });
  if(changed)localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
}
function counts(){
  const drones=readData().drones||[];
  return Object.fromEntries(OFFICES.map(office=>[office,drones.filter(d=>(d.office||'Zlín')===office).length]));
}
function closePicker(){document.querySelector('.drone-office-overlay')?.remove()}
function openPicker(sourceButton){
  closePicker();
  const total=counts();
  const overlay=document.createElement('div');
  overlay.className='drone-office-overlay';
  overlay.innerHTML=`<section class="drone-office-panel" role="dialog" aria-modal="true"><header><div><small>Evidence dronů</small><h2>Vyberte pobočku</h2></div><button type="button" class="drone-office-close">×</button></header><p>Drony jsou rozdělené podle kanceláře.</p><div class="drone-office-options">${OFFICES.map(office=>`<button type="button" data-office="${office}"><span>${office==='Zlín'?'🏢':'🏙️'}</span><div><strong>${office}</strong><small>${total[office]} ${total[office]===1?'dron':'dronů'}</small></div><b>›</b></button>`).join('')}</div></section>`;
  overlay.addEventListener('click',event=>{if(event.target===overlay)closePicker()});
  overlay.querySelector('.drone-office-close').onclick=closePicker;
  overlay.querySelectorAll('[data-office]').forEach(button=>button.onclick=()=>{
    setOffice(button.dataset.office);
    closePicker();
    if(sourceButton){
      bypassNavigation=true;
      sourceButton.click();
      bypassNavigation=false;
    }
    setTimeout(refreshDroneScreen,80);
  });
  document.body.appendChild(overlay);
}
function isDroneButton(button){
  if(!(button instanceof HTMLElement))return false;
  const label=norm(button.querySelector('small')?.textContent);
  if(label==='drony')return true;
  return norm(button.textContent).startsWith('drony')&&(button.closest('.dashboard-stats')||button.classList.contains('dashboard-button'));
}
function droneTitle(){return[...document.querySelectorAll('h2')].find(node=>norm(node.textContent)==='drony')}
function isDroneList(){return Boolean(droneTitle())&&!document.querySelector('.detail-hero')}
function findCards(list){
  const direct=[...list.children].filter(node=>node instanceof HTMLElement&&!node.classList.contains('drone-office-empty'));
  return direct.filter(node=>node.matches('button,.drone-card,.list-item,[role="button"]')||node.querySelector('h3'));
}
function cardName(card){return card.querySelector('h3')?.textContent?.trim()||''}
function addHeader(){
  const title=droneTitle();
  const office=currentOffice();
  if(!title||!office)return;
  const titleSection=title.closest('.section-title')||title.parentElement;
  let bar=document.querySelector('.drone-office-current');
  if(!bar){
    bar=document.createElement('section');
    bar.className='drone-office-current';
    titleSection.insertAdjacentElement('afterend',bar);
  }
  const count=counts()[office];
  const signature=`${office}:${count}`;
  if(bar.dataset.signature!==signature){
    bar.dataset.signature=signature;
    bar.innerHTML=`<div><small>Pobočka</small><strong>${office}</strong><span>${count} ${count===1?'dron':'dronů'}</span></div><button type="button">Změnit</button>`;
    bar.querySelector('button').onclick=()=>openPicker(null);
  }
}
function filterCards(){
  if(!isDroneList())return;
  const office=currentOffice();
  if(!office){openPicker(null);return}
  addHeader();
  const title=droneTitle();
  const content=title.closest('main,.content')||document.querySelector('main.content');
  const list=content?.querySelector('.list');
  if(!list)return;
  const drones=readData().drones||[];
  const cards=findCards(list);
  let visible=0;
  cards.forEach(card=>{
    const name=cardName(card);
    const drone=drones.find(d=>norm(d.name)===norm(name));
    const show=Boolean(drone&&(drone.office||'Zlín')===office);
    card.style.display=show?'':'none';
    if(show)visible++;
  });
  let empty=list.querySelector('.drone-office-empty');
  if(!visible){
    if(!empty){empty=document.createElement('div');empty.className='empty drone-office-empty';list.appendChild(empty)}
    empty.innerHTML=`<strong>V pobočce ${office} zatím nejsou žádné drony.</strong><span>Přidejte první dron zeleným tlačítkem +.</span>`;
  }else empty?.remove();
}
function attachOfficeToNewDrones(){
  const office=currentOffice()||'Zlín';
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw)return;
  try{
    const data=JSON.parse(raw);
    if(!Array.isArray(data.drones)||!data.drones.some(d=>!d.office))return;
    data.drones=data.drones.map(d=>d.office?d:{...d,office});
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  }catch{}
}
function refreshDroneScreen(){
  const screen=isDroneList()?'list':document.querySelector('.detail-hero')?'detail':'other';
  if(screen!==lastScreen){lastScreen=screen;if(screen!=='list')document.querySelector('.drone-office-current')?.remove()}
  if(screen==='list')filterCards();
  attachOfficeToNewDrones();
}
function start(){
  migrateExistingDrones();
  document.addEventListener('click',event=>{
    if(bypassNavigation)return;
    const button=event.target.closest('button');
    if(!isDroneButton(button))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openPicker(button);
  },true);
  setInterval(refreshDroneScreen,500);
  addEventListener('storage',refreshDroneScreen);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
