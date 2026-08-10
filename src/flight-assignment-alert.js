const FLIGHT_DATA_KEY='dfm_react_pwa_v1';
const FLIGHT_SESSION_KEY='dfm_auth_session';
const FLIGHT_API='https://dfm-cloud-api.bednarik.workers.dev';
const flightNorm=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');
const flightToday=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let flightCurrentUser=null;
const hiddenFlightKey=()=>`dfm_hidden_flight_alert:${flightCurrentUser?.id||'unknown'}`;

function dismissFlightAlert(box){
  if(!box)return;localStorage.setItem(hiddenFlightKey(),box.dataset.signature||'');box.classList.add('dismissing');setTimeout(()=>box.remove(),260);
}

function prepareFlightAlert(box){
  let startX=0,startY=0,dragX=0,dragging=false;
  box.addEventListener('pointerdown',event=>{if(!matchMedia('(pointer: coarse)').matches)return;startX=event.clientX;startY=event.clientY;dragX=0;dragging=true;box.classList.add('dragging');box.setPointerCapture?.(event.pointerId)});
  box.addEventListener('pointermove',event=>{if(!dragging)return;const dx=event.clientX-startX,dy=event.clientY-startY;if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>8){dragging=false;box.classList.remove('dragging');return;}dragX=Math.min(0,dx);if(dragX<0){box.style.transform=`translateX(${dragX}px)`;box.style.opacity=String(Math.max(.25,1-Math.abs(dragX)/220));}});
  const finish=()=>{if(!dragging)return;dragging=false;box.classList.remove('dragging');if(dragX<=-70){box.dataset.swiped='1';dismissFlightAlert(box);return;}box.style.transform='';box.style.opacity='';if(Math.abs(dragX)>8){box.dataset.swiped='1';setTimeout(()=>delete box.dataset.swiped,80);}};
  box.addEventListener('pointerup',finish);box.addEventListener('pointercancel',finish);
  box.addEventListener('click',event=>{if(box.dataset.swiped==='1'){event.preventDefault();return;}let flightIds=[];try{flightIds=JSON.parse(box.dataset.flightIds||'[]')}catch{}window.dispatchEvent(new CustomEvent('dfm:open-assigned-flights',{detail:{flightIds}}));});
}

async function loadFlightCurrentUser(){
  const token=localStorage.getItem(FLIGHT_SESSION_KEY)||'';if(!token)return null;
  try{const response=await fetch(`${FLIGHT_API}/auth/me`,{headers:{authorization:`Bearer ${token}`}});if(response.ok)flightCurrentUser=(await response.json()).user||null;}catch{}
  return flightCurrentUser;
}

function renderMyFlights(){
  const main=document.querySelector('.app-shell main.content'),welcome=main?.querySelector(':scope > .dashboard-welcome');
  if(!main||!welcome){document.querySelector('.my-flight-alert')?.remove();return;}
  let data={pilots:[],flights:[]};try{data=JSON.parse(localStorage.getItem(FLIGHT_DATA_KEY)||'{}')}catch{}
  const me=flightCurrentUser;if(!me)return;
  const pilotIds=(data.pilots||[]).filter(p=>p.appUserId?String(p.appUserId)===String(me.id):p.email?flightNorm(p.email)===flightNorm(me.email):flightNorm(p.name)===flightNorm(me.name)).map(p=>p.id);
  const flights=(data.flights||[]).filter(f=>(f.assignedUserId?String(f.assignedUserId)===String(me.id):f.assignedEmail?flightNorm(f.assignedEmail)===flightNorm(me.email):pilotIds.includes(f.pilotId))&&!f.completedAt&&(!f.date||f.date>=flightToday())).sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999')));
  let box=main.querySelector(':scope > .my-flight-alert');if(!flights.length){box?.remove();return;}
  const first=flights[0],signature=flights.map(f=>`${f.id}:${f.date||''}:${f.location||''}:${f.assignedUserId||f.pilotId||''}:${f.droneId||''}`).join('|');if(localStorage.getItem(hiddenFlightKey())===signature){box?.remove();return;}
  if(!box){box=document.createElement('div');box.className='my-flight-alert';box.setAttribute('role','button');box.tabIndex=0;prepareFlightAlert(box);}
  const taskAlert=main.querySelector(':scope > .my-task-alert'),anchor=taskAlert||welcome;if(anchor.nextElementSibling!==box)anchor.insertAdjacentElement('afterend',box);
  box.dataset.flightIds=JSON.stringify(flights.map(f=>f.id));if(box.dataset.signature===signature)return;box.dataset.signature=signature;
  box.innerHTML=`<span class="my-flight-alert-icon">🛫</span><div><small>Máte naplánované lety</small><strong>${flights.length} ${flights.length===1?'nadcházející let':'nadcházející lety'}</strong><em>${first.date||'Bez data'} · ${first.location||'Lokalita neuvedena'}${flights.length>1?` · +${flights.length-1} další`:''}</em></div><b>›</b>`;
}

let flightRefreshTimer=0;function scheduleFlightRefresh(){clearTimeout(flightRefreshTimer);flightRefreshTimer=setTimeout(renderMyFlights,100)}
const flightObserver=new MutationObserver(scheduleFlightRefresh);
async function startFlightAlerts(){flightObserver.observe(document.body,{childList:true,subtree:true});await loadFlightCurrentUser();addEventListener('storage',scheduleFlightRefresh);addEventListener('dfm:data-updated',scheduleFlightRefresh);addEventListener('dfm:overview-alert-restored',scheduleFlightRefresh);document.addEventListener('click',scheduleFlightRefresh,true);scheduleFlightRefresh();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startFlightAlerts,{once:true});else startFlightAlerts();
