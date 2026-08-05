const KEY='dfm_react_pwa_v1';
const read=()=>JSON.parse(localStorage.getItem(KEY)||'null');
const write=data=>{localStorage.setItem(KEY,JSON.stringify(data));window.location.reload();};
function removeFrom(list,index,label){if(window.confirm(`Opravdu odstranit ${label}?`)){list.splice(index,1);write(state);}}
let state=null;
function enhance(){
 state=read();if(!state)return;
 const gear=document.querySelector('.topbar .icon-button');
 if(gear&&!gear.dataset.enabled){gear.dataset.enabled='1';gear.onclick=()=>window.alert('Nastavení DFM\n\nZálohování a další volby doplníme v této sekci.');}
 const section=document.querySelector('.bottom-nav button.active small')?.textContent;
 document.querySelectorAll('.content .list > .list-item').forEach(card=>{
  if(card.dataset.removable)return;
  const title=card.querySelector('h3')?.textContent?.trim();if(!title)return;
  let list,index;
  if(section==='Drony'&&!document.querySelector('.detail-hero')){list=state.drones;index=list.findIndex(x=>x.name===title);}
  else if(section==='Piloti'){list=state.pilots;index=list.findIndex(x=>x.name===title);}
  else if(section==='Úkoly'){list=state.tasks;index=list.findIndex(x=>(x.type==='Ostatní'?(x.custom||'Ostatní'):x.type)===title);}
  else if(section==='Lety'){list=state.flights;index=list.findIndex(x=>(x.location||'Let')===title);}
  if(!list||index<0)return;
  card.dataset.removable='1';
  const button=document.createElement('button');button.type='button';button.className='delete-action';button.textContent='🗑';button.setAttribute('aria-label','Odstranit');
  button.onclick=e=>{e.stopPropagation();removeFrom(list,index,`„${title}“`);};card.append(button);
 });
}
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});enhance();