const DATA_KEY='dfm_react_pwa_v1';
const CONFIG_KEY='dfm_outlook_config_v1';
const TOKEN_KEY='dfm_outlook_token_v1';
const MAP_KEY='dfm_outlook_event_map_v1';
const OAUTH_KEY='dfm_outlook_oauth_v1';
const GRAPH='https://graph.microsoft.com/v1.0';
const DEFAULT_TENANT='common';
const SCOPES='openid profile offline_access User.Read Calendars.ReadWrite';
let syncing=false;
let lastSignature='';
let timer=0;

const readJson=(key,fallback={})=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
const writeJson=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const isoDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
const isDone=item=>item?.done===true||item?.done==='Ano';
const isResolved=(type,item)=>type==='claim'?item?.status==='Vyřízeno':item?.status==='Ano'||item?.resolved===true;
const redirectUri=()=>`${location.origin}${location.pathname}`;

function randomString(length=64){
  const bytes=crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map(value=>'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[value%66]).join('');
}
async function sha256(value){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))}
function base64Url(buffer){return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}

function config(){return readJson(CONFIG_KEY,{clientId:'',tenant:DEFAULT_TENANT,enabled:false})}
function token(){return readJson(TOKEN_KEY,{})}
function tokenEndpoint(tenant){return `https://login.microsoftonline.com/${encodeURIComponent(tenant||DEFAULT_TENANT)}/oauth2/v2.0/token`}

