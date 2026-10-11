process.env.TEST_PWA='1';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  // Real manifest and worker; mocked browser-only install gesture.
  for(const scenario of ['no','accepted','dismissed','fallback','standalone']){
   const context=await browser.newContext(scenario==='fallback'?{viewport:{width:390,height:844},hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 SamsungBrowser/27.0'}:{viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   if(scenario==='standalone')await page.addInitScript(()=>{const original=window.matchMedia.bind(window);window.matchMedia=query=>query==='(display-mode: standalone)'?{matches:true}:original(query)});
   await page.goto(url);await page.waitForFunction(()=>window.MyDay&&document.getElementById('mdAutomaticOrder'));
   const manifest=await page.evaluate(async()=>{const response=await fetch(document.querySelector('link[rel=manifest]').href);if(!response.ok)throw Error('Manifest unavailable');return response.json()});assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');
   for(const size of [192,512]){const icon=manifest.icons.find(x=>x.sizes===`${size}x${size}`);assert(icon);assert.equal(await page.evaluate(async src=>(await fetch(src)).status,icon.src),200)}
   await page.evaluate(()=>navigator.serviceWorker.ready);assert.equal(await page.evaluate(async()=>new URL((await navigator.serviceWorker.getRegistration()).scope).pathname),new URL(url).pathname);
   if(scenario==='standalone'){
    await page.waitForTimeout(3200);assert.equal(await page.locator('#pwaInstallDialog[open]').count(),0);
   }else{
    if(['accepted','dismissed'].includes(scenario))await page.evaluate(outcome=>{
     const event=new Event('beforeinstallprompt',{cancelable:true});event.userChoice=Promise.resolve({outcome});event.prompt=async()=>{window.installCalls=(window.installCalls||0)+1;window.installActive=navigator.userActivation.isActive};window.dispatchEvent(event);
    },scenario==='accepted'?'accepted':'dismissed');
    await page.locator('#pwaInstallDialog').waitFor({state:'visible'});
    if(scenario==='fallback')await page.screenshot({path:'/tmp/pwa-install-android.png'});
    if(scenario==='no')await page.locator('[data-pwa-no]').click();
    else{
     await page.locator('[data-pwa-yes]').click();
     if(scenario!=='fallback'){assert.equal(await page.evaluate(()=>window.installCalls),1);assert.equal(await page.evaluate(()=>window.installActive),true)}
     if(scenario!=='accepted'){assert(await page.locator('[data-pwa-close]').isVisible());if(scenario==='fallback')assert((await page.locator('[data-pwa-message]').textContent()).includes('Samsung Internet'));await page.locator('[data-pwa-close]').click()}
    }
    assert.equal(await page.evaluate(()=>localStorage.getItem('pf_pwa_install_choice_v1')),scenario==='no'?'no':'yes');
    await page.reload();await page.waitForTimeout(3200);assert.equal(await page.locator('#pwaInstallDialog[open]').count(),0,'Answered question must never recur on reload');
   }
   assert.deepEqual(await page.evaluate(()=>caches.keys()),[],'Private data and app files must not enter worker caches');
   assert.deepEqual(errors,[]);await context.close();
  }
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto(url);const cdp=await context.newCDPSession(page);
  const manifest=await cdp.send('Page.getAppManifest');assert.equal(manifest.errors.length,0);assert.equal(JSON.parse(manifest.data).icons.length,2);
  await context.close();
  console.log('PASS: real PWA manifest/icons/worker, native install gesture, accepted/declined/dismissed choices, menu fallback, installed suppression and decision persistence');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
