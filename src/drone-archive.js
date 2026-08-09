const STORAGE_KEY='dfm_react_pwa_v1';
const TYPES={
  accident:{key:'accidents',tab:'Nehody',icon:'🚨',active:item=>!(item?.status==='Ano'||item?.resolved===true),reopen:'Ne'},
  claim:{key:'claims',tab:'Reklamace',icon:'⚠️',active:item=>item?.status!=='Vyřízeno',reopen:'Založeno'},
  service:{key:'services',tab:'Servis',icon:'🔧',active:item=>!(item?.status==='Ano'||item?.resolved===true),reopen:'Ne'}
};
let pendingService=null;
let enhanceTimer=0;

const norm=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');
const readData=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return{drones:[]}}};
const isResolved=(type,item)=>!TYPES[type].active(item);
const currentDrone=()=>{
  const name=document.querySelector('.detail-hero .detail-row h2')?.textContent?.trim();
  return (readData().drones||[]).find(drone=>drone.name===name)||null;
};
const recordTitle=item=>item?.title||item?.name||'Záznam';
const recordDate=item=>item?.date||'Bez data';

function normalizeArchive(previous,next){
  if(!Array.isArray(next?.drones))return next;
  next.drones.forEach(drone=>{
    const oldDrone=(previous?.drones||[]).find(item=>item.id===drone.id)||{};
    Object.entries(TYPES).forEach(([type,meta])=>{
      if(!Array.isArray(drone[meta.key]))return;
      drone[meta.key].forEach((item,index)=>{
        const old=(oldDrone[meta.key]||[]).find(value=>value.id===item.id)||(oldDrone[meta.key]||[])[index];
        if(type==='service'&&pendingService){
          const sameId=pendingService.id&&item.id===pendingService.id;
          const sameFields=norm(item.title)===norm(pendingService.title)&&String(item.date||'')===String(pendingService.date||'');
          if(sameId||sameFields||(!pendingService.id&&index===drone[meta.key].length-1))item.status=pendingService.status;
        }
        const resolved=isResolved(type,item);
        const wasResolved=old?isResolved(type,old):false;
        if(resolved&&!wasResolved){
          item.closedAt=item.closedAt||new Date().toISOString();
          item.previousStatus=old?.status||item.previousStatus||'';
        }
        if(!resolved)delete item.closedAt;
      });
    });
  });
  pendingService=null;
  return next;
}

function patchStorage(){
  if(Storage.prototype.__dfmArchivePatched)return;
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&key===STORAGE_KEY){
      try{
        const previous=readData();
        value=JSON.stringify(normalizeArchive(previous,JSON.parse(value)));
      }catch{}
    }
    return original.call(this,key,value);
  };
  Storage.prototype.__dfmArchivePatched=true;
}

function enhanceServiceEditor(){
  const panel=[...document.querySelectorAll('.sheet-panel')].find(node=>norm(node.querySelector('.sheet-header h2')?.textContent)==='service');
  if(!panel||panel.dataset.archiveEnhanced==='1')return;
  panel.dataset.archiveEnhanced='1';
  const fields=panel.querySelector('.form-fields');
  if(!fields)return;
  const label=document.createElement('label');
  label.className='field service-resolved-field';
  label.innerHTML='<span>Vyřešeno</span><select><option>Ne</option><option>Ano</option></select>';
  const select=label.querySelector('select');
  const drone=currentDrone();
  const title=panel.querySelector('input[name="title"]')?.value||'';
  const date=panel.querySelector('input[name="date"]')?.value||'';
  const existing=(drone?.services||[]).find(item=>norm(item.title)===norm(title)&&String(item.date||'')===String(date));
  select.value=existing?.status==='Ano'?'Ano':'Ne';
  fields.appendChild(label);
  panel.querySelector('form')?.addEventListener('submit',()=>{
    pendingService={id:existing?.id||'',title:panel.querySelector('input[name="title"]')?.value||'',date:panel.querySelector('input[name="date"]')?.value||'',status:select.value};
  },{capture:true,once:true});
}

