const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('https://script.google.com/**',r=>r.abort());await page.goto('http://127.0.0.1:8765');
  await page.evaluate(()=>{
   const task=(id,name,start,dur,pct=0,indent=0,pred='')=>({id,name,start,end:start,dur,pct,indent,pred,unit:'bd',mile:false,collapsed:false,color:'#4a9eff'});
   projects=[
    normalizeProject({id:'grand',title:'Programa geral',kind:'group',tasks:[]}),
    normalizeProject({id:'parent',title:'Entrega A',parentId:'grand',kind:'group',tasks:[]}),
    normalizeProject({id:'one',title:'Cronograma A',parentId:'parent',tasks:[task('sum','Resumo A','2026-10-05',5,0),task('same','Preparação A','2026-10-05',2,50,1),task('finish','Entrega A final','2026-10-12',3,100,1)]}),
    normalizeProject({id:'two',title:'Cronograma B',parentId:'grand',tasks:[task('same','Preparação B','2026-11-02',5),task('finish','Validação B','2026-10-05',2,0,0,'1FS')]}),
    normalizeProject({id:'outside',title:'Outro programa',tasks:[task('same','Tarefa externa','2027-01-01',2)]})
   ];loadProject('grand',true);saveStore();
  });await page.click('#tabGantt');
  assert(await page.locator('#scheduleAggregate').isVisible());assert(await page.locator('#main').isHidden());assert(await page.locator('#btnAdd').isHidden());
  const initial=await page.evaluate(()=>({projects:JSON.parse(JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)),tasks:T.map(taskOut),active:activeProjectId}));
  const report=await page.evaluate(()=>{const s=ScheduleGroups.snapshot();return {summary:s.summary,sources:s.sources.map(p=>({id:p.id,tasks:p.tasks}))}});
  assert.equal(report.summary.tasks,4);assert.equal(report.summary.progress,33);assert.equal(report.summary.start,'2026-10-05');assert.equal(report.summary.end,'2026-11-10');
  assert.equal(report.sources.find(p=>p.id==='two').tasks[1].start,'2026-11-09');assert.equal(report.sources.find(p=>p.id==='two').tasks[1].pred,'1FS');assert(report.summary.critical>0);
  // Analysis must not copy tasks into groups or change original dependencies/dates/IDs.
  assert.deepEqual(await page.evaluate(()=>({projects:JSON.parse(JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)),tasks:T.map(taskOut),active:activeProjectId})),initial);
  await page.locator('.sg-tree-picker summary').click();await page.locator('.sg-tree-picker [data-sg-select="grand"]').hover();await page.locator('.sg-tree-picker [data-sg-select="parent"]').hover();await page.locator('.sg-tree-picker [data-sg-select="one"]').click();
  assert(await page.locator('#main').isVisible());assert.equal(await page.evaluate(()=>activeProjectId),'one');
  await page.selectOption('#selProject','parent');assert.equal(await page.evaluate(()=>ScheduleGroups.snapshot().summary.tasks),2);
  await page.selectOption('#selProject','grand');await page.selectOption('#sgFilter','done');assert.equal(await page.locator('#scheduleAggregate .sg-row[data-sg-task]').count(),1);
  await page.selectOption('#sgFilter','all');await page.fill('#sgSearch','Validação B');assert.equal(await page.locator('#scheduleAggregate .sg-row[data-sg-task]').count(),1);await page.fill('#sgSearch','');
  // Repeated IDs in other schedules cannot misroute a source task edit.
  await page.locator('button.sg-name[data-sg-project="two"][data-sg-task="same"]').click();assert.equal(await page.evaluate(()=>activeProjectId),'two');assert(await page.locator('#main').isVisible());assert(await page.locator('.tr[data-id="same"]').evaluate(e=>e.classList.contains('sel')));
  await page.locator('.tr[data-id="same"] [data-field="dur"]').click();await page.locator('.cedit').fill('7');await page.locator('.cedit').press('Enter');
  assert.equal(await page.evaluate(()=>T.length),2);assert.equal(await page.evaluate(()=>fdi(T[1].start)),'2026-11-11');assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='one').tasks[1].dur),2);
  await page.selectOption('#selProject','grand');await page.check('#sgInclude');assert.equal(await page.evaluate(()=>ScheduleGroups.snapshot().summary.end),'2026-11-12');
  await page.click('#tabActions');assert(await page.locator('#scheduleHierarchyBar').isHidden());await page.click('#tabGantt');
  // Create a subgroup and a child schedule; move a pre-existing schedule into it.
  await page.click('#sgNewSubgroup');await page.fill('#sgTitle','Subgrupo <novo>');assert.equal(await page.locator('#sgParent').inputValue(),'grand');await page.locator('.sg-modal button[type=submit]').click();
  const groupId=await page.evaluate(()=>activeProjectId);assert.equal(await page.evaluate(id=>projects.find(p=>p.id===id).kind,groupId),'group');
  await page.click('#sgNewChild');await page.fill('#sgTitle','Cronograma filho');await page.locator('.sg-modal button[type=submit]').click();const childId=await page.evaluate(()=>activeProjectId);assert.equal(await page.evaluate(id=>projects.find(p=>p.id===id).parentId,childId),groupId);
  await page.selectOption('#selProject','outside');await page.click('#sgEdit');await page.selectOption('#sgParent',groupId);await page.locator('.sg-modal button[type=submit]').click();
  await page.selectOption('#selProject','grand');await page.click('#sgEdit');assert.equal(await page.locator('#sgParent option').count(),1);await page.click('#sgCancel');
  // Duplicate a whole branch with remapped parent IDs; deleting a group preserves its children.
  await page.selectOption('#selProject',groupId);await page.click('#btnDupProj');const copies=await page.evaluate(()=>projects.slice(-3));assert.equal(copies[0].parentId,'grand');assert.equal(copies[1].parentId,copies[0].id);assert.equal(copies[2].parentId,copies[0].id);
  await page.selectOption('#selProject',groupId);await page.click('#btnDelProj');await page.locator('.modal [data-a=ok]').click();assert.equal(await page.evaluate(id=>projects.find(p=>p.id===id).parentId,childId),'grand');assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='outside').parentId),'grand');
  // Whole-tree and subtree JSON preserve group metadata; a subtree root detaches from its ancestors.
  await page.evaluate(()=>{window.captured=null;window.downloadJSON=data=>window.captured=data});await page.click('#btnBackupAll');assert((await page.evaluate(()=>captured.projects)).some(p=>p.kind==='group'&&p.parentId==='grand'));
  // Adapter downloadJSON is captured at init; observe a real subtree download instead.
  await page.selectOption('#selProject','parent');const dlPromise=page.waitForEvent('download');await page.click('#btnExp');const download=await dlPromise;const subtree=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(subtree.projects.length,2);assert.equal(subtree.projects[0].parentId,undefined);assert.equal(subtree.projects[1].parentId,'parent');
  // Report-only task indices are remapped within each origin, without touching originals.
  await page.selectOption('#selProject','grand');await page.check('#sgInclude');const before=await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v));const tasks=await page.evaluate(()=>ScheduleGroups.reportTasks());
  const dependent=tasks.find(t=>t.name==='Validação B'),pred=Number(dependent.pred.match(/^\d+/)[0]);assert.equal(tasks[pred-1].name,'Preparação B');assert.equal(await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)),before);
  const exportPromise=page.waitForEvent('download');await page.click('#btnXLSX');const xlsx=await exportPromise;await xlsx.saveAs('/tmp/gantt-group-report.xlsx');assert((await fs.promises.stat('/tmp/gantt-group-report.xlsx')).size>1000);
  assert.equal(await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)),before);
  const html=await page.evaluate(()=>withScheduleReport(ScheduleGroups.reportTasks(),()=>buildPDFHTML(2)));assert(html.includes('Cronograma A')&&html.includes('Validação B'));assert.equal(await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)),before);
  // Source schedule can itself be a parent; turn aggregation off to edit only its own tasks.
  await page.selectOption('#selProject','one');await page.click('#sgNewChild');await page.fill('#sgTitle','Filho de cronograma');await page.locator('.sg-modal button[type=submit]').click();await page.selectOption('#selProject','one');assert(await page.locator('#scheduleAggregate').isVisible());await page.uncheck('#sgInclude');assert(await page.locator('#main').isVisible());assert.equal(await page.evaluate(()=>T.length),3);
  const saved=await page.evaluate(()=>JSON.parse(JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)));await page.reload();await page.click('#tabGantt');assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)).map(({updatedAt,...p})=>p)),saved.map(({updatedAt,...p})=>p));
  assert(await page.evaluate(()=>{const p=(id,parentId,kind='group',tasks=[])=>({id,parentId,kind,title:id,tasks});return [[p('a','b'),p('b','a')],[p('a','missing')],[p('a','a')],[p('a',null,'group',[{}])]].every(data=>{try{ScheduleGroups.validate(data);return false}catch{return true}})}));
  await page.selectOption('#selProject','grand');await page.check('#sgInclude');await page.screenshot({path:'/tmp/gantt-groups-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:'/tmp/gantt-groups-mobile.png',fullPage:true});
  const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await touch.route('https://script.google.com/**',r=>r.abort());await touch.goto('http://127.0.0.1:8765');await touch.evaluate(data=>{projects=data;loadProject('grand',true);saveStore()},saved);await touch.click('#tabGantt');await touch.locator('.sg-tree-picker summary').tap();await touch.locator('.sg-tree-picker [data-sg-select="grand"]').locator('..').locator('[data-sg-expand]').tap();assert(await touch.locator('.sg-tree-picker [data-sg-select="parent"]').isVisible());await touch.close();
  assert.deepEqual(errors,[]);console.log('PASS: schedule groups/descendants, aggregate metrics, local dependencies and critical paths, source navigation/editing, move/cycle checks, duplicate/delete promotion, hierarchy JSON/Excel/PDF, report isolation, persistence and mobile layout');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
