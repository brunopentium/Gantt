const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:8765');
 await page.evaluate(()=>{
  const action=(id,title,owner,status,end)=>({id,title,owner,status,start:'2026-09-28',end,notes:'',link:null});
  ActionPlans.load([{id:'p-doc',title:'Temperature chamber relocation option',description:'Relocação da câmara · alinhamento e próximas ações',actions:[action('a1','Transfer the book value to VAR','Pierre Emmanuel Trouvat','doing','2026-10-16'),action('a2',"Check the supplier’s offer to prepare the machine package and ship to VAR",'Pascal Petitjean','pending','2026-10-20'),action('a3','To inform the controlling contact from VAR','Bruno Cesar de Souza','done','2026-10-09'),action('a4','Send the energy specifications for the machine','Pierre Emmanuel Trouvat','blocked','2026-10-01')]},{id:'p-plain',title:'Plano direto nas ações',actions:[]}]);save();
 });await page.click('#tabActions');assert.equal(await page.locator('[data-document-section]').count(),0);assert.equal(await page.locator('.ap-hero h1').innerText(),'Temperature chamber relocation option');
 const add=async(key,value)=>{await page.click('#apAddSection');await page.click(`[data-add-section="${key}"]`);await page.fill('#apSectionValue',value);await page.locator('.ap-modal button[type=submit]').click()};
 await add('participants','Bruno Cesar de Souza\nPierre Emmanuel Trouvat\nPascal Petitjean\nBruno Cesar de Souza');assert.equal(await page.locator('.ap-participant-list .ap-person').count(),3);
 await add('agenda','Temperature chamber relocation option\nConfirmar responsabilidades e prazos');await add('notes','Confirmar transporte e disponibilidade de energia.\nDecisão: validar o escopo com o fornecedor.');
 assert.equal(await page.locator('[data-document-section]').count(),3);assert.equal(await page.locator('.ap-section-agenda li').count(),2);
 await page.locator('[data-section-edit="notes"]').click();await page.fill('#apSectionValue','Confirmar transporte e disponibilidade de energia.\nDecisão: validar o escopo com o fornecedor. <script>teste</script>');await page.locator('.ap-modal button[type=submit]').click();assert.equal(await page.locator('.ap-section-notes script').count(),0);
 // Separate document content per plan and owners remain based on the current plan's actions.
 await page.locator('[data-action="a1"][data-field="owner"]').click();assert.equal(await page.locator('.ap-choice').count(),4);await page.click('#apCancel');
 await page.selectOption('#apPlanSelect','p-plain');assert.equal(await page.locator('[data-document-section]').count(),0);await page.selectOption('#apPlanSelect','p-doc');
 await page.locator('[data-section-remove="agenda"]').click();assert.equal(await page.locator('.ap-section-agenda').count(),0);await page.click('#apUndo');assert.equal(await page.locator('.ap-section-agenda').count(),1);
 await page.locator('[data-complete="a2"]').click();assert((await page.locator('[data-action="a2"][data-field="status"]').innerText()).includes('Concluída'));await page.click('#apUndo');
 const before=await page.evaluate(()=>ActionPlans.exportData());await page.reload();await page.click('#tabActions');assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()),before);
 await page.setViewportSize({width:1440,height:1800});await page.screenshot({path:'/tmp/gantt-plan-document-desktop.png',fullPage:true});await page.setViewportSize({width:1440,height:1050});
 await page.click('#apCards');assert.equal(await page.locator('.ap-card').count(),4);await page.screenshot({path:'/tmp/gantt-plan-document-cards.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:'/tmp/gantt-plan-document-mobile.png',fullPage:true});await page.click('#apTable');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 await page.click('#apTheme');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');await page.screenshot({path:'/tmp/gantt-plan-document-dark.png',fullPage:true});
 await page.click('#apDuplicatePlan');assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData().at(-1).document),before[0].document);
 const exported=await page.evaluate(()=>ActionPlans.exportData());await page.evaluate(data=>ActionPlans.importData({actionPlans:[data[0]]}),exported);assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData().at(-1).document),before[0].document);
 assert(await page.evaluate(()=>{try{ActionPlans.validate([{id:'bad',title:'X',actions:[],document:{participants:'invalid'}}]);return false}catch(e){return true}}));assert.deepEqual(errors,[]);await browser.close();console.log('PASS: optional sections, plan isolation, edit/remove/undo, escaped text, completion toggle, persistence/import/duplication and responsive light/dark document layout');
})().catch(e=>{console.error(e);process.exit(1)});
