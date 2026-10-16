import { IntegrationError } from './store.mjs';
import { scheduleDependencies, recalculateSchedule } from './schedule.mjs';
const fail=(message)=>{throw new IntegrationError('invalid_structure',message);};
const id=t=>String(t.id);

export function scheduleStructure(schedule){
  if(schedule.tasks.length>5000)fail('Divida este cronograma antes de reorganizar pelo chat.');
  const nodes=[],byId=new Map(),stack=[];
  for(const [index,task] of schedule.tasks.entries()){
    const depth=task.indent??0;
    if(!Number.isInteger(depth)||depth<0||depth>100||depth>stack.length)fail('Há níveis inválidos no cronograma. Corrija a hierarquia na interface antes de reorganizar.');
    while(stack.length>depth)stack.pop().end=index;
    const parent=stack.at(-1),node={id:id(task),task,index,depth,parentId:parent?.id??null,children:[],end:schedule.tasks.length};
    if(byId.has(node.id))fail('Há IDs repetidos no cronograma.');
    if(parent)parent.children.push(node.id);nodes.push(node);byId.set(node.id,node);stack.push(node);
  }
  return {nodes,byId};
}
function capture(schedule){
  const info=scheduleStructure(schedule),deps=new Map();
  for(const node of info.nodes)deps.set(node.id,scheduleDependencies(schedule.tasks,node.task.pred).map(p=>({...p,id:id(schedule.tasks[p.index])})));
  return {info,deps,dates:new Map(info.nodes.map(n=>[n.id,{start:n.task.start,end:n.task.end}]))};
}
function selected(info,ids){
  const roots=ids.map(key=>info.byId.get(key));
  if(roots.some(n=>!n))fail('Uma atividade selecionada não existe neste cronograma.');
  roots.sort((a,b)=>a.index-b.index);
  for(let i=1;i<roots.length;i++)if(roots[i].index<roots[i-1].end)fail('Selecione o grupo inteiro ou suas atividades, sem selecionar pai e filho juntos.');
  return roots;
}
function finish(schedule,before){
  const after=scheduleStructure(schedule);
  for(const node of before.info.nodes){
    const next=after.byId.get(node.id);
    if(node.children.length&&!next.children.length)fail('O grupo '+node.task.name+' ficaria vazio. Mova o grupo inteiro ou mantenha pelo menos uma atividade nele.');
    const dependencies=before.deps.get(node.id);
    for(const p of dependencies){
      const previous=after.byId.get(p.id);
      if(!previous)fail('Uma predecessora deixou de existir.');
      if((previous.index<=next.index&&next.index<previous.end)||(next.index<=previous.index&&previous.index<next.end))fail('Uma dependência ficaria entre pai e filho. Revise os vínculos antes de mover esse grupo.');
    }
    if(dependencies.some(p=>p.index!==after.byId.get(p.id).index))next.task.pred=dependencies.map(p=>(after.byId.get(p.id).index+1)+p.type+(p.lag?(p.lag>0?'+':'')+p.lag:'')).join(';');
  }
  recalculateSchedule(schedule,{dates:false,summaryDates:true});
  for(const [key,deps] of before.deps){
    const task=after.byId.get(key);
    if(task.children.length)continue;
    for(const p of deps){const previous=after.byId.get(p.id),old=before.dates.get(p.id);
      if(previous.children.length&&(previous.task.start!==old.start||previous.task.end!==old.end))fail('O grupo '+previous.task.name+' tem sucessores e suas datas mudariam. Revise essas dependências antes de reorganizar para preservar as datas.');
    }
  }
  return after;
}
export function groupScheduleActivities(schedule,input,summary){
  const before=capture(schedule),roots=selected(before.info,input.activityIds);
  if(roots.some(n=>n.parentId!==roots[0].parentId))fail('Para criar um grupo, selecione atividades do mesmo pai. Use mover atividades para reunir itens de pais diferentes.');
  const chosen=new Set(roots.flatMap(n=>schedule.tasks.slice(n.index,n.end).map(id))),grouped=[];
  for(const node of roots)for(const task of schedule.tasks.slice(node.index,node.end)){task.indent=(task.indent??0)+1;if(input.color)task.color=input.color;grouped.push(task);}
  summary.indent=roots[0].depth;summary.unit=roots[0].task.unit||'bd';summary.start=roots[0].task.start||'';summary.end=roots[0].task.end||summary.start;
  const index=schedule.tasks.slice(0,roots[0].index).filter(t=>!chosen.has(id(t))).length;
  schedule.tasks=schedule.tasks.filter(t=>!chosen.has(id(t)));schedule.tasks.splice(index,0,summary,...grouped);
  finish(schedule,before);return summary;
}
export function moveScheduleActivities(schedule,input){
  const before=capture(schedule),roots=selected(before.info,input.activityIds),chosen=new Set(roots.flatMap(n=>schedule.tasks.slice(n.index,n.end).map(id)));
  const parent=input.parentActivityId===null?null:before.info.byId.get(input.parentActivityId);
  if(input.parentActivityId!==null&&(!parent||!parent.children.length))fail('O destino precisa ser um grupo existente. Para criar um pai, use agrupar atividades.');
  if(chosen.has(input.parentActivityId)||chosen.has(input.afterActivityId))fail('Uma atividade não pode ser movida para dentro de si mesma ou de seus descendentes.');
  const after=input.afterActivityId===null?null:before.info.byId.get(input.afterActivityId);
  if(input.afterActivityId!==null&&(!after||after.parentId!==input.parentActivityId))fail('A posição deve indicar uma atividade do mesmo pai de destino.');
  const moved=[];for(const node of roots){const delta=(parent?parent.depth+1:0)-node.depth;
    for(const task of schedule.tasks.slice(node.index,node.end)){task.indent=(task.indent??0)+delta;moved.push(task);}
  }
  const insertion=after?after.end:parent?parent.end:schedule.tasks.length;
  const index=schedule.tasks.slice(0,insertion).filter(t=>!chosen.has(id(t))).length;
  schedule.tasks=schedule.tasks.filter(t=>!chosen.has(id(t)));schedule.tasks.splice(index,0,...moved);
  if(parent)parent.task.collapsed=false;
  finish(schedule,before);return roots.map(n=>n.task);
}
export function colorScheduleActivities(schedule,input){
  const info=scheduleStructure(schedule),chosen=new Set();
  for(const key of input.activityIds){const node=info.byId.get(key);if(!node)fail('Uma atividade selecionada não existe neste cronograma.');
    for(const item of info.nodes.slice(node.index,input.includeDescendants?node.end:node.index+1))chosen.add(item.id);
  }
  const tasks=schedule.tasks.filter(t=>chosen.has(id(t)));tasks.forEach(t=>{t.color=input.color;});return tasks;
}
