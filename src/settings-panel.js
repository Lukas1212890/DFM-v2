const DFM_KEY='dfm_react_pwa_v1';
const DFM_VERSION='0.9 Beta';
function showSettings(){
 document.querySelector('.settings-overlay')?.remove();
 const overlay=document.createElement('div');
 overlay.className='settings-overlay';
 overlay.innerHTML=`<section class="settings-panel"><header><h2>Nastavení</h2><button class="settings-close">×</button></header><button class="settings-option settings-export">Exportovat zálohu</button><p style="color:#8fa2bd;font-size:.8rem">Data jsou uložena v tomto zařízení.</p><div style="margin-top:18px;padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.035)"><p style="margin:0 0 5px;color:#8fa2bd;font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase">O aplikaci</p><strong style="display:block;font-size:1rem">Drone Fleet Manager</strong><span style="display:block;margin-top:5px;color:#9bcbff;font-size:.8rem">Verze ${DFM_VERSION}</span><span style="display:block;margin-top:5px;color:#8fa2bd;font-size:.75rem">DroneTech · React PWA</span></div></section>`;
 document.body.appendChild(overlay);
 overlay.querySelector('.settings-close').onclick=()=>overlay.remove();
 overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
 overlay.querySelector('.settings-export').onclick=()=>{
  const data=localStorage.getItem(DFM_KEY)||'{}';
  const blob=new Blob([data],{type:'application/json'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download='DFM-zaloha.json';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
 };
}
function connectSettings(){const button=document.querySelector('.topbar>.icon-button');if(!button||button.dataset.panelReady)return;button.dataset.panelReady='1';button.onclick=showSettings;}
new MutationObserver(connectSettings).observe(document.documentElement,{childList:true,subtree:true});connectSettings();