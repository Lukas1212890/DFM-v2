const SESSION_KEY='dfm_auth_session';
const API='https://dfm-cloud-api.bednarik.workers.dev';
const DIRECTORY_KEY='dfm_user_directory';

const normalize=value=>String(value||'').trim().toLocaleLowerCase('cs-CZ');

async function api(path){
  const token=localStorage.getItem(SESSION_KEY)||'';
  if(!token)throw new Error('Bez aktivní relace');
  const response=await fetch(`${API}${path}`,{
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'}
  });
  if(!response.ok)throw new Error(String(response.status));
  return response.json();
}

async function getUsers(){
  let users=[];
  try{users=JSON.parse(localStorage.getItem(DIRECTORY_KEY)||'[]')}catch{}

  try{
    const result=await api('/admin/users');
    if(Array.isArray(result.users)){
      users=result.users
        .filter(user=>user.active!==0)
        .map(user=>({id:user.id,name:user.name,email:user.email}));
    }
  }catch{}

  try{
    const result=await api('/auth/me');
    const me=result.user;
    if(me&&!users.some(user=>user.id===me.id||normalize(user.email)===normalize(me.email))){
      users.push({id:me.id,name:me.name,email:me.email});
    }
  }catch{}

  try{localStorage.setItem(DIRECTORY_KEY,JSON.stringify(users))}catch{}
  return users;
}

function setReactInput(input,value){
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  setter?.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
}

async function enhanceAccidentEditor(panel){
  if(!(panel instanceof HTMLElement)||panel.dataset.accidentPilotEnhanced==='1')return;
  const heading=panel.querySelector('.sheet-header h2');
  if(normalize(heading?.textContent)!=='accident')return;

  const pilotField=[...panel.querySelectorAll('.form-fields > .field')]
    .find(field=>normalize(field.querySelector('span')?.textContent)==='pilot');
  const original=pilotField?.querySelector('input');
  if(!pilotField||!original)return;

  panel.dataset.accidentPilotEnhanced='1';
  const users=await getUsers();
  if(!panel.isConnected)return;

  const select=document.createElement('select');
  select.className='task-assignee-select accident-pilot-select';

  const empty=document.createElement('option');
  empty.value='';
  empty.textContent='Vyberte pilota';
  select.appendChild(empty);

  const seen=new Set();
  users.forEach(user=>{
    const name=String(user.name||user.email||'').trim();
    if(!name||seen.has(normalize(name)))return;
    seen.add(normalize(name));
    const option=document.createElement('option');
    option.value=name;
    option.textContent=user.email?`${name} · ${user.email}`:name;
    select.appendChild(option);
  });

  if(original.value&&!seen.has(normalize(original.value))){
    const option=document.createElement('option');
    option.value=original.value;
    option.textContent=original.value;
    select.appendChild(option);
  }

  select.value=original.value||'';
  select.disabled=original.disabled;
  select.addEventListener('change',()=>setReactInput(original,select.value));

  original.style.display='none';
  original.setAttribute('aria-hidden','true');
  original.insertAdjacentElement('afterend',select);
}

const observer=new MutationObserver(records=>{
  for(const record of records){
    for(const node of record.addedNodes){
      if(!(node instanceof HTMLElement))continue;
      if(node.matches?.('.sheet-panel'))enhanceAccidentEditor(node);
      node.querySelectorAll?.('.sheet-panel').forEach(enhanceAccidentEditor);
    }
  }
});

function start(){
  observer.observe(document.body,{childList:true,subtree:true});
  document.querySelectorAll('.sheet-panel').forEach(enhanceAccidentEditor);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
