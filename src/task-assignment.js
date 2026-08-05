const STORAGE_KEY='dfm_react_pwa_v1';
const SESSION_KEY='dfm_auth_session';
const API='https://dfm-cloud-api.bednarik.workers.dev';
const DIRECTORY_KEY='dfm_user_directory';
const TASK_MARKER='<<<DFM_TASK_TEXT>>>';

const norm=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');
const unpackTask=value=>{const raw=String(value||'');const index=raw.indexOf(TASK_MARKER);return index<0?{title:raw.trim(),text:''}:{title:raw.slice(0,index).trim(),text:raw.slice(index+TASK_MARKER.length).trim()}};
const packTask=(title,text)=>`${String(title||'').trim()}${TASK_MARKER}${String(text||'').trim()}`;
const taskTitle=task=>{const packed=unpackTask(task?.custom);return packed.title||String(task?.title||(task?.type&&task.type!=='Ostatní'?task.type:'')||'Úkol').trim()};

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
  try{localStorage.setItem(DIRECTORY_KEY,JSON.stringify(cached))}catch{}
  return cached;
}

function currentUser(){
  const chip=document.querySelector('.user-chip');
  const name=chip?.querySelector('strong')?.textContent?.trim()||'';
  let directory=[];
  try{directory=JSON.parse(localStorage.getItem(DIRECTORY_KEY)||'[]')}catch{}
  return directory.find(x=>norm(x.name)===norm(name))||{name};
}

function setReactValue(control,value){
  const proto=control instanceof HTMLSelectElement?HTMLSelectElement.prototype:control instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
  setter?.call(control,value);
  control.dispatchEvent(new Event('input',{bubbles:true}));
  control.dispatchEvent(new Event('change',{bubbles:true}));
}

async function enhanceTaskEditor(panel){
  if(!(panel instanceof HTMLElement)||panel.dataset.taskEnhanced==='1')return;
  const heading=panel.querySelector('.sheet-header h2');
  if(norm(heading?.textContent)!=='task')return;
  panel.dataset.taskEnhanced='1';

  const fields=[...panel.querySelectorAll('.form-fields > .field')];
  const byLabel=label=>fields.find(field=>norm(field.querySelector('span')?.textContent)===norm(label));
  const typeField=byLabel('Typ úkolu');
  const customField=byLabel('Vlastní úkol');
  const assignedField=byLabel('Přiřazeno');
  const typeSelect=typeField?.querySelector('select');
  const oldType=typeSelect?.value||'';

  if(typeField){
    typeField.style.display='none';
    typeField.setAttribute('aria-hidden','true');
    if(typeSelect&&typeSelect.value!=='Ostatní')setReactValue(typeSelect,'Ostatní');
  }

  if(customField){
    const label=customField.querySelector('span');
    const original=customField.querySelector('input');
    if(label)label.textContent='Název úkolu';
    if(original){
      const existing=unpackTask(original.value);
      const initialTitle=existing.title||(oldType&&oldType!=='Ostatní'?oldType:'');
      original.style.display='none';
      original.setAttribute('aria-hidden','true');
      original.required=false;

      const titleInput=document.createElement('input');
      titleInput.type='text';
      titleInput.className='task-title-input';
      titleInput.placeholder='Např. Nabít baterie';
      titleInput.value=initialTitle;
      titleInput.required=true;

      const textField=document.createElement('label');
      textField.className='field full task-text-field';
      const textLabel=document.createElement('span');
      textLabel.textContent='Text úkolu';
      const textArea=document.createElement('textarea');
      textArea.className='task-text-input';
      textArea.placeholder='Napište podrobnosti k úkolu…';
      textArea.value=existing.text;
      textField.append(textLabel,textArea);

      const sync=()=>setReactValue(original,packTask(titleInput.value,textArea.value));
      titleInput.addEventListener('input',sync);
      textArea.addEventListener('input',sync);
      original.insertAdjacentElement('afterend',titleInput);
      customField.insertAdjacentElement('afterend',textField);
      sync();
    }
  }

  if(assignedField){
    const original=assignedField.querySelector('input');
    if(original&&!assignedField.querySelector('.task-assignee-select')){
      const directory=await loadDirectory();
      if(!panel.isConnected)return;
      const select=document.createElement('select');
      select.className='task-assignee-select';
      const empty=document.createElement('option');
      empty.value='';
      empty.textContent='Bez přiřazení';
      select.appendChild(empty);
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
      select.addEventListener('change',()=>setReactValue(original,select.value));
      original.style.display='none';
      original.setAttribute('aria-hidden','true');
      original.insertAdjacentElement('afterend',select);
    }
  }
}

