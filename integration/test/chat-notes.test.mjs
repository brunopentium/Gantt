import test from 'node:test';
import assert from 'node:assert/strict';
import { chatNotes } from '../src/chat-notes.mjs';
import { createWorkerHandler } from '../src/worker.mjs';
import { httpConfig } from '../src/auth.mjs';
import { IntegrationError } from '../src/store.mjs';
const core=globalThis.NotesEditCore;
const env={OPENROUTER_API_KEY:'synthetic-provider-secret',GITHUB_TOKEN:'synthetic-repo-secret',PROJECTFLOW_WORKSPACES:'work,personal'};
const principal={subject:'bruno',scopes:['projectflow:read','projectflow:write']};
const page={id:'p',kind:'page',title:'Inspeção',parentId:'book',background:'blank',objects:[{id:'text',type:'text',x:40,y:40,w:300,h:100,rotation:0,color:'#25364a',fontSize:20,bold:false,text:'Conteúdo original'},{id:'table',type:'table',x:40,y:200,w:360,h:120,rotation:0,color:'#25364a',fontSize:20,header:true,cells:[['Teste','Status'],['EMC','Pendente']]}]};
const input={workspace:'work',model:'openai/gpt-6-luna',prompt:'Acrescente próximos passos sem apagar o conteúdo original.',page};
const response={reply:'Preparei uma proposta para revisão.',operations:[{type:'add_text',text:'☐ Validar amostra'}]};
const responder=inspect=>async(url,options)=>{assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');const body=JSON.parse(options.body);assert(!options.body.includes(env.GITHUB_TOKEN));assert.equal(body.tools,undefined);inspect?.(body);return Response.json({choices:[{message:{content:JSON.stringify(response)}}]})};
test('Notes proposals use the selected model and workspace, require explicit review, and never execute data tools',async()=>{
 for(const workspace of ['work','personal']){const result=await chatNotes(env,principal,{...input,workspace},{fetcher:responder(body=>{assert.equal(body.model,input.model);assert(body.messages[0].content.includes(workspace));assert(body.messages[0].content.includes('não confiáveis'));assert(body.messages[1].content.includes('Conteúdo original'))})});assert.equal(result.notesEdit,true);assert.equal(result.workspace,workspace);assert.deepEqual(result.operations,response.operations);assert.equal(result.token,undefined);assert.equal(result.saved,undefined)}
});
test('strict operation planning preserves originals, scopes object IDs, places additions below content, and creates only child pages',()=>{
 const before=structuredClone(page);let sequence=0;const plan=core.plan(page,[{type:'update_text',id:'text',text:'Conteúdo original\nPróximo passo'},{type:'update_table',id:'table',cells:[['Teste','Status'],['EMC','Aprovado']]},{type:'add_text',text:'Lista'},{type:'add_shape',shape:'arrow',x:500,y:50,w:200,h:80},{type:'create_page',title:'Detalhes',text:'Estudo'},{type:'update_page',paperColor:'cream'}],()=>`new-${++sequence}`);
 assert.deepEqual(page,before);assert.equal(plan.newPages[0].parentId,page.id);assert(plan.page.objects.find(o=>o.text==='Lista').y>=344);assert.equal(plan.page.paperColor,'cream');assert.equal(plan.changes.length,6);
 const invalid=[{type:'update_text',id:'foreign',text:'x'},{type:'update_text',id:'table',text:'x'},{type:'update_text',id:'text',text:'x',script:'danger'},{type:'move_object',id:'text',x:-1},{type:'add_shape',shape:'iframe',w:10,h:10},{type:'add_text',text:'x',color:'url(attacker)'},{type:'create_page',title:'Página',parentId:'foreign'},{type:'delete_page',id:'p'},{type:'update_table',id:'table',cells:[['x'],['x','y']]}];
 for(const op of invalid)assert.throws(()=>core.plan(page,[op],()=>`new-${++sequence}`));assert.deepEqual(page,before);
});
test('auth, workspace, metadata/body bounds and invalid model output fail before any app mutation',async()=>{
 let calls=0;const never=async()=>{calls++;throw Error('no call')};
 await assert.rejects(chatNotes(env,{...principal,scopes:['projectflow:read']},input,{fetcher:never}),{code:'insufficient_scope'});
 await assert.rejects(chatNotes({...env,PROJECTFLOW_WORKSPACES:'work'},principal,{...input,workspace:'personal'},{fetcher:never}),{code:'workspace_forbidden'});
 for(const raw of [{...input,page:{...page,secret:'do not forward'}},{...input,page:{...page,objects:[{...page.objects[0],base64:'do not forward'}]}},{...input,page:{...page,objects:[{...page.objects[0],text:'é'.repeat(40000)}]}},{...input,model:'unknown/model'}])await assert.rejects(chatNotes(env,principal,raw,{fetcher:never}));assert.equal(calls,0);
 for(const content of ['not json',JSON.stringify({reply:'salvo',operations:[{type:'remove_object',id:'foreign'}]}),JSON.stringify({reply:'x',operations:[],saved:true})])await assert.rejects(chatNotes(env,principal,input,{fetcher:async()=>Response.json({choices:[{message:{content}}]})}),{code:'model_response'});
});
test('free-model proposals preserve zero-price limits and never retry or execute unexpected tool calls',async()=>{
 let calls=0;await assert.rejects(chatNotes(env,principal,{...input,model:'openrouter/free'},{fetcher:async(url,options)=>{calls++;assert.deepEqual(JSON.parse(options.body).provider.max_price,{prompt:0,completion:0,request:0});return Response.json({error:{}},{status:402})}}),{code:'model_unavailable'});assert.equal(calls,1);
 await assert.rejects(chatNotes(env,principal,input,{fetcher:async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'update_task'}}]}}]})}),{code:'model_response'});
});
test('group proposals preserve members and geometry, reject foreign IDs and invalidate reviewed OCR metadata on correction',()=>{
 let sequence=0;const grouped=core.plan(page,[{type:'group_objects',ids:['text','table']}],()=>`group-${++sequence}`).page;assert(grouped.objects[0].groupId);assert.equal(grouped.objects[0].groupId,grouped.objects[1].groupId);assert.equal(grouped.objects[0].x,page.objects[0].x);
 const ungrouped=core.plan(grouped,[{type:'ungroup_objects',ids:['text']}],()=>`group-${++sequence}`).page;assert(ungrouped.objects.every(o=>!o.groupId));assert.throws(()=>core.plan(page,[{type:'group_objects',ids:['text','foreign']}],()=>`group-${++sequence}`));
 const original={...page,objects:[{...page.objects[0],id:'image',type:'image',caption:'Imagem',ocr:'Original',ocrInfo:{engine:'tesseract.js@6.0.1'}}]};const corrected=core.plan(original,[{type:'update_image_text',id:'image',ocr:'Revisado'}],()=>`group-${++sequence}`).page;assert.equal(corrected.objects[0].ocr,'Revisado');assert.equal(corrected.objects[0].ocrInfo,undefined);assert(original.objects[0].ocrInfo);
});
test('Worker routes Notes proposals through auth/origin/rate limits, preserves normal body limit, and never instantiates Store',async()=>{
 const config=httpConfig({PUBLIC_URL:'https://integration.example',OAUTH_ISSUER:'https://issuer.example/',OAUTH_JWKS_URL:'https://issuer.example/jwks',OAUTH_SUBJECTS:'bruno'});let stores=0;
 const handler=createWorkerHandler({config,env,storeFactory:()=>{stores++;throw Error('No Store for local Notes proposals')},authenticate:async value=>{if(value!=='Bearer synthetic')throw new IntegrationError('unauthorized','Login',401);return {...principal,subject:'notes-test'}},notesHandler:(e,p,v)=>chatNotes(e,p,v,{fetcher:responder()})});
 const post=(value,headers={})=>handler(new Request(config.publicUrl+'/chat/notes',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic',Origin:config.publicUrl,...headers},body:JSON.stringify(value)}));
 assert.equal((await post(input,{Authorization:''})).status,401);assert.equal((await post(input,{Origin:'https://foreign.example'})).status,403);assert.equal((await post(input)).status,200);assert.equal((await post({...input,extra:'x'.repeat(100001)})).status,413);assert.equal(stores,0);
});
test('inline style runs survive assistant text and table edits and unsafe formatting is rejected',async()=>{
 const rich=structuredClone(page);rich.objects[0].richText=[{start:0,end:8,bold:true,fontSize:32}];rich.objects[1].richCells=[[[],[]],[[{start:0,end:3,italic:true}],[]]];
 const result=await chatNotes(env,principal,{...input,page:rich},{fetcher:responder(body=>assert(body.messages[1].content.includes('richText')))});assert.equal(result.notesEdit,true);
 const plan=core.plan(rich,[{type:'update_text',id:'text',text:'Conteúdo original\nMais texto'},{type:'update_table',id:'table',cells:[['Novo','Novo'],['Teste','Status'],['EMC','Pendente']]}],()=>crypto.randomUUID());
 assert.deepEqual(plan.page.objects[0].richText,rich.objects[0].richText);assert.deepEqual(plan.page.objects[1].richCells[2][0],rich.objects[1].richCells[1][0]);
 for(const bad of [{start:0,end:9999,bold:true},{start:0,end:3,color:'red;position:fixed'},{start:0,end:3,href:'https://evil.example'}]){const value=structuredClone(rich);value.objects[0].richText=[bad];await assert.rejects(chatNotes(env,principal,{...input,page:value},{fetcher:async()=>{throw Error('must not call')}}),{code:'invalid_input'})}
});
