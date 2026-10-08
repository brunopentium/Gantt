const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
const labels=['Pending','In progress','Completed','Blocked','Cancelled'];
const statuses=['pending','doing','done','blocked','cancelled'];

function entries(bytes){
  const data=Buffer.from(bytes),files={};let offset=0;
  while(offset+30<data.length&&data.readUInt32LE(offset)===0x04034b50){
    assert.equal(data.readUInt16LE(offset+8),0);
    const size=data.readUInt32LE(offset+18),names=data.readUInt16LE(offset+26),extra=data.readUInt16LE(offset+28);
    const name=data.toString('utf8',offset+30,offset+30+names),start=offset+30+names+extra;
    files[name]=data.toString('utf8',start,start+size);offset=start+size;
  }
  return files;
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),report=await browser.newPage(),errors=[];
    let legacyRequests=0;
    page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route('https://script.google.com/**',r=>{legacyRequests++;return r.abort()});
    await page.goto(url);
    const tabs=()=>page.locator('#appTabs [role=tab]:visible');
    assert.deepEqual(await tabs().allTextContents(),['☀ Meu dia','Task','Planos de ação','Cronogramas']);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.appView),'my-day');
    assert.equal(await page.locator('#tabMyDay').getAttribute('aria-selected'),'true');
    assert(await page.locator('#myDayPanel').isVisible());assert(await page.locator('#tabTodo').isHidden());
    assert.equal(await page.locator('#todoFrame').getAttribute('src'),null);
    assert.equal(await page.locator('#todoNativeFrame').getAttribute('src'),null);
    assert.equal(legacyRequests,0,'Opening the dashboard must not load Google Apps Script');

    // Preserve the legacy app and make hiding it reversible without loading it when merely revealed.
    const legacyUrl=await page.locator('#todoFrame').getAttribute('data-src');assert(legacyUrl.includes('script.google.com'));
    await page.click('#mdSettings');await page.check('#mdLegacyTodo');await page.click('#mdSettingsSave');
    assert(await page.locator('#tabTodo').isVisible());
    assert.equal(await page.locator('#todoFrame').getAttribute('src'),null);assert.equal(legacyRequests,0);
    await page.reload();assert(await page.locator('#tabTodo').isVisible(),'The recovery setting survives a reload');
    assert.equal(await page.locator('#tabMyDay').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#todoFrame').getAttribute('src'),null);assert.equal(legacyRequests,0);
    const requested=page.waitForRequest(r=>r.url().includes('script.google.com'));await page.click('#tabTodo');await requested;assert.equal(await page.locator('#todoFrame').getAttribute('src'),legacyUrl);
    await page.evaluate(()=>AppNavigation.setLegacyVisible(false));
    assert(await page.locator('#tabTodo').isHidden());assert(await page.locator('#myDayPanel').isVisible());
    await page.click('#mdSettings');assert(!(await page.locator('#mdLegacyTodo').isChecked()));await page.click('#mdSettingsSave');

    // Task keeps the original Portuguese interface despite its new tab name.
    await page.click('#tabTodoNative');const native=page.frameLocator('#todoNativeFrame');
    await native.getByRole('button',{name:'Nova Tarefa',exact:true}).waitFor();
    for(const label of ['Dashboard','Planejamento','Configurações'])assert(await native.getByRole('button',{name:label,exact:true}).isVisible());
    await page.click('#tabGantt');await page.reload();
    assert.equal(await page.locator('#tabMyDay').getAttribute('aria-selected'),'true','Reloading starts on Meu dia even after visiting another tab');
    assert.equal(await page.locator('#todoFrame').getAttribute('src'),null);assert.equal(legacyRequests,1);
    assert.deepEqual(await tabs().allTextContents(),['☀ Meu dia','Task','Planos de ação','Cronogramas']);

    const plan={id:'language-plan',title:'Plano de ação em português',description:'Descrição preservada, sem tradução.',document:{participants:['João Pereira'],agenda:'Pauta do usuário',notes:'Notas do usuário'},actions:statuses.map((status,i)=>({id:'a'+i,title:'Ação do usuário '+i,owner:'Bruno Souza',start:'2026-10-05',end:'2026-10-09',status,notes:'Observação em português',link:i===0?{projectId:'language-schedule',taskId:'leaf'}:null}))};
    await page.evaluate(p=>{
      projects=[normalizeProject({id:'language-group',kind:'group',title:'Grupo do usuário',tasks:[]}),normalizeProject({id:'language-schedule',parentId:'language-group',title:'Cronograma do usuário',tasks:[taskOut(mkTask({id:'summary',name:'Resumo do usuário',indent:0,dur:3,start:pd('2026-10-05'),collapsed:true})),taskOut(mkTask({id:'leaf',name:'Atividade do usuário',indent:1,dur:3,start:pd('2026-10-05')})),taskOut(mkTask({id:'other',name:'Entrega do usuário',indent:0,dur:2,start:pd('2026-10-12')}))]})];
      loadProject('language-schedule',true);ActionPlans.load([p]);saveStore();render();
    },plan);
    const snapshot=()=>page.evaluate(()=>JSON.stringify(WorkspaceBackup.snapshot(),(k,v)=>['exportedAt','updatedAt','activeProjectId'].includes(k)?undefined:v));
    const before=await snapshot();
    await page.click('#tabActions');
    assert.equal(await page.locator('.ap-head h2').textContent(),'Action plans');
    assert.equal(await page.locator('.ap-hero h1').textContent(),plan.title);
    assert.deepEqual(await page.locator('.ap-table th').allTextContents().then(a=>a.map(s=>s.trim())),['#','Action / link','Assigned to','Due date','Status','Options']);
    assert.deepEqual(await page.locator('.ap-badge').allTextContents().then(a=>a.map(s=>s.replace(/[✓⌄]/g,'').trim())),labels);
    for(const section of ['Participants','Agenda','Notes'])assert((await page.locator('[data-document-section] h2').allTextContents()).some(s=>s.includes(section)));
    assert((await page.locator('.ap-filters').textContent()).includes('Hide completed, blocked and cancelled'));
    assert((await page.locator('.ap-tools').textContent()).includes('5 of 5 actions · 1 completed'));
    await page.click('#apCards');assert.deepEqual(await page.locator('.ap-card .ap-meta-label').allTextContents(),statuses.flatMap(()=>['Owner','End']));
    await page.click('#apTable');

    const planReport=await page.evaluate(p=>PlanExports.pdfHTML(p,link=>actionTask(link.projectId,link.taskId)),plan);
    await report.setContent(planReport);assert.equal(await report.locator('html').getAttribute('lang'),'en');
    assert.deepEqual(await report.locator('th').allTextContents(),['#','Action / link','Owner','Start','End','Status / deadline','Notes']);
    assert.deepEqual(await report.locator('.status').allTextContents(),labels);
    for(const value of [plan.title,plan.description,'Pauta do usuário','Notas do usuário','João Pereira','Atividade do usuário'])assert((await report.locator('body').textContent()).includes(value));
    const packageData=entries(await page.evaluate(async p=>Array.from(new Uint8Array(await PlanExports.build(p,link=>actionTask(link.projectId,link.taskId)).arrayBuffer())),plan));
    for(const name of ['Summary','Actions','Context'])assert(packageData['xl/workbook.xml'].includes('name="'+name+'"'));
    const actionXML=packageData['xl/worksheets/sheet2.xml'];
    assert(actionXML.includes('"Pending,In progress,Completed,Blocked,Cancelled"'));
    for(const value of ['Duration (days)','Owner','Linked task','Notes','No due date','Due today','On track',...labels])assert(actionXML.includes(value));
    assert(actionXML.includes('Ação do usuário 0'));assert(packageData['xl/tables/table1.xml'].includes('name="ActionPlan"'));
    assert(packageData['xl/worksheets/sheet1.xml'].includes('COUNT(&apos;Actions&apos;!A7:A11)'));

    await page.click('#tabGantt');
    const ganttHeadings=await page.locator('#thead').textContent();
    for(const heading of ['Task','Unit','Start','End'])assert(ganttHeadings.includes(heading));
    const ganttReport=await page.evaluate(()=>buildPDFHTML({pages:2,orientation:'portrait'}));
    await report.setContent(ganttReport);assert.equal(await report.locator('html').getAttribute('lang'),'en');
    const printText=await report.locator('body').textContent();
    for(const value of ['Task','Dur.','Unit','Start','Finish','Pred.','2 tasks','Page 1 of 2','Current schedule view','Cronograma do usuário','Resumo do usuário','Entrega do usuário'])assert(printText.includes(value),value);
    assert.equal(await report.locator('[data-print-task="leaf"]').count(),0,'English PDF still respects the folded task');
    const ganttXlsx=entries(await page.evaluate(async()=>Array.from(new Uint8Array(await buildXLSXBlob().arrayBuffer()))));
    assert(ganttXlsx['xl/workbook.xml'].includes('name="Schedule"'));assert(ganttXlsx['xl/worksheets/sheet1.xml'].includes('Scale: weeks'));
    assert(ganttXlsx['xl/worksheets/sheet1.xml'].includes('Resumo do usuário'));
    await page.selectOption('#selProject','language-group');
    const groupText=await page.locator('#scheduleAggregate').textContent();
    for(const value of ['Schedules','Leaf tasks','Weighted progress','Overdue','Critical in source schedules','Overall date range','Schedule / task','Cronograma do usuário'])assert(groupText.includes(value),value);
    const grouped=await page.evaluate(()=>withScheduleReport(ScheduleGroups.pdfTasks(),()=>buildPDFHTML(1)));
    assert(grouped.includes('1 page wide'));assert(!grouped.includes('cronogramas ·'));
    assert.equal(await snapshot(),before,'Changing language and viewing reports must preserve user data and enum keys');
    assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()[0].actions.map(a=>a.status)),statuses);
    await page.setViewportSize({width:390,height:844});await page.click('#tabActions');await page.click('#apCards');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    assert(await page.getByRole('button',{name:'Refresh filter',exact:true}).isVisible());
    await page.screenshot({path:'/tmp/english-action-plan-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: four-tab order/default Meu dia and reload, hidden/reversible lazy legacy, unchanged Portuguese Task, English AP/Gantt table/cards/group/PDF/XLSX labels, folded PDF scope, user data and status schema preservation, mobile');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
