const TASK_MARKER='<<<DFM_TASK_TEXT>>>';

function cleanTaskLabel(value){
  const raw=String(value||'');
  const index=raw.indexOf(TASK_MARKER);
  return (index<0?raw:raw.slice(0,index)).trim()||'Úkol';
}

function cleanCalendarTasks(){
  document.querySelectorAll('.calendar-event.task strong,.month-grid span.task').forEach(node=>{
    const clean=cleanTaskLabel(node.textContent);
    if(node.textContent!==clean)node.textContent=clean;
  });
}

let timer=0;
function schedule(){
  clearTimeout(timer);
  timer=setTimeout(cleanCalendarTasks,40);
}

const observer=new MutationObserver(records=>{
  if(records.some(record=>record.type==='childList'||record.type==='characterData'))schedule();
});

function start(){
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',schedule,true);
  schedule();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
