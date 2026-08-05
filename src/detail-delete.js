const KEY='dfm_react_pwa_v1';
function connectDetailDelete(){
 const hero=document.querySelector('.detail-hero');
 if(!hero||hero.dataset.deleteReady)return;
 const name=hero.querySelector('h2')?.textContent?.trim();
 let data;try{data=JSON.parse(localStorage.getItem(KEY)||'null')}catch{return}
 const index=data?.drones?.findIndex(item=>item.name===name)??-1;
 if(index<0)return;
 hero.dataset.deleteReady='1';
 const button=document.createElement('button');
 button.type='button';button.className='danger-button';button.textContent='Smazat dron';
 button.onclick=()=>{if(confirm(`Opravdu odstranit dron „${name}“?`)){data.drones.splice(index,1);localStorage.setItem(KEY,JSON.stringify(data));location.reload()}};
 hero.querySelector('.detail-actions')?.appendChild(button);
}
new MutationObserver(connectDetailDelete).observe(document.documentElement,{childList:true,subtree:true});connectDetailDelete();