function enhanceTaskCards(){
  const heading=[...document.querySelectorAll('.section-title h2')].find(x=>norm(x.textContent)==='úkoly');
  if(!heading)return;
  let data={tasks:[]};
  try{data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{}
  const cards=[...heading.closest('.content')?.querySelectorAll('.list > .list-item')||[]];
  cards.forEach((card,index)=>{
    const task=(data.tasks||[])[index];
    if(!task)return;
    const packed=unpackTask(task.custom);
    const title=packed.title||String(task.type&&task.type!=='Ostatní'?task.type:'Úkol');
    const meta=`${task.dueDate||'Bez termínu'}${task.assignedTo?` · ${task.assignedTo}`:''}`;
    const main=card.querySelector('.item-main');
    const h3=main?.querySelector('h3');
    const p=main?.querySelector('p');
    if(h3&&h3.textContent!==title)h3.textContent=title;
    if(p){
      p.replaceChildren();
      if(packed.text){
        const text=document.createElement('span');
        text.className='task-preview-text';
        text.textContent=packed.text;
        p.appendChild(text);
      }
      const details=document.createElement('small');
      details.className='task-preview-meta';
      details.textContent=meta;
      p.appendChild(details);
    }
  });
}

function renderMyTasks(){
  const main=document.querySelector('.app-shell main.content');
  if(!main||!main.querySelector('.dashboard-welcome'))return;
  let data={tasks:[]};
  try{data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{}
  const me=currentUser();
  const identities=[me.name,me.email,me.id].filter(Boolean).map(norm);
  const tasks=(data.tasks||[]).filter(task=>{
    const assigned=[task.assignedTo,task.assignedUserId,task.assignedEmail].filter(Boolean).map(norm);
    return !Boolean(task.done===true||task.done==='Ano')&&assigned.some(value=>identities.includes(value));
  });
  let box=main.querySelector('.my-task-alert');
  if(!tasks.length){box?.remove();return;}
  if(!box){
    box=document.createElement('button');
    box.type='button';
    box.className='my-task-alert';
    main.querySelector('.dashboard-welcome')?.insertAdjacentElement('afterend',box);
    box.addEventListener('click',()=>{
      const button=[...document.querySelectorAll('.dashboard-button,.attention-button')].find(x=>norm(x.textContent).includes('otevřené úkoly')||norm(x.textContent).includes('otevřených úkolů'));
      button?.click();
    });
  }
  const first=tasks[0];
  const signature=`${tasks.length}:${first.id||taskTitle(first)}`;
  if(box.dataset.signature===signature)return;
  box.dataset.signature=signature;
  box.innerHTML=`<span class="my-task-alert-icon">!</span><div><small>Máte přiřazené úkoly</small><strong>${tasks.length} ${tasks.length===1?'otevřený úkol':'otevřené úkoly'}</strong><em>${taskTitle(first)}${tasks.length>1?` · +${tasks.length-1} další`:''}</em></div><b>›</b>`;
}

let refreshTimer=0;
function scheduleRefresh(){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>{renderMyTasks();enhanceTaskCards()},80);
}

const observer=new MutationObserver(records=>{
  for(const record of records){
    for(const node of record.addedNodes){
      if(!(node instanceof HTMLElement))continue;
      if(node.matches?.('.sheet-panel'))enhanceTaskEditor(node);
      node.querySelectorAll?.('.sheet-panel').forEach(enhanceTaskEditor);
    }
  }
  scheduleRefresh();
});

function start(){
  observer.observe(document.body,{childList:true,subtree:true});
  document.querySelectorAll('.sheet-panel').forEach(enhanceTaskEditor);
  loadDirectory().finally(scheduleRefresh);
  addEventListener('storage',event=>{if(event.key===STORAGE_KEY)scheduleRefresh()});
  scheduleRefresh();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
