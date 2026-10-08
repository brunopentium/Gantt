const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const makePlan=title=>({id:'plan1',title,description:'',source:null,actions:[{id:'a1',title:'Ação',owner:'Bruno',start:'2026-10-05',end:'2026-10-09',status:'pending',notes:'',link:null}]});
 const original=[makePlan('Original')],newer=[makePlan('Remoto atualizado')];
 for(const [local,expected] of [[[] ,[]],[original,newer],[[makePlan('Edição local não salva')],[makePlan('Edição local não salva')]]]){
  const context=await browser.newContext();const page=await context.newPage();page.on('dialog',d=>d.accept());
  const base={version:1,activeProjectId:'p1',projects:[{id:'p1',title:'Cronograma',tasks:[{id:'t1',name:'Tarefa',start:'2026-10-05',end:'2026-10-09',dur:5,unit:'cd',pred:'',pct:0,indent:0,mile:false}]}]};
  await context.addInitScript(({base,local,original})=>{localStorage.setItem('pf_projects_v1',JSON.stringify({...base,actionPlans:local}));localStorage.setItem('pf_github_backup_v1',JSON.stringify({repo:'brunopentium/gantt-backups',enabled:true,sha:'old',branch:'main',fingerprint:JSON.stringify({...base,actionPlans:original})}));sessionStorage.setItem('pf_github_backup_v1_token',JSON.stringify('test-token'))},{base,local,original});
  await page.route('https://api.github.com/repos/**',async route=>{const url=new URL(route.request().url());if(url.pathname.includes('/contents/backups/cronogramas.json'))return route.fulfill({json:{sha:'old',content:Buffer.from(JSON.stringify({...base,actionPlans:newer})).toString('base64')}});if(url.pathname.includes('/contents/'))return route.fulfill({status:404,json:{}});return route.fulfill({json:{private:true,has_pages:false,default_branch:'main'}})});
  await page.goto('http://127.0.0.1:8765');await page.waitForFunction(()=>document.querySelector('#apCloudStatus').textContent.includes('first action-plan version'));assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()),expected);await context.close();
 }
 await browser.close();console.log('PASS: legacy migration preserves unsaved plan edits and deletions, and loads newer legacy plans when the local version was clean');
})().catch(e=>{console.error(e);process.exit(1)});
