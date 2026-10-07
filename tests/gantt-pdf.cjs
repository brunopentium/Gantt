const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://script.google.com/**',r=>r.abort());await page.goto(process.env.GANTT_TEST_URL||'http://127.0.0.1:8765');
  await page.evaluate(()=>{
   const tasks=Array.from({length:120},(_,i)=>taskOut(mkTask({id:'print-'+i,name:'TASK '+String(i+1).padStart(3,'0'),start:pd(i===119?'2030-12-03':'2026-10-05'),dur:i===119?0:5,pct:i%3===0?100:25,indent:i>0&&i<45?1:0,collapsed:i===0,mile:i===119,color:'#3689c4'})));
   projects=[normalizeProject({id:'print-source',title:'Gantt PDF test',tasks})];loadProject('print-source',true);saveStore();
  });await page.click('#tabGantt');assert((await page.evaluate(()=>visible().length))<120);
  // Modal options reach the printer and include collapsed rows, not only the current screen.
  await page.evaluate(()=>{window.originalPrint=GanttPrint.print;GanttPrint.print=html=>window.printCapture=html});
  await page.click('#btnPDF');assert.equal(await page.locator('#pdfPages').inputValue(),'4');await page.selectOption('#pdfOrientation','portrait');await page.fill('#pdfPages','3');await page.locator('.modal [data-a=ok]').click();
  let html=await page.evaluate(()=>printCapture);assert(html.includes('data-print-orientation="portrait"'));assert(html.includes('data-print-pages="3"'));assert.equal((html.match(/data-print-task=/g)||[]).length,120);assert(html.includes('@page{size:auto;'));assert(!html.includes('@page{size:A4 landscape'));assert(html.includes('05/10/26'));
  const report=await browser.newPage();
  for(const orientation of ['landscape','portrait'])for(const nativeLandscape of [true,false])for(const pages of [1,2,3]){
   html=await page.evaluate(options=>buildPDFHTML(options),{pages,orientation});await report.setContent(html);await report.emulateMedia({media:'print'});
   assert.equal(await report.locator('.sheet').count(),pages);assert.equal(await report.locator('[data-print-task]').count(),120);
   const geometry=await report.locator('.sheet').first().evaluate(sheet=>{const s=sheet.querySelector('svg').viewBox.baseVal;return {width:s.width,height:s.height}});assert.equal(geometry.width>geometry.height,orientation==='landscape');
   const pdf=await report.pdf({format:'A4',landscape:nativeLandscape,printBackground:true,preferCSSPageSize:false});
   assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,pages,`Native ${nativeLandscape?'landscape':'portrait'}, report ${orientation}, ${pages} pages`);
   fs.writeFileSync(`/tmp/gantt-pdf-${orientation}-${nativeLandscape?'landscape':'portrait'}-${pages}.pdf`,pdf);
  }
  // Empty schedules print once, and excessive page counts do not create blank sheets.
  await page.evaluate(()=>{T=[]});html=await page.evaluate(()=>buildPDFHTML({pages:3,orientation:'portrait'}));await report.setContent(html);assert.equal(await report.locator('.sheet').count(),1);assert(html.includes('Nenhuma tarefa'));
  // Consolidated groups share the same pagination path, preserving original schedules and local dependencies.
  await page.evaluate(()=>{
   const task=(id,name,pred='')=>taskOut(mkTask({id,name,pred,dur:3}));
   projects=[normalizeProject({id:'portfolio',title:'Programa consolidado',kind:'group',tasks:[]}),normalizeProject({id:'a',title:'Cronograma A',parentId:'portfolio',tasks:[task('repeat','Origin A first'),task('next','Origin A next','1FS')]}),normalizeProject({id:'b',title:'Cronograma B',parentId:'portfolio',tasks:[task('repeat','Origin B first'),task('next','Origin B next','1FS')]})];loadProject('portfolio',true);saveStore();
  });const before=await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v));
  await page.click('#btnPDF');await page.fill('#pdfPages','2');await page.selectOption('#pdfOrientation','landscape');await page.locator('.modal [data-a=ok]').click();html=await page.evaluate(()=>printCapture);assert(html.includes('Origin A first')&&html.includes('Origin B next'));await report.setContent(html);const pdf=await report.pdf({format:'A4',landscape:true,printBackground:true});assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,2);fs.writeFileSync('/tmp/gantt-pdf-consolidated.pdf',pdf);assert.equal(await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)),before);
  // Real print frame waits for layout and remains alive while the dialog is open.
  await page.evaluate(()=>{GanttPrint.print=originalPrint;GanttPrint.print(buildPDFHTML({pages:2,orientation:'portrait'}));document.querySelector('[data-gantt-print]').contentWindow.print=()=>window.framePrinted=true});await page.waitForFunction(()=>window.framePrinted);await page.waitForTimeout(2200);assert.equal(await page.locator('[data-gantt-print]').count(),1);await page.evaluate(()=>document.querySelector('[data-gantt-print]').contentWindow.dispatchEvent(new Event('afterprint')));await page.waitForFunction(()=>!document.querySelector('[data-gantt-print]'));
  assert.deepEqual(errors,[]);console.log('PASS: PDF 1/2/3 vertical pages, both native and report orientations, all collapsed/off-screen tasks, one page wide, consolidated source isolation and print-frame lifecycle');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
