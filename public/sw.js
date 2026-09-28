// Service worker for 加热提醒: shows Web Push notifications sent by the weibo-watcher, and opens
// (or focuses) the site on tap. It does nothing else -- no caching, no offline pages.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{data={title:'加热提醒',body:event.data?.text()??''}}
  event.waitUntil(self.registration.showNotification(data.title||'加热提醒',{
    body:data.body||'',
    icon:'/icons/icon-192.png',
    badge:'/icons/icon-192.png',
    // The same tag replaces an earlier notification of the same kind instead of stacking.
    tag:data.tag||'heat',
    renotify:true,
    data:{url:data.url||'/heat'},
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||'/heat',self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const open=windows.find(client=>client.url.startsWith(self.location.origin));
    if(open){await open.focus();if('navigate' in open)await open.navigate(url);return}
    await self.clients.openWindow(url);
  })());
});
