const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(()=>{
  if(localStorage.getItem('pf_projects_v1'))return;
  const task=(id,name,start,end,extras={})=>({id,name,start,end,dur:5,unit:'bd',pred:'',pct:0,indent:0,collapsed:false,mile:false,color:'#4a9eff',...extras});
  localStorage.setItem('pf_projects_v1',JSON.stringify({version:1,activeProjectId:'p1',projects:[
   {id:'p1',title:'Cronograma A',tasks:[task('summary','Entrega','2026-10-05','2026-10-09'),task('child','Planejamento','2026-10-05','2026-10-09',{indent:1}),task('standalone','Preparação','2026-10-05','2026-10-09')]},
   {id:'p2',title:'Cronograma B',tasks:[task('other','Execução','2026-10-05','2026-10-09'),task('dependent','Validação','2026-10-12','2026-10-16',{pred:'1FS'}),task('mile','Aprovação','2026-10-05','2026-10-05',{dur:0,mile:true})]}
  ]}));
 });
 await page.goto('http://127.0.0.1:8765');await page.click('#tabGantt');
 await page.locator('.tr[data-id="child"] .tc').first().click();await page.click('#btnActionFromTask');
 await page.fill('#apNewTitle','Plano de entrega');await page.locator('.ap-modal button[type=submit]').click();
 assert(await page.locator('#actionPanel').isVisible());assert.equal(await page.locator('.ap-table tbody tr').count(),1);
 assert((await page.locator('.ap-table').innerText()).includes('Planejamento'));
 // Linked edits in the action plan change the original task and its summary.
 await page.locator('[data-edit]').first().click();await page.fill('#apOwner','Bruno');await page.fill('#apStart','2026-10-12');await page.fill('#apEnd','2026-10-16');await page.selectOption('#apStatus','doing');await page.locator('.ap-modal button[type=submit]').click();
 assert.equal(await page.evaluate(()=>fdi(T.find(t=>t.id==='child').start)),'2026-10-12');assert.equal(await page.evaluate(()=>fdi(T.find(t=>t.id==='summary').end)),'2026-10-16');
 // Independent actions do not create tasks; cards and table use the same data.
 await page.click('#apAddAction');await page.fill('#apActionTitle','Telefonar ao fornecedor <teste>');await page.fill('#apOwner','Maria');await page.fill('#apStart','2026-10-10');await page.fill('#apEnd','2026-10-11');await page.locator('.ap-modal button[type=submit]').click();
 assert.equal(await page.evaluate(()=>T.length),3);assert.equal(await page.locator('.ap-table tbody tr').count(),2);
 await page.click('#apCards');assert.equal(await page.locator('.ap-card').count(),2);assert((await page.locator('.ap-card').last().innerText()).includes('<teste>'));
 // Link another action to a task in a different, inactive schedule.
 await page.click('#apAddAction');await page.fill('#apActionTitle','Acompanhar execução');await page.selectOption('#apLinkProject','p2');await page.selectOption('#apLinkTask','other');await page.fill('#apEnd','2026-10-14');await page.locator('.ap-modal button[type=submit]').click();
 assert.equal(await page.evaluate(()=>activeProjectId),'p1');assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='p2').tasks[0].end),'2026-10-14');
 assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='p2').tasks[1].start),'2026-10-15');
 // Dependency-controlled start and summary dates cannot be overwritten from actions.
 await page.click('#apAddAction');await page.selectOption('#apLinkProject','p2');await page.selectOption('#apLinkTask','dependent');assert(await page.locator('#apStart').isDisabled());await page.locator('.ap-modal button[type=submit]').click();
 await page.click('#apAddAction');await page.selectOption('#apLinkProject','p1');await page.selectOption('#apLinkTask','summary');assert(await page.locator('#apStart').isDisabled());assert(await page.locator('#apEnd').isDisabled());await page.locator('.ap-modal button[type=submit]').click();
 // Milestone dates remain identical when moved from the action form.
 await page.click('#apAddAction');await page.selectOption('#apLinkProject','p2');await page.selectOption('#apLinkTask','mile');await page.fill('#apStart','2026-10-19');await page.locator('#apOwner').focus();await page.locator('.ap-modal button[type=submit]').click();
 assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='p2').tasks[2].end),'2026-10-19');
 // Invalid date ranges leave both the plan and the Gantt unchanged.
 await page.click('#apAddAction');await page.fill('#apActionTitle','Inválida');await page.fill('#apStart','2026-10-20');await page.fill('#apEnd','2026-10-10');await page.locator('.ap-modal button[type=submit]').click();assert((await page.locator('#apError').innerText()).includes('on or after the start date'));await page.click('#apCancel');
 assert.equal(await page.locator('.ap-card').count(),6);
 // Native Tab/Enter in the action view do not trigger the Gantt shortcuts.
 const count=await page.evaluate(()=>T.length);await page.click('#apAddAction');await page.fill('#apActionTitle','Ação por teclado');await page.locator('#apActionTitle').press('Tab');await page.locator('#apOwner').press('Enter');assert.equal(await page.evaluate(()=>T.length),count);
 // A Gantt date change immediately updates the linked action, including after reordering.
 await page.click('#tabGantt');await page.evaluate(()=>{const t=T.find(t=>t.id==='child');t.start=pd('2026-10-26');t.end=endD(t.start,t.dur,t.unit);recalc();render()});await page.evaluate(()=>{T=[T[2],T[0],T[1]];recalc();render()});await page.click('#tabActions');await page.click('#apTable');assert((await page.locator('.ap-table tbody tr').first().innerText()).includes('26/10/2026'));
 // Unlink freezes the current dates and allows independent scheduling.
 await page.locator('[data-edit]').first().click();await page.selectOption('#apLinkProject','');await page.fill('#apStart','2026-11-02');await page.fill('#apEnd','2026-11-03');await page.locator('.ap-modal button[type=submit]').click();assert.equal(await page.evaluate(()=>fdi(T.find(t=>t.id==='child').start)),'2026-10-26');
 // Missing tasks preserve the action and its last dates.
 await page.click('#tabGantt');await page.evaluate(()=>{projects.find(p=>p.id==='p2').tasks=projects.find(p=>p.id==='p2').tasks.filter(t=>t.id!=='mile');save();render()});await page.click('#tabActions');assert((await page.locator('.ap-table').innerText()).includes('Link unavailable'));assert((await page.locator('.ap-table').innerText()).includes('19/10/2026'));
 // Reload persists all plans and actions.
 const before=await page.evaluate(()=>ActionPlans.exportData());await page.reload();await page.click('#tabActions');assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()),before);
 // Create a second independent plan, rename it, delete one action without deleting a task.
 await page.click('#apNewPlan');await page.fill('#apPlanTitle','Plano independente');await page.locator('.ap-modal button[type=submit]').click();await page.click('#apAddAction');await page.fill('#apActionTitle','Nova ação');await page.locator('.ap-modal button[type=submit]').click();await page.locator('[data-delete]').click();assert.equal(await page.evaluate(()=>T.length),count);await page.click('#apDeletePlan');assert.equal(await page.evaluate(()=>ActionPlans.exportData().length),1);
 await page.setViewportSize({width:390,height:844});await page.click('#apCards');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:'/tmp/gantt-action-plans-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: linked/independent plans and actions, active/inactive two-way date updates, dependencies, summaries, milestones, cards/table, date validation, keyboard, unlink, missing tasks, local persistence, deletion isolation and mobile layout');
})().catch(e=>{console.error(e);process.exit(1)});
