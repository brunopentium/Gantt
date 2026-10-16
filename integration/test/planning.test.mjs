import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { execute } from '../src/domain.mjs';
import { recalculateSchedule } from '../src/schedule.mjs';
import { FakeStore } from './fixtures.mjs';
const base={workspace:'work',expectedVersion:'a'.repeat(40),requestId:'new-record-0001'};
const write=(store,name,args)=>execute(store,name,{workspace:base.workspace,...(name.startsWith('create_')?{requestId:base.requestId}:{}),expectedVersion:store.version,...args});
test('plans, subplans, sections and actions preserve existing data and reject cycles',async()=>{
  const store=new FakeStore(),before=structuredClone(store.data);
  const p=await write(store,'create_action_plan',{title:'Novo plano',parentId:'p1',document:{participants:['Bruno'],notes:'Texto'}});
  assert.equal(p.plan.parentId,'p1');assert.deepEqual(store.data.plans.actionPlans.slice(0,2),before.plans.actionPlans);
  const a=await write(store,'create_action',{planId:p.plan.id,title:'Ação',owner:'Bruno',start:'2026-10-16',end:'2026-10-19'});
  assert.equal(a.action.link,null);assert.equal(a.action.planId,p.plan.id);
  await write(store,'update_action_plan',{id:p.plan.id,patch:{title:'Renomeado',document:{agenda:'Pauta'}}});
  const actual=store.data.plans.actionPlans.at(-1);assert.equal(actual.document.notes,'Texto');assert.equal(actual.document.agenda,'Pauta');assert.equal(actual.actions[0].id,a.action.id);
  const window={WorkspaceProfile:{key:s=>s,personal:false}},context=vm.createContext({window,localStorage:{getItem:()=>null}});
  vm.runInContext(await readFile(new URL('../../action-plans.js',import.meta.url),'utf8'),context);window.ActionPlans.validate(store.data.plans.actionPlans);
  const count=store.writes.length;
  await assert.rejects(write(store,'update_action_plan',{id:'p1',patch:{parentId:p.plan.id}}),{code:'invalid_parent'});
  await assert.rejects(write(store,'create_action',{planId:p.plan.id,title:'Inválida',start:'2026-10-20',end:'2026-10-19'}),{code:'invalid_dates'});
  assert.equal(store.writes.length,count);assert.deepEqual(store.data.schedules,before.schedules);assert.deepEqual(store.data.todo,before.todo);
});
test('schedule creation is idempotent, preserves hierarchy and appends activities without renumbering existing rows',async()=>{
  const store=new FakeStore(),before=structuredClone(store.data);
  const s=await write(store,'create_schedule',{title:'Cronograma novo',parentId:'group'});
  const duplicate=await write(store,'create_schedule',{title:'Cronograma novo',parentId:'group'});assert.equal(duplicate.unchanged,true);
  const a=await write(store,'create_schedule_activity',{projectId:s.schedule.id,title:'Preparação',start:'2026-10-16',duration:2});
  assert.equal(a.activity.end,'2026-10-19');
  await write(store,'create_schedule_activity',{projectId:s.schedule.id,title:'Execução',start:'2026-10-16',duration:2,requestId:'second-activity-0002',dependencies:[{id:a.activity.id}]});
  const tasks=store.data.schedules.projects.at(-1).tasks;assert.equal(tasks[1].pred,'1FS');assert.equal(tasks[1].start,'2026-10-20');
  const window={},context=vm.createContext({window});vm.runInContext(await readFile(new URL('../../schedule-groups.js',import.meta.url),'utf8'),context);window.ScheduleGroups.validate(store.data.schedules.projects);
  await write(store,'update_schedule_activity',{projectId:s.schedule.id,id:a.activity.id,patch:{duration:3,pct:40}});
  const updated=store.data.schedules.projects.at(-1).tasks;assert.equal(updated[0].end,'2026-10-20');assert.equal(updated[1].start,'2026-10-21');assert.equal(updated[0].pct,40);
  assert.deepEqual(store.data.schedules.projects.slice(0,2),before.schedules.projects);assert.deepEqual(store.data.plans,before.plans);
  const count=store.writes.length;
  await assert.rejects(write(store,'update_schedule_activity',{projectId:s.schedule.id,id:a.activity.id,patch:{dependencies:[{id:updated[1].id}]}}),{code:'invalid_schedule'});
  await assert.rejects(write(store,'update_schedule_activity',{projectId:s.schedule.id,id:updated[1].id,patch:{start:'2026-10-23'}}),{code:'dependent_start'});
  await assert.rejects(write(store,'create_schedule_activity',{projectId:'group',title:'Não cabe',start:'2026-10-16'}),{code:'not_found'});
  assert.equal(store.writes.length,count);
});
test('summary rows derive progress and dates; unknown metadata and dependency IDs remain intact',async()=>{
  const project={tasks:[{id:'sum',name:'Resumo',indent:0,pct:0,dur:1,unit:'bd',start:'2026-10-01',end:'2026-10-01',pred:'',custom:{keep:true}},
    {id:'a',name:'A',indent:1,pct:20,dur:2,unit:'bd',start:'2026-10-16',end:'2026-10-16',pred:''},
    {id:'b',name:'B',indent:1,pct:60,dur:1,unit:'bd',start:'2026-10-16',end:'2026-10-16',pred:'2FS'}]};
  recalculateSchedule(project);assert.equal(project.tasks[0].pct,40);assert.equal(project.tasks[0].end,'2026-10-20');assert.equal(project.tasks[2].pred,'2FS');assert.deepEqual(project.tasks[0].custom,{keep:true});
});
test('schedule calculations match the webapp for all dependency types, lags, milestones and day units',async()=>{
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  const helpers=html.slice(html.indexOf('function isWE('),html.indexOf('function isoWk('));
  const calculation=html.slice(html.indexOf('function isSummary('),html.indexOf('function criticalPath('));
  for(const unit of ['bd','cd'])for(const type of ['FS','SS','FF','SF'])for(const lag of [-2,0,2])for(const milestone of [false,true]){
    const project={tasks:[{id:'a',name:'A',indent:0,unit,dur:3,pct:10,pred:'',start:'2026-10-16',end:'2026-10-20'},
      {id:'b',name:'B',indent:0,unit,dur:milestone?0:2,pct:0,pred:'1'+type+(lag?(lag>0?'+':'')+lag:''),mile:milestone,start:'2026-10-16',end:'2026-10-19'}]};
    const native=structuredClone(project.tasks).map(t=>({...t,start:new Date(t.start+'T12:00:00Z'),end:new Date(t.end+'T12:00:00Z')}));
    const context={T:native,Date,Set};vm.createContext(context);vm.runInContext(helpers+calculation+';schedule();',context);
    recalculateSchedule(project);
    for(let i=0;i<2;i++)for(const field of ['start','end'])assert.equal(project.tasks[i][field],native[i][field].toISOString().slice(0,10),[unit,type,lag,milestone,field].join(' '));
  }
});
