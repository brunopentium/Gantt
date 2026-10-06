/* Independent plan versions use the existing private-repository credentials. */
window.PlanCloud=(()=>{
  'use strict';
  const ROOT='pf_github_backup_v1',TOKEN=ROOT+'_token',KEY='pf_github_action_plans_v1',PATH='backups/planos-de-acao.json';
  let api,meta={},busy=false,ready=false,last='',startup='';
  const read=(store,key,fallback)=>{try{return JSON.parse(store.getItem(key))||fallback}catch{return fallback}};
  const connection=()=>({...read(localStorage,ROOT,{}),token:read(localStorage,TOKEN,'')||read(sessionStorage,TOKEN,'')});
  const status=text=>document.getElementById('apCloudStatus').textContent=text;
  const fingerprint=()=>JSON.stringify(api.snapshot());
  function persist(){localStorage.setItem(KEY,JSON.stringify(meta))}
  function changed(){if(api&&connection().token&&meta.enabled!==false&&fingerprint()!==last)status('Planos alterados — clique em 💾 Salvar')}
  async function request(path,options={}){
    const c=connection();if(meta.repo&&c.repo!==meta.repo)ready=false;if(!c.repo||!c.token||!c.enabled)throw new Error('Configure a conexão com o GitHub.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const r=await fetch('https://api.github.com/repos/'+c.repo+path,{...options,cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+c.token,'X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})}});
      if(r.status===404&&options.allowMissing)return null;
      if(!r.ok)throw new Error(r.status===401?'Token inválido ou expirado.':r.status===409||r.status===422?'Conflito de versões; abra a última versão dos planos.':r.status===404?'Repositório ou versão não encontrado.':r.status===403?'Sem permissão ou limite da API.':'GitHub respondeu HTTP '+r.status+'.');
      return await r.json();
    }finally{clearTimeout(timer)}
  }
  async function repository(){
    const c=connection(),repo=await request('');if(!repo.private||repo.has_pages)throw new Error('Use um repositório privado sem GitHub Pages.');
    if(meta.repo!==c.repo){meta={repo:c.repo,enabled:true};ready=false;last=''}
    meta.branch=repo.default_branch;persist();
  }
  const path=ref=>'/contents/'+PATH+'?ref='+encodeURIComponent(ref||meta.branch);
  const encode=text=>btoa(Array.from(new TextEncoder().encode(text),b=>String.fromCharCode(b)).join(''));
  const decode=file=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
  function validate(d){if(d?.version!==1||d.type!=='action-plans')throw new Error('Arquivo de planos inválido.');window.ActionPlans.validate(d.actionPlans)}
  function guard(){if(busy){status('Aguarde a operação em andamento');return false}const c=connection();if(!c.repo||!c.token||!c.enabled||meta.enabled===false){settings();return false}return true}
  function lock(v){document.getElementById('app').inert=v}
  async function latest(prompt=false,initial=false){
    if(!guard())return;busy=true;lock(true);status('Abrindo última versão dos planos…');
    try{
      await repository();const remote=await request(path(),{allowMissing:true});
      if(!remote){if(meta.sha)throw new Error('O arquivo remoto foi removido; os planos locais foram mantidos.');ready=true;status('Conectado — clique em 💾 Salvar para criar a primeira versão dos planos');return}
      const d=decode(remote);validate(d);const dirty=meta.fingerprint&&(initial?startup:fingerprint())!==meta.fingerprint;
      if((prompt||dirty)&&!confirm('Abrir a última versão dos planos e substituir os planos locais? Uma cópia local será baixada antes. As datas das ações vinculadas serão aplicadas às tarefas correspondentes.')){status('Planos locais mantidos; abra a última versão para conectar');return}
      if(prompt||dirty)api.localBackup();api.restore(d,!window.GanttBackup.remoteTime()||!d.exportedAt||d.exportedAt>=window.GanttBackup.remoteTime());window.GanttBackup.acknowledgePlans();meta.sha=remote.sha;last=fingerprint();meta.fingerprint=last;persist();ready=true;status('Última versão dos planos aberta');
    }catch(e){status('Planos locais mantidos: '+e.message)}finally{busy=false;lock(false)}
  }
  async function save(source){
    if(!guard())return;if(!ready){await latest();if(!ready)return}
    busy=true;status('Salvando planos no GitHub…');
    try{
      api.flush();await repository();if(!ready)throw new Error('A conexão mudou; abra a última versão dos planos.');
      const snapshot=api.snapshot(),fp=JSON.stringify(snapshot),remote=await request(path(),{allowMissing:true});
      if((remote?.sha||null)!==(meta.sha||null))throw new Error('Versão remota diferente; abra a última versão antes de salvar.');
      if(remote&&fp===last&&!source){status('Nenhuma alteração nos planos para salvar');return}
      const result=await request('/contents/'+PATH,{method:'PUT',body:JSON.stringify({branch:meta.branch,message:source?'Restaurar planos da versão '+source.slice(0,7):'Salvar planos de ação',content:encode(JSON.stringify({...snapshot,exportedAt:new Date().toISOString()},null,2)),...(remote?{sha:remote.sha}:{})})});
      window.GanttBackup.acknowledgePlans();meta.sha=result.content.sha;meta.fingerprint=fp;last=fp;persist();status(fingerprint()===last?'Planos salvos no GitHub às '+new Date().toLocaleTimeString():'Versão salva; há novas alterações nos planos');
    }catch(e){status('Planos não salvos: '+e.message)}finally{busy=false}
  }
  async function restore(commit,legacy=false){
    if(!guard()||!ready)return;busy=true;lock(true);let restored=false;
    try{
      await repository();const head=await request(path(),{allowMissing:true});if((head?.sha||null)!==(meta.sha||null))throw new Error('Versão remota diferente; abra a última versão antes de restaurar.');
      let d=decode(await request(legacy?'/contents/backups/cronogramas.json?ref='+encodeURIComponent(commit):path(commit)));if(legacy){if(!Array.isArray(d.actionPlans))throw new Error('Esta versão anterior não contém planos de ação.');d={version:1,type:'action-plans',actionPlans:d.actionPlans}}validate(d);
      if(!confirm('Restaurar estes planos como uma nova versão? Os cronogramas serão mantidos; apenas as datas de tarefas vinculadas podem ser atualizadas. Uma cópia local dos planos será baixada antes.'))return;
      api.localBackup();api.restore(d);restored=true;
    }catch(e){status('Falha ao restaurar planos: '+e.message)}finally{busy=false;lock(false)}
    if(restored)await save(commit);
  }
  async function history(legacy=false){
    if(!guard())return;if(!ready){await latest();if(!ready)return}busy=true;status('Carregando histórico dos planos…');
    try{
      await repository();closePopups();closeEditor();const ov=document.createElement('div');ov.className='popup-overlay';const m=document.createElement('div');m.className='modal ap-modal';
      m.innerHTML='<h3>'+ (legacy?'Histórico anterior dos planos':'Histórico dos planos de ação')+'</h3><p>Escolha um salvamento dos planos. O histórico dos cronogramas é separado.</p><div id="apVersions" style="max-height:45vh;overflow:auto"></div><div class="modal-actions"><button id="apOtherHistory">Histórico anterior</button><button id="apMoreVersions">Mais versões</button><button id="apCloseVersions">Fechar</button></div>';document.body.append(ov,m);let page=1;
      const list=m.querySelector('#apVersions'),more=m.querySelector('#apMoreVersions');
      async function addPage(){more.disabled=true;try{const commits=await request('/commits?path='+encodeURIComponent(legacy?'backups/cronogramas.json':PATH)+'&sha='+encodeURIComponent(meta.branch)+'&per_page=30&page='+page);for(const c of commits){const b=document.createElement('button');b.style.cssText='display:block;width:100%;text-align:left;white-space:normal;margin-bottom:6px;padding:8px';b.textContent=new Date(c.commit.committer.date).toLocaleString()+' · '+c.sha.slice(0,7)+' · '+c.commit.message.split('\n')[0];b.onclick=()=>{closePopups();restore(c.sha,legacy)};list.appendChild(b)}if(!commits.length&&page===1)list.textContent='Nenhum plano salvo ainda.';page++;more.hidden=commits.length<30;status('Histórico dos planos carregado')}catch(e){status('Falha no histórico dos planos: '+e.message)}finally{more.disabled=false}}
      more.onclick=async()=>{if(busy)return;busy=true;try{await addPage()}finally{busy=false}};const other=m.querySelector('#apOtherHistory');other.textContent=legacy?'Histórico próprio dos planos':'Histórico anterior';other.onclick=()=>{closePopups();history(!legacy)};m.querySelector('#apCloseVersions').onclick=closePopups;ov.onclick=closePopups;await addPage();
    }catch(e){status('Falha no histórico dos planos: '+e.message)}finally{busy=false}
  }
  function settings(){
    if(busy)return;closePopups();closeEditor();const c=connection(),ov=document.createElement('div');ov.className='popup-overlay';const m=document.createElement('div');m.className='modal ap-modal';
    m.innerHTML='<h3>GitHub dos planos de ação</h3><p>Os planos têm salvamento e histórico próprios. Use o mesmo repositório privado e token já configurados.</p><label>Repositório<input id="apRepo" autocomplete="off"></label><label>Token<input id="apToken" type="password" autocomplete="off"></label><label><input id="apRemember" type="checkbox" style="display:inline;width:auto"> Lembrar no navegador pessoal</label><div class="modal-actions"><button id="apDisconnect">Desconectar planos</button><button id="apCancelCloud">Fechar</button><button class="act" id="apConnect">Conectar / abrir última versão</button></div>';
    document.body.append(ov,m);const f=k=>m.querySelector('#'+k);f('apRepo').value=c.repo||'';f('apToken').value=c.token||'';f('apRemember').checked=!!localStorage.getItem(TOKEN);
    f('apConnect').onclick=()=>{const repo=f('apRepo').value.trim(),token=f('apToken').value.trim();if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo)||!token){status('Informe repositório e token válidos');return}const old=read(localStorage,ROOT,{});localStorage.setItem(ROOT,JSON.stringify({...old,...(old.repo===repo?{}:{sha:null,branch:null,fingerprint:null,coveredFingerprint:null,remoteTime:null}),repo,enabled:true}));localStorage.removeItem(TOKEN);sessionStorage.removeItem(TOKEN);(f('apRemember').checked?localStorage:sessionStorage).setItem(TOKEN,JSON.stringify(token));if(meta.repo!==repo)meta={repo};meta.enabled=true;ready=false;persist();closePopups();latest(true)};
    f('apDisconnect').onclick=()=>{meta.enabled=false;ready=false;persist();closePopups();status('Planos desconectados do GitHub')};f('apCancelCloud').onclick=closePopups;ov.onclick=closePopups;
  }
  function init(adapter){api=adapter;meta=read(localStorage,KEY,{});last=meta.fingerprint||(adapter.snapshot().actionPlans.length?'':fingerprint());startup=fingerprint();document.getElementById('apCloudSave').onclick=()=>save();document.getElementById('apCloudHistory').onclick=()=>history();document.getElementById('apCloudSettings').onclick=settings;status('GitHub dos planos aguardando conexão');window.addEventListener('beforeunload',e=>{if(connection().token&&meta.enabled!==false&&fingerprint()!==last){e.preventDefault();e.returnValue=''}})}
  function start(){const c=connection();if(c.repo&&c.token&&c.enabled&&meta.enabled!==false)return latest(false,true);status('GitHub dos planos desconectado')}
  return {init,start,changed};
})();
