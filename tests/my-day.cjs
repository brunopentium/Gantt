const {chromium}=require('playwright');
const assert=require('node:assert/strict');

const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
const reference='2026-10-08';
const task=(id,title,date=reference,status='Em Andamento',extra={})=>({id,title,date,deadline:'',status,project:'Projeto pessoal',priority:3,difficulty:2,notes:'Observação preservada',tags:['diário'],subtasks:[{text:'Item preservado',completed:false}],recurrence:{frequency:'Nenhuma',daysOfWeek:[],daysOfMonth:[]},metadata:{test:'retained'},...extra});
const todo={tasks:[
  task('today','TODO DO DIA'),
  task('deferred','TODO ADIADO EM DIAS ÚTEIS','2026-10-02','Em Andamento',{deferBusinessDays:4}),
  task('deadline','TODO PRAZO FINAL','2026-10-12','Em Andamento',{deadline:reference}),
  task('late-deadline','TODO EXECUÇÃO ATRASADA PRAZO HOJE','2026-10-07','Em Andamento',{deadline:reference}),
  task('late','TODO ATRASADO','2026-10-07'),
  task('future','TODO PRÓXIMA SEMANA','2026-10-13'),
  task('undated','TODO SEM DATA',''),
  task('same-title','ASSUNTO COM MESMO NOME'),
  task('recurring','TODO RECORRENTE','2026-10-06','Recorrente',{deferBusinessDays:99,recurrence:{frequency:'Diária',daysOfWeek:[],daysOfMonth:[]}}),
  task('done','TODO JÁ CONCLUÍDO',reference,'Concluída'),
  task('cancelled','TODO CANCELADO',reference,'Cancelada'),
  task('reserve','TODO EM RESERVA',reference,'Reserva')
],settings:{projects:['Projeto pessoal'],config:{alertYellow:7,alertOrange:3,alertRed:1}}};
const action=(id,title,owner='Bruno',end=reference,extra={})=>({id,title,owner,start:'2026-10-01',end,status:'pending',notes:'Nota da ação',...extra});
const plans=[
  {id:'parent',title:'Programa de ações',actions:[
    action('same','AÇÃO DO PLANO PAI'),
    action('other','COBRAR MARIA','Maria'),
    action('lookalike','COBRAR BRUNO SILVA','Bruno Silva'),
    action('unassigned','ATRIBUIR RESPONSÁVEL',''),
    action('joint','AÇÃO COMPARTILHADA','Bruno e Maria'),
    action('late','AÇÃO ATRASADA','Bruno','2026-10-07'),
    action('blocked','AÇÃO BLOQUEADA','Bruno',reference,{status:'blocked'}),
    action('undated','AÇÃO SEM DATA','Bruno','',{start:''}),
    action('same-title','ASSUNTO COM MESMO NOME'),
    action('done','AÇÃO JÁ CONCLUÍDA','Bruno',reference,{status:'done'}),
    action('cancelled','AÇÃO CANCELADA','Bruno',reference,{status:'cancelled'})
  ]},
  {id:'child',parentId:'parent',title:'Subplano técnico',actions:[
    action('same','AÇÃO DO PLANO FILHO',' BRÚNO   SOUZA '),
    action('linked','AÇÃO COM DEPENDÊNCIA','Bruno',reference,{start:reference,link:{projectId:'two',taskId:'dependent'}})
  ]}
];
const ganttTask=(id,name,start,dur=1,extra={})=>({id,name,start,end:start,dur,unit:'bd',pct:0,indent:0,pred:'',mile:false,collapsed:false,color:'#4a9eff',...extra});
const schedules=[
  {id:'group',title:'Grupo de cronogramas',kind:'group',tasks:[]},
  {id:'one',parentId:'group',title:'Cronograma Engenharia',tasks:[
    ganttTask('summary','RESUMO RECOLHIDO',reference,1,{collapsed:true}),
    ganttTask('start','ATIVIDADE INICIA HOJE',reference,1,{indent:1}),
    ganttTask('finish','ATIVIDADE TERMINA HOJE','2026-10-07',2,{indent:1}),
    ganttTask('ongoing','ATIVIDADE EM EXECUÇÃO','2026-10-05',8,{indent:1,pct:35}),
    ganttTask('done','ATIVIDADE JÁ CONCLUÍDA',reference,1,{indent:1,pct:100})
  ]},
  {id:'two',parentId:'group',title:'Cronograma Validação',tasks:[
    ganttTask('precursor','PREDECESSORA','2026-10-07',1,{pct:100}),
    ganttTask('dependent','ATIVIDADE COM DEPENDÊNCIA','2026-10-06',1,{pred:'1FS'}),
    ...Array.from({length:50},(_,i)=>ganttTask('large-'+i,'EM ANDAMENTO VOLUME '+String(i+1).padStart(2,'0'),'2026-10-05',8,{pct:20}))
  ]},
  {id:'outside',title:'Cronograma independente',tasks:[
    ganttTask('start','OUTRO CRONOGRAMA MESMO ID',reference,2),
    ganttTask('milestone','MARCO DO DIA',reference,0,{mile:true})
  ]}
];

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
    page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route('https://script.google.com/**',r=>r.abort());
    await page.addInitScript(data=>{if(window!==window.top)return;if(!localStorage.getItem('pf_todo_v1'))localStorage.setItem('pf_todo_v1',JSON.stringify(data))},todo);
    await page.goto(url);
    assert.equal(await page.locator('#tabMyDay').getAttribute('aria-selected'),'true');
    const originalGoogle=await page.locator('#todoFrame').getAttribute('src');
    await page.evaluate(data=>{
      projects=data.schedules.map(normalizeProject);loadProject('one',true);
      ActionPlans.load(data.plans);save();render();
    },{schedules,plans});
    // Mount TaskMaster before dashboard edits: its stale render must not replace newer parent data.
    await page.click('#tabTodoNative');
    await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentWindow.TaskMaster);
    await page.click('#tabMyDay');
    assert(await page.locator('#myDayPanel').isVisible());
    assert(await page.locator('#main').isHidden());assert(await page.locator('#todoNativePanel').isHidden());
    await page.locator('#mdDate').fill(reference);await page.locator('#mdDate').dispatchEvent('change');
    const panel=page.locator('#myDayPanel');
    const item=(title,source)=>panel.locator(source?`[data-my-day-item][data-source="${source}"]`:'[data-my-day-item]').filter({hasText:title}).first();
    const scope=async name=>{await page.locator(`[data-md-scope="${name}"]`).click()};
    const scheduleItem=async title=>{
      for(let pageNumber=0;pageNumber<10&&await item(title,'gantt').count()===0;pageNumber++){
        const next=panel.locator('[data-md-page="1"]');
        assert(await next.isEnabled(),'The paginated schedule must allow reaching '+title);await next.click();
      }
      assert(await item(title,'gantt').isVisible());return item(title,'gantt');
    };
    const edit=async(title,source)=>{await item(title,source).locator('[data-md-edit]').click();await page.locator('#mdEditor').waitFor()};
    const saveEdit=async()=>{await page.locator('#mdEditSave').click();await page.locator('#mdEditor').waitFor({state:'hidden'})};
    const {model,unchanged}=await page.evaluate(day=>{
      const snapshot=()=>JSON.stringify({projects,plans:ActionPlans.exportData(),todo:NativeTodo.snapshot()});
      const before=snapshot(),model=MyDayData.read(day,['Bruno','Bruno Souza']);
      return {model,unchanged:snapshot()===before};
    },reference);
    assert(unchanged,'Reading calculated deadlines must not mutate or save the original sources');
    const titles=entries=>entries.map(e=>e.title);
    for(const title of ['TODO DO DIA','TODO ADIADO EM DIAS ÚTEIS','TODO PRAZO FINAL','TODO EXECUÇÃO ATRASADA PRAZO HOJE','AÇÃO DO PLANO PAI','AÇÃO DO PLANO FILHO','COBRAR MARIA','ATRIBUIR RESPONSÁVEL'])assert(titles(model.work.today).includes(title),title);
    for(const title of ['TODO ATRASADO','TODO RECORRENTE','AÇÃO ATRASADA','TODO EXECUÇÃO ATRASADA PRAZO HOJE'])assert(titles(model.work.overdue).includes(title),title);
    assert(titles(model.work.upcoming).includes('TODO PRÓXIMA SEMANA'));
    for(const title of ['TODO SEM DATA','AÇÃO SEM DATA'])assert(titles(model.work.undated).includes(title),title);
    assert(titles(model.work.blocked).includes('AÇÃO BLOQUEADA'));
    const workRows=[...new Map(Object.values(model.work).flat().map(r=>[r.key,r])).values()];
    assert.equal(workRows.filter(r=>r.title==='ASSUNTO COM MESMO NOME').length,2,'Unlinked equal titles must remain separate');
    for(const title of ['TODO JÁ CONCLUÍDO','TODO CANCELADO','TODO EM RESERVA','AÇÃO JÁ CONCLUÍDA','AÇÃO CANCELADA'])assert(!titles(workRows).includes(title),title);
    for(const title of ['AÇÃO DO PLANO PAI','AÇÃO DO PLANO FILHO','AÇÃO COMPARTILHADA'])assert.equal(workRows.find(r=>r.title===title).audience,'mine',title);
    for(const title of ['COBRAR MARIA','COBRAR BRUNO SILVA'])assert.equal(workRows.find(r=>r.title===title).audience,'followup',title);
    assert.equal(workRows.find(r=>r.title==='ATRIBUIR RESPONSÁVEL').audience,'unassigned');
    const deferred=workRows.find(r=>r.title==='TODO ADIADO EM DIAS ÚTEIS');assert.equal(deferred.date,reference);
    assert.equal(workRows.find(r=>r.title==='TODO RECORRENTE').date,'2026-10-06');
    assert(model.schedule.starting.some(r=>r.title==='ATIVIDADE INICIA HOJE'));
    assert(model.schedule.finishing.some(r=>r.title==='ATIVIDADE TERMINA HOJE'));
    assert(model.schedule.ongoing.length>=50);
    assert(!Object.values(model.schedule).flat().some(r=>['RESUMO RECOLHIDO','ATIVIDADE JÁ CONCLUÍDA','PREDECESSORA'].includes(r.title)));
    assert.equal(await panel.locator('[data-my-day-item][data-source="gantt"]').count(),0,'Large ongoing schedules stay separate until opened');
    await scope('today');
    assert(await item('TODO DO DIA','todo').isVisible());
    assert(await item('AÇÃO DO PLANO FILHO','action').isVisible());
    assert((await panel.innerText()).includes('Subplano técnico'));
    await page.screenshot({path:'/tmp/my-day-desktop.png',fullPage:true});
    assert(await page.locator('[data-md-schedule="starting"]').isVisible());
    await page.locator('[data-md-schedule="ongoing"]').click();
    assert(await panel.locator('[data-my-day-item][data-source="gantt"]').count()<=20,'Large schedules use bounded pages');
    await scheduleItem('EM ANDAMENTO VOLUME 50');
    await page.locator('#mdScheduleProject').selectOption('one');
    assert.equal(await panel.locator('[data-my-day-item][data-source="gantt"]').filter({hasText:'EM ANDAMENTO VOLUME'}).count(),0);
    assert(await item('ATIVIDADE EM EXECUÇÃO','gantt').isVisible());
    await item('ATIVIDADE EM EXECUÇÃO','gantt').locator('[data-md-open]').click();
    assert.equal(await page.evaluate(()=>activeProjectId),'one');
    assert(await page.locator('.tr[data-id="ongoing"]').isVisible(),'Opening an original task unfolds its hidden ancestor');
    assert(await page.locator('.tr[data-id="ongoing"]').evaluate(el=>el.classList.contains('sel')));
    await page.click('#tabMyDay');
    await page.locator('#mdScheduleProject').selectOption('');
    await page.locator('#mdScheduleSearch').fill('VOLUME 50');
    await page.waitForFunction(()=>document.querySelectorAll('#myDayPanel [data-my-day-item][data-source="gantt"]').length===1);
    assert.equal(await panel.locator('[data-my-day-item][data-source="gantt"]').count(),1);
    await page.locator('#mdScheduleSearch').fill('');
    await page.waitForFunction(()=>document.querySelectorAll('#myDayPanel [data-my-day-item][data-source="gantt"]').length===20);

    // Edit child action with duplicated IDs while its parent is the active source scope.
    await scope('today');await edit('AÇÃO DO PLANO FILHO','action');
    await page.locator('#mdEditTitle').fill('AÇÃO FILHO ALTERADA');
    await page.locator('#mdEditOwner').fill('Bruno Souza');
    await page.locator('#mdEditNotes').fill('Atualizada no painel');await saveEdit();
    const planEdit=await page.evaluate(()=>ActionPlans.exportData());
    assert.equal(planEdit.find(p=>p.id==='parent').actions.find(a=>a.id==='same').title,'AÇÃO DO PLANO PAI');
    assert.equal(planEdit.find(p=>p.id==='child').actions.find(a=>a.id==='same').notes,'Atualizada no painel');
    await item('AÇÃO FILHO ALTERADA','action').locator('[data-md-open]').click();
    assert.equal(await page.locator('#tabActions').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#apPlanSelect').inputValue(),'child');
    assert(await page.locator('[data-plan-id="child"][data-action-id="same"]').isVisible());
    await page.click('#tabMyDay');await scope('today');

    // Invalid linked date must leave both sources unchanged; valid date recalculates safely.
    const linkedBefore=await page.evaluate(()=>({action:ActionPlans.exportData().find(p=>p.id==='child').actions.find(a=>a.id==='linked'),task:actionTask('two','dependent')}));
    await edit('AÇÃO COM DEPENDÊNCIA','action');
    await page.locator('#mdEditEnd').fill('2026-10-07');await page.locator('#mdEditSave').click();
    assert(await page.locator('#mdEditor').isVisible());
    assert.equal(await page.evaluate(()=>ActionPlans.exportData().find(p=>p.id==='child').actions.find(a=>a.id==='linked').end),linkedBefore.action.end);
    await page.locator('#mdEditEnd').fill('2026-10-09');await saveEdit();
    const linkedAfter=await page.evaluate(()=>({action:ActionPlans.exportData().find(p=>p.id==='child').actions.find(a=>a.id==='linked'),task:actionTask('two','dependent')}));
    assert.equal(linkedAfter.action.start,reference);assert.equal(linkedAfter.task.start,reference);
    assert.equal(linkedAfter.action.end,linkedAfter.task.end);assert.equal(linkedAfter.task.end,'2026-10-09');
    assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='two').tasks.find(t=>t.id==='dependent').pred),'1FS');
    await scope('upcoming');
    await item('AÇÃO COM DEPENDÊNCIA','action').locator('[data-md-complete]').click();
    assert.equal(await page.evaluate(()=>ActionPlans.exportData().find(p=>p.id==='child').actions.find(a=>a.id==='linked').status),'done');
    assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='two').tasks.find(t=>t.id==='dependent').pct),0,'A linked action status must not invent schedule progress');
    assert(await item('AÇÃO COM DEPENDÊNCIA','action').isVisible());
    await page.locator('#mdRefresh').click();await scope('today');

    // Changing a postponed Todo date updates the real record and clears its old offset.
    await edit('TODO ADIADO EM DIAS ÚTEIS','todo');
    await page.locator('#mdEditDate').fill('2026-10-09');await page.locator('#mdEditDeadline').fill('2026-10-13');await saveEdit();
    await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentWindow.TaskMaster.snapshot().tasks.find(t=>t.id==='deferred').date==='2026-10-09');
    const changedTodo=await page.evaluate(()=>NativeTodo.snapshot().tasks.find(t=>t.id==='deferred'));
    assert.equal(changedTodo.date,'2026-10-09');assert.equal(changedTodo.deadline,'2026-10-13');assert.equal(changedTodo.deferBusinessDays,0);
    assert.equal(changedTodo.notes,'Observação preservada');assert.deepEqual(changedTodo.metadata,{test:'retained'});
    await page.click('#tabTodoNative');
    const native=page.frameLocator('#todoNativeFrame');
    await native.getByRole('heading',{name:'TODO ADIADO EM DIAS ÚTEIS',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.getElementById('todoNativeFrame').contentWindow.TaskMaster.snapshot().tasks.find(t=>t.id==='deferred').date),'2026-10-09');
    await page.click('#tabMyDay');await scope('today');

    // An old native task form cannot later save over a dashboard edit of that same record.
    await item('TODO PRAZO FINAL','todo').locator('[data-md-open]').click();
    await native.locator('form input[type="text"]').first().fill('RASCUNHO NÃO SALVO');
    await page.click('#tabMyDay');await edit('TODO PRAZO FINAL','todo');
    await page.locator('#mdEditTitle').fill('TODO PRAZO ATUALIZADO');await saveEdit();
    await page.click('#tabTodoNative');
    await native.getByRole('heading',{name:'TODO PRAZO ATUALIZADO',exact:true}).waitFor();
    assert.equal(await native.locator('form').count(),0,'A stale native editor must close after the source changes elsewhere');
    assert.equal(await page.evaluate(()=>NativeTodo.snapshot().tasks.find(t=>t.id==='deadline').title),'TODO PRAZO ATUALIZADO');
    await page.click('#tabMyDay');await scope('today');

    await item('TODO DO DIA','todo').locator('[data-md-open]').click();
    assert.equal(await page.locator('#tabTodoNative').getAttribute('aria-selected'),'true');
    assert.equal(await native.locator('form input[type="text"]').first().inputValue(),'TODO DO DIA');
    await native.getByRole('button',{name:'Cancelar',exact:true}).click();
    await page.click('#tabMyDay');await scope('today');

    await item('TODO DO DIA','todo').locator('[data-md-complete]').click();
    assert.equal(await page.evaluate(()=>NativeTodo.snapshot().tasks.find(t=>t.id==='today').status),'Concluída');
    assert(await item('TODO DO DIA','todo').isVisible());assert(await item('TODO DO DIA','todo').evaluate(el=>el.classList.contains('md-retained')));
    await item('AÇÃO DO PLANO PAI','action').locator('[data-md-complete]').click();
    assert.equal(await page.evaluate(()=>ActionPlans.exportData().find(p=>p.id==='parent').actions.find(a=>a.id==='same').status),'done');
    assert(await item('AÇÃO DO PLANO PAI','action').isVisible());
    await page.locator('#mdRefresh').click();
    assert.equal(await item('TODO DO DIA','todo').count(),0);assert.equal(await item('AÇÃO DO PLANO PAI','action').count(),0);
    await scope('overdue');
    assert(await item('TODO RECORRENTE','todo').isVisible());
    assert.equal(await item('TODO RECORRENTE','todo').locator('[data-md-advance]').count(),1);
    await item('TODO RECORRENTE','todo').locator('[data-md-advance]').click();
    assert.equal(await page.evaluate(()=>NativeTodo.snapshot().tasks.find(t=>t.id==='recurring').date),'2026-10-07');

    // Schedule edits and navigation target the exact schedule, including repeated task IDs.
    await page.locator('[data-md-schedule="starting"]').click();
    await edit('OUTRO CRONOGRAMA MESMO ID','gantt');
    await page.locator('#mdEditPct').fill('55');await saveEdit();
    assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='outside').tasks.find(t=>t.id==='start').pct),55);
    assert.equal(await page.evaluate(()=>projects.find(p=>p.id==='one').tasks.find(t=>t.id==='start').pct),0);
    const atomic=await page.evaluate(()=>{
      const record=()=>JSON.stringify(projects.find(p=>p.id==='outside').tasks.find(t=>t.id==='start'));
      const before=record();let rejected=false;
      try{MyDayData.update({source:'gantt',projectId:'outside',id:'start'},{title:'EDIÇÃO INVÁLIDA PARCIAL',start:'2026-10-08',end:'2026-10-07',pct:80})}catch{rejected=true}
      return {rejected,unchanged:record()===before};
    });
    assert(atomic.rejected);assert(atomic.unchanged,'A rejected date cannot partially change the task title or progress');
    await edit('MARCO DO DIA','gantt');
    await page.locator('#mdEditStart').fill('2026-10-09');await saveEdit();
    const milestone=await page.evaluate(()=>projects.find(p=>p.id==='outside').tasks.find(t=>t.id==='milestone'));
    assert.equal(milestone.start,'2026-10-09');assert.equal(milestone.end,milestone.start);assert.equal(milestone.dur,0);
    await item('OUTRO CRONOGRAMA MESMO ID','gantt').locator('[data-md-open]').click();
    assert.equal(await page.evaluate(()=>activeProjectId),'outside');
    assert.equal(await page.locator('#tabGantt').getAttribute('aria-selected'),'true');
    assert(await page.locator('.tr[data-id="start"]').evaluate(el=>el.classList.contains('sel')));
    await page.click('#tabMyDay');

    const saved=await page.evaluate(()=>({todo:NativeTodo.snapshot(),plans:ActionPlans.exportData(),projects:projects.map(p=>({id:p.id,tasks:p.tasks}))}));
    await page.reload();await page.click('#tabMyDay');
    await page.locator('#mdDate').fill(reference);await page.locator('#mdDate').dispatchEvent('change');
    assert.deepEqual(await page.evaluate(()=>({todo:NativeTodo.snapshot(),plans:ActionPlans.exportData(),projects:projects.map(p=>({id:p.id,tasks:p.tasks}))})),saved);
    await scope('today');assert.equal(await item('TODO DO DIA','todo').count(),0);
    await page.locator('#mdSearch').fill('ASSUNTO COM MESMO NOME');
    await page.waitForFunction(()=>document.querySelectorAll('#myDayPanel [data-my-day-item][data-source="todo"]').length===1&&document.querySelectorAll('#myDayPanel [data-my-day-item][data-source="action"]').length===1);
    assert.equal(await panel.locator('[data-my-day-item][data-source="todo"]').count(),1);
    assert.equal(await panel.locator('[data-my-day-item][data-source="action"]').count(),1);
    await page.locator('#mdSource').selectOption('todo');
    assert.equal(await panel.locator('[data-my-day-item][data-source="action"]').count(),0);
    await page.locator('#mdSource').selectOption('all');await page.locator('#mdSearch').fill('');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    await page.locator('[data-md-schedule="ongoing"]').click();
    await scheduleItem('EM ANDAMENTO VOLUME 50');
    await item('EM ANDAMENTO VOLUME 50','gantt').scrollIntoViewIfNeeded();
    assert(await item('EM ANDAMENTO VOLUME 50','gantt').isVisible());
    await page.screenshot({path:'/tmp/my-day-mobile.png'});
    assert.equal(await page.locator('#todoFrame').getAttribute('src'),originalGoogle);

    const full=await page.evaluate(()=>WorkspaceBackup.snapshot());
    const mobile=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    mobile.on('pageerror',e=>errors.push(e.message));await mobile.route('https://script.google.com/**',r=>r.abort());
    await mobile.addInitScript(data=>{
      if(window!==window.top)return;
      localStorage.setItem('pf_projects_v1',JSON.stringify({version:1,activeProjectId:data.activeProjectId,projects:data.projects,actionPlans:data.actionPlans}));
      localStorage.setItem('pf_todo_v1',JSON.stringify(data.todo));
    },full);
    await mobile.goto(url);await mobile.locator('#tabMyDay').tap();
    await mobile.locator('#mdDate').fill(reference);await mobile.locator('#mdDate').dispatchEvent('change');
    await mobile.locator('[data-md-schedule="ongoing"]').tap();
    while(await mobile.locator('[data-my-day-item][data-source="gantt"]').filter({hasText:'EM ANDAMENTO VOLUME 50'}).count()===0){
      const next=mobile.locator('[data-md-page="1"]');assert(await next.isEnabled());await next.tap();
    }
    await mobile.locator('[data-my-day-item][data-source="gantt"]').filter({hasText:'EM ANDAMENTO VOLUME 50'}).scrollIntoViewIfNeeded();
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
    assert(await mobile.evaluate(()=>window.scrollY>0),'Touch devices scroll the whole daily dashboard');
    await mobile.screenshot({path:'/tmp/my-day-touch-mobile.png'});await mobile.close();

    // Every work item must remain reachable when an unusually large daily queue is paginated.
    const bulk=Array.from({length:65},(_,i)=>task('bulk-'+i,'PAGINAÇÃO TODO '+String(i+1).padStart(2,'0')));
    await page.evaluate(data=>NativeTodo.restoreData({tasks:data,settings:NativeTodo.snapshot().settings}),bulk);
    await page.setViewportSize({width:1400,height:1000});await page.locator('#mdRefresh').click();await scope('today');
    await page.locator('#mdSource').selectOption('todo');
    const seen=new Set();
    for(let n=0;n<4;n++){
      const visible=await panel.locator('[data-my-day-item][data-source="todo"] h4').allTextContents();
      assert(visible.length>0&&visible.length<=20);visible.forEach(title=>seen.add(title));
      const next=panel.locator('[data-md-work-page="mine"][data-step="1"]');
      if(n<3){assert(await next.isEnabled());await next.click()}else assert(await next.isDisabled());
    }
    assert.equal(seen.size,65);assert(seen.has('PAGINAÇÃO TODO 65'));

    // All cloud traffic is intercepted. Editing remains local until the explicit source save.
    const files={
      'cronogramas.json':{version:1,activeProjectId:full.activeProjectId,projects:full.projects},
      'planos-de-acao.json':{version:1,type:'action-plans',actionPlans:full.actionPlans},
      'todo.json':full.todo
    },shas=Object.fromEntries(Object.keys(files).map(file=>[file,'initial-'+file])),puts=[],gets=[],cloud=await browser.newPage({viewport:{width:1400,height:1000}});
    let failCloud=false;
    cloud.setDefaultTimeout(15000);cloud.on('pageerror',e=>errors.push(e.message));cloud.on('dialog',dialog=>dialog.accept());
    await cloud.route('https://script.google.com/**',r=>r.abort());
    await cloud.addInitScript(()=>{
      if(window!==window.top)return;
      localStorage.setItem('pf_autosave_v1',JSON.stringify({enabled:false}));
      localStorage.setItem('pf_github_backup_v1',JSON.stringify({repo:'test-owner/private-daily-backups',enabled:true}));
      localStorage.setItem('pf_github_backup_v1_token',JSON.stringify('synthetic-test-token'));
    });
    await cloud.route('https://api.github.com/repos/**',async route=>{
      const request=route.request(),pathname=new URL(request.url()).pathname;
      assert.equal(request.headers().authorization,'Bearer synthetic-test-token');
      if(failCloud)return route.fulfill({status:401,json:{}});
      if(!pathname.includes('/contents/'))return route.fulfill({json:{private:true,has_pages:false,default_branch:'main'}});
      const file=pathname.split('/').at(-1);assert(Object.hasOwn(files,file));
      if(request.method()==='PUT'){
        const body=request.postDataJSON();assert.equal(body.sha,shas[file]);
        files[file]=JSON.parse(Buffer.from(body.content,'base64').toString());shas[file]='saved-'+file;puts.push(file);
        assert(!JSON.stringify(files[file]).includes('synthetic-test-token'));
        return route.fulfill({json:{content:{sha:shas[file]}}});
      }
      assert.equal(request.method(),'GET');gets.push(file);
      return route.fulfill({json:{sha:shas[file],content:Buffer.from(JSON.stringify(files[file])).toString('base64')}});
    });
    await cloud.goto(url);await cloud.waitForFunction(()=>!document.getElementById('app').inert);
    await cloud.waitForFunction(()=>document.getElementById('ntCloudStatus').textContent.includes('Última versão do Todo aberta'));
    assert(gets.includes('todo.json'),'The default Meu dia must load the native Task cloud scope without switching tabs');
    await cloud.locator('#mdDate').fill(reference);await cloud.locator('#mdDate').dispatchEvent('change');
    assert.equal(puts.length,0);
    const cloudItem=cloud.locator('[data-my-day-item][data-source="todo"]').filter({hasText:'ASSUNTO COM MESMO NOME'}).first();
    await cloudItem.locator('[data-md-edit]').click();await cloud.locator('#mdEditTitle').fill('TODO SALVO PELO PAINEL');
    await cloud.locator('#mdEditSave').click();await cloud.locator('#mdEditor').waitFor({state:'hidden'});
    assert.equal(puts.length,0,'Dashboard edits must not silently publish cloud versions');
    await cloud.locator('#mdSave').click();await cloud.locator('[data-md-save-source="todo"]').click();
    await cloud.waitForFunction(()=>document.querySelector('#myDayPanel .md-alert')?.textContent.includes('Todo salvo no GitHub'));
    assert.deepEqual(puts,['todo.json']);assert(files['todo.json'].tasks.some(t=>t.title==='TODO SALVO PELO PAINEL'));
    failCloud=true;await cloud.locator('#mdSave').click();await cloud.locator('[data-md-save-source="todo"]').click();
    await cloud.waitForFunction(()=>document.querySelector('#myDayPanel .md-alert')?.textContent.includes('Token inválido'));
    assert.deepEqual(puts,['todo.json']);assert(await cloud.locator('#myDayPanel .md-alert-error').isVisible(),'A failed source save must be shown as a failure');
    assert.equal(await cloud.evaluate(()=>NativeTodo.snapshot().tasks.find(t=>t.id==='same-title').title),'TODO SALVO PELO PAINEL');
    await cloud.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: Meu dia cross-source rules, names/ownership, effective Todo dates/recurrence, linked constraints and atomic/milestone edits, large schedule/work pagination, source-scoped edits/navigation, mounted iframe revision/stale editor, completion retention/refresh, persistence, filters, real touch scrolling and explicit scoped cloud save/failure feedback');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
