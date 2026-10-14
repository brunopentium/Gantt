const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765/';
const password=process.env.PERSONAL_TEST_PASSWORD;
if(!password)throw Error('Set PERSONAL_TEST_PASSWORD to test password verification; never commit the password.');
const day=new Date().toISOString().slice(0,10),repo='test-owner/private-workspaces';
const task=(title)=>({id:'t',title,date:day,deadline:day,status:'Em Andamento',project:'Projeto',priority:3,difficulty:2,notes:'',tags:[],subtasks:[],recurrence:{frequency:'Nenhuma'}});
const gantt={version:1,activeProjectId:'s',projects:[{id:'s',title:'WORK SCHEDULE',tasks:[{id:'t',name:'WORK GANTT',start:day,end:day,dur:1,unit:'bd',pct:0,pred:'',indent:0,mile:false}]}]};
const plans={version:1,type:'action-plans',actionPlans:[{id:'p',title:'WORK PLAN',actions:[{id:'a',title:'WORK ACTION',owner:'Bruno',start:day,end:day,status:'pending',notes:''}]}]};
const todo={version:1,type:'todo',tasks:[task('WORK TASK')],settings:{projects:['Projeto'],config:{}}};
const encode=data=>Buffer.from(JSON.stringify(data)).toString('base64');
(async()=>{
 const browser=await chromium.launch({headless:true}),errors=[],writes=[],requests=[];
 const remote=new Map(Object.entries({'backups/cronogramas.json':gantt,'backups/planos-de-acao.json':plans,'backups/todo.json':todo}).map(([path,data])=>[path,{sha:'work-'+path,content:encode(data)}]));
 async function network(context){await context.route('https://api.github.com/repos/**',async route=>{
  const request=route.request(),u=new URL(request.url());assert(u.pathname.startsWith('/repos/'+repo));assert.equal(request.headers().authorization,'Bearer synthetic-token');
  const path=u.pathname.split('/contents/')[1];requests.push({method:request.method(),path});
  if(u.pathname.endsWith('/commits'))return route.fulfill({json:[]});
  if(!path)return route.fulfill({json:{private:true,has_pages:false,default_branch:'main'}});
  if(request.method()==='GET')return route.fulfill(remote.has(path)?{json:remote.get(path)}:{status:404,json:{}});
  assert.equal(request.method(),'PUT');const body=request.postDataJSON();assert.equal(body.sha,remote.get(path)?.sha);
  const data=JSON.parse(Buffer.from(body.content,'base64').toString());assert(!JSON.stringify(data).includes('synthetic-token'));assert(!JSON.stringify(data).includes(password));
  remote.set(path,{sha:'new-'+writes.length,content:body.content});writes.push({path,data});return route.fulfill({json:{content:{sha:remote.get(path).sha}}});
 })}
 const ready=page=>page.waitForFunction(()=>window.WorkspaceProfile&&['GanttBackup','PlanCloud','TodoCloud'].every(name=>window[name]?.state().ready)&&!document.getElementById('app').inert);
 const snapshot=page=>page.evaluate(()=>JSON.stringify(WorkspaceBackup.snapshot(),(k,v)=>['exportedAt','updatedAt','wbs'].includes(k)?undefined:v));
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});await network(context);
  await context.addInitScript(({gantt,repo})=>{if(window!==window.top||localStorage.getItem('workspace-test-seed'))return;localStorage.setItem('workspace-test-seed','1');localStorage.setItem('pf_projects_v1',JSON.stringify(gantt));localStorage.setItem('pf_github_backup_v1',JSON.stringify({repo,enabled:true}));localStorage.setItem('pf_github_backup_v1_token',JSON.stringify('synthetic-token'))},{gantt,repo});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await ready(page);
  const original=await snapshot(page);await page.evaluate(()=>LocalRecovery.capture({reason:'Work copy'}));const workCopies=await page.evaluate(async()=>(await LocalRecovery.list()).length);
  await page.click('#openPersonal');await page.fill('#personalPassword','incorrect');await page.click('#personalLoginSubmit');await page.getByText('Senha incorreta.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>WorkspaceProfile.personal),false);assert.equal(await snapshot(page),original);
  await page.fill('#personalPassword',password);await Promise.all([page.waitForNavigation(),page.click('#personalLoginSubmit')]);await ready(page);
  assert.equal(await page.evaluate(()=>WorkspaceProfile.personal),true);assert(await page.locator('#exitPersonal').isVisible());assert(await page.locator('#openPersonal').isHidden());
  assert.equal(await page.evaluate(()=>T.length),0);assert.equal(await page.evaluate(()=>ActionPlans.exportData().length),0);assert.equal(await page.evaluate(()=>NativeTodo.snapshot().tasks.length),0);assert.equal(await page.evaluate(()=>MyDayData.read().rows.length),0);
  assert.equal(await page.evaluate(()=>AppNavigation.setLegacyVisible(true)),false);await page.evaluate(()=>ActionPlans.switchView('todo'));assert.equal(await page.locator('#todoFrame').getAttribute('src'),null);
  assert.equal(await page.evaluate(async()=>(await LocalRecovery.list()).length),0);
  const workAutosave=await page.evaluate(()=>localStorage.getItem('pf_autosave_v1'));
  await page.uncheck('#autosaveToggle');assert.equal(await page.evaluate(()=>localStorage.getItem('pf_autosave_v1')),workAutosave);await page.check('#autosaveToggle');
  await page.click('#mdSettings');assert(await page.locator('.md-legacy-option').isHidden());await page.locator('[data-md-close-settings]').first().click();
  await page.evaluate(({day,personalTask})=>{
   T=[mkTask({id:'t',name:'PERSONAL GANTT',start:pd(day),end:pd(day),dur:1})];document.getElementById('ptitle').value='PERSONAL SCHEDULE';recalc();render();save();
   ActionPlans.load([{id:'p',title:'PERSONAL PLAN',actions:[{id:'a',title:'PERSONAL ACTION',owner:'Bruno',start:day,end:day,status:'pending',notes:''}]}]);save();
   NativeTodo.restoreData({tasks:[personalTask],settings:{projects:['Pessoal'],config:{}}});MyDay.refresh();
  },{day,personalTask:{...task('PERSONAL TASK'),project:'Pessoal'}});
  await page.click('#tabTodoNative');await page.frameLocator('#todoNativeFrame').getByRole('heading',{name:'PERSONAL TASK',exact:true}).waitFor();assert.equal(await page.frameLocator('#todoNativeFrame').getByRole('heading',{name:'WORK TASK',exact:true}).count(),0);await page.click('#tabMyDay');
  const archive=await page.evaluate(()=>WorkspaceBackup.snapshot());assert.equal(archive.workspace,'personal');assert(!JSON.stringify(archive).includes('WORK '));
  assert(await page.evaluate(data=>{try{WorkspaceBackup.validate(data);return false}catch{return true}},{...archive,workspace:'work'}));
  await page.evaluate(()=>LocalRecovery.capture({reason:'Personal copy'}));assert.equal(await page.evaluate(async()=>(await LocalRecovery.list()).length),1);
  await page.clock.install();await page.clock.fastForward(20000);await page.waitForFunction(()=>['GanttBackup','PlanCloud','TodoCloud'].every(name=>!window[name].state().dirty&&!window[name].state().busy));
  assert.deepEqual(writes.map(x=>x.path).sort(),['backups/pessoal/cronogramas.json','backups/pessoal/planos-de-acao.json','backups/pessoal/todo.json']);
  for(const write of writes)assert(!JSON.stringify(write.data).includes('WORK '));
  const personal=await snapshot(page);const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(url);await ready(second);assert.equal(await second.evaluate(()=>WorkspaceProfile.personal),true);assert.equal(await snapshot(second),personal);
  // A new browser context restored from saved browser state resumes unlocked.
  const savedState=await context.storageState({indexedDB:true});const restarted=await browser.newContext({storageState:savedState});await network(restarted);const reopened=await restarted.newPage();await reopened.goto(url);await ready(reopened);assert.equal(await reopened.evaluate(()=>WorkspaceProfile.personal),true);assert.equal(await snapshot(reopened),personal);await restarted.close();
  await Promise.all([page.waitForNavigation(),second.waitForNavigation(),page.click('#exitPersonal')]);await ready(page);await ready(second);
  assert.equal(await page.evaluate(()=>WorkspaceProfile.personal),false);assert.equal(await second.evaluate(()=>WorkspaceProfile.personal),false);assert.equal(await snapshot(page),original);assert.equal(await page.evaluate(async()=>(await LocalRecovery.list()).length),workCopies);
  await page.click('#openPersonal');assert(await page.locator('#personalPassword').isVisible());await page.fill('#personalPassword',password);await Promise.all([page.waitForNavigation(),page.click('#personalLoginSubmit')]);await ready(page);assert.equal(await snapshot(page),personal);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:'/tmp/personal-workspace-mobile.png'});
  assert.deepEqual(errors,[]);assert.equal(writes.length,3);assert(requests.filter(x=>x.path?.startsWith('backups/pessoal/')).length>3);
  console.log('PASS: correct/wrong password, empty personal clone, four tabs/native Task, isolated data/filters/cloud files/recovery/archives, shared credentials without work metadata, automatic scoped saves, reopening browser state, cross-tab logout and reauthentication, source preservation and mobile');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
