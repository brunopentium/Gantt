/* The integrated TaskMaster owns its data; the Google Todo remains separate. */
window.NativeTodo=(()=>{
  'use strict';
  const KEY='pf_todo_v1', listeners=new Set();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const empty=()=>({tasks:[],settings:{projects:['R&D','Pessoal','Trabalho'],config:{}}});
  let state=empty(),loadError='',hasLocalData=false,revision=0;
  function validate(data){
    if(!data||!Array.isArray(data.tasks)||!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings))throw new Error('Backup do Todo inválido.');
    const ids=new Set();
    for(const task of data.tasks){
      if(!task||!['string','number'].includes(typeof task.id)||!String(task.id)||ids.has(String(task.id))||typeof task.title!=='string')throw new Error('Tarefa ou ID inválido no Todo.');
      ids.add(String(task.id));
      for(const field of ['date','deadline'])if(task[field]!=null&&task[field]!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(task[field])||!Number.isFinite(Date.parse(task[field]))))throw new Error('Data inválida no Todo.');
      for(const field of ['status','project','notes'])if(task[field]!=null&&typeof task[field]!=='string')throw new Error('Texto inválido no Todo.');
      for(const field of ['priority','difficulty'])if(task[field]!=null&&(!Number.isFinite(Number(task[field]))||Number(task[field])<1||Number(task[field])>5))throw new Error('Prioridade ou dificuldade inválida no Todo.');
      if(task.tags!=null&&(!Array.isArray(task.tags)||task.tags.some(t=>typeof t!=='string')))throw new Error('Tags inválidas no Todo.');
      if(task.subtasks!=null&&(!Array.isArray(task.subtasks)||task.subtasks.some(s=>!s||typeof s.text!=='string'||typeof s.completed!=='boolean')))throw new Error('Subtarefas inválidas no Todo.');
      for(const field of ['recurrence','metadata'])if(task[field]!=null&&(typeof task[field]!=='object'||Array.isArray(task[field])))throw new Error('Metadados inválidos no Todo.');
      if(task.deferBusinessDays!=null&&(!Number.isFinite(Number(task.deferBusinessDays))||Math.abs(Number(task.deferBusinessDays))>10000))throw new Error('Reagendamento inválido no Todo.');
    }
    if(data.settings.projects!=null&&(!Array.isArray(data.settings.projects)||data.settings.projects.some(p=>typeof p!=='string')))throw new Error('Projetos inválidos no Todo.');
    if(data.settings.config!=null&&(typeof data.settings.config!=='object'||Array.isArray(data.settings.config)))throw new Error('Configurações inválidas no Todo.');
    return data;
  }
  function parseBackup(raw){
    const data=raw?.type==='projectflow-backup'?raw.todo:raw;
    if(!data||!Array.isArray(data.tasks))throw new Error('O arquivo não contém tarefas do Todo.');
    const settings=data.settings||{projects:data.projects||['R&D'],config:data.config||{}};
    return clone(validate({tasks:data.tasks,settings}));
  }
  try{
    const cached=localStorage.getItem(KEY);hasLocalData=cached!==null;
    if(cached)state=parseBackup(JSON.parse(cached));
  }catch(error){loadError='Não foi possível abrir o Todo local: '+error.message}
  function snapshot(){return {version:1,type:'todo',...clone(state)}}
  function data(){if(loadError)throw new Error(loadError);return {...clone(state),_revision:revision}}
  function commit(value){
    if(loadError)throw new Error(loadError);
    // A React render from before an external restore must never write back over it.
    if(value._revision!==undefined&&value._revision!==revision)return;
    const next=clone(validate({tasks:value.tasks,settings:value.settings}));
    if(JSON.stringify(next)===JSON.stringify(state)&&hasLocalData)return;
    localStorage.setItem(KEY,JSON.stringify(next));state=next;hasLocalData=true;
    window.TodoCloud?.changed();
  }
  function flush(){
    const frame=document.getElementById('todoNativeFrame');
    const current=frame.contentWindow?.TaskMaster?.snapshot();
    if(current)commit(current);
  }
  function restoreData(raw){
    const next=parseBackup(raw);
    localStorage.setItem(KEY,JSON.stringify(next));state=next;loadError='';hasLocalData=true;revision++;
    for(const listener of listeners)listener(data());
    window.TodoCloud?.changed();
  }
  function backup(){flush();downloadJSON({...snapshot(),exportedAt:new Date().toISOString()},'todo-backup.json')}
  function init(){
    document.getElementById('ntBackup').onclick=backup;
    document.getElementById('ntBackupAll').onclick=()=>window.WorkspaceBackup.exportAll();
    document.getElementById('ntRestoreAll').onclick=()=>window.WorkspaceBackup.importFile();
  }
  return {init,validate,parseBackup,snapshot,data,commit,flush,restoreData,backup,hasLocalData:()=>hasLocalData,
    subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener)}};
})();
