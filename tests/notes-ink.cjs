const {chromium}=require('playwright'),assert=require('node:assert/strict');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
const tools=['pen','highlighter','line','arrow','rect','ellipse'];
const geometry=svg=>[...svg.querySelectorAll('path,rect,ellipse')].map(el=>{const matrix=el.getScreenCTM(),point=p=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f});if(el.tagName==='path'){const len=el.getTotalLength();return [0,.3,.6,1].map(t=>point(el.getPointAtLength(len*t)))}const b=el.getBBox();return [point({x:b.x,y:b.y}),point({x:b.x+b.width,y:b.y+b.height})]});
(async()=>{const browser=await chromium.launch();try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1400,height:1000},isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://projectflow-integration.brunocesardesouza26.workers.dev/**',r=>r.fulfill({json:{enabled:false,models:[],workspaces:['work','personal']}}));await page.goto(url);
 await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=250;canvas.height=180;const c=canvas.getContext('2d');c.fillStyle='#cfe9e5';c.fillRect(0,0,250,180);const blob=await new Promise(r=>canvas.toBlob(r)),{record}=await NotesData.imageFile(new File([blob],'Imagem de referência.png',{type:'image/png'}));NotesData.restoreData({version:1,type:'notes',nodes:[{id:'b',kind:'notebook',title:'Caderno',parentId:null},{id:'p',kind:'page',title:'Sobreposição',parentId:'b',background:'grid',objects:[{id:'t',type:'text',x:60,y:70,w:280,h:180,rotation:0,color:'#25364a',fontSize:24,bold:false,text:'Texto de referência\nDesenhar sobre este texto\nO traço deve permanecer aqui'},{id:'i',type:'image',x:400,y:70,w:250,h:180,rotation:0,color:'#25364a',assetId:record.id,mime:record.mime,caption:'Referência visual',ocr:''}]}]})});
 await page.locator('#tabNotes').click();await page.locator('#notesHideTree').click();if(mobile)await page.locator('#notesFocus').click();await page.waitForFunction(()=>document.querySelector('img[data-asset]')?.naturalWidth===250);
 const cdp=mobile?await context.newCDPSession(page):null;
 for(const zoom of mobile?[.5]:[.5,1,1.5]){
  await page.locator('#notesZoomReset').click();for(let n=0;n<Math.round(Math.abs(zoom-1)*10);n++)await page.locator(zoom<1?'#notesZoomOut':'#notesZoomIn').click();
  for(const type of tools)for(const onImage of [false,true]){
   await page.locator(`button[data-tool="${type}"]`).click();
   // Scroll within the sheet first, so coordinates cannot accidentally use screen origins.
   await page.locator('.notes-viewport').evaluate((el,mobile)=>{el.scrollLeft=mobile?25:40;el.scrollTop=30},mobile);
   const paper=await page.locator('.notes-paper').boundingBox(),x=paper.x+(onImage?450:100)*zoom,y=paper.y+130*zoom,ex=x+100*zoom,ey=y+(type==='highlighter'||type==='line'?0:55*zoom);
   if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:ex,y:ey}]})}
   else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(ex,ey,{steps:6})}
   const preview=await page.locator('.notes-preview > svg').evaluate(geometry);
   if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
   const final=await page.locator(`.notes-object.notes-${type}`).last().locator('svg').evaluate(geometry);
   assert.equal(final.length,preview.length);for(let s=0;s<final.length;s++)for(let p=0;p<final[s].length;p++)for(const axis of ['x','y'])assert(Math.abs(final[s][p][axis]-preview[s][p][axis])<1,`${type} moved on ${onImage?'image':'text'} at ${zoom}, ${mobile?'touch':'mouse'}`);
   assert(Math.abs(final[0][0].x-x)<1&&Math.abs(final[0][0].y-y)<1,`${type} start must remain at pointer`);
  }
 }
 assert.deepEqual(errors,[]);await context.close();
 }console.log('PASS: pencil, highlighter, line, arrow, rectangle and ellipse stay on the pointer and match live preview over text/images, with scroll, 50/100/150% zoom and real smartphone touch.');}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
