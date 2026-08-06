const API='https://dfm-cloud-api.bednarik.workers.dev';
const SESSION_KEY='dfm_auth_session';
const VAPID_PUBLIC_KEY='BAUGcOUw2FizW5mr3imCkmF-dTx8M-v_81pJs5dQv2f5JlaW8MO5gQrjjcz26uLa_esFBQ-qFAyJzb_HaOCjreU';

const b64ToBytes=value=>{
  const padded=value.padEnd(Math.ceil(value.length/4)*4,'=');
  const raw=atob(padded.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(raw,char=>char.charCodeAt(0));
};
const token=()=>localStorage.getItem(SESSION_KEY)||'';
const api=async(path,options={})=>{
  const response=await fetch(`${API}${path}`,{...options,headers:{'content-type':'application/json',authorization:`Bearer ${token()}`,...(options.headers||{})}});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok)throw new Error(data.error||`Server odpověděl ${response.status}`);
  return data;
};
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;

async function getSubscription(){
  if(!('serviceWorker'in navigator)||!('PushManager'in window))return null;
  const registration=await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function enablePush(button,status){
  try{
    if(!isStandalone()&&/iPhone|iPad|iPod/i.test(navigator.userAgent))throw new Error('Na iPhonu nejdřív přidejte DFM na plochu a spusťte ji z ikony.');
    if(!('Notification'in window)||!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('Toto zařízení nepodporuje push oznámení.');
    button.disabled=true;status.textContent='Čekám na povolení…';
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('Oznámení nebyla povolena v nastavení telefonu.');
    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(VAPID_PUBLIC_KEY)});
    await api('/push/subscribe',{method:'POST',body:JSON.stringify({subscription:subscription.toJSON(),device:navigator.userAgent.slice(0,240)})});
    status.textContent='Oznámení jsou na tomto zařízení aktivní.';
    button.textContent='Oznámení povolena';button.classList.add('enabled');
  }catch(error){status.textContent=error.message||'Oznámení se nepodařilo zapnout.';button.disabled=false;}
}

async function disablePush(button,status){
  try{
    const subscription=await getSubscription();
    if(subscription){await api('/push/unsubscribe',{method:'POST',body:JSON.stringify({endpoint:subscription.endpoint})});await subscription.unsubscribe();}
    status.textContent='Oznámení jsou na tomto zařízení vypnutá.';
    button.textContent='Povolit oznámení';button.classList.remove('enabled');button.disabled=false;
  }catch(error){status.textContent=error.message||'Oznámení se nepodařilo vypnout.';}
}

async function enhanceSettings(){
  const panel=document.querySelector('.settings-panel');
  if(!panel||panel.querySelector('.push-settings'))return;
  const section=document.createElement('section');
  section.className='push-settings';
  section.innerHTML='<p class="eyebrow">Upozornění</p><h3>Push notifikace</h3><p class="push-description">Nové a změněné úkoly, připomenutí termínu a další důležité události přímo do telefonu.</p><button type="button" class="push-enable">Povolit oznámení</button><button type="button" class="push-disable">Vypnout na tomto zařízení</button><small class="push-status">Kontroluji stav…</small>';
  const about=panel.querySelector('.about-box');
  if(about)panel.insertBefore(section,about);else panel.appendChild(section);
  const enable=section.querySelector('.push-enable'),disable=section.querySelector('.push-disable'),status=section.querySelector('.push-status');
  const subscription=await getSubscription().catch(()=>null);
  if(subscription&&Notification.permission==='granted'){enable.textContent='Oznámení povolena';enable.classList.add('enabled');status.textContent='Oznámení jsou na tomto zařízení aktivní.';}else status.textContent='Oznámení zatím nejsou povolena.';
  enable.onclick=()=>enablePush(enable,status);
  disable.onclick=()=>disablePush(enable,status);
}

let timer=0;
document.addEventListener('click',()=>{clearTimeout(timer);timer=setTimeout(enhanceSettings,120)},true);
