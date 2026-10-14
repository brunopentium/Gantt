const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {harness,settled,decode}=require('./auto-save.cjs');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
const day='2026-10-08',next='2026-10-09';
const schedule={version:1,activeProjectId:'schedule',projects:[{id:'schedule',title:'Cronograma selecionável',tasks:[
 {id:'leaf',name:'ATIVIDADE ESCOLHIDA',start:day,end:day,dur:1,unit:'bd',pct:0,indent:0,pred:'',mile:false},
 {id:'other',name:'OUTRA ATIVIDADE',start:day,end:day,dur:1,unit:'bd',pct:0,indent:0,pred:'',mile:false}
]}]};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const personal of [false,true]){
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.addInitScript(({personal,schedule})=>{
    if(window!==window.top||localStorage.getItem('inclusion-seeded'))return;
    localStorage.setItem('inclusion-seeded','1');
    if(personal){localStorage.setItem('pf_workspace_active_v1','personal');localStorage.setItem('pf_personal_session_v1','a'.repeat(64));localStorage.setItem('pf_projects_v1',JSON.stringify({version:1,activeProjectId:'work',projects:[{id:'work',title:'WORK MUST STAY INTACT',tasks:[]}]}))}
    const prefix=personal?'pf_personal__':'';
    localStorage.setItem(prefix+'pf_projects_v1',JSON.stringify(schedule));
    localStorage.setItem(prefix+'pf_todo_v1',JSON.stringify({tasks:[],settings:{projects:[],config:{}}}));
   },{personal,schedule});
   await page.goto(url);await page.locator('#mdDate').fill(day);
   const main=page.locator('.md-priority-queue'),lower=page.locator('.md-schedule-detail');
   const chosen=()=>main.locator('[data-my-day-item]').filter({has:page.getByRole('heading',{name:'ATIVIDADE ESCOLHIDA',exact:true})});
   const source=()=>lower.locator('[data-my-day-item]').filter({has:page.getByRole('heading',{name:'ATIVIDADE ESCOLHIDA',exact:true})});
   assert.equal(await main.locator('[data-source="gantt"]').count(),0,'No automatic inclusion even when starting and finishing today');
   await page.locator('[data-md-schedule="starting"]').click();
   await source().getByRole('button',{name:'Incluir no Meu dia',exact:true}).click();
   assert.equal(await main.locator('[data-source="gantt"]').count(),1);
   assert.equal(await chosen().locator('[data-md-rating="priority"]').count(),5);
   await chosen().locator('[data-md-rating="priority"][data-value="1"]').click();
   await chosen().locator('[data-md-rating="difficulty"][data-value="2"]').click();
   assert.equal(await chosen().getAttribute('class').then(x=>x.includes('md-daily-focus')),true);
   const before=await page.evaluate(()=>WorkspaceBackup.snapshot().projects[0].tasks);
   assert.equal(before[0].myDay[day].included,true);assert.equal(before[0].myDay[day].priority,1);assert.equal(before[0].myDay[day].difficulty,2);
   assert.equal(before.length,2);assert.equal(before[0].start,day);assert.equal(before[0].end,day);assert.equal(before[0].pct,0);
   await page.reload();await page.locator('#mdDate').fill(day);assert.equal(await chosen().count(),1);
   await page.locator('#mdDate').fill(next);assert.equal(await main.locator('[data-source="gantt"]').count(),0,'Membership is date specific');
   await page.locator('#mdDate').fill(day);
   await chosen().getByRole('button',{name:'Retirar do Meu dia',exact:true}).click();
   assert.equal(await main.locator('[data-source="gantt"]').count(),0,'Remove is immediate despite retained session rows');
   await page.locator('[data-md-schedule="starting"]').click();
   await source().getByRole('button',{name:'Incluir no Meu dia',exact:true}).click();
   assert.equal(await main.locator('[data-source="gantt"]').count(),1);
   await chosen().locator('[data-md-date]').fill(next);
   assert(await chosen().locator('.md-handled-body').isHidden(),'Rescheduling collapses to queue tail');
   await chosen().getByRole('button',{name:'Expandir ATIVIDADE ESCOLHIDA',exact:true}).click();
   await chosen().getByRole('button',{name:'Voltar à fila',exact:true}).click();
   await chosen().locator('[data-md-complete]').click();
   assert(await chosen().locator('.md-handled-body').isHidden());
   assert.equal(await page.evaluate(()=>projects[0].tasks[0].pct),100);
   await page.locator('#mdRefresh').click();assert.equal(await main.locator('[data-source="gantt"]').count(),0);
   if(personal)assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pf_projects_v1')).projects[0].title),'WORK MUST STAY INTACT');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(errors,[]);await context.close();
  }
  const cloud=await harness(browser);await cloud.page.clock.install();
  await cloud.page.evaluate(day=>{const ref={source:'gantt',projectId:'schedule',id:'task'},item=MyDayData.read(day).rows.find(x=>x.key===MyDayData.key(ref));MyDayData.update(ref,MyDayData.dailyPatch(item,day,{included:true,priority:1,difficulty:2}))},day);
  await cloud.page.clock.fastForward(20000);await settled(cloud.page);
  assert.equal(cloud.writes.length,1);assert.equal(cloud.writes[0].scope,'gantt');
  assert.equal(decode(cloud.remote.get('gantt')).projects[0].tasks[0].myDay[day].included,true);
  await cloud.page.reload();await cloud.page.waitForFunction(()=>GanttBackup.state().ready);
  assert.equal(await cloud.page.evaluate(day=>MyDayData.read(day).work.today.filter(x=>x.source==='gantt').length,day),1);
  assert.deepEqual(cloud.errors,[]);await cloud.close();
  console.log('PASS: opt-in schedule daily queue, no date mutations/clones, ratings, remove/re-add, date isolation, reload, mobile, reschedule/completion tail, personal isolation, backup and Gantt-only automatic cloud persistence.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
