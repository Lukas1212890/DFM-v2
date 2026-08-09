const FLIGHT_DATA_KEY='dfm_react_pwa_v1';
const FLIGHT_SESSION_KEY='dfm_auth_session';
const FLIGHT_API='https://dfm-cloud-api.bednarik.workers.dev';
const flightNorm=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');
const flightToday=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let flightCurrentUser=null;

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
  const pilotIds=(data.pilots||[]).filter(p=>p.appUserId===me.id||flightNorm(p.email)===flightNorm(me.email)||(!p.appUserId&&!p.email&&flightNorm(p.name)===flightNorm(me.name))).map(p=>p.id);
  const flights=(data.flights||[]).filter(f=>pilotIds.includes(f.pilotId)&&(!f.date||f.date>=flightToday())).sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999')));
  let box=main.querySelector(':scope > .my-flight-alert');if(!flights.length){box?.remove();return;}
  if(!box){box=document.createElement('button');box.type='button';box.className='my-flight-alert';box.addEventListener('click',()=>{const button=[...document.querySelectorAll('.bottom-nav button')].find(x=>flightNorm(x.textContent)==='🛫lety'||flightNorm(x.textContent).endsWith('lety'));button?.click();});}
  const taskAlert=main.querySelector(':scope > .my-task-alert'),anchor=taskAlert||welcome;if(anchor.nextElementSibling!==box)anchor.insertAdjacentElement('afterend',box);
  const first=flights[0],signature=`${flights.length}:${first.id}:${first.date}:${first.location}`;if(box.dataset.signature===signature)return;box.dataset.signature=signature;
  box.innerHTML=`<span class="my-flight-alert-icon">🛫</span><div><small>Máte naplánované lety</small><strong>${flights.length} ${flights.length===1?'nadcházející let':'nadcházející lety'}</strong><em>${first.date||'Bez data'} · ${first.location||'Lokalita neuvedena'}${flights.length>1?` · +${flights.length-1} další`:''}</em></div><b>›</b>`;
}

let flightRefreshTimer=0;function scheduleFlightRefresh(){clearTimeout(flightRefreshTimer);flightRefreshTimer=setTimeout(renderMyFlights,100)}
const flightObserver=new MutationObserver(scheduleFlightRefresh);
async function startFlightAlerts(){flightObserver.observe(document.body,{childList:true,subtree:true});await loadFlightCurrentUser();addEventListener('storage',scheduleFlightRefresh);addEventListener('dfm:data-updated',scheduleFlightRefresh);document.addEventListener('click',scheduleFlightRefresh,true);scheduleFlightRefresh();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startFlightAlerts,{once:true});else startFlightAlerts();
