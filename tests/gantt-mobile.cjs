const {chromium}=require('playwright');
const assert=require('node:assert/strict');

const fixture={version:1,activeProjectId:'mobile',projects:[
  {id:'group',kind:'group',title:'Grupo móvel',tasks:[]},
  {id:'mobile',parentId:'group',title:'Cronograma longo',tasks:Array.from({length:80},(_,i)=>({
    id:'m'+i,name:'MOBILE TASK '+String(i+1).padStart(3,'0'),
    start:i===79?'2027-12-01':'2026-10-05',end:i===79?'2027-12-03':'2026-10-07',
    dur:3,unit:'bd',pred:'',pct:0,indent:0,mile:false,color:'#4a9eff'
  }))}
]};
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';

(async()=>{
  const browser=await chromium.launch({headless:true});
  const errors=[];
  async function open(options){
    const page=await browser.newPage(options);
    page.setDefaultTimeout(15000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://script.google.com/**',r=>r.abort());
    await page.addInitScript(data=>{if(window===window.top)localStorage.setItem('pf_projects_v1',JSON.stringify(data))},fixture);
    await page.goto(url);await page.click('#tabGantt');
    await page.waitForFunction(()=>document.getElementById('tbody').children.length===80);
    return page;
  }
  // Real touch events exercise Chromium's native scrolling/pinch recognition,
  // rather than merely assigning scroll offsets or applying a CSS transform.
  async function swipe(page,cdp,from,to){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:0}]});
    for(let i=1;i<=15;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{
        x:from.x+(to.x-from.x)*i/15,y:from.y+(to.y-from.y)*i/15,id:0
      }]});
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(250);
  }
  const dimensions=page=>page.evaluate(()=>{
    const element=id=>document.getElementById(id),doc=document.scrollingElement;
    return {height:doc.scrollHeight,width:doc.scrollWidth,viewport:innerHeight,top:scrollY,
      mainWidth:element('main').clientWidth,mainHeight:element('main').clientHeight,
      mainScrollHeight:element('main').scrollHeight,mainScrollWidth:element('main').scrollWidth,
      tableHeight:element('tbody').clientHeight,tableScrollHeight:element('tbody').scrollHeight,
      tableTop:element('tbody').scrollTop,ganttHeight:element('gbody').clientHeight,
      ganttScrollHeight:element('gbody').scrollHeight,ganttTop:element('gbody').scrollTop,
      left:element('main').scrollLeft,scale:visualViewport.scale};
  });
  try{
    const page=await open({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const cdp=await page.context().newCDPSession(page);
    const tasks=await page.evaluate(()=>JSON.stringify(T.map(taskOut)));
    await page.waitForFunction(()=>document.getElementById('main').style.getPropertyValue('--mobile-table-width'));
    let size=await dimensions(page);
    assert.equal(size.width,390);assert(size.height>3000);assert.equal(size.mainWidth,390);
    assert.equal(size.mainHeight,size.mainScrollHeight);
    assert.equal(size.tableHeight,size.tableScrollHeight);assert.equal(size.ganttHeight,size.ganttScrollHeight);
    assert(await page.locator('#divider').isHidden());assert(await page.locator('.resize-handle').first().isHidden());
    await swipe(page,cdp,{x:200,y:740},{x:200,y:365});
    size=await dimensions(page);assert(size.top>250);assert.equal(size.tableTop,0);assert.equal(size.ganttTop,0);
    await swipe(page,cdp,{x:330,y:400},{x:60,y:400});
    assert((await dimensions(page)).left>180);
    await page.click('#mobileShowTable');await page.waitForFunction(()=>document.getElementById('main').scrollLeft<1);
    await page.click('#mobileShowGantt');await page.waitForFunction(()=>Math.abs(document.getElementById('main').scrollLeft-572)<1);
    assert.equal(Math.round(await page.locator('#ghead').evaluate(e=>e.getBoundingClientRect().x)),0);
    // Pinching over the Gantt changes native page scale; table and surrounding
    // controls participate in the same visual viewport, without a chart-only zoom.
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:400,id:0},{x:240,y:400,id:1}]});
    for(let i=1;i<=12;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150-i*4,y:400,id:0},{x:240+i*4,y:400,id:1}]});
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>visualViewport.scale>1.1);
    assert.equal(await page.locator('#app').evaluate(e=>getComputedStyle(e).transform),'none');
    await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    await page.waitForFunction(()=>visualViewport.scale===1);
    for(let i=0;i<8;i++)await swipe(page,cdp,{x:200,y:740},{x:200,y:300});
    size=await dimensions(page);assert(size.top>=size.height-size.viewport-2);
    const lastRow=await page.locator('.tr[data-id="m79"]').boundingBox();
    assert(lastRow.y>52 && lastRow.y+lastRow.height<=844);
    // Reach the last date and last task using touch in the same common viewport.
    for(let i=0;i<8;i++)await swipe(page,cdp,{x:330,y:500},{x:55,y:500});
    size=await dimensions(page);assert(size.left>=size.mainScrollWidth-size.mainWidth-2);
    const lastBar=await page.locator('.gbar[data-id="m79"]').boundingBox();
    assert(lastBar.x>=0 && lastBar.x+lastBar.width<=390);
    assert.equal(Math.round(lastBar.y-lastRow.y),5);
    assert.equal(await page.evaluate(()=>JSON.stringify(T.map(taskOut))),tasks);
    await page.screenshot({path:'/tmp/gantt-mobile-bottom.png'});

    // Existing time-axis zoom and resolution changes keep the shared width fresh.
    await page.evaluate(()=>scrollTo(0,0));const oldWidth=size.mainScrollWidth;
    await page.click('#btnZI');await page.waitForFunction(w=>document.getElementById('main').scrollWidth>w,oldWidth);
    await page.click('#btnZO');await page.selectOption('#selRes','months');
    await page.waitForFunction(()=>Math.abs(document.getElementById('gpanel').getBoundingClientRect().width-parseFloat(document.getElementById('gcontent').style.width))<1);
    assert.equal(await page.evaluate(()=>JSON.stringify(T.map(taskOut))),tasks);
    await page.selectOption('#selRes','weeks');
    await page.setViewportSize({width:844,height:390});
    size=await dimensions(page);assert.equal(size.width,844);assert(size.height>2400);assert.equal(size.mainWidth,844);
    await page.evaluate(()=>scrollTo(0,document.scrollingElement.scrollHeight));
    assert((await page.locator('.tr[data-id="m79"]').boundingBox()).y<390);
    assert.equal((await dimensions(page)).tableTop,0);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>scrollTo(0,0));await page.selectOption('#selProject','group');
    assert.equal(await page.locator('#scheduleAggregate .sg-row').count(),82);
    const group=await page.locator('.sg-chart').evaluate(e=>({height:e.clientHeight,scrollHeight:e.scrollHeight,width:e.clientWidth,scrollWidth:e.scrollWidth}));
    assert(group.height>3500);assert.equal(group.height,group.scrollHeight);assert(group.scrollWidth>group.width);
    assert(await page.locator('#mobileShowGantt').isHidden());
    await page.locator('.sg-chart').scrollIntoViewIfNeeded();
    const groupTop=await page.evaluate(()=>scrollY);
    await swipe(page,cdp,{x:280,y:740},{x:280,y:340});assert(await page.evaluate(y=>scrollY>y,groupTop));
    await swipe(page,cdp,{x:330,y:400},{x:55,y:400});
    assert(await page.locator('.sg-chart').evaluate(e=>e.scrollLeft>150));
    assert.equal(Math.round(await page.locator('.sg-chart-header .sg-label').evaluate(e=>e.getBoundingClientRect().x)),13);
    await page.evaluate(()=>scrollTo(0,document.scrollingElement.scrollHeight));
    const lastGroupRow=await page.locator('.sg-row').last().boundingBox();
    assert(lastGroupRow.y>52 && lastGroupRow.y+lastGroupRow.height<=844);
    await page.evaluate(()=>scrollTo(0,0));await page.click('#sgCollapseAll');
    assert.equal(await page.locator('.sg-row').count(),1);
    await page.click('#sgExpandAll');assert.equal(await page.locator('.sg-row').count(),82);
    await page.selectOption('#selProject','mobile');
    // The scrolling changes are scoped to the schedule view, not the other tabs.
    await page.click('#tabActions');assert(await page.locator('#scheduleMobileNav').isHidden());
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden');
    await page.click('#tabTodo');assert(await page.locator('#scheduleMobileNav').isHidden());
    await page.click('#tabGantt');assert(await page.locator('#scheduleMobileNav').isVisible());

    const desktop=await open({viewport:{width:1320,height:900}});
    const desktopSize=await dimensions(desktop);
    assert.equal(desktopSize.height,900);assert.equal(desktopSize.width,1320);
    assert.equal(desktopSize.tableHeight,677);assert.equal(desktopSize.ganttHeight,677);
    assert.equal(await desktop.locator('#tpanel').evaluate(e=>e.clientWidth),580);
    assert(await desktop.locator('#scheduleMobileNav').isHidden());assert(await desktop.locator('#divider').isVisible());
    await desktop.locator('#tbody').evaluate(e=>e.scrollTop=300);
    await desktop.waitForFunction(()=>document.getElementById('gbody').scrollTop===300);
    await desktop.locator('#gbody').evaluate(e=>{e.scrollTop=500;e.scrollLeft=200});
    await desktop.waitForFunction(()=>document.getElementById('tbody').scrollTop===500 && document.getElementById('ght').style.transform==='translateX(-200px)');
    await desktop.setViewportSize({width:390,height:844});
    assert(await desktop.locator('#scheduleMobileNav').isHidden());
    assert.equal(await desktop.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden');
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile native vertical/horizontal touch, whole-page pinch zoom, last task/date access, aligned rows/headers, table/bar shortcuts, axis zoom, landscape, group scrolling/folding, tab isolation and unchanged desktop pane scrolling');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
