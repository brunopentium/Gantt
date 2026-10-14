const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765/';
const date=new Date().toISOString().slice(0,10);
const data={tasks:Array.from({length:24},(_,i)=>({id:String(i),title:'PHONE TASK '+i,date,deadline:'',status:'Em Andamento',project:'Pessoal',priority:3,difficulty:2,notes:'',tags:[],subtasks:[],recurrence:{frequency:'Nenhuma'}})),settings:{projects:['Pessoal'],config:{}}};
data.tasks[1].project='PROJETO'.repeat(18);data.tasks[1].status='Recorrente';data.tasks[1].recurrence={frequency:'Diária',daysOfWeek:[],daysOfMonth:[]};data.tasks[23].title+=' '+('Título muito longo para testar a largura do cartão '.repeat(4));
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const personal of [false,true]){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(({data,personal})=>{
    if(window!==window.top)return;
    if(personal){localStorage.setItem('pf_personal_session_v1','a'.repeat(64));localStorage.setItem('pf_workspace_active_v1','personal')}
    localStorage.setItem((personal?'pf_personal__':'')+'pf_todo_v1',JSON.stringify(data));
   },{data,personal});
   await page.goto(url);await page.click('#tabTodoNative');const frame=page.frameLocator('#todoNativeFrame');
   await frame.getByRole('button',{name:'Nova Tarefa',exact:true}).waitFor();
   await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentDocument.documentElement.dataset.taskPhone==='true');
   await page.waitForFunction(()=>document.getElementById('todoNativeFrame').getBoundingClientRect().height>1000);
   assert.equal(Math.round((await page.locator('#todoNativeFrame').boundingBox()).y),0);
   assert((await frame.locator('.task-new-button').boundingBox()).y<40);
   const locations=await frame.locator('.task-shell').evaluate(root=>['.task-content','.task-sidebar nav','.task-sidebar-stats'].map(selector=>{const rect=root.querySelector(selector).getBoundingClientRect();return {top:rect.top,bottom:rect.bottom}}));
   assert(locations[1].top>=locations[0].bottom);assert(locations[2].top>=locations[1].bottom);
   assert((await page.locator('#appTabs').boundingBox()).y>(await page.locator('#todoNativeFrame').boundingBox()).height);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
   const grid=await frame.locator('.task-grid').boundingBox(),filters=await frame.locator('.task-filters').boundingBox();
   assert(filters.y>=grid.y+grid.height);assert(grid.y<100);
   await page.screenshot({path:'/tmp/task-phone-content-first.png'});
   assert.equal(await frame.locator('html').evaluate(()=>document.documentElement.scrollWidth),390);
   assert(await frame.locator('.task-card').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().left>=0&&n.getBoundingClientRect().right<=innerWidth)));
   assert(await frame.locator('.task-card-actions button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().left>=0&&n.getBoundingClientRect().right<=innerWidth)));
   await page.setViewportSize({width:320,height:844});
   await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentWindow.innerWidth===320);
   assert.equal(await frame.locator('html').evaluate(()=>document.documentElement.scrollWidth),320);
   await page.setViewportSize({width:390,height:844});
   await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentWindow.innerWidth===390);
   const strip=frame.locator('[data-task-id="0"] .task-postpone-days');
   assert(await strip.evaluate(n=>n.scrollWidth>n.clientWidth&&getComputedStyle(n).overflowX==='auto'));
   const rect=await strip.boundingBox(),cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width-12,y:rect.y+rect.height/2,id:0}]});
   for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.width-12-(rect.width-24)*i/12,y:rect.y+rect.height/2,id:0}]});await page.waitForTimeout(20)}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentDocument.querySelector('[data-task-id="0"] .task-postpone-days').scrollLeft>30);
   assert.equal(await page.evaluate(()=>NativeTodo.snapshot().tasks.find(t=>t.id==='0').date),date);
   await strip.locator('button').last().click();
   const shifted=new Date(Date.parse(date+'T12:00:00Z')+14*86400000).toISOString().slice(0,10);
   await page.waitForFunction(value=>NativeTodo.snapshot().tasks.find(t=>t.id==='0').date===value,shifted);
   await page.evaluate(date=>MyDayData.update({source:'todo',id:'0'},{date}),date);
   await frame.getByPlaceholder('Buscar tarefa...').fill('PHONE TASK 9');
   await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentDocument.querySelectorAll('[data-task-id]').length===1);
   assert.equal(await page.evaluate(()=>NativeTodo.snapshot().tasks.length),24);
   await frame.getByPlaceholder('Buscar tarefa...').fill('');
   await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentDocument.querySelectorAll('[data-task-id]').length===24);
   await frame.getByRole('button',{name:'Nova Tarefa',exact:true}).click();const form=frame.locator('form');
   await form.locator('input[type=text]').first().fill('CREATED ON PHONE');await form.getByRole('button',{name:'Salvar Tarefa',exact:true}).click();
   await page.waitForFunction(()=>NativeTodo.snapshot().tasks.some(t=>t.title==='CREATED ON PHONE'));
   // Footer menus remain usable and bring the selected content into view.
   await frame.getByRole('button',{name:'Configurações',exact:true}).click();await frame.getByRole('button',{name:'Exportar Backup',exact:true}).waitFor();
   await page.waitForFunction(()=>scrollY<100);await frame.getByRole('button',{name:'Dashboard',exact:true}).click();
   await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentDocument.querySelectorAll('[data-task-id]').length===25);
   // A form opened from the last card is visible within the actual phone viewport.
   await frame.getByRole('button',{name:'Editar tarefa PHONE TASK 9',exact:true}).click();
   await form.waitFor();const input=await form.locator('input[type=text]').first().boundingBox();assert(input.y>=0&&input.y<844);
   await form.getByRole('button',{name:'Cancelar',exact:true}).click();
   await page.locator('#tabMyDay').click();await page.waitForFunction(()=>scrollY<100);assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('appTabs')).order),'0');
   assert.equal(await page.evaluate(()=>WorkspaceProfile.personal),personal);
   assert.deepEqual(errors,[]);await context.close();
  }
  const page=await browser.newPage({viewport:{width:1280,height:900}});await page.addInitScript(data=>{if(window===window.top)localStorage.setItem('pf_todo_v1',JSON.stringify(data))},data);await page.goto(url);await page.click('#tabTodoNative');
  const frame=page.frameLocator('#todoNativeFrame');await frame.getByRole('button',{name:'Nova Tarefa',exact:true}).waitFor();
  assert.equal(await frame.locator('.task-card-header').first().evaluate(n=>getComputedStyle(n).flexDirection),'row');
  assert.equal(await frame.locator('.task-sidebar').evaluate(n=>getComputedStyle(n).display),'flex');assert.equal(await frame.locator('.task-content').evaluate(n=>getComputedStyle(n).overflowY),'auto');
  assert((await frame.locator('.task-filters').boundingBox()).y<(await frame.locator('.task-grid').boundingBox()).y);
  assert((await page.locator('#appTabs').boundingBox()).y<(await page.locator('#todoNativeFrame').boundingBox()).y);
  console.log('PASS: smartphone Tasks content/new button first and menus/global controls last in work/personal, auto frame sizing, top and off-screen CRUD modals, footer navigation, other-tab isolation and unchanged desktop');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
