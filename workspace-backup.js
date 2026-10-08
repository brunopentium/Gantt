/* One portable, credential-free archive for all three native data areas. */
window.WorkspaceBackup=(()=>{
  let api;
  function init(adapter){api=adapter}
  function snapshot(){
    api.flush();window.NativeTodo.flush();
    return {version:1,type:'projectflow-backup',exportedAt:new Date().toISOString(),...api.snapshot(),actionPlans:window.ActionPlans.exportData(),todo:window.NativeTodo.snapshot()};
  }
  function validate(data){
    if(data?.version!==1||data.type!=='projectflow-backup'||!Array.isArray(data.projects)||!data.projects.length||!Array.isArray(data.actionPlans))throw new Error('Backup geral inválido.');
    window.ScheduleGroups.validate(data.projects);
    window.ActionPlans.validate(data.actionPlans);
    window.NativeTodo.validate(data.todo);
    for(const project of data.projects){
      if(!project||typeof project.title!=='string'||!Array.isArray(project.tasks))throw new Error('Cronograma inválido.');
      const ids=new Set();
      for(const task of project.tasks){
        if(!task||typeof task.id!=='string'||ids.has(task.id)||typeof task.name!=='string'||!Number.isFinite(task.indent)||task.indent<0||task.indent>100||typeof task.pred!=='string'||!Number.isFinite(task.dur)||task.dur<0||!Number.isFinite(task.pct)||task.pct<0||task.pct>100)throw new Error('Tarefa inválida no cronograma.');
        ids.add(task.id);
        for(const field of ['start','end'])if(task[field]!=null&&task[field]!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(task[field]))throw new Error('Data inválida no cronograma.');
      }
      const visiting=new Set(),done=new Set();
      function visit(i){
        if(done.has(i))return;if(visiting.has(i))throw new Error('Dependências circulares no cronograma.');visiting.add(i);
        for(const part of project.tasks[i].pred.split(/[;,]/)){const m=part.trim().match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\d+)?d?\s*$/i);if(m&&project.tasks[+m[1]-1])visit(+m[1]-1)}
        visiting.delete(i);done.add(i);
      }
      project.tasks.forEach((_,i)=>visit(i));
    }
  }
  function exportAll(){downloadJSON(snapshot(),'projectflow-backup-geral-'+new Date().toISOString().slice(0,10)+'.json')}
  function content(data){
    const copy=JSON.parse(JSON.stringify(data));delete copy.exportedAt;
    for(const project of copy.projects)delete project.updatedAt;
    return JSON.stringify(copy);
  }
  async function restore(raw,{reason='Antes de restaurar o backup geral'}={}){
    const data=JSON.parse(JSON.stringify(raw));validate(data);
    if(!confirm('Restaurar cronogramas, planos de ação e Task deste backup? Uma cópia interna dos dados atuais será guardada no Histórico de recuperação antes.'))return false;
    const autosave=window.WorkspaceAutosave;
    if(autosave)await autosave.suspend();
    try{
      if(autosave?.state().areas.some(area=>area.busy))throw new Error('Aguarde a sincronização antes de restaurar.');
      const id=await window.LocalRecovery.capture({reason,scope:'all'}),previous=await window.LocalRecovery.get(id);
      if(!previous)throw new Error('A cópia de segurança não está disponível. A restauração foi cancelada.');
      if(content(previous)!==content(snapshot()))throw new Error('Os dados foram alterados enquanto a cópia de segurança era guardada. A restauração foi cancelada; tente novamente.');
      try{api.restore(data);window.NativeTodo.restoreData(data.todo)}
      catch(error){
        // Validation runs before mutation; a persistence failure still has a full safety copy.
        try{api.restore(previous);window.NativeTodo.restoreData(previous.todo)}catch{}
        throw new Error('Não foi possível concluir a restauração. Os dados anteriores estão no Histórico de recuperação. '+error.message);
      }
      return true;
    }finally{if(autosave)autosave.resume()}
  }
  function importFile(){
    const input=document.createElement('input');input.type='file';input.accept='.json';
    input.onchange=async()=>{try{if(input.files[0])await restore(JSON.parse(await input.files[0].text()))}catch(error){alert('Backup não restaurado: '+error.message)}};input.click();
  }
  return {init,snapshot,validate,exportAll,restore,importFile};
})();
