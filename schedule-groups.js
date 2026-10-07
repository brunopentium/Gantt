/* Schedule hierarchy and portfolio analysis. Original task IDs/dependencies stay in their schedules. */
window.ScheduleGroups=(()=>{
  'use strict';
  let api,includeChildren=true,openingSource=false,search='',filter='all',collapsed=new Set(),collapsedTasks=new Set();
  const taskKey=(projectId,taskId)=>JSON.stringify([String(projectId),String(taskId)]);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const children=(data,p)=>data.filter(x=>(x.parentId||null)===(p?.id||null));
  const branch=(data,p)=>p?[p,...children(data,p).flatMap(x=>branch(data,x))]:[];
  function path(data,p){const out=[];while(p){out.unshift(p);p=data.find(x=>x.id===p.parentId)}return out}
  function validate(data){
    if(!Array.isArray(data))throw Error('Árvore de cronogramas inválida.');
    const ids=new Map();
    for(const p of data){if(!p||typeof p.id!=='string'||ids.has(p.id)||typeof p.title!=='string'||!Array.isArray(p.tasks)||(p.kind!=null&&!['group','schedule'].includes(p.kind))||(p.kind==='group'&&p.tasks.length))throw Error('Grupo ou cronograma inválido.');ids.set(p.id,p)}
    for(const p of data){const seen=new Set([p.id]);let parent=p.parentId;if(parent!=null&&typeof parent!=='string')throw Error('Grupo pai inválido.');while(parent){if(seen.has(parent))throw Error('A árvore de cronogramas não pode ter ciclos.');const ancestor=ids.get(parent);if(!ancestor)throw Error('Grupo pai inexistente.');seen.add(parent);parent=ancestor.parentId}}
  }
  function options(data,exclude){
    const blocked=new Set(exclude?branch(data,exclude).map(p=>p.id):[]);
    function node(p,depth){return `${blocked.has(p.id)?'':`<option value="${esc(p.id)}">${'　'.repeat(depth)}${depth?'↳ ':''}${p.kind==='group'?'▦ ':''}${esc(p.title)}</option>`}${children(data,p).map(x=>node(x,depth+1)).join('')}`}
    return children(data,null).map(p=>node(p,0)).join('');
  }
  const current=()=>api?.projects().find(p=>p.id===api.activeId());
  const isAggregate=()=>!!api&&(current()?.kind==='group'||includeChildren&&children(api.projects(),current()).length>0);
  function scope(){return includeChildren?branch(api.projects(),current()):[current()].filter(Boolean)}
  function treeHTML(){
    const data=api.projects(),expanded=new Set(path(data,current()).slice(0,-1).map(p=>p.id));
    function node(p){const kids=children(data,p),open=expanded.has(p.id),count=branch(data,p).filter(x=>x.kind!=='group').length;return `<li><div class="sg-tree-row"><button data-sg-select="${esc(p.id)}" ${p.id===api.activeId()?'aria-current="true"':''}>${p.kind==='group'?'▦ ':''}${esc(p.title)}<small>${count} cronograma${count===1?'':'s'}</small></button>${kids.length?`<button data-sg-expand aria-expanded="${open}" aria-label="Mostrar filhos de ${esc(p.title)}">${open?'▾':'▸'}</button>`:''}</div>${kids.length?`<ul ${open?'':'hidden'}>${kids.map(node).join('')}</ul>`:''}</li>`}
    return `<details class="sg-tree-picker"><summary>Árvore de cronogramas ▾</summary><nav aria-label="Árvore de cronogramas"><ul>${children(data,null).map(node).join('')}</ul></nav></details>`;
  }
  function onSelect(){if(!openingSource){includeChildren=true;search='';filter='all'}}
  function select(id){onSelect();if(id===api.activeId())refresh();else api.select(id)}
  function bindTree(root){
    root.querySelectorAll('[data-sg-select]').forEach(b=>b.onclick=()=>select(b.dataset.sgSelect));
    root.querySelectorAll('.sg-tree-row').forEach(row=>{const toggle=row.querySelector('[data-sg-expand]'),list=row.parentElement.querySelector(':scope > ul');if(!toggle)return;function open(value){list.hidden=!value;toggle.setAttribute('aria-expanded',String(value));toggle.textContent=value?'▾':'▸'}row.onpointerenter=e=>{if(e.pointerType==='mouse')open(true)};toggle.onclick=()=>open(list.hidden);row.onkeydown=e=>{if(e.key==='ArrowRight'){e.preventDefault();open(true)}else if(e.key==='ArrowLeft'){e.preventDefault();open(false)}}});
  }
  function modal(title,body){api.closePopups();api.closeEditor();const overlay=document.createElement('div'),m=document.createElement('div');overlay.className='popup-overlay';m.className='modal sg-modal';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.innerHTML=`<h3>${esc(title)}</h3><form>${body}<p id="sgError" role="alert"></p><div class="modal-actions"><button type="button" id="sgCancel">Cancelar</button><button type="submit" class="act">Salvar</button></div></form>`;document.body.append(overlay,m);overlay.onclick=api.closePopups;m.querySelector('#sgCancel').onclick=api.closePopups;m.querySelector('input')?.focus();return m}
  function memberChoices(data,p){
    const descendants=new Set(p?branch(data,p).slice(1).map(x=>x.id):[]);
    return data.filter(x=>x.id!==p?.id&&(!descendants.has(x.id)||x.parentId===p.id));
  }
  function memberHTML(data,p){
    const choices=memberChoices(data,p);
    return `<fieldset class="sg-members"><legend>Cronogramas e subgrupos dentro deste grupo</legend><p>O grupo fica acima dos itens marcados, que aparecem dentro dele. Marque quantos quiser; subgrupos levam seus descendentes. Ao desmarcar um item atual, ele fica no nível acima.</p><div class="sg-member-list">${choices.map(x=>`<label><input type="checkbox" data-sg-member="${esc(x.id)}" ${p&&x.parentId===p.id?'checked':''}><span><strong>${x.kind==='group'?'▦ ':''}${esc(x.title)}</strong><small>${esc(path(data,x).slice(0,-1).map(a=>a.title).join(' / ')||'Nível principal')}${children(data,x).length?` · inclui ${branch(data,x).length-1} descendente(s)`:''}</small></span></label>`).join('')||'<p>Nenhum outro cronograma disponível. Crie um subcronograma para começar.</p>'}</div><span id="sgMemberCount" aria-live="polite"></span></fieldset>`;
  }
  function bindMembers(m,data){
    const inputs=[...m.querySelectorAll('[data-sg-member]')],selected=new Set(inputs.filter(i=>i.checked).map(i=>i.dataset.sgMember));
    function update(){for(const input of inputs){const id=input.dataset.sgMember,inherited=path(data,data.find(x=>x.id===id)).slice(0,-1).some(x=>selected.has(x.id));input.disabled=inherited;input.checked=inherited||selected.has(id)}m.querySelector('#sgMemberCount').textContent=`${inputs.filter(i=>i.checked&&!i.disabled).length} item(ns) selecionado(s)`}
    inputs.forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.sgMember):selected.delete(input.dataset.sgMember);update()});update();
  }
  function applyMembers(data,p,m){
    const inputs=[...m.querySelectorAll('[data-sg-member]')],selected=new Set(inputs.filter(i=>i.checked&&!i.disabled).map(i=>i.dataset.sgMember));
    // If a selected member currently contains this group, lift the group above it before adoption.
    const enclosing=path(data,data.find(x=>x.id===p.parentId)).find(x=>selected.has(x.id)),parentId=enclosing?enclosing.parentId||null:p.parentId||null;
    return data.map(x=>x.id===p.id?{...p,parentId}:selected.has(x.id)?{...x,parentId:p.id}:x.parentId===p.id&&!inputs.find(i=>i.dataset.sgMember===x.id)?.checked?{...x,parentId}:x);
  }
  function edit(p,kind='schedule',parentId=null,selectedIds=[]){
    api.flush();const data=api.projects(),group=(p?.kind||kind)==='group',m=modal(p?group?'Editar grupo':'Editar / mover cronograma':group?'Novo grupo de cronogramas':'Novo cronograma',`<label>Nome<input id="sgTitle" required maxlength="200" value="${esc(p?.title||'')}"></label><label>${group?'Colocar este grupo dentro de':'Colocar este cronograma dentro de'}<select id="sgParent"><option value="">Nenhum — nível principal</option>${options(data,p)}</select></label>${group?memberHTML(data,p):''}`);
    m.querySelector('#sgParent').value=p?.parentId||parentId||'';
    if(group){m.querySelectorAll('[data-sg-member]').forEach(i=>{if(selectedIds.includes(i.dataset.sgMember))i.checked=true});bindMembers(m,data)}
    m.querySelector('form').onsubmit=e=>{e.preventDefault();try{const title=m.querySelector('#sgTitle').value.trim(),parent=m.querySelector('#sgParent').value||null;if(!title)throw Error('Informe um nome.');const item=p?{...p,title,parentId:parent}:api.newProject({title,kind,...(parent?{parentId:parent}:{}),tasks:[]});let next=p?data.map(x=>x.id===p.id?item:x):[...data,item];if(group)next=applyMembers(next,item,m);validate(next);api.replace(next,item.id);api.closePopups()}catch(e){m.querySelector('#sgError').textContent=e.message}};
  }
  function duplicate(){
    api.flush();const p=current();if(!p)return;const data=api.projects(),copies=JSON.parse(JSON.stringify(branch(data,p))),ids=new Map(copies.map(p=>[p.id,api.id()]));for(const copy of copies){const original=copy.id;copy.id=ids.get(original);if(original===p.id)copy.title+=' — cópia';else copy.parentId=ids.get(copy.parentId);copy.updatedAt=new Date().toISOString()}const next=[...data,...copies];validate(next);api.replace(next,ids.get(p.id));
  }
  function remove(){const p=current();if(!p)return;api.confirm('Excluir grupo / cronograma',`Excluir "${p.title}" e suas tarefas diretas? Os filhos serão mantidos no nível acima.`,()=>{api.flush();const data=api.projects().filter(x=>x.id!==p.id).map(x=>x.parentId===p.id?{...x,parentId:p.parentId||null}:x);if(!data.length)data.push(api.newProject({title:'Novo cronograma',tasks:[]}));validate(data);api.replace(data,p.parentId||data[0].id)})}
  function exportBranch(){api.flush();const data=JSON.parse(JSON.stringify(branch(api.projects(),current())));if(data[0])delete data[0].parentId;api.downloadJSON({version:1,activeProjectId:current().id,projects:data},api.fileName(current().title)+'-ramo.json')}
  function snapshot(){
    const data=scope(),sources=data.filter(p=>p.kind!=='group').map(p=>({...p,...api.calculate(p)})),now=api.today();
    const leaves=sources.flatMap(p=>p.tasks.filter(t=>!t.summary).map(task=>({project:p,task})));
    function metrics(entries){let weight=0,done=0,mn=null,mx=null;for(const {task:t}of entries){const w=t.mile?1:Math.max(t.dur||0,1);weight+=w;done+=w*(t.pct||0);if(t.start&&(!mn||t.start<mn))mn=t.start;if(t.end&&(!mx||t.end>mx))mx=t.end}return {tasks:entries.length,completed:entries.filter(({task:t})=>t.pct===100).length,late:entries.filter(({task:t})=>t.pct<100&&t.end&&t.end<now).length,critical:entries.filter(({task:t})=>t.critical).length,progress:weight?Math.round(done/weight):0,start:mn,end:mx}}
    return {data,sources,leaves,metrics,summary:metrics(leaves)};
  }
  function matches(entry){const t=entry.task,text=[t.name,entry.project.title,...path(api.projects(),entry.project).map(p=>p.title)].join(' ').toLocaleLowerCase('pt-BR');return (!search||text.includes(search.toLocaleLowerCase('pt-BR')))&&(filter==='all'||filter==='late'&&t.pct<100&&t.end&&t.end<api.today()||filter==='done'&&t.pct===100||filter==='open'&&t.pct<100||filter==='critical'&&t.critical)}
  // Shared row selection keeps PDF and the grouped chart in the same expansion/filter state.
  function viewRows(state){
    const filtered=new Map(state.sources.map(s=>[s.id,s.tasks.map(task=>({project:s,task})).filter(matches)])),rows=[];
    function walk(node,depth){
      const source=state.sources.find(s=>s.id===node.id),sub=branch(state.data,node);
      if((filter!=='all'||search)&&!state.sources.some(s=>sub.some(p=>p.id===s.id)&&filtered.get(s.id).length))return;
      rows.push({node,source,depth,summary:true,collapsed:collapsed.has(node.id),stats:state.metrics(state.leaves.filter(e=>sub.some(p=>p.id===e.project.id)))});
      if(collapsed.has(node.id))return;
      const included=new Set((filtered.get(node.id)||[]).map(e=>e.task.id)),ancestors=[];
      for(const t of source?.tasks||[]){
        while(ancestors.length&&(ancestors.at(-1).indent||0)>=(t.indent||0))ancestors.pop();
        const hidden=ancestors.some(parent=>included.has(parent.id)&&collapsedTasks.has(taskKey(node.id,parent.id)));
        if(included.has(t.id)&&!hidden)rows.push({node,source,task:t,depth:depth+1+(t.indent||0),summary:t.summary,collapsed:collapsedTasks.has(taskKey(node.id,t.id))});
        if(t.summary)ancestors.push(t);
      }
      for(const child of children(state.data,node))walk(child,depth+1);
    }
    walk(current(),0);return rows;
  }
  function setExpandedAll(expanded){
    if(isAggregate()){for(const p of scope()){expanded?collapsed.delete(p.id):collapsed.add(p.id);p.tasks.forEach((t,i)=>{if(p.tasks[i+1]&&(p.tasks[i+1].indent||0)>(t.indent||0)){const key=taskKey(p.id,t.id);expanded?collapsedTasks.delete(key):collapsedTasks.add(key)}})}refresh()}
    else api.setTasksExpanded(expanded);
    document.getElementById(expanded?'sgExpandAll':'sgCollapseAll')?.focus();
  }
  function refresh(){
    if(!api)return;const p=current(),bar=document.getElementById('scheduleHierarchyBar'),panel=document.getElementById('scheduleAggregate');if(!p)return;
    const aggregate=isAggregate();document.documentElement.dataset.scheduleAggregate=aggregate?'on':'off';document.getElementById('ptitle').readOnly=aggregate;
    bar.innerHTML=`<nav class="sg-breadcrumbs" aria-label="Caminho do cronograma">${path(api.projects(),p).map(x=>`<button data-sg-select="${esc(x.id)}" ${x===p?'aria-current="page"':''}>${esc(x.title)}</button>`).join('<span>›</span>')}</nav>${treeHTML()}<button id="sgExpandAll" title="${aggregate?'Abrir todos os cronogramas, subgrupos e níveis de tarefas desta visão':'Mostrar todos os níveis de tarefas deste cronograma'}">▾ Expandir tudo</button><button id="sgCollapseAll" title="${aggregate?'Recolher todos os cronogramas, subgrupos e níveis de tarefas desta visão':'Recolher todos os níveis de tarefas deste cronograma'}">▸ Recolher tudo</button><button id="sgNewGroup">＋ Novo grupo</button>${p.kind==='group'?'<button id="sgNewSubgroup">＋ Subgrupo</button>':''}<button id="sgNewChild">＋ Subcronograma</button>${p.kind==='group'?'<button id="sgMembers">Selecionar cronogramas</button>':''}<button id="sgEdit">Editar / mover</button><label><input id="sgInclude" type="checkbox" ${includeChildren?'checked':''}> Incluir subcronogramas</label>`;
    bar.querySelector('#sgExpandAll').onclick=()=>setExpandedAll(true);bar.querySelector('#sgCollapseAll').onclick=()=>setExpandedAll(false);
    bindTree(bar);bar.querySelector('#sgNewGroup').onclick=()=>edit(null,'group',null,[p.id]);bar.querySelector('#sgNewChild').onclick=()=>edit(null,'schedule',p.id);bar.querySelector('#sgEdit').onclick=()=>edit(p);if(p.kind==='group'){bar.querySelector('#sgNewSubgroup').onclick=()=>edit(null,'group',p.id);bar.querySelector('#sgMembers').onclick=()=>{edit(p);document.querySelector('.sg-modal [data-sg-member]')?.focus()}}bar.querySelector('#sgInclude').onchange=e=>{includeChildren=e.target.checked;refresh()};panel.hidden=!aggregate;if(!aggregate)return;
    const state=snapshot(),m=state.summary,view=api.view(),summaryHTML=`<div class="sg-metrics"><div><strong>${state.sources.length}</strong><span>Cronogramas</span></div><div><strong>${m.tasks}</strong><span>Tarefas executáveis</span></div><div><strong>${m.progress}%</strong><span>Progresso ponderado</span></div><div><strong>${m.late}</strong><span>Atrasadas</span></div><div><strong>${m.critical}</strong><span>Críticas nas origens</span></div><div class="sg-period"><strong>${m.start||'—'} → ${m.end||'—'}</strong><span>Período total</span></div></div>`;
    // A common date axis compares schedules; dependencies and critical paths are calculated per source.
    let mn=m.start?api.date(m.start):api.date(api.today()),mx=m.end?api.date(m.end):new Date(mn);mn.setDate(mn.getDate()-2);mx.setDate(mx.getDate()+7);
    const days=Math.max(1,Math.round((mx-mn)/86400000)+1),pixels=({days:28,weeks:7,months:2.5,quarters:1}[view.res]||7)*view.cw/36,width=Math.min(30000,Math.max(500,days*pixels)),scale=width/days;
    const x=date=>date?Math.round((api.date(date)-mn)/86400000)*scale:0,step=Math.max(1,Math.ceil(75/scale)),ticks=[];for(let day=0;day<days;day+=step){const d=new Date(mn);d.setDate(d.getDate()+day);ticks.push(`<span style="left:${day*scale}px">${api.dateString(d)}</span>`)}
    const rows=[];
    function row(title,depth,stats,attrs='',type='task',detail='',fold=null){
      const todayX=x(api.today());
      const left=x(stats.start),w=Math.max(4,x(stats.end)-left+scale),barHTML=stats.start?`<button class="sg-bar ${type==='task'?'':'sg-summary-bar'} ${stats.critical===true&&(view.cpOn||filter==='critical')?'sg-critical':''}" ${attrs} style="left:${left}px;width:${w}px" title="${esc(title)} · ${stats.start} → ${stats.end} · ${stats.progress??stats.pct??0}%"><span style="width:${stats.progress??stats.pct??0}%"></span></button>`:'';
      const control=fold?`<button class="sg-task-toggle" data-sg-fold-task="${esc(fold.taskId)}" data-sg-project="${esc(fold.projectId)}" aria-expanded="${fold.expanded}" aria-label="${fold.expanded?'Recolher':'Expandir'} tarefas de ${esc(title)}" title="${fold.expanded?'Recolher':'Expandir'} tarefas de ${esc(title)}">${fold.expanded?'▾':'▸'}</button>`:'';
      rows.push(`<div class="sg-row ${type==='task'?'':'sg-heading-row'}" ${attrs}><div class="sg-label" style="padding-left:${12+Math.min(depth,12)*14}px"><div><div class="sg-task-title">${control}<button class="sg-name" ${attrs}>${esc(title)}</button></div>${detail?`<small>${esc(detail)}</small>`:''}</div><span>${stats.progress??stats.pct??0}%</span></div><div class="sg-track" style="--sg-step:${step*scale}px">${barHTML}${todayX>=0&&todayX<width?`<span class="sg-today" style="left:${todayX}px" aria-hidden="true"></span>`:''}</div></div>`);
    }
    for(const r of viewRows(state)){
      const {node,source,task:t,depth}=r;
      if(!t)row((r.collapsed?'▸ ':'▾ ')+node.title,depth,r.stats,`data-sg-collapse="${esc(node.id)}"`,'summary',node.kind==='group'?'Grupo':`${source?.tasks.filter(t=>!t.summary).length||0} tarefas · ${path(api.projects(),node).map(p=>p.title).join(' / ')}`);
      else row(t.name,depth,{...t,progress:t.pct},`data-sg-project="${esc(node.id)}" data-sg-task="${esc(t.id)}"`,t.summary?'summary':'task',`${t.wbs||''} · ${t.start||'—'} → ${t.end||'—'}${t.pred?' · Dependências locais: '+t.pred:''}${t.mile?' · Marco':''}`,t.summary?{projectId:node.id,taskId:t.id,expanded:!r.collapsed}:null);
    }
    panel.innerHTML=`<header class="sg-head"><h1>${esc(p.title)}</h1><span>Visão consolidada · ${state.data.length-1} descendentes</span></header>${summaryHTML}<div class="sg-analysis-tools"><label>Buscar<input id="sgSearch" type="search" placeholder="Tarefa ou cronograma" value="${esc(search)}"></label><label>Mostrar<select id="sgFilter"><option value="all">Todas as tarefas</option><option value="late">Atrasadas</option><option value="open">Não concluídas</option><option value="done">Concluídas</option><option value="critical">Críticas nas origens</option></select></label><span>Abra uma tarefa para editar no cronograma de origem. Progresso ponderado pela duração; marcos têm peso 1. O PDF respeita os filtros e níveis visíveis. Excel exporta o ramo completo.</span></div><div class="sg-chart"><div class="sg-chart-content" style="width:calc(var(--sg-label-width) + ${width}px);--sg-width:${width}px"><div class="sg-chart-header"><div class="sg-label">Cronograma / tarefa · progresso</div><div class="sg-scale">${ticks.join('')}</div></div>${rows.join('')||'<div class="sg-empty">Nenhuma tarefa encontrada.</div>'}</div></div>`;
    panel.querySelector('#sgFilter').value=filter;panel.querySelector('#sgFilter').onchange=e=>{filter=e.target.value;refresh()};panel.querySelector('#sgSearch').oninput=e=>{search=e.target.value;const pos=e.target.selectionStart;refresh();const input=panel.querySelector('#sgSearch');input.focus();input.setSelectionRange(pos,pos)};
    panel.querySelectorAll('[data-sg-collapse]').forEach(b=>{if(b.tagName==='BUTTON')b.onclick=()=>{const id=b.dataset.sgCollapse;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);refresh()}});
    panel.querySelectorAll('[data-sg-fold-task]').forEach(b=>b.onclick=event=>{event.preventDefault();event.stopPropagation();const projectId=b.dataset.sgProject,taskId=b.dataset.sgFoldTask,key=taskKey(projectId,taskId);collapsedTasks.has(key)?collapsedTasks.delete(key):collapsedTasks.add(key);refresh();[...panel.querySelectorAll('[data-sg-fold-task]')].find(x=>x.dataset.sgProject===projectId&&x.dataset.sgFoldTask===taskId)?.focus()});
    panel.querySelectorAll('[data-sg-task]').forEach(b=>{if(b.tagName==='BUTTON')b.onclick=()=>{includeChildren=false;openingSource=true;try{api.openTask(b.dataset.sgProject,b.dataset.sgTask)}finally{openingSource=false}}});
  }
  function reportTasks(){
    const state=snapshot(),out=[],map=new Map();
    function walk(node,depth){const sub=branch(state.data,node),m=state.metrics(state.leaves.filter(e=>sub.some(p=>p.id===e.project.id)));out.push({id:'group:'+node.id,name:node.title,indent:depth,dur:m.start&&m.end?Math.max(1,Math.round((api.date(m.end)-api.date(m.start))/86400000)+1):0,unit:'cd',start:m.start,end:m.end,pct:m.progress,pred:'',mile:false,color:'#687386',collapsed:false});const source=state.sources.find(s=>s.id===node.id);for(const [i,t]of (source?.tasks||[]).entries()){map.set(node.id+':'+(i+1),out.length+1);out.push({...t,id:node.id+':'+t.id,indent:depth+1+(t.indent||0),collapsed:false,_project:node.id})}for(const child of children(state.data,node))walk(child,depth+1)}walk(current(),0);
    for(const t of out){if(!t._project)continue;t.pred=api.parsePred(t.pred).filter(p=>map.has(t._project+':'+p.n)).map(p=>map.get(t._project+':'+p.n)+p.ty+(p.lag?(p.lag>0?'+':'')+p.lag+'d':'')).join(',');delete t._project;delete t.summary;delete t.critical}return out;
  }
  function pdfTasks(){
    const rows=new Map(viewRows(snapshot()).map(r=>[r.task?r.node.id+':'+r.task.id:'group:'+r.node.id,r])),counters=[];
    // Preserve full-tree numbering and summary bars even when their children are omitted.
    return reportTasks().map((t,i)=>{
      counters.length=t.indent+1;counters[t.indent]=(counters[t.indent]||0)+1;
      const r=rows.get(t.id);
      return r?{...t,_printIndex:i+1,_printWbs:counters.join('.'),_printSummary:r.summary,_printCollapsed:r.collapsed}:null;
    }).filter(Boolean);
  }
  function excel(){api.flush();api.exportExcel(reportTasks())}
  function pdf(pages){api.flush();api.exportPDF(pdfTasks(),pages)}
  function init(adapter){api=adapter;document.addEventListener('click',e=>{const picker=document.querySelector('.sg-tree-picker[open]');if(picker&&!picker.contains(e.target))picker.open=false});document.addEventListener('keydown',e=>{if(e.key==='Escape'){const picker=document.querySelector('.sg-tree-picker[open]');if(picker){picker.open=false;picker.querySelector('summary').focus()}}});refresh()}
  return {init,validate,options,isAggregate,refresh,onSelect,edit,duplicate,remove,exportBranch,excel,pdf,snapshot,reportTasks,pdfTasks,newSchedule:()=>edit(null,'schedule',current()?.kind==='group'?current().id:current()?.parentId||null)};
})();
