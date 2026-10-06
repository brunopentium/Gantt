/* Private GitHub backups. Credentials never enter schedule exports or commits. */
window.GanttBackup = (() => {
  'use strict';
  const KEY='pf_github_backup_v1', TOKEN_KEY=KEY+'_token', PATH='backups/cronogramas.json';
  let api, config={}, token='', busy=false, ready=false, restoring=false, lastContent='';
  function read(store,key,fallback){try{return JSON.parse(store.getItem(key))||fallback}catch{return fallback}}
  function persist(){localStorage.setItem(KEY,JSON.stringify(config))}
  function status(message){document.getElementById('cloudBackupStatus').textContent=message}
  function content(){return JSON.stringify(api.snapshot(),(k,v)=>k==='updatedAt'?undefined:v)}
  function credentials(){return config.repo&&token&&config.enabled}
  function changed(){
    if(!api||restoring)return;
    if(credentials()&&content()!==lastContent)status('Alterações locais — clique em 💾 Salvar');
  }
  function guard(){
    if(busy){status('Aguarde a operação em andamento');return false}
    if(!credentials()){settings();return false}
    return true;
  }
  function lock(value){document.getElementById('app').inert=value}
  async function request(path,options={}){
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch('https://api.github.com/repos/'+config.repo+path,{
        ...options,cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
          'X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})}
      });
      if(response.status===404&&options.allowMissing)return null;
      if(!response.ok){
        if(response.status===409||response.status===422)throw new Error('Conflito: restaure o backup remoto antes de salvar.');
        if(response.status===401)throw new Error('Token inválido ou expirado.');
        if(response.status===403)throw new Error('Acesso negado ou limite da API. Verifique o token.');
        if(response.status===404)throw new Error('Repositório não encontrado ou token sem acesso.');
        throw new Error('GitHub respondeu HTTP '+response.status+'.');
      }
      return await response.json();
    }finally{clearTimeout(timeout)}
  }
  async function repository(){
    const repo=await request('');
    if(!repo.private)throw new Error('Use um repositório privado para proteger os cronogramas.');
    if(repo.has_pages)throw new Error('Use um repositório sem GitHub Pages para não publicar os backups.');
    if(!config.branch){config.branch=repo.default_branch;persist()}
    return repo;
  }
  function filePath(ref=config.branch){return '/contents/'+PATH+'?ref='+encodeURIComponent(ref)}
  function encode(text){return btoa(Array.from(new TextEncoder().encode(text),b=>String.fromCharCode(b)).join(''))}
  function decode(text){return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)))}
  async function backup(sourceCommit){
    if(!guard()||restoring)return;
    if(!ready){status('Conecte e abra a última versão antes de salvar');return}
    api.flush();busy=true;status('Salvando no GitHub…');
    try{
      await repository();
      const snapshot=api.snapshot(), fingerprint=content();
      const remote=await request(filePath(),{allowMissing:true});
      if((remote?.sha||null)!==(config.sha||null))
        throw new Error('Versão remota diferente. Abra a última versão antes de salvar; nada foi sobrescrito.');
      if(remote&&fingerprint===lastContent&&!sourceCommit){status('Nenhuma alteração para salvar');return}
      const result=await request('/contents/'+PATH,{method:'PUT',body:JSON.stringify({
        message:sourceCommit?'Restaurar cronogramas da versão '+sourceCommit.slice(0,7):'Salvar cronogramas',
        branch:config.branch,
        content:encode(JSON.stringify({...snapshot,exportedAt:new Date().toISOString()},null,2)),
        ...(remote?{sha:remote.sha}:{})
      })});
      config.sha=result.content.sha;config.lastSaved=new Date().toISOString();
      lastContent=fingerprint;config.fingerprint=lastContent;persist();
      status(content()===lastContent?'Salvo no GitHub às '+new Date(config.lastSaved).toLocaleTimeString():'Versão salva; há novas alterações locais — clique em 💾 Salvar');
    }catch(error){status('Não salvo no GitHub: '+(error.name==='AbortError'?'tempo de conexão esgotado.':error.message))}
    finally{busy=false}
  }
  function validate(data){
    window.ActionPlans?.validate(data.actionPlans||[]);
    if(data.version!==1||!Array.isArray(data.projects)||!data.projects.length)throw new Error('Backup inválido.');
    const ids=new Set();
    for(const p of data.projects){
      if(!p||typeof p.id!=='string'||ids.has(p.id)||typeof p.title!=='string'||!Array.isArray(p.tasks))throw new Error('Cronograma inválido no backup.');
      ids.add(p.id);
      for(const t of p.tasks){
        if(!t||typeof t.id!=='string'||typeof t.name!=='string'||!Number.isFinite(t.indent)||t.indent<0||t.indent>100||typeof t.pred!=='string'||!Number.isFinite(t.dur)||t.dur<0||!Number.isFinite(t.pct)||t.pct<0||t.pct>100)throw new Error('Tarefa inválida no backup.');
        for(const k of ['start','end'])if(t[k]!=null&&t[k]!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(t[k]))throw new Error('Data inválida no backup.');
      }
      // Reject dependency cycles before the existing scheduler runs.
      const visiting=new Set(),done=new Set();
      function visit(i){if(done.has(i))return;if(visiting.has(i))throw new Error('Dependências circulares no backup.');visiting.add(i);
        for(const part of p.tasks[i].pred.split(/[;,]/)){const m=part.trim().match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\d+)?d?\s*$/i);if(m&&p.tasks[+m[1]-1])visit(+m[1]-1)}
        visiting.delete(i);done.add(i)}
      p.tasks.forEach((_,i)=>visit(i));
    }
  }
  function apply(data){
    restoring=true;
    try{api.restore(data)}finally{restoring=false}
  }
  async function latest(prompt=false){
    if(!guard())return;
    busy=true;lock(true);status('Abrindo última versão…');
    try{
      await repository();const remote=await request(filePath(),{allowMissing:true});
      if(!remote){
        if(config.sha)throw new Error('O arquivo remoto foi removido. Seus dados locais foram mantidos.');
        ready=true;status('Repositório conectado — clique em 💾 Salvar para criar a primeira versão');return;
      }
      const data=JSON.parse(decode(remote.content));validate(data);
      const dirty=config.fingerprint&&content()!==config.fingerprint;
      if((prompt||dirty)&&!window.confirm('Abrir a última versão salva no GitHub e substituir os cronogramas locais? Uma cópia local será baixada antes.')){
        status('Dados locais mantidos; abra a última versão para conectar');return;
      }
      if(prompt||dirty)api.localBackup();
      apply(data);config.sha=remote.sha;lastContent=content();config.fingerprint=lastContent;persist();
      ready=true;status('Última versão do GitHub aberta');
    }catch(error){status('Não foi possível abrir o GitHub; dados locais mantidos: '+error.message)}
    finally{busy=false;lock(false)}
  }
  async function history(){
    if(!guard())return;
    if(!ready){status('Conecte e abra a última versão antes de consultar o histórico');return}
    busy=true;status('Carregando histórico…');
    try{
      await repository();closePopups();closeEditor();
      const overlay=document.createElement('div');overlay.className='popup-overlay';
      const modal=document.createElement('div');modal.className='modal';modal.style.width='min(520px,95vw)';
      modal.innerHTML='<h3>Versões salvas no GitHub</h3><p>Escolha uma versão para restaurar. A restauração cria um novo salvamento e mantém todas as versões anteriores.</p><div id="gbVersions" style="max-height:45vh;overflow:auto"></div><div class="modal-actions"><button id="gbMore">Mais versões</button><button id="gbHistoryClose">Fechar</button></div>';
      document.body.append(overlay,modal);let page=1;
      const list=modal.querySelector('#gbVersions'),more=modal.querySelector('#gbMore');
      async function addPage(){
        more.disabled=true;
        try{
          const commits=await request('/commits?path='+encodeURIComponent(PATH)+'&sha='+encodeURIComponent(config.branch)+'&per_page=30&page='+page);
          for(const commit of commits){
            const button=document.createElement('button');button.style.cssText='display:block;width:100%;text-align:left;margin-bottom:5px;white-space:normal;padding:8px';
            button.textContent=new Date(commit.commit.committer.date).toLocaleString()+' · '+commit.sha.slice(0,7)+' · '+commit.commit.message.split('\n')[0];
            button.onclick=()=>{closePopups();restoreVersion(commit.sha)};list.appendChild(button);
          }
          if(!commits.length&&page===1)list.textContent='Nenhum salvamento encontrado.';
          page++;more.hidden=commits.length<30;status('Histórico carregado');
        }catch(error){status('Falha ao carregar histórico: '+error.message)}
        finally{more.disabled=false}
      }
      more.onclick=async()=>{if(busy)return;busy=true;try{await addPage()}finally{busy=false}};
      modal.querySelector('#gbHistoryClose').onclick=closePopups;overlay.onclick=closePopups;
      await addPage();
    }catch(error){status('Falha ao carregar histórico: '+error.message)}
    finally{busy=false}
  }
  async function restoreVersion(commit){
    if(!guard()||!ready)return;
    busy=true;lock(true);status('Lendo versão selecionada…');let restored=false;
    try{
      await repository();
      const latestFile=await request(filePath());
      if(latestFile.sha!==config.sha)throw new Error('Versão remota diferente. Abra a última versão antes de restaurar.');
      const remote=await request(filePath(commit));const data=JSON.parse(decode(remote.content));validate(data);
      if(!window.confirm('Restaurar a versão '+commit.slice(0,7)+' e salvá-la como uma nova versão no GitHub? Uma cópia local será baixada antes.')){status('Restauração cancelada');return}
      api.localBackup();apply(data);restored=true;
    }catch(error){status('Falha ao restaurar: '+error.message)}
    finally{busy=false;lock(false)}
    if(restored)await backup(commit);
  }
  function settings(){
    if(busy){status('Aguarde a operação em andamento');return}
    closePopups();closeEditor();
    const overlay=document.createElement('div');overlay.className='popup-overlay';
    const modal=document.createElement('div');modal.className='modal';modal.style.width='min(440px,95vw)';
    modal.innerHTML=`<h3>Salvar cronogramas no GitHub</h3>
      <p>Crie um repositório <strong>privado</strong>, sem Pages, e inicialize com README. Crie um token fine-grained limitado a esse repositório, com Contents: Read and write.</p>
      <p>O botão 💾 Salvar grava todos os cronogramas no GitHub. Ao abrir o app conectado, ele carrega a última versão. Use Histórico para restaurar salvamentos anteriores.</p>
      <label>Repositório (usuário/nome)<input id="gbRepo" placeholder="brunopentium/gantt-backups" autocomplete="off"></label>
      <label>Token do GitHub<input id="gbToken" type="password" autocomplete="off"></label>
      <label style="display:block;margin-bottom:8px"><input id="gbRemember" type="checkbox" style="width:auto;margin:0"> Lembrar token neste navegador pessoal</label>
      <p>Sem essa opção, o token dura apenas nesta aba. Se lembrar, ele fica no armazenamento do navegador. Nunca use um computador compartilhado.</p>
      <div class="modal-actions" style="flex-wrap:wrap"><button id="gbClose">Fechar</button><button id="gbDisconnect">Desconectar</button><button class="act" id="gbConnect">Conectar / abrir última versão</button></div>`;
    document.body.append(overlay,modal);
    const field=id=>modal.querySelector('#'+id);
    field('gbRepo').value=config.repo||'';field('gbToken').value=token;
    field('gbRemember').checked=!!localStorage.getItem(TOKEN_KEY);
    function configure(){
      const repo=field('gbRepo').value.trim(), nextToken=field('gbToken').value.trim();
      if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo)||!nextToken){status('Informe usuário/repositório e token');return false}
      if(config.repo!==repo)config={repo};
      config.enabled=true;token=nextToken;ready=false;persist();
      localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);
      (field('gbRemember').checked?localStorage:sessionStorage).setItem(TOKEN_KEY,JSON.stringify(token));
      closePopups();return true;
    }
    field('gbConnect').onclick=()=>{if(configure())latest(true)};
    field('gbClose').onclick=closePopups;overlay.onclick=closePopups;
    field('gbDisconnect').onclick=()=>{ready=false;config.enabled=false;persist();token='';localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);closePopups();status('Backup desconectado')};
  }
  function init(adapter){
    api=adapter;config=read(localStorage,KEY,{});token=read(localStorage,TOKEN_KEY,'')||read(sessionStorage,TOKEN_KEY,'');
    if(config.fingerprint&&window.ActionPlans){
      try{const previous=JSON.parse(config.fingerprint);if(!Object.hasOwn(previous,'actionPlans')){previous.actionPlans=[];config.fingerprint=JSON.stringify(previous);persist()}}catch{}
    }
    lastContent=config.fingerprint||'';
    document.getElementById('btnCloudBackup').onclick=settings;
    document.getElementById('btnCloudSave').onclick=()=>backup();
    document.getElementById('btnCloudHistory').onclick=history;
    status(config.enabled?(token?'Abrindo GitHub…':'Informe o token para abrir a última versão'):'GitHub desconectado');
    if(credentials())latest();
    window.addEventListener('beforeunload',event=>{if(credentials()&&content()!==lastContent){event.preventDefault();event.returnValue=''}});
  }
  return {init,changed};
})();
