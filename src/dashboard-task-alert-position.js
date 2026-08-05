function fixTaskAlertPosition(){
  const main=document.querySelector('.app-shell main.content');
  const alert=document.querySelector('.my-task-alert');
  if(!main){alert?.remove();return;}
  const welcome=main.querySelector(':scope > .dashboard-welcome');
  if(!welcome){alert?.remove();return;}
  const current=main.querySelector(':scope > .my-task-alert');
  if(!current)return;
  if(welcome.nextElementSibling!==current){
    welcome.insertAdjacentElement('afterend',current);
  }
}

let taskAlertPositionTimer=0;
function scheduleTaskAlertPosition(){
  clearTimeout(taskAlertPositionTimer);
  taskAlertPositionTimer=setTimeout(fixTaskAlertPosition,30);
}

const taskAlertPositionObserver=new MutationObserver(scheduleTaskAlertPosition);

function startTaskAlertPositionFix(){
  taskAlertPositionObserver.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',scheduleTaskAlertPosition,true);
  addEventListener('popstate',scheduleTaskAlertPosition);
  scheduleTaskAlertPosition();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startTaskAlertPositionFix,{once:true});
else startTaskAlertPositionFix();
