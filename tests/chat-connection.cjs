const {chromium}=require('playwright');const assert=require('node:assert/strict');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
const service='https://projectflow-integration.brunocesardesouza26.workers.dev';
const config={enabled:true,clientId:'synthetic-public-client',issuer:'https://issuer.example/',redirectUri:service+'/chat/callback',audience:service+'/mcp',repository:'synthetic/private',workspaces:['work','personal'],model:'openai/gpt-6-luna',models:[{id:'openai/gpt-6-luna',name:'Modelo de teste',free:false}]};
(async()=>{const browser=await chromium.launch();try{for(const action of ['retry','reopen','online']){
 const page=await browser.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));let calls=0,allow=false;const nonConfig=[];
 await page.route(service+'/**',async r=>{if(new URL(r.request().url()).pathname!=='/chat/config'){nonConfig.push(r.request().url());return r.abort()}calls++;assert.equal(r.request().method(),'GET');assert.equal(r.request().headers().authorization,undefined);if(!allow)return r.abort('internetdisconnected');await r.fulfill({json:config})});
 await page.goto(url);await page.waitForFunction(()=>!document.getElementById('mdChatRetry').hidden);
 if(action==='reopen')allow=true;
 await page.evaluate(()=>MyDayChat.open());
 if(action!=='reopen'){
  await page.waitForFunction(()=>!document.getElementById('mdChatRetry').disabled&&document.getElementById('mdChatStatus').classList.contains('is-error'));
  assert(calls>=2);assert.equal(await page.locator('#mdChatLogin').isDisabled(),true);assert.equal(await page.locator('#mdChatModel option').count(),0);
  assert((await page.locator('#mdChatStatus').innerText()).includes('conexão inicial'));assert(!(await page.locator('#mdChatStatus').innerText()).includes('antes de repetir uma alteração'));
  assert.equal(await page.locator('#mdChatService').getAttribute('href'),service+'/chat/config');
  allow=true;
  if(action==='retry')await page.locator('#mdChatRetry').click();else await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 }
 await page.waitForFunction(()=>!document.getElementById('mdChatLogin').disabled&&document.getElementById('mdChatModel').options.length===1);assert(await page.locator('#mdChatRetry').isHidden());assert(await page.locator('#mdChatService').isHidden());assert(await page.locator('#mdChatSend').isDisabled(),'Recovery must not log in or send an AI request');assert.deepEqual(nonConfig,[]);assert.deepEqual(errors,[]);await page.close();
 }console.log('PASS: initial configuration failure is identified before login/AI calls; retry/reopen/network-return recover models and login without reloading, authentication or data writes.');}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
