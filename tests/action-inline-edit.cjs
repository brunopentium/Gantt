const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765');
 await page.evaluate(()=>{
 const a=(id,owner,link=null)=>({id,title:id,owner,start:'2026-10-05',end:'2026-10-09',status:'pending',notes:'',link});
 ActionPlans.load([{id:'one',title:'Atual',actions:[a('first','Bruno'),a('second','Maria')]},{id:'two',title:'Outro',actions:[a('third','Exclusivo do outro plano')]}]);save();
 });await page.click('#tabActions');
 const field=name=>page.locator(`[data-action="first"][data-field="${name}"]`);
 await field('owner').click();assert.deepEqual(await page.locator('.ap-choice').allTextContents(),['Sem responsável','Bruno','Maria']);await page.getByRole('button',{name:'Maria',exact:true}).click();
 assert.equal(await field('owner').innerText(),'Maria');
 await field('owner').click();await page.fill('#apInlineOwner','Ana <nova>');await page.locator('.ap-modal button[type=submit]').click();assert.equal(await field('owner').innerText(),'Ana <nova>');
 await page.click('#apCards');await field('status').click();assert.equal(await page.locator('.ap-choice').count(),4);await page.getByRole('button',{name:'Concluída',exact:true}).click();assert((await field('status').innerText()).includes('Concluída'));
 await field('end').click();assert.equal(await page.locator('#apInlineEnd').getAttribute('type'),'date');await page.fill('#apInlineEnd','2026-10-03');await page.locator('#apInlineEnd').dispatchEvent('change');assert((await page.locator('#apError').innerText()).includes('posterior'));await page.locator('#apInlineEnd').evaluate(el=>{el.value='2026-10-20';el.dispatchEvent(new Event('change'))});assert.equal(await field('end').innerText(),'20/10/2026');
 await page.click('#apUndo');assert.equal(await field('end').innerText(),'09/10/2026');
 // Add an action linked to the existing Gantt task and verify source update + undo.
 await page.evaluate(()=>{const plans=ActionPlans.exportData();plans[0].actions[0].link={projectId:activeProjectId,taskId:T[1].id};ActionPlans.load(plans);save();render()});
 const before=await page.evaluate(()=>fdi(T[1].end));const start=await page.evaluate(()=>fdi(T[1].start));const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+21);const end=d.toISOString().slice(0,10);
 await field('end').click();await page.locator('#apInlineEnd').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change'))},end);assert.equal(await page.evaluate(()=>ActionPlans.exportData()[0].actions[0].end),await page.evaluate(()=>fdi(T[1].end)));assert.notEqual(await page.evaluate(()=>fdi(T[1].end)),before);
 await page.click('#apUndo');assert.equal(await page.evaluate(()=>fdi(T[1].end)),before);
 const saved=await page.evaluate(()=>ActionPlans.exportData());await page.reload();await page.click('#tabActions');assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()),saved);assert.deepEqual(errors,[]);await browser.close();console.log('PASS: inline table/cards, plan-scoped owners, new owner, statuses, date validation, linked date update/undo and persistence');
})().catch(e=>{console.error(e);process.exit(1)});
