const NC_DATA='dfm_react_pwa_v1',NC_SESSION='dfm_auth_session',NC_CHAT='dfm_chat_state_v1',NC_API='https://dfm-cloud-api.bednarik.workers.dev';
const ncNorm=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');
const ncToday=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const ncTaskTitle=task=>String(task?.custom||task?.type||'Úkol').split('<<<DFM_TASK_TEXT>>>')[0].trim()||'Úkol';
let ncUser=null,ncOpen=false,ncTimer=0;

async function loadNcUser(){const token=localStorage.getItem(NC_SESSION)||'';if(!token)return;try{const response=await fetch(`${NC_API}/auth/me`,{headers:{authorization:`Bearer ${token}`}});if(response.ok)ncUser=(await response.json()).user||null;}catch{}}
function ncRoles(){return Array.isArray(ncUser?.roles)?ncUser.roles:String(ncUser?.role||'').split(',')}
function readKeys(){try{return new Set(JSON.parse(localStorage.getItem(`dfm_notification_read:${ncUser?.id}`)||'[]'))}catch{return new Set()}}
function saveKeys(keys){if(ncUser?.id)localStorage.setItem(`dfm_notification_read:${ncUser.id}`,JSON.stringify([...keys].slice(-500)))}
function licenseDays(date){const a=new Date(`${date}T00:00:00`),b=new Date();b.setHours(0,0,0,0);return Math.round((a-b)/86400000)}
function myPilot(p){return p.appUserId?String(p.appUserId)===String(ncUser?.id):p.email?ncNorm(p.email)===ncNorm(ncUser?.email):ncNorm(p.name)===ncNorm(ncUser?.name)}

function collectNotifications(){
  if(!ncUser)return[];let data={tasks:[],flights:[],pilots:[],drones:[]};try{data=JSON.parse(localStorage.getItem(NC_DATA)||'{}')}catch{}
  const items=[],identities=[ncUser.id,ncUser.email,ncUser.name].filter(Boolean).map(ncNorm),isAdmin=ncRoles().includes('admin'),today=ncToday();
  (data.tasks||[]).filter(t=>!(t.done===true||t.done==='Ano')&&[t.assignedUserId,t.assignedEmail,t.assignedTo].filter(Boolean).map(ncNorm).some(v=>identities.includes(v))).forEach(t=>items.push({key:`task:${t.id}:${t.dueDate||''}:${t.assignedUserId||t.assignedEmail||t.assignedTo||''}`,type:'task',recordType:'task',recordId:t.id,icon:'✓',title:ncTaskTitle(t),detail:t.dueDate?`Termín ${t.dueDate}`:'Bez termínu'}));
  const pilotIds=(data.pilots||[]).filter(myPilot).map(p=>p.id);(data.flights||[]).filter(f=>pilotIds.includes(f.pilotId)&&(!f.date||f.date>=today)).forEach(f=>items.push({key:`flight:${f.id}:${f.date||''}:${f.pilotId||''}:${f.location||''}`,type:'flight',recordType:'flight',recordId:f.id,icon:'🛫',title:f.location||'Naplánovaný let',detail:f.date||'Datum neuvedeno'}));
  (data.pilots||[]).filter(p=>p.licenseUntil&&(isAdmin||myPilot(p))).map(p=>({...p,days:licenseDays(p.licenseUntil)})).filter(p=>p.days<=30).forEach(p=>{const stage=p.days<0?'expired':p.days<=0?'0':p.days<=1?'1':p.days<=7?'7':'30';items.push({key:`license:${p.id}:${p.licenseUntil}:${stage}`,type:p.days<0?'danger':'license',recordType:'pilot',recordId:p.id,icon:'⚠',title:`Licence · ${p.name||'Pilot'}`,detail:p.days<0?`Propadla před ${Math.abs(p.days)} dny`:p.days===0?'Končí dnes':`Končí za ${p.days} dní`});});
  if(isAdmin)(data.drones||[]).forEach(d=>{(d.accidents||[]).filter(x=>!(x.status==='Ano'||x.resolved===true)).forEach(x=>items.push({key:`accident:${d.id}:${x.id}:${x.status||''}`,type:'danger',recordType:'accident',recordId:x.id,droneId:d.id,icon:'🚨',title:x.title||'Aktivní nehoda',detail:d.name||'Dron'}));(d.claims||[]).filter(x=>x.status!=='Vyřízeno').forEach(x=>items.push({key:`claim:${d.id}:${x.id}:${x.status||''}`,type:'claim',recordType:'claim',recordId:x.id,droneId:d.id,icon:'⚠',title:x.title||'Aktivní reklamace',detail:d.name||'Dron'}));(d.services||[]).filter(x=>!(x.status==='Ano'||x.resolved===true)).forEach(x=>items.push({key:`service:${d.id}:${x.id}:${x.status||''}`,type:'service',recordType:'service',recordId:x.id,droneId:d.id,icon:'🔧',title:x.title||'Aktivní servis',detail:d.name||'Dron'}));});
  try{const chat=JSON.parse(localStorage.getItem(`${NC_CHAT}:${ncUser.id}`)||'{}'),ids=Array.isArray(chat.unreadIds)?chat.unreadIds:[];ids.forEach(id=>items.push({key:`chat:${id}`,type:'chat',icon:'💬',title:'Nová zpráva v chatu',detail:'DFM Chat',section:'chat'}));}catch{}
  return items;
}

