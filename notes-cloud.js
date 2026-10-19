/* Independent Notas versions share the existing private GitHub connection. */
window.NotesCloud=(()=>{
  'use strict';
  const ROOT=window.WorkspaceProfile.key('pf_github_backup_v1'),TOKEN=ROOT+'_token',KEY=window.WorkspaceProfile.key('pf_github_notes_v1'),PATH=window.WorkspaceProfile.path('backups/notas.json');
  let meta={},busy=false,ready=false,last='',startup='',hadLocalData=false,boundConnection='',operationConnection='',blocked=false,errorMessage='';
  let connectionReady=Promise.resolve(),startPromise=null;
  const read=(store,key,fallback)=>{try{return JSON.parse(store.getItem(key))||fallback}catch{return fallback}};
  const connection=()=>({...read(localStorage,ROOT,{}),token:read(localStorage,TOKEN,'')||read(sessionStorage,TOKEN,'')});
  const emit=()=>window.dispatchEvent(new CustomEvent('projectflow:cloudstate',{detail:{source:'notes'}}));
  const status=text=>{document.getElementById('notesCloudStatus').textContent=text;emit()};
  const fingerprint=()=>JSON.stringify(window.NotesData.snapshot());
  const persist=()=>localStorage.setItem(KEY,JSON.stringify(meta));
  function changed(){if(ready&&!busy&&connection().enabled&&connection().token&&meta.enabled!==false&&fingerprint()!==last)status('Notas alteradas — salvamento pendente');else emit()}
  const signature=()=>{const c=connection();return JSON.stringify([c.repo||'',c.token,!!c.enabled,meta.enabled!==false])};
  function failure(message){const error=new Error(message);error.cloudBlocked=true;return error}
  function failed(error){errorMessage=error.name==='AbortError'?'A conexão demorou demais.':error.message;blocked=!!error.cloudBlocked||error.name==='SyntaxError';return {ok:false,pending:!blocked,blocked,error:errorMessage}}
  function state(){const c=connection();if(boundConnection&&boundConnection!==signature()){ready=false;blocked=false;errorMessage='';boundConnection=''}const fp=fingerprint();return {connected:!!(c.repo&&c.token&&c.enabled&&meta.enabled!==false&&(meta.started||window.NotesData.hasLocalData())),repo:c.repo||'',ready,busy,fingerprint:fp,savedFingerprint:last,dirty:fp!==last||!meta.sha&&hadLocalData,blocked,error:errorMessage}}
  function begin(){operationConnection=signature();boundConnection=operationConnection;blocked=false;errorMessage='';busy=true}
  function finish(){operationConnection='';busy=false;emit()}
  async function capture(reason){if(!window.LocalRecovery)throw failure('A recuperação interna está indisponível; as notas locais foram mantidas.');try{await window.LocalRecovery.capture({scope:'notes',reason})}catch(error){throw failure('A cópia de recuperação interna falhou; as notas locais foram mantidas: '+error.message)}}
  async function request(path,options={}){
    const c=connection();if(operationConnection&&signature()!==operationConnection)throw failure('A conexão mudou; reconecte antes de salvar.');if(meta.repo&&c.repo!==meta.repo)ready=false;
    if(!c.repo||!c.token||!c.enabled)throw failure('Configure a conexão com o GitHub.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch('https://api.github.com/repos/'+c.repo+path,{...options,cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+c.token,'X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})}});
      if(response.status===404&&options.allowMissing)return null;
      if(!response.ok){const message=response.status===401?'Token inválido ou expirado.':response.status===409||response.status===422?'Conflito de versões; abra a última versão das Notas.':response.status===404?'Repositório ou versão não encontrado.':response.status===403?'Sem permissão ou limite da API.':'GitHub respondeu HTTP '+response.status+'.';throw [401,403,404,409,422].includes(response.status)?failure(message):new Error(message)}
      let result=await response.json();if(result.encoding==='none'&&result.sha)result=await request('/git/blobs/'+result.sha);if(operationConnection&&signature()!==operationConnection)throw failure('A conexão mudou; reconecte antes de salvar.');return result;
    }finally{clearTimeout(timer)}
  }
  async function repository(){
    const c=connection(),repo=await request('');
    if(!repo.private||repo.has_pages)throw failure('Use um repositório privado sem GitHub Pages.');
    if(meta.repo!==c.repo){meta={repo:c.repo,enabled:true,started:true};ready=false;last=''}
    meta.branch=repo.default_branch;persist();
  }
  const path=ref=>'/contents/'+PATH+'?ref='+encodeURIComponent(ref||meta.branch);
  const encode=text=>btoa(Array.from(new TextEncoder().encode(text),b=>String.fromCharCode(b)).join(''));
  const decode=file=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
  function validate(data){try{if(data?.version!==1||data.type!=='notes')throw new Error('Arquivo das Notas inválido.');window.NotesData.validate(data)}catch(error){throw failure(error.message)}}
  function guard(silent=false){
    state();if(busy||window.GanttBackup?.state().busy||window.PlanCloud?.state().busy||window.TodoCloud?.state().busy){status('Aguarde a operação em andamento');return false}
    const c=connection();if(!c.repo||!c.token||!c.enabled||meta.enabled===false){if(!silent)settings();return false}return true;
  }
  const lock=value=>document.getElementById('app').inert=value;
  async function latest(prompt=false,silent=!prompt){
    if(!guard(silent))return {ok:false,pending:true};begin();if(prompt)lock(true);status('Abrindo última versão das Notas…');
    try{
      await repository();const remote=await request(path(),{allowMissing:true});
      if(!remote){if(meta.sha)throw failure('O arquivo remoto foi removido; as notas locais foram mantidas.');ready=true;boundConnection=signature();status('Conectado — salve para criar a primeira versão das Notas');return {ok:true}}
      const data=decode(remote);validate(data);
      // Read the mounted React render before deciding whether replacing it is safe.
      window.NotesData.flush();const current=fingerprint();
      const dirty=meta.fingerprint?current!==meta.fingerprint:hadLocalData||current!==startup;
      if(!prompt&&remote.sha===meta.sha&&meta.fingerprint){ready=true;boundConnection=signature();status(dirty?'Notas locais mantidas; alterações pendentes':'Última versão das Notas aberta');return {ok:true,pending:dirty}}
      if(!prompt&&dirty)throw failure('Notas locais mantidas; uma versão remota diferente exige Conectar / abrir última versão.');
      if(prompt&&!confirm('Abrir a última versão das Notas e substituir as notas locais? Uma cópia de recuperação interna será guardada antes.')){blocked=true;errorMessage='Notas locais mantidas; abra a última versão para conectar';status(errorMessage);return {ok:false,blocked:true}}
      await capture('Antes de abrir notas do GitHub');
      if(signature()!==operationConnection)throw failure('A conexão mudou; reconecte antes de abrir.');
      if(!prompt&&fingerprint()!==current)throw failure('Notas locais mantidas; houve alterações durante a conexão. Reconecte para escolher uma versão.');
      window.NotesData.restoreData(data);meta.sha=remote.sha;last=fingerprint();meta.fingerprint=last;persist();ready=true;boundConnection=signature();startup=last;status('Última versão das Notas aberta');return {ok:true};
    }catch(error){const result=failed(error);status('Notas locais mantidas: '+errorMessage);return result}finally{finish();if(prompt)lock(false)}
  }
  async function save(source,silent=false){
    if(!guard(silent))return {ok:false,pending:true};
    if(!ready){if(silent)return {ok:false,blocked:true};await latest(true,false);if(!ready)return {ok:false,blocked:true}}
    begin();status('Salvandas Notas no GitHub…');
    try{
      window.NotesData.flush();await repository();if(!ready)throw failure('A conexão mudou; abra a última versão das Notas.');
      const snapshot=window.NotesData.snapshot();await uploadAssets(snapshot);const fp=JSON.stringify(snapshot),exportedAt=new Date().toISOString(),remote=await request(path(),{allowMissing:true});
      if((remote?.sha||null)!==(meta.sha||null))throw failure('Versão remota diferente; abra a última versão antes de salvar.');
      if(remote&&fp===last&&!source){status('Nenhuma alteração nas Notas para salvar');return {ok:true}}
      const result=await request('/contents/'+PATH,{method:'PUT',body:JSON.stringify({branch:meta.branch,message:source?'Restaurar Notas da versão '+source.slice(0,7):'Salvar Notas',content:encode(JSON.stringify({...snapshot,exportedAt},null,2)),...(remote?{sha:remote.sha}:{})})});
      meta.sha=result.content.sha;meta.fingerprint=fp;last=fp;persist();status(fingerprint()===last?'Notas salvas no GitHub às '+new Date().toLocaleTimeString():'Versão salva; há novas alterações nas Notas');return {ok:true,pending:fingerprint()!==last};
    }catch(error){const result=failed(error);status('Notas não salvas: '+errorMessage);return result}finally{finish()}
  }
  async function restore(commit){
    if(!guard()||!ready)return;begin();lock(true);let restored=false;
    try{
      await repository();const head=await request(path(),{allowMissing:true});
      if((head?.sha||null)!==(meta.sha||null))throw failure('Versão remota diferente; abra a última versão antes de restaurar.');
      const data=decode(await request(path(commit)));validate(data);
      if(!confirm('Restaurar esta versão das Notas e salvá-la como uma nova versão? Uma cópia de recuperação interna será guardada antes.'))return;
      await capture('Antes de restaurar o histórico de notas');if(signature()!==operationConnection)throw failure('A conexão mudou; reconecte antes de restaurar.');window.NotesData.restoreData(data);restored=true;
    }catch(error){failed(error);status('Falha ao restaurar Notas: '+error.message)}finally{finish();lock(false)}
    if(restored)await save(commit);
  }
  async function history(){
    if(!guard())return;if(!ready){await latest();if(!ready)return}begin();status('Carregando histórico das Notas…');
    try{
      await repository();closePopups();closeEditor();
      const overlay=document.createElement('div');overlay.className='popup-overlay';
      const modal=document.createElement('div');modal.className='modal ap-modal';
      modal.innerHTML='<h3>Histórico das Notas</h3><p>Restaurar cria uma nova versão e mantém as versões anteriores.</p><div id="notesVersions" style="max-height:45vh;overflow:auto"></div><div class="modal-actions"><button id="notesMoreVersions">Mais versões</button><button id="notesCloseVersions">Fechar</button></div>';
      document.body.append(overlay,modal);let page=1;
      const list=modal.querySelector('#notesVersions'),more=modal.querySelector('#notesMoreVersions');
      async function addPage(){
        more.disabled=true;
        try{
          const commits=await request('/commits?path='+encodeURIComponent(PATH)+'&sha='+encodeURIComponent(meta.branch)+'&per_page=30&page='+page);
          for(const commit of commits){
            const button=document.createElement('button');button.style.cssText='display:block;width:100%;text-align:left;white-space:normal;margin-bottom:6px;padding:8px';
            button.textContent=new Date(commit.commit.committer.date).toLocaleString()+' · '+commit.sha.slice(0,7)+' · '+commit.commit.message.split('\n')[0];
            button.onclick=()=>{closePopups();restore(commit.sha)};list.append(button);
          }
          if(!commits.length&&page===1)list.textContent='Nenhum Notas salvas ainda.';
          page++;more.hidden=commits.length<30;status('Histórico das Notas carregado');
        }catch(error){status('Falha no histórico das Notas: '+error.message)}finally{more.disabled=false}
      }
      more.onclick=async()=>{if(!guard(true))return;begin();emit();try{await addPage()}finally{finish()}};
      modal.querySelector('#notesCloseVersions').onclick=closePopups;overlay.onclick=closePopups;await addPage();
    }catch(error){status('Falha no histórico das Notas: '+error.message)}finally{finish()}
  }
  function settings(){
    if(busy)return;closePopups();closeEditor();const c=connection();
    const overlay=document.createElement('div');overlay.className='popup-overlay';
    const modal=document.createElement('div');modal.className='modal ap-modal';
    modal.innerHTML='<h3>GitHub de Notas</h3><p>O Notas tem salvamento e histórico próprios. Use o mesmo repositório privado e token dos cronogramas e planos.</p><label>Repositório<input id="notesRepo" autocomplete="off"></label><label>Token<input id="notesToken" type="password" autocomplete="off"></label><label><input id="notesRemember" type="checkbox" style="display:inline;width:auto"> Lembrar no navegador pessoal</label><div class="modal-actions"><button id="notesDisconnect">Desconectar Notas</button><button id="notesCancelCloud">Fechar</button><button class="act" id="notesConnect">Conectar / abrir última versão</button></div>';
    document.body.append(overlay,modal);const field=id=>modal.querySelector('#'+id);
    field('notesRepo').value=c.repo||'';field('notesToken').value=c.token||'';field('notesRemember').checked=!!localStorage.getItem(TOKEN);
    field('notesConnect').onclick=()=>{
      const repo=field('notesRepo').value.trim(),token=field('notesToken').value.trim();
      if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo)||!token){status('Informe repositório e token válidos');return}
      const old=read(localStorage,ROOT,{});
      localStorage.setItem(ROOT,JSON.stringify({...old,...(old.repo===repo?{}:{sha:null,branch:null,fingerprint:null,coveredFingerprint:null,remoteTime:null}),repo,enabled:true}));
      localStorage.removeItem(TOKEN);sessionStorage.removeItem(TOKEN);(field('notesRemember').checked?localStorage:sessionStorage).setItem(TOKEN,JSON.stringify(token));
      if(meta.repo!==repo)meta={repo};meta.enabled=true;ready=false;persist();closePopups();latest(true);
    };
    field('notesDisconnect').onclick=()=>{meta.enabled=false;ready=false;persist();closePopups();status('Notas desconectadas do GitHub')};
    field('notesCancelCloud').onclick=closePopups;overlay.onclick=closePopups;
  }
  function bindUI(){document.getElementById('notesCloudSave').onclick=()=>save();document.getElementById('notesCloudHistory').onclick=history;document.getElementById('notesCloudSettings').onclick=settings;document.getElementById('notesCloudStatus').textContent=errorMessage||(!state().connected?'Notas salvas neste navegador':ready?'Notas conectadas ao GitHub':'Conexão das Notas pendente');}
  function init(){
    meta=read(localStorage,KEY,{});startup=fingerprint();hadLocalData=window.NotesData.hasLocalData();last=meta.fingerprint||startup;if(meta.started||hadLocalData)queueMicrotask(()=>start());
    bindUI();
    status('GitHub de Notas aguardando conexão');
    window.addEventListener('beforeunload',event=>{if(!window.WorkspaceProfile.isSwitching()&&connection().enabled&&connection().token&&meta.enabled!==false&&fingerprint()!==last){event.preventDefault();event.returnValue=''}});
  }
  function start(){
    meta.started=true;persist();
    if(startPromise)return startPromise;
    startPromise=(async()=>{
      await connectionReady;
      const c=connection();if(c.repo&&c.token&&c.enabled&&meta.enabled!==false)return latest(false,true);status('GitHub de Notas desconectadas');
    })();
    return startPromise;
  }
  const assetPath=o=>window.WorkspaceProfile.path('backups/notas-imagens/')+o.assetId+'.'+(o.mime==='image/png'?'png':o.mime==='image/webp'?'webp':'jpg');
  async function asset(o){
    if(!state().connected)throw Error('Conecte as Notas ao GitHub para carregar esta imagem.');
    const file=await request('/contents/'+assetPath(o)+'?ref='+encodeURIComponent(meta.branch||'main'));
    const record={id:o.assetId,mime:o.mime,name:o.caption||'Imagem',base64:file.content.replace(/\s/g,'')};await window.NotesData.storeAsset(record);return record;
  }
  async function uploadAssets(snapshot){
    for(const o of window.NotesData.imageRefs(snapshot)){
      const remote=await request('/contents/'+assetPath(o)+'?ref='+encodeURIComponent(meta.branch),{allowMissing:true});
      if(remote)continue;
      const record=await window.NotesData.asset(o.assetId);if(!record)throw failure('Uma imagem não está disponível neste navegador. Abra a página e carregue a imagem antes de salvar.');
      await request('/contents/'+assetPath(o),{method:'PUT',body:JSON.stringify({branch:meta.branch,message:'Adicionar imagem imutável de Notas',content:record.base64})});
    }
  }
  return {asset,bindUI,init,start,changed,state,autoConnect:async()=>{await connectionReady;if(state().ready)return {ok:true};return blocked?{ok:false,blocked:true}:latest(false,true)},autoSave:()=>blocked?Promise.resolve({ok:false,blocked:true}):save(null,true),save,waitForConnection:promise=>{connectionReady=promise}};
})();
