/* Installation choices belong to this browser/origin, never to shared backups. */
(()=>{
  'use strict';
  const KEY='pf_pwa_install_choice_v1';
  let deferred=null,dialog=null,answered=false,dismissed=false;
  const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  try{answered=['yes','no','installed'].includes(localStorage.getItem(KEY))}catch{}
  function remember(value){answered=true;try{localStorage.setItem(KEY,value)}catch{try{sessionStorage.setItem(KEY,value)}catch{}}}
  try{answered=answered||['yes','no','installed'].includes(sessionStorage.getItem(KEY))}catch{}
  function instructions(){
    const ua=navigator.userAgent;
    if(/SamsungBrowser/i.test(ua))return 'No Samsung Internet, abra o menu ≡ e procure “Adicionar página a” → “Tela inicial” ou “Instalar”. Confirme a instalação do ProjectFlow.';
    if(/Android/i.test(ua))return 'Abra o menu ⋮ do navegador e procure “Instalar aplicativo” ou “Adicionar à tela inicial”. Se necessário, abra este endereço no Chrome para instalar como aplicativo.';
    if(/iPhone|iPad/i.test(ua))return 'No Safari, toque em Compartilhar → Adicionar à Tela de Início e confirme.';
    return 'No Chrome ou Microsoft Edge, use o ícone de instalação na barra de endereço ou o menu → “Instalar ProjectFlow”. No Edge, a opção também pode estar em “Aplicativos” → “Instalar este site como um aplicativo”.';
  }
  function help(message=''){
    dialog.querySelector('h2').textContent='Instalar o ProjectFlow';
    dialog.querySelector('[data-pwa-message]').textContent=message||instructions();
    dialog.querySelector('[data-pwa-actions]').innerHTML='<button type="button" data-pwa-close>Entendi</button>';
    dialog.querySelector('[data-pwa-close]').onclick=()=>dialog.close();
  }
  function show(){
    if(answered||dismissed||installed()||dialog?.open)return;
    if(document.getElementById('app')?.inert||document.querySelector('dialog[open]')){setTimeout(show,700);return}
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='pwaInstallDialog';dialog.lang='pt-BR';dialog.setAttribute('aria-labelledby','pwaInstallTitle');
      dialog.innerHTML='<div class="pwa-install-content"><h2 id="pwaInstallTitle">Instalar como aplicativo?</h2><p data-pwa-message>Adicione o ProjectFlow como aplicativo para abrir em uma janela própria pelo celular ou computador. Seus dados e salvamentos continuam os mesmos deste endereço.</p><div data-pwa-actions><button type="button" data-pwa-no>Não</button><button type="button" class="pwa-install-yes" data-pwa-yes>Sim, instalar</button></div></div>';
      document.body.append(dialog);
      dialog.addEventListener('cancel',()=>{dismissed=true});
      dialog.querySelector('[data-pwa-no]').onclick=()=>{remember('no');dialog.close()};
      dialog.querySelector('[data-pwa-yes]').onclick=async()=>{
        remember('yes');
        if(!deferred){help();return}
        const prompt=deferred;deferred=null;
        try{
          // prompt() must run inside this click's user activation.
          const pending=prompt.prompt();dialog.close();await pending;
          const choice=await prompt.userChoice;
          if(choice.outcome!=='accepted'){help('A instalação não foi concluída. Você poderá tentar novamente pelo menu do navegador. '+instructions());dialog.showModal()}
        }catch{help();if(!dialog.open)dialog.showModal()}
      };
    }
    dialog.showModal();
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;show()});
  window.addEventListener('appinstalled',()=>{remember('installed');deferred=null;dialog?.close()});
  if('serviceWorker' in navigator&&window.isSecureContext){navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}).catch(()=>{/* Browser menu installation remains available. */})}
  // Allow Chromium to supply its native prompt first; other browsers get instructions.
  if(document.readyState==='complete')setTimeout(show,3000);
  else window.addEventListener('load',()=>setTimeout(show,3000),{once:true});
})();
