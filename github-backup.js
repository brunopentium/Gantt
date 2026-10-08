/* Private GitHub backups. Credentials never enter schedule exports or commits. */
window.GanttBackup = (() => {
  'use strict';
  const KEY='pf_github_backup_v1', TOKEN_KEY=KEY+'_token', PATH='backups/cronogramas.json';
  let api, config={}, token='', busy=false, ready=false, restoring=false, lastContent='',covered='',pendingCover='';
  function read(store,key,fallback){try{return JSON.parse(store.getItem(key))||fallback}catch{return fallback}}
  function persist(){localStorage.setItem(KEY,JSON.stringify(config))}
  function status(message){document.getElementById('cloudBackupStatus').textContent=message}
  function content(){return JSON.stringify(api.snapshot(),(k,v)=>k==='updatedAt'?undefined:v)}
  function syncConnection(){const stored=read(localStorage,KEY,{});if(stored.repo!==config.repo){config=stored;ready=false;lastContent=config.fingerprint||'';covered=config.coveredFingerprint||'';pendingCover=''}else config.enabled=stored.enabled}
  function credentials(){syncConnection();token=read(localStorage,TOKEN_KEY,'')||read(sessionStorage,TOKEN_KEY,'');return config.repo&&token&&config.enabled}
  function changed(){
    if(!api||restoring)return;
    if(credentials()&&content()!==lastContent)status(content()===covered?'Linked dates saved in action plans':'Local changes — click 💾 Save');
  }
  function guard(){
    if(busy){status('Please wait for the current operation');return false}
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
        if(response.status===409||response.status===422)throw new Error('Conflict: restore the remote backup before saving.');
        if(response.status===401)throw new Error('Invalid or expired token.');
        if(response.status===403)throw new Error('Access denied or API limit reached. Check the token.');
        if(response.status===404)throw new Error('Repository not found or token has no access.');
        throw new Error('GitHub returned HTTP '+response.status+'.');
      }
      return await response.json();
    }finally{clearTimeout(timeout)}
  }
  async function repository(){
    const repo=await request('');
    if(!repo.private)throw new Error('Use a private repository to protect your schedules.');
    if(repo.has_pages)throw new Error('Use a repository without GitHub Pages to keep backups private.');
    if(!config.branch){config.branch=repo.default_branch;persist()}
    return repo;
  }
  function filePath(ref=config.branch){return '/contents/'+PATH+'?ref='+encodeURIComponent(ref)}
  function encode(text){return btoa(Array.from(new TextEncoder().encode(text),b=>String.fromCharCode(b)).join(''))}
  function decode(text){return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)))}
  async function backup(sourceCommit){
    if(!guard()||restoring)return;
    if(!ready){status('Connect and load the latest version before saving');return}
    api.flush();busy=true;status('Saving to GitHub…');
    try{
      await repository();
      const snapshot=api.snapshot(), fingerprint=content();
      const remote=await request(filePath(),{allowMissing:true});
      if((remote?.sha||null)!==(config.sha||null))
        throw new Error('Different remote version. Load the latest version before saving; nothing was overwritten.');
      if(remote&&fingerprint===lastContent&&!sourceCommit){status('No changes to save');return}
      const result=await request('/contents/'+PATH,{method:'PUT',body:JSON.stringify({
        message:sourceCommit?'Restaurar cronogramas da versão '+sourceCommit.slice(0,7):'Salvar cronogramas',
        branch:config.branch,
        content:encode(JSON.stringify({...snapshot,exportedAt:new Date().toISOString()},null,2)),
        ...(remote?{sha:remote.sha}:{})
      })});
      config.sha=result.content.sha;config.lastSaved=new Date().toISOString();config.remoteTime=config.lastSaved;covered='';pendingCover='';delete config.coveredFingerprint;
      lastContent=fingerprint;config.fingerprint=lastContent;persist();
      status(content()===lastContent?'Saved to GitHub at '+new Date(config.lastSaved).toLocaleTimeString():'Version saved; new local changes — click 💾 Save');
    }catch(error){status('Not saved to GitHub: '+(error.name==='AbortError'?'connection timed out.':error.message))}
    finally{busy=false}
  }
  function validate(data){
    window.ActionPlans?.validate(data.actionPlans||[]);
    window.ScheduleGroups?.validate(data.projects);
    if(data.version!==1||!Array.isArray(data.projects)||!data.projects.length)throw new Error('Invalid backup.');
    const ids=new Set();
    for(const p of data.projects){
      if(!p||typeof p.id!=='string'||ids.has(p.id)||typeof p.title!=='string'||!Array.isArray(p.tasks))throw new Error('Invalid schedule in backup.');
      ids.add(p.id);
      for(const t of p.tasks){
        if(!t||typeof t.id!=='string'||typeof t.name!=='string'||!Number.isFinite(t.indent)||t.indent<0||t.indent>100||typeof t.pred!=='string'||!Number.isFinite(t.dur)||t.dur<0||!Number.isFinite(t.pct)||t.pct<0||t.pct>100)throw new Error('Invalid task in backup.');
        for(const k of ['start','end'])if(t[k]!=null&&t[k]!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(t[k]))throw new Error('Invalid date in backup.');
      }
      // Reject dependency cycles before the existing scheduler runs.
      const visiting=new Set(),done=new Set();
      function visit(i){if(done.has(i))return;if(visiting.has(i))throw new Error('Circular dependencies in backup.');visiting.add(i);
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
    busy=true;lock(true);status('Loading the latest version…');
    try{
      await repository();const remote=await request(filePath(),{allowMissing:true});
      if(!remote){
        if(config.sha)throw new Error('The remote file was removed. Your local data was kept.');
        ready=true;status('Repository connected — click 💾 Save to create the first version');return;
      }
      const data=JSON.parse(decode(remote.content));validate(data);
      const dirty=config.fingerprint&&content()!==config.fingerprint&&content()!==covered;
      if((prompt||dirty)&&!window.confirm('Load the latest version saved on GitHub and replace local schedules? A local copy will be downloaded first.')){
        status('Local data kept; load the latest version to connect');return;
      }
      if(prompt||dirty)api.localBackup();
      apply(data);config.sha=remote.sha;config.remoteTime=data.exportedAt||null;covered='';pendingCover='';delete config.coveredFingerprint;lastContent=content();config.fingerprint=lastContent;persist();
      ready=true;status('Latest GitHub version loaded');
    }catch(error){status('Could not open GitHub; local data kept: '+error.message)}
    finally{busy=false;lock(false)}
  }
  async function history(){
    if(!guard())return;
    if(!ready){status('Connect and load the latest version before viewing history');return}
    busy=true;status('Loading history…');
    try{
      await repository();closePopups();closeEditor();
      const overlay=document.createElement('div');overlay.className='popup-overlay';
      const modal=document.createElement('div');modal.className='modal';modal.style.width='min(520px,95vw)';
      modal.innerHTML='<h3>Versions saved on GitHub</h3><p>Choose a version to restore. Restoring creates a new save and keeps all previous versions.</p><div id="gbVersions" style="max-height:45vh;overflow:auto"></div><div class="modal-actions"><button id="gbMore">More versions</button><button id="gbHistoryClose">Close</button></div>';
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
          if(!commits.length&&page===1)list.textContent='No saved versions found.';
          page++;more.hidden=commits.length<30;status('History loaded');
        }catch(error){status('Failed to load history: '+error.message)}
        finally{more.disabled=false}
      }
      more.onclick=async()=>{if(busy)return;busy=true;try{await addPage()}finally{busy=false}};
      modal.querySelector('#gbHistoryClose').onclick=closePopups;overlay.onclick=closePopups;
      await addPage();
    }catch(error){status('Failed to load history: '+error.message)}
    finally{busy=false}
  }
  async function restoreVersion(commit){
    if(!guard()||!ready)return;
    busy=true;lock(true);status('Loading the selected version…');let restored=false;
    try{
      await repository();
      const latestFile=await request(filePath());
      if(latestFile.sha!==config.sha)throw new Error('Different remote version. Load the latest version before restoring.');
      const remote=await request(filePath(commit));const data=JSON.parse(decode(remote.content));validate(data);
      if(!window.confirm('Restore version '+commit.slice(0,7)+' and save it as a new version on GitHub? A local copy will be downloaded first.')){status('Restore canceled');return}
      api.localBackup();apply(data);restored=true;
    }catch(error){status('Failed to restore: '+error.message)}
    finally{busy=false;lock(false)}
    if(restored)await backup(commit);
  }
  function settings(){
    if(busy){status('Please wait for the current operation');return}
    closePopups();closeEditor();
    const overlay=document.createElement('div');overlay.className='popup-overlay';
    const modal=document.createElement('div');modal.className='modal';modal.style.width='min(440px,95vw)';
    modal.innerHTML=`<h3>Save schedules to GitHub</h3>
      <p>Create a <strong>private</strong> repository without Pages and initialize it with a README. Create a fine-grained token limited to this repository with Contents: Read and write.</p>
      <p>The 💾 Save button saves all schedules to GitHub. When you open the connected app, it loads the latest version. Use History to restore earlier saves.</p>
      <label>Repository (owner/name)<input id="gbRepo" placeholder="brunopentium/gantt-backups" autocomplete="off"></label>
      <label>GitHub token<input id="gbToken" type="password" autocomplete="off"></label>
      <label style="display:block;margin-bottom:8px"><input id="gbRemember" type="checkbox" style="width:auto;margin:0"> Remember token in this personal browser</label>
      <p>Without this option, the token lasts only in this tab. If remembered, it stays in browser storage. Never use this option on a shared computer.</p>
      <div class="modal-actions" style="flex-wrap:wrap"><button id="gbClose">Close</button><button id="gbDisconnect">Disconnect</button><button class="act" id="gbConnect">Connect / load latest version</button></div>`;
    document.body.append(overlay,modal);
    const field=id=>modal.querySelector('#'+id);
    field('gbRepo').value=config.repo||'';field('gbToken').value=token;
    field('gbRemember').checked=!!localStorage.getItem(TOKEN_KEY);
    function configure(){
      const repo=field('gbRepo').value.trim(), nextToken=field('gbToken').value.trim();
      if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo)||!nextToken){status('Enter owner/repository and token');return false}
      if(config.repo!==repo)config={repo};
      config.enabled=true;token=nextToken;ready=false;persist();
      localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);
      (field('gbRemember').checked?localStorage:sessionStorage).setItem(TOKEN_KEY,JSON.stringify(token));
      closePopups();return true;
    }
    field('gbConnect').onclick=()=>{if(configure())latest(true)};
    field('gbClose').onclick=closePopups;overlay.onclick=closePopups;
    field('gbDisconnect').onclick=()=>{ready=false;config.enabled=false;persist();token='';localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);closePopups();status('Backup disconnected')};
  }
  function init(adapter){
    api=adapter;config=read(localStorage,KEY,{});token=read(localStorage,TOKEN_KEY,'')||read(sessionStorage,TOKEN_KEY,'');
    if(config.fingerprint&&window.ActionPlans){
      try{const previous=JSON.parse(config.fingerprint);if(Object.hasOwn(previous,'actionPlans')){delete previous.actionPlans;config.fingerprint=JSON.stringify(previous);persist()}}catch{}
    }
    lastContent=config.fingerprint||'';covered=config.coveredFingerprint||'';
    document.getElementById('btnCloudBackup').onclick=settings;
    document.getElementById('btnCloudSave').onclick=()=>backup();
    document.getElementById('btnCloudHistory').onclick=history;
    status(config.enabled?(token?'Loading GitHub…':'Enter the token to load the latest version'):'GitHub disconnected');
    const started=credentials()?latest():Promise.resolve();
    window.addEventListener('beforeunload',event=>{if(credentials()&&content()!==lastContent&&content()!==covered){event.preventDefault();event.returnValue=''}});
    return started;
  }
  function planEditStart(){syncConnection();const c=content();return c===lastContent||c===covered||c===pendingCover}
  function planEditComplete(eligible){if(eligible)pendingCover=content()}
  function acknowledgePlans(){if(pendingCover&&pendingCover===content()){covered=pendingCover;config.coveredFingerprint=covered;pendingCover='';persist();changed()}}
  return {init,changed,planEditStart,planEditComplete,acknowledgePlans,remoteTime:()=>read(localStorage,KEY,{}).remoteTime};
})();
