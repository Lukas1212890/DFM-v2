const DFM_KEY='dfm_react_pwa_v1';
function showSettings(){
 document.querySelector('.settings-overlay')?.remove();
 const overlay=document.createElement('div');
 overlay.className='settings-overlay';
 overlay.innerHTML='<section class="settings-panel"><header><h2>Nastavení</h2><button class="settings-close">×</button></header><button class="settings-option settings-export">Exportovat zálohu</button><p style="color:#8fa2bd;font-size:.8rem">Data jsou uložena v tomto zařízení.</p></section>';
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