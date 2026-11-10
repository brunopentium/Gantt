/* Synthetic scheduler regressions; no private project data is committed. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),helpers=html.slice(html.indexOf('function isWE('),html.indexOf('function isoWk(')),scheduler=html.slice(html.indexOf('function isSummary('),html.indexOf('// ========== UNDO'));
const task=(id,pred='',extra={})=>({id,name:id,indent:0,start:new Date('2026-11-10T12:00:00Z'),end:new Date('2026-11-12T12:00:00Z'),dur:3,unit:'bd',pct:35,pred,color:'#9070e0',custom:{keep:true},...extra});
function context(T){const ctx={T,Date,Set,Map,cpOn:true};vm.createContext(ctx);vm.runInContext(helpers+scheduler,ctx);return ctx}
for(const type of ['FS','SS','FF','SF']){
 const T=[task('before-cycle','3'+type),task('independent'),task('cycle-a','4'+type),task('cycle-b','3'+type)],before=JSON.stringify(T),ctx=context(T);
 assert.equal(vm.runInContext('schedule()',ctx,{timeout:1000}),false);assert.equal(JSON.stringify(T),before);
 assert.deepEqual(Array.from(vm.runInContext('scheduleDependencyOrder().cycle',ctx)),[2,3,2]);assert.equal(vm.runInContext('criticalPath().size',ctx,{timeout:1000}),0);
 T[2].pred='';assert.equal(vm.runInContext('schedule()',ctx,{timeout:1000}),true);assert.equal(vm.runInContext('scheduleDependencyOrder().cycle.length',ctx),0);assert.equal(T[3].pct,35);assert.deepEqual(T[3].custom,{keep:true});
}
const self=context([task('self','1FS')]);assert.deepEqual(Array.from(vm.runInContext('scheduleDependencyOrder().cycle',self)),[0,0]);assert.equal(vm.runInContext('schedule()',self),false);
const long=context(Array.from({length:30000},(_,i)=>({pred:i===29999?'':String(i+2)+'FS'})));
const result=vm.runInContext('scheduleDependencyOrder()',long,{timeout:3000});assert.equal(result.order.length,30000);assert.equal(result.cycle.length,0);assert.equal(result.order[0],29999);assert.equal(result.order.at(-1),0);
console.log('PASS: all dependency types, downstream rows, self-cycle and a 30,000-row chain; no recursion, no mutation on cycles, paused critical path and normal recalculation after repair.');
(async()=>{
 const data={version:1,projects:[{id:'s',title:'Synthetic cycle',tasks:[task('a','2FS'),task('b','1FS')].map(t=>({...t,start:'2026-11-10',end:'2026-11-12'}))}]},local=new Map([['pf_github_backup_v1',JSON.stringify({repo:'synthetic/private',branch:'main',enabled:true})],['pf_github_backup_v1_token',JSON.stringify('synthetic-secret')]]),elements=new Map(),requests=[];
 const cloud={Date,Map,Set,TextEncoder,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,Response,console,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},localStorage:{getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,value)},sessionStorage:{getItem:()=>null},document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id)}}};cloud.window=cloud;cloud.WorkspaceProfile={key:k=>k,path:p=>p};cloud.addEventListener=cloud.dispatchEvent=()=>{};
 cloud.fetch=async(url,options)=>{requests.push({url,method:options.method||'GET'});return url.includes('/contents/')?new Response('{}',{status:404}):Response.json({private:true,has_pages:false,default_branch:'main'})};
 vm.createContext(cloud);vm.runInContext(fs.readFileSync(path.join(__dirname,'../github-backup.js'),'utf8'),cloud);
 await cloud.GanttBackup.init({snapshot:()=>data,flush(){},validationError:()=> 'Dependência circular'});assert(cloud.GanttBackup.state().ready);assert(cloud.GanttBackup.state().blocked);
 const before=JSON.stringify(data),saved=await cloud.GanttBackup.save();assert.equal(saved.ok,false);assert.match(saved.error,/Circular dependencies/);assert.equal(JSON.stringify(data),before);assert.equal(requests.filter(r=>r.method==='PUT').length,0);
 console.log('PASS: manual cloud save also rejects a circular snapshot before any PUT, even with a ready connection.');
})().catch(e=>{console.error(e);process.exitCode=1});
