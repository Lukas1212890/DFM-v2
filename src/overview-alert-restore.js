const RESTORE_PREFIX={task:'dfm_hidden_task_alert:',flight:'dfm_hidden_flight_alert:',pilot:'dfm_hidden_license_alert:'};
const restoreNorm=value=>String(value||'').trim().toLowerCase();

function addRestoreButton(panel){
  if(!(panel instanceof HTMLElement)||panel.querySelector('.overview-alert-restore'))return;
  const type=restoreNorm(panel.querySelector('.sheet-header h2')?.textContent),prefix=RESTORE_PREFIX[type];if(!prefix)return;
  const hidden=Object.keys(localStorage).some(key=>key.startsWith(prefix));if(!hidden)return;
  const actions=panel.querySelector('.sheet-actions');if(!actions)return;
  const button=document.createElement('button');button.type='button';button.className='overview-alert-restore';button.textContent='↩ Obnovit na přehled';
  button.addEventListener('click',()=>{Object.keys(localStorage).filter(key=>key.startsWith(prefix)).forEach(key=>localStorage.removeItem(key));dispatchEvent(new CustomEvent('dfm:overview-alert-restored',{detail:{type}}));button.textContent='✓ Obnoveno na přehled';button.disabled=true;});
  actions.prepend(button);
}

const restoreObserver=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(!(node instanceof HTMLElement))return;if(node.matches?.('.sheet-panel'))addRestoreButton(node);node.querySelectorAll?.('.sheet-panel').forEach(addRestoreButton)})));
function startRestore(){restoreObserver.observe(document.body,{childList:true,subtree:true});document.querySelectorAll('.sheet-panel').forEach(addRestoreButton)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startRestore,{once:true});else startRestore();
