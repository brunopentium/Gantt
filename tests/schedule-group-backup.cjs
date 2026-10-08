const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('https://script.google.com/**',r=>r.abort());
  await page.addInitScript(()=>localStorage.setItem('pf_autosave_v1',JSON.stringify({enabled:false})));
  let remote=null,writes=0,history=[];const versions=new Map();
  await page.route('https://api.github.com/repos/**',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(req.headers().authorization,'Bearer test-token');
   if(url.pathname.endsWith('/commits'))return route.fulfill({json:history});
   if(url.pathname.endsWith('/contents/backups/todo.json')){assert.equal(req.method(),'GET');return route.fulfill({status:404,json:{}})}
  if(!url.pathname.includes('/contents/'))return route.fulfill({json:{private:true,has_pages:false,default_branch:'main'}});
   if(req.method()==='PUT'){const payload=req.postDataJSON();writes++;remote={sha:'blob'+writes,content:payload.content};versions.set('commit'+writes,{...remote});history.unshift({sha:'commit'+writes,commit:{message:payload.message,committer:{date:new Date().toISOString()}}});return route.fulfill({json:{content:{sha:remote.sha}}})}
   const ref=url.searchParams.get('ref');const content=ref==='main'?remote:versions.get(ref);return route.fulfill(content?{json:content}:{status:404,json:{}});
  });
  await page.goto('http://127.0.0.1:8765');await page.click('#tabGantt');await page.evaluate(()=>{
   projects=[normalizeProject({id:'g',title:'Grupo',kind:'group',tasks:[]}),normalizeProject({id:'s',title:'Filho',parentId:'g',tasks:[taskOut(mkTask({id:'t',name:'Tarefa original',dur:2}))]})];loadProject('g',true);saveStore();
  });
  const status=text=>page.waitForFunction(t=>document.querySelector('#cloudBackupStatus').textContent.includes(t),text);
  await page.click('#btnCloudBackup');await page.fill('#gbRepo','brunopentium/gantt-backups');await page.fill('#gbToken','test-token');await page.click('#gbConnect');await status('first version');await page.click('#btnCloudSave');await status('Saved to GitHub');
  let saved=JSON.parse(Buffer.from(remote.content,'base64').toString());assert.equal(saved.projects[0].kind,'group');assert.equal(saved.projects[0].tasks.length,0);assert.equal(saved.projects[1].parentId,'g');assert.equal(saved.projects[1].tasks[0].name,'Tarefa original');assert.equal(writes,1);
  await page.click('#sgEdit');await page.fill('#sgTitle','Grupo renomeado');await page.locator('.sg-modal button[type=submit]').click();await page.click('#btnCloudSave');await status('Saved to GitHub');assert.equal(writes,2);
  await page.click('#btnCloudHistory');await status('History loaded');await page.locator('#gbVersions button').last().click();await status('Saved to GitHub');assert.equal(writes,3);assert.equal(await page.evaluate(()=>projects[0].title),'Grupo');assert.equal(await page.evaluate(()=>projects[1].parentId),'g');assert.equal(await page.evaluate(()=>projects[0].tasks.length),0);
  // Invalid hierarchy is rejected before the scheduler/local store or remote commit changes.
  saved=JSON.parse(Buffer.from(remote.content,'base64').toString());saved.projects[0].parentId='s';versions.set('bad',{sha:'bad',content:Buffer.from(JSON.stringify(saved)).toString('base64')});history.unshift({sha:'bad',commit:{message:'Inválido',committer:{date:new Date().toISOString()}}});const before=await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v));
  await page.click('#btnCloudHistory');await status('History loaded');await page.locator('#gbVersions button').first().click();await status('Failed to restore');assert.equal(await page.evaluate(()=>JSON.stringify(projects,(k,v)=>k==='updatedAt'?undefined:v)),before);assert.equal(writes,3);
  assert.deepEqual(errors,[]);console.log('PASS: schedule hierarchy cloud save/history/restore, additive metadata, empty groups, unchanged source tasks and cycle rejection before writes');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
