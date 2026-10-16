import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {execute} from '../src/domain.mjs';
import {scheduleStructure} from '../src/schedule-structure.mjs';
import {recalculateSchedule,scheduleDependencies} from '../src/schedule.mjs';
import {FakeStore} from './fixtures.mjs';
const task=(id,extra={})=>({id,name:id,indent:0,start:'2026-10-16',end:'2026-10-19',dur:2,unit:'bd',pct:20,pred:'',mile:false,color:'#4a9eff',custom:{keep:id},...extra});
function fixture(){const store=new FakeStore();store.data.schedules.projects=[{id:'s',title:'Estúdio',kind:'schedule',fmt:{a_name:{b:true}},custom:'keep',tasks:[
  task('a'),task('b',{pred:'1FS+2',pct:40}),task('c',{pred:'2SS-1',pct:60}),task('d',{pred:'3FF+1'}),task('e',{pred:'4SF+3',mile:true,dur:0})]}];recalculateSchedule(store.data.schedules.projects[0]);return store;}
const run=(store,name,args)=>execute(store,name,{workspace:'work',expectedVersion:store.version,...args});
const project=store=>store.data.schedules.projects[0];
const links=p=>Object.fromEntries(p.tasks.map(t=>[t.id,scheduleDependencies(p.tasks,t.pred).map(d=>({id:p.tasks[d.index].id,type:d.type,lag:d.lag}))]));
const leaves=p=>Object.fromEntries(scheduleStructure(p).nodes.filter(n=>!n.children.length).map(n=>[n.id,{start:n.task.start,end:n.task.end,dur:n.task.dur,pct:n.task.pct,mile:n.task.mile,custom:n.task.custom}]));
async function nativeMatches(p){
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8'),helpers=html.slice(html.indexOf('function isWE('),html.indexOf('function isoWk(')),calc=html.slice(html.indexOf('function isSummary('),html.indexOf('function criticalPath('));
  const T=structuredClone(p.tasks).map(t=>({...t,start:new Date(t.start+'T12:00:00Z'),end:new Date(t.end+'T12:00:00Z')})),context={T,Date,Set};vm.createContext(context);vm.runInContext(helpers+calc+';schedule();',context);
  p.tasks.forEach((t,i)=>{for(const key of ['start','end'])assert.equal(t[key],T[i][key].toISOString().slice(0,10),t.id+' '+key);assert.equal(t.pct,T[i].pct,t.id+' pct');});
}
test('grouping nonconsecutive activities creates a real parent and preserves leaf dates, progress, links and metadata',async()=>{
  const store=fixture(),before=structuredClone(project(store)),personal=structuredClone(store.data.todo),plans=structuredClone(store.data.plans);
  const r=await run(store,'group_schedule_activities',{projectId:'s',title:'Oferta e marca',activityIds:['c','a'],color:'#9070e0',requestId:'group-offer-0001'}),p=project(store),parent=r.activity.id;
  assert.deepEqual(p.tasks.map(t=>t.id),[parent,'a','c','b','d','e']);assert.deepEqual(p.tasks.map(t=>t.indent),[0,1,1,0,0,0]);
  assert.deepEqual(leaves(p),leaves(before));for(const [id,deps] of Object.entries(links(before)))assert.deepEqual(links(p)[id],deps);
  assert.equal(p.tasks[0].pct,40);assert(p.tasks.slice(0,3).every(t=>t.color==='#9070e0'));assert.equal(p.tasks[3].color,'#4a9eff');
  assert.deepEqual(p.fmt,before.fmt);assert.equal(p.custom,'keep');assert.deepEqual(store.data.todo,personal);assert.deepEqual(store.data.plans,plans);
  const repeat=await run(store,'group_schedule_activities',{projectId:'s',title:'Oferta e marca',activityIds:['a','c'],color:'#9070e0',requestId:'group-offer-0001'});assert.equal(repeat.unchanged,true);assert.equal(store.writes.length,1);
  const page=await execute(store,'list_schedule_structure',{workspace:'work',projectId:'s',limit:2});assert.equal(page.total,6);assert.equal(page.nextOffset,2);assert.equal(page.items[0].summary,true);assert.deepEqual(page.items[0].children,['a','c']);assert.equal(page.items[1].parentActivityId,parent);
  await nativeMatches(p);
});
test('moving activities and whole subtrees preserves all dependency types and linked action IDs',async()=>{
  const store=fixture(),before=structuredClone(project(store)),linked={id:'linked',title:'Linked',owner:'Bruno',status:'pending',notes:'',start:'',end:'',link:{projectId:'s',taskId:'c'}};
  store.data.plans.actionPlans[0].actions.push(linked);
  const g=await run(store,'group_schedule_activities',{projectId:'s',title:'Grupo',activityIds:['a','c'],requestId:'group-move-0001'}),parent=g.activity.id;
  await run(store,'move_schedule_activities',{projectId:'s',activityIds:['e'],parentActivityId:parent,afterActivityId:'a'});
  assert.deepEqual(project(store).tasks.map(t=>t.id),[parent,'a','e','c','b','d']);
  await run(store,'move_schedule_activities',{projectId:'s',activityIds:[parent],parentActivityId:null,afterActivityId:'d'});
  assert.deepEqual(project(store).tasks.map(t=>t.id),['b','d',parent,'a','e','c']);
  const again=await run(store,'move_schedule_activities',{projectId:'s',activityIds:[parent],parentActivityId:null,afterActivityId:'d'});assert.equal(again.unchanged,true);
  await run(store,'move_schedule_activities',{projectId:'s',activityIds:['c'],parentActivityId:null,afterActivityId:'b'});
  assert.deepEqual(leaves(project(store)),leaves(before));for(const [id,deps] of Object.entries(links(before)))assert.deepEqual(links(project(store))[id],deps);
  assert.deepEqual(store.data.plans.actionPlans[0].actions.at(-1),linked);await nativeMatches(project(store));
});
test('colors can target a summary or its subtree without recalculating dates or progress',async()=>{
  const store=fixture();const g=await run(store,'group_schedule_activities',{projectId:'s',title:'Grupo',activityIds:['a','c'],requestId:'group-color-0001'}),before=structuredClone(project(store));
  await run(store,'set_schedule_activity_colors',{projectId:'s',activityIds:[g.activity.id],color:'#40b080',includeDescendants:true});
  project(store).tasks.forEach((t,i)=>assert.deepEqual({...t,color:before.tasks[i].color},before.tasks[i]));
  assert(project(store).tasks.slice(0,3).every(t=>t.color==='#40b080'));assert.equal(project(store).tasks[3].color,'#4a9eff');
  await run(store,'update_schedule_activity',{projectId:'s',id:g.activity.id,patch:{color:'#e08020'}});assert.equal(project(store).tasks[0].color,'#e08020');assert.equal(project(store).tasks[1].color,'#40b080');
  await assert.rejects(run(store,'set_schedule_activity_colors',{projectId:'s',activityIds:['a'],color:'red;display:none'}),{code:'invalid_input'});
});
test('invalid selections, cycles, empty parents, bad dependencies and stale versions never write',async()=>{
  const store=fixture();const g=await run(store,'group_schedule_activities',{projectId:'s',title:'Single',activityIds:['a'],requestId:'group-single-0001'}),before=structuredClone(store.data),count=store.writes.length;
  for(const [name,args] of [
    ['group_schedule_activities',{title:'Bad',activityIds:[g.activity.id,'a'],requestId:'group-invalid-0001'}],
    ['group_schedule_activities',{title:'Bad',activityIds:['a','d'],requestId:'group-invalid-0002'}],
    ['move_schedule_activities',{activityIds:['a'],parentActivityId:null}],
    ['move_schedule_activities',{activityIds:[g.activity.id],parentActivityId:g.activity.id}],
    ['move_schedule_activities',{activityIds:['d'],parentActivityId:'b'}],
    ['move_schedule_activities',{activityIds:['d'],parentActivityId:g.activity.id,afterActivityId:'e'}],
    ['set_schedule_activity_colors',{activityIds:['missing'],color:'#ffffff'}]
  ])await assert.rejects(run(store,name,{projectId:'s',...args}),{code:'invalid_structure'});
  await assert.rejects(execute(store,'group_schedule_activities',{workspace:'work',expectedVersion:'f'.repeat(40),projectId:'s',title:'Bad',activityIds:['a'],requestId:'group-invalid-0003'}),{code:'version_conflict'});
  assert.equal(store.writes.length,count);assert.deepEqual(store.data,before);
  const invalid=fixture();project(invalid).tasks[0].pred='999FS';const old=structuredClone(invalid.data);
  await assert.rejects(run(invalid,'group_schedule_activities',{projectId:'s',title:'Bad',activityIds:['a','b'],requestId:'group-invalid-0004'}),{code:'invalid_schedule'});assert.deepEqual(invalid.data,old);assert.equal(invalid.writes.length,0);
});
test('a move cannot introduce ancestor dependency cycles or shift successors of a changed summary',async()=>{
  const store=fixture();const g=await run(store,'group_schedule_activities',{projectId:'s',title:'Grupo',activityIds:['a','c'],requestId:'group-succ-0001'});
  project(store).tasks.find(t=>t.id==='c').pred='';project(store).tasks.find(t=>t.id==='b').pred='1FS';
  const before=structuredClone(store.data),count=store.writes.length;
  await assert.rejects(run(store,'move_schedule_activities',{projectId:'s',activityIds:['b'],parentActivityId:g.activity.id}),{code:'invalid_structure'});
  project(store).tasks.push(task('late',{start:'2026-12-01',end:'2026-12-02'}));
  const withLate=structuredClone(store.data);
  await assert.rejects(run(store,'move_schedule_activities',{projectId:'s',activityIds:['late'],parentActivityId:g.activity.id}),{code:'invalid_structure'});
  assert.equal(store.writes.length,count);assert.deepEqual(store.data,withLate);assert.deepEqual(store.data.schedules.projects[0].tasks.slice(0,-1),before.schedules.projects[0].tasks);
});
test('nested groups preserve their complete subtree when regrouped and moved back to the root',async()=>{
  const store=fixture(),before=leaves(project(store));
  const inner=await run(store,'group_schedule_activities',{projectId:'s',title:'Inner',activityIds:['a','c'],requestId:'nested-inner-0001'});
  const outer=await run(store,'group_schedule_activities',{projectId:'s',title:'Outer',activityIds:[inner.activity.id,'b'],requestId:'nested-outer-0001'});
  const info=scheduleStructure(project(store));assert.equal(info.byId.get('a').depth,2);assert.equal(info.byId.get(inner.activity.id).parentId,outer.activity.id);
  await run(store,'move_schedule_activities',{projectId:'s',activityIds:[inner.activity.id],parentActivityId:null,afterActivityId:'d'});
  assert.equal(scheduleStructure(project(store)).byId.get('a').depth,1);assert.deepEqual(leaves(project(store)),before);await nativeMatches(project(store));
});
test('summary colors are used by the actual chart renderer and vector PDF output',async()=>{
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8'),source=html.slice(html.indexOf('function renderGantt(){'),html.indexOf('function depArrow('));
  const T=[{id:'parent',name:'Grupo',indent:0,start:new Date('2026-10-16'),end:new Date('2026-10-19'),color:'#9070e0',pct:30,dur:2}, {id:'leaf',name:'Atividade',indent:1,start:new Date('2026-10-16'),end:new Date('2026-10-19'),color:'#40b080',pct:30,dur:2}],gc={style:{},innerHTML:''};
  const context={T,Date,Set,document:{getElementById:()=>gc},dateRange:()=>({mn:new Date('2026-10-01'),mx:new Date('2026-10-31')}),visible:()=>T,criticalPath:()=>new Set(),renderGanttHeader(){},totalW:()=>100,RH:30,res:'weeks',d2x:()=>20,barW:()=>50,today:()=>new Date('2027-01-01'),isSummary:t=>t===T[0],statusOn:false,labelsOn:false,parsePred:()=>[]};
  vm.createContext(context);vm.runInContext(source+';renderGantt();',context);assert.match(gc.innerHTML,/--summary-color:#9070e0/);assert.match(gc.innerHTML,/background:#40b080/);
  const print={window:{},Date};vm.createContext(print);vm.runInContext(await readFile(new URL('../../gantt-print.js',import.meta.url),'utf8'),print);
  const result=print.window.GanttPrint.build({title:'Cores',start:'2026-10-16',end:'2026-10-19',days:4,today:-1,format:{},status:false,labels:false,tasks:[{id:'parent',name:'Grupo',summary:true,indent:0,hasDate:true,x:0,w:.5,color:'#9070e0',pct:30}]});
  assert.match(result,/height="4" fill="#9070e0"/);
});
