const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://script.google.com/**',r=>r.abort());
  await page.goto(process.env.GANTT_TEST_URL||'http://127.0.0.1:8765');
  await page.evaluate(()=>{
   const schedule=(id,parentId)=>normalizeProject({id,title:'Cronograma '+id,parentId,tasks:[taskOut(mkTask({id:'t'+id,name:'Tarefa '+id,dur:2,pred:''}))]});
   projects=[normalizeProject({id:'root',title:'Programa',kind:'group',tasks:[]}),normalizeProject({id:'group',title:'Grupo selecionado',kind:'group',parentId:'root',tasks:[]}),schedule('a','group'),schedule('b'),schedule('c'),normalizeProject({id:'nested',title:'Subgrupo externo',kind:'group',tasks:[]}),schedule('d','nested')];loadProject('group',true);saveStore();
  });await page.click('#tabGantt');
  const choice=id=>page.locator(`[data-sg-member="${id}"]`),save=()=>page.locator('.sg-modal button[type=submit]').click();
  const tasks=await page.evaluate(()=>JSON.stringify(projects.map(p=>({id:p.id,tasks:p.tasks}))));
  // Add multiple schedules without losing the already checked member.
  await page.click('#sgEdit');assert(await choice('a').isChecked());assert.equal(await choice('root').count(),1);assert.equal(await choice('group').count(),0);
  await choice('b').check();await choice('c').check();assert(await choice('a').isChecked());assert(await choice('b').isChecked());assert(await choice('c').isChecked());await save();
  assert.deepEqual(await page.evaluate(()=>projects.filter(p=>p.parentId==='group').map(p=>p.id)),['a','b','c']);assert.equal(await page.evaluate(()=>ScheduleGroups.snapshot().sources.length),3);
  await page.click('#sgMembers');for(const id of ['a','b','c'])assert(await choice(id).isChecked());await choice('b').uncheck();await page.click('#sgCancel');assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='b').parentId),'group');
  // Moving a subgroup retains its descendants; child selection is inherited.
  await page.click('#sgMembers');await choice('nested').check();assert(await choice('d').isChecked());assert(await choice('d').isDisabled());await save();
  assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='nested').parentId),'group');assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='d').parentId),'nested');assert.equal(await page.evaluate(()=>ScheduleGroups.snapshot().sources.length),4);
  // Removing a member promotes it, without deleting any tasks.
  await page.click('#sgEdit');assert.equal(await choice('d').count(),0);await choice('b').uncheck();await save();assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='b').parentId),'root');assert.equal(await page.evaluate(()=>JSON.stringify(projects.map(p=>({id:p.id,tasks:p.tasks})))),tasks);
  // A subgroup is a separate option and can receive multiple existing schedules at once.
  await page.click('#sgNewSubgroup');await page.fill('#sgTitle','Grupo novo');await choice('b').check();await choice('c').check();await save();
  const newId=await page.evaluate(()=>activeProjectId);assert.equal(await page.evaluate(id=>projects.find(p=>p.id===id).parentId,newId),'group');for(const id of ['b','c'])assert.equal(await page.evaluate(id=>projects.find(p=>p.id===id).parentId,id),newId);
  await page.reload();await page.click('#tabGantt');await page.click('#sgMembers');for(const id of ['b','c'])assert(await choice(id).isChecked());
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert(await choice('b').isVisible());await page.screenshot({path:'/tmp/gantt-members-mobile.png',fullPage:true});await page.click('#sgCancel');
  // Reproduce the user's inverted tree: Grupo1 is under the last schedule and contains zero schedules.
  await page.evaluate(()=>{
   const schedule=(id,parentId)=>normalizeProject({id,title:'Cronograma '+id,parentId,tasks:[taskOut(mkTask({id:'task-'+id,name:'Tarefa '+id,dur:3,pred:''}))]});
   projects=[schedule('first'),schedule('last','first'),normalizeProject({id:'wrong',title:'Grupo1',kind:'group',parentId:'last',tasks:[]}),schedule('other')];loadProject('wrong',true);saveStore();
  });assert.equal(await page.evaluate(()=>ScheduleGroups.snapshot().sources.length),0);
  const originals=await page.evaluate(()=>JSON.stringify(projects.map(p=>({id:p.id,tasks:p.tasks}))));
  await page.click('#sgMembers');await choice('last').check();await choice('other').check();await save();
  assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='wrong').parentId),'first');for(const id of ['last','other'])assert.equal(await page.evaluate(id=>projects.find(p=>p.id===id).parentId,id),'wrong');assert.equal(await page.evaluate(()=>ScheduleGroups.snapshot().sources.length),2);assert.equal(await page.evaluate(()=>JSON.stringify(projects.map(p=>({id:p.id,tasks:p.tasks})))),originals);
  await page.locator('.sg-tree-picker summary').click();const count=await page.locator('.sg-tree-picker [data-sg-select="wrong"] small').textContent();assert.equal(count,'2 schedules');await page.locator('.sg-tree-picker summary').click();
  // New group wraps the active schedule; it is never created inside that schedule.
  await page.selectOption('#selProject','last');await page.click('#sgNewGroup');assert.equal(await page.locator('#sgParent').inputValue(),'');assert(await choice('last').isChecked());await choice('other').check();await page.fill('#sgTitle','Grupo acima');await save();
  const top=await page.evaluate(()=>activeProjectId);assert.equal(await page.evaluate(id=>projects.find(p=>p.id===id).parentId,top),null);for(const id of ['last','other'])assert.equal(await page.evaluate(id=>projects.find(p=>p.id===id).parentId,id),top);assert.equal(await page.evaluate(()=>ScheduleGroups.snapshot().sources.length),2);
  await page.reload();await page.click('#tabGantt');await page.click('#sgMembers');for(const id of ['last','other'])assert(await choice(id).isChecked());await page.click('#sgCancel');
  // Adopt an entire ancestor branch without flattening its schedules or introducing cycles.
  await page.evaluate(()=>{projects.push(normalizeProject({id:'retained',title:'Membro mantido',parentId:'wrong',tasks:[]}));saveStore()});await page.selectOption('#selProject','wrong');await page.click('#sgMembers');assert(await choice('retained').isChecked());await choice('first').check();assert(await choice('retained').isChecked());await save();assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='wrong').parentId),null);assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='first').parentId),'wrong');assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='retained').parentId),'wrong');await page.evaluate(()=>ScheduleGroups.validate(projects));
  assert.deepEqual(errors,[]);console.log('PASS: bulk membership, selections, subtree preservation, subgroup creation, inverted-tree repair, root group wrapping, tree counts, persistence and mobile layout');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
