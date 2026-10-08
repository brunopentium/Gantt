/* Private GitHub backups. Credentials never enter schedule exports or commits. */
window.GanttBackup = (() => {
  'use strict';
  const KEY='pf_github_backup_v1', TOKEN_KEY=KEY+'_token', PATH='backups/cronogramas.json';
  let api, config={}, token='', busy=false, ready=false, restoring=false, lastContent='',covered='',pendingCover='',boundConnection='',operationConnection='',blocked=false,errorMessage='',startup='';
  function read(store,key,fallback){try{return JSON.parse(store.getItem(key))||fallback}catch{return fallback}}
  function persist(){localStorage.setItem(KEY,JSON.stringify(config))}
  function emit(){window.dispatchEvent(new CustomEvent('projectflow:cloudstate',{detail:{source:'gantt'}}))}
  function status(message){document.getElementById('cloudBackupStatus').textContent=message;emit()}
  function canonical(snapshot){return JSON.stringify(snapshot,(k,v)=>k==='updatedAt'||k==='activeProjectId'?undefined:v)}
  function content(){return canonical(api.snapshot())}
  function signature(){const c=read(localStorage,KEY,{}),t=read(localStorage,TOKEN_KEY,'')||read(sessionStorage,TOKEN_KEY,'');return JSON.stringify([c.repo||'',t,!!c.enabled])}
  function syncConnection(){const stored=read(localStorage,KEY,{});if(stored.repo!==config.repo){config=stored;ready=false;lastContent=config.fingerprint||'';covered=config.coveredFingerprint||'';pendingCover=''}else config.enabled=stored.enabled;if(boundConnection&&boundConnection!==signature()){ready=false;blocked=false;errorMessage='';boundConnection=''}}
  function credentials(){syncConnection();token=read(localStorage,TOKEN_KEY,'')||read(sessionStorage,TOKEN_KEY,'');return config.repo&&token&&config.enabled}
  function changed(){
    if(!api||restoring)return;
    if(credentials()&&content()!==lastContent)status(content()===covered?'Linked dates saved in action plans':'Local changes pending');else emit();
  }
  function guard(silent=false){
    if(busy||window.PlanCloud?.state().busy||window.TodoCloud?.state().busy){status('Please wait for the current operation');return false}
    if(!credentials()){if(!silent)settings();return false}
    return true;
  }
  function lock(value){document.getElementById('app').inert=value}
  function failure(message){const error=new Error(message);error.cloudBlocked=true;return error}
  function failed(error){errorMessage=error.name==='AbortError'?'Connection timed out.':error.message;blocked=!!error.cloudBlocked||error.name==='SyntaxError';return {ok:false,pending:!blocked,blocked,error:errorMessage}}
  function state(){const connected=!!credentials(),fingerprint=api?content():'';return {connected,repo:config.repo||'',ready,busy,fingerprint,savedFingerprint:lastContent,dirty:!!api&&fingerprint!==lastContent&&fingerprint!==covered,blocked,error:errorMessage}}
  function begin(){operationConnection=signature();boundConnection=operationConnection;blocked=false;errorMessage='';busy=true}
  function finish(){operationConnection='';busy=false;emit()}
  async function capture(reason){if(!window.LocalRecovery)throw failure('Internal recovery is unavailable; local data was kept.');try{await window.LocalRecovery.capture({scope:'gantt',reason})}catch(error){throw failure('Internal recovery failed; local data was kept: '+error.message)}}
  async function request(path,options={}){
    if(operationConnection&&signature()!==operationConnection)throw failure('The connection changed; reconnect before saving.');
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch('https://api.github.com/repos/'+config.repo+path,{
        ...options,cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
          'X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})}
      });
      if(response.status===404&&options.allowMissing)return null;
      if(!response.ok){
        if(response.status===409||response.status===422)throw failure('Conflict: load the remote backup before saving.');
        if(response.status===401)throw failure('Invalid or expired token.');
        if(response.status===403)throw failure('Access denied or API limit reached. Check the token.');
        if(response.status===404)throw failure('Repository not found or token has no access.');
        throw new Error('GitHub returned HTTP '+response.status+'.');
      }
      const result=await response.json();if(operationConnection&&signature()!==operationConnection)throw failure('The connection changed; reconnect before saving.');return result;
    }finally{clearTimeout(timeout)}
  }
  async function repository(){
    const repo=await request('');
    if(!repo.private)throw failure('Use a private repository to protect your schedules.');
    if(repo.has_pages)throw failure('Use a repository without GitHub Pages to keep backups private.');
    if(!config.branch){config.branch=repo.default_branch;persist()}
    return repo;
  }
  function filePath(ref=config.branch){return '/contents/'+PATH+'?ref='+encodeURIComponent(ref)}
  function encode(text){return btoa(Array.from(new TextEncoder().encode(text),b=>String.fromCharCode(b)).join(''))}
  function decode(text){return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)))}
  async function backup(sourceCommit,silent=false){
    if(!guard(silent)||restoring)return {ok:false,pending:true};
    if(!ready){status('Connect and load the latest version before saving');return {ok:false,blocked:true}}
    begin();status('Saving to GitHub…');
    try{
      api.flush();await repository();if(!ready)throw failure('The connection changed; reconnect before saving.');
      const snapshot=api.snapshot(), fingerprint=canonical(snapshot),exportedAt=new Date().toISOString();
      const remote=await request(filePath(),{allowMissing:true});
      if((remote?.sha||null)!==(config.sha||null))
        throw failure('Different remote version. Load the latest version before saving; nothing was overwritten.');
      if(remote&&fingerprint===lastContent&&!sourceCommit){status('No changes to save');return {ok:true}}
      const result=await request('/contents/'+PATH,{method:'PUT',body:JSON.stringify({
        message:sourceCommit?'Restaurar cronogramas da versão '+sourceCommit.slice(0,7):'Salvar cronogramas',
        branch:config.branch,
        content:encode(JSON.stringify({...snapshot,exportedAt},null,2)),
        ...(remote?{sha:remote.sha}:{})
      })});
      config.sha=result.content.sha;config.lastSaved=new Date().toISOString();config.remoteTime=exportedAt;covered='';pendingCover='';delete config.coveredFingerprint;
      lastContent=fingerprint;config.fingerprint=lastContent;persist();
      status(content()===lastContent?'Saved to GitHub at '+new Date(config.lastSaved).toLocaleTimeString():'Version saved; new local changes pending');return {ok:true,pending:content()!==lastContent};
    }catch(error){const result=failed(error);status('Not saved to GitHub: '+errorMessage);return result}
    finally{finish()}
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
  function checked(data){try{validate(data)}catch(error){throw failure(error.message)}}
  function apply(data){
    const planTicket=window.PlanCloud?.scheduleLoadStart?.();restoring=true;
    try{api.restore(data);window.PlanCloud?.scheduleLoadComplete?.(planTicket)}finally{restoring=false}
  }
  async function latest(prompt=false,silent=!prompt){
    if(!guard(silent))return {ok:false,pending:true};
    begin();if(prompt)lock(true);status('Loading the latest version…');
    try{
      await repository();const remote=await request(filePath(),{allowMissing:true});
      if(!remote){
        if(config.sha)throw failure('The remote file was removed. Your local data was kept.');
        ready=true;boundConnection=signature();status('Repository connected — save to create the first version');return {ok:true};
      }
      const data=JSON.parse(decode(remote.content));checked(data);
      api.flush();const current=content(),dirty=!!config.fingerprint&&current!==config.fingerprint&&current!==covered||current!==startup;
      const legacyPlans=Array.isArray(data.actionPlans)&&!read(localStorage,'pf_github_action_plans_v1',{}).repo;
      if(!prompt&&remote.sha===config.sha&&config.fingerprint&&(!legacyPlans||dirty)){ready=true;boundConnection=signature();status(dirty?'Local data kept; changes pending':'Latest GitHub version loaded');return {ok:true,pending:dirty}}
      if(!prompt&&dirty)throw failure('Local data kept; a different remote version requires Connect / load latest version.');
      if(!prompt&&remote.sha!==config.sha&&window.PlanCloud?.state().linkedDirty)throw failure('Local linked action plans kept; connect manually to choose the schedule version.');
      if(prompt&&!window.confirm('Load the latest version saved on GitHub and replace local schedules? An internal recovery copy will be kept first.')){
        blocked=true;errorMessage='Local data kept; load the latest version to connect';status(errorMessage);return {ok:false,blocked:true};
      }
      await capture('Before loading schedules from GitHub');
      if(signature()!==operationConnection)throw failure('The connection changed; reconnect before loading.');
      if(!prompt&&content()!==current)throw failure('Local data kept; changes were made while connecting. Reconnect to choose a version.');
      apply(data);config.sha=remote.sha;config.remoteTime=data.exportedAt||null;covered='';pendingCover='';delete config.coveredFingerprint;lastContent=content();config.fingerprint=lastContent;persist();
      ready=true;boundConnection=signature();startup=lastContent;status('Latest GitHub version loaded');return {ok:true};
    }catch(error){const result=failed(error);status('Could not open GitHub; local data kept: '+errorMessage);return result}
    finally{finish();if(prompt)lock(false)}
  }
  async function history(){
    if(!guard())return;
    if(!ready){status('Connect and load the latest version before viewing history');return}
    begin();status('Loading history…');
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
      more.onclick=async()=>{if(!guard(true))return;begin();emit();try{await addPage()}finally{finish()}};
      modal.querySelector('#gbHistoryClose').onclick=closePopups;overlay.onclick=closePopups;
      await addPage();
    }catch(error){status('Failed to load history: '+error.message)}
    finally{finish()}
  }
  async function restoreVersion(commit){
    if(!guard()||!ready)return;
    begin();lock(true);status('Loading the selected version…');let restored=false;
    try{
      await repository();
      const latestFile=await request(filePath());
      if(latestFile.sha!==config.sha)throw failure('Different remote version. Load the latest version before restoring.');
      const remote=await request(filePath(commit));const data=JSON.parse(decode(remote.content));checked(data);
      if(!window.confirm('Restore version '+commit.slice(0,7)+' and save it as a new version on GitHub? An internal recovery copy will be kept first.')){status('Restore canceled');return}
      await capture('Before restoring schedule history');if(signature()!==operationConnection)throw failure('The connection changed; reconnect before restoring.');apply(data);restored=true;
    }catch(error){failed(error);status('Failed to restore: '+error.message)}
    finally{finish();lock(false)}
    if(restored)await backup(commit);
  }
  function settings(){
    if(busy){status('Please wait for the current operation');return}
    closePopups();closeEditor();
    const overlay=document.createElement('div');overlay.className='popup-overlay';
    const modal=document.createElement('div');modal.className='modal';modal.style.width='min(440px,95vw)';
    modal.innerHTML=`<h3>Save schedules to GitHub</h3>
      <p>Create a <strong>private</strong> repository without Pages and initialize it with a README. Create a fine-grained token limited to this repository with Contents: Read and write.</p>
      <p>Automatic saving uses this connection. The 💾 Save button saves immediately. Use History to restore earlier versions; recovery copies stay inside this browser.</p>
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
    for(const key of ['fingerprint','coveredFingerprint'])if(config[key])try{config[key]=canonical(JSON.parse(config[key]))}catch{}
    persist();lastContent=config.fingerprint||'';covered=config.coveredFingerprint||'';startup=content();
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
  function acknowledgePlans(expected){if(pendingCover&&(expected===undefined||expected===pendingCover)&&pendingCover===content()){covered=pendingCover;config.coveredFingerprint=covered;pendingCover='';persist();changed()}}
  return {init,changed,state,autoConnect:()=>state().ready?Promise.resolve({ok:true}):blocked?Promise.resolve({ok:false,blocked:true}):latest(false,true),autoSave:()=>blocked?Promise.resolve({ok:false,blocked:true}):backup(null,true),save:backup,planEditStart,planEditComplete,planSaveStart:()=>pendingCover,acknowledgePlans,remoteTime:()=>read(localStorage,KEY,{}).remoteTime};
})();
