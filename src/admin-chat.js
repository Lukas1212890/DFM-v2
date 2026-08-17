const API='https://dfm-cloud-api.bednarik.workers.dev';
const SESSION_KEY='dfm_auth_session';
let isAdmin=false;
let deleteMode=false;

const api=async(path,options={})=>{
  const token=localStorage.getItem(SESSION_KEY)||'';
  const response=await fetch(`${API}${path}`,{...options,headers:{'content-type':'application/json',authorization:`Bearer ${token}`,...(options.headers||{})}});
  let payload={};
  try{payload=await response.json();}catch{}
  if(!response.ok)throw new Error(payload.error||`Cloud odpověděl ${response.status}`);
  return payload;
};

const style=document.createElement('style');
style.textContent=`
.chat-admin-tools{position:relative;margin-left:auto;display:flex;align-items:center;gap:8px}.chat-admin-options{width:40px;height:40px;border:0;border-radius:12px;background:rgba(255,255,255,.07);color:#fff;font-size:1.35rem;line-height:1}.chat-admin-menu{position:absolute;top:48px;right:0;z-index:20;width:220px;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:#0b1726;box-shadow:0 16px 40px rgba(0,0,0,.45);display:grid;gap:5px}.chat-admin-menu[hidden]{display:none}.chat-admin-menu button{width:100%!important;height:auto!important;padding:11px 12px!important;border:0!important;border-radius:10px!important;background:rgba(255,255,255,.055)!important;color:#eaf3ff!important;font-size:.78rem!important;text-align:left!important}.chat-admin-menu button.danger{background:rgba(255,91,91,.12)!important;color:#ffaaaa!important}.chat-admin-menu button.active{background:rgba(45,140,255,.18)!important;color:#9dcbff!important}.chat-messages article{position:relative}.chat-delete-one{position:absolute;top:7px;right:7px;width:30px;height:30px;border:0;border-radius:9px;background:rgba(255,91,91,.14);color:#ff9d9d;font-size:.9rem}.chat-delete-mode article{padding-right:45px}`;
document.head.appendChild(style);

async function checkAdmin(){try{const r=await api('/auth/me'),roles=Array.isArray(r.user?.roles)?r.user.roles:String(r.user?.role||'').split(',');isAdmin=roles.includes('admin');}catch{isAdmin=false;}}

function addDeleteButtons(panel){
  const box=panel.querySelector('.chat-messages');
  if(!box)return;
  box.classList.toggle('chat-delete-mode',deleteMode);
  box.querySelectorAll('article').forEach(article=>{
    let button=article.querySelector('.chat-delete-one');
    if(!deleteMode){button?.remove();return;}
    if(button||!article.dataset.messageId)return;
    button=document.createElement('button');button.type='button';button.className='chat-delete-one';button.title='Smazat zprávu';button.textContent='🗑';
    button.addEventListener('click',async e=>{e.stopPropagation();if(!confirm('Opravdu trvale smazat tuto zprávu?'))return;try{await api(`/chat/${encodeURIComponent(article.dataset.messageId)}`,{method:'DELETE'});window.dispatchEvent(new CustomEvent('dfm:chat-changed'));}catch(err){alert(err.message);}});
    article.appendChild(button);
  });
}

function markMessageIds(panel){
  const articles=[...panel.querySelectorAll('.chat-messages article')];
  api('/chat').then(r=>{
    const pool=[...(r.messages||[])];
    articles.forEach(article=>{
      if(article.dataset.messageId)return;
      const author=article.querySelector('strong')?.textContent||'';
      const text=article.querySelector('p')?.textContent||'';
      const index=pool.findIndex(x=>x.author===author&&x.message===text);
      if(index>=0){article.dataset.messageId=pool[index].id;pool.splice(index,1);}
    });
    addDeleteButtons(panel);
  }).catch(()=>{});
}

function enhance(panel){
  if(!isAdmin||panel.dataset.adminEnhanced)return;
  panel.dataset.adminEnhanced='1';
  const header=panel.querySelector('header');if(!header)return;
  const close=header.querySelector('button:last-child');
  const tools=document.createElement('div');tools.className='chat-admin-tools';
  const options=document.createElement('button');options.type='button';options.className='chat-admin-options';options.title='Možnosti chatu';options.textContent='⋮';
  const menu=document.createElement('div');menu.className='chat-admin-menu';menu.hidden=true;
  const individual=document.createElement('button');individual.type='button';individual.textContent='🗑 Mazat jednotlivé zprávy';
  const clear=document.createElement('button');clear.type='button';clear.className='danger';clear.textContent='🧹 Smazat tento chat';
  menu.append(individual,clear);tools.append(options,menu);if(close)header.insertBefore(tools,close);else header.appendChild(tools);
  options.addEventListener('click',()=>{menu.hidden=!menu.hidden;});
  individual.addEventListener('click',()=>{deleteMode=!deleteMode;individual.classList.toggle('active',deleteMode);individual.textContent=deleteMode?'✓ Ukončit mazání zpráv':'🗑 Mazat jednotlivé zprávy';menu.hidden=true;markMessageIds(panel);});
  clear.addEventListener('click',async()=>{const selector=panel.querySelector('.chat-recipient select'),target=selector?.value||'all',label=selector?.selectedOptions?.[0]?.textContent?.replace(/\s+🔴\s+\d+$/,'')||'tento chat';if(!confirm(`Opravdu trvale smazat konverzaci „${label.trim()}“? Ostatní chaty zůstanou zachované.`))return;try{await api(`/chat?target=${encodeURIComponent(target)}`,{method:'DELETE'});deleteMode=false;menu.hidden=true;window.dispatchEvent(new CustomEvent('dfm:chat-changed'));}catch(err){alert(err.message);}});
  const messages=panel.querySelector('.chat-messages');if(messages)new MutationObserver(()=>{if(deleteMode)markMessageIds(panel);}).observe(messages,{childList:true});
}

document.addEventListener('pointerdown',event=>{
  document.querySelectorAll('.chat-admin-menu:not([hidden])').forEach(menu=>{
    if(!menu.closest('.chat-admin-tools')?.contains(event.target))menu.hidden=true;
  });
});

(async()=>{await checkAdmin();if(!isAdmin)return;const observer=new MutationObserver(()=>document.querySelectorAll('.chat-panel').forEach(enhance));observer.observe(document.body,{childList:true,subtree:true});document.querySelectorAll('.chat-panel').forEach(enhance);})();