function activeTypeFromTabs(tabs){
  const button=[...tabs.querySelectorAll('button')].find(item=>item.classList.contains('active'));
  const text=norm(button?.dataset.recordBaseLabel||button?.textContent);
  return Object.keys(TYPES).find(type=>norm(TYPES[type].tab)===text)||null;
}

function hideArchivedInActiveTab(){
  const drone=currentDrone();
  const tabs=document.querySelector('.detail-hero')?.parentElement?.querySelector('.tabs');
  if(!drone||!tabs)return;
  const type=activeTypeFromTabs(tabs);
  if(!type)return;
  const meta=TYPES[type];
  const content=tabs.parentElement;
  const list=[...content.querySelectorAll(':scope > .list')].at(-1);
  if(!list)return;
  const cards=[...list.querySelectorAll(':scope > .list-item')];
  (drone[meta.key]||[]).forEach((item,index)=>{if(cards[index])cards[index].style.display=meta.active(item)?'':'none'});
  const title=[...content.querySelectorAll(':scope > .section-title h2')].at(-1);
  const count=(drone[meta.key]||[]).filter(meta.active).length;
  if(title)title.textContent=`${meta.tab} · ${count}`;
  let empty=list.querySelector('.archive-active-empty');
  if(!count){
    if(!empty){empty=document.createElement('div');empty.className='empty archive-active-empty';empty.textContent='Žádné aktivní záznamy.';list.appendChild(empty)}
  }else empty?.remove();
}

function archiveItems(drone){
  const items=[];
  Object.entries(TYPES).forEach(([type,meta])=>(drone[meta.key]||[]).forEach(item=>{if(isResolved(type,item))items.push({type,item})}));
  return items.sort((a,b)=>String(b.item.closedAt||b.item.date||'').localeCompare(String(a.item.closedAt||a.item.date||'')));
}

function notifyDataChanged(){
  window.dispatchEvent(new CustomEvent('dfm:data-updated',{detail:{source:'archive'}}));
}

function writeAndRefresh(data,{filter='all'}={}){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  notifyDataChanged();
  renderArchive(filter);
}

function restoreRecord(droneId,type,id){
  const data=readData();
  const drone=(data.drones||[]).find(item=>item.id===droneId);
  const meta=TYPES[type];
  const item=(drone?.[meta.key]||[]).find(value=>value.id===id);
  if(!item)return;
  const filter=document.querySelector('.drone-archive-panel .archive-filter button.active')?.dataset.filter||'all';
  item.status=item.previousStatus&&!['Ano','Vyřízeno'].includes(item.previousStatus)?item.previousStatus:meta.reopen;
  item.resolved=false;
  delete item.closedAt;
  writeAndRefresh(data,{filter});
}

function deleteRecord(droneId,type,id){
  if(!confirm('Opravdu trvale smazat tento archivovaný záznam?'))return;
  const data=readData();
  const drone=(data.drones||[]).find(item=>item.id===droneId);
  const meta=TYPES[type];
  if(!drone)return;
  const filter=document.querySelector('.drone-archive-panel .archive-filter button.active')?.dataset.filter||'all';
  drone[meta.key]=(drone[meta.key]||[]).filter(value=>value.id!==id);
  writeAndRefresh(data,{filter});
}

