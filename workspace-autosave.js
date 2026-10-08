/* One idle queue for the three native areas. Data remains local until a SHA-guarded save succeeds. */
window.WorkspaceAutosave=(()=>{
  'use strict';
  const KEY='pf_autosave_v1',IDLE=20000,RETRY=60000;
  const labels={gantt:'Cronogramas',action:'Planos de ação',todo:'Task'};
  let adapters={},enabled=true,initialized=false,timer=null,running=null,paused=0,lastEdit=0,retryAt=0,refreshQueued=false,hasDraft=false;
  const fingerprints=new Map();
  function states(){return Object.entries(adapters).map(([source,adapter])=>({source,...adapter.state()}))}
  function clear(){clearTimeout(timer);timer=null}
  function render(all=states()){
    const toggle=document.getElementById('autosaveToggle'),output=document.getElementById('autosaveStatus'),resolve=document.getElementById('autosaveResolve');
    if(toggle)toggle.checked=enabled;
    if(!output)return;
    const connected=all.filter(s=>s.connected),blocked=connected.filter(s=>s.blocked),pending=connected.filter(s=>s.dirty||!s.ready);
    let text;
    if(blocked.length)text='Sincronização precisa de atenção: '+blocked.map(s=>labels[s.source]).join(', ')+'. '+(blocked[0].error||'Abra a conexão do GitHub para resolver.');
    else if(running||connected.some(s=>s.busy))text='Sincronizando com o GitHub…';
    else if(!enabled)text=pending.length?'Salvo neste navegador · salvamento automático desligado':'Salvamento automático desligado';
    else if(!connected.length)text='Salvo neste navegador · conecte o GitHub para sincronizar';
    else if(navigator.onLine===false)text='Sem conexão · alterações mantidas neste navegador';
    else if(pending.some(s=>s.error))text='Salvo neste navegador · aguardando nova tentativa no GitHub';
    else if(pending.length)text='Alterações pendentes · envio após 20 s sem editar';
    else text='Salvo no GitHub'+(connected.length<all.length?' · demais áreas apenas neste navegador':'');
    output.textContent=text;
    output.dataset.state=blocked.length?'blocked':running?'saving':pending.length?'pending':connected.length?'saved':'local';
    if(resolve){resolve.hidden=!blocked.length;resolve.dataset.source=blocked[0]?.source||''}
  }
  function refresh(){
    if(!initialized)return;
    let edited=false;const all=states();hasDraft=all.some(s=>s.dirty);
    for(const s of all){
      if(s.dirty&&fingerprints.get(s.source)!==s.fingerprint)edited=true;
      fingerprints.set(s.source,s.fingerprint);
    }
    if(edited){lastEdit=Date.now();retryAt=0}
    render(all);schedule(all);
  }
  function queueRefresh(){if(refreshQueued)return;refreshQueued=true;queueMicrotask(()=>{refreshQueued=false;refresh()})}
  function schedule(all=states()){
    clear();
    if(!enabled||paused||running||navigator.onLine===false)return;
    const pending=all.some(s=>s.connected&&!s.blocked&&(s.dirty||!s.ready));
    if(!pending)return;
    const due=Math.max(lastEdit+IDLE,retryAt);
    timer=setTimeout(()=>{timer=null;run()},Math.max(0,due-Date.now()));
  }
  async function work(){
    let retry=false,waiting=false;
    for(const [source,adapter] of Object.entries(adapters)){
      if(!enabled||paused||navigator.onLine===false)break;
      if(Date.now()<lastEdit+IDLE)break;
      if(states().some(s=>s.busy)){waiting=true;break}
      let s=adapter.state();
      if(!s.connected||s.blocked)continue;
      if(s.busy){waiting=true;continue}
      try{
        if(!s.ready){await adapter.autoConnect();s=adapter.state();if(Date.now()<lastEdit+IDLE)break}
        if(s.ready&&s.dirty&&!s.blocked&&!s.busy)await adapter.autoSave();
        s=adapter.state();
        if(s.connected&&!s.blocked&&(s.error||!s.ready))retry=true;
      }catch(error){retry=true;/* The adapter retains its local data and exposes the sync error. */}
    }
    if(retry)retryAt=Date.now()+RETRY;
    else if(waiting)retryAt=Date.now()+1000;
  }
  function run(){
    if(running)return running;
    if(!enabled||paused||navigator.onLine===false){render();return Promise.resolve()}
    running=Promise.resolve().then(work).finally(()=>{running=null;refresh()});
    render();return running;
  }
  function setEnabled(value){
    const next=!!value;localStorage.setItem(KEY,JSON.stringify({enabled:next}));enabled=next;
    if(enabled){lastEdit=Date.now();retryAt=0}
    refresh();
  }
  async function suspend(){paused++;clear();if(running)await running}
  function resume(){paused=Math.max(0,paused-1);if(!paused){lastEdit=Date.now();retryAt=0;refresh()}}
  function online(){retryAt=0;render();schedule()}
  async function recoveryAction(event,action){
    const button=event.currentTarget;button.disabled=true;
    try{const result=await action();if(result){const output=document.getElementById('autosaveStatus');output.textContent='Ponto de restauração criado neste navegador.';output.dataset.state='saved'}}
    catch(error){const output=document.getElementById('autosaveStatus');output.textContent=error.message;output.dataset.state='blocked'}
    finally{button.disabled=false}
  }
  function init(services){
    adapters=services;
    try{enabled=JSON.parse(localStorage.getItem(KEY)||'{}').enabled!==false}catch{enabled=true}
    initialized=true;lastEdit=Date.now();
    document.getElementById('autosaveToggle').onchange=e=>setEnabled(e.target.checked);
    document.getElementById('autosaveRecovery').onclick=e=>recoveryAction(e,()=>window.LocalRecovery.open());
    document.getElementById('autosaveCheckpoint').onclick=e=>recoveryAction(e,()=>window.LocalRecovery.checkpoint());
    document.getElementById('autosaveResolve').onclick=e=>document.getElementById({gantt:'btnCloudBackup',action:'apCloudSettings',todo:'ntCloudSettings'}[e.currentTarget.dataset.source])?.onclick?.();
    window.addEventListener('projectflow:datachange',queueRefresh);
    window.addEventListener('projectflow:cloudstate',queueRefresh);
    document.addEventListener('input',event=>{if(event.target.closest?.('#app')&&hasDraft){lastEdit=Date.now();retryAt=0;schedule()}});
    window.addEventListener('online',online);window.addEventListener('offline',()=>{clear();render()});
    window.addEventListener('pageshow',refresh);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
    window.addEventListener('storage',e=>{if(e.key===KEY){try{enabled=JSON.parse(e.newValue||'{}').enabled!==false}catch{enabled=true}refresh()}});
    refresh();
  }
  return {init,refresh,setEnabled,isEnabled:()=>enabled,suspend,resume,whenIdle:()=>running||Promise.resolve(),state:()=>({enabled,paused,running:!!running,areas:states()})};
})();
