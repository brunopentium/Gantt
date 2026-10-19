const {chromium}=require('playwright'),assert=require('node:assert/strict');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
(async()=>{const browser=await chromium.launch();try{
 for(const personal of [false,true]){
  const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage(),errors=[],writes=[];page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url())});
  await page.route('https://projectflow-integration.brunocesardesouza26.workers.dev/**',r=>r.fulfill({json:{enabled:false,models:[],workspaces:['work','personal']}}));
  await page.addInitScript(personal=>{if(window!==window.top)return;if(personal){localStorage.setItem('pf_workspace_active_v1','personal');localStorage.setItem('pf_personal_session_v1','a'.repeat(64))}const prefix=personal?'pf_personal__':'';if(!localStorage.getItem(prefix+'pf_notes_v1'))localStorage.setItem(prefix+'pf_notes_v1',JSON.stringify({version:1,type:'notes',nodes:[{id:'folder',kind:'folder',title:'Ensaios',parentId:null},{id:'book',kind:'notebook',title:'Caderno OCR',parentId:'folder'},{id:'page',kind:'page',title:'Inspeção',parentId:'book',background:'blank',objects:[]}]}))},personal);
  await page.goto(url);await page.locator('#tabNotes').click();await page.locator('#notesHideTree').click();
  await page.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=900;c.height=140;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='42px Arial';ctx.fillText('Inspeção do projeto ABC-123',20,80);
   const {record}=await NotesData.imageFile(new File([await new Promise(r=>c.toBlob(r))],'Ensaio.png',{type:'image/png'}));const data=NotesData.snapshot();data.nodes[2].objects.push({id:'image',type:'image',x:40,y:40,w:500,h:100,rotation:0,color:'#25364a',assetId:record.id,mime:record.mime,caption:'Ensaio.png',ocr:'Transcrição anterior'});NotesData.commit(data);
   window.ocrMode='success';window.NotesOCR.recognize=async(record,{signal,onProgress})=>{onProgress('Reconhecendo texto · 50%');if(window.ocrMode==='error')throw Error('Sem conexão');if(window.ocrMode==='empty')return {text:'',confidence:0};if(window.ocrMode==='pending')await new Promise((resolve,reject)=>{window.finishOCR=resolve;signal.addEventListener('abort',()=>{window.ocrCancelled=true;reject(new DOMException('Cancelado','AbortError'))},{once:true})});return {text:'Inspeção do projeto ABC-123\nReview sample tomorrow',confidence:94,languages:'por+eng',engine:'tesseract.js@6.0.1'}};
  });
  const saved=()=>page.evaluate(()=>NotesData.snapshot().nodes[2].objects[0]);
  const open=async()=>{await page.locator('.notes-image-open').dispatchEvent('pointerdown',{bubbles:true,pointerType:'mouse',clientX:100,clientY:100});await page.locator('#notesReadImage').click()};
  const start=async()=>{await page.locator('#notesOCRStart').click();await page.waitForFunction(()=>window.ocrMode==='pending'?typeof window.finishOCR==='function':!document.querySelector('.notes-dialog [type=submit]').disabled)},save=()=>page.locator('.notes-dialog [type=submit]').click(),cancel=()=>page.locator('.notes-dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  await open();await start();await page.waitForFunction(()=>document.querySelector('[name=ocr]').value.includes('ABC-123'));assert.equal((await saved()).ocr,'Transcrição anterior','Recognition must not save until review');await save();assert.equal((await saved()).ocrInfo.confidence,94);
  assert(!JSON.stringify(await saved()).includes('base64'));
  // Search respects hierarchy and passes the recognized text to the existing composer.
  await page.locator('#notesShowTree').click();await page.locator('#notesSearch').fill('inspecao do projeto');await page.locator('#notesSearchScope').selectOption('folder');assert(await page.locator('.notes-results [data-result=page]').isVisible());
  await page.evaluate(()=>{const open=MyDayChat.open;MyDayChat.open=()=>{open();document.getElementById('mdChatInput').disabled=false}});await page.locator('#notesAnalyzeResults').click();assert((await page.locator('#mdChatInput').inputValue()).includes('ABC-123'));await page.locator('#mdChatClose').click();await page.locator('[data-result=page]').click();
  // Cancel discards a draft; empty results and download errors preserve it.
  await open();await start();await page.locator('.notes-dialog [name=ocr]').fill('Rascunho descartado');await cancel();assert((await saved()).ocr.includes('ABC-123'));
  await open();await page.evaluate(()=>window.ocrMode='error');await start();assert((await page.locator('#notesOCRProgress').innerText()).includes('preservada'));assert((await page.locator('.notes-dialog [name=ocr]').inputValue()).includes('ABC-123'));
  await page.evaluate(()=>window.ocrMode='empty');await start();assert((await page.locator('#notesOCRProgress').innerText()).includes('Nenhum texto'));await cancel();
  // Cancelling in progress stops the work and allows a new attempt.
  await open();await page.evaluate(()=>window.ocrMode='pending');await start();assert(await page.locator('.notes-dialog [type=submit]').isDisabled());await cancel();await page.waitForFunction(()=>window.ocrCancelled);assert((await saved()).ocr.includes('ABC-123'));
  await open();await page.evaluate(()=>window.ocrMode='success');await start();await page.locator('.notes-dialog [name=ocr]').fill('Texto corrigido XYZ-987');await save();assert.equal((await saved()).ocr,'Texto corrigido XYZ-987');assert.equal((await saved()).ocrInfo,undefined);
  // A concurrent restore must never be overwritten by an old review draft.
  await open();await page.locator('.notes-dialog [name=ocr]').fill('Texto antigo do diálogo');await page.evaluate(()=>{const data=NotesData.snapshot();data.nodes[2].objects[0].ocr='Texto de outra alteração';NotesData.restoreData(data)});await save();assert((await page.locator('#notesFormError').innerText()).includes('mudou'));assert.equal((await saved()).ocr,'Texto de outra alteração');await cancel();
  const backup=await page.evaluate(()=>WorkspaceBackup.snapshot());assert.equal(backup.notes.nodes[2].objects[0].ocr,'Texto de outra alteração');await page.reload();await page.locator('#tabNotes').click();assert.equal((await saved()).ocr,'Texto de outra alteração');
  // Review is usable on narrow phones, with no horizontal toolbar or dialog overflow.
  for(const width of [320,390]){await page.setViewportSize({width,height:844});if(await page.locator('#notesHideTree').isVisible())await page.locator('#notesHideTree').click();await open();await page.locator('.notes-image-view img').waitFor({state:'visible'});assert(await page.locator('.notes-dialog [name=ocr]').isVisible());assert(await page.locator('.notes-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));if(process.env.OCR_SCREENSHOTS==='1'&&width===390)await page.screenshot({path:'/tmp/notes-ocr-phone-'+(personal?'personal':'work')+'.png'});await cancel();assert(await page.locator('.notes-page-bar').evaluate(e=>e.scrollWidth<=e.clientWidth+1))}
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[],'OCR review/search must not upload images or send AI/data writes');assert.equal(await page.evaluate(personal=>localStorage.getItem((personal?'':'pf_personal__')+'pf_notes_v1'),personal),null,personal?'personal data leaked into work':'work data leaked into personal');await context.close();
 }
 // Exercise the actual worker adapter (not the UI stub): failures, timeout, cancellation and retry.
 const page=await browser.newPage();await page.route('https://projectflow-integration.brunocesardesouza26.workers.dev/**',r=>r.fulfill({json:{enabled:false,models:[]}}));await page.goto(url);
 const adapter=await page.evaluate(async()=>{
  const RealWorker=window.Worker,realTimeout=window.setTimeout;let mode='success',terminated=0,progress=0;
  window.Worker=class{postMessage(m){if(mode==='hang')return;queueMicrotask(()=>{if(mode==='network'){this.onerror({preventDefault(){}});return}this.onmessage({data:{jobId:m.jobId,status:mode==='reject'?'reject':'resolve',data:m.action==='recognize'?{text:'Teste local',confidence:91}:null}})})}terminate(){terminated++}};
  const record={mime:'image/png',base64:'AQID'};
  try{
   const ok=await NotesOCR.recognize(record,{onProgress:()=>progress++});mode='reject';let rejected=false;try{await NotesOCR.recognize(record)}catch{rejected=true}
   mode='network';let network=false;try{await NotesOCR.recognize(record)}catch(e){network=e.message.includes('conexão')}
   mode='hang';const c=new AbortController(),pending=NotesOCR.recognize(record,{signal:c.signal});c.abort();let aborted=false;try{await pending}catch(e){aborted=e.name==='AbortError'}
   window.setTimeout=(fn,ms)=>realTimeout(fn,ms===180000?10:ms);let timeout=false;try{await NotesOCR.recognize(record)}catch(e){timeout=e.message.includes('demorou')}
   mode='success';const retried=await NotesOCR.recognize(record);return {ok:ok.text,retried:retried.text,rejected,network,aborted,timeout,terminated,progress};
  }finally{window.Worker=RealWorker;window.setTimeout=realTimeout}
 });assert.equal(adapter.ok,'Teste local');assert.equal(adapter.retried,'Teste local');for(const k of ['rejected','network','aborted','timeout'])assert(adapter[k],k);assert(adapter.terminated>=6);
 if(process.env.OCR_NETWORK==='1'){
  const real=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=1300;c.height=220;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='48px Arial';ctx.fillText('Inspeção do projeto ABC-123',35,80);ctx.fillText('Review sample tomorrow',35,160);return NotesOCR.recognize({mime:'image/png',base64:c.toDataURL().split(',')[1]})});assert(real.text.includes('ABC-123'));assert(real.text.includes('Review sample tomorrow'));console.log('Real OCR:',real.text.replace(/\n/g,' / '),'confidence',real.confidence);
 }
 await page.close();console.log('PASS: OCR review/save/cancel/error/retry, scoped search and assistant context, phone layout, backup/reload, workspace isolation and cancellable worker adapter.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
