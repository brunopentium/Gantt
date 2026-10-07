const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let remote=null,puts=0,isPrivate=true,hasPages=false,fail=false,payload,commits=[];
 const versions=new Map(),answers=[];let dialogs=0;
 page.on('dialog',d=>{if(d.type()==='confirm')dialogs++;return answers.shift()===false?d.dismiss():d.accept()});
 await page.route('https://api.github.com/repos/**',async route=>{
  const req=route.request(),url=new URL(req.url());assert.equal(req.headers().authorization,'Bearer test-token');
  if(fail)return route.fulfill({status:401,json:{}});
  if(url.pathname.endsWith('/commits')){
   const start=(Number(url.searchParams.get('page'))-1)*30;
   return route.fulfill({json:commits.slice(start,start+30)});
  }
  if(!url.pathname.includes('/contents/'))return route.fulfill({json:{private:isPrivate,has_pages:hasPages,default_branch:'main'}});
  if(req.method()==='PUT'){
   payload=req.postDataJSON();assert.equal(payload.sha,remote?.sha);puts++;
   remote={sha:'blob'+puts,content:payload.content};versions.set('commit'+puts,{...remote});
   commits.unshift({sha:'commit'+puts,commit:{committer:{date:new Date().toISOString()},message:payload.message}});
   return route.fulfill({json:{content:{sha:remote.sha}}});
  }
  const ref=url.searchParams.get('ref');const file=ref==='main'?remote:versions.get(ref);
  return route.fulfill(file?{json:file}:{status:404,json:{}});
 });
 const waitStatus=text=>page.waitForFunction(text=>document.querySelector('#cloudBackupStatus').textContent.includes(text),text);
 async function configure(remember=false){
  await page.click('#btnCloudBackup');await page.fill('#gbRepo','brunopentium/gantt-backups');await page.fill('#gbToken','test-token');
  await page.locator('#gbRemember').setChecked(remember);await page.click('#gbConnect');
 }
 await page.goto('http://127.0.0.1:8765');await page.click('#tabGantt');assert.equal(await page.locator('.tr').count(),20);
 await configure();await waitStatus('primeira versão');assert.equal(puts,0);
 await page.evaluate(()=>{ActionPlans.load([{id:'plan1',title:'Plano de entrega',description:'',source:null,actions:[{id:'action1',title:'Verificar entregas',owner:'Bruno',start:'2026-10-05',end:'2026-10-09',status:'pending',notes:'',link:null}]}]);saveStore()});
 await page.clock.install();await page.clock.fastForward(120000);assert.equal(puts,0);
 await page.click('#btnCloudSave');await waitStatus('Salvo no GitHub');assert.equal(puts,1);
 assert.equal(payload.branch,'main');assert.equal(payload.message,'Salvar cronogramas');
 const exported=JSON.parse(Buffer.from(payload.content,'base64').toString());assert.equal(exported.projects[0].tasks.length,20);
 assert.equal(exported.actionPlans,undefined);assert(!JSON.stringify(exported).includes('test-token'));assert.equal(await page.evaluate(()=>localStorage.getItem('pf_github_backup_v1_token')),null);
 await page.click('#btnAdd');await page.clock.fastForward(120000);assert.equal(puts,1);await waitStatus('Alterações locais');
 await page.click('#btnCloudSave');await waitStatus('Salvo no GitHub');assert.equal(puts,2);assert.equal(payload.sha,'blob1');
 await page.evaluate(()=>{const plans=ActionPlans.exportData();plans[0].actions[0].title='Conferência revisada';ActionPlans.load(plans);T[0].name='Projeto café 🗓';recalc();render()});await page.click('#btnCloudSave');await waitStatus('Salvo no GitHub');assert.equal(puts,3);
 assert.equal(JSON.parse(Buffer.from(remote.content,'base64').toString()).projects[0].tasks[0].name,'Projeto café 🗓');
 await page.click('#btnCloudSave');await waitStatus('Nenhuma alteração');assert.equal(puts,3);
 await page.click('#btnCloudHistory');await waitStatus('Histórico carregado');assert.equal(await page.locator('#gbVersions button').count(),3);
 await page.locator('#gbVersions button').nth(2).click();await waitStatus('Salvo no GitHub');assert.equal(puts,4);assert.equal(await page.locator('.tr').count(),20);
 assert.equal(payload.message,'Restaurar cronogramas da versão commit1');assert.equal(payload.sha,'blob3');assert.equal(commits.length,4);assert.equal(await page.evaluate(()=>ActionPlans.exportData()[0].actions[0].title),'Conferência revisada');
 // Invalid historical data is rejected before local replacement or a remote write.
 versions.set('commit1',{sha:'bad',content:Buffer.from('{"version":1,"projects":[{"id":"x","title":"Bad","tasks":[{}]}]}').toString('base64')});
 await page.click('#btnCloudHistory');await waitStatus('Histórico carregado');await page.locator('#gbVersions button').last().click();await waitStatus('Falha ao restaurar');assert.equal(puts,4);assert.equal(await page.locator('.tr').count(),20);
 // A malformed action plan is also rejected without replacing current data.
 versions.set('commit1',{sha:'bad-plan',content:Buffer.from(JSON.stringify({...exported,actionPlans:[{id:'bad',title:'Bad',actions:[{}]}]})).toString('base64')});
 await page.click('#btnCloudHistory');await waitStatus('Histórico carregado');await page.locator('#gbVersions button').last().click();await waitStatus('Falha ao restaurar');assert.equal(puts,4);assert.equal(await page.evaluate(()=>ActionPlans.exportData()[0].id),'plan1');
 // Clean reopens load a newer remote version without a write.
 let newer=JSON.parse(Buffer.from(remote.content,'base64').toString());newer.projects[0].tasks[0].name='Versão de outro dispositivo';
 remote={sha:'other-device',content:Buffer.from(JSON.stringify(newer)).toString('base64')};
 await page.reload();await waitStatus('Última versão do GitHub aberta');await page.click('#tabGantt');assert.equal(await page.evaluate(()=>T[0].name),'Versão de outro dispositivo');assert.equal(puts,4);
 // Unsaved local edits survive reload if the user declines replacement.
 await page.click('#btnAdd');answers.push(true,false);await page.reload();await waitStatus('Dados locais mantidos');await page.click('#tabGantt');assert.equal(await page.locator('.tr').count(),21);
 await page.click('#btnCloudSave');await waitStatus('antes de salvar');assert.equal(puts,4);
 await configure(true);await waitStatus('Última versão do GitHub aberta');assert.equal(await page.locator('.tr').count(),20);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pf_github_backup_v1_token'))),'test-token');
 // A concurrent save is rejected, and expired credentials preserve local drafts.
 remote.sha='concurrent-device';await page.click('#btnAdd');await page.click('#btnCloudSave');await waitStatus('Versão remota diferente');assert.equal(puts,4);
 fail=true;await page.click('#btnCloudSave');await waitStatus('Token inválido');assert.equal(await page.locator('.tr').count(),21);assert.equal(puts,4);
 fail=false;isPrivate=false;await configure();await waitStatus('repositório privado');assert.equal(puts,4);
 isPrivate=true;hasPages=true;await configure();await waitStatus('sem GitHub Pages');assert.equal(puts,4);
 hasPages=false;await configure();await waitStatus('Última versão do GitHub aberta');
 // Pagination exposes older saves, rather than silently truncating history.
 const validCommit=commits[0];commits=Array.from({length:32},()=>validCommit);
 await page.click('#btnCloudHistory');await waitStatus('Histórico carregado');assert.equal(await page.locator('#gbVersions button').count(),30);
 await page.click('#gbMore');await page.waitForFunction(()=>document.querySelectorAll('#gbVersions button').length===32);assert(await page.locator('#gbMore').isHidden());
 await page.click('#gbHistoryClose');await page.click('#btnCloudBackup');await page.click('#gbDisconnect');
 assert.equal(await page.evaluate(()=>localStorage.getItem('pf_github_backup_v1_token')),null);assert.equal(await page.evaluate(()=>sessionStorage.getItem('pf_github_backup_v1_token')),null);
 // Existing installations migrate the fingerprint and open backups without action plans.
 const legacy={version:exported.version,activeProjectId:exported.activeProjectId,projects:exported.projects};
 remote={sha:'legacy',content:Buffer.from(JSON.stringify(legacy)).toString('base64')};
 await page.evaluate(legacy=>{localStorage.setItem('pf_projects_v1',JSON.stringify(legacy));localStorage.setItem('pf_github_backup_v1',JSON.stringify({repo:'brunopentium/gantt-backups',branch:'main',sha:'legacy',enabled:true,fingerprint:JSON.stringify(legacy,(k,v)=>k==='updatedAt'?undefined:v)}));sessionStorage.setItem('pf_github_backup_v1_token',JSON.stringify('test-token'))},legacy);
 const priorDialogs=dialogs;await page.reload();await waitStatus('Última versão do GitHub aberta');await page.click('#tabGantt');assert.equal(dialogs,priorDialogs);assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()),[]);assert.equal(puts,4);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: manual-only saves, Unicode, history and pagination, restore as new commit, invalid restore, latest-version startup, unsaved draft protection, concurrency, auth failures, private/no-Pages checks, token persistence and disconnect');
})().catch(e=>{console.error(e);process.exit(1)});
