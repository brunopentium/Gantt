import test from 'node:test';
import assert from 'node:assert/strict';
import { chat, applyChatDraft, chatRateLimit } from '../src/chat.mjs';
import { chatConfig, chatCallback, exchangeChatCode } from '../src/chat-http.mjs';
import { createWorkerHandler } from '../src/worker.mjs';
import { httpConfig } from '../src/auth.mjs';
import { fixtures } from './fixtures.mjs';
import { validateDocument } from '../src/schemas.mjs';
import { IntegrationError } from '../src/store.mjs';

const env={OPENROUTER_API_KEY:'fake-openrouter-key',GITHUB_TOKEN:'fake-github-secret',GITHUB_REPOSITORY:'example/private',GITHUB_BRANCH:'main',CHAT_CLIENT_ID:'public-client'};
const principal={subject:'bruno',scopes:['projectflow:read','projectflow:write']};
const now=Date.parse('2026-10-16T13:00:00Z');
const input={workspace:'work',day:'2026-10-16',messages:[{role:'user',content:'Mova t1 e t2 para segunda e marque a3 em andamento.'}]};
class Store {
  constructor(){this.data=fixtures();this.versions={todo:'a'.repeat(40),plans:'b'.repeat(40),schedules:'c'.repeat(40)};this.writes=[];}
  async read(area,workspace){return {data:structuredClone(this.data[area]),version:this.versions[area],path:workspace+'/'+area,branch:'main'};}
  async write(area,workspace,snapshot,data){
    if(this.fail===area)throw new IntegrationError('upstream_unavailable','Falha de conexão.',502);
    assert.equal(snapshot.version,this.versions[area]);validateDocument(area,data);this.data[area]=structuredClone(data);
    this.versions[area]=(area==='todo'?'d':'e').repeat(40);this.writes.push({area,workspace});
    return {saved:true,version:this.versions[area],commit:'f'.repeat(40)};
  }
}
const call=(name,args,id)=>({id:id||name,type:'function',function:{name,arguments:JSON.stringify(args)}});
function model(steps,inspect){return async(url,options)=>{
  assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(options.redirect,'manual');
  const body=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer fake-openrouter-key');
  assert(!options.body.includes(env.GITHUB_TOKEN));inspect?.(body);
  const message=steps.shift();assert(message,'Unexpected extra model request');return Response.json({choices:[{message}]});
};}
async function draft(store=new Store(),ops=[call('update_task',{id:'t1',patch:{date:'2026-10-19'}})]){
  return chat(env,principal,input,store,{now,fetcher:model([{role:'assistant',tool_calls:ops},{role:'assistant',content:'Preparei a proposta.'}])});
}
test('chat stages multiple tool calls without saving and batches a reviewed area into one CAS write',async()=>{
  const store=new Store(),before=structuredClone(store.data);
  const result=await draft(store,[call('update_task',{id:'t1',patch:{date:'2026-10-19'}},'1'),call('update_task',{id:'t2',patch:{date:'2026-10-20'}},'2'),call('update_action',{planId:'p2',id:'a3',patch:{status:'doing'}},'3')]);
  assert.deepEqual(store.data,before);assert.equal(store.writes.length,0);assert.equal(result.draft.changes.length,3);
  const applied=await applyChatDraft(env,principal,result.draft.token,store,now+1000);
  assert.equal(applied.saved,true);assert.deepEqual(store.writes.map(x=>x.area),['todo','plans']);
  assert.equal(store.data.todo.tasks[0].date,'2026-10-19');assert.equal(store.data.todo.tasks[1].deferBusinessDays,0);
  assert.deepEqual(store.data.todo.tasks[0].subtasks,before.todo.tasks[0].subtasks);
  assert.deepEqual(store.data.schedules,before.schedules);assert.equal(store.data.plans.actionPlans[1].actions[0].status,'doing');
  await assert.rejects(applyChatDraft(env,principal,result.draft.token,store,now+2000),{code:'version_conflict'});
  assert.equal(store.writes.length,2);
});
test('signed drafts reject tampering, another user, changed repository, expiry, missing scopes and stale source areas',async()=>{
  const store=new Store(),result=await draft(store),token=result.draft.token;
  for(const [e,p,t,time,code]of[
    [env,principal,'x'+token,now,'invalid_draft'],[env,{...principal,subject:'other'},token,now,'invalid_draft'],
    [{...env,GITHUB_REPOSITORY:'other/repo'},principal,token,now,'invalid_draft'],[env,principal,token,now+16*60000,'draft_expired'],
    [env,{...principal,scopes:['projectflow:read']},token,now,'insufficient_scope']
  ])await assert.rejects(applyChatDraft(e,p,t,store,time),{code});
  store.versions.schedules='9'.repeat(40);await assert.rejects(applyChatDraft(env,principal,token,store,now),{code:'version_conflict'});
  assert.equal(store.writes.length,0);
});
test('bulk task proposals stage every selected task and roll back the entire batch if an ID is invalid',async()=>{
  const store=new Store(),result=await draft(store,[call('plan_task_updates',{updates:[{id:'t1',patch:{date:'2026-10-19'}},{id:'t2',patch:{date:'2026-10-20'}}]})]);
  assert.equal(result.draft.changes.length,2);assert.equal(store.writes.length,0);
  const invalid=await draft(store,[call('plan_task_updates',{updates:[{id:'t1',patch:{date:'2026-10-19'}},{id:'missing',patch:{date:'2026-10-20'}}]})]);
  assert.equal(invalid.draft,null);assert.equal(store.writes.length,0);
});
test('a new task project and first task are reviewed together and committed once to the tasks area',async()=>{
  const store=new Store(),before=structuredClone(store.data);
  const result=await draft(store,[call('create_task_project',{title:'Geral'},'project'),call('create_task',{title:'Teste',project:'Geral',date:'2026-10-16'},'task')]);
  assert.deepEqual(store.data,before);assert.equal(store.writes.length,0);
  assert.equal(result.draft.changes.length,2);
  assert.equal(result.draft.changes[0].kind,'task-project');assert.equal(result.draft.changes[0].title,'Geral');
  assert.equal(result.draft.changes[1].fields.find(f=>f.field==='project').after,'Geral');
  const applied=await applyChatDraft(env,principal,result.draft.token,store,now+1000);
  assert.equal(applied.saved,true);assert.equal(applied.changed,2);assert.deepEqual(store.writes,[{area:'todo',workspace:'work'}]);
  assert.equal(store.data.todo.settings.projects.at(-1),'Geral');assert.equal(store.data.todo.tasks.at(-1).project,'Geral');
  assert.deepEqual(store.data.todo.tasks.slice(0,-1),before.todo.tasks);assert.deepEqual(store.data.plans,before.plans);assert.deepEqual(store.data.schedules,before.schedules);
  const duplicate=await draft(store,[call('create_task_project',{title:' geral '})]);
  assert.equal(duplicate.draft,null);assert.equal(store.writes.length,1);
});
test('any requested project is prepared automatically with its task and an invalid task leaves no orphan project',async()=>{
  for(const title of ['Geral','Projeto Alfa','Novo cliente 2027']){
    const store=new Store(),result=await draft(store,[call('create_task',{title:'Primeira tarefa',project:title,date:'2026-10-16'})]);
    assert.equal(result.draft.changes.length,2);assert.equal(store.writes.length,0);
    await applyChatDraft(env,principal,result.draft.token,store,now+1);
    assert(store.data.todo.settings.projects.includes(title));assert.equal(store.data.todo.tasks.at(-1).project,title);assert.equal(store.writes.length,1);
  }
  const invalid=await draft(new Store(),[call('create_task',{title:'Inválida',project:'Não salvar',date:'2026-02-30'})]);
  assert.equal(invalid.draft,null);
});
test('plans and schedules with their first items stage without writes and commit once per area',async()=>{
  const store=new Store(),before=structuredClone(store.data);let step=0;
  const result=await chat(env,principal,input,store,{now,fetcher:async(url,options)=>{
    const body=JSON.parse(options.body);let message;
    if(step++===0)message={tool_calls:[call('create_action_plan',{title:'Plano novo'},'plan'),call('create_schedule',{title:'Cronograma novo'},'schedule')]};
    else if(step===2){
      const p=JSON.parse(body.messages.find(m=>m.tool_call_id==='plan').content).plan,s=JSON.parse(body.messages.find(m=>m.tool_call_id==='schedule').content).schedule;
      message={tool_calls:[call('create_action',{planId:p.id,title:'Ação nova',owner:'Bruno'},'action'),call('create_schedule_activity',{projectId:s.id,title:'Atividade nova',start:'2026-10-16',duration:2},'activity')]};
    }else message={content:'Revise a proposta.'};
    return Response.json({choices:[{message}]});
  }});
  assert.equal(result.draft.changes.length,4);assert.deepEqual(store.data,before);assert.equal(store.writes.length,0);
  assert(result.draft.changes.some(c=>c.kind==='schedule-activity'&&c.fields.some(f=>f.field==='end'&&f.after==='2026-10-19')));
  await applyChatDraft(env,principal,result.draft.token,store,now+1);assert.deepEqual(store.writes.map(w=>w.area),['plans','schedules']);
  assert.deepEqual(store.data.todo,before.todo);assert.equal(store.data.plans.actionPlans.at(-1).actions.length,1);assert.equal(store.data.schedules.projects.at(-1).tasks.length,1);
});
test('model cannot write an unobserved ID, override workspace or set unsupported linked dates',async()=>{
  const store=new Store(),result=await draft(store,[call('update_task',{id:'invented',workspace:'personal',patch:{date:'2026-10-19'}},'1'),call('update_action',{id:'linked',planId:'p1',patch:{end:'2026-11-10'}},'2')]);
  assert.equal(result.draft,null);assert.equal(store.writes.length,0);
});
test('read-only users get no mutation tools; missing configuration and provider errors never write',async()=>{
  const store=new Store();let checked=false;
  const r=await chat(env,{...principal,scopes:['projectflow:read']},input,store,{now,fetcher:model([{content:'Consulta pronta.'}],body=>{assert(body.tools.every(t=>t.function.name.startsWith('list_')||t.function.name==='get_my_day'));checked=true;})});
  assert(checked);assert.equal(r.draft,null);
  await assert.rejects(chat({...env,OPENROUTER_API_KEY:''},principal,input,store),{code:'chat_configuration'});
  await assert.rejects(chat(env,principal,input,store,{now,fetcher:async()=>new Response('{}',{status:402})}),{code:'model_unavailable'});
  assert.equal(store.writes.length,0);
});
test('provider failures distinguish authentication, routing, permissions and budget without leaking upstream data',async()=>{
  const store=new Store(),privateText='sk-or-private prompt with a confidential task';
  for(const [status,error,expected]of[
    [401,{message:privateText},/chave OpenRouter foi recusada/],
    [403,{message:privateText},/permissão ou política/],
    [403,{message:privateText,metadata:{limit_source:'openrouter_key_limit'}},/saldo ou limite/],
    [404,{message:privateText},/provedor compatível/],
    [400,{message:privateText},/formato ou os parâmetros/],
    [429,{message:privateText},/limite temporário/],
    [503,{message:privateText},/indisponível/]
  ])await assert.rejects(chat(env,principal,input,store,{now,fetcher:async()=>Response.json({error},{status})}),e=>{
    assert.equal(e.code,'model_unavailable');assert.match(e.message,expected);assert(e.message.includes('HTTP '+status));assert(!e.message.includes(privateText));return true;
  });
  assert.equal(store.writes.length,0);
});
test('provider errors inside HTTP 200 or malformed responses cannot become successful replies or drafts',async()=>{
  const store=new Store();
  for(const body of [{error:{code:403,metadata:{error_type:'permission_denied'}}},{choices:[{message:{content:'Salvei tudo'},error:{code:502}}]}])
    await assert.rejects(chat(env,principal,input,store,{now,fetcher:async()=>Response.json(body)}),{code:'model_unavailable'});
  await assert.rejects(chat(env,principal,input,store,{now,fetcher:async()=>new Response('<html>unavailable</html>',{status:503})}),e=>{assert.match(e.message,/HTTP 503/);return true;});
  await assert.rejects(chat(env,principal,input,store,{now,fetcher:async()=>new Response('not json')}),{code:'model_response'});
  assert.equal(store.writes.length,0);
});
test('partial multi-area failures identify only confirmed remote saves',async()=>{
  const store=new Store(),result=await draft(store,[call('update_task',{id:'t1',patch:{status:'Concluída'}},'1'),call('update_action',{id:'a3',planId:'p2',patch:{status:'doing'}},'2')]);
  store.fail='plans';const r=await applyChatDraft(env,principal,result.draft.token,store,now);
  assert.equal(r.saved,false);assert.equal(r.partial,true);assert.deepEqual(r.results.map(x=>x.area),['todo']);assert.equal(store.data.plans.actionPlans[1].actions[0].status,'pending');
});
test('chat limits repeated authenticated requests',()=>{
  for(let i=0;i<10;i++)chatRateLimit('rate-test',now);
  assert.throws(()=>chatRateLimit('rate-test',now),{code:'chat_rate_limit'});chatRateLimit('rate-test',now+60001);
});
const config=httpConfig({PUBLIC_URL:'https://integration.example',OAUTH_ISSUER:'https://issuer.example/',OAUTH_JWKS_URL:'https://issuer.example/jwks',OAUTH_SUBJECTS:'bruno',ALLOWED_ORIGINS:'https://app.example'});
test('OAuth proxy fixes client and callback, verifies PKCE input and allowlisted identity, exposes no ID/refresh tokens',async()=>{
  let body;
  const result=await exchangeChatCode(env,config,{code:'code',verifier:'a'.repeat(64)},async token=>assert.equal(token,'Bearer access'),async(url,options)=>{
    assert.equal(url,'https://issuer.example/oauth/token');body=JSON.parse(options.body);return Response.json({access_token:'access',expires_in:600,id_token:'private-id',refresh_token:'private-refresh'});
  });
  assert.equal(body.client_id,env.CHAT_CLIENT_ID);assert.equal(body.redirect_uri,'https://integration.example/chat/callback');
  assert.equal(result.id_token,undefined);assert.equal(result.refresh_token,undefined);
  await assert.rejects(exchangeChatCode(env,config,{code:'code',verifier:'short'},async()=>{}),{code:'invalid_input'});
  const publicConfig=JSON.stringify(chatConfig(env,config));assert(!publicConfig.includes(env.GITHUB_TOKEN));assert(!publicConfig.includes(env.OPENROUTER_API_KEY));
  const callback=chatCallback(config);assert.match(callback.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  assert.match(await callback.text(),/https:\/\/app.example/);
});
test('Worker chat routes preserve CORS and authentication boundaries',async()=>{
  const handle=createWorkerHandler({config,env,storeFactory:()=>new Store(),authenticate:async header=>{if(header!=='Bearer allowed')throw new IntegrationError('unauthorized','Login necessário.',401);return principal;}});
  const request=(path,options={})=>handle(new Request('https://integration.example'+path,options));
  const metadata=await request('/chat/config',{headers:{Origin:'https://app.example'}});
  assert.equal(metadata.headers.get('Access-Control-Allow-Origin'),'https://app.example');
  const post={method:'POST',headers:{Origin:'https://app.example','Content-Type':'application/json'},body:JSON.stringify(input)};
  assert.equal((await request('/chat',post)).status,401);
  assert.equal((await request('/chat',{...post,headers:{...post.headers,Origin:'https://other.example'}})).status,403);
  assert.equal((await request('/chat/token',{...post,headers:{'Content-Type':'application/json'}})).status,400);
  assert.equal((await request('/chat',{...post,body:'x'.repeat(100001),headers:{...post.headers,Authorization:'Bearer allowed'}})).status,413);
});
