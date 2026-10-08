const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {harness,edit,title,decode,clone}=require('./auto-save.cjs');

const snapshots=page=>page.evaluate(()=>LocalRecovery.list());
const stored=async(page,id)=>page.evaluate(id=>LocalRecovery.get(id),id);
const titles=data=>({gantt:data.projects.find(p=>p.id==='schedule').tasks.find(t=>t.id==='task').name,action:data.actionPlans.find(p=>p.id==='plan').actions.find(a=>a.id==='action').title,todo:data.todo.tasks.find(t=>t.id==='todo').title});
const current=page=>page.evaluate(()=>WorkspaceBackup.snapshot());

(async()=>{
  const browser=await chromium.launch({headless:true});let app;
  try{
    app=await harness(browser,{enabled:false});const {page}=app;
    assert.equal(app.downloads.length,0,'Initial cloud replacements preserve internal copies without downloading');
    assert.deepEqual(app.dialogs,[],'Initial clean connection is silent');
    const checkpoint=await page.evaluate(()=>LocalRecovery.checkpoint('Before executive review'));
    const prior=await stored(page,checkpoint);
    assert.equal(prior.type,'projectflow-backup');assert.equal(prior.projects.length,1);assert.equal(prior.actionPlans.length,1);assert.equal(prior.todo.tasks.length,1);
    assert(!JSON.stringify(prior).includes('synthetic-test-token'),'Internal archives exclude credentials too');
    const named=(await snapshots(page)).find(item=>item.id===checkpoint);
    assert.equal(named.name,'Before executive review');assert.equal(named.scope,'all');assert.deepEqual(named.counts,{projects:1,plans:1,actions:1,tasks:1});
    for(const scope of ['gantt','action','todo'])await edit(page,scope,'Changed '+scope+' before restoring');
    const changed=titles(await current(page)),count=(await snapshots(page)).length;
    assert(await page.evaluate(id=>LocalRecovery.restore(id),checkpoint),'Internal restore succeeds after capturing the prior state');
    assert.deepEqual(titles(await current(page)),titles(prior));assert.equal((await snapshots(page)).length,count+1);
    const beforeRestore=(await snapshots(page)).find(item=>item.reason==='Antes de restaurar uma cópia interna');
    assert(beforeRestore);assert.deepEqual(titles(await stored(page,beforeRestore.id)),changed);
    assert.equal(app.writes.length,0,'Restoring locally with autosave paused does not force a remote save');
    assert.equal(app.downloads.length,0,'Restoring a recovery point creates no automatic file');

    // Storage failure aborts a replacement rather than silently throwing away its old data.
    const beforeFailure=titles(await current(page)),attempt=clone(prior);attempt.todo.tasks[0].title='Must never replace current data';
    const failure=await page.evaluate(async data=>{
      const original=IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')throw new DOMException('Synthetic quota exceeded','QuotaExceededError');return original.apply(this,args)};
      try{await WorkspaceBackup.restore(data);return null}catch(error){return error.message}finally{IDBDatabase.prototype.transaction=original}
    },attempt);
    assert(failure&&failure.includes('Os dados atuais foram mantidos'),'A failed safety copy stops restoration');
    assert.deepEqual(titles(await current(page)),beforeFailure);assert.equal(app.writes.length,0);assert.equal(app.downloads.length,0);

    // A user edit made while IndexedDB is capturing data wins over a pending restoration.
    const concurrent=await page.evaluate(async id=>{
      const original=LocalRecovery.capture;
      LocalRecovery.capture=async options=>{
        const saved=await original(options),data=NativeTodo.snapshot();data.tasks[0].title='Task edited during recovery capture';NativeTodo.restoreData(data);return saved;
      };
      try{await LocalRecovery.restore(id);return null}catch(error){return error.message}finally{LocalRecovery.capture=original}
    },checkpoint);
    assert(concurrent,'A concurrent edit must stop a pending restoration');
    assert.equal(await title(page,'todo'),'Task edited during recovery capture');
    const afterConcurrent=titles(await current(page));assert.equal(afterConcurrent.gantt,beforeFailure.gantt);assert.equal(afterConcurrent.action,beforeFailure.action);
    await edit(page,'todo',beforeFailure.todo);assert.equal(app.writes.length,0);assert.equal(app.downloads.length,0);

    // Explicit JSON downloads remain available in both the recovery UI and general backup.
    await page.click('#autosaveRecovery');await page.locator('#localRecoveryOverlay').waitFor();
    const namedRow=page.locator('#localRecoveryOverlay .lr-record').filter({hasText:'Before executive review'});
    const recoveryDownload=page.waitForEvent('download');await namedRow.locator('[data-lr-download]').click();
    const recovered=JSON.parse(fs.readFileSync(await (await recoveryDownload).path(),'utf8'));
    assert.deepEqual(titles(recovered),titles(prior));assert(!JSON.stringify(recovered).includes('synthetic-test-token'));
    await page.locator('#localRecoveryOverlay .lr-close').click();
    const generalDownload=page.waitForEvent('download');await page.evaluate(()=>WorkspaceBackup.exportAll());
    const general=JSON.parse(fs.readFileSync(await (await generalDownload).path(),'utf8'));assert.deepEqual(titles(general),beforeFailure);
    assert.equal(app.downloads.length,2,'Only the two explicit download commands generated files');

    // Native Task GitHub history keeps a recoverable local pre-restore snapshot and creates a new commit.
    await edit(page,'todo','Native history version one');await page.evaluate(()=>document.getElementById('ntCloudSave').onclick());
    await page.waitForFunction(()=>!TodoCloud.state().busy&&!TodoCloud.state().dirty);
    await edit(page,'todo','Native history version two');await page.evaluate(()=>document.getElementById('ntCloudSave').onclick());
    await page.waitForFunction(()=>!TodoCloud.state().busy&&!TodoCloud.state().dirty);assert.equal(app.writes.length,2);
    await page.evaluate(()=>document.getElementById('ntCloudHistory').onclick());
    await page.waitForFunction(()=>document.querySelectorAll('#ntVersions button').length===2);
    const existingIds=new Set((await snapshots(page)).map(item=>item.id));
    await page.locator('#ntVersions button').last().click();
    await page.waitForFunction(()=>!TodoCloud.state().busy&&NativeTodo.snapshot().tasks[0].title==='Native history version one');
    assert.equal(app.writes.length,3,'Restoring historical data appends a guarded commit');
    assert.equal(decode(app.remote.get('todo')).tasks[0].title,'Native history version one');
    const historyCopies=(await snapshots(page)).filter(item=>!existingIds.has(item.id));assert(historyCopies.length>=1);
    assert((await Promise.all(historyCopies.map(item=>stored(page,item.id)))).some(data=>data.todo.tasks[0].title==='Native history version two'),'The state before a GitHub history restoration remains internally recoverable');
    assert.equal(app.downloads.length,2,'GitHub history restoration also avoids automatic downloads');

    // Clean reopen preserves the named point and avoids generating another file or version.
    const writes=app.writes.length;await page.reload();
    await page.waitForFunction(()=>['GanttBackup','PlanCloud','TodoCloud'].every(name=>window[name]?.state?.().ready));
    assert((await snapshots(page)).some(item=>item.id===checkpoint&&item.name==='Before executive review'));
    assert.equal(await title(page,'todo'),'Native history version one');assert.equal(app.writes.length,writes);assert.equal(app.downloads.length,2);
    assert.deepEqual(app.errors,[]);
    console.log('PASS: full credential-free internal checkpoints, restore captures prior state before replacing all three areas, storage failure preserves data, explicit downloads only, own GitHub history restores as a new commit with internal safety copy, and recovery persistence across reload');
  }finally{if(app)await app.close();await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