function renderArchive(selectedFilter='all'){
  const drone=currentDrone();
  const tabs=document.querySelector('.detail-hero')?.parentElement?.querySelector('.tabs');
  if(!drone||!tabs)return;
  [...tabs.querySelectorAll('button')].forEach(button=>button.classList.toggle('active',button.classList.contains('archive-tab')));
  [...tabs.parentElement.children].forEach(node=>{
    if(node!==tabs&&!node.classList.contains('drone-archive-panel')&&(node.compareDocumentPosition(tabs)&Node.DOCUMENT_POSITION_FOLLOWING))node.hidden=true;
  });
  let panel=tabs.parentElement.querySelector(':scope > .drone-archive-panel');
  if(!panel){panel=document.createElement('section');panel.className='drone-archive-panel';tabs.insertAdjacentElement('afterend',panel)}
  const items=archiveItems(drone);
  const isAdmin=norm(document.querySelector('.user-chip small')?.textContent).includes('administrátor');
  panel.hidden=false;
  panel.innerHTML=`<div class="archive-head"><div><p class="eyebrow">Historie dronu</p><h2>Archiv · ${items.length}</h2></div><div class="archive-summary"><span>🚨 ${(drone.accidents||[]).length}</span><span>⚠️ ${(drone.claims||[]).length}</span><span>🔧 ${(drone.services||[]).length}</span></div></div><div class="archive-filter"><button data-filter="all">Vše</button><button data-filter="accident">🚨 Nehody</button><button data-filter="claim">⚠️ Reklamace</button><button data-filter="service">🔧 Servis</button></div><div class="archive-list">${items.map(({type,item})=>`<article class="archive-card" data-type="${type}"><div class="archive-icon">${TYPES[type].icon}</div><div><small>${TYPES[type].tab.slice(0,-1)} · ${recordDate(item)}</small><h3>${recordTitle(item)}</h3><p>${item.description||item.technician||item.pilot||'Bez popisu'}</p><em>Uzavřeno: ${item.closedAt?new Date(item.closedAt).toLocaleDateString('cs-CZ'):'neuvedeno'}</em></div><div class="archive-actions"><button type="button" data-restore="${type}:${item.id}">↩ Obnovit</button>${isAdmin?`<button type="button" class="danger" data-delete="${type}:${item.id}">Smazat</button>`:''}</div></article>`).join('')||'<div class="empty">Archiv je zatím prázdný.</div>'}</div>`;
  const applyFilter=filter=>{
    const valid=['all','accident','claim','service'].includes(filter)?filter:'all';
    panel.querySelectorAll('.archive-filter button').forEach(button=>button.classList.toggle('active',button.dataset.filter===valid));
    panel.querySelectorAll('.archive-card').forEach(card=>card.hidden=valid!=='all'&&card.dataset.type!==valid);
  };
  panel.querySelectorAll('.archive-filter button').forEach(button=>button.onclick=()=>applyFilter(button.dataset.filter));
  panel.querySelectorAll('[data-restore]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();const[type,id]=button.dataset.restore.split(':');restoreRecord(drone.id,type,id)});
  panel.querySelectorAll('[data-delete]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();const[type,id]=button.dataset.delete.split(':');deleteRecord(drone.id,type,id)});
  applyFilter(selectedFilter);
}

function enhanceDetail(){
  const tabs=document.querySelector('.detail-hero')?.parentElement?.querySelector('.tabs');
  if(!tabs)return;
  let archive=tabs.querySelector('.archive-tab');
  if(!archive){
    archive=document.createElement('button');
    archive.type='button';
    archive.className='archive-tab';
    archive.textContent='Archiv';
    archive.onclick=event=>{event.preventDefault();event.stopPropagation();renderArchive()};
    tabs.appendChild(archive);
    [...tabs.querySelectorAll('button:not(.archive-tab)')].forEach(button=>button.addEventListener('click',()=>{
      tabs.parentElement.querySelector(':scope > .drone-archive-panel')?.setAttribute('hidden','');
      setTimeout(()=>{[...tabs.parentElement.children].forEach(node=>{if(node!==tabs&&!node.classList.contains('drone-archive-panel'))node.hidden=false});hideArchivedInActiveTab()},60);
    }));
  }
  if(!archive.classList.contains('active'))hideArchivedInActiveTab();
}

function scheduleEnhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(()=>{enhanceServiceEditor();enhanceDetail()},90)}
function start(){
  patchStorage();
  document.addEventListener('click',scheduleEnhance,true);
  document.addEventListener('submit',scheduleEnhance,true);
  addEventListener('storage',event=>{if(event.key===STORAGE_KEY)scheduleEnhance()});
  scheduleEnhance();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
