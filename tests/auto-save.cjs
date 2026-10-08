const {chromium}=require('playwright');
const assert=require('node:assert/strict');

const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
const repo='brunopentium/gantt-backups';
const day='2026-10-08';
const gantt={version:1,activeProjectId:'schedule',projects:[{id:'schedule',title:'Synthetic schedule',tasks:[{id:'task',name:'Initial schedule task',indent:0,pred:'',dur:1,pct:0,start:day,end:day,unit:'bd',mile:false}]}]};
const plans={version:1,type:'action-plans',actionPlans:[{id:'plan',title:'Synthetic action plan',actions:[{id:'action',title:'Initial action',owner:'Bruno',start:day,end:day,status:'pending',notes:'',link:null}]}]};
const todo={version:1,type:'todo',tasks:[{id:'todo',title:'Initial native task',date:day,deadline:day,status:'Em Andamento',project:'Synthetic project',priority:3,difficulty:2,notes:'',tags:[],subtasks:[],metadata:{retained:true},recurrence:{frequency:'Nenhuma',daysOfWeek:[],daysOfMonth:[]},deferBusinessDays:0}],settings:{projects:['Synthetic project'],config:{}}};
const paths={gantt:'backups/cronogramas.json',action:'backups/planos-de-acao.json',todo:'backups/todo.json'};
const adapters=['GanttBackup','PlanCloud','TodoCloud'];
const refs={gantt:{source:'gantt',projectId:'schedule',id:'task'},action:{source:'action',planId:'plan',id:'action'},todo:{source:'todo',id:'todo'}};
const clone=data=>JSON.parse(JSON.stringify(data));
const encode=data=>Buffer.from(JSON.stringify(data)).toString('base64');
const decode=file=>JSON.parse(Buffer.from(file.content,'base64').toString());

async function harness(browser,{enabled=true}={}){
  const context=await browser.newContext(),page=await context.newPage();
  page.setDefaultTimeout(15000);
  const errors=[],downloads=[],dialogs=[],writes=[];
  const remote=new Map(Object.entries({gantt,action:plans,todo}).map(([scope,data])=>[scope,{sha:scope+'-initial',content:encode(data)}]));
  const versions=new Map(),commits=new Map(Object.keys(paths).map(scope=>[scope,[]]));
  let offline=false,activePuts=0,maxPuts=0,holdNext=false,releaseHeld=null,heldStarted=null,heldPromise=null;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('download',download=>downloads.push(download));
  page.on('dialog',dialog=>{if(dialog.type()!=='beforeunload')dialogs.push({type:dialog.type(),message:dialog.message()});return dialog.accept()});
  await page.route('https://script.google.com/**',route=>route.abort());
  await page.addInitScript(({gantt,repo,enabled})=>{
    if(window!==window.top||localStorage.getItem('synthetic_autosave_seed'))return;
    localStorage.setItem('synthetic_autosave_seed','1');
    localStorage.setItem('pf_projects_v1',JSON.stringify(gantt));
    localStorage.setItem('pf_github_backup_v1',JSON.stringify({repo,enabled:true}));
    localStorage.setItem('pf_github_backup_v1_token',JSON.stringify('synthetic-test-token'));
    if(!enabled)localStorage.setItem('pf_autosave_v1',JSON.stringify({enabled:false}));
  },{gantt,todo,repo,enabled});
  await page.route('https://api.github.com/repos/**',async route=>{
    const request=route.request(),requestUrl=new URL(request.url());
    assert.equal(request.headers().authorization,'Bearer synthetic-test-token');
    assert.equal(requestUrl.pathname.split('/').slice(2,4).join('/'),repo);
    if(offline)return route.abort('internetdisconnected');
    if(requestUrl.pathname.endsWith('/commits')){
      const scope=Object.keys(paths).find(scope=>paths[scope]===requestUrl.searchParams.get('path'));
      assert(scope,'History must remain scoped to a native area');
      const start=(Number(requestUrl.searchParams.get('page'))-1)*30;
      return route.fulfill({json:commits.get(scope).slice(start,start+30)});
    }
    if(!requestUrl.pathname.includes('/contents/'))return route.fulfill({json:{private:true,has_pages:false,default_branch:'main'}});
    const scope=Object.keys(paths).find(scope=>requestUrl.pathname.endsWith('/contents/'+paths[scope]));
    assert(scope,'Unexpected backup path '+requestUrl.pathname);
    if(request.method()==='GET'){
      const ref=requestUrl.searchParams.get('ref'),file=ref==='main'?remote.get(scope):versions.get(scope+':'+ref);
      return route.fulfill(file?{json:file}:{status:404,json:{}});
    }
    assert.equal(request.method(),'PUT');
    const body=request.postDataJSON(),current=remote.get(scope);
    assert.equal(body.sha,current?.sha,'Every PUT must use the current guarded SHA');
    const data=decode({content:body.content});
    assert(!JSON.stringify(data).includes('synthetic-test-token'),'Tokens must never enter archives');
    activePuts++;maxPuts=Math.max(maxPuts,activePuts);
    if(holdNext){holdNext=false;await new Promise(resolve=>{releaseHeld=resolve;heldStarted()})}
    const version='version-'+(writes.length+1),file={sha:scope+'-'+version,content:body.content};
    remote.set(scope,file);versions.set(scope+':'+version,{...file});
    writes.push({scope,data,message:body.message,sha:body.sha});
    commits.get(scope).unshift({sha:version,commit:{committer:{date:new Date().toISOString()},message:body.message}});
    activePuts--;return route.fulfill({json:{content:{sha:file.sha}}});
  });
  await page.goto(url);
  await page.waitForFunction(()=>['GanttBackup','PlanCloud','TodoCloud'].every(name=>window[name]?.state&&window[name].state().ready)&&!document.getElementById('app').inert);
  return {context,page,errors,downloads,dialogs,writes,remote,versions,commits,
    offline:value=>{offline=value},hold:()=>{holdNext=true;heldPromise=new Promise(resolve=>{heldStarted=resolve})},held:()=>!!releaseHeld,whenHeld:()=>heldPromise,
    release:()=>{assert(releaseHeld,'A held PUT must exist');releaseHeld();releaseHeld=null},
    maxPuts:()=>maxPuts,close:()=>context.close()};
}
async function edit(page,scope,title){await page.evaluate(({ref,title})=>MyDayData.update(ref,{title}),{ref:refs[scope],title})}
async function title(page,scope){return page.evaluate(scope=>scope==='gantt'?projects.find(p=>p.id==='schedule').tasks.find(t=>t.id==='task').name:scope==='action'?ActionPlans.exportData().find(p=>p.id==='plan').actions.find(a=>a.id==='action').title:NativeTodo.snapshot().tasks.find(t=>t.id==='todo').title,scope)}
async function settled(page){await page.waitForFunction(()=>['GanttBackup','PlanCloud','TodoCloud'].every(name=>{const state=window[name].state();return !state.busy&&!state.dirty}))}

