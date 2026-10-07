/* Paginate the complete action-plan document, measuring wrapped text before fitting each sheet. */
window.PlanPrint=(()=>{
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function chunks(text,limit=700){const out=[];let rest=String(text);while(rest.length>limit){let end=rest.lastIndexOf(' ',limit);if(end<limit/2)end=limit;out.push(rest.slice(0,end));rest=rest.slice(end)}if(rest||!out.length)out.push(rest);return out}
  async function prepare(html,value){
    const cfg=GanttPrint.settings(value),portrait=cfg.orientation==='portrait',width=portrait?733:1062,height=portrait?1040:711,bodyHeight=height-54;
    const frame=document.createElement('iframe');frame.dataset.planMeasure='';frame.style.cssText=`position:fixed;left:-20000px;top:0;width:${width}px;height:1px;border:0`;document.body.append(frame);
    try{
      const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();await doc.fonts.ready;
      const style=doc.querySelector('style').textContent,header=doc.querySelector('header'),actionSection=doc.querySelector('.action-plan'),units=[];
      const reportStyle='.plan-content{display:flow-root;font-size:14px}.plan-content td,.plan-content th{padding:8px}.plan-content .number{width:36px;white-space:nowrap;font-size:11px;padding-left:4px;padding-right:4px}.plan-content .action-title{font-size:14px}.plan-content .person,.plan-content .status{font-size:12px}.plan-content .date-chip{font-size:11px;white-space:normal}.plan-content .action-notes{font-size:12px}.plan-content .description{font-size:13px}';
      const measurementStyle=doc.createElement('style');measurementStyle.textContent=reportStyle;doc.head.append(measurementStyle);
      const unit=(type,markup,key=null)=>{const index=units.length;units.push({type,markup,key,index});return index};
      unit('header',header.outerHTML);
      const contexts=new Map();
      for(const section of doc.querySelectorAll('.document-section')){
        const key=section.classList.contains('agenda')?'agenda':'notes';contexts.set(key,section.cloneNode(true));
        const content=key==='agenda'?[...section.querySelectorAll('li')].map(li=>li.textContent):chunks(section.querySelector('.section-content').textContent);
        for(const text of content)unit('context',text,key);
      }
      for(const row of actionSection.querySelectorAll('tbody tr')){
        const notes=row.querySelector('.action-notes'),parts=notes?chunks(notes.textContent):[''];
        for(let i=0;i<parts.length;i++){const copy=row.cloneNode(true);if(notes)copy.querySelector('.action-notes').textContent=parts[i];if(i)copy.querySelector('.action-title').textContent+=' (continuação)';unit('action',copy.outerHTML)}
      }
      function content(items,mark=false){
        const root=doc.createElement('div');root.className='plan-content';
        for(let i=0;i<items.length;){const u=items[i];
          if(u.type==='header'){const clone=header.cloneNode(true);if(mark)clone.dataset.printUnit=u.index;root.append(clone);i++;continue}
          const segment=[];while(i<items.length&&items[i].type===u.type&&items[i].key===u.key)segment.push(items[i++]);
          if(u.type==='context'){
            const section=contexts.get(u.key).cloneNode(true),old=section.querySelector(u.key==='agenda'?'ul':'.section-content'),box=doc.createElement(u.key==='agenda'?'ul':'div');box.className=old.className;
            for(const entry of segment){const line=doc.createElement(u.key==='agenda'?'li':'p');line.textContent=entry.markup;if(u.key==='notes')line.style.margin='0';if(mark)line.dataset.printUnit=entry.index;box.append(line)}old.replaceWith(box);root.append(section);
          }else{
            const section=actionSection.cloneNode(true),tbody=section.querySelector('tbody');tbody.innerHTML=segment.map(entry=>entry.markup).join('');if(mark)[...tbody.rows].forEach((row,n)=>row.dataset.printUnit=segment[n].index);root.append(section);
          }
        }return root;
      }
      let pages=Math.min(cfg.pages,Math.max(1,units.length)),scale=1,groups=[],rendered=[],maxHeight=0;
      // Reflow into a wider logical table as fonts shrink; the printed table still spans one sheet.
      for(let pass=0;pass<8;pass++){
        const logicalWidth=width/scale;frame.style.width=logicalWidth+'px';doc.body.replaceChildren(content(units,true));doc.body.style.cssText=`width:${logicalWidth}px;background:white`;
        const weights=units.map(u=>Math.max(1,doc.querySelector(`[data-print-unit="${u.index}"]`).getBoundingClientRect().height)),total=weights.reduce((a,b)=>a+b,0);groups=[];let index=0,used=0;
        if(pass===0&&value?.pages==='auto')pages=Math.min(50,units.length,Math.max(1,Math.ceil(total/(bodyHeight-120))));
        for(let page=0;page<pages;page++){
          const start=index,target=total*(page+1)/pages,max=units.length-(pages-page-1);
          do{used+=weights[index++]}while(index<max&&(page===pages-1||used+weights[index]/2<target));groups.push(units.slice(start,index));
        }
        rendered=groups.map(group=>content(group));doc.body.replaceChildren(...rendered);maxHeight=Math.max(...rendered.map(node=>node.getBoundingClientRect().height));
        if(maxHeight*scale<=bodyHeight-.5)break;scale*=Math.min(.98,(bodyHeight-1)/(maxHeight*scale));
      }
      // Final safeguard for exceptionally tall rows: fit the entire measured content, without clipping.
      const fit=Math.min(1,(bodyHeight-1)/(maxHeight*scale));
      const title=doc.title,sheets=rendered.map((node,page)=>`<section class="plan-sheet"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${esc(title)} — página ${page+1}"><text x="0" y="17" font-family="Arial,Segoe UI,sans-serif" font-size="12" fill="#526074">${esc(title.length>95?title.slice(0,92)+'…':title)}</text><text x="${width}" y="17" text-anchor="end" font-family="Arial,Segoe UI,sans-serif" font-size="10" fill="#526074">Página ${page+1} de ${pages}</text><g transform="translate(0 30) scale(${scale*fit})"><foreignObject x="0" y="0" width="${width/scale}" height="${maxHeight+2}"><div xmlns="http://www.w3.org/1999/xhtml">${node.outerHTML}</div></foreignObject></g><text x="0" y="${height-6}" font-family="Arial,Segoe UI,sans-serif" font-size="9" fill="#526074">Plano completo · 1 página na largura · ${pages} na altura</text></svg></section>`).join('');
      return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${style}\n${reportStyle}\n@page{size:auto;margin:8mm}html,body{margin:0;padding:0;background:white}body{font-size:10px}.plan-sheet{width:100%;height:calc(100vh - 18mm);break-inside:avoid;break-after:page;page-break-inside:avoid;page-break-after:always}.plan-sheet:last-child{break-after:auto;page-break-after:auto}.plan-sheet>svg{display:block;width:100%;height:100%}.plan-content header,.plan-content .document-section,.plan-content .action-plan{break-inside:auto}svg text{white-space:pre}.action-plan table{max-width:100%}@media screen{body{background:#e8ebf0}.plan-sheet{width:${portrait?194:281}mm;height:${portrait?281:194}mm;background:white;margin:12px auto}}@media print{body{background:white}}</style></head><body data-plan-print-pages="${pages}" data-plan-print-scale="${scale*fit}" data-plan-print-orientation="${cfg.orientation}">${sheets}</body></html>`;
    }finally{frame.remove()}
  }
  function show(html,count){
    closePopups();closeEditor();const overlay=document.createElement('div'),modal=document.createElement('div');overlay.className='popup-overlay';modal.className='modal ap-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const parsed=new DOMParser().parseFromString(html,'text/html'),context=[...parsed.querySelectorAll('.document-section')].map(e=>e.textContent).join('');
    modal.innerHTML=`<h3>Imprimir / salvar plano em PDF</h3><form><p>Inclui todas as ações do plano selecionado e seus subplanos, conforme “Incluir subplanos”, além de participantes, agenda e notas.</p><label>Orientação do relatório<select id="planPdfOrientation"><option value="landscape">Paisagem</option><option value="portrait">Retrato</option></select></label><label>Páginas na altura<input id="planPdfPages" type="number" min="1" max="50" value="${Math.max(1,Math.min(50,Math.ceil(count/10+context.length/1800)))}"></label><p>Uma página na largura. Mais páginas deixam o texto maior. Na janela de impressão, escolha a mesma orientação para aproveitar melhor o papel.</p><p id="planPdfError" role="alert"></p><div class="modal-actions"><button type="button" id="planPdfCancel">Cancelar</button><button class="act" type="submit">Imprimir / PDF</button></div></form>`;
    document.body.append(overlay,modal);const cancel=()=>{overlay.remove();modal.remove()};overlay.onclick=cancel;modal.querySelector('#planPdfCancel').onclick=cancel;modal.querySelector('#planPdfPages').focus();
    const input=modal.querySelector('#planPdfPages'),orientation=modal.querySelector('#planPdfOrientation');let edited=false,suggestion=0;input.oninput=()=>edited=true;
    async function suggest(){const request=++suggestion;try{const report=await prepare(html,{pages:'auto',orientation:orientation.value});if(modal.isConnected&&!edited&&request===suggestion)input.value=new DOMParser().parseFromString(report,'text/html').body.dataset.planPrintPages}catch{}}
    orientation.onchange=suggest;suggest();
    modal.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=modal.querySelector('[type=submit]');button.disabled=true;button.textContent='Preparando…';try{const options={pages:modal.querySelector('#planPdfPages').value,orientation:modal.querySelector('#planPdfOrientation').value},report=await prepare(html,options);if(!modal.isConnected)return;cancel();GanttPrint.print(report)}catch(error){modal.querySelector('#planPdfError').textContent='Falha ao preparar o PDF: '+error.message;button.disabled=false;button.textContent='Imprimir / PDF'}};
  }
  return {prepare,show};
})();
