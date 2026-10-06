const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let remote=null,puts=0,isPrivate=true,fail=false,payload;
 await page.route('https://api.github.com/repos/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  assert.equal(req.headers().authorization,'Bearer test-token');
  if(fail)return route.fulfill({status:401,json:{}});
  if(!url.pathname.includes('/contents/'))return route.fulfill({json:{private:isPrivate,has_pages:false,default_branch:'main'}});
  if(req.method()==='PUT'){
   payload=req.postDataJSON();puts++;remote={sha:'sha'+puts,content:payload.content};return route.fulfill({json:{content:{sha:remote.sha}}});
  }
  return route.fulfill(remote?{json:remote}:{status:404,json:{}});
 });
 await page.goto('http://127.0.0.1:8765');
 assert.equal(await page.locator('.tr').count(),20);
 async function configure(button='gbSave'){
  await page.click('#btnCloudBackup');await page.fill('#gbRepo','brunopentium/gantt-backups');await page.fill('#gbToken','test-token');await page.click('#'+button);
 }
 await configure();await page.waitForFunction(()=>document.querySelector('#cloudBackupStatus').textContent.includes('Backup salvo'));
 assert.equal(puts,1);assert.equal(payload.branch,'main');
 const exported=JSON.parse(Buffer.from(payload.content,'base64').toString());
 assert.equal(exported.projects[0].tasks.length,20);assert(!JSON.stringify(exported).includes('test-token'));
 assert.equal(await page.evaluate(()=>localStorage.getItem('pf_github_backup_v1_token')),null);
 await page.clock.install();await page.click('#btnAdd');await page.clock.fastForward(61000);
 await page.waitForFunction(()=>document.querySelector('#cloudBackupStatus').textContent.includes('Backup salvo'));
 assert.equal(puts,2);assert.equal(payload.sha,'sha1');
 await page.evaluate(()=>T[0].name='Projeto café 🗓');await page.evaluate(()=>{recalc();render()});
 await page.clock.fastForward(61000);await page.waitForFunction(()=>document.querySelector('#cloudBackupStatus').textContent.includes('Backup salvo'));
 assert.equal(puts,3);assert.equal(JSON.parse(Buffer.from(remote.content,'base64').toString()).projects[0].tasks[0].name,'Projeto café 🗓');
 remote.sha='other-device';await page.click('#btnAdd');await page.clock.fastForward(61000);
 await page.waitForFunction(()=>document.querySelector('#cloudBackupStatus').textContent.includes('remoto diferente'));assert.equal(puts,3);
 const valid=remote.content;remote.content=Buffer.from('{"version":1,"projects":[{"id":"x","title":"Bad","tasks":[{}]}]}').toString('base64');
 await configure('gbRestore');await page.waitForFunction(()=>document.querySelector('#cloudBackupStatus').textContent.includes('Falha ao restaurar'));
 assert.equal(await page.locator('.tr').count(),22);
 remote.content=valid;page.once('dialog',d=>d.accept());await configure('gbRestore');
 await page.waitForFunction(()=>document.querySelector('#cloudBackupStatus').textContent==='Backup restaurado');assert.equal(await page.locator('.tr').count(),21);
 fail=true;await page.click('#btnAdd');await page.clock.fastForward(61000);await page.waitForFunction(()=>document.querySelector('#cloudBackupStatus').textContent.includes('Token inválido'));assert.equal(puts,3);
 fail=false;isPrivate=false;await configure();await page.waitForFunction(()=>document.querySelector('#cloudBackupStatus').textContent.includes('repositório privado'));assert.equal(puts,3);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: render, initial and timed backup, Unicode, credential isolation, remote conflict, invalid restore, valid restore, expired token and public repository rejection');
})().catch(e=>{console.error(e);process.exit(1)});
