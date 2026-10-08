const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),report=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://script.google.com/**',r=>r.abort());
  await page.addInitScript(()=>{if(window!==window.top)return;if(localStorage.getItem('pf_action_plan_hide_statuses')===null)localStorage.setItem('pf_action_plan_filter','hide_done_blocked')});
  await page.goto(process.env.GANTT_TEST_URL||'http://127.0.0.1:8765');
  await page.evaluate(()=>{
   const a=(id,title,status='pending')=>({id,title,status,owner:'Maria',notes:'',start:'2020-01-06',end:'2020-01-10'});
   ActionPlans.load([{id:'root',title:'Plano flag',actions:[a('p','PENDING ORIGINAL'),a('b','TO BLOCK'),a('c','TO CANCEL'),a('f','FORM CANCEL'),a('doing','OLD DOING','doing'),a('done','OLD DONE','done'),a('blocked','OLD BLOCKED','blocked'),a('cancelled','OLD CANCELLED','cancelled')]},{id:'child',parentId:'root',title:'Filho',actions:[a('p','CHILD SAME ID')]}]);save();render();GanttPrint.print=html=>window.printCapture=html;
  });await page.click('#tabActions');
  const rows=()=>page.locator('#apActionContent [data-action-id]');
  const row=(id,plan='root')=>page.locator(`[data-plan-id="${plan}"][data-action-id="${id}"]`);
  assert(await page.locator('#apHideStatuses').isChecked());assert.equal(await page.locator('#apStatusFilter').inputValue(),'all');assert.equal(await rows().count(),6);
  const add=async(title,status='pending')=>{await page.click('#apAddAction');assert.equal(await page.locator('#apStatus option').count(),5);await page.fill('#apActionTitle',title);await page.selectOption('#apStatus',status);await page.locator('.ap-modal button[type=submit]').click()};
  await add('NEW PENDING');assert.equal(await rows().count(),7);assert.equal(await rows().filter({hasText:'NEW PENDING'}).count(),1);
  await add('NEW DOING','doing');assert.equal(await rows().count(),8);
  await add('NEW CANCELLED','cancelled');assert.equal(await rows().count(),8);assert.equal(await rows().filter({hasText:'NEW CANCELLED'}).count(),0);
  await row('p').locator('[data-complete]').click();assert.equal(await rows().count(),8);assert.equal(await row('p','child').locator('[data-complete]').getAttribute('aria-pressed'),'false');
  const status=async(id,label)=>{await row(id).locator('[data-field="status"]').click();assert.equal(await page.locator('.ap-choice').count(),5);await page.getByRole('button',{name:label,exact:true}).click()};
  await status('b','Blocked');await status('c','Cancelled');assert.equal(await rows().count(),8);assert.equal(await row('c').locator('.ap-late').count(),0);
  await row('f').locator('[data-edit]').click();await page.selectOption('#apStatus','cancelled');await page.locator('.ap-modal button[type=submit]').click();assert.equal(await rows().count(),8);assert.equal(await row('f').locator('.ap-late').count(),0);
  await add('ANOTHER PENDING');assert.equal(await rows().count(),9);
  await page.click('#apCards');assert.equal(await rows().count(),9);await rows().filter({hasText:'NEW PENDING'}).locator('[data-complete]').click();assert.equal(await rows().count(),9);
  await page.selectOption('#apPlanSelect','child');assert.equal(await rows().count(),1);await page.selectOption('#apPlanSelect','root');assert.equal(await rows().count(),9);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.locator('.ap-filters').screenshot({path:'/tmp/action-status-flag-mobile.png'});await page.setViewportSize({width:1280,height:900});
  await page.click('#apPDF');await page.fill('#planPdfPages','1');await page.locator('.ap-modal button[type=submit]').click();await page.waitForFunction(()=>window.printCapture);
  const html=await page.evaluate(()=>printCapture);await report.setContent(html);
  assert.equal(await report.locator('.action-title').count(),9);assert.equal(await report.locator('.status.done').count(),2);assert.equal(await report.locator('.status.blocked').count(),1);assert.equal(await report.locator('.status.cancelled').count(),2);assert.equal(await report.locator('.status.doing').count(),2);
  for(const title of ['PENDING ORIGINAL','TO BLOCK','TO CANCEL','FORM CANCEL','NEW PENDING','ANOTHER PENDING'])assert(html.includes(title),title);
  for(const title of ['OLD DONE','OLD BLOCKED','OLD CANCELLED','NEW CANCELLED'])assert(!html.includes(title),title);
  assert(!html.includes('undefined'));fs.writeFileSync('/tmp/action-status-flag.pdf',await report.pdf({format:'A4',landscape:true,printBackground:true}));
  // Excel retains the full branch, with native cancellation labels, cached deadlines and dropdowns.
  let pending=page.waitForEvent('download');await page.click('#apExcel');await (await pending).saveAs('/tmp/action-cancelled.xlsx');
  await page.click('#apApplyFilter');assert.equal(await rows().count(),4);assert.equal(await page.locator('#apStatusFilter').inputValue(),'all');assert(await page.locator('#apHideStatuses').isChecked());
  await page.click('#apUndo');assert.equal(await rows().count(),5);assert.equal(await rows().filter({hasText:'NEW PENDING'}).count(),1);
  await page.reload();await page.click('#tabActions');assert(await page.locator('#apHideStatuses').isChecked());assert.equal(await rows().count(),5);assert.equal(await page.locator('.ap-badge.cancelled,.ap-badge.blocked,.ap-complete.is-done').count(),0);
  await add('AFTER RELOAD');assert.equal(await rows().count(),6);
  await page.selectOption('#apStatusFilter','cancelled');assert.equal(await rows().count(),0);assert((await page.locator('.ap-empty').textContent()).includes('uncheck'));
  await page.uncheck('#apHideStatuses');assert.equal(await rows().count(),4);assert.equal(await page.locator('.ap-late').count(),0);
  pending=page.waitForEvent('download');await page.click('#apBackup');await (await pending).saveAs('/tmp/action-cancelled-backup.json');
  const backup=JSON.parse(fs.readFileSync('/tmp/action-cancelled-backup.json','utf8'));assert.equal(backup.actionPlans.flatMap(p=>p.actions).filter(a=>a.status==='cancelled').length,4);
  const before=await page.evaluate(()=>JSON.stringify(T.map(taskOut)));
  await page.evaluate(data=>ActionPlans.importData(data),backup);assert.equal(await rows().count(),4);assert.equal(await page.evaluate(()=>JSON.stringify(T.map(taskOut))),before);
  assert.equal(await page.evaluate(()=>ActionPlans.exportData().flatMap(p=>p.actions).filter(a=>a.status==='cancelled').length),8);
  await page.reload();await page.click('#tabActions');assert(!(await page.locator('#apHideStatuses').isChecked()));assert.equal(await page.locator('#apStatusFilter').inputValue(),'cancelled');assert.equal(await rows().count(),4);
  assert.deepEqual(errors,[]);console.log('PASS: old preference migration; persistent flag; immediate pending/doing creation; deferred complete/block/cancel via checkbox, inline and form; subtree/duplicate-ID isolation, cards/mobile, PDF current rows, cancellation XLSX/JSON/import/persistence and explicit refresh');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
