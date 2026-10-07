/* Vector print report: table and timeline share each row and the same page scale. */
window.GanttPrint=(()=>{
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function settings(value){const s=typeof value==='number'?{pages:value}:value||{};return {pages:Math.max(1,Math.min(50,parseInt(s.pages)||1)),orientation:s.orientation==='portrait'?'portrait':'landscape'}}
  function build(data,value){
    const cfg=settings(value),portrait=cfg.orientation==='portrait',width=portrait?733:1062,height=portrait?1040:711;
    const rows=data.tasks,pages=Math.min(cfg.pages,Math.max(1,rows.length)),tableWidth=Math.round(width*(portrait?.65:.60)),chartX=tableWidth+8,chartWidth=width-chartX-8;
    const top=66,header=30,bottom=height-28,available=bottom-top-header;
    const columns=[['id','#',4],['wbs','WBS',7],['name','Tarefa',39],['dur','Dur.',6],['unit','Un.',5],['start','Início',11],['end','Fim',11],['pred','Pred.',10],['pct','%',7]];
    let cursor=0;const cells=columns.map(([key,label,weight])=>{const c={key,label,x:cursor,w:tableWidth*weight/100};cursor+=c.w;return c});
    function text(x,y,value,size=9,attrs=''){return `<text x="${x}" y="${y}" font-size="${size}" ${attrs}>${esc(value)}</text>`}
    function lines(value,maxChars,maxLines){const words=String(value??'').split(/\s+/),out=[''];for(const word of words){let rest=word;while(rest.length>maxChars){if(out.at(-1))out.push('');out[out.length-1]=rest.slice(0,maxChars);out.push('');rest=rest.slice(maxChars)}if((out.at(-1)+' '+rest).trim().length>maxChars&&out.at(-1))out.push(rest);else out[out.length-1]=(out.at(-1)+' '+rest).trim()}if(out.length>maxLines){out.length=maxLines;out[maxLines-1]=out[maxLines-1].slice(0,Math.max(1,maxChars-1))+'…'}return out.filter(Boolean)}
    let sheets='';
    for(let page=0;page<pages;page++){
      const first=Math.floor(page*rows.length/pages),last=Math.floor((page+1)*rows.length/pages),part=rows.slice(first,last),rowHeight=Math.min(30,available/Math.max(1,part.length)),font=Math.min(10,rowHeight*.52),bodyEnd=top+header+part.length*rowHeight;
      const titleLines=lines(data.title,Math.floor(width/(17*.55)),2),infoY=titleLines.length>1?55:40;
      let defs='',svg=titleLines.map((line,n)=>text(0,19+n*19,line,17,'font-weight="700"')).join('')+text(0,infoY,`${data.start} → ${data.end} · ${rows.length} tarefas · 1 página na largura`,10,'fill="#526074"')+text(width,infoY,`Página ${page+1} de ${pages}`,10,'text-anchor="end" fill="#526074"');
      svg+=`<rect x="0" y="${top}" width="${tableWidth}" height="${header}" fill="#2d3541"/><rect x="${chartX}" y="${top}" width="${chartWidth}" height="${header}" fill="#eef1f6"/>`;
      for(const c of cells)svg+=text(c.x+3,top+header/2+3,c.label,portrait?8:9,'fill="white" font-weight="700"');
      const ticks=Math.max(2,Math.floor(chartWidth/72));
      for(let tick=0;tick<=ticks;tick++){
        const fraction=tick/ticks,x=chartX+fraction*chartWidth,d=new Date(data.start+'T12:00:00');d.setDate(d.getDate()+Math.round(data.days*fraction));
        const label=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getFullYear()).slice(2);
        svg+=`<line x1="${x}" y1="${top+header}" x2="${x}" y2="${bodyEnd}" stroke="#dbe1ea" stroke-width=".6"/>`+text(x+(tick===ticks?-2:2),top+19,label,8,`fill="#455060" ${tick===ticks?'text-anchor="end"':''}`);
      }
      const todayX=chartX+data.today*chartWidth;if(data.today>=0&&data.today<=1)svg+=`<line x1="${todayX}" y1="${top+header}" x2="${todayX}" y2="${bodyEnd}" stroke="#d34c4c" stroke-width="1"/>`;
      for(let i=0;i<part.length;i++){
        const t=part[i],y=top+header+i*rowHeight,mid=y+rowHeight/2,rowFmt=data.format[t.id+'_row']||{};
        svg+=`<g data-print-task="${esc(t.id)}"><title>${esc(t.name)}</title><rect x="0" y="${y}" width="${tableWidth}" height="${rowHeight}" fill="${esc(rowFmt.bg||(t.summary?'#edf0f5':i%2?'#f7f9fc':'#fff'))}"/>`;
        for(const c of cells){
          const cf={...rowFmt,...(data.format[t.id+'_'+c.key]||{})},clip=`cell-${page}-${i}-${c.key}`,indent=c.key==='name'?Math.min(t.indent*7,c.w*.35):0,cellFont=c.key==='name'?font:font*.88;
          defs+=`<clipPath id="${clip}"><rect x="${c.x+2}" y="${y+.2}" width="${c.w-4}" height="${rowHeight-.4}"/></clipPath>`;
          if(cf.bg)svg+=`<rect x="${c.x}" y="${y}" width="${c.w}" height="${rowHeight}" fill="${esc(cf.bg)}"/>`;
          const value=c.key==='id'?t.index:c.key==='pct'?t.pct+'%':c.key==='name'&&t.summary?(t.collapsed?'▸ ':'▾ ')+t.name:t[c.key],parts=c.key==='name'?lines(value,Math.max(2,Math.floor((c.w-indent-7)/(cellFont*.55))),rowHeight>font*2.5?2:1):[String(value??'')];
          parts.forEach((line,n)=>{svg+=text(c.x+3+indent,mid+(n-(parts.length-1)/2)*cellFont*1.15+cellFont*.33,line,cellFont,`clip-path="url(#${clip})" fill="${esc(cf.fc||'#20242b')}" ${cf.b||t.summary?'font-weight="700"':''}`)});
          svg+=`<line x1="${c.x}" y1="${y}" x2="${c.x}" y2="${y+rowHeight}" stroke="#d8dfe9" stroke-width=".5"/>`;
        }
        svg+=`<line x1="0" y1="${y+rowHeight}" x2="${width}" y2="${y+rowHeight}" stroke="#d8dfe9" stroke-width=".5"/>`;
        if(t.hasDate){
          const x=chartX+Math.max(0,Math.min(1,t.x))*chartWidth,w=Math.max(1,Math.min(chartX+chartWidth-x,t.w*chartWidth)),h=Math.min(13,rowHeight*.62),barY=mid-h/2;
          if(t.mile){const r=Math.min(5,rowHeight*.28);svg+=`<path d="M ${x} ${mid-r} L ${Math.min(chartX+chartWidth,x+r)} ${mid} L ${x} ${mid+r} L ${Math.max(chartX,x-r)} ${mid} Z" fill="${esc(t.color)}"/>`}
          else if(t.summary)svg+=`<rect x="${x}" y="${mid-2}" width="${w}" height="4" fill="#687386"/>`;
          else{
            svg+=`<rect x="${x}" y="${barY}" width="${w}" height="${h}" rx="1.5" fill="${esc(data.status?'#c7d0dd':t.color)}"/>`;
            const done=Math.min(w,Math.max(0,t.pct/100*w));if(done)svg+=`<rect x="${x}" y="${barY}" width="${done}" height="${h}" rx="1" fill="#24946d"/>`;
            if(data.status){const due=Math.max(0,Math.min(w,todayX-x));if(due>done)svg+=`<rect x="${x+done}" y="${barY}" width="${due-done}" height="${h}" fill="#d34c4c"/>`}
            if(data.labels){const remaining=chartX+chartWidth-x-w-5,labelFont=Math.min(9,font),chars=Math.floor(remaining/(labelFont*.55));if(chars>3)svg+=text(x+w+3,mid+labelFont*.33,lines(t.name,chars,1)[0]||'',labelFont,'fill="#526074"')}
          }
        }
        svg+='</g>';
      }
      if(!rows.length)svg+=text(0,top+header+30,'Nenhuma tarefa neste cronograma.',12);
      svg+=text(0,height-6,'Visão atual do cronograma · cabeçalho e período repetidos em cada página',9,'fill="#526074"');
      sheets+=`<section class="sheet"><svg class="report" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${esc(data.title)} — página ${page+1}"><defs>${defs}</defs>${svg}</svg></section>`;
    }
    // size:auto preserves the browser's portrait/landscape controls. Both components scale together.
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(data.title)} PDF</title><style>@page{size:auto;margin:8mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,Segoe UI,sans-serif;color:#20242b}svg{font-family:Arial,Segoe UI,sans-serif}.sheet{width:100%;height:calc(100vh - 18mm);break-after:page;break-inside:avoid;page-break-after:always;page-break-inside:avoid}.sheet:last-child{break-after:auto;page-break-after:auto}.report{display:block;width:100%;height:100%}@media print{html,body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}@media screen{body{background:#e8ebf0}.sheet{background:white;width:${portrait?194:281}mm;height:${portrait?281:194}mm;margin:12px auto;padding:4px;box-shadow:0 1px 8px #0002}}</style></head><body data-print-orientation="${cfg.orientation}" data-print-pages="${pages}">${sheets}</body></html>`;
  }
  function print(html){
    const frame=document.createElement('iframe');frame.dataset.ganttPrint='';frame.title='Impressão do cronograma';frame.style.cssText='position:fixed;width:0;height:0;border:0';document.body.append(frame);
    const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();
    frame.contentWindow.addEventListener('afterprint',()=>setTimeout(()=>frame.remove(),1000),{once:true});
    Promise.resolve(doc.fonts?.ready).then(()=>setTimeout(()=>{if(frame.isConnected){frame.contentWindow.focus();frame.contentWindow.print()}},100));
  }
  return {build,print,settings};
})();
