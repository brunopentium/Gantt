/* Keep all app files fresh and all private GitHub traffic outside worker caches. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ProjectFlow — Sem conexão</title><body style="font:18px system-ui;padding:30px"><h1>Sem conexão</h1><p>Conecte-se à internet para abrir o ProjectFlow. Os dados salvos neste navegador continuam guardados.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
