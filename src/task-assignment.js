const STORAGE_KEY='dfm_react_pwa_v1';
const SESSION_KEY='dfm_auth_session';
const API='https://dfm-cloud-api.bednarik.workers.dev';
const DIRECTORY_KEY='dfm_user_directory';

const norm=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');
const taskTitle=task=>String(task?.title||task?.custom||(task?.type&&task.type!=='Ostatní'?task.type:'')||'Úkol').trim();

async function request(path){
  const token=localStorage.getItem(SESSION_KEY)||'';
  if(!token)throw new Error('Bez relace');
  const response=await fetch(`${API}${path}`,{headers:{authorization:`Bearer ${token}`,'content-type':'application/json'}});
  if(!response.ok)throw new Error(String(response.status));
  return response.json();
}

async function loadDirectory(){
  let cached=[];
  try{cached=JSON.parse(localStorage.getItem(DIRECTORY_KEY)||'[]')}catch{}
  try{
    const me=(await request('/auth/me')).user;
    if(me&&!cached.some(x=>x.id===me.id))cached.push({id:me.id,name:me.name,email:me.email,active:1});
  }catch{}
  try{
    const users=(await request('/admin/users')).users||[];
    cached=users.filter(x=>x.active!==0).map(x=>({id:x.id,name:x.name,email:x.email,active:x.active}));
  }catch{}
  localStorage.setItem(DIRECTORY_KEY,JSON.stringify(cached));
  return cached;
}

function currentUser(){
  const chip=document.querySelector('.user-chip');
  const name=chip?.querySelector('strong')?.textContent?.trim()||chip?.getAttribute('aria-label')||'';
  let directory=[];
  try{directory=JSON.parse(localStorage.getItem(DIRECTORY_KEY)||'[]')}catch{}
  return directory.find(x=>norm(x.name)===norm(name))||{name};
}

function syncInput(input,value){
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  setter?.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
}

async function enhanceTaskEditor(panel){
  if(panel.dataset.taskEnhanced==='1')return;
  const heading=panel.querySelector('.sheet-header h2');
  if(norm(heading?.textContent)!=='task')return;
  panel.dataset.taskEnhanced='1';
  const fields=[...panel.querySelectorAll('.form-fields > .field')];
  const byLabel=label=>fields.find(f=>norm(f.querySelector('span')?.textContent)===norm(label));
  const typeField=byLabel('Typ úkolu');
  const customField=byLabel('Vlastní úkol');
  const assignedField=byLabel('Přiřazeno');
  if(typeField)typeField.hidden=true;
  if(customField){
    const label=customField.querySelector('span');
    const input=customField.querySelector('input');
    if(label)label.textContent='Úkol';
    if(input){
      input.placeholder='Napište konkrétní úkol…';
      input.required=true;
      if(!input.value&&typeField){
        const oldType=typeField.querySelector('select')?.value||'';
        if(oldType&&oldType!=='Ostatní')syncInput(input,oldType);
      }
    }
  }
  if(assignedField){
    const original=assignedField.querySelector('input');
    if(original&&!assignedField.querySelector('select')){
      const directory=await loadDirectory();
      const select=document.createElement('select');
      select.className='task-assignee-select';
      select.innerHTML='<option value="">Bez přiřazení</option>';
      const seen=new Set();
      directory.forEach(user=>{
        const name=String(user.name||user.email||'').trim();
        if(!name||seen.has(norm(name)))return;
        seen.add(norm(name));
        const option=document.createElement('option');
        option.value=name;
        option.textContent=user.email?`${name} · ${user.email}`:name;
        select.appendChild(option);
      });
      if(original.value&&!seen.has(norm(original.value))){
        const option=document.createElement('option');
        option.value=original.value;
        option.textContent=original.value;
        select.appendChild(option);
      }
      select.value=original.value||'';
      select.disabled=original.disabled;
      select.addEventListener('change',()=>syncInput(original,select.value));
      original.hidden=true;
      original.insertAdjacentElement('afterend',select);
    }
  }
}

function renderMyTasks(){
  const main=document.querySelector('.app-shell main.content');
  if(!main||!main.querySelector('.dashboard-welcome'))return;
  let data={tasks:[]};
  try{data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{}
  const me=currentUser();
  const identities=[me.name,me.email,me.id].filter(Boolean).map(norm);
  if(!identities.length)return;
  const tasks=(data.tasks||[]).filter(task=>{
    const assigned=[task.assignedTo,task.assignedUserId,task.assignedEmail].filter(Boolean).map(norm);
    const done=task.done===true||task.done==='Ano';
    return !done&&assigned.some(x=>identities.includes(x));
  });
  let box=main.querySelector('.my-task-alert');
  if(!tasks.length){box?.remove();return;}
  if(!box){
    box=document.createElement('button');
    box.type='button';
    box.className='my-task-alert';
    const welcome=main.querySelector('.dashboard-welcome');
    welcome.insertAdjacentElement('afterend',box);
    box.addEventListener('click',()=>{
      const taskButton=[...document.querySelectorAll('.dashboard-button,.attention-button')].find(x=>norm(x.textContent).includes('otevřené úkoly')||norm(x.textContent).includes('otevřených úkolů'));
      taskButton?.click();
    });
  }
  const first=tasks[0];
  box.innerHTML=`<span class="my-task-alert-icon">!</span><div><small>Máte přiřazené úkoly</small><strong>${tasks.length} ${tasks.length===1?'otevřený úkol':'otevřené úkoly'}</strong><em>${taskTitle(first)}${tasks.length>1?` · +${tasks.length-1} další`:''}</em></div><b>›</b>`;
}

const observer=new MutationObserver(()=>{
  document.querySelectorAll('.sheet-panel').forEach(enhanceTaskEditor);
  renderMyTasks();
});

function start(){
  loadDirectory().finally(()=>renderMyTasks());
  observer.observe(document.body,{childList:true,subtree:true});
  document.querySelectorAll('.sheet-panel').forEach(enhanceTaskEditor);
  renderMyTasks();
  addEventListener('storage',renderMyTasks);
  setInterval(renderMyTasks,5000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
