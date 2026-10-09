const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.GANTT_TEST_URL||'http://127.0.0.1:8765';
function unzip(bytes){const data=Buffer.from(bytes),files={};let offset=0;while(data.readUInt32LE(offset)===0x04034b50){const size=data.readUInt32LE(offset+18),names=data.readUInt16LE(offset+26),extra=data.readUInt16LE(offset+28),name=data.toString('utf8',offset+30,offset+30+names),start=offset+30+names+extra;files[name]=data.toString('utf8',start,start+size);offset=start+size}return files}
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    await page.evaluate(()=>{
      const action=(id,owner='')=>({id,title:'Action '+id,owner,start:'2026-10-09',end:'2026-10-20',status:'pending',notes:'',link:null});
      ActionPlans.load([{id:'parent',title:'Parent',actions:[action('parent-action')]},{id:'child',parentId:'parent',title:'Child',document:{participants:['Child participant']},actions:[action('child-action','Child existing owner')]},{id:'sibling',parentId:'parent',title:'Sibling',document:{participants:['Sibling participant']},actions:[action('sibling-action','Sibling owner')]},{id:'other',title:'Other',document:{participants:['Unrelated participant']},actions:[action('other-action')]}]);save();
    });
    await page.click('#tabActions');
    const people=['Bruno Souza','Ana','Carlos','Diana','Elisa','Fabio','Gabriela','Helena','Igor','Julia','Ana <literal>'];
    await page.click('#apAddSection');await page.click('[data-add-section="participants"]');await page.fill('#apSectionValue',people.join('\n')+'\nAna');await page.locator('.ap-modal button[type=submit]').click();
    assert.equal(await page.locator('.ap-participant-list .ap-person').count(),people.length);
    const colors=await page.locator('.ap-participant-list .ap-person').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.lastElementChild.textContent,node.style.getPropertyValue('--person-ink')])));
    assert.equal(new Set(Object.values(colors)).size,people.length,'More than six participants must still have distinct colors');
    const owner=id=>page.locator(`[data-action="${id}"][data-field="owner"]`);
    await owner('parent-action').click();
    const choices=await page.locator('.ap-choice').allTextContents();assert.deepEqual(new Set(choices),new Set(['Unassigned',...people]));
    const chosen=page.getByRole('button',{name:'Diana',exact:true});assert.equal(await chosen.locator('.ap-owner-dot').getAttribute('style'),'background:'+colors.Diana);
    await chosen.click();assert.equal(await owner('parent-action').locator('.ap-person').evaluate(node=>node.style.getPropertyValue('--person-ink')),colors.Diana);
    await page.click('#apUndo');assert.equal(await page.evaluate(()=>ActionPlans.exportData()[0].actions[0].owner),'');
    await page.click('#apCards');await owner('parent-action').click();await page.getByRole('button',{name:'Diana',exact:true}).click();
    // Aggregate rows use their source plan, inheriting ancestor participants without sibling leakage.
    await owner('child-action').click();const childChoices=await page.locator('.ap-choice').allTextContents();assert(childChoices.includes('Child participant')&&childChoices.includes('Bruno Souza')&&childChoices.includes('Child existing owner'));assert(!childChoices.includes('Sibling participant')&&!childChoices.includes('Sibling owner')&&!childChoices.includes('Unrelated participant'));
    await page.getByRole('button',{name:'Child participant',exact:true}).click();assert.equal(await page.evaluate(()=>ActionPlans.exportData()[1].actions[0].owner),'Child participant');
    // The full action editor and new-action form expose the same colored roster and allow custom text.
    await page.locator('[data-edit="parent-action"]').click();assert.equal(await page.locator('[data-select-owner]').count(),people.length);await page.locator('[data-select-owner="Elisa"]').click();assert.equal(await page.locator('#apOwner').inputValue(),'Elisa');await page.locator('.ap-modal button[type=submit]').click();
    await page.click('#apAddAction');await page.fill('#apActionTitle','New participant action');await page.fill('#apOwner','bruno');assert.deepEqual(await page.locator('[data-select-owner]').allTextContents(),['Bruno Souza']);await page.locator('[data-select-owner="Bruno Souza"]').click();await page.locator('.ap-modal button[type=submit]').click();
    await page.click('#apAddAction');await page.fill('#apActionTitle','Custom owner action');await page.fill('#apOwner','Outside roster');await page.locator('.ap-modal button[type=submit]').click();assert.equal(await page.evaluate(()=>ActionPlans.exportData()[0].actions.at(-1).owner),'Outside roster');
    const before=await page.evaluate(()=>ActionPlans.exportData());await page.reload();await page.click('#tabActions');assert.deepEqual(await page.evaluate(()=>ActionPlans.exportData()),before);
    const afterColors=await page.locator('.ap-participant-list .ap-person').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.lastElementChild.textContent,node.style.getPropertyValue('--person-ink')])));
    // All surfaces share the registry, including PDF and Excel cell styles.
    const report=await page.evaluate(async()=>{const p=ActionPlans.exportData()[0];return {html:PlanExports.pdfHTML(p,()=>null),bytes:Array.from(new Uint8Array(await PlanExports.build(p,()=>null).arrayBuffer()))}});
    const files=unzip(report.bytes);
    const exported=await page.evaluate(({html,files})=>{
      const pdf=new DOMParser().parseFromString(html,'text/html'),styles=new DOMParser().parseFromString(files['xl/styles.xml'],'application/xml'),sheet=new DOMParser().parseFromString(files['xl/worksheets/sheet2.xml'],'application/xml');
      const ownerCell=sheet.querySelector('c[r="C7"]'),style=styles.querySelector('cellXfs').children[Number(ownerCell.getAttribute('s'))],fill=styles.querySelector('fills').children[Number(style.getAttribute('fillId'))].querySelector('fgColor').getAttribute('rgb').slice(-6);
      return {participants:Object.fromEntries([...pdf.querySelectorAll('.participants .person')].map(node=>[node.lastElementChild.textContent,node.style.getPropertyValue('--person-ink')])),ownerFill:'#'+fill,pdfOwner:pdf.querySelector('.action-plan tbody .person').style.getPropertyValue('--person-bg')};
    },{html:report.html,files});
    assert.deepEqual(exported.participants,afterColors);assert.equal(exported.ownerFill,exported.pdfOwner);
    await page.setViewportSize({width:390,height:844});await owner('parent-action').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.getByRole('button',{name:'Ana <literal>',exact:true}).click();assert.equal(await page.locator('#actionPanel script').count(),0);
    assert.deepEqual(errors,[]);console.log('PASS: participant choices before assignment, unique colors beyond six, inline/table/cards/new/edit forms, scoped hierarchy, custom owners, undo/persistence, PDF/Excel color consistency, mobile and escaped names');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