async function main(){
  const browser=await chromium.launch({headless:true});
  const opened=[];
  try{
    const app=await harness(browser);opened.push(app);const {page,writes}=app;
    assert(await page.locator('#autosaveToggle').isChecked(),'Automatic saving is enabled for new and existing installations');
    assert.equal(await page.locator('#todoNativeFrame').getAttribute('src'),null,'Dashboard autosave does not require mounting native Task');
    assert.equal(writes.length,0,'Opening existing cloud data must never create a new version');
    await page.clock.install();
    await edit(page,'gantt','Schedule revision 1');await edit(page,'action','Action revision 1');await edit(page,'todo','Task revision 1');
    await page.clock.fastForward(15000);assert.equal(writes.length,0,'Typing and immediate edits must coalesce');
    await edit(page,'todo','Task final coalesced revision');
    await page.clock.fastForward(19999);assert.equal(writes.length,0,'A later edit restarts the shared 20-second quiet period');
    await page.clock.fastForward(1);await settled(page);
    assert.equal(writes.length,3,'One revision is written for each changed native area');
    assert.deepEqual(new Set(writes.map(write=>write.scope)),new Set(['gantt','action','todo']));
    assert.equal(writes.find(write=>write.scope==='todo').data.tasks[0].title,'Task final coalesced revision');
    assert.equal(writes.find(write=>write.scope==='gantt').data.actionPlans,undefined,'Schedule commits do not duplicate action plans');
    assert.equal(writes.find(write=>write.scope==='action').data.projects,undefined);
    assert.equal(writes.find(write=>write.scope==='todo').data._revision,undefined);
    assert.equal(app.maxPuts(),1,'Global autosaving serializes the repository writes');
    await page.clock.fastForward(60000);assert.equal(writes.length,3,'Clean state produces no periodic backup commits');
    assert.equal(app.downloads.length,0);assert.deepEqual(app.dialogs,[]);

    // An edit during an outstanding network write must survive and remain queued.
    app.hold();await edit(page,'todo','Task sent before in-flight edit');await page.clock.fastForward(20000);
    await page.waitForFunction(()=>TodoCloud.state().busy);await app.whenHeld();assert(app.held());
    await edit(page,'todo','Task edited during PUT');app.release();
    await page.waitForFunction(()=>!TodoCloud.state().busy);
    assert.equal(await title(page,'todo'),'Task edited during PUT');
    assert(await page.evaluate(()=>TodoCloud.state().dirty));
    assert.equal(writes.at(-1).data.tasks[0].title,'Task sent before in-flight edit');
    await page.clock.fastForward(20000);await settled(page);
    assert.equal(writes.at(-1).data.tasks[0].title,'Task edited during PUT');assert.equal(writes.length,5);

    // The single setting pauses all areas and survives reload; drafts still save locally.
    await page.locator('#autosaveToggle').uncheck();
    await edit(page,'action','Action awaiting re-enabled autosave');await page.clock.fastForward(120000);assert.equal(writes.length,5);
    await page.reload();await page.waitForFunction(()=>['GanttBackup','PlanCloud','TodoCloud'].every(name=>window[name]?.state?.().ready));
    assert(!await page.locator('#autosaveToggle').isChecked());assert.equal(await title(page,'action'),'Action awaiting re-enabled autosave');
    assert.equal(writes.length,5);assert.deepEqual(app.dialogs,[]);assert.equal(app.downloads.length,0);
    await page.locator('#autosaveToggle').check();await page.clock.fastForward(20000);await settled(page);assert.equal(writes.length,6);

    // A draft survives failed network requests and reload, then connects against its remembered SHA.
    app.offline(true);await edit(page,'gantt','Offline schedule draft');await page.clock.fastForward(20000);
    await page.waitForFunction(()=>!GanttBackup.state().busy);assert.equal(writes.length,6);assert.equal(await title(page,'gantt'),'Offline schedule draft');
    await page.reload();await page.waitForFunction(()=>window.WorkspaceAutosave&&window.GanttBackup?.state);
    assert.equal(await title(page,'gantt'),'Offline schedule draft');assert.equal(writes.length,6);
    app.offline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.clock.fastForward(20000);await settled(page);assert.equal(writes.length,7);
    assert.equal(decode(app.remote.get('gantt')).projects[0].tasks[0].name,'Offline schedule draft');

    // A different device's SHA causes a blocked conflict, never an automatic overwrite or prompt.
    app.remote.set('todo',{sha:'another-device',content:encode({...decode(app.remote.get('todo')),tasks:[{...todo.tasks[0],title:'Other device native task'}]})});
    await edit(page,'todo','Protected local conflicting task');await page.clock.fastForward(20000);
    await page.waitForFunction(()=>TodoCloud.state().blocked&&!TodoCloud.state().busy);
    assert.equal(writes.length,7);assert.equal(await title(page,'todo'),'Protected local conflicting task');
    await page.clock.fastForward(120000);assert.equal(writes.length,7,'A blocked conflict must not retry a PUT until resolved');
    assert.equal(decode(app.remote.get('todo')).tasks[0].title,'Other device native task');
    assert.deepEqual(app.dialogs,[]);assert.equal(app.downloads.length,0);assert.deepEqual(app.errors,[]);

    // Background saving stays useful locally when a token is unavailable and never opens setup UI.
    await page.evaluate(()=>{localStorage.removeItem('pf_github_backup_v1_token');sessionStorage.removeItem('pf_github_backup_v1_token');WorkspaceAutosave.refresh()});
    await edit(page,'action','Local action without GitHub credentials');await page.clock.fastForward(120000);
    assert.equal(await title(page,'action'),'Local action without GitHub credentials');assert.equal(writes.length,7);
    assert.equal(await page.locator('#gbRepo,#apRepo,#ntRepo').count(),0,'An automatic attempt must never interrupt editing with a connection modal');
    assert.deepEqual(app.dialogs,[]);assert.equal(app.downloads.length,0);

    // Linked action dates need protection before startup's schedule restore can synchronize them.
    const linked=await harness(browser,{enabled:false});opened.push(linked);
    await linked.page.evaluate(()=>{
      const plans=ActionPlans.exportData();plans[0].actions[0].link={projectId:'schedule',taskId:'task'};ActionPlans.load(plans);save();
    });
    await linked.page.evaluate(()=>MyDayData.update({source:'action',planId:'plan',id:'action'},{end:'2026-10-13'}));
    await linked.page.evaluate(()=>PlanCloud.save());
    assert.equal(linked.writes.length,1);assert.equal(linked.writes[0].scope,'action');
    assert.equal(await linked.page.evaluate(()=>GanttBackup.state().dirty),false,'Linked dates acknowledged by the plan remain covered in schedules');
    await edit(linked.page,'action','Unsynced linked action title');
    await linked.page.evaluate(()=>MyDayData.update({source:'action',planId:'plan',id:'action'},{end:'2026-10-15'}));
    assert(await linked.page.evaluate(()=>PlanCloud.state().linkedDirty),'The action has actual unsaved linked dates');
    const other=decode(linked.remote.get('gantt'));other.projects[0].tasks[0].name='Other device schedule';other.projects[0].tasks[0].start='2026-10-16';other.projects[0].tasks[0].end='2026-10-16';
    linked.remote.set('gantt',{sha:'other-device-linked-schedule',content:encode(other)});
    await linked.page.reload();await linked.page.waitForFunction(()=>GanttBackup.state().blocked&&!GanttBackup.state().busy&&PlanCloud.state().ready&&TodoCloud.state().ready);
    assert.equal(await title(linked.page,'action'),'Unsynced linked action title');
    const dates=await linked.page.evaluate(()=>({action:ActionPlans.exportData()[0].actions[0].end,task:actionTask('schedule','task').end}));
    assert.deepEqual(dates,{action:'2026-10-15',task:'2026-10-15'},'A different schedule head cannot synchronize away pending linked action data');
    assert.equal(linked.writes.length,1);assert.deepEqual(linked.dialogs,[]);assert.equal(linked.downloads.length,0);assert.deepEqual(linked.errors,[]);

    // Both clean areas must still load a legitimate newer pair of linked remote files.
    const cleanLinked=await harness(browser,{enabled:false});opened.push(cleanLinked);
    await cleanLinked.page.evaluate(()=>{const plans=ActionPlans.exportData();plans[0].actions[0].link={projectId:'schedule',taskId:'task'};ActionPlans.load(plans);save()});
    await cleanLinked.page.evaluate(()=>PlanCloud.save());await cleanLinked.page.evaluate(()=>GanttBackup.save());
    const newSchedule=decode(cleanLinked.remote.get('gantt'));newSchedule.projects[0].tasks[0].start='2026-10-16';newSchedule.projects[0].tasks[0].end='2026-10-16';newSchedule.projects[0].tasks[0].dur=1;newSchedule.exportedAt='2026-10-09T12:00:00.000Z';
    const newPlans=decode(cleanLinked.remote.get('action'));Object.assign(newPlans.actionPlans[0].actions[0],{start:'2026-10-16',end:'2026-10-16',owner:'Maria',status:'blocked'});newPlans.exportedAt='2026-10-09T12:01:00.000Z';
    cleanLinked.remote.set('gantt',{sha:'new-clean-linked-schedule',content:encode(newSchedule)});cleanLinked.remote.set('action',{sha:'new-clean-linked-plan',content:encode(newPlans)});
    const cleanWrites=cleanLinked.writes.length;
    await cleanLinked.page.reload();await cleanLinked.page.waitForFunction(()=>['GanttBackup','PlanCloud','TodoCloud'].every(name=>window[name]?.state?.().ready&&!window[name].state().busy));
    const loadedAction=await cleanLinked.page.evaluate(()=>ActionPlans.exportData()[0].actions[0]);
    assert.equal(loadedAction.owner,'Maria');assert.equal(loadedAction.status,'blocked');assert.equal(loadedAction.end,'2026-10-16');
    assert.equal(await cleanLinked.page.evaluate(()=>actionTask('schedule','task').end),'2026-10-16');
    assert.equal(cleanLinked.writes.length,cleanWrites,'Loading clean cross-device versions causes no upload');
    assert.deepEqual(cleanLinked.dialogs,[]);assert.equal(cleanLinked.downloads.length,0);assert.deepEqual(cleanLinked.errors,[]);
    console.log('PASS: enabled global autosave, 20-second shared debounce, scoped and sequential commits, clean no-op, no mounted Task requirement, in-flight edit retention, persistent toggle, local/offline reload recovery, guarded conflict without prompts or downloads, local edits without credentials, pending linked-date protection and clean linked cross-device reload');
  }finally{for(const app of opened)await app.close();await browser.close()}
}
module.exports={harness,edit,title,settled,paths,gantt,plans,todo,clone,encode,decode,adapters};
if(require.main===module)main().catch(error=>{console.error(error);process.exit(1)});