async function connectOutlook(){
  const cfg=config();
  if(!cfg.clientId){alert('Nejdříve zadejte Application (client) ID z Microsoft Entra.');return}
  const verifier=randomString(72),state=randomString(32),challenge=base64Url(await sha256(verifier));
  writeJson(OAUTH_KEY,{verifier,state,createdAt:Date.now(),returnUrl:location.href});
  const params=new URLSearchParams({client_id:cfg.clientId,response_type:'code',redirect_uri:redirectUri(),response_mode:'query',scope:SCOPES,state,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'});
  location.href=`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant||DEFAULT_TENANT)}/oauth2/v2.0/authorize?${params}`;
}

async function exchangeCode(){
  const params=new URLSearchParams(location.search),code=params.get('code'),state=params.get('state');
  if(!code)return false;
  const oauth=readJson(OAUTH_KEY,{}),cfg=config();
  try{
    if(!oauth.verifier||oauth.state!==state)throw new Error('Ověření přihlášení do Outlooku nebylo platné.');
    const body=new URLSearchParams({client_id:cfg.clientId,grant_type:'authorization_code',code,redirect_uri:redirectUri(),code_verifier:oauth.verifier,scope:SCOPES});
    const response=await fetch(tokenEndpoint(cfg.tenant),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error_description||'Microsoft přihlášení selhalo.');
    writeJson(TOKEN_KEY,{...payload,expiresAt:Date.now()+Number(payload.expires_in||3600)*1000});
    writeJson(CONFIG_KEY,{...cfg,enabled:true});
    localStorage.removeItem(OAUTH_KEY);
    history.replaceState(null,'',location.pathname+location.hash);
    setTimeout(()=>{renderSettings();syncAll(true)},100);
    return true;
  }catch(error){
    history.replaceState(null,'',location.pathname+location.hash);
    alert(error.message);
    return false;
  }
}

async function accessToken(){
  const current=token();
  if(current.access_token&&Number(current.expiresAt||0)>Date.now()+60000)return current.access_token;
  if(!current.refresh_token)throw new Error('Outlook není připojený.');
  const cfg=config();
  const body=new URLSearchParams({client_id:cfg.clientId,grant_type:'refresh_token',refresh_token:current.refresh_token,scope:SCOPES});
  const response=await fetch(tokenEndpoint(cfg.tenant),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error_description||'Připojení k Outlooku vypršelo.');
  writeJson(TOKEN_KEY,{...current,...payload,expiresAt:Date.now()+Number(payload.expires_in||3600)*1000});
  return payload.access_token;
}

async function graph(path,options={}){
  const bearer=await accessToken();
  const response=await fetch(`${GRAPH}${path}`,{...options,headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json',Prefer:'outlook.timezone="Central Europe Standard Time"',...(options.headers||{})}});
  if(response.status===204)return null;
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error?.message||`Outlook odpověděl ${response.status}`);
  return payload;
}

function eventTimes(date,startTime,endTime){
  const start=startTime||'09:00',end=endTime||'';
  const [hour,minute]=start.split(':').map(Number);
  let endHour,endMinute;
  if(end){[endHour,endMinute]=end.split(':').map(Number)}else{endHour=hour+1;endMinute=minute}
  const pad=value=>String(value).padStart(2,'0');
  return {start:{dateTime:`${date}T${pad(hour)}:${pad(minute)}:00`,timeZone:'Central Europe Standard Time'},end:{dateTime:`${date}T${pad(endHour%24)}:${pad(endMinute)}:00`,timeZone:'Central Europe Standard Time'}};
}

function collectEvents(data){
  const output=[];
  const pilots=new Map((data.pilots||[]).map(item=>[item.id,item.name]));
  const drones=new Map((data.drones||[]).map(item=>[item.id,item.name]));
  const push=(key,type,date,subject,description='',location='',startTime='',endTime='')=>{
    if(!isoDate(date))return;
    output.push({key,type,body:{subject:`${type} ${subject}`.trim(),body:{contentType:'text',content:`Vytvořeno v DFM\n\n${description}`.trim()},location:{displayName:location||''},...eventTimes(date,startTime,endTime),categories:['DFM']}});
  };
  (data.flights||[]).forEach(item=>push(`flight:${item.id}`,'✈️',item.date,item.location||item.purpose||'Plánovaný let',`Účel: ${item.purpose||'neuveden'}\nDron: ${drones.get(item.droneId)||'neuveden'}\nPilot: ${pilots.get(item.pilotId)||'neuveden'}\n${item.notes||''}`,item.location,item.time||item.startTime,item.endTime));
  (data.tasks||[]).filter(item=>!isDone(item)).forEach(item=>push(`task:${item.id}`,'📋',item.dueDate,item.title||item.custom||item.type||'Úkol',`${item.text||item.description||''}\nPřiřazeno: ${item.assignedTo||'neuvedeno'}`));
  (data.drones||[]).forEach(drone=>{
    (drone.services||[]).filter(item=>!isResolved('service',item)).forEach(item=>push(`service:${drone.id}:${item.id}`,'🔧',item.date,item.title||'Servis',`Dron: ${drone.name}\nServis/technik: ${item.technician||'neuveden'}\n${item.description||''}`));
    (drone.claims||[]).filter(item=>!isResolved('claim',item)).forEach(item=>push(`claim:${drone.id}:${item.id}`,'⚠️',item.date,item.title||'Reklamace',`Dron: ${drone.name}\n${item.description||''}`));
    (drone.accidents||[]).filter(item=>!isResolved('accident',item)).forEach(item=>push(`accident:${drone.id}:${item.id}`,'🚨',item.date,item.title||'Nehoda',`Dron: ${drone.name}\nPilot: ${item.pilot||'neuveden'}\n${item.description||''}`));
  });
  return output;
}

async function syncAll(showResult=false){
  const cfg=config();
  if(syncing||!cfg.enabled||!cfg.clientId||!navigator.onLine)return;
  syncing=true;setStatus('Synchronizuji…','working');
  try{
    const data=readJson(DATA_KEY,{drones:[],pilots:[],flights:[],tasks:[]}),desired=collectEvents(data),mapping=readJson(MAP_KEY,{}),desiredKeys=new Set(desired.map(item=>item.key));
    for(const event of desired){
      const existing=mapping[event.key];
      if(existing?.id){
        await graph(`/me/events/${encodeURIComponent(existing.id)}`,{method:'PATCH',body:JSON.stringify(event.body)});
      }else{
        const created=await graph('/me/events',{method:'POST',body:JSON.stringify({...event.body,transactionId:crypto.randomUUID()})});
        mapping[event.key]={id:created.id};
      }
    }
    for(const [key,value] of Object.entries(mapping)){
      if(desiredKeys.has(key))continue;
      try{await graph(`/me/events/${encodeURIComponent(value.id)}`,{method:'DELETE'})}catch{}
      delete mapping[key];
    }
    writeJson(MAP_KEY,mapping);lastSignature=JSON.stringify(data);setStatus(`Synchronizováno · ${desired.length} položek`,'ok');
    if(showResult)alert(`Outlook byl synchronizován. Celkem ${desired.length} aktivních položek.`);
  }catch(error){setStatus(error.message,'error');if(showResult)alert(error.message)}finally{syncing=false}
}

function disconnect(){
  if(!confirm('Odpojit Outlook? Již vytvořené události v kalendáři zůstanou zachované.'))return;
  localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(MAP_KEY);writeJson(CONFIG_KEY,{...config(),enabled:false});renderSettings();
}

function setStatus(text,state=''){
  document.querySelectorAll('.outlook-status').forEach(node=>{node.textContent=text;node.dataset.state=state});
}

function renderSettings(){
  const panel=document.querySelector('.settings-panel');
  if(!panel)return;
  let box=panel.querySelector('.outlook-settings');
  if(!box){box=document.createElement('section');box.className='outlook-settings';panel.querySelector('.about-box')?.insertAdjacentElement('beforebegin',box)}
  const cfg=config(),connected=Boolean(token().access_token||token().refresh_token);
  box.innerHTML=`<div class="outlook-title"><span>📅</span><div><strong>Outlook kalendář</strong><small>Jednosměrně z DFM do Outlooku</small></div></div><label>Application (client) ID<input class="outlook-client-id" value="${esc(cfg.clientId)}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></label><label>Tenant<input class="outlook-tenant" value="${esc(cfg.tenant||DEFAULT_TENANT)}" placeholder="common"></label><p class="outlook-status" data-state="${connected?'ok':''}">${connected?'Outlook je připojený.':'Outlook zatím není připojený.'}</p><div class="outlook-actions"><button type="button" class="outlook-save">Uložit nastavení</button>${connected?'<button type="button" class="outlook-sync">Synchronizovat nyní</button><button type="button" class="outlook-disconnect">Odpojit</button>':'<button type="button" class="outlook-connect">Připojit Outlook</button>'}</div>`;
  box.querySelector('.outlook-save').onclick=()=>{writeJson(CONFIG_KEY,{...cfg,clientId:box.querySelector('.outlook-client-id').value.trim(),tenant:box.querySelector('.outlook-tenant').value.trim()||DEFAULT_TENANT});setStatus('Nastavení uloženo.','ok')};
  box.querySelector('.outlook-connect')?.addEventListener('click',()=>{box.querySelector('.outlook-save').click();connectOutlook()});
  box.querySelector('.outlook-sync')?.addEventListener('click',()=>syncAll(true));
  box.querySelector('.outlook-disconnect')?.addEventListener('click',disconnect);
}

function start(){
  exchangeCode();
  const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node instanceof HTMLElement&&(node.matches?.('.settings-overlay,.settings-panel')||node.querySelector?.('.settings-panel')))))renderSettings()});
  observer.observe(document.body,{childList:true,subtree:true});
  timer=setInterval(()=>{
    const cfg=config();if(!cfg.enabled)return;
    const current=localStorage.getItem(DATA_KEY)||'';
    if(current!==lastSignature){clearTimeout(start.syncDelay);start.syncDelay=setTimeout(()=>syncAll(false),1500)}
  },4000);
  addEventListener('online',()=>syncAll(false));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
