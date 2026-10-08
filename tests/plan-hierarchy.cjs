const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://script.google.com/**',r=>r.abort());
  await page.goto('http://127.0.0.1:8765');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.appView),'todo');
  assert.deepEqual(await page.locator('#appTabs button').allTextContents(),['✅ Todo','✅ Todo novo','Planos de ação','Cronogramas']);
  await page.evaluate(()=>{
   const a=(title,status='pending')=>({id:'same-id',title,owner:'Bruno',start:'2026-10-05',end:'2026-10-30',status,notes:'',link:null});
   ActionPlans.load([
    {id:'grand',title:'Programa geral',actions:[a('Ação do avô')]},
    {id:'parent',parentId:'grand',title:'Entrega A',actions:[a('Ação do pai','done')]},
    {id:'child',parentId:'parent',title:'Execução <filho>',actions:[a('Ação do filho')]},
    {id:'sibling',parentId:'grand',title:'Entrega B',actions:[a('Ação do irmão')]},
    {id:'outside',title:'Outro programa',actions:[a('Ação externa')]}
   ]);save();
  });await page.click('#tabActions');
  const rows=()=>page.locator('.ap-table tbody tr');
  assert.equal(await rows().count(),4);assert((await page.locator('.ap-tools').innerText()).includes('4 ações · 1 concluídas'));
  // Hover reveals each next level, and a click selects exactly that branch.
  await page.locator('.ap-tree-picker summary').click();
  await page.locator('.ap-tree-menu [data-select-plan="grand"]').hover();
  assert(await page.locator('.ap-tree-menu [data-select-plan="parent"]').isVisible());
  await page.locator('.ap-tree-menu [data-select-plan="parent"]').hover();
  assert(await page.locator('.ap-tree-menu [data-select-plan="child"]').isVisible());
  await page.locator('.ap-tree-menu [data-select-plan="parent"]').click();assert.equal(await rows().count(),2);
  assert.equal(await page.locator('.ap-breadcrumbs button').count(),2);
  await page.selectOption('#apPlanSelect','child');assert.equal(await rows().count(),1);
  await page.locator('.ap-breadcrumbs [data-select-plan="grand"]').click();assert.equal(await rows().count(),4);
  await page.uncheck('#apIncludeChildren');assert.equal(await rows().count(),1);await page.check('#apIncludeChildren');
  // Repeated action IDs in separate plans must still edit the original owner correctly.
  await page.locator('[data-plan-id="child"] [data-complete]').click();
  assert.equal(await page.evaluate(()=>ActionPlans.exportData().find(p=>p.id==='child').actions[0].status),'done');
  assert.equal(await page.evaluate(()=>ActionPlans.exportData().find(p=>p.id==='grand').actions[0].status),'pending');
  await page.click('#apUndo');
  await page.locator('[data-plan-id="child"] [data-edit]').click();await page.fill('#apActionTitle','Filho editado');await page.locator('.ap-modal button[type=submit]').click();
  assert.equal(await page.evaluate(()=>ActionPlans.exportData().find(p=>p.id==='child').actions[0].title),'Filho editado');
  await page.locator('[data-plan-id="child"] [data-copy]').click();assert.equal(await rows().count(),5);
  assert.equal(await page.evaluate(()=>ActionPlans.exportData().find(p=>p.id==='child').actions.length),2);
  await page.locator('[data-plan-id="child"] [data-delete]').last().click();assert.equal(await rows().count(),4);
  await page.click('#apCards');assert.equal(await page.locator('.ap-card').count(),4);
  await page.locator('[data-plan-id="child"] [data-field="owner"]').click();await page.fill('#apInlineOwner','Maria');await page.locator('.ap-modal button[type=submit]').click();
  assert.equal(await page.evaluate(()=>ActionPlans.exportData().find(p=>p.id==='child').actions[0].owner),'Maria');await page.click('#apTable');
  // Create a new child; reparenting excludes self and all descendants.
  await page.click('#apNewChild');assert.equal(await page.locator('#apPlanParent').inputValue(),'grand');await page.fill('#apPlanTitle','Novo ramo');await page.locator('.ap-modal button[type=submit]').click();
  const newId=await page.locator('#apPlanSelect').inputValue();assert.equal(await page.evaluate(id=>ActionPlans.exportData().find(p=>p.id===id).parentId,newId),'grand');
  await page.selectOption('#apPlanSelect','grand');await page.click('#apEditPlan');assert.equal(await page.locator('#apPlanParent option').count(),2);await page.click('#apCancel');
  await page.selectOption('#apPlanSelect','parent');await page.click('#apEditPlan');assert.equal(await page.locator('#apPlanParent option[value="child"]').count(),0);await page.selectOption('#apPlanParent','outside');await page.locator('.ap-modal button[type=submit]').click();
  assert.equal(await page.locator('.ap-breadcrumbs button').first().innerText(),'Outro programa');assert.equal(await rows().count(),2);await page.click('#apUndo');
  // Export a selected subtree, import it with remapped relationships, and duplicate it.
  await page.evaluate(()=>{window.captured=null;window.downloadJSON=data=>window.captured=data});await page.click('#apExport');
  const exported=await page.evaluate(()=>captured);assert.equal(exported.actionPlans.length,2);assert.equal(exported.actionPlans[0].parentId,undefined);
  const beforeCount=await page.evaluate(()=>ActionPlans.exportData().length);
  await page.evaluate(data=>ActionPlans.importData(data),exported);const imported=await page.evaluate(()=>ActionPlans.exportData().slice(-2));
  assert.equal(imported[1].parentId,imported[0].id);assert.notEqual(imported[1].id,'child');
  await page.selectOption('#apPlanSelect','parent');await page.click('#apDuplicatePlan');
  const duplicated=await page.evaluate(()=>ActionPlans.exportData().slice(-2));assert.equal(duplicated[0].parentId,'grand');assert.equal(duplicated[1].parentId,duplicated[0].id);
  assert.equal(await page.evaluate(()=>ActionPlans.exportData().length),beforeCount+4);
  // Excel/PDF report the selected subtree, preserving origin labels.
  await page.selectOption('#apPlanSelect','grand');await page.evaluate(()=>{PlanExports.excel=p=>window.report=p});await page.click('#apExcel');
  assert.equal(await page.evaluate(()=>report.actions.length),6);assert((await page.evaluate(()=>report.actions.map(a=>a.title).join('|'))).includes('[Programa geral / Entrega A / Execução <filho>] Filho editado'));
  // Deleting a parent promotes children rather than losing their actions; undo restores the tree.
  await page.selectOption('#apPlanSelect','parent');await page.click('#apDeletePlan');assert.equal(await page.evaluate(()=>ActionPlans.exportData().find(p=>p.id==='child').parentId),'grand');await page.click('#apUndo');
  const snapshot=await page.evaluate(()=>ActionPlans.exportData());await page.reload();await page.click('#tabActions');assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()),snapshot);
  // Cycle/orphan rejection and backward compatibility.
  assert(await page.evaluate(()=>{const p=(id,parentId)=>({id,parentId,title:id,actions:[]});return [[p('a','b'),p('b','a')],[p('a','missing')],[p('a','a')]].every(data=>{try{ActionPlans.validate(data);return false}catch{return true}})}));
  await page.evaluate(()=>ActionPlans.validate([{id:'legacy',title:'Antigo',actions:[]}]));
  await page.selectOption('#apPlanSelect','grand');await page.locator('.ap-tree-picker summary').click();await page.locator('.ap-tree-menu [data-select-plan="grand"]').hover();await page.locator('.ap-tree-menu [data-select-plan="parent"]').hover();await page.screenshot({path:'/tmp/gantt-hierarchy-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:'/tmp/gantt-hierarchy-mobile.png',fullPage:true});
  // On touch, the expansion button reveals children without relying on hover.
  const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await touch.route('https://script.google.com/**',r=>r.abort());await touch.goto('http://127.0.0.1:8765');await touch.evaluate(data=>{ActionPlans.load(data);save()},snapshot);await touch.click('#tabActions');await touch.locator('.ap-tree-picker summary').tap();await touch.locator('.ap-tree-menu [data-select-plan="grand"]').locator('..').locator('[data-expand-plan]').tap();assert(await touch.locator('.ap-tree-menu [data-select-plan="parent"]').isVisible());await touch.close();
  assert.deepEqual(errors,[]);console.log('PASS: hierarchy hover/touch, branch aggregation, ownership-safe edits, reparent/cycle prevention, create, undo, subtree copy/export/import, report scope, delete promotion, persistence and mobile layout');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
