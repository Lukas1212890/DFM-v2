self.addEventListener('push',event=>{
  let data={title:'DFM',body:'Máte nové upozornění.',url:'./'};
  try{if(event.data)data={...data,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{
    body:data.body,
    icon:'icons/dfm-icon-compact.svg',
    badge:'icons/dfm-icon-compact.svg',
    tag:data.tag||'dfm-notification',
    renotify:true,
    data:{url:data.url||'./'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'./',self.registration.scope).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const existing=list.find(client=>client.url.startsWith(self.registration.scope));
    if(existing){existing.navigate(target);return existing.focus();}
    return clients.openWindow(target);
  }));
});