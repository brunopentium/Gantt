const {chromium}=require('playwright');const assert=require('node:assert/strict');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
(async()=>{const browser=await chromium.launch();try{for(const personal of [false,true]){
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(personal=>{if(personal&&!localStorage.getItem('notes-seeded')){localStorage.setItem('notes-seeded','1');localStorage.setItem('pf_workspace_active_v1','personal');localStorage.setItem('pf_personal_session_v1','a'.repeat(64));localStorage.setItem('pf_notes_v1',JSON.stringify({version:1,type:'notes',nodes:[{id:'work',kind:'notebook',title:'Work preserved',parentId:null}]}))}},personal);
 await page.route('https://projectflow-integration.brunocesardesouza26.workers.dev/**',r=>r.fulfill({json:{enabled:false,workspaces:['work','personal'],models:[],clientId:''}}));
 await page.goto(url);await page.locator('#tabNotes').click();
 const create=async(kind,title)=>{await page.locator(`[data-new="${kind}"]`).first().click();await page.locator('.notes-dialog input[name="title"]').fill(title);await page.locator('.notes-dialog button[type="submit"]').click()};
 await create('folder','Engenharia');await create('notebook','Estudos');await create('page','Validação');
 await page.getByRole('button',{name:'Texto',exact:true}).click();
 await page.getByRole('textbox',{name:'Texto da anotação'}).fill('Teste pesquisável de engenharia.\nPróximo passo: validar desenho.');
 await page.getByLabel('Fundo da página').selectOption('grid');
 assert.equal(await page.locator('.notes-paper').getAttribute('data-background'),'grid');
 await page.getByLabel('Tamanho do texto').selectOption('24');await page.getByRole('button',{name:'Negrito',exact:true}).click();
 assert.equal(await page.evaluate(()=>NotesData.snapshot().nodes.find(n=>n.kind==='page').objects[0].bold),true);
 // Drawing must remain a real editable object.
 await page.getByRole('button',{name:'Seta',exact:true}).click();let box=await page.locator('.notes-paper').boundingBox();await page.mouse.move(box.x+400,box.y+220);await page.mouse.down();await page.mouse.move(box.x+600,box.y+330,{steps:5});await page.mouse.up();
 assert.equal(await page.evaluate(()=>NotesData.snapshot().nodes.find(n=>n.kind==='page').objects.filter(o=>o.type==='arrow').length),1);
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();assert.equal(await page.evaluate(()=>NotesData.snapshot().nodes.find(n=>n.kind==='page').objects.length),1);await page.getByRole('button',{name:'Refazer',exact:true}).click();
 await page.getByRole('button',{name:'Selecionar',exact:true}).click();
 // Paste a real raster image through the UI clipboard event.
 await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=300;canvas.height=160;const c=canvas.getContext('2d');c.fillStyle='#bce5df';c.fillRect(0,0,300,160);c.fillStyle='#163b40';c.font='24px sans-serif';c.fillText('Imagem de estudo',20,80);const blob=await new Promise(r=>canvas.toBlob(r));const transfer=new DataTransfer();transfer.items.add(new File([blob],'estudo.png',{type:'image/png'}));document.getElementById('notesPanel').dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true}))});
 await page.waitForFunction(()=>NotesData.snapshot().nodes.find(n=>n.kind==='page').objects.some(o=>o.type==='image'));
 await page.locator('#notesEditObject').click();await page.locator('.notes-dialog [name="caption"]').fill('Foto da inspeção');await page.locator('.notes-dialog [name="ocr"]').fill('Código da peça ABC-123');await page.locator('.notes-dialog button[type="submit"]').click();
 await page.locator('#notesAssistant').click();assert((await page.locator('#mdChatInput').inputValue()).includes('Resuma esta página'));assert(await page.locator('#mdChatNotesEnabled').isChecked());assert.equal(await page.locator('#mdChatNotesScope').inputValue(),await page.evaluate(()=>NotesData.snapshot().nodes.find(n=>n.kind==='page').id));await page.locator('#mdChatClose').click();
 const assetId=await page.evaluate(()=>NotesData.snapshot().nodes.find(n=>n.kind==='page').objects.find(o=>o.type==='image').assetId);
 assert(!JSON.stringify(await page.evaluate(()=>NotesData.snapshot())).includes('base64'));
 if(!await page.locator('#notesSearch').isVisible())await page.locator('#notesShowTree').click();
 await page.locator('#notesSearch').fill('ABC-123');await page.locator('#notesSearchButton').click();assert(await page.locator('.notes-results').getByText('Código da peça ABC-123').isVisible());await page.locator('[data-result]').click();
 // Portable backup includes image bytes and rejects corruption; legacy JSON keeps current Notes.
 const zip=await page.evaluate(async()=>{const backup=WorkspaceBackup.snapshot();const original=NotesArchive.download;let blob;NotesArchive.download=()=>{};const files=[['backup.json',new TextEncoder().encode(JSON.stringify(backup))]];for(const o of NotesData.imageRefs()){const a=await NotesData.resolveAsset(o);files.push(['assets/'+a.id+'.json',new TextEncoder().encode(JSON.stringify(a))])}blob=NotesArchive.zip(files);const parsed=await NotesArchive.readFile(new File([blob],'backup.zip'));const legacy=JSON.parse(JSON.stringify(backup));delete legacy.notes;await WorkspaceBackup.restore(legacy);return {nodes:parsed.data.notes.nodes.length,assets:parsed.assets.length,size:blob.size,bytes:[...new Uint8Array(await blob.arrayBuffer())],stillPresent:NotesData.snapshot().nodes.length}});
 assert.equal(zip.nodes,3);assert.equal(zip.assets,1);assert.equal(zip.stillPresent,3);
 const freshContext=await browser.newContext(),fresh=await freshContext.newPage();fresh.on('dialog',d=>d.accept());
 if(personal)await fresh.addInitScript(()=>{localStorage.setItem('pf_workspace_active_v1','personal');localStorage.setItem('pf_personal_session_v1','c'.repeat(64))});
 await fresh.goto(url);await fresh.locator('#tabNotes').click();await fresh.locator('#notesSaveMenu summary').click();
 const [chooser]=await Promise.all([fresh.waitForEvent('filechooser'),fresh.locator('#notesRestore').click()]);
 await chooser.setFiles({name:'portable.zip',mimeType:'application/zip',buffer:Buffer.from(zip.bytes)});
 await fresh.waitForFunction(()=>NotesData.snapshot().nodes.length===3&&document.querySelector('img[data-asset]')?.naturalWidth>0);
 assert.equal(await fresh.evaluate(()=>NotesData.imageRefs()[0].ocr),'Código da peça ABC-123');
 await fresh.evaluate(async bytes=>{bytes[60]^=1;let rejected=false;try{await NotesArchive.readFile(new File([new Uint8Array(bytes)],'corrupt.zip'))}catch{rejected=true}if(!rejected)throw Error('Corrupted archive accepted')},zip.bytes);
 await freshContext.close();

 const recovery=await page.evaluate(async()=>{const id=await LocalRecovery.capture({name:'Notas completas'});const data=await LocalRecovery.get(id);return data.notes.nodes.length});assert.equal(recovery,3);
 await page.reload();await page.locator('#tabNotes').click();assert.equal(await page.getByRole('textbox',{name:'Texto da anotação'}).innerText(),'Teste pesquisável de engenharia.\nPróximo passo: validar desenho.');
 assert.equal(await page.locator('img[data-asset]').getAttribute('data-asset'),assetId);await page.waitForFunction(()=>document.querySelector('img[data-asset]')?.naturalWidth>0);
 await page.setViewportSize({width:390,height:844});await page.locator('#notesHideTree').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.locator('#notesFocus').click();assert(await page.locator('#appTabs').isHidden());assert((await page.locator('.notes-viewport').boundingBox()).height>300);await page.locator('#notesFocus').click();assert(await page.locator('#appTabs').isVisible());
 if(personal)assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pf_notes_v1')).nodes[0].title),'Work preserved');
 assert.deepEqual(errors,[]);await context.close();
 }console.log('PASS: work/personal Notes tree, text, drawing/undo, pasted images, scoped text/transcript search, portable ZIP and backward-compatible restore, recovery, reload and phone focus.');}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
