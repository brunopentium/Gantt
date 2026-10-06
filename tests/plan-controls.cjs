const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const fixture={version:1,activeProjectId:'p1',projects:[{id:'p1',title:'Cronograma protegido',tasks:[{id:'t1',name:'Entrega vinculada',start:'2026-10-05',end:'2026-10-09',dur:5,unit:'bd',pred:'',pct:0,indent:0,mile:false,color:'#4a9eff'},{id:'t2',name:'Tarefa sem vínculo',start:'2026-10-05',end:'2026-10-09',dur:5,unit:'bd',pred:'',pct:0,indent:0,mile:false,color:'#40b080'}]}]};
 await page.addInitScript(fixture=>{if(!localStorage.getItem('pf_projects_v1'))localStorage.setItem('pf_projects_v1',JSON.stringify(fixture));if(!localStorage.getItem('pf_github_backup_v1')){localStorage.setItem('pf_github_backup_v1',JSON.stringify({repo:'brunopentium/gantt-backups',enabled:true}));localStorage.setItem('pf_github_backup_v1_token',JSON.stringify('test-token'))}},fixture);
 const ganttRemote={sha:'gantt1',content:Buffer.from(JSON.stringify({...fixture,exportedAt:'2026-01-01T00:00:00Z'})).toString('base64')};
 let confirmCount=0;page.on('dialog',d=>{if(d.type()==='confirm')confirmCount++});
 let legacyPlans=null;
 let remote=null,writes=0,ganttWrites=0,fail=false,commits=[];const versions=new Map();
 await page.route('https://api.github.com/repos/**',async route=>{
  const req=route.request(),url=new URL(req.url());assert.equal(req.headers().authorization,'Bearer test-token');
  if(fail)return route.fulfill({status:401,json:{}});
  if(url.pathname.endsWith('/commits')){if(url.searchParams.get('path')==='backups/cronogramas.json')return route.fulfill({json:[{sha:'legacy-plans',commit:{committer:{date:'2026-01-01T00:00:00Z'},message:'Salvar cronogramas e planos'}}]});assert.equal(url.searchParams.get('path'),'backups/planos-de-acao.json');return route.fulfill({json:commits})}
  if(url.pathname.includes('/contents/backups/cronogramas.json')){if(req.method()==='PUT')ganttWrites++;return route.fulfill({json:url.searchParams.get('ref')==='legacy-plans'?legacyPlans:ganttRemote})}
  if(!url.pathname.includes('/contents/'))return route.fulfill({json:{private:true,has_pages:false,default_branch:'main'}});
  assert(url.pathname.endsWith('/backups/planos-de-acao.json'));
  if(req.method()==='PUT'){
   const body=req.postDataJSON();assert.equal(body.sha,remote?.sha);const data=JSON.parse(Buffer.from(body.content,'base64').toString());assert.equal(data.type,'action-plans');assert.equal(data.projects,undefined);assert(!JSON.stringify(data).includes('test-token'));
   if(!legacyPlans)legacyPlans={sha:'old-combined',content:Buffer.from(JSON.stringify({...fixture,actionPlans:data.actionPlans})).toString('base64')};writes++;remote={sha:'blob'+writes,content:body.content};versions.set('version'+writes,{...remote});commits.unshift({sha:'version'+writes,commit:{committer:{date:new Date().toISOString()},message:body.message}});return route.fulfill({json:{content:{sha:remote.sha}}});
  }
  const ref=url.searchParams.get('ref'),file=ref==='main'?remote:versions.get(ref);return route.fulfill(file?{json:file}:{status:404,json:{}});
 });
 const wait=text=>page.waitForFunction(text=>document.querySelector('#apCloudStatus').textContent.includes(text),text);
 await page.goto('http://127.0.0.1:8765');await wait('primeira versão dos planos');await page.click('#tabActions');
 assert(await page.locator('#actionToolbar').isVisible());assert(await page.locator('#toolbar').isHidden());
 for(const id of ['apCloudSave','apCloudHistory','apCloudSettings','apBackup','apExport','apImport','apExcel','apPDF','apUndo','apTheme','apToggleNotes','apZoomIn','apZoomOut'])assert(await page.locator('#'+id).isVisible());
 await page.click('#apNewPlan');await page.fill('#apPlanTitle','Plano de entrega & qualidade');await page.fill('#apPlanDescription','Acompanhar as entregas e garantir a qualidade.');await page.locator('.ap-modal button[type=submit]').click();
 await page.click('#apAddAction');await page.fill('#apActionTitle','Ação independente');await page.fill('#apOwner','Maria');await page.fill('#apStart','2026-10-05');await page.fill('#apEnd','2026-10-09');await page.fill('#apNotes','Contato com o fornecedor.');await page.locator('.ap-modal button[type=submit]').click();
 await page.click('#apAddAction');await page.selectOption('#apLinkProject','p1');await page.selectOption('#apLinkTask','t1');await page.fill('#apOwner','Bruno');await page.locator('.ap-modal button[type=submit]').click();
 await page.click('#apCloudSave');await wait('Planos salvos');assert.equal(writes,1);assert.equal(ganttWrites,0);
 // Save a second independent version; linked date edits intentionally update that task only.
 await page.locator('[data-edit]').last().click();await page.fill('#apEnd','2026-10-14');await page.locator('.ap-modal button[type=submit]').click();await page.click('#apCloudSave');await wait('Planos salvos');assert.equal(writes,2);
 const cleanConfirms=confirmCount;await page.reload();await wait('Última versão dos planos aberta');assert.equal(confirmCount,cleanConfirms);await page.click('#tabActions');assert.equal(await page.evaluate(()=>fdi(T.find(t=>t.id==='t1').end)),'2026-10-14');
 await page.evaluate(()=>{T.find(t=>t.id==='t2').name='Nome preservado fora do plano';save();render()});
 await page.click('#apCloudHistory');await wait('Histórico dos planos carregado');assert.equal(await page.locator('#apVersions button').count(),2);await page.locator('#apVersions button').last().click();await wait('Planos salvos');assert.equal(writes,3);assert.equal(ganttWrites,0);
 assert.equal(await page.evaluate(()=>T.find(t=>t.id==='t1').end.toISOString().slice(0,10)),'2026-10-09');assert.equal(await page.evaluate(()=>T.find(t=>t.id==='t2').name),'Nome preservado fora do plano');assert.equal(await page.evaluate(()=>T.length),2);
 // Export, backup and import act on plans only and never replace the schedules.
 let pending=page.waitForEvent('download');await page.click('#apExport');let download=await pending;await download.saveAs('/tmp/action-plan-export.json');
 pending=page.waitForEvent('download');await page.click('#apBackup');download=await pending;await download.saveAs('/tmp/action-plan-backup.json');assert.equal(JSON.parse(fs.readFileSync('/tmp/action-plan-backup.json')).projects,undefined);assert(!fs.readFileSync('/tmp/action-plan-backup.json','utf8').includes('test-token'));
 const initialIds=await page.evaluate(()=>ActionPlans.exportData().map(p=>p.id));
 const chooser=page.waitForEvent('filechooser');await page.click('#apImport');await (await chooser).setFiles('/tmp/action-plan-export.json');await page.waitForFunction(()=>ActionPlans.exportData().length===2);assert.equal(await page.evaluate(()=>T.length),2);
 assert.notEqual(await page.evaluate(()=>ActionPlans.exportData()[1].id),initialIds[0]);await page.click('#apUndo');assert.equal(await page.evaluate(()=>ActionPlans.exportData().length),1);
 const intact=await page.evaluate(()=>ActionPlans.exportData());fs.writeFileSync('/tmp/invalid-plans.json',JSON.stringify({actionPlans:[{id:'bad',title:'Bad',actions:[{}]}]}));const badChooser=page.waitForEvent('filechooser');await page.click('#apImport');await (await badChooser).setFiles('/tmp/invalid-plans.json');await page.waitForFunction(()=>document.querySelector('#apNotice').textContent.includes('Falha na importação'));assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()),intact);
 await page.click('#apDuplicatePlan');assert.equal(await page.evaluate(()=>ActionPlans.exportData().length),2);await page.click('#apUndo');assert.equal(await page.evaluate(()=>ActionPlans.exportData().length),1);
 const saved=await page.evaluate(()=>ActionPlans.exportData());await page.locator('[data-edit]').last().click();await page.fill('#apEnd','2026-10-16');await page.locator('.ap-modal button[type=submit]').click();await page.click('#apUndo');assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()),saved);assert.equal(await page.evaluate(()=>fdi(T.find(t=>t.id==='t1').end)),'2026-10-09');
 const theme=await page.evaluate(()=>document.documentElement.dataset.theme);await page.click('#apTheme');assert.notEqual(await page.evaluate(()=>document.documentElement.dataset.theme),theme);await page.click('#apToggleNotes');assert(await page.locator('.ap-note').first().isHidden());await page.click('#apZoomIn');assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--ap-zoom')),'1.1');
 // The Excel uses the selected plan and no Gantt headers; the PDF is likewise plan-specific.
 pending=page.waitForEvent('download');await page.click('#apExcel');download=await pending;await download.saveAs('/tmp/action-plan-template.xlsx');
 const bytes=await page.evaluate(async()=>{const p=ActionPlans.exportData()[0];p.actions[0].title='=HYPERLINK("https://example.invalid","teste")';return Array.from(new Uint8Array(await PlanExports.build(p,link=>actionTask(link.projectId,link.taskId)).arrayBuffer()))});fs.writeFileSync('/tmp/action-plan-safe-text.xlsx',Buffer.from(bytes));
 const html=await page.evaluate(()=>PlanExports.pdfHTML(ActionPlans.exportData()[0],link=>actionTask(link.projectId,link.taskId)));assert(html.includes('Ação independente'));assert(!html.includes('WBS'));
 await page.click('#apPDF');await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentDocument?.title==='Plano de entrega & qualidade'));
 await page.reload();await wait('Última versão dos planos aberta');await page.click('#tabActions');assert.equal(await page.evaluate(()=>ActionPlans.exportData().length),1);assert.equal(writes,3);assert.equal(ganttWrites,0);
 // Importing schedules does not replace the independent plans.
 const beforeScheduleImport=await page.evaluate(()=>ActionPlans.exportData());await page.click('#tabGantt');await page.evaluate(()=>importProjectFile({version:1,projects:JSON.parse(JSON.stringify(projects)),activeProjectId,actionPlans:[]}));await page.locator('.modal [data-a=ok]').click();assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()),beforeScheduleImport);await page.click('#tabActions');
 // Conflicts and token failures do not overwrite the remote or lose local plans.
 remote.sha='another-device';await page.locator('[data-edit]').first().click();await page.fill('#apOwner','Nova responsável');await page.locator('.ap-modal button[type=submit]').click();await page.click('#apCloudSave');await wait('Versão remota diferente');assert.equal(writes,3);fail=true;await page.click('#apCloudSave');await wait('Token inválido');assert.equal(await page.evaluate(()=>ActionPlans.exportData()[0].actions[0].owner),'Nova responsável');
 // A newer Gantt save remains authoritative for linked dates on reopening.
 fail=false;const newest=JSON.parse(Buffer.from(ganttRemote.content,'base64').toString());newest.projects[0].tasks[0].dur=10;newest.projects[0].tasks[0].end='2026-10-16';newest.exportedAt=new Date(Date.now()+2000).toISOString();ganttRemote.content=Buffer.from(JSON.stringify(newest)).toString('base64');ganttRemote.sha='new-gantt-version';
 await page.reload();await wait('Última versão dos planos aberta');await page.click('#tabActions');assert.equal(await page.evaluate(()=>fdi(T.find(t=>t.id==='t1').end)),'2026-10-16');assert.equal(await page.evaluate(()=>ActionPlans.exportData()[0].actions[1].end),'2026-10-16');
 await page.click('#apCloudSettings');assert.equal(await page.inputValue('#apRepo'),'brunopentium/gantt-backups');assert.equal(await page.inputValue('#apToken'),'test-token');await page.click('#apCancelCloud');
 // Legacy combined history restores only the old plans into the new independent file.
 await page.click('#apCloudHistory');await wait('Histórico dos planos carregado');await page.click('#apOtherHistory');await wait('Histórico dos planos carregado');await page.locator('#apVersions button').click();await wait('Planos salvos');assert.equal(writes,4);assert.equal(ganttWrites,0);assert.equal(await page.evaluate(()=>T.length),2);
 await page.setViewportSize({width:390,height:844});await page.click('#apCards');await page.screenshot({path:'/tmp/action-plan-controls-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: standalone plan toolbar, scoped GitHub saves/history/restores, credential reuse, JSON import/export/backup, undo including linked dates, duplicate, theme/notes/zoom, Excel/PDF, startup, conflict/auth protections and mobile layout');
})().catch(e=>{console.error(e);process.exit(1)});
