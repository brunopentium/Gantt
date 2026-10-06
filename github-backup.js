/* Private GitHub backups. Credentials never enter schedule exports or commits. */
window.GanttBackup = (() => {
  'use strict';
  const KEY='pf_github_backup_v1', TOKEN_KEY=KEY+'_token', PATH='backups/cronogramas.json';
  let api, config={}, token='', timer, busy=false, blocked=false, restoring=false, lastContent='';
  function read(store,key,fallback){try{return JSON.parse(store.getItem(key))||fallback}catch{return fallback}}
  function persist(){localStorage.setItem(KEY,JSON.stringify(config))}
  function status(message){document.getElementById('cloudBackupStatus').textContent=message}
  function content(){return JSON.stringify(api.snapshot(),(k,v)=>k==='updatedAt'?undefined:v)}
  function credentials(){return config.repo&&token&&config.enabled}
  function changed(){
    if(!api||restoring||!credentials()||blocked||content()===lastContent)return;
    status('Alterações aguardando backup');
    if(!timer)timer=setTimeout(()=>{timer=null;backup()},60000);
  }
  async function request(path,options={}){
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch('https://api.github.com/repos/'+config.repo+path,{
        ...options,redirect:'error',signal:controller.signal,
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
  function filePath(){return '/contents/'+PATH+'?ref='+encodeURIComponent(config.branch)}
  function encode(text){return btoa(Array.from(new TextEncoder().encode(text),b=>String.fromCharCode(b)).join(''))}
  function decode(text){return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)))}
  async function backup(){
    if(busy||!credentials()||restoring)return;
    clearTimeout(timer);timer=null;busy=true;blocked=false;status('Salvando backup…');
    try{
      await repository();
      const snapshot=api.snapshot(), fingerprint=content();
      const remote=await request(filePath(),{allowMissing:true});
      if((remote&&remote.sha)!==(config.sha||null)&&!(remote===null&&!config.sha))
        throw new Error('Backup remoto diferente. Restaure antes de salvar; nada foi sobrescrito.');
      if(remote&&fingerprint===lastContent){status('Backup já atualizado');return}
      const result=await request('/contents/'+PATH,{method:'PUT',body:JSON.stringify({
        message:'Backup automático dos cronogramas',branch:config.branch,
        content:encode(JSON.stringify({...snapshot,exportedAt:new Date().toISOString()},null,2)),
        ...(remote?{sha:remote.sha}:{})
      })});
      config.sha=result.content.sha;config.lastSaved=new Date().toISOString();persist();
      lastContent=fingerprint;status('Backup salvo às '+new Date(config.lastSaved).toLocaleTimeString());
    }catch(error){blocked=true;status('Backup pendente: '+(error.name==='AbortError'?'tempo de conexão esgotado.':error.message))}
    finally{busy=false;if(!blocked)changed()}
  }
  function validate(data){
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
  async function restore(){
    if(busy||!credentials())return;
    clearTimeout(timer);timer=null;busy=true;status('Lendo backup…');
    try{
      await repository();const remote=await request(filePath());
      const data=JSON.parse(decode(remote.content));validate(data);
      if(!window.confirm('Substituir todos os cronogramas deste navegador pelo backup do GitHub? Uma cópia local será baixada antes.')){status('Restauração cancelada');return}
      api.localBackup();restoring=true;api.restore(data);restoring=false;
      config.sha=remote.sha;persist();lastContent=content();blocked=false;status('Backup restaurado');
    }catch(error){blocked=true;status('Falha ao restaurar: '+error.message)}
    finally{restoring=false;busy=false;if(!blocked)changed()}
  }
  function settings(){
    if(busy){status('Aguarde a operação em andamento');return}
    closePopups();closeEditor();
    const overlay=document.createElement('div');overlay.className='popup-overlay';
    const modal=document.createElement('div');modal.className='modal';modal.style.width='min(440px,95vw)';
    modal.innerHTML=`<h3>Backup automático no GitHub</h3>
      <p>Crie um repositório <strong>privado</strong>, sem Pages, e inicialize com README. Crie um token fine-grained limitado a esse repositório, com Contents: Read and write.</p>
      <p>Todos os cronogramas serão salvos em <code>${PATH}</code>, até um minuto após alterações. O histórico de commits guarda as versões. Mantenha o site aberto até aparecer “Backup salvo”.</p>
      <label>Repositório (usuário/nome)<input id="gbRepo" placeholder="brunopentium/gantt-backups" autocomplete="off"></label>
      <label>Token do GitHub<input id="gbToken" type="password" autocomplete="off"></label>
      <label style="display:block;margin-bottom:8px"><input id="gbRemember" type="checkbox" style="width:auto;margin:0"> Lembrar token neste navegador pessoal</label>
      <p>Sem essa opção, o token dura apenas nesta aba. Se lembrar, ele fica no armazenamento do navegador. Nunca use um computador compartilhado.</p>
      <div class="modal-actions" style="flex-wrap:wrap"><button id="gbClose">Fechar</button><button id="gbDisconnect">Desconectar</button><button id="gbRestore">Restaurar</button><button class="act" id="gbSave">Salvar e ativar</button></div>`;
    document.body.append(overlay,modal);
    const field=id=>modal.querySelector('#'+id);
    field('gbRepo').value=config.repo||'';field('gbToken').value=token;
    field('gbRemember').checked=!!localStorage.getItem(TOKEN_KEY);
    function configure(){
      const repo=field('gbRepo').value.trim(), nextToken=field('gbToken').value.trim();
      if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo)||!nextToken){status('Informe usuário/repositório e token');return false}
      if(config.repo!==repo)config={repo};
      config.enabled=true;token=nextToken;blocked=false;persist();
      localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);
      (field('gbRemember').checked?localStorage:sessionStorage).setItem(TOKEN_KEY,JSON.stringify(token));
      closePopups();return true;
    }
    field('gbSave').onclick=()=>{if(configure())backup()};
    field('gbRestore').onclick=()=>{if(configure())restore()};
    field('gbClose').onclick=closePopups;overlay.onclick=closePopups;
    field('gbDisconnect').onclick=()=>{clearTimeout(timer);timer=null;config.enabled=false;persist();token='';localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);closePopups();status('Backup desconectado')};
  }
  function init(adapter){
    api=adapter;config=read(localStorage,KEY,{});token=read(localStorage,TOKEN_KEY,'')||read(sessionStorage,TOKEN_KEY,'');
    document.getElementById('btnCloudBackup').onclick=settings;
    status(config.enabled?(token?'Backup conectado':'Informe o token para retomar os backups'):'Backup GitHub desconectado');
    changed();
    window.addEventListener('online',()=>{if(credentials()){blocked=false;changed()}});
    window.addEventListener('beforeunload',event=>{if(credentials()&&content()!==lastContent){event.preventDefault();event.returnValue=''}});
  }
  return {init,changed};
})();
