/* Independent Todo versions share the existing private GitHub connection. */
window.TodoCloud=(()=>{
  'use strict';
  const ROOT='pf_github_backup_v1',TOKEN=ROOT+'_token',KEY='pf_github_todo_v1',PATH='backups/todo.json';
  let meta={},busy=false,ready=false,last='',startup='',hadLocalData=false,boundConnection='',operationConnection='',blocked=false,errorMessage='';
  let connectionReady=Promise.resolve(),startPromise=null;
  const read=(store,key,fallback)=>{try{return JSON.parse(store.getItem(key))||fallback}catch{return fallback}};
  const connection=()=>({...read(localStorage,ROOT,{}),token:read(localStorage,TOKEN,'')||read(sessionStorage,TOKEN,'')});
  const emit=()=>window.dispatchEvent(new CustomEvent('projectflow:cloudstate',{detail:{source:'todo'}}));
  const status=text=>{document.getElementById('ntCloudStatus').textContent=text;emit()};
  const fingerprint=()=>JSON.stringify(window.NativeTodo.snapshot());
  const persist=()=>localStorage.setItem(KEY,JSON.stringify(meta));
  function changed(){if(ready&&!busy&&connection().enabled&&connection().token&&meta.enabled!==false&&fingerprint()!==last)status('Todo alterado — salvamento pendente');else emit()}
  const signature=()=>{const c=connection();return JSON.stringify([c.repo||'',c.token,!!c.enabled,meta.enabled!==false])};
  function failure(message){const error=new Error(message);error.cloudBlocked=true;return error}
  function failed(error){errorMessage=error.name==='AbortError'?'A conexão demorou demais.':error.message;blocked=!!error.cloudBlocked||error.name==='SyntaxError';return {ok:false,pending:!blocked,blocked,error:errorMessage}}
  function state(){const c=connection();if(boundConnection&&boundConnection!==signature()){ready=false;blocked=false;errorMessage='';boundConnection=''}const fp=fingerprint();return {connected:!!(c.repo&&c.token&&c.enabled&&meta.enabled!==false),repo:c.repo||'',ready,busy,fingerprint:fp,savedFingerprint:last,dirty:fp!==last||!meta.sha&&hadLocalData,blocked,error:errorMessage}}
  function begin(){operationConnection=signature();boundConnection=operationConnection;blocked=false;errorMessage='';busy=true}
  function finish(){operationConnection='';busy=false;emit()}
  async function capture(reason){if(!window.LocalRecovery)throw failure('A recuperação interna está indisponível; as tarefas locais foram mantidas.');try{await window.LocalRecovery.capture({scope:'todo',reason})}catch(error){throw failure('A cópia de recuperação interna falhou; as tarefas locais foram mantidas: '+error.message)}}
  async function request(path,options={}){
    const c=connection();if(operationConnection&&signature()!==operationConnection)throw failure('A conexão mudou; reconecte antes de salvar.');if(meta.repo&&c.repo!==meta.repo)ready=false;
    if(!c.repo||!c.token||!c.enabled)throw failure('Configure a conexão com o GitHub.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch('https://api.github.com/repos/'+c.repo+path,{...options,cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+c.token,'X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})}});
      if(response.status===404&&options.allowMissing)return null;
      if(!response.ok){const message=response.status===401?'Token inválido ou expirado.':response.status===409||response.status===422?'Conflito de versões; abra a última versão do Todo.':response.status===404?'Repositório ou versão não encontrado.':response.status===403?'Sem permissão ou limite da API.':'GitHub respondeu HTTP '+response.status+'.';throw [401,403,404,409,422].includes(response.status)?failure(message):new Error(message)}
      const result=await response.json();if(operationConnection&&signature()!==operationConnection)throw failure('A conexão mudou; reconecte antes de salvar.');return result;
    }finally{clearTimeout(timer)}
  }
  async function repository(){
    const c=connection(),repo=await request('');
    if(!repo.private||repo.has_pages)throw failure('Use um repositório privado sem GitHub Pages.');
    if(meta.repo!==c.repo){meta={repo:c.repo,enabled:true};ready=false;last=''}
    meta.branch=repo.default_branch;persist();
  }
  const path=ref=>'/contents/'+PATH+'?ref='+encodeURIComponent(ref||meta.branch);
  const encode=text=>btoa(Array.from(new TextEncoder().encode(text),b=>String.fromCharCode(b)).join(''));
  const decode=file=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
  function validate(data){try{if(data?.version!==1||data.type!=='todo')throw new Error('Arquivo do Todo inválido.');window.NativeTodo.validate(data)}catch(error){throw failure(error.message)}}
  function guard(silent=false){
    state();if(busy||window.GanttBackup?.state().busy||window.PlanCloud?.state().busy){status('Aguarde a operação em andamento');return false}
    const c=connection();if(!c.repo||!c.token||!c.enabled||meta.enabled===false){if(!silent)settings();return false}return true;
  }
  const lock=value=>document.getElementById('app').inert=value;
  async function latest(prompt=false,silent=!prompt){
    if(!guard(silent))return {ok:false,pending:true};begin();if(prompt)lock(true);status('Abrindo última versão do Todo…');
    try{
      await repository();const remote=await request(path(),{allowMissing:true});
      if(!remote){if(meta.sha)throw failure('O arquivo remoto foi removido; as tarefas locais foram mantidas.');ready=true;boundConnection=signature();status('Conectado — salve para criar a primeira versão do Todo');return {ok:true}}
      const data=decode(remote);validate(data);
      // Read the mounted React render before deciding whether replacing it is safe.
      window.NativeTodo.flush();const current=fingerprint();
      const dirty=meta.fingerprint?current!==meta.fingerprint:hadLocalData||current!==startup;
      if(!prompt&&remote.sha===meta.sha&&meta.fingerprint){ready=true;boundConnection=signature();status(dirty?'Todo local mantido; alterações pendentes':'Última versão do Todo aberta');return {ok:true,pending:dirty}}
      if(!prompt&&dirty)throw failure('Todo local mantido; uma versão remota diferente exige Conectar / abrir última versão.');
      if(prompt&&!confirm('Abrir a última versão do Todo e substituir as tarefas locais? Uma cópia de recuperação interna será guardada antes.')){blocked=true;errorMessage='Todo local mantido; abra a última versão para conectar';status(errorMessage);return {ok:false,blocked:true}}
      await capture('Antes de abrir tarefas do GitHub');
      if(signature()!==operationConnection)throw failure('A conexão mudou; reconecte antes de abrir.');
      if(!prompt&&fingerprint()!==current)throw failure('Todo local mantido; houve alterações durante a conexão. Reconecte para escolher uma versão.');
      window.NativeTodo.restoreData(data);meta.sha=remote.sha;last=fingerprint();meta.fingerprint=last;persist();ready=true;boundConnection=signature();startup=last;status('Última versão do Todo aberta');return {ok:true};
    }catch(error){const result=failed(error);status('Todo local mantido: '+errorMessage);return result}finally{finish();if(prompt)lock(false)}
  }
  async function save(source,silent=false){
    if(!guard(silent))return {ok:false,pending:true};
    if(!ready){if(silent)return {ok:false,blocked:true};await latest(true,false);if(!ready)return {ok:false,blocked:true}}
    begin();status('Salvando Todo no GitHub…');
    try{
      window.NativeTodo.flush();await repository();if(!ready)throw failure('A conexão mudou; abra a última versão do Todo.');
      const snapshot=window.NativeTodo.snapshot(),fp=JSON.stringify(snapshot),exportedAt=new Date().toISOString(),remote=await request(path(),{allowMissing:true});
      if((remote?.sha||null)!==(meta.sha||null))throw failure('Versão remota diferente; abra a última versão antes de salvar.');
      if(remote&&fp===last&&!source){status('Nenhuma alteração no Todo para salvar');return {ok:true}}
      const result=await request('/contents/'+PATH,{method:'PUT',body:JSON.stringify({branch:meta.branch,message:source?'Restaurar Todo da versão '+source.slice(0,7):'Salvar Todo',content:encode(JSON.stringify({...snapshot,exportedAt},null,2)),...(remote?{sha:remote.sha}:{})})});
      meta.sha=result.content.sha;meta.fingerprint=fp;last=fp;persist();status(fingerprint()===last?'Todo salvo no GitHub às '+new Date().toLocaleTimeString():'Versão salva; há novas alterações no Todo');return {ok:true,pending:fingerprint()!==last};
    }catch(error){const result=failed(error);status('Todo não salvo: '+errorMessage);return result}finally{finish()}
  }
  async function restore(commit){
    if(!guard()||!ready)return;begin();lock(true);let restored=false;
    try{
      await repository();const head=await request(path(),{allowMissing:true});
      if((head?.sha||null)!==(meta.sha||null))throw failure('Versão remota diferente; abra a última versão antes de restaurar.');
      const data=decode(await request(path(commit)));validate(data);
      if(!confirm('Restaurar esta versão do Todo e salvá-la como uma nova versão? Uma cópia de recuperação interna será guardada antes.'))return;
      await capture('Antes de restaurar o histórico de tarefas');if(signature()!==operationConnection)throw failure('A conexão mudou; reconecte antes de restaurar.');window.NativeTodo.restoreData(data);restored=true;
    }catch(error){failed(error);status('Falha ao restaurar Todo: '+error.message)}finally{finish();lock(false)}
    if(restored)await save(commit);
  }
  async function history(){
    if(!guard())return;if(!ready){await latest();if(!ready)return}begin();status('Carregando histórico do Todo…');
    try{
      await repository();closePopups();closeEditor();
      const overlay=document.createElement('div');overlay.className='popup-overlay';
      const modal=document.createElement('div');modal.className='modal ap-modal';
      modal.innerHTML='<h3>Histórico do Task</h3><p>Restaurar cria uma nova versão e mantém as versões anteriores.</p><div id="ntVersions" style="max-height:45vh;overflow:auto"></div><div class="modal-actions"><button id="ntMoreVersions">Mais versões</button><button id="ntCloseVersions">Fechar</button></div>';
      document.body.append(overlay,modal);let page=1;
      const list=modal.querySelector('#ntVersions'),more=modal.querySelector('#ntMoreVersions');
      async function addPage(){
        more.disabled=true;
        try{
          const commits=await request('/commits?path='+encodeURIComponent(PATH)+'&sha='+encodeURIComponent(meta.branch)+'&per_page=30&page='+page);
          for(const commit of commits){
            const button=document.createElement('button');button.style.cssText='display:block;width:100%;text-align:left;white-space:normal;margin-bottom:6px;padding:8px';
            button.textContent=new Date(commit.commit.committer.date).toLocaleString()+' · '+commit.sha.slice(0,7)+' · '+commit.commit.message.split('\n')[0];
            button.onclick=()=>{closePopups();restore(commit.sha)};list.append(button);
          }
          if(!commits.length&&page===1)list.textContent='Nenhum Todo salvo ainda.';
          page++;more.hidden=commits.length<30;status('Histórico do Todo carregado');
        }catch(error){status('Falha no histórico do Todo: '+error.message)}finally{more.disabled=false}
      }
      more.onclick=async()=>{if(!guard(true))return;begin();emit();try{await addPage()}finally{finish()}};
      modal.querySelector('#ntCloseVersions').onclick=closePopups;overlay.onclick=closePopups;await addPage();
    }catch(error){status('Falha no histórico do Todo: '+error.message)}finally{finish()}
  }
  function settings(){
    if(busy)return;closePopups();closeEditor();const c=connection();
    const overlay=document.createElement('div');overlay.className='popup-overlay';
    const modal=document.createElement('div');modal.className='modal ap-modal';
    modal.innerHTML='<h3>GitHub do Task</h3><p>O Todo tem salvamento e histórico próprios. Use o mesmo repositório privado e token dos cronogramas e planos.</p><label>Repositório<input id="ntRepo" autocomplete="off"></label><label>Token<input id="ntToken" type="password" autocomplete="off"></label><label><input id="ntRemember" type="checkbox" style="display:inline;width:auto"> Lembrar no navegador pessoal</label><div class="modal-actions"><button id="ntDisconnect">Desconectar Todo</button><button id="ntCancelCloud">Fechar</button><button class="act" id="ntConnect">Conectar / abrir última versão</button></div>';
    document.body.append(overlay,modal);const field=id=>modal.querySelector('#'+id);
    field('ntRepo').value=c.repo||'';field('ntToken').value=c.token||'';field('ntRemember').checked=!!localStorage.getItem(TOKEN);
    field('ntConnect').onclick=()=>{
      const repo=field('ntRepo').value.trim(),token=field('ntToken').value.trim();
      if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo)||!token){status('Informe repositório e token válidos');return}
      const old=read(localStorage,ROOT,{});
      localStorage.setItem(ROOT,JSON.stringify({...old,...(old.repo===repo?{}:{sha:null,branch:null,fingerprint:null,coveredFingerprint:null,remoteTime:null}),repo,enabled:true}));
      localStorage.removeItem(TOKEN);sessionStorage.removeItem(TOKEN);(field('ntRemember').checked?localStorage:sessionStorage).setItem(TOKEN,JSON.stringify(token));
      if(meta.repo!==repo)meta={repo};meta.enabled=true;ready=false;persist();closePopups();latest(true);
    };
    field('ntDisconnect').onclick=()=>{meta.enabled=false;ready=false;persist();closePopups();status('Todo desconectado do GitHub')};
    field('ntCancelCloud').onclick=closePopups;overlay.onclick=closePopups;
  }
  function init(){
    meta=read(localStorage,KEY,{});startup=fingerprint();hadLocalData=window.NativeTodo.hasLocalData();last=meta.fingerprint||startup;
    document.getElementById('ntCloudSave').onclick=()=>save();document.getElementById('ntCloudHistory').onclick=history;document.getElementById('ntCloudSettings').onclick=settings;
    status('GitHub do Todo aguardando conexão');
    window.addEventListener('beforeunload',event=>{if(connection().enabled&&connection().token&&meta.enabled!==false&&fingerprint()!==last){event.preventDefault();event.returnValue=''}});
  }
  function start(){
    if(startPromise)return startPromise;
    startPromise=(async()=>{
      await connectionReady;
      const c=connection();if(c.repo&&c.token&&c.enabled&&meta.enabled!==false)return latest(false,true);status('GitHub do Todo desconectado');
    })();
    return startPromise;
  }
  return {init,start,changed,state,autoConnect:async()=>{await connectionReady;if(state().ready)return {ok:true};return blocked?{ok:false,blocked:true}:latest(false,true)},autoSave:()=>blocked?Promise.resolve({ok:false,blocked:true}):save(null,true),save,waitForConnection:promise=>{connectionReady=promise}};
})();
