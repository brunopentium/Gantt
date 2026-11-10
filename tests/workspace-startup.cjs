/* Execute the complete startup with isolated DOM/storage, never a user's browser or cloud. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const date='2026-11-10';
const schedules={version:1,activeProjectId:'schedule',projects:[{id:'schedule',title:'Synthetic schedule',tasks:[{id:'task',name:'Synthetic activity',indent:0,pred:'',dur:1,pct:20,unit:'bd',start:date,end:date,color:'#4a9eff'}],view:{theme:'light'}}],actionPlans:[]};
const todo={version:1,type:'todo',tasks:[],settings:{projects:['Synthetic'],config:{}}};
const notes={version:1,type:'notes',nodes:[]};
async function startup(mode,failure){
 const healthFault=['quota','notes-corrupt','assistant-failed'].includes(failure);
 const errors=[],requests=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const prefix=mode==='personal'?'pf_personal__':'',other=mode==='personal'?'':'pf_personal__';
 const dom=new JSDOM(html,{url:'https://startup.test/',pretendToBeVisual:true,runScripts:'outside-only',virtualConsole:vc,beforeParse(w){
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLElement.prototype.scrollIntoView=function(){};w.scrollTo=()=>{};w.alert=()=>{};w.confirm=()=>false;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.CSS={escape:s=>s};
  for(const name of ['show','showModal'])w.HTMLDialogElement.prototype[name]=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.fetch=async url=>{requests.push(url);if(String(url).endsWith('/chat/config'))return {ok:true,json:async()=>({enabled:false,models:[],workspaces:['work','personal']})};throw Error('Unexpected network request')};
  w.AbortSignal.timeout=()=>new w.AbortController().signal;
  w.localStorage.setItem('pf_workspace_active_v1',mode);if(mode==='personal')w.localStorage.setItem('pf_personal_session_v1','a'.repeat(64));
  w.localStorage.setItem('pf_pwa_install_choice_v1','no');w.localStorage.setItem(prefix+'pf_github_backup_v1_token','synthetic-secret-never-export');
  const fixture=JSON.parse(JSON.stringify(schedules));if(failure==='dependency-cycle'){fixture.projects[0].tasks=[{...fixture.projects[0].tasks[0],pred:'2FS'},{...fixture.projects[0].tasks[0],id:'second',name:'Second',pred:'1FS',pct:60},{...fixture.projects[0].tasks[0],id:'independent',name:'Independent',pred:''}];}
  for(const [key,value]of Object.entries({pf_projects_v1:fixture,pf_todo_v1:todo,pf_notes_v1:notes}))w.localStorage.setItem(prefix+key,JSON.stringify(value));
  w.localStorage.setItem(other+'pf_notes_v1','other-workspace-must-stay-untouched');
  if(failure==='notes-corrupt')w.localStorage.setItem(prefix+'pf_notes_v1','{unreadable-original-notes');
  if(failure==='quota'){const original=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){if(this===w.localStorage)throw new w.DOMException('Quota exceeded','QuotaExceededError');return original.call(this,key,value)}}
 }});
 const w=dom.window,originalNotes=w.localStorage.getItem(prefix+'pf_notes_v1'),originalSchedule=w.localStorage.getItem(prefix+'pf_projects_v1');
 let current=null;Object.defineProperty(w.document,'currentScript',{get:()=>current});
 for(const script of [...w.document.scripts]){current=script;const src=script.getAttribute('src');if(src?.startsWith('pwa-install'))continue;if(!src&&script.textContent.includes('// ========== STATE')&&failure==='assistant-failed')w.MyDayChat.init=()=>{throw Error('Synthetic failed component')};try{w.eval(src?fs.readFileSync(path.join(root,src.split('?')[0]),'utf8'):script.textContent)}catch(e){errors.push(e.message)}}
 await new Promise(r=>setTimeout(r,10));
 try{
  assert.deepEqual(errors,[],mode+' '+failure);assert.equal(w.WorkspaceProfile.mode,mode);assert.equal(w.document.documentElement.dataset.appView,'my-day');
  assert(w.document.getElementById('mdDate'));assert.equal(w.document.getElementById('myDayPanel').hidden,false);assert.equal(w.document.getElementById('tabMyDay').getAttribute('aria-selected'),'true');
  assert.notEqual(w.document.getElementById('autosaveStatus').textContent,'Abrindo dados…');
  assert.equal(w.localStorage.getItem(other+'pf_notes_v1'),'other-workspace-must-stay-untouched');assert.equal(w.localStorage.getItem(prefix+'pf_notes_v1'),originalNotes);
  if(failure==='quota')assert.equal(w.localStorage.getItem(prefix+'pf_projects_v1'),originalSchedule);
  if(healthFault){assert(w.document.getElementById('workspaceStartupNotice'));assert.equal(w.document.getElementById('autosaveStatus').dataset.state,'blocked');}
  else assert.equal(w.document.getElementById('workspaceStartupNotice'),null);
  for(const id of ['tabGantt','tabActions','tabTodoNative','tabMyDay']){w.document.getElementById(id).click();assert.equal(w.document.getElementById(id).getAttribute('aria-selected'),'true');}
  if(failure==='notes-corrupt'){w.document.getElementById('tabNotes').click();assert.match(w.document.getElementById('notesPanel').textContent,/Não foi possível abrir/);w.document.getElementById('tabMyDay').click();assert.equal(w.document.documentElement.dataset.appView,'my-day');assert.throws(()=>w.NotesData.snapshot());assert(w.WorkspaceAutosave.state().areas.find(a=>a.source==='notes').blocked);}
  if(failure==='dependency-cycle'){
   const original=JSON.parse(originalSchedule).projects[0].tasks,saved=JSON.parse(w.localStorage.getItem(prefix+'pf_projects_v1')).projects[0].tasks;
   for(let i=0;i<original.length;i++)for(const key of ['id','name','start','end','dur','pct','pred','color'])assert.equal(saved[i][key],original[i][key]);
   assert.match(w.document.getElementById('scheduleDependencyNotice').textContent,/1 → 2 → 1/);assert(w.GanttBackup.state().blocked);
   w.document.querySelector('#scheduleDependencyNotice button').click();let editor=w.document.querySelector('.cedit');assert.equal(editor.value,'2FS');
   editor.value='';editor.dispatchEvent(new w.Event('input'));editor.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   assert.equal(w.document.getElementById('scheduleDependencyNotice'),null);assert.equal(w.GanttBackup.state().blocked,false);
   const cell=w.document.querySelector('.tc[data-field="pred"][data-id="task"]');cell.click();editor=w.document.querySelector('.cedit');editor.value='2FS';editor.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   assert.match(editor.validationMessage,/circular/);assert.equal(JSON.parse(w.localStorage.getItem(prefix+'pf_projects_v1')).projects[0].tasks[0].pred,'');editor.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  }
  // Raw recovery export includes only this workspace's data records, never cloud metadata/tokens.
  let blob;w.URL.createObjectURL=value=>{blob=value;return 'blob:synthetic'};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
  if(healthFault){w.document.getElementById('workspaceStartupNotice').querySelectorAll('button')[1].click();assert(blob);const text=await new Promise(resolve=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob)}),copy=JSON.parse(text);assert(!text.includes('synthetic-secret-never-export'));assert.equal(copy.workspace,mode);assert.equal(copy.records.pf_notes_v1,originalNotes);assert.deepEqual(Object.keys(copy.records).sort(),['pf_notes_v1','pf_projects_v1','pf_todo_v1']);}
  assert(requests.every(url=>!String(url).includes('api.github.com')));assert.deepEqual(errors,[]);
 }finally{await new Promise(resolve=>setTimeout(resolve,20));w.close()}
}
(async()=>{for(const mode of ['work','personal'])for(const failure of ['none','quota','notes-corrupt','assistant-failed','dependency-cycle'])await startup(mode,failure);console.log('PASS: full startup in work/personal, quota and invalid Notes; consistent tabs, blocked failing area, preserved source bytes and scoped credential-free recovery export.');})().catch(error=>{console.error(error);process.exitCode=1});
