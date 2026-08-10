const LICENSE_DATA_KEY='dfm_react_pwa_v1',LICENSE_SESSION_KEY='dfm_auth_session',LICENSE_API='https://dfm-cloud-api.bednarik.workers.dev';
const licenseNorm=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');
let licenseUser=null;
async function loadLicenseUser(){const token=localStorage.getItem(LICENSE_SESSION_KEY)||'';if(!token)return;try{const response=await fetch(`${LICENSE_API}/auth/me`,{headers:{authorization:`Bearer ${token}`}});if(response.ok)licenseUser=(await response.json()).user||null;}catch{}}
function licenseDays(date){const today=new Date();today.setHours(0,0,0,0);const end=new Date(`${date}T00:00:00`);return Math.round((end-today)/86400000)}
function renderLicenseAlert(){
  const main=document.querySelector('.app-shell main.content'),welcome=main?.querySelector(':scope > .dashboard-welcome');if(!main||!welcome){document.querySelector('.license-expiry-alert')?.remove();return;}if(!licenseUser)return;
  let data={pilots:[]};try{data=JSON.parse(localStorage.getItem(LICENSE_DATA_KEY)||'{}')}catch{}
  const roles=Array.isArray(licenseUser.roles)?licenseUser.roles:String(licenseUser.role||'').split(','),isAdmin=roles.includes('admin');
  const pilots=(data.pilots||[]).filter(p=>p.licenseUntil&&(isAdmin||(p.appUserId?String(p.appUserId)===String(licenseUser.id):p.email?licenseNorm(p.email)===licenseNorm(licenseUser.email):licenseNorm(p.name)===licenseNorm(licenseUser.name)))).map(p=>({...p,days:licenseDays(p.licenseUntil)})).filter(p=>p.days<=30).sort((a,b)=>a.days-b.days);
  let box=main.querySelector(':scope > .license-expiry-alert');if(!pilots.length){box?.remove();return;}if(!box){box=document.createElement('button');box.type='button';box.className='license-expiry-alert';box.addEventListener('click',()=>{const target=[...document.querySelectorAll('.dashboard-button')].find(button=>licenseNorm(button.textContent).includes('piloti'));target?.click();});}
  const anchor=main.querySelector(':scope > .my-flight-alert')||main.querySelector(':scope > .my-task-alert')||welcome;if(anchor.nextElementSibling!==box)anchor.insertAdjacentElement('afterend',box);
  const first=pilots[0],signature=`${pilots.length}:${first.id}:${first.licenseUntil}:${first.days}`;if(box.dataset.signature===signature)return;box.dataset.signature=signature;const when=first.days<0?`propadla před ${Math.abs(first.days)} dny`:first.days===0?'končí dnes':`končí za ${first.days} dní`;box.classList.toggle('expired',first.days<0);box.innerHTML=`<span class="license-expiry-icon">⚠</span><div><small>Platnost pilotní licence</small><strong>${first.name||'Pilot'} · ${when}</strong><em>${first.license||'Číslo licence neuvedeno'}${pilots.length>1?` · +${pilots.length-1} další`:''}</em></div><b>›</b>`;
}
let licenseTimer=0;function scheduleLicenseAlert(){clearTimeout(licenseTimer);licenseTimer=setTimeout(renderLicenseAlert,120)}
const licenseObserver=new MutationObserver(scheduleLicenseAlert);async function startLicenseAlerts(){licenseObserver.observe(document.body,{childList:true,subtree:true});await loadLicenseUser();addEventListener('storage',scheduleLicenseAlert);addEventListener('dfm:data-updated',scheduleLicenseAlert);document.addEventListener('click',scheduleLicenseAlert,true);scheduleLicenseAlert();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startLicenseAlerts,{once:true});else startLicenseAlerts();
