/* Internal safety copies stay in this browser; JSON downloads are explicit. */
window.LocalRecovery=(()=>{
  'use strict';
  const DB='projectflow-recovery-v1',STORE='snapshots',LIMIT=30,NAMED_LIMIT=10;
  let databasePromise=null,modal=null,previousFocus=null;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const failure=error=>new Error('Não foi possível guardar a cópia de segurança neste navegador. Os dados atuais foram mantidos. '+(error?.name==='QuotaExceededError'?'O armazenamento está cheio.':'Verifique se o navegador permite armazenamento local.'));
  function database(){
    if(databasePromise)return databasePromise;
    databasePromise=new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(failure());return}
      let request;
      try{request=indexedDB.open(DB,1)}catch(error){reject(failure(error));return}
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})};
      request.onerror=()=>reject(failure(request.error));
      request.onblocked=()=>reject(new Error('Feche outra guia deste aplicativo para liberar o histórico de recuperação. Os dados atuais foram mantidos.'));
      request.onsuccess=()=>{
        const db=request.result;db.onversionchange=()=>{db.close();databasePromise=null};resolve(db);
      };
    }).catch(error=>{databasePromise=null;throw error});
    return databasePromise;
  }
  function metadata(record){
    return {id:record.id,createdAt:record.createdAt,name:record.name,reason:record.reason,scope:record.scope,counts:record.counts};
  }
  const newest=(a,b)=>(b.sequence||0)-(a.sequence||0)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id);
  async function capture({reason='Cópia de segurança',scope='all',name=''}={}){
    if(!window.WorkspaceBackup)throw new Error('O backup geral ainda não está disponível.');
    const data=clone(window.WorkspaceBackup.snapshot());window.WorkspaceBackup.validate(data);
    const createdAt=new Date().toISOString();
    const record={id:Date.now().toString(36)+'-'+(crypto.randomUUID?.()||Math.random().toString(36).slice(2)),createdAt,name:String(name||'').trim().slice(0,160),reason:String(reason||'Cópia de segurança').slice(0,500),scope:String(scope||'all').slice(0,60),
      counts:{projects:data.projects.filter(p=>p.kind!=='group').length,plans:data.actionPlans.length,actions:data.actionPlans.reduce((n,p)=>n+p.actions.length,0),tasks:data.todo.tasks.length},data};
    const db=await database();
    await new Promise((resolve,reject)=>{
      let tx;
      try{tx=db.transaction(STORE,'readwrite')}catch(error){reject(failure(error));return}
      tx.oncomplete=resolve;tx.onerror=()=>reject(failure(tx.error));tx.onabort=()=>reject(failure(tx.error));
      const store=tx.objectStore(STORE),all=store.getAll();
      all.onsuccess=()=>{
        record.sequence=all.result.reduce((n,item)=>Math.max(n,item.sequence||0),0)+1;store.put(record);
        const records=[...all.result,record].sort(newest),keep=new Set(records.filter(r=>r.name).slice(0,NAMED_LIMIT).map(r=>r.id));
        // A fresh automatic safety copy must survive even if many points were named.
        keep.add(record.id);
        for(const item of records){if(keep.size>=LIMIT)break;keep.add(item.id)}
        for(const item of records)if(!keep.has(item.id))store.delete(item.id);
      };
    });
    return record.id;
  }
  async function records(){
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).getAll();
      request.onsuccess=()=>resolve(request.result.sort(newest));request.onerror=()=>reject(failure(request.error));
    });
  }
  async function list(){return (await records()).map(metadata)}
  async function get(id){
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).get(String(id));
      request.onsuccess=()=>resolve(request.result?clone(request.result.data):null);request.onerror=()=>reject(failure(request.error));
    });
  }
  async function restore(id){
    const data=await get(id);if(!data)throw new Error('Esta cópia não está mais disponível.');
    return window.WorkspaceBackup.restore(data,{reason:'Antes de restaurar uma cópia interna'});
  }
  async function download(id){
    const data=await get(id);if(!data)throw new Error('Esta cópia não está mais disponível.');
    downloadJSON(data,'projectflow-restauracao-'+data.exportedAt.replace(/[:.]/g,'-')+'.json');return true;
  }
  async function checkpoint(name){
    if(name===undefined)name=prompt('Nome do ponto de restauração:',new Date().toLocaleString('pt-BR'));
    if(name===null)return false;
    name=String(name).trim();if(!name)throw new Error('Dê um nome ao ponto de restauração.');
    const id=await capture({reason:'Ponto de restauração manual',scope:'all',name});
    if(modal)await render(modal,'Ponto de restauração criado.');return id;
  }
  function close(){
    if(!modal)return;document.removeEventListener('keydown',dialogKeydown,true);modal.remove();modal=null;
    if(previousFocus?.isConnected)previousFocus.focus();previousFocus=null;
  }
  function dialogKeydown(event){
    const root=modal;if(!root)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return}
    if(event.key!=='Tab')return;
    const controls=[...root.querySelectorAll('button:not(:disabled),[href],input,select,textarea,[tabindex="0"]')].filter(control=>!control.hidden),first=controls[0],last=controls.at(-1);
    if(!root.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus()}
    else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  const scopeLabel=scope=>({all:'Todas as guias',gantt:'Cronogramas',schedule:'Cronogramas',schedules:'Cronogramas',action:'Planos de ação',plans:'Planos de ação','action-plans':'Planos de ação',todo:'Task',task:'Task'}[scope]||scope);
  async function render(root,message='',isError=false){
    const panel=root.querySelector('.lr-list'),status=root.querySelector('.lr-status');
    if(message){status.textContent=message;status.style.color=isError?'#b42318':'#11644a'}
    try{
      const items=await list();if(!root.isConnected)return;
      panel.innerHTML=items.length?items.map(item=>`<article class="lr-record"><div><strong>${esc(item.name||'Cópia de segurança')}</strong><time>${esc(new Date(item.createdAt).toLocaleString('pt-BR'))}</time><p>${esc(item.reason)} · ${esc(scopeLabel(item.scope))}</p><small>${item.counts.projects} cronogramas · ${item.counts.plans} planos · ${item.counts.tasks} tarefas Task</small></div><div class="lr-record-actions"><button type="button" data-lr-restore="${esc(item.id)}">Restaurar</button><button type="button" data-lr-download="${esc(item.id)}">Baixar JSON</button></div></article>`).join(''):'<p class="lr-empty">Nenhuma cópia interna ainda. Crie um ponto de restauração ou continue usando o aplicativo: uma cópia será guardada antes de substituir dados.</p>';
    }catch(error){if(root.isConnected){panel.textContent='Histórico indisponível.';status.textContent=error.message;status.style.color='#b42318'}}
  }
  async function open(){
    if(modal){modal.querySelector('.lr-close').focus();return}
    previousFocus=document.activeElement;
    const root=document.createElement('div');root.id='localRecoveryOverlay';root.className='lr-overlay';
    root.innerHTML=`<style>
      #localRecoveryOverlay{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:200000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;color:#243244;font:14px/1.45 system-ui,sans-serif}
      #localRecoveryOverlay *{box-sizing:border-box}#localRecoveryOverlay .lr-dialog{width:min(820px,100%);max-height:90vh;max-height:90dvh;overflow:auto;overscroll-behavior:contain;background:#fff;border-radius:16px;padding:22px;box-shadow:0 20px 60px #0003}
      #localRecoveryOverlay .lr-header{display:flex;align-items:center;justify-content:space-between;gap:15px}#localRecoveryOverlay h2{margin:0;font-size:21px}#localRecoveryOverlay p{margin:8px 0}#localRecoveryOverlay .lr-help{color:#536275}
      #localRecoveryOverlay button{font:inherit;padding:8px 12px;border:1px solid #c9d5e1;background:#f8fafc;color:#243244;border-radius:8px;cursor:pointer;min-height:40px}#localRecoveryOverlay button:focus-visible{outline:3px solid #79b8f4;outline-offset:2px}#localRecoveryOverlay button:disabled{opacity:.5;cursor:wait}
      #localRecoveryOverlay .lr-create{background:#11644a;color:white;border-color:#11644a;margin:10px 0}#localRecoveryOverlay .lr-close{font-size:22px;line-height:1}
      #localRecoveryOverlay .lr-status{min-height:24px;margin:6px 0}#localRecoveryOverlay .lr-record{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 0;border-top:1px solid #e2e8f0;overflow-wrap:anywhere}#localRecoveryOverlay time{display:block;color:#536275;font-size:12px;margin-top:3px}#localRecoveryOverlay small{color:#536275}#localRecoveryOverlay .lr-record-actions{display:flex;gap:8px;flex-shrink:0}#localRecoveryOverlay .lr-empty{padding:15px 0}
      @media(max-width:600px){#localRecoveryOverlay{padding:8px}#localRecoveryOverlay .lr-dialog{padding:16px}#localRecoveryOverlay .lr-record{display:block}#localRecoveryOverlay .lr-record-actions{margin-top:12px}#localRecoveryOverlay .lr-record-actions button{flex:1}}
    </style><section class="lr-dialog" role="dialog" aria-modal="true" aria-labelledby="localRecoveryTitle"><div class="lr-header"><h2 id="localRecoveryTitle">Histórico de recuperação</h2><button type="button" class="lr-close" aria-label="Fechar">×</button></div><p class="lr-help">Cópias internas das três guias, guardadas neste navegador. As versões salvas no GitHub continuam no Histórico de cada guia.</p><p class="lr-help">Até 30 cópias. Os 10 pontos nomeados mais recentes têm prioridade.</p><button type="button" class="lr-create">Criar ponto de restauração</button><div class="lr-status" role="status" aria-live="polite"></div><div class="lr-list">Carregando…</div></section>`;
    modal=root;document.body.appendChild(root);
    root.querySelector('.lr-close').onclick=close;
    root.addEventListener('click',async event=>{
      if(event.target===root){close();return}
      const button=event.target.closest('button');if(!button||button.disabled||button.classList.contains('lr-close'))return;
      const id=button.dataset.lrRestore||button.dataset.lrDownload;
      if(!id&&!button.classList.contains('lr-create'))return;
      const controls=[...root.querySelectorAll('button:not(.lr-close)')];controls.forEach(control=>control.disabled=true);
      let message='',error=false;
      try{
        if(button.classList.contains('lr-create')){const saved=await checkpoint();if(saved)message='Ponto de restauração criado.'}
        else if(button.dataset.lrRestore){if(await restore(id))message='Dados restaurados nas três guias. A versão anterior continua neste histórico.'}
        else await download(id);
      }catch(failure){message=failure.message;error=true}
      finally{controls.forEach(control=>control.disabled=false)}
      if(root.isConnected)await render(root,message,error);
    });
    document.addEventListener('keydown',dialogKeydown,true);
    root.querySelector('.lr-close').focus();await render(root);
  }
  return {capture,list,get,restore,download,checkpoint,open,close};
})();