function navigateTo(item){closeCenter();if(item.section==='chat'){document.querySelector('.chat-fab')?.click();return;}if(item.recordType==='flight'&&item.recordId){dispatchEvent(new CustomEvent('dfm:open-assigned-flights',{detail:{flightIds:[item.recordId]}}));return;}if(item.recordType&&item.recordId){dispatchEvent(new CustomEvent('dfm:open-record',{detail:{type:item.recordType,id:item.recordId,droneId:item.droneId||''}}));return;}}
function closeCenter(){document.querySelector('.notification-center-overlay')?.remove();ncOpen=false}
function openCenter(){
  closeCenter();ncOpen=true;const items=collectNotifications(),read=readKeys();
  const overlay=document.createElement('div');overlay.className='notification-center-overlay';overlay.innerHTML=`<section class="notification-center-panel"><header><div><small>Aktuality</small><h2>Upozornění</h2></div><button type="button" class="notification-center-close">×</button></header><div class="notification-center-list"></div>${items.length?'<button type="button" class="notification-clear">Označit vše jako přečtené</button>':''}</section>`;
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeCenter()});overlay.querySelector('.notification-center-close').addEventListener('click',closeCenter);const list=overlay.querySelector('.notification-center-list');
  if(!items.length)list.innerHTML='<div class="notification-empty"><span>✓</span><strong>Všechno je vyřízené</strong><small>Nemáte žádná aktuální upozornění.</small></div>';
  items.forEach(item=>{const button=document.createElement('button'),icon=document.createElement('span'),content=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small'),arrow=document.createElement('b'),seen=read.has(item.key);button.type='button';button.className=`notification-item ${item.type}${seen?' read':''}`;icon.textContent=item.icon;title.textContent=item.title;detail.textContent=seen?`${item.detail} · zobrazeno`:item.detail;arrow.textContent='›';content.append(title,detail);button.append(icon,content,arrow);button.addEventListener('click',()=>{const keys=readKeys();keys.add(item.key);saveKeys(keys);button.classList.add('read');updateNotificationBell();navigateTo(item)});list.appendChild(button);});
  overlay.querySelector('.notification-clear')?.addEventListener('click',()=>{saveKeys(new Set(items.map(item=>item.key)));updateNotificationBell();closeCenter()});document.body.appendChild(overlay);updateNotificationBell();
}

function updateNotificationBell(){
  if(!ncUser)return;let bell=document.querySelector('.notification-bell');if(!bell){bell=document.createElement('button');bell.type='button';bell.className='notification-bell';bell.setAttribute('aria-label','Otevřít centrum upozornění');bell.innerHTML='<span>🔔</span><b></b>';bell.addEventListener('click',openCenter);document.body.appendChild(bell);}
  const read=readKeys(),count=collectNotifications().filter(item=>!read.has(item.key)).length,badge=bell.querySelector('b'),label=count>99?'99+':String(count);if(badge.textContent!==label)badge.textContent=label;if(badge.hidden!==(count===0))badge.hidden=count===0;if(bell.hidden!==(count===0))bell.hidden=count===0;if(ncOpen)document.querySelector('.notification-center-list')||closeCenter();
}
function scheduleNc(){clearTimeout(ncTimer);ncTimer=setTimeout(updateNotificationBell,120)}
const ncObserver=new MutationObserver(scheduleNc);async function startNc(){ncObserver.observe(document.body,{childList:true,subtree:true});await loadNcUser();addEventListener('storage',scheduleNc);addEventListener('dfm:data-updated',scheduleNc);addEventListener('dfm:chat-changed',scheduleNc);document.addEventListener('click',scheduleNc,true);scheduleNc();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startNc,{once:true});else startNc();
