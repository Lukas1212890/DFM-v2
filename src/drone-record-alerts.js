const STORAGE_KEY='dfm_react_pwa_v1';

const recordCounts=drone=>({
  accidents:(drone?.accidents||[]).length,
  claims:(drone?.claims||[]).filter(item=>item?.status!=='Vyřízeno').length,
  services:(drone?.services||[]).length
});

function loadDrones(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}').drones||[]}
  catch{return[]}
}

function buildBadges(drone){
  const counts=recordCounts(drone);
  const wrap=document.createElement('div');
  wrap.className='drone-record-badges';
  if(counts.accidents){
    const badge=document.createElement('span');
    badge.className='drone-record-badge accident';
    badge.textContent=`🚨 Nehoda${counts.accidents>1?` · ${counts.accidents}`:''}`;
    wrap.appendChild(badge);
  }
  if(counts.claims){
    const badge=document.createElement('span');
    badge.className='drone-record-badge claim';
    badge.textContent=`⚠️ Reklamace${counts.claims>1?` · ${counts.claims}`:''}`;
    wrap.appendChild(badge);
  }
  if(counts.services){
    const badge=document.createElement('span');
    badge.className='drone-record-badge service';
    badge.textContent=`🔧 Servis${counts.services>1?` · ${counts.services}`:''}`;
    wrap.appendChild(badge);
  }
  return wrap;
}

function hasRecords(drone){
  const c=recordCounts(drone);
  return c.accidents||c.claims||c.services;
}

function refreshDroneCards(){
  const drones=loadDrones();
  const heading=[...document.querySelectorAll('.section-title h2')].find(node=>node.textContent.trim()==='Drony');
  if(!heading)return;
  const list=heading.parentElement?.nextElementSibling?.classList?.contains('filter-panel')
    ? heading.parentElement.nextElementSibling.nextElementSibling
    : heading.closest('.content')?.querySelector('.list');
  const cards=[...(list?.querySelectorAll(':scope > .list-item')||[])];
  cards.forEach((card,index)=>{
    card.querySelector('.drone-record-badges')?.remove();
    card.classList.remove('has-drone-alert','has-accident-alert');
    const drone=drones[index];
    if(!drone||!hasRecords(drone))return;
    const main=card.querySelector('.item-main');
    main?.appendChild(buildBadges(drone));
    card.classList.add('has-drone-alert');
    if((drone.accidents||[]).length)card.classList.add('has-accident-alert');
  });
}

function refreshDroneDetail(){
  const drones=loadDrones();
  const hero=document.querySelector('.detail-hero');
  if(!hero)return;
  hero.querySelector('.drone-record-badges.detail')?.remove();
  hero.classList.remove('has-accident-alert');
  const name=hero.querySelector('.detail-row h2')?.textContent?.trim();
  const drone=drones.find(item=>item.name===name);
  if(!drone||!hasRecords(drone))return;
  const badges=buildBadges(drone);
  badges.classList.add('detail');
  const sensorTags=hero.querySelector(':scope > .sensor-tags');
  if(sensorTags)sensorTags.insertAdjacentElement('afterend',badges);
  else hero.querySelector('.detail-row')?.insertAdjacentElement('afterend',badges);
  if((drone.accidents||[]).length)hero.classList.add('has-accident-alert');
}

let timer=0;
function scheduleRefresh(){
  clearTimeout(timer);
  timer=setTimeout(()=>{
    refreshDroneCards();
    refreshDroneDetail();
  },80);
}

const observer=new MutationObserver(records=>{
  if(records.some(record=>[...record.addedNodes].some(node=>node instanceof HTMLElement)))scheduleRefresh();
});

function start(){
  observer.observe(document.body,{childList:true,subtree:true});
  addEventListener('storage',event=>{if(event.key===STORAGE_KEY)scheduleRefresh()});
  const original=Storage.prototype.setItem;
  if(!Storage.prototype.__dfmDroneAlertsPatched){
    Storage.prototype.setItem=function(key,value){
      original.call(this,key,value);
      if(this===localStorage&&key===STORAGE_KEY)scheduleRefresh();
    };
    Storage.prototype.__dfmDroneAlertsPatched=true;
  }
  scheduleRefresh();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
