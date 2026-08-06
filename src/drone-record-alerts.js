const STORAGE_KEY='dfm_react_pwa_v1';

const activeAccident=item=>!(item?.status==='Ano'||item?.resolved===true);
const activeClaim=item=>item?.status!=='Vyřízeno';
const activeService=item=>!(item?.status==='Ano'||item?.resolved===true);
const recordCounts=drone=>({
  accidents:(drone?.accidents||[]).filter(activeAccident).length,
  claims:(drone?.claims||[]).filter(activeClaim).length,
  services:(drone?.services||[]).filter(activeService).length
});

function loadDrones(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}').drones||[]}
  catch{return[]}
}

function addCompactBadge(wrap,{kind,icon,count,label}){
  if(!count)return;
  const badge=document.createElement('span');
  badge.className=`drone-record-badge ${kind}`;
  badge.textContent=`${icon} ${count}`;
  badge.title=`${label}: ${count}`;
  badge.setAttribute('aria-label',`${label}: ${count}`);
  wrap.appendChild(badge);
}

function buildBadges(drone){
  const counts=recordCounts(drone);
  const wrap=document.createElement('div');
  wrap.className='drone-record-badges';
  addCompactBadge(wrap,{kind:'accident',icon:'🚨',count:counts.accidents,label:'Nehody'});
  addCompactBadge(wrap,{kind:'claim',icon:'⚠️',count:counts.claims,label:'Reklamace'});
  addCompactBadge(wrap,{kind:'service',icon:'🔧',count:counts.services,label:'Servis'});
  return wrap;
}

function hasRecords(drone){
  const c=recordCounts(drone);
  return c.accidents||c.claims||c.services;
}

function findDetailDrone(){
  const hero=document.querySelector('.detail-hero');
  if(!hero)return null;
  const name=hero.querySelector('.detail-row h2')?.textContent?.trim();
  return loadDrones().find(item=>item.name===name)||null;
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
    if(recordCounts(drone).accidents)card.classList.add('has-accident-alert');
  });
}

function refreshDetailTabCounts(drone){
  const tabs=document.querySelector('.detail-hero')?.parentElement?.querySelector('.tabs');
  if(!tabs||!drone)return;
  const counts=recordCounts(drone);
  const config={
    nehody:{count:counts.accidents,kind:'accident'},
    reklamace:{count:counts.claims,kind:'claim'},
    servis:{count:counts.services,kind:'service'}
  };
  [...tabs.querySelectorAll('button')].forEach(button=>{
    const base=(button.dataset.recordBaseLabel||button.childNodes[0]?.textContent||button.textContent||'').trim();
    button.dataset.recordBaseLabel=base;
    const item=config[base.toLocaleLowerCase('cs-CZ')];
    if(!item)return;
    const current=button.querySelector('.drone-tab-count');
    if(!item.count){current?.remove();return;}
    const count=current||document.createElement('span');
    count.className=`drone-tab-count ${item.kind}`;
    count.textContent=String(item.count);
    count.setAttribute('aria-label',`${item.count} aktivních záznamů`);
    if(!current)button.appendChild(count);
  });
}

function refreshDroneDetail(){
  const hero=document.querySelector('.detail-hero');
  if(!hero)return;
  hero.querySelector('.drone-record-badges.detail')?.remove();
  hero.classList.remove('has-accident-alert');
  const drone=findDetailDrone();
  if(!drone)return;
  refreshDetailTabCounts(drone);
  if(!hasRecords(drone))return;
  const badges=buildBadges(drone);
  badges.classList.add('detail');
  const sensorTags=hero.querySelector(':scope > .sensor-tags');
  if(sensorTags)sensorTags.insertAdjacentElement('afterend',badges);
  else hero.querySelector('.detail-row')?.insertAdjacentElement('afterend',badges);
  if(recordCounts(drone).accidents)hero.classList.add('has-accident-alert');
}

let timer=0;
function scheduleRefresh(){clearTimeout(timer);timer=setTimeout(()=>{refreshDroneCards();refreshDroneDetail()},80)}
const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node instanceof HTMLElement)))scheduleRefresh()});
function start(){
  observer.observe(document.body,{childList:true,subtree:true});
  addEventListener('storage',event=>{if(event.key===STORAGE_KEY)scheduleRefresh()});
  const original=Storage.prototype.setItem;
  if(!Storage.prototype.__dfmDroneAlertsPatched){
    Storage.prototype.setItem=function(key,value){const result=original.call(this,key,value);if(this===localStorage&&key===STORAGE_KEY)scheduleRefresh();return result};
    Storage.prototype.__dfmDroneAlertsPatched=true;
  }
  scheduleRefresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
