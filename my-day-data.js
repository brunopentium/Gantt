/* Meu dia reads original records and writes back through each area's own rules. */
window.MyDayData=(()=>{
  'use strict';
  let api=null,unsubscribers=[];
  const listeners=new Set(),clone=value=>JSON.parse(JSON.stringify(value));
  const labels={pending:'Pendente',doing:'Em andamento',done:'Concluída',blocked:'Bloqueada',cancelled:'Cancelada'};
  const todoStatuses=['Em Andamento','Reserva','Recorrente','Concluída','Cancelada'];
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g,' ');
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const date=value=>validDate(value)?value:'';
  function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function addDays(value,days){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
  function businessShift(value,days){
    if(!value)return '';let current=value,remaining=Math.abs(Number(days)||0),direction=Number(days)<0?-1:1;
    if(!Number.isFinite(remaining)||remaining>10000)throw new Error('Reagendamento inválido no Todo.');
    while(remaining>0){current=addDays(current,direction);const weekday=new Date(current+'T12:00:00Z').getUTCDay();if(weekday!==0&&weekday!==6)remaining--}return current;
  }
  function effectiveDate(task){const base=date(task.date);return task.status==='Recorrente'?base:businessShift(base,task.deferBusinessDays)}
  function audience(owner,aliases){
    if(!String(owner||'').trim())return 'unassigned';
    const accepted=new Set((Array.isArray(aliases)?aliases:[aliases]).map(normalize).filter(Boolean));
    return String(owner).split(/[,;\/&+\n]|\s+e\s+/i).some(name=>accepted.has(normalize(name)))?'mine':'followup';
  }
  function key(ref){return JSON.stringify([ref.source,ref.planId||ref.projectId||'',String(ref.id)])}
  function notify(){for(const listener of listeners)listener()}
  function init(adapter){
    unsubscribers.forEach(fn=>fn());unsubscribers=[];api=adapter||{};
    if(window.ActionPlans?.subscribe)unsubscribers.push(window.ActionPlans.subscribe(notify));
    if(window.NativeTodo?.subscribe)unsubscribers.push(window.NativeTodo.subscribe(notify));
    window.addEventListener('projectflow:datachange',notify);unsubscribers.push(()=>window.removeEventListener('projectflow:datachange',notify));
  }
  function flush(){api?.flush?.();window.NativeTodo?.flush()}
  function chain(record,byId){const out=[],seen=new Set();while(record&&!seen.has(record.id)){seen.add(record.id);out.unshift(record);record=byId.get(record.parentId)}return out}
  function base(ref,raw,extra){return {key:key(ref),ref,title:raw.title||raw.name||'Sem título',source:ref.source,sourceLabel:{todo:'Task',action:'Plano de ação',gantt:'Cronograma'}[ref.source],owner:'',audience:'mine',status:'',statusLabel:'',open:true,date:'',deadline:'',start:'',end:'',pct:null,priority:null,notes:raw.notes||'',link:null,path:'',context:'',pathIds:[],raw:clone(raw),flags:{},editableFields:[],...extra}}
  function classify(row,day){
    const dates=[row.date,row.deadline].filter(Boolean),past=dates.filter(d=>d<day).sort(),future=dates.filter(d=>d>day&&d<=addDays(day,7)).sort();
    row.flags={today:dates.includes(day),overdue:past.length>0,upcoming:future.length>0,undated:dates.length===0,blocked:row.status==='blocked',starting:row.start===day,finishing:row.end===day,ongoing:!!(row.start&&row.end&&row.start<=day&&row.end>=day)};
    row.relevantDate=past[0]||(dates.includes(day)?day:future[0])||dates.slice().sort()[0]||'';
    row.overdueDays=past.length?Math.round((Date.parse(day+'T12:00:00Z')-Date.parse(past[0]+'T12:00:00Z'))/86400000):0;
    row.todayReasons=[row.date===day?(row.source==='todo'?'Execução hoje':'Vence hoje'):'',row.deadline===day?'Prazo final hoje':''].filter(Boolean);
    row.bucket=row.flags.overdue?'overdue':row.flags.today?'today':row.flags.upcoming?'upcoming':row.flags.undated?'undated':'later';
    return row;
  }
  function compare(a,b){return (a.relevantDate||'9999').localeCompare(b.relevantDate||'9999')||(Number(a.priority)||99)-(Number(b.priority)||99)||a.title.localeCompare(b.title,'pt-BR')||a.key.localeCompare(b.key)}
  function read(day=today(),aliases=['Bruno','Bruno Souza']){
    if(!validDate(day))throw new Error('Selecione uma data válida para o painel.');
    const rows=[],errors=[];
    let projects=[];try{projects=api?.projects?.()||[]}catch(e){errors.push('Cronogramas: '+e.message)}
    const projectById=new Map(projects.map(p=>[p.id,p]));
    const ganttByKey=new Map();
    for(const project of projects){
      if(project.kind==='group')continue;
      const parents=chain(project,projectById),path=parents.map(p=>p.title).join(' / '),tasks=project.tasks||[];
      for(let index=0;index<tasks.length;index++){
        const task=tasks[index];if(task.summary||(tasks[index+1]&&Number(tasks[index+1].indent)>Number(task.indent)))continue;
        const pct=Math.min(100,Math.max(0,Number(task.pct)||0)),status=pct>=100?'done':pct>0?'doing':'pending',ref={source:'gantt',projectId:project.id,id:String(task.id)};
        const row=classify(base(ref,task,{title:task.name||task.title||'Sem título',path,context:path,pathIds:parents.map(p=>p.id),projectTitle:project.title,start:date(task.start),end:date(task.end),date:date(task.end),pct,status,statusLabel:labels[status],open:pct<100,linkedActionKeys:[],statusOptions:Object.entries(labels).filter(([s])=>['pending','doing','done'].includes(s)).map(([value,label])=>({value,label})),editableFields:['title','pct','notes',...(!task.pred?['start']:[]),...(!task.mile||!task.pred?['end']:[])],startLocked:!!task.pred,endLocked:!!task.mile&&!!task.pred,dateHint:task.pred?'O início segue as dependências do cronograma.':task.mile?'Este marco tem uma única data.':''}),day);
        rows.push(row);ganttByKey.set(row.key,row);
      }
    }
    try{
      // Read calculated linked dates without mutating the source plans or saving.
      const plans=window.ActionPlans?.exportData()||[],byId=new Map(plans.map(p=>[p.id,p]));
      for(const plan of plans){const parents=chain(plan,byId),path=parents.map(p=>p.title).join(' / ');
        for(const action of plan.actions){
          const linkedProject=action.link&&projectById.get(action.link.projectId),linkedTask=linkedProject?.tasks?.find(t=>String(t.id)===String(action.link.taskId));
          const linkedSummary=linkedTask?.summary,ref={source:'action',planId:plan.id,id:String(action.id)},ganttKey=action.link?key({source:'gantt',projectId:action.link.projectId,id:action.link.taskId}):null;
          const start=date(linkedTask?.start||action.start),end=date(linkedTask?.end||action.end);
          const row=classify(base(ref,action,{path,context:path,pathIds:parents.map(p=>p.id),owner:action.owner||'',audience:audience(action.owner,aliases),start,end,date:end,status:action.status,statusLabel:labels[action.status]||action.status,open:!['done','cancelled'].includes(action.status),link:action.link?clone(action.link):null,ganttKey,statusOptions:Object.entries(labels).map(([value,label])=>({value,label})),editableFields:['title','owner','status','notes',...(!linkedSummary&&!linkedTask?.pred?['start']:[]),...(!linkedSummary&&!(linkedTask?.mile&&linkedTask.pred)?['end']:[])],startLocked:!!linkedSummary||!!linkedTask?.pred,endLocked:!!linkedSummary||!!linkedTask?.mile&&!!linkedTask?.pred,dateHint:linkedSummary?'Datas calculadas pelas subtarefas do cronograma.':linkedTask?.pred?'O início segue as dependências do cronograma.':linkedTask?'As datas são compartilhadas com o cronograma.':''}),day);
          rows.push(row);if(ganttKey&&ganttByKey.has(ganttKey))ganttByKey.get(ganttKey).linkedActionKeys.push(row.key);
        }
      }
    }catch(e){errors.push('Planos de ação: '+e.message)}
    try{
      const data=window.NativeTodo?.data();
      for(const task of data?.tasks||[]){
        const statuses=[...todoStatuses];if(task.status&&!statuses.includes(task.status))statuses.unshift(task.status);
        rows.push(classify(base({source:'todo',id:String(task.id)},task,{path:task.project||'Sem projeto',context:task.project||'Sem projeto',date:effectiveDate(task),deadline:date(task.deadline),status:task.status||'Em Andamento',statusLabel:task.status||'Em Andamento',open:!['Concluída','Cancelada','Reserva'].includes(task.status),priority:task.priority??null,statusOptions:statuses.map(value=>({value,label:value})),editableFields:['title','date','deadline','status','priority','notes'],recurring:task.status==='Recorrente',nextOccurrence:nextRecurrence(task,day)}),day));
      }
    }catch(e){errors.push('Task: '+e.message)}
    rows.sort(compare);
    const work={today:[],overdue:[],upcoming:[],undated:[],blocked:[]},schedule={starting:[],finishing:[],ongoing:[],overdue:[]};
    for(const row of rows){
      if(!row.open)continue;
      if(row.source==='gantt'){for(const [name,flag]of Object.entries({starting:'starting',finishing:'finishing',ongoing:'ongoing',overdue:'overdue'}))if(row.flags[flag])schedule[name].push(row)}
      else{
        // Execution and deadline are distinct: an overdue execution can still
        // have a deadline today and must remain discoverable in both views.
        if(row.flags.today)work.today.push(row);
        if(row.flags.overdue)work.overdue.push(row);
        if(!row.flags.today&&!row.flags.overdue&&row.flags.upcoming)work.upcoming.push(row);
        if(row.flags.undated)work.undated.push(row);
        if(row.flags.blocked)work.blocked.push(row);
      }
    }
    const counts=Object.fromEntries(Object.entries(work).map(([name,items])=>[name,items.length]));counts.mineToday=work.today.filter(r=>r.audience==='mine').length;counts.followupToday=work.today.filter(r=>r.audience==='followup').length;counts.unassignedToday=work.today.filter(r=>r.audience==='unassigned').length;
    return {day,rows,work,schedule,counts,errors};
  }
  function nextRecurrence(task,reference=today()){
    const recurrence=task.recurrence||{};if(task.status!=='Recorrente'||!recurrence.frequency||recurrence.frequency==='Nenhuma')return null;
    const base=date(task.date)||reference;
    if(recurrence.frequency==='Diária')return addDays(base,1);
    if(recurrence.frequency==='Semanal'){const days=(recurrence.daysOfWeek||[]).map(Number);for(let offset=1;offset<=14;offset++){const candidate=addDays(base,offset);if(days.includes(new Date(candidate+'T12:00:00Z').getUTCDay()))return candidate}return null}
    if(recurrence.frequency==='Mensal'){
      const days=(recurrence.daysOfMonth||[]).map(Number).filter(d=>d>=1&&d<=31).sort((a,b)=>a-b);if(!days.length)return null;
      const d=new Date(base+'T12:00:00Z'),year=d.getUTCFullYear(),month=d.getUTCMonth(),last=new Date(Date.UTC(year,month+1,0)).getUTCDate(),candidate=days.find(n=>n>d.getUTCDate()&&n<=last);
      if(candidate)return `${String(year).padStart(4,'0')}-${String(month+1).padStart(2,'0')}-${String(candidate).padStart(2,'0')}`;
      const next=new Date(Date.UTC(year,month+1,1)),nextLast=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate(),chosen=days.find(n=>n<=nextLast)||nextLast;return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-${String(chosen).padStart(2,'0')}`;
    }return null;
  }
  function find(ref,day=today()){return read(day).rows.find(row=>row.key===key(ref))}
  function update(ref,patch){
    if(!ref||!['todo','action','gantt'].includes(ref.source))throw new Error('Origem do item inválida.');
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Alteração inválida.');
    flush();
    if(ref.source==='action')window.ActionPlans.updateAction(ref.planId,String(ref.id),patch);
    else if(ref.source==='gantt'){
      const changes={...patch};if(Object.hasOwn(changes,'title')){changes.name=changes.title;delete changes.title}api.updateTask(ref.projectId,String(ref.id),changes);
    }else{
      const allowed=['title','date','deadline','status','priority','notes'];if(Object.keys(patch).some(k=>!allowed.includes(k)))throw new Error('Campo de tarefa inválido.');
      const data=window.NativeTodo.data(),task=data.tasks.find(t=>String(t.id)===String(ref.id));if(!task)throw new Error('A tarefa não está mais disponível.');
      const updated={...task,...patch};
      for(const field of ['title','notes'])if(Object.hasOwn(patch,field)){if(typeof patch[field]!=='string')throw new Error('Texto inválido no Todo.');updated[field]=field==='title'?patch[field].trim():patch[field]}
      if(!updated.title)throw new Error('Informe o título da tarefa.');
      for(const field of ['date','deadline'])if(Object.hasOwn(patch,field)&&patch[field]!==''&&!validDate(patch[field]))throw new Error('Selecione uma data válida.');
      if(Object.hasOwn(patch,'status')&&!todoStatuses.includes(patch.status)&&patch.status!==task.status)throw new Error('Status inválido no Todo.');
      if(Object.hasOwn(patch,'priority')){if(!Number.isInteger(Number(patch.priority))||Number(patch.priority)<1||Number(patch.priority)>5)throw new Error('A prioridade deve estar entre 1 e 5.');updated.priority=Number(patch.priority)}
      if(Object.hasOwn(patch,'date'))updated.deferBusinessDays=0;
      data.tasks=data.tasks.map(t=>String(t.id)===String(ref.id)?updated:t);
      window.NativeTodo.validate(data);window.NativeTodo.restoreData(data);
    }
    notify();return find(ref);
  }
  function complete(ref){flush();const row=find(ref);if(!row)throw new Error('O item não está mais disponível.');if(row.recurring)throw new Error('Use Avançar para registrar a próxima ocorrência desta tarefa recorrente.');return update(ref,ref.source==='todo'?{status:'Concluída'}:ref.source==='action'?{status:'done'}:{pct:100})}
  function advance(ref){
    if(ref.source!=='todo')throw new Error('Este item não é uma tarefa recorrente.');flush();const task=window.NativeTodo.data().tasks.find(t=>String(t.id)===String(ref.id));if(!task)throw new Error('A tarefa não está mais disponível.');const next=nextRecurrence(task);if(!next)throw new Error('Configure a recorrência desta tarefa para avançar.');return update(ref,{date:next});
  }
  function open(ref){
    if(ref.source==='action')window.ActionPlans.openAction(ref.planId,String(ref.id));
    else if(ref.source==='gantt')api.openTask(ref.projectId,String(ref.id));
    else if(ref.source==='todo'){
      window.ActionPlans.switchView('native-todo');const frame=document.getElementById('todoNativeFrame');let attempts=0;
      const reveal=()=>{const app=frame.contentWindow?.TaskMaster;if(app?.openTask){app.openTask(String(ref.id));return}if(attempts++<100)setTimeout(reveal,100)};reveal();
    }
  }
  return {init,read,flush,update,complete,advance,open,key,today,effectiveDate,nextRecurrence,audience,
    subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener)}};
})();
