const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
const today=new Date().toISOString().slice(0,10);
const later=new Date(Date.now()+86400000*14).toISOString().slice(0,10);
const fixture={tasks:[{id:'picker',title:'TESTE CALENDÁRIO',status:'Em Andamento',date:today,deadline:later,project:'R&D',priority:3,difficulty:2,notes:'Preservar',tags:['tag'],subtasks:[],recurrence:{frequency:'Nenhuma',daysOfWeek:[],daysOfMonth:[]}}],settings:{projects:['R&D'],config:{}}};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const mode of ['native','missing','denied']){
   const context=await browser.newContext(mode==='native'?{viewport:{width:390,height:844},hasTouch:true}:{});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://script.google.com/**',r=>r.abort());
   await page.addInitScript(({fixture,mode})=>{
    if(window===window.top&&!localStorage.getItem('pf_todo_v1'))localStorage.setItem('pf_todo_v1',JSON.stringify(fixture));
    window.pickerCalls=[];
    const original=HTMLInputElement.prototype.showPicker;
    if(mode==='missing')HTMLInputElement.prototype.showPicker=undefined;
    else HTMLInputElement.prototype.showPicker=function(){
     window.pickerCalls.push({field:this.dataset.inlineDate,value:this.value,connected:this.isConnected,active:navigator.userActivation.isActive});
     if(mode==='denied')throw new DOMException('Picker unavailable','NotAllowedError');
     return original.call(this);
    };
   },{fixture,mode});
   await page.goto(url);await page.click('#tabTodoNative');
   const frame=page.frameLocator('#todoNativeFrame');
   await frame.getByRole('button',{name:'Nova Tarefa',exact:true}).waitFor();
   await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentWindow.TaskMaster);
   const before=await page.evaluate(()=>NativeTodo.snapshot().tasks);
   for(const [field,label,inputLabel,value] of [['date','Alterar data de execução de TESTE CALENDÁRIO','Data de execução de TESTE CALENDÁRIO',today],['deadline','Alterar deadline de TESTE CALENDÁRIO','Deadline de TESTE CALENDÁRIO',later]]){
    const button=frame.getByRole('button',{name:label,exact:true});
    if(mode==='native')await button.tap();else await button.click();
    const input=frame.getByLabel(inputLabel,{exact:true});await input.waitFor();
    const calls=await page.evaluate(()=>document.getElementById('todoNativeFrame').contentWindow.pickerCalls);
    if(mode!=='missing')assert.deepEqual(calls.at(-1),{field,value,connected:true,active:true});
    assert.deepEqual(await page.evaluate(()=>NativeTodo.snapshot().tasks),before);
    await page.keyboard.press('Escape');
    const changed=field==='date'?later:today;
    await input.fill(changed);
    await page.waitForFunction(({field,changed})=>NativeTodo.snapshot().tasks[0][field]===changed,{field,changed});
    before[0][field]=changed;
   }
   await page.reload();await page.click('#tabTodoNative');
   await page.waitForFunction(()=>document.getElementById('todoNativeFrame').contentWindow.TaskMaster);
   assert.deepEqual(await page.evaluate(()=>NativeTodo.snapshot().tasks),before);
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: first-click execution/deadline native calendar, touch activation, no change on opening, editing/persistence and unsupported/denied picker fallback');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
