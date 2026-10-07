const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),report=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://script.google.com/**',r=>r.abort());
  await page.goto(process.env.GANTT_TEST_URL||'http://127.0.0.1:8765');
  await page.evaluate(()=>{
   const action=(id,title,status)=>({id,title,status,owner:'Maria',notes:'',start:'2026-10-05',end:'2026-10-09'});
   ActionPlans.load([{id:'root',title:'Plano filtrado',document:{notes:'Contexto preservado'},actions:[action('same','PENDING ROOT','pending'),action('doing','DOING ROOT','doing'),action('done','DONE ROOT','done'),action('blocked','BLOCKED ROOT','blocked')]},{id:'child',parentId:'root',title:'Filho',actions:[action('same','DONE CHILD','done'),action('pending','PENDING CHILD','pending')]},{id:'outside',title:'Outro plano',actions:[action('same','OUTSIDE ACTION','pending')]}]);
   ActionPlans.refresh();GanttPrint.print=html=>window.printCapture=html;
  });await page.click('#tabActions');
  const rows=()=>page.locator('#apActionContent [data-action-id]');
  assert.equal(await rows().count(),6);assert.equal(await page.locator('#apStatusFilter option').count(),8);
  const printPlan=async()=>{await page.evaluate(()=>{window.printCapture=null});await page.click('#apPDF');await page.fill('#planPdfPages','1');await page.locator('.ap-modal button[type=submit]').click();await page.waitForFunction(()=>window.printCapture);return page.evaluate(()=>printCapture)};
  // Exclusion modes combine statuses, keeping newly completed/blocked actions until an explicit refresh.
  await page.selectOption('#apStatusFilter','hide_blocked');assert.equal(await rows().count(),5);assert(!(await rows().allTextContents()).join(' ').includes('BLOCKED ROOT'));
  await page.selectOption('#apStatusFilter','hide_done');assert.equal(await rows().count(),4);assert((await rows().allTextContents()).join(' ').includes('BLOCKED ROOT'));
  await page.locator('[data-plan-id="root"] [data-complete="doing"]').click();assert.equal(await rows().count(),4);
  await page.click('#apCards');assert.equal(await rows().count(),4);assert.equal(await page.locator('#apStatusFilter').inputValue(),'hide_done');
  let html=await printPlan();await report.setContent(html);assert.equal(await report.locator('.action-title').count(),4);assert.equal(await report.locator('.status.done').count(),1);assert(!html.includes('DONE ROOT')&&!html.includes('DONE CHILD'));assert(html.includes('Ocultar concluídas'));
  await page.click('#apApplyFilter');assert.equal(await rows().count(),3);await page.click('#apUndo');assert.equal(await rows().count(),4);await page.click('#apApplyFilter');assert.equal(await rows().count(),4);await page.click('#apTable');
  await page.selectOption('#apStatusFilter','all');await page.check('#apHideStatuses');assert.equal(await rows().count(),3);
  await page.locator('[data-plan-id="root"] [data-complete="same"]').click();
  await page.locator('[data-plan-id="child"] [data-field="status"]').click();await page.getByRole('button',{name:'Bloqueada',exact:true}).click();
  assert.equal(await rows().count(),3);await page.click('#tabGantt');await page.click('#tabActions');assert.equal(await rows().count(),3);assert.equal(await page.locator('#apStatusFilter').inputValue(),'all');
  html=await printPlan();await report.setContent(html);assert.equal(await report.locator('.action-title').count(),3);assert.equal(await report.locator('.status.done').count(),1);assert.equal(await report.locator('.status.blocked').count(),1);assert.equal(await report.locator('.status.doing').count(),1);
  assert(html.includes('PENDING ROOT')&&html.includes('PENDING CHILD')&&html.includes('DOING ROOT'));assert(!html.includes('DONE ROOT')&&!html.includes('DONE CHILD')&&!html.includes('BLOCKED ROOT'));assert(html.includes('Ocultar concluídas, bloqueadas e canceladas')&&!html.includes('undefined'));
  fs.writeFileSync('/tmp/action-filter-exclude-frozen.pdf',await report.pdf({format:'A4',landscape:true,printBackground:true}));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.locator('.ap-action-section').screenshot({path:'/tmp/action-exclude-filter-mobile.png'});await page.setViewportSize({width:1280,height:900});
  await page.click('#apApplyFilter');assert.equal(await rows().count(),1);assert((await rows().textContent()).includes('DOING ROOT'));
  await page.click('#apUndo');await page.click('#apUndo');assert.equal(await rows().count(),3);await page.uncheck('#apHideStatuses');assert.equal(await rows().count(),6);
  await page.selectOption('#apStatusFilter','pending');assert.equal(await rows().count(),2);
  await page.locator('[data-plan-id="root"] [data-complete="same"]').click();
  assert.equal(await rows().count(),2);assert.equal(await page.locator('[data-plan-id="root"] [data-complete="same"]').getAttribute('aria-pressed'),'true');
  await page.click('#apCards');assert.equal(await rows().count(),2);
  await page.locator('[data-plan-id="child"] [data-field="status"]').click();await page.getByRole('button',{name:'Em andamento',exact:true}).click();
  assert.equal(await rows().count(),2);await page.click('#apTable');assert.equal(await rows().count(),2);
  html=await printPlan();await report.setContent(html);
  assert.equal(await report.locator('.action-title').count(),2);assert.equal(await report.locator('.status.done').count(),1);assert.equal(await report.locator('.status.doing').count(),1);
  assert(html.includes('PENDING ROOT')&&html.includes('PENDING CHILD')&&html.includes('Contexto preservado'));assert(!html.includes('DONE ROOT')&&!html.includes('DONE CHILD')&&!html.includes('OUTSIDE ACTION'));
  fs.writeFileSync('/tmp/action-filter-frozen.pdf',await report.pdf({format:'A4',landscape:true,printBackground:true}));
  // Reapplying the same status removes edited actions; an empty selection prints an empty report.
  await page.click('#apApplyFilter');assert.equal(await rows().count(),0);assert((await page.locator('.ap-empty').textContent()).includes('Nenhuma ação corresponde'));
  html=await printPlan();await report.setContent(html);assert.equal(await report.locator('.action-title').count(),0);
  await page.selectOption('#apStatusFilter','done');assert.equal(await rows().count(),3);
  html=await printPlan();await report.setContent(html);assert.equal(await report.locator('.status.done').count(),3);assert(!html.includes('PENDING CHILD'));
  fs.writeFileSync('/tmp/action-filter-done.pdf',await report.pdf({format:'A4',landscape:true,printBackground:true}));
  await page.uncheck('#apIncludeChildren');assert.equal(await rows().count(),2);await page.check('#apIncludeChildren');assert.equal(await rows().count(),3);
  await page.locator('[data-plan-id="root"] [data-complete="same"]').click();assert.equal(await rows().count(),3);await page.click('#apUndo');assert.equal(await rows().count(),3);assert.equal(await page.locator('[data-plan-id="root"] [data-complete="same"]').getAttribute('aria-pressed'),'true');
  await page.selectOption('#apPlanSelect','child');assert.equal(await rows().count(),1);assert((await rows().textContent()).includes('DONE CHILD'));
  await page.selectOption('#apStatusFilter','doing');assert.equal(await rows().count(),1);await page.selectOption('#apStatusFilter','blocked');assert.equal(await rows().count(),0);
  await page.selectOption('#apPlanSelect','root');assert.equal(await rows().count(),1);assert((await rows().textContent()).includes('BLOCKED ROOT'));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.locator('.ap-action-section').screenshot({path:'/tmp/action-filter-mobile.png'});
  // Mixed group/schedule/internal-task folding, search and status share the same PDF row selection.
  await page.evaluate(()=>{
   const t=(id,name,indent=0,pct=0)=>taskOut(mkTask({id,name,indent,pct,dur:3,start:pd('2026-10-05')}));
   projects=[normalizeProject({id:'g',title:'Programa',kind:'group',tasks:[]}),normalizeProject({id:'nested',title:'Subgrupo',kind:'group',parentId:'g',tasks:[]}),normalizeProject({id:'a',title:'Cronograma Alpha',parentId:'nested',tasks:[t('summary','ALPHA SUMMARY'),t('nested','ALPHA NESTED',1),t('leaf','ALPHA LEAF',2),t('sibling','ALPHA SIBLING',1,100),t('standalone','ALPHA STANDALONE')]}),normalizeProject({id:'b',title:'Cronograma Beta',parentId:'g',tasks:[t('summary','BETA SUMMARY'),t('leaf','BETA LEAF',1,100)]})];loadProject('g',true);saveStore();
  });await page.click('#tabGantt');await page.setViewportSize({width:1280,height:900});
  const before=await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v));
  const fold=(p,t)=>page.locator(`button[data-sg-project="${p}"][data-sg-fold-task="${t}"]`);
  const printGroup=async file=>{
   const visible=await page.locator('#scheduleAggregate .sg-row').evaluateAll(rows=>rows.map(r=>r.dataset.sgTask?r.dataset.sgProject+':'+r.dataset.sgTask:'group:'+r.dataset.sgCollapse));
   await page.evaluate(()=>{window.printCapture=null});await page.click('#btnPDF');await page.fill('#pdfPages','1');await page.locator('.modal [data-a=ok]').click();
   const html=await page.evaluate(()=>printCapture);await report.setContent(html);
   assert.deepEqual(await report.locator('[data-print-task]').evaluateAll(rows=>rows.map(r=>r.dataset.printTask)),visible);
   if(file)fs.writeFileSync(file,await report.pdf({format:'A4',landscape:true,printBackground:true}));return html;
  };
  await fold('a','nested').click();await page.locator('.sg-name[data-sg-collapse="b"]').click();
  html=await printGroup('/tmp/group-filter-folded.pdf');assert(!html.includes('ALPHA LEAF')&&!html.includes('BETA LEAF'));assert(html.includes('ALPHA SIBLING')&&html.includes('ALPHA STANDALONE'));
  assert((await report.locator('[data-print-task="a:nested"]').textContent()).includes('▸'));assert((await report.locator('[data-print-task="group:b"]').textContent()).includes('▸'));
  // A collapsed summary retains its summary bar even without any visible child row.
  assert(await report.locator('[data-print-task="a:nested"] rect[fill="#687386"]').count()>0);
  await page.fill('#sgSearch','LEAF');html=await printGroup('/tmp/group-filter-search.pdf');assert(html.includes('ALPHA LEAF')&&!html.includes('ALPHA SIBLING')&&!html.includes('BETA LEAF'));
  await page.fill('#sgSearch','');await page.click('#sgExpandAll');await page.selectOption('#sgFilter','done');html=await printGroup('/tmp/group-filter-done.pdf');assert(html.includes('ALPHA SIBLING')&&html.includes('BETA LEAF'));assert(!html.includes('ALPHA STANDALONE'));
  await page.selectOption('#sgFilter','all');await page.click('#sgCollapseAll');html=await printGroup('/tmp/group-filter-collapsed.pdf');assert.equal(await report.locator('[data-print-task]').count(),1);assert(await report.locator('[data-print-task="group:g"] rect[fill="#687386"]').count()>0);
  await page.locator('.sg-name[data-sg-collapse="g"]').click();await printGroup();assert.equal(await report.locator('[data-print-task]').count(),3);
  await page.click('#sgExpandAll');await page.fill('#sgSearch','NO MATCH');await printGroup();assert.equal(await report.locator('[data-print-task]').count(),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)),before);
  await page.click('#tabActions');await page.selectOption('#apStatusFilter','all');await page.check('#apHideStatuses');
  await page.reload();await page.click('#tabActions');assert(await page.locator('#apHideStatuses').isChecked());assert.equal(await page.locator('#apStatusFilter').inputValue(),'all');
  assert.equal(await rows().count(),2);assert.equal(await page.locator('.ap-complete.is-done').count(),0);assert.equal(await page.locator('.ap-badge.blocked').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: status hiding flag, saved preference, retained visible status changes with live completion/status edits, filtered/empty PDFs, duplicate-ID and subtree isolation, cards/mobile; grouped PDF matches mixed task/project folds, search, status and empty views without changing sources');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
