import { createHash } from 'node:crypto';
import { IntegrationError } from './store.mjs';
import { validateDocument } from './schemas.mjs';
import { recalculateSchedule } from './schedule.mjs';
import {groupScheduleActivities,moveScheduleActivities,colorScheduleActivities,backgroundScheduleRows} from './schedule-structure.mjs';
export const planningAreas={create_action_plan:'plans',update_action_plan:'plans',create_action:'plans',create_schedule:'schedules',update_schedule:'schedules',create_schedule_activity:'schedules',update_schedule_activity:'schedules',group_schedule_activities:'schedules',move_schedule_activities:'schedules',set_schedule_activity_colors:'schedules',set_schedule_row_background:'schedules'};
const fail=(code,message)=>{throw new IntegrationError(code,message);};
const own=(o,k)=>Object.hasOwn(o,k);
function parent(records,id,parentId){
  const seen=new Set([id]);let current=parentId;
  while(current){if(seen.has(current))fail('invalid_parent','Um item não pode ficar dentro de si mesmo ou de seus descendentes.');seen.add(current);const p=records.find(r=>r.id===current);if(!p)fail('not_found','O pai informado não existe.');current=p.parentId;}
}
function creation(records,input,prefix,payload){
  const id='agent-'+prefix+'-'+createHash('sha256').update(input.workspace+':'+input.requestId).digest('hex').slice(0,24);
  const fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex'),existing=records.find(r=>r.id===id);
  if(existing&&existing.metadata?.integrationFingerprint!==fingerprint)fail('request_id_reused','Este pedido de criação já foi usado com outros dados.');
  return {id,existing,metadata:{integrationFingerprint:fingerprint}};
}
export async function executePlanning(store,name,input){
  const area=planningAreas[name],snapshot=await store.read(area,input.workspace);
  if(snapshot.version!==input.expectedVersion)fail('version_conflict','A versão mudou. Consulte novamente e revise a proposta.');
  const data=structuredClone(snapshot.data);let result;
  if(area==='plans'){
    const records=data.actionPlans;
    if(name==='create_action_plan'){
      const payload={title:input.title,description:input.description,parentId:input.parentId,document:input.document||{}};
      const c=creation(records,input,'plan',payload);parent(records,c.id,input.parentId);
      const plan=c.existing||{id:c.id,...payload,source:null,actions:[],metadata:c.metadata};if(!c.existing)records.push(plan);result={plan:{...plan,source:'plan'}};
    }else if(name==='update_action_plan'){
      const plan=records.find(p=>p.id===input.id);if(!plan)fail('not_found','Plano não encontrado.');
      if(own(input.patch,'parentId'))parent(records,plan.id,input.patch.parentId);
      const {document,...patch}=input.patch;Object.assign(plan,patch);if(document)plan.document={...plan.document,...document};result={plan:{...plan,source:'plan'}};
    }else{
      const plan=records.find(p=>p.id===input.planId);if(!plan)fail('not_found','Plano não encontrado.');
      if(input.start&&input.end&&input.end<input.start)fail('invalid_dates','Fim anterior ao início.');
      const payload={title:input.title,owner:input.owner,start:input.start,end:input.end,status:input.status,notes:input.notes,link:null};
      const c=creation(plan.actions,input,'action',payload),action=c.existing||{id:c.id,...payload,metadata:c.metadata};
      if(!c.existing)plan.actions.push(action);result={action:{...action,source:'action',planId:plan.id,planTitle:plan.title}};
    }
  }else{
    const records=data.projects;
    if(name==='create_schedule'){
      const payload={title:input.title,parentId:input.parentId,kind:input.kind},c=creation(records,input,'schedule',payload);parent(records,c.id,input.parentId);
      const schedule=c.existing||{id:c.id,...payload,tasks:[],fmt:{},view:{res:'weeks',cw:36,labelsOn:true,theme:'dark'},metadata:c.metadata};
      if(!c.existing)records.push(schedule);result={schedule:{...schedule,source:'schedule'}};
    }else if(name==='update_schedule'){
      const schedule=records.find(p=>p.id===input.id);if(!schedule)fail('not_found','Cronograma ou grupo não encontrado.');
      if(own(input.patch,'parentId'))parent(records,schedule.id,input.patch.parentId);Object.assign(schedule,input.patch);result={schedule:{...schedule,source:'schedule'}};
    }else{
      const schedule=records.find(p=>p.id===input.projectId);if(!schedule||schedule.kind==='group')fail('not_found','Selecione um cronograma, não um grupo.');
      const activity=task=>({...task,source:'gantt',projectId:schedule.id,projectTitle:schedule.title});
      if(name==='group_schedule_activities'){
        const payload={title:input.title,activityIds:[...input.activityIds].sort(),...(input.color?{color:input.color}:{})},c=creation(schedule.tasks,input,'summary',payload);
        const task=c.existing||{id:c.id,name:input.title,pct:0,dur:1,unit:'bd',start:'',end:'',pred:'',indent:0,collapsed:false,mile:false,color:input.color||'#4a9eff',metadata:c.metadata};
        if(!c.existing)groupScheduleActivities(schedule,input,task);result={activity:activity(task)};
      }else if(name==='move_schedule_activities')result={activities:moveScheduleActivities(schedule,input).map(activity)};
      else if(name==='set_schedule_activity_colors')result={activities:colorScheduleActivities(schedule,input).map(activity)};
      else if(name==='set_schedule_row_background')result={activities:backgroundScheduleRows(schedule,input).map(task=>({...activity(task),rowBackgroundColor:schedule.fmt?.[String(task.id)+'_row']?.bg??null}))};
      else{
      let task,patch;
      if(name==='create_schedule_activity'){
        const {workspace,expectedVersion,requestId,projectId,...payload}=input,c=creation(schedule.tasks,input,'activity',payload);
        task=c.existing||{id:c.id,name:input.title,start:input.start,end:input.start,dur:input.duration,unit:input.unit,pct:input.pct,mile:input.milestone,indent:0,pred:'',collapsed:false,color:'#4a9eff',metadata:c.metadata};
        if(!c.existing)schedule.tasks.push(task);patch=c.existing?{}:payload;
      }else{task=schedule.tasks.find(t=>String(t.id)===input.id);if(!task)fail('not_found','Atividade não encontrada.');patch=input.patch;}
      const index=schedule.tasks.indexOf(task),isSummary=!!schedule.tasks[index+1]&&schedule.tasks[index+1].indent>task.indent;
      if(isSummary&&Object.keys(patch).some(k=>!['title','color'].includes(k)))fail('summary_requires_children','Datas e progresso de uma linha de resumo vêm das subtarefas. Altere as atividades filhas.');
      if(own(patch,'start')&&task.pred&&!own(patch,'dependencies'))fail('dependent_start','O início segue dependências. Altere a duração ou as dependências, ou peça explicitamente para removê-las.');
      if(own(patch,'title'))task.name=patch.title;if(own(patch,'start'))task.start=patch.start;if(own(patch,'duration'))task.dur=patch.duration;
      if(own(patch,'unit'))task.unit=patch.unit;if(own(patch,'pct'))task.pct=patch.pct;if(own(patch,'milestone'))task.mile=patch.milestone;
      if(own(patch,'color'))task.color=patch.color;
      if(own(patch,'dependencies'))task.pred=patch.dependencies.map(p=>{const n=schedule.tasks.findIndex(t=>String(t.id)===p.id);if(n<0)fail('not_found','Predecessora não encontrada neste cronograma.');return (n+1)+p.type+(p.lag?(p.lag>0?'+':'')+p.lag:'');}).join(';');
      if(task.mile)task.dur=0;
      if(Object.keys(patch).some(k=>k!=='color'))recalculateSchedule(schedule,{dates:Object.keys(patch).some(k=>['start','duration','unit','milestone','dependencies'].includes(k))});
      result={activity:{...task,source:'gantt',projectId:schedule.id,projectTitle:schedule.title}};
      }
    }
  }
  try{validateDocument(area,data);}catch{fail('invalid_backup','A alteração gerou uma estrutura inválida. Nenhum dado foi salvo.');}
  if(JSON.stringify(data)===JSON.stringify(snapshot.data))return {workspace:input.workspace,saved:true,unchanged:true,version:snapshot.version,...result};
  return {workspace:input.workspace,...await store.write(area,input.workspace,snapshot,data,name),...result};
}
