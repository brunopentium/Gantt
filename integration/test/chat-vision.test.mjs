import test from 'node:test';
import assert from 'node:assert/strict';
import { chatVision } from '../src/chat-vision.mjs';
import { chatConfig } from '../src/chat-http.mjs';
import { createWorkerHandler } from '../src/worker.mjs';
import { httpConfig } from '../src/auth.mjs';
import { chatModels } from '../src/chat-models.mjs';
import { IntegrationError } from '../src/store.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP3sAAAAASUVORK5CYII=';
const env={OPENROUTER_API_KEY:'fake-model-secret',GITHUB_TOKEN:'fake-github-secret',PROJECTFLOW_WORKSPACES:'work,personal',CHAT_CLIENT_ID:'public'};
const principal={subject:'bruno',scopes:['projectflow:read']};
const image={nodeId:'page',objectId:'image',caption:'Diagrama',path:'Estudo / Página',ocr:'Texto de referência',mime:'image/png',base64:png};
const input={workspace:'work',model:'openai/gpt-6-luna',prompt:'Explique o diagrama e compare as imagens.',images:[image,{...image,objectId:'image2'}]};
const responder=inspect=>async(url,opts)=>{assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(opts.redirect,'manual');assert.equal(opts.headers.Authorization,'Bearer fake-model-secret');assert(!opts.body.includes(env.GITHUB_TOKEN));inspect?.(JSON.parse(opts.body));return Response.json({choices:[{message:{content:'A imagem [I1] mostra o diagrama.'}}]})};
test('visual chat sends explicit image parts and metadata only to the selected provider, without tools or drafts',async()=>{
 for(const workspace of ['work','personal']){let calls=0;const result=await chatVision(env,principal,{...input,workspace},{fetcher:responder(body=>{calls++;assert.equal(body.model,input.model);assert.equal(body.tools,undefined);assert.equal(body.tool_choice,undefined);assert.equal(body.messages.length,2);assert(body.messages[0].content.includes(workspace));assert(body.messages[0].content.includes('somente leitura'));const parts=body.messages[1].content;assert.equal(parts.filter(p=>p.type==='image_url').length,2);assert(parts.some(p=>p.type==='image_url'&&p.image_url.url==='data:image/png;base64,'+png));assert(parts.some(p=>p.type==='text'&&p.text.includes('Diagrama')));})});assert.equal(calls,1);assert.equal(result.draft,null);assert.equal(result.vision,true);assert.equal(result.workspace,workspace)}
});
test('auth, workspace, model and image validation reject unsafe requests before the provider is called',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not call')};
 const invalid=[{...input,images:[]},{...input,images:[image,image,image]},{...input,images:[{...image,base64:'https://attacker.example/picture.png'}]},{...input,images:[{...image,mime:'image/svg+xml'}]},{...input,images:[{...image,base64:Buffer.from('<script>x</script>').toString('base64')}]},{...input,images:[{...image,base64:png+'='}]},{...input,images:[{...image,base64:'A'.repeat(1200004)}]},{...input,images:[{...image,url:'https://attacker.example'}]},{...input,prompt:'x'.repeat(8001)},{...input,model:'deepseek/deepseek-v4-pro-0813'},{...input,model:'unknown/model'}];
 for(const value of invalid)await assert.rejects(chatVision(env,principal,value,{fetcher}));
 await assert.rejects(chatVision(env,{...principal,scopes:[]},input,{fetcher}),{code:'insufficient_scope'});
 await assert.rejects(chatVision({...env,PROJECTFLOW_WORKSPACES:'work'},principal,{...input,workspace:'personal'},{fetcher}),{code:'workspace_forbidden'});assert.equal(calls,0);
});
test('visual free models never fall back to paid models; model failures and attempted tool calls never become saved changes',async()=>{
 let calls=0;await assert.rejects(chatVision(env,principal,{...input,model:'openrouter/free'},{fetcher:async(url,opts)=>{calls++;const body=JSON.parse(opts.body);assert.deepEqual(body.provider.max_price,{prompt:0,completion:0,request:0});return Response.json({error:{message:'secret private upstream detail'}},{status:429})}}),e=>{assert(!e.message.includes('private upstream'));return e.code==='model_unavailable'});assert.equal(calls,1);
 await assert.rejects(chatVision(env,principal,input,{fetcher:async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'update_task'}}]}}]})}),{code:'model_response'});
});
test('configuration advertises checked image models and limits, while unknown custom models are never presumed visual',()=>{
 const config=chatConfig(env,{issuer:'https://issuer.example',audience:'a',publicUrl:'https://service.example'});assert.equal(config.features.vision.version,1);assert.equal(config.features.vision.maxImages,2);assert(config.models.find(m=>m.id==='openai/gpt-6-luna').vision);assert(!config.models.find(m=>m.id==='deepseek/deepseek-v4-pro-0813').vision);assert.equal(chatModels({OPENROUTER_MODEL:'custom/unknown'})[0].vision,false);
});
test('Worker authenticates visual requests, keeps larger bodies restricted to vision, and never creates a data store',async()=>{
 const config=httpConfig({PUBLIC_URL:'https://integration.example',OAUTH_ISSUER:'https://issuer.example/',OAUTH_JWKS_URL:'https://issuer.example/jwks',OAUTH_SUBJECTS:'bruno'});let stores=0,providerCalls=0;
 const handler=createWorkerHandler({config,env,storeFactory:()=>{stores++;throw Error('not for visual analysis')},authenticate:async token=>{if(token!=='Bearer synthetic')throw new IntegrationError('unauthorized','Login necessário',401);return principal},visionHandler:(e,p,v)=>chatVision(e,p,v,{fetcher:responder(()=>providerCalls++)})});
 const post=(path,body,headers={})=>handler(new Request(config.publicUrl+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic',Origin:config.publicUrl,...headers},body:JSON.stringify(body)}));
 assert.equal((await post('/chat/vision',input,{Authorization:''})).status,401);assert.equal((await post('/chat/vision',input,{Origin:'https://attacker.example'})).status,403);
 assert.equal((await post('/chat/vision',input)).status,200);assert.equal(providerCalls,1);assert.equal(stores,0);const large=Buffer.alloc(900000);Buffer.from(png,'base64').copy(large);const maxImage={...image,base64:large.toString('base64')};assert.equal((await post('/chat/vision',{...input,images:[maxImage,maxImage]})).status,200);assert.equal(providerCalls,2);
 assert.equal((await post('/chat/vision',{...input,extra:'x'.repeat(2600000)})).status,413);
 assert.equal((await post('/chat',{extra:'x'.repeat(100001)})).status,413);
 assert.equal((await post('/api',{extra:'x'.repeat(100001)})).status,413);assert.equal(stores,0);
});
test('image extraction returns bounded text or rectangular table proposals without executing tools or accessing a store',async()=>{
 for(const output of ['text','table']){const extraction=output==='text'?{kind:'text',text:'Transcrição\n[ilegível]'}:{kind:'table',cells:[['Nome','Data'],['Ana','[ilegível]']]};const result=await chatVision(env,principal,{...input,output},{fetcher:async(url,opts)=>{const body=JSON.parse(opts.body);assert.equal(body.tools,undefined);assert.match(body.messages[0].content,/SOMENTE JSON/);return Response.json({choices:[{message:{content:JSON.stringify({reply:'Confira os trechos ilegíveis [I1].',extraction})}}]})}});assert.deepEqual(result.extraction,extraction);assert.equal(result.draft,null)}
 for(const extraction of [{kind:'table',cells:[['A'],['B','C']]},{kind:'table',cells:Array.from({length:31},()=>['x'])},{kind:'table',cells:[Array(16).fill('x')]},{kind:'table',cells:[['x'.repeat(2001)]]},{kind:'table',cells:[['x']],operations:[{type:'remove_object',id:'any'}]}])await assert.rejects(chatVision(env,principal,{...input,output:'table'},{fetcher:async()=>Response.json({choices:[{message:{content:JSON.stringify({reply:'Proposta',extraction})}}]})}),{code:'model_response'});
 await assert.rejects(chatVision(env,principal,{...input,output:'text'},{fetcher:async()=>Response.json({choices:[{message:{content:'invalid JSON'}}]})}),{code:'model_response'});
 let calls=0;await assert.rejects(chatVision(env,principal,{...input,output:'execute'},{fetcher:async()=>{calls++;throw Error()}}),{code:'invalid_input'});assert.equal(calls,0);
});
