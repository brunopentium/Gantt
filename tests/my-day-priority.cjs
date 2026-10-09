const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
const today=new Date().toISOString().slice(0,10);
const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
const task=(id,title)=>({id,title,date:today,deadline:today,status:'Em Andamento',project:'Teste',priority:5,difficulty:5,notes:'Notas preservadas',subtasks:[{text:'Item',completed:false}],tags:['tag'],metadata:{keep:true},recurrence:{frequency:'Nenhuma',daysOfWeek:[],daysOfMonth:[]}});
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(data=>{if(window===window.top&&!localStorage.getItem('priority-seeded')){localStorage.setItem('pf_todo_v1',JSON.stringify(data));localStorage.setItem('priority-seeded','1')}},{tasks:[task('a','ALFA'),task('b','BETA')],settings:{projects:['Teste'],config:{}}});
  await page.goto(url);await page.locator('#mdAutomaticOrder').waitFor();
  await page.evaluate(day=>{ActionPlans.load([{id:'p',title:'Plano',actions:[{id:'a',title:'COBRAR',owner:'Maria',start:day,end:day,status:'pending',notes:'Nota'}]}]);saveStore();MyDay.refresh()},today);
  const item=title=>page.locator('[data-my-day-item]').filter({has:page.getByRole('heading',{name:title,exact:true})});
  const focus=async title=>{assert.equal(await page.locator('.md-daily-focus').count(),1);assert.equal(await page.locator('.md-daily-focus h4').textContent(),title)};
  const rate=async(title,field,value)=>{await item(title).locator(`[data-md-rating="${field}"][data-value="${value}"]`).click();await page.waitForFunction(({title,field,value,day})=>MyDayData.read(day).rows.find(x=>x.title===title).raw.myDay?.[day]?.[field]===value,{title,field,value,day:today})};
  await rate('BETA','priority',1);await focus('BETA');
  await rate('ALFA','priority',1);await rate('ALFA','difficulty',1);await focus('ALFA');
  await page.selectOption('#mdHardFirst','hard');await focus('BETA');
  await page.selectOption('#mdOrderFirst','difficulty');await rate('COBRAR','difficulty',5);await focus('COBRAR');
  await page.selectOption('#mdHardFirst','easy');await focus('ALFA');
  await page.uncheck('#mdAutomaticOrder');
  for(const [title,value] of [['BETA','1'],['COBRAR','2'],['ALFA','3']]){await item(title).locator(`[data-md-rating="order"][data-value="${value}"]`).click();}
  await focus('BETA');
  assert.deepEqual(await page.locator('.md-priority-queue h4').allTextContents(),['BETA','COBRAR','ALFA']);
  // Editing only the deadline still advances focus even if the execution remains today.
  await item('BETA').locator('[data-md-date]').fill(tomorrow);await focus('COBRAR');
  assert(await item('BETA').isVisible());
  assert(await item('BETA').locator('.md-handled-body').isHidden());
  assert.deepEqual(await page.locator('.md-priority-queue h4').allTextContents(),['COBRAR','ALFA','BETA']);
  await item('COBRAR').locator('[data-md-status]').selectOption('cancelled');await focus('ALFA');
  assert(await item('COBRAR').locator('.md-handled-body').isHidden());
  await item('ALFA').locator('[data-md-complete]').click();assert(await item('ALFA').locator('.md-handled-body').isHidden());assert.equal(await page.locator('.md-daily-focus').count(),0);
  assert(await item('BETA').locator('.md-handled-body').isHidden());
  await item('BETA').getByRole('button',{name:'Expandir BETA',exact:true}).click();
  assert(await item('BETA').locator('.md-handled-body').isVisible());
  await item('BETA').getByRole('button',{name:'Recolher BETA',exact:true}).click();
  assert(await item('BETA').locator('.md-handled-body').isHidden());
  await item('BETA').getByRole('button',{name:'Expandir BETA',exact:true}).click();
  await item('BETA').getByRole('button',{name:'Voltar à fila'}).click();await focus('BETA');
  const data=await page.evaluate(()=>WorkspaceBackup.snapshot());
  const beta=data.todo.tasks.find(t=>t.id==='b');assert.equal(beta.priority,5);assert.equal(beta.difficulty,5);assert.equal(beta.metadata.keep,true);assert.equal(beta.notes,'Notas preservadas');assert.equal(beta.myDay[today].order,1);assert.equal(data.actionPlans[0].actions[0].myDay[today].difficulty,5);
  await page.reload();await page.locator('#mdAutomaticOrder').waitFor();assert.equal(await page.locator('#mdAutomaticOrder').isChecked(),false);await focus('BETA');
  await page.locator('#mdDate').fill(tomorrow);assert.equal(await item('BETA').locator('[data-md-rating="order"][aria-pressed="true"]').count(),0);
  await page.locator('#mdDate').fill(today);assert.equal(await item('BETA').locator('[data-md-rating="order"][data-value="1"]').getAttribute('aria-pressed'),'true');
  assert.equal(await item('BETA').locator('[data-md-rating="priority"]').count(),5);
  assert.equal(await item('BETA').locator('[data-md-rating="difficulty"]').count(),5);
  assert.equal(await item('BETA').locator('[data-md-rating="order"]').count(),10);
  await item('BETA').locator('[data-md-status]').selectOption('Reserva');
  assert(await item('BETA').locator('.md-handled-body').isHidden());
  assert.equal(await page.locator('.md-daily-focus').count(),0);
  await item('BETA').getByRole('button',{name:'Expandir BETA',exact:true}).click();
  await item('BETA').locator('[data-md-status]').selectOption('Em Andamento');
  await item('BETA').getByRole('button',{name:'Voltar à fila'}).click();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await item('BETA').locator('.md-daily-rating').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/my-day-priority-mobile.png'});
  await page.evaluate(()=>{for(const patch of [{priority:0},{difficulty:6},{order:-1},{handled:'yes'}]){try{MyDayData.validateDaily({[MyDay.date()]:patch});throw Error('accepted invalid value')}catch(e){if(e.message==='accepted invalid value')throw e}}});
  assert.deepEqual(errors,[]);
  // Real app adapters against an intercepted GitHub: no private data or credentials.
  const {harness,settled,decode}=require('./auto-save.cjs'),cloud=await harness(browser);
  await cloud.page.clock.install();
  await cloud.page.evaluate(day=>{
    for(const ref of [{source:'todo',id:'todo'},{source:'action',planId:'plan',id:'action'}]){
      const item=MyDayData.read(day).rows.find(row=>MyDayData.key(ref)===row.key);
      MyDayData.update(ref,MyDayData.dailyPatch(item,day,{priority:1,difficulty:4,order:2}));
    }
  },today);
  await cloud.page.clock.fastForward(20000);await settled(cloud.page);
  assert.equal(cloud.writes.length,2);
  assert.equal(decode(cloud.remote.get('todo')).tasks[0].myDay[today].difficulty,4);
  assert.equal(decode(cloud.remote.get('action')).actionPlans[0].actions[0].myDay[today].order,2);
  await cloud.page.reload();await cloud.page.waitForFunction(()=>['GanttBackup','PlanCloud','TodoCloud'].every(name=>window[name]?.state().ready));
  assert.equal(await cloud.page.evaluate(day=>NativeTodo.snapshot().tasks[0].myDay[day].priority,today),1);
  assert.equal(await cloud.page.evaluate(day=>ActionPlans.exportData()[0].actions[0].myDay[day].difficulty,today),4);
  assert.deepEqual(cloud.errors,[]);await cloud.close();
  console.log('PASS: daily-only automatic and manual queue, both criterion orders/easy-hard direction, one yellow focus, date/cancellation/completion advances, restore focus, independent dates, preserved source metadata/original ratings, portable backup, reload persistence, mobile, validation and scoped automatic cloud save/reload');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
