const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const today=new Date().toISOString().slice(0,10);
const fixture={version:1,activeProjectId:'s',projects:[{id:'s',title:'Cronograma protegido',tasks:[{id:'t',name:'TAREFA GANTT',indent:0,pred:'',dur:1,pct:0,start:today,end:today,unit:'bd'}]}]};
const initial={version:1,type:'todo',tasks:[{id:'remote',title:'TAREFA REMOTA',date:today,deadline:today,status:'Em Andamento',project:'R&D',priority:3,difficulty:2,notes:'',tags:[],subtasks:[],metadata:{preserved:true},recurrence:{frequency:'Nenhuma',daysOfWeek:[],daysOfMonth:[]},deferBusinessDays:0}],settings:{projects:['R&D'],config:{}},exportedAt:new Date().toISOString()};
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';

(async()=>{
  const browser=await chromium.launch({headless:true});
  let remote={sha:'todo0',content:Buffer.from(JSON.stringify(initial)).toString('base64')},writes=0,reads=0,fail=false,isPrivate=true,hasPages=false;
  let commits=[];const versions=new Map([['initial',{...remote}]]),errors=[];
  async function open({seed,meta,accept=true,pauseConnection=false}={}){
    const page=await browser.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    page.downloads=[];page.on('download',download=>page.downloads.push(download));
    page.on('dialog',d=>d.type()==='confirm'&&!accept?d.dismiss():d.accept());
    await page.route('https://script.google.com/**',r=>r.abort());
    await page.addInitScript(({fixture,seed,meta,pauseConnection})=>{
      if(window!==window.top)return;
      localStorage.setItem('pf_autosave_v1',JSON.stringify({enabled:false}));
      if(pauseConnection){
        // Install the readiness gate before the default dashboard starts TodoCloud.
        const gate=new Promise(resolve=>window.releaseTodoConnection=resolve);let cloud;
        Object.defineProperty(window,'TodoCloud',{configurable:true,get:()=>cloud,set:api=>{
          cloud=api;const wait=api.waitForConnection;api.waitForConnection=promise=>wait(Promise.all([promise,gate]));
        }});
      }
      if(!localStorage.getItem('pf_projects_v1'))localStorage.setItem('pf_projects_v1',JSON.stringify(fixture));
      localStorage.setItem('pf_github_backup_v1',JSON.stringify({repo:'brunopentium/gantt-backups',enabled:true}));
      localStorage.setItem('pf_github_backup_v1_token',JSON.stringify('test-token'));
      if(seed&&!localStorage.getItem('pf_todo_v1'))localStorage.setItem('pf_todo_v1',JSON.stringify(seed));
      if(meta&&!localStorage.getItem('pf_github_todo_v1'))localStorage.setItem('pf_github_todo_v1',JSON.stringify(meta));
    },{fixture,seed,meta,pauseConnection});
    await page.route('https://api.github.com/repos/**',async route=>{
      const request=route.request(),apiUrl=new URL(request.url());assert.equal(request.headers().authorization,'Bearer test-token');
      if(fail)return route.fulfill({status:401,json:{}});
      if(apiUrl.pathname.endsWith('/commits')){
        assert.equal(apiUrl.searchParams.get('path'),'backups/todo.json');
        const pageNumber=Number(apiUrl.searchParams.get('page'));return route.fulfill({json:commits.slice((pageNumber-1)*30,pageNumber*30)});
      }
      if(apiUrl.pathname.endsWith('/contents/backups/cronogramas.json')){assert.equal(request.method(),'GET');return route.fulfill({json:{sha:'gantt',content:Buffer.from(JSON.stringify(fixture)).toString('base64')}})}
      if(apiUrl.pathname.endsWith('/contents/backups/planos-de-acao.json')){assert.equal(request.method(),'GET');return route.fulfill({json:{sha:'plans',content:Buffer.from(JSON.stringify({version:1,type:'action-plans',actionPlans:[]})).toString('base64')}})}
      if(!apiUrl.pathname.includes('/contents/'))return route.fulfill({json:{private:isPrivate,has_pages:hasPages,default_branch:'main'}});
      assert(apiUrl.pathname.endsWith('/contents/backups/todo.json'));
      if(request.method()==='PUT'){
        const body=request.postDataJSON();assert.equal(body.sha,remote?.sha);
        const data=JSON.parse(Buffer.from(body.content,'base64').toString());
        assert.equal(data.type,'todo');assert.equal(data.projects,undefined);assert.equal(data.actionPlans,undefined);
        assert(!JSON.stringify(data).includes('test-token'));assert(!JSON.stringify(data).includes('_revision'));
        writes++;remote={sha:'todo'+writes,content:body.content};versions.set('v'+writes,{...remote});commits.unshift({sha:'v'+writes,commit:{committer:{date:new Date().toISOString()},message:body.message}});
        return route.fulfill({json:{content:{sha:remote.sha}}});
      }
      reads++;const ref=apiUrl.searchParams.get('ref'),file=ref==='main'?remote:versions.get(ref);
      return route.fulfill(file?{json:file}:{status:404,json:{}});
    });
    await page.goto(url);await page.waitForFunction(()=>!document.getElementById('app').inert);
    if(!pauseConnection)await page.evaluate(()=>TodoCloud.start());
    return page;
  }
  const native=page=>page.frameLocator('#todoNativeFrame');
  async function enter(page){await page.click('#tabTodoNative');await native(page).getByRole('button',{name:'Nova Tarefa',exact:true}).waitFor();await page.waitForFunction(()=>!document.getElementById('app').inert && document.getElementById('todoNativeFrame').contentWindow.TaskMaster)}
  const source=page=>page.evaluate(()=>JSON.stringify({projects,plans:ActionPlans.exportData()},(k,v)=>k==='updatedAt'?undefined:v));
  try{
    const page=await open();assert.equal(reads,1,'The default Meu dia loads the configured Task cloud data');assert.equal(writes,0);
    assert.equal(await page.locator('#tabMyDay').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#todoFrame').getAttribute('src'),null);
    const protectedSource=await source(page);await enter(page);
    await native(page).getByRole('heading',{name:'TAREFA REMOTA',exact:true}).waitFor();assert.equal(writes,0);
    await native(page).getByRole('button',{name:'Nova Tarefa',exact:true}).click();
    await native(page).locator('form input[type=text]').first().fill('NOVA TAREFA CLOUD');
    await native(page).getByRole('button',{name:'Salvar Tarefa',exact:true}).click();
    await page.waitForFunction(()=>NativeTodo.snapshot().tasks.length===2);
    assert.equal(writes,0);await page.click('#ntCloudSave');await page.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('salvo no GitHub'));
    assert.equal(writes,1);const first=JSON.parse(Buffer.from(remote.content,'base64').toString());assert.equal(first.tasks.length,2);
    assert.equal(await source(page),protectedSource);
    // A different browser/device loads Todo using the already configured connection.
    const device=await open();await enter(device);await native(device).getByRole('heading',{name:'NOVA TAREFA CLOUD',exact:true}).waitFor();assert.equal(writes,1);await device.close();
    await page.evaluate(()=>NativeTodo.restoreData({...NativeTodo.snapshot(),tasks:NativeTodo.snapshot().tasks.map(t=>t.id==='remote'?{...t,title:'TÍTULO VERSÃO 2'}:t)}));
    await native(page).getByRole('heading',{name:'TÍTULO VERSÃO 2',exact:true}).waitFor();
    await page.click('#ntCloudSave');await page.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('salvo no GitHub'));assert.equal(writes,2);
    await page.click('#ntCloudHistory');await page.waitForFunction(()=>document.querySelectorAll('#ntVersions button').length===2);
    const copiesBefore=await page.evaluate(async()=>new Set((await LocalRecovery.list()).map(copy=>copy.id)).size);
    await page.locator('#ntVersions button').last().click();
    await page.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('salvo no GitHub'));assert.equal(writes,3);
    assert.equal(JSON.parse(Buffer.from(remote.content,'base64').toString()).tasks.find(t=>t.id==='remote').title,'TAREFA REMOTA');
    await native(page).getByRole('heading',{name:'TAREFA REMOTA',exact:true}).waitFor();assert.equal(commits[0].commit.message,'Restaurar Todo da versão v1');
    const safety=await page.evaluate(async()=>{const copies=await LocalRecovery.list();return {count:copies.length,data:await LocalRecovery.get(copies[0].id)}});
    assert.equal(safety.count,copiesBefore+1);assert.equal(safety.data.todo.tasks.find(t=>t.id==='remote').title,'TÍTULO VERSÃO 2');assert.equal(page.downloads.length,0);
    // A stale child render after an external restore cannot undo that restore.
    const revision=await page.evaluate(()=>document.getElementById('todoNativeFrame').contentWindow.TaskMaster.snapshot());
    await page.evaluate(old=>{NativeTodo.restoreData({tasks:[],settings:old.settings});NativeTodo.commit(old);NativeTodo.flush()},revision);
    assert.equal(await page.evaluate(()=>NativeTodo.snapshot().tasks.length),0);
    await page.evaluate(data=>NativeTodo.restoreData(data),first);
    await native(page).getByRole('heading',{name:'TAREFA REMOTA',exact:true}).waitFor();
    const local=await page.evaluate(()=>JSON.stringify(NativeTodo.snapshot()));
    remote.sha='external-device';await page.click('#ntCloudSave');await page.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('Versão remota diferente'));
    assert.equal(writes,3);assert.equal(await page.evaluate(()=>JSON.stringify(NativeTodo.snapshot())),local);
    fail=true;await page.click('#ntCloudSave');await page.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('Token inválido'));
    assert.equal(writes,3);assert.equal(await page.evaluate(()=>JSON.stringify(NativeTodo.snapshot())),local);fail=false;
    isPrivate=false;await page.click('#ntCloudSave');await page.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('repositório privado'));
    assert.equal(writes,3);isPrivate=true;
    hasPages=true;await page.click('#ntCloudSave');await page.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('sem GitHub Pages'));assert.equal(writes,3);hasPages=false;
    assert.equal(await source(page),protectedSource);
    // Startup keeps unmatched local changes without asking to overwrite them.
    const localOnly={tasks:[{...initial.tasks[0],title:'TAREFA LOCAL PROTEGIDA'}],settings:initial.settings};
    const refused=await open({seed:localOnly,accept:false});await enter(refused);
    await native(refused).getByRole('heading',{name:'TAREFA LOCAL PROTEGIDA',exact:true}).waitFor();
    await refused.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('local mantido'));
    assert((await refused.locator('#ntCloudStatus').innerText()).includes('local mantido'));assert.equal(writes,3);await refused.close();
    // An edit made in Meu dia while startup waits for the other cloud areas is protected.
    const cleanStartup={version:1,type:'todo',tasks:initial.tasks,settings:initial.settings};
    const raced=await open({seed:cleanStartup,meta:{repo:'brunopentium/gantt-backups',enabled:true,sha:remote.sha,fingerprint:JSON.stringify(cleanStartup)},accept:false,pauseConnection:true});
    const readsBeforeWait=reads;await raced.click('#tabMyDay');
    assert.equal(reads,readsBeforeWait,'Todo must wait for the configured connection readiness');
    const sameStart=await raced.evaluate(()=>{
      const first=TodoCloud.start(),second=TodoCloud.start();
      MyDayData.update({source:'todo',id:'remote'},{title:'ALTERADA NO MEU DIA ANTES DA CONEXÃO'});
      return first===second;
    });
    assert(sameStart,'Repeated startup calls must await the same pending operation');
    await raced.evaluate(()=>window.releaseTodoConnection());
    await raced.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('local mantido'));
    assert.equal(await raced.evaluate(()=>NativeTodo.snapshot().tasks.find(t=>t.id==='remote').title),'ALTERADA NO MEU DIA ANTES DA CONEXÃO');
    assert.equal(writes,3);await raced.close();
    // A recent child render not yet committed to the parent is flushed before replacement.
    const rendered=await open({seed:cleanStartup,meta:{repo:'brunopentium/gantt-backups',enabled:true,sha:remote.sha,fingerprint:JSON.stringify(cleanStartup)},accept:false,pauseConnection:true});
    await rendered.click('#tabMyDay');
    await rendered.evaluate(()=>{
      const pending=NativeTodo.data();pending.tasks=pending.tasks.map(t=>t.id==='remote'?{...t,title:'EDIÇÃO RECENTE NO RENDER DO TODO'}:t);
      document.getElementById('todoNativeFrame').contentWindow.TaskMaster={snapshot:()=>pending};
    });
    assert.equal(await rendered.evaluate(()=>NativeTodo.snapshot().tasks.find(t=>t.id==='remote').title),'TAREFA REMOTA');
    await rendered.evaluate(()=>window.releaseTodoConnection());
    await rendered.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('local mantido'));
    assert.equal(await rendered.evaluate(()=>NativeTodo.snapshot().tasks.find(t=>t.id==='remote').title),'EDIÇÃO RECENTE NO RENDER DO TODO');
    assert.equal(writes,3);await rendered.close();
    // A malformed remote archive is rejected before replacing any local tasks.
    remote={sha:'invalid',content:Buffer.from(JSON.stringify({...initial,tasks:[initial.tasks[0],initial.tasks[0]]})).toString('base64')};
    const invalid=await open({seed:localOnly});await enter(invalid);
    await invalid.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('ID inválido'));
    assert.equal(await invalid.evaluate(()=>NativeTodo.snapshot().tasks[0].title),'TAREFA LOCAL PROTEGIDA');assert.equal(writes,3);await invalid.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: default Meu dia loads Task cloud data with lazy local UI, existing private credentials, explicit scoped saves with auto mode disabled, cross-device loading, own history/restore as new commit/internal backup without downloads, stale-render and delayed-start edit protection, shared startup promise, source isolation, conflicts/auth/public/Pages guards, refused/invalid remote retention and credential-free archives');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
