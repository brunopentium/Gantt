const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://script.google.com/**',r=>r.abort());await page.goto(process.env.GANTT_TEST_URL||'http://127.0.0.1:8765');
  await page.evaluate(()=>{
   const task=(id,indent=0,collapsed=false)=>taskOut(mkTask({id,name:id,indent,collapsed,dur:3}));
   projects=[normalizeProject({id:'group',kind:'group',title:'Grupo',tasks:[]}),normalizeProject({id:'nested',kind:'group',title:'Subgrupo',parentId:'group',tasks:[]}),normalizeProject({id:'one',title:'Cronograma A',parentId:'nested',tasks:[task('summary'),task('nested-summary',1),task('leaf',2),task('sibling',1),task('standalone')]}),normalizeProject({id:'two',title:'Cronograma B',parentId:'group',tasks:[task('summary'),task('leaf',1)]}),normalizeProject({id:'outside',title:'Outro grupo',kind:'group',tasks:[]}),normalizeProject({id:'external',title:'Externo',parentId:'outside',tasks:[task('summary'),task('leaf',1)]})];loadProject('one',true);saveStore();
  });await page.click('#tabGantt');assert(await page.locator('#sgExpandAll').isVisible());assert(await page.locator('#sgCollapseAll').isVisible());
  const baseline=await page.evaluate(()=>JSON.stringify(T.map(taskOut),(k,v)=>k==='collapsed'?undefined:v));
  await page.click('#sgCollapseAll');assert.deepEqual(await page.evaluate(()=>visible().map(t=>t.id)),['summary','standalone']);assert.equal(await page.locator('#tbody .tr').count(),2);assert.equal(await page.evaluate(()=>document.activeElement.id),'sgCollapseAll');
  // Opening the root alone does not reopen a nested summary after collapse-all.
  await page.locator('.tr[data-id="summary"] [data-act=toggle]').click();assert.deepEqual(await page.evaluate(()=>visible().map(t=>t.id)),['summary','nested-summary','sibling','standalone']);
  await page.click('#sgExpandAll');assert.equal(await page.evaluate(()=>visible().length),5);assert.equal(await page.locator('#tbody .tr').count(),5);assert.equal(await page.evaluate(()=>document.activeElement.id),'sgExpandAll');assert.equal(await page.evaluate(()=>JSON.stringify(T.map(taskOut),(k,v)=>k==='collapsed'?undefined:v)),baseline);
  await page.click('#sgCollapseAll');await page.reload();await page.click('#tabGantt');assert.deepEqual(await page.evaluate(()=>visible().map(t=>t.id)),['summary','standalone']);await page.click('#sgExpandAll');
  // Group folding changes only the current branch's view, preserving metrics and source tasks.
  await page.selectOption('#selProject','outside');await page.click('#sgCollapseAll');await page.selectOption('#selProject','group');
  const tasks=await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)),metrics=await page.evaluate(()=>ScheduleGroups.snapshot().summary),rows=await page.locator('#scheduleAggregate .sg-row').count();assert(rows>5);
  await page.click('#sgCollapseAll');assert.equal(await page.locator('#scheduleAggregate .sg-row').count(),1);assert.equal(await page.locator('#scheduleAggregate .sg-row[data-sg-task]').count(),0);
  await page.locator('.sg-name[data-sg-collapse="group"]').click();assert.equal(await page.locator('#scheduleAggregate .sg-row').count(),3);assert.equal(await page.locator('#scheduleAggregate .sg-row[data-sg-task]').count(),0);
  await page.click('#sgExpandAll');assert.equal(await page.locator('#scheduleAggregate .sg-row').count(),rows);assert.deepEqual(await page.evaluate(()=>ScheduleGroups.snapshot().summary),metrics);assert.equal(await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)),tasks);
  await page.selectOption('#selProject','outside');assert.equal(await page.locator('#scheduleAggregate .sg-row').count(),1);await page.selectOption('#selProject','group');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert(await page.locator('#sgExpandAll').isVisible());assert(await page.locator('#sgCollapseAll').isVisible());await page.click('#sgCollapseAll');await page.click('#sgExpandAll');assert.equal(await page.locator('#scheduleAggregate .sg-row').count(),rows);
  await page.click('#tabActions');assert(await page.locator('#sgExpandAll').isHidden());await page.click('#tabTodo');assert(await page.locator('#sgCollapseAll').isHidden());assert.deepEqual(errors,[]);
  console.log('PASS: expand/collapse all nested individual tasks, aligned rows, persistence, scoped group folding, source/metric isolation, focus and mobile visibility');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
