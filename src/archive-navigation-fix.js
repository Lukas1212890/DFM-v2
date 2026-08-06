function closeDetachedArchive(){
  const panels=[...document.querySelectorAll('.drone-archive-panel')];
  if(!panels.length)return;
  const detailOpen=Boolean(document.querySelector('.detail-hero'));
  if(detailOpen)return;

  panels.forEach(panel=>{
    const parent=panel.parentElement;
    panel.remove();
    if(parent){
      [...parent.children].forEach(node=>{
        if(node instanceof HTMLElement)node.hidden=false;
      });
      parent.querySelectorAll('.archive-tab.active').forEach(button=>button.classList.remove('active'));
    }
  });

  document.querySelectorAll('main.content > [hidden], .content > [hidden]').forEach(node=>{
    if(node instanceof HTMLElement)node.hidden=false;
  });
}

function scheduleArchiveCleanup(){
  requestAnimationFrame(()=>requestAnimationFrame(closeDetachedArchive));
}

function startArchiveNavigationFix(){
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    if(target.closest('.bottom-nav button,.dashboard-button,.more-menu button'))scheduleArchiveCleanup();
    const back=target.closest('button');
    if(back&&back.textContent?.includes('Zpět na drony'))scheduleArchiveCleanup();
  },true);

  const root=document.getElementById('root')||document.body;
  new MutationObserver(()=>{
    if(document.querySelector('.drone-archive-panel')&&!document.querySelector('.detail-hero'))closeDetachedArchive();
  }).observe(root,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startArchiveNavigationFix,{once:true});
else startArchiveNavigationFix();
