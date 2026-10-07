const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');

// Inspect the native, uncompressed XLSX package without adding a ZIP dependency.
function entries(bytes){
 const data=Buffer.from(bytes),files={};let offset=0;
 while(data.readUInt32LE(offset)===0x04034b50){
  assert.equal(data.readUInt16LE(offset+8),0);
  const size=data.readUInt32LE(offset+18),nameLength=data.readUInt16LE(offset+26),extraLength=data.readUInt16LE(offset+28);
  const name=data.toString('utf8',offset+30,offset+30+nameLength),start=offset+30+nameLength+extraLength;
  files[name]=data.toString('utf8',start,start+size);offset=start+size;
 }
 return files;
}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8765');
  const plan={id:'plan',title:'Relocação da câmara',description:'Decisões e próximos passos.',actions:[
   {id:'a1',title:'Confirmar transferência',owner:'Pierre Emmanuel Trouvat',start:'2026-10-05',end:'2026-10-09',status:'pending',notes:'Verificar orçamento.'},
   {id:'a2',title:'Informar contato responsável',owner:'Bruno Cesar de Souza',start:'2026-10-05',end:'2026-10-07',status:'done',notes:''}
  ]};
  const cases=[
   ['plain',undefined],
   ['context',{participants:['Pierre Emmanuel Trouvat','Bruno Cesar de Souza'],agenda:'Transferência da câmara\nPrazos & responsáveis',notes:'Confirmar custos.\nRegistrar decisões.'}],
   ['blank',{participants:[' ',''],agenda:' \n',notes:' '}],
   ['safe',{participants:['<script>unsafe</script>'],agenda:'=HYPERLINK("https://example.invalid")',notes:'A & B <div>texto literal</div>'}],
   ['agenda-only',{agenda:'Próximos passos'}]
  ];
  for(const [name,document] of cases){
   const data={...plan,...(document?{document}:{})};
   const result=await page.evaluate(async p=>({bytes:Array.from(new Uint8Array(await PlanExports.build(p,()=>null).arrayBuffer())),html:PlanExports.pdfHTML(p,()=>null)}),data);
   const files=entries(result.bytes),hasContext=['context','safe','agenda-only'].includes(name);
   assert.equal(files['xl/workbook.xml'].includes('<sheet name="Contexto"'),hasContext);
   assert.equal(!!files['xl/worksheets/sheet3.xml'],hasContext);
   assert(files['xl/worksheets/sheet1.xml'].includes('COUNT(&apos;Ações&apos;!A7:A8)'));
   assert(files['xl/worksheets/sheet2.xml'].includes('topLeftCell="C7"'));
   assert(files['xl/worksheets/sheet2.xml'].includes('ISNUMBER(D7)'));
   assert(files['xl/tables/table1.xml'].includes('ref="A6:K8"'));
   const invalidXML=await page.evaluate(files=>Object.values(files).some(xml=>new DOMParser().parseFromString(xml,'application/xml').querySelector('parsererror')),files);
   assert.equal(invalidXML,false);
   await page.setContent(result.html);
   assert.equal(await page.locator('.action-plan tbody tr').count(),2);
   assert.equal(await page.locator('.document-section.agenda').count(),hasContext?1:0);
   assert.equal(await page.locator('.document-section.notes').count(),['context','safe'].includes(name)?1:0);
   assert.equal(await page.locator('.participants').count(),['context','safe'].includes(name)?1:0);
   assert.equal(await page.locator('.status.pending').textContent(),'Pendente');
   assert.equal(await page.locator('.status.done').textContent(),'Concluída');
   if(name==='safe'){
    assert.equal(await page.locator('script').count(),0);
    assert.equal(await page.locator('.participants .person > span:last-child').textContent(),'<script>unsafe</script>');
    assert(files['xl/worksheets/sheet3.xml'].includes('=HYPERLINK(&quot;https://example.invalid&quot;)'));
    assert(!files['xl/worksheets/sheet3.xml'].includes('<f>'));
   }
   if(name==='agenda-only')assert(!files['xl/worksheets/sheet3.xml'].includes('PARTICIPANTES')&&!files['xl/worksheets/sheet3.xml'].includes('NOTAS'));
   fs.writeFileSync('/tmp/action-plan-document-'+name+'.xlsx',Buffer.from(result.bytes));
   if(name==='context'){
    await page.setViewportSize({width:1300,height:900});await page.screenshot({path:'/tmp/action-plan-document-export.png',fullPage:true});
    await page.pdf({path:'/tmp/action-plan-document-export.pdf',printBackground:true});
   }
   // Restore the app so the next iteration calls the real export functions.
   await page.goto('http://127.0.0.1:8765');
  }
  console.log('PASS: document Excel/PDF exports, optional section omission, pastel statuses/people, XLSX XML/formulas/freeze/table and safe literal text.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
