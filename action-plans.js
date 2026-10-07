/* Action plans share linked dates with the original task; identifiers survive row reordering. */
window.ActionPlans=(()=>{
  'use strict';
  let api,plans=[],activeId=null,view='table',shown=false,notice='',undo=[],zoom=1,notesShown=true,planTheme=null;
  const statuses={pending:'Pendente',doing:'Em andamento',done:'Concluída',blocked:'Bloqueada'};
  const id=()=>crypto.randomUUID();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>{if(!value)return true;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===value};
  const linkValid=link=>!link||(typeof link.projectId==='string'&&typeof link.taskId==='string');
  function validate(data){
    if(!Array.isArray(data))throw new Error('Planos de ação inválidos no arquivo.');
    const seen=new Set();
    for(const p of data){
      if(!p||typeof p.id!=='string'||seen.has(p.id)||typeof p.title!=='string'||(p.description!=null&&typeof p.description!=='string')||!linkValid(p.source)||!Array.isArray(p.actions))throw new Error('Plano de ação inválido.');
      if(p.document!=null){const d=p.document;if(typeof d!=='object'||Array.isArray(d)||['agenda','notes'].some(k=>d[k]!=null&&typeof d[k]!=='string')||(d.participants!=null&&(!Array.isArray(d.participants)||d.participants.some(x=>typeof x!=='string'))))throw new Error('Seções do documento inválidas.');}
      seen.add(p.id);const actionIds=new Set();
      for(const a of p.actions){
        if(!a||typeof a.id!=='string'||actionIds.has(a.id)||typeof a.title!=='string'||typeof a.owner!=='string'||typeof a.notes!=='string'||!Object.hasOwn(statuses,a.status)||!date(a.start)||!date(a.end)||(a.start&&a.end&&a.end<a.start)||!linkValid(a.link))throw new Error('Ação inválida no arquivo.');
        actionIds.add(a.id);
      }
    }
  }
  function load(data){validate(data);undo=[];plans=JSON.parse(JSON.stringify(data));activeId=plans.some(p=>p.id===activeId)?activeId:plans[0]?.id||null}
  function checkpoint(taskChange){undo.push({plans:JSON.parse(JSON.stringify(plans)),activeId,taskChange});if(undo.length>50)undo.shift()}
  function undoPlan(){
    const previous=undo.at(-1);if(!previous)return;
    try{if(previous.taskChange){const {link,dates}=previous.taskChange,t=task(link);if(t&&!t.summary)api.updateTask(link.projectId,link.taskId,{...dates,start:t.pred?t.start:dates.start})}undo.pop();plans=previous.plans;activeId=previous.activeId;notice='Alteração desfeita';save()}catch(e){notice=e.message;refresh()}
  }
  function backup(){api.flush();sync();downloadJSON({version:1,type:'action-plans',exportedAt:new Date().toISOString(),actionPlans:exportData()},'planos-de-acao-backup.json')}
  function exportData(){return JSON.parse(JSON.stringify(plans))}
  function importData(data){
    const incoming=data.actionPlans||(data.actions?[data]:null);validate(incoming);if(!incoming.length)throw new Error('O arquivo não contém planos.');checkpoint();const copies=JSON.parse(JSON.stringify(incoming));
    for(const p of copies){p.id=id();p.actions.forEach(a=>a.id=id());plans.push(p)}activeId=copies[0].id;sync();notice=copies.length+' plano(s) importado(s). Os planos existentes foram mantidos.';save();
  }
  function importFile(){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{if(input.files[0])importData(JSON.parse(await input.files[0].text()))}catch(e){notice='Falha na importação: '+e.message;refresh()}};input.click()}
  function restoreData(data,applyDates=true){
    validate(data);
    const copy=JSON.parse(JSON.stringify(data));
    if(applyDates)for(const p of copy)for(const a of p.actions){const t=task(a.link);if(t&&!t.summary&&a.start&&a.end){const start=t.pred?t.start:a.start;if(a.end>=start)api.updateTask(a.link.projectId,a.link.taskId,{start,end:t.mile?start:a.end})}}
    load(copy);sync();notice='Planos restaurados. Datas vinculadas seguem as regras dos cronogramas.';save();
  }
  function duplicatePlan(){const p=current();if(!p)return;checkpoint();const copy=JSON.parse(JSON.stringify(p));copy.id=id();copy.title+=' — cópia';copy.actions.forEach(a=>a.id=id());plans.push(copy);activeId=copy.id;save()}
  function current(){return plans.find(p=>p.id===activeId)}
  function task(link){return link&&api?api.task(link.projectId,link.taskId):null}
  function sync(){if(!api)return;for(const p of plans)for(const a of p.actions){const t=task(a.link);if(t){a.start=t.start;a.end=t.end}}}
  function save(){api.save();refresh()}
  function format(value){return value?value.split('-').reverse().join('/'):'—'}
  function linkedHTML(link){const t=task(link);return t?`<button class="ap-link" data-open-project="${esc(link.projectId)}" data-open-task="${esc(link.taskId)}">↗ ${esc(t.projectTitle)} · ${esc(t.taskName)}</button>`:link?'<span class="ap-orphan">Vínculo indisponível — datas locais preservadas</span>':''}
  function late(a){const now=new Date(),day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');return a.end&&a.end<day&&a.status!=='done'}
  const icons={plan:'<path d="M9 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-3M9 3h6v4H9zM8 14l3 3 5-6"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5"/>',agenda:'<path d="M4 3h16v18H4zM8 8h8M8 12h8M8 16h5"/>',notes:'<path d="M4 3h16v14l-4 4H4zM8 8h8M8 12h8M8 16h4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>',copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>'};
  const icon=name=>`<svg class="ap-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.plan}</svg>`;
  function ownerHTML(name){
    if(!name)return '<span class="ap-person ap-unassigned">＋ Atribuir</span>';
    const parts=name.trim().split(/[\s,]+/),initials=((parts[0]?.[0]||'')+(parts.length>1?parts.at(-1)[0]:'')).toLocaleUpperCase('pt-BR');
    let hue=0;for(const c of name.trim().toLocaleLowerCase('pt-BR'))hue=(hue*31+c.charCodeAt(0))>>>0;
    return `<span class="ap-person ap-person-${hue%6}"><span class="ap-avatar" aria-hidden="true">${esc(initials)}</span><span>${esc(name)}</span></span>`;
  }
  function dateHTML(a){return `<span class="ap-date ${late(a)?'ap-date-late':''}">${icon('calendar')}<span>${a.end?format(a.end):'Definir data'}</span></span>`}
  const sectionLabels={participants:'Participantes',agenda:'Agenda',notes:'Notas'};
  function sectionControls(key){return `<div class="ap-section-options"><button data-section-edit="${key}" aria-label="Editar ${sectionLabels[key]}">${icon('edit')}</button><button data-section-remove="${key}" aria-label="Remover ${sectionLabels[key]}">${icon('trash')}</button></div>`}
  function documentHTML(p){const d=p.document||{};return ['agenda','notes'].filter(k=>d[k]?.trim()).map(k=>`<section class="ap-section ap-section-${k}" data-document-section="${k}"><div class="ap-section-head"><h2><span class="ap-section-icon">${icon(k)}</span>${sectionLabels[k]}</h2>${sectionControls(k)}</div><div class="ap-section-content">${k==='agenda'?`<ul>${d[k].split('\n').map(x=>x.trim()).filter(Boolean).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`<p>${esc(d[k])}</p>`}</div></section>`).join('')}
  function editSection(p,key){
    const value=key==='participants'?(p.document?.participants||[]).join('\n'):p.document?.[key]||'';
    const hint=key==='participants'?'Escreva um nome por linha.':key==='agenda'?'Escreva um assunto por linha.':'Registre anotações e decisões do plano.';
    const m=modal(sectionLabels[key],`<label>${hint}<textarea id="apSectionValue" rows="7" placeholder="${esc(hint)}">${esc(value)}</textarea></label>`);m.querySelector('textarea').focus();
    m.querySelector('form').onsubmit=e=>{e.preventDefault();const text=m.querySelector('textarea').value.trim();if(!text){m.querySelector('#apError').textContent='Preencha a seção. Para removê-la, use o botão de remover no documento.';return}checkpoint();p.document={...p.document,[key]:key==='participants'?[...new Set(text.split('\n').map(x=>x.trim()).filter(Boolean))]:text};closePopups();notice='';save()};
  }
  function addSection(p){const m=modal('Adicionar seção','<div class="ap-section-choices">'+Object.entries(sectionLabels).map(([key,label])=>`<button type="button" data-add-section="${key}">${icon(key==='participants'?'people':key)}<span>${label}${p.document?.[key]?.length?' · editar':''}</span></button>`).join('')+'</div>');m.querySelector('button[type=submit]').hidden=true;m.querySelectorAll('[data-add-section]').forEach(b=>b.onclick=()=>editSection(p,b.dataset.addSection))}
  function badge(a){return `<span class="ap-badge ${a.status}"><span class="ap-status-dot" aria-hidden="true">${a.status==='done'?'✓':''}</span>${statuses[a.status]}<span class="ap-chevron" aria-hidden="true">⌄</span></span>${late(a)?' <span class="ap-late">Atrasada</span>':''}`}
  function field(a,name,label){return `<button class="ap-inline" data-field="${name}" data-action="${esc(a.id)}" aria-label="Alterar ${name==='owner'?'responsável':name==='end'?'término':'status'} de ${esc(a.title)}" title="Clique para alterar">${label}</button>`}
  function inlineEdit(a,name){
    api.flush();sync();const t=task(a.link);
    if(name==='end'&&t&&(t.summary||(t.mile&&t.pred))){notice=t.summary?'O término desta linha é calculado pelas subtarefas.':'A data deste marco segue as dependências do cronograma.';refresh();return}
    const title={owner:'Responsável',end:'Término',status:'Status'}[name];
    const m=modal(title,'<div id="apInlineOptions"></div>');m.classList.add('ap-inline-dialog');
    const options=m.querySelector('#apInlineOptions'),error=m.querySelector('#apError');
    function apply(value){
      try{
        if(name==='end'&&(!date(value)||(t&&!value)))throw new Error('Selecione uma data válida.');
        const start=t?.mile?value:a.start;
        if(name==='end'&&start&&value&&value<start)throw new Error('O término deve ser igual ou posterior ao início.');
        if(a[name]===value){closePopups();return}
        const changed=name==='end'&&t;
        // Update the scheduler first: a rejected date must not create an undo entry.
        const previous=changed?{link:a.link,dates:{start:t.start,end:t.end}}:null;
        if(changed)api.updateTask(a.link.projectId,a.link.taskId,{start,end:value});
        checkpoint(previous);a[name]=value;const actual=task(a.link);
        notice=changed&&actual.end!==value?'Data ajustada pelas regras do cronograma.':'';
        if(changed){a.start=actual.start;a.end=actual.end}
        closePopups();save();document.querySelector(`[data-action="${a.id}"][data-field="${name}"]`)?.focus();
      }catch(e){error.textContent=e.message}
    }
    function choice(label,value){const b=document.createElement('button');b.type='button';b.className='ap-choice';b.textContent=label;b.setAttribute('aria-pressed',String(a[name]===value));b.onclick=()=>apply(value);options.append(b)}
    if(name==='status'){for(const [key,label]of Object.entries(statuses))choice(label,key);m.querySelector('button[type=submit]').hidden=true}
    if(name==='owner'){
      choice('Sem responsável','');
      for(const owner of [...new Set(current().actions.map(x=>x.owner.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')))choice(owner,owner);
      options.insertAdjacentHTML('beforeend','<label>Adicionar novo responsável<input id="apInlineOwner" maxlength="200" placeholder="Nome do responsável" autocomplete="off"></label>');
      m.querySelector('form').onsubmit=e=>{e.preventDefault();const value=m.querySelector('input').value.trim();if(!value){error.textContent='Informe o nome ou escolha um responsável acima.';return}apply(value)};
    }
    if(name==='end'){
      options.insertAdjacentHTML('beforeend',`<label>Selecione a data<input id="apInlineEnd" type="date" value="${esc(a.end)}" ${t?'required':''} ${a.start&&!t?.mile?`min="${esc(a.start)}"`:''}></label>`);
      const input=m.querySelector('input');input.onchange=()=>apply(input.value);m.querySelector('form').onsubmit=e=>{e.preventDefault();apply(input.value)};input.focus();try{input.showPicker()}catch(e){/* The date input remains available in unsupported browsers. */}
    }else m.querySelector('input, .ap-choice')?.focus();
    m.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closePopups()}};
  }
  function buttons(a){return `<div class="ap-row-options"><button data-edit="${esc(a.id)}" aria-label="Editar ação" title="Editar ação">${icon('edit')}</button><button data-copy="${esc(a.id)}" aria-label="Duplicar ação" title="Duplicar ação">${icon('copy')}</button><button class="del" data-delete="${esc(a.id)}" aria-label="Excluir ação" title="Excluir ação">${icon('trash')}</button></div>`}
  function refresh(){
    if(!api||!shown)return;document.documentElement.dataset.theme=planTheme||api.getTheme();document.getElementById('apUndo').disabled=!undo.length;sync();const panel=document.getElementById('actionPanel'),p=current();
    panel.innerHTML=`<div class="ap-document"><div class="ap-head"><h2>Planos de ação</h2><select id="apPlanSelect" aria-label="Plano de ação">${plans.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select><button id="apNewPlan">＋ Novo plano</button></div><div id="apNotice" role="status">${esc(notice)}</div><div id="apDocumentBody"></div></div>`;
    panel.querySelector('#apNewPlan').onclick=()=>editPlan();const select=panel.querySelector('#apPlanSelect');select.value=activeId||'';select.onchange=()=>{activeId=select.value;notice='';refresh()};
    const body=panel.querySelector('#apDocumentBody');
    if(!p){body.innerHTML='<div class="ap-empty">Crie um plano e organize ações, datas e responsáveis.<br>Você pode acrescentar ações independentes ou vinculadas a qualquer cronograma.</div>';return}
    const done=p.actions.filter(a=>a.status==='done').length,overdue=p.actions.filter(late).length,blocked=p.actions.filter(a=>a.status==='blocked').length,progress=p.actions.length?Math.round(done/p.actions.length*100):0,d=p.document||{};
    body.innerHTML=`<header class="ap-hero"><div class="ap-hero-main"><div class="ap-hero-icon">${icon('plan')}</div><div class="ap-hero-copy"><span class="ap-eyebrow">PLANO DE AÇÃO</span><h1>${esc(p.title)}</h1>${p.description?`<p class="ap-description">${esc(p.description)}</p>`:''}${p.source?linkedHTML(p.source):''}</div><button id="apAddSection">＋ Adicionar seção</button></div><div class="ap-plan-title"><button id="apDuplicatePlan">Duplicar plano</button><button id="apEditPlan">Renomear / editar</button><button id="apDeletePlan" class="del">Excluir plano</button></div>${d.participants?.length?`<div class="ap-participants" data-document-section="participants"><h2>${icon('people')}Participantes</h2><div class="ap-participant-list">${d.participants.map(ownerHTML).join('')}</div>${sectionControls('participants')}</div>`:''}</header>${documentHTML(p)}<section class="ap-section ap-action-section"><div class="ap-section-head"><h2><span class="ap-section-icon">${icon('plan')}</span>Plano de ação</h2><div class="ap-views"><button id="apTable" class="${view==='table'?'act':''}" aria-pressed="${view==='table'}">Tabela</button><button id="apCards" class="${view==='cards'?'act':''}" aria-pressed="${view==='cards'}">Cards</button></div></div><div class="ap-tools"><button class="act" id="apAddAction">＋ Nova ação</button><span>${p.actions.length} ações · ${done} concluídas</span><div class="ap-indicators">${overdue?`<span class="ap-indicator ap-late">${overdue} atrasada${overdue>1?'s':''}</span>`:''}${blocked?`<span class="ap-indicator ap-blocked-count">${blocked} bloqueada${blocked>1?'s':''}</span>`:''}<span class="ap-progress-label">${progress}% concluído</span><progress class="ap-progress" max="100" value="${progress}" aria-label="Progresso do plano">${progress}%</progress></div></div><div id="apActionContent"></div></section>`;
    panel.querySelector('#apDuplicatePlan').onclick=duplicatePlan;panel.querySelector('#apEditPlan').onclick=()=>editPlan(p);panel.querySelector('#apDeletePlan').onclick=()=>{if(confirm('Excluir este plano e todas as suas ações? Os cronogramas não serão excluídos.')){checkpoint();plans=plans.filter(x=>x!==p);activeId=plans[0]?.id||null;save()}};
    panel.querySelector('#apAddSection').onclick=()=>addSection(p);
    panel.querySelectorAll('[data-section-edit]').forEach(b=>b.onclick=()=>editSection(p,b.dataset.sectionEdit));
    panel.querySelectorAll('[data-section-remove]').forEach(b=>b.onclick=()=>{checkpoint();delete p.document[b.dataset.sectionRemove];notice='Seção removida. Use Desfazer para recuperá-la.';save()});
    panel.querySelector('#apAddAction').onclick=()=>editAction();
    panel.querySelector('#apTable').onclick=()=>{view='table';refresh()};panel.querySelector('#apCards').onclick=()=>{view='cards';refresh()};
    const content=panel.querySelector('#apActionContent');
    if(!p.actions.length)content.innerHTML='<div class="ap-empty">Este plano ainda não tem ações. Clique em <strong>＋ Nova ação</strong> para começar.</div>';
    else if(view==='table')content.innerHTML=`<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th class="ap-number">#</th><th>Ação / vínculo</th><th>${icon('people')} Atribuído a</th><th>${icon('calendar')} Data de conclusão</th><th>Status</th><th><span class="ap-sr-only">Opções</span></th></tr></thead><tbody>${p.actions.map((a,i)=>`<tr class="ap-row-${a.status} ${late(a)?'ap-row-late':''}" data-action-id="${esc(a.id)}"><td class="ap-number">${i+1}</td><td><div class="ap-task-cell"><button class="ap-complete ${a.status==='done'?'is-done':''}" data-complete="${esc(a.id)}" aria-label="${a.status==='done'?'Reabrir':'Concluir'} ${esc(a.title)}" aria-pressed="${a.status==='done'}" title="${a.status==='done'?'Reabrir ação':'Concluir ação'}">${a.status==='done'?'✓':''}</button><div class="ap-task-copy"><div class="ap-title">${esc(a.title)}</div>${linkedHTML(a.link)}${a.notes?`<div class="ap-note">${esc(a.notes)}</div>`:''}</div></div></td><td>${field(a,'owner',ownerHTML(a.owner))}</td><td>${field(a,'end',dateHTML(a))}<div class="ap-start">Início: ${format(a.start)}</div></td><td>${field(a,'status',badge(a))}</td><td>${buttons(a)}</td></tr>`).join('')}</tbody></table></div>`;
    else content.innerHTML=`<div class="ap-cards">${p.actions.map((a,i)=>`<article class="ap-card ap-row-${a.status} ${late(a)?'ap-row-late':''}" data-action-id="${esc(a.id)}"><div class="ap-card-top"><span class="ap-card-number">${String(i+1).padStart(2,'0')}</span>${field(a,'status',badge(a))}</div><div class="ap-task-cell"><button class="ap-complete ${a.status==='done'?'is-done':''}" data-complete="${esc(a.id)}" aria-label="${a.status==='done'?'Reabrir':'Concluir'} ${esc(a.title)}" aria-pressed="${a.status==='done'}">${a.status==='done'?'✓':''}</button><div class="ap-title">${esc(a.title)}</div></div>${linkedHTML(a.link)}<div class="ap-meta"><span class="ap-meta-label">Responsável</span>${field(a,'owner',ownerHTML(a.owner))}</div><div class="ap-meta"><span class="ap-meta-label">Término</span>${field(a,'end',dateHTML(a))}</div><div class="ap-start">Início: ${format(a.start)}</div>${a.notes?`<div class="ap-note">${esc(a.notes)}</div>`:''}<div class="ap-card-footer">${buttons(a)}</div></article>`).join('')}</div>`;
    panel.querySelectorAll('[data-complete]').forEach(b=>b.onclick=()=>{const a=p.actions.find(a=>a.id===b.dataset.complete);checkpoint();a.status=a.status==='done'?'pending':'done';notice='';save()});
    panel.querySelectorAll('[data-field]').forEach(b=>b.onclick=()=>inlineEdit(p.actions.find(a=>a.id===b.dataset.action),b.dataset.field));
    panel.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editAction(p.actions.find(a=>a.id===b.dataset.edit)));
    panel.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{const a=p.actions.find(a=>a.id===b.dataset.copy);checkpoint();p.actions.push({...JSON.parse(JSON.stringify(a)),id:id(),title:a.title+' — cópia'});save()});
    panel.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('Excluir esta ação? A tarefa vinculada no cronograma será mantida.')){checkpoint();p.actions=p.actions.filter(a=>a.id!==b.dataset.delete);save()}});
    panel.querySelectorAll('[data-open-task]').forEach(b=>b.onclick=()=>{switchView(false);api.openTask(b.dataset.openProject,b.dataset.openTask)});
  }
  function modal(title,body){
    closePopups();closeEditor();const overlay=document.createElement('div');overlay.className='popup-overlay';const m=document.createElement('div');m.className='modal ap-modal';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');
    m.innerHTML=`<h3>${esc(title)}</h3><form>${body}<div class="ap-error" role="alert" id="apError"></div><div class="modal-actions"><button type="button" id="apCancel">Cancelar</button><button class="act" type="submit">Salvar</button></div></form>`;
    document.body.append(overlay,m);m.querySelector('#apCancel').onclick=closePopups;overlay.onclick=closePopups;m.querySelector('input,select')?.focus();return m;
  }
  function editPlan(p){
    const m=modal(p?'Editar plano':'Novo plano',`<label>Nome do plano<input id="apPlanTitle" required maxlength="200" value="${esc(p?.title)}"></label><label>Descrição<textarea id="apPlanDescription">${esc(p?.description)}</textarea></label>`);
    m.querySelector('form').onsubmit=e=>{e.preventDefault();const title=m.querySelector('#apPlanTitle').value.trim();if(!title)return;const data={title,description:m.querySelector('#apPlanDescription').value.trim()};checkpoint();if(p)Object.assign(p,data);else{const plan={id:id(),...data,source:null,actions:[]};plans.push(plan);activeId=plan.id}closePopups();notice='';save()};
  }
  function editAction(existing,initialLink){
    api.flush();sync();const p=current();if(!p)return;
    const a=existing||{id:id(),title:'',owner:'',start:'',end:'',status:'pending',notes:'',link:initialLink||null};
    const m=modal(existing?'Editar ação':'Nova ação',`<label>Ação<input id="apActionTitle" required maxlength="300"></label><label>Responsável<input id="apOwner" maxlength="200" placeholder="Nome do responsável"></label><label>Cronograma vinculado<select id="apLinkProject"><option value="">Ação independente</option></select></label><label id="apTaskLabel">Linha do cronograma<select id="apLinkTask"></select></label><div class="ap-dates"><label>Início<input type="date" id="apStart"></label><label>Término<input type="date" id="apEnd"></label></div><p class="ap-hint" id="apDateHint"></p><label>Status<select id="apStatus">${Object.entries(statuses).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Observações<textarea id="apNotes"></textarea></label>`);
    const f=k=>m.querySelector('#'+k),projects=api.projects();
    f('apActionTitle').value=a.title||task(a.link)?.taskName||'';f('apOwner').value=a.owner;f('apStart').value=a.start;f('apEnd').value=a.end;f('apStatus').value=a.status;f('apNotes').value=a.notes;
    for(const project of projects){const o=new Option(project.title,project.id);f('apLinkProject').add(o)}
    if(a.link&&!projects.some(p=>p.id===a.link.projectId))f('apLinkProject').add(new Option('Cronograma indisponível',a.link.projectId));
    f('apLinkProject').value=a.link?.projectId||'';
    function chosenLink(){return f('apLinkProject').value&&f('apLinkTask').value?{projectId:f('apLinkProject').value,taskId:f('apLinkTask').value}:null}
    function dates(){
      const t=task(chosenLink());f('apStart').disabled=!!t&&(t.summary||!!t.pred);f('apEnd').disabled=!!t&&(t.summary||t.mile);
      f('apStart').required=!!t;f('apEnd').required=!!t;
      if(t){f('apStart').value=t.start;f('apEnd').value=t.end;if(!f('apActionTitle').value)f('apActionTitle').value=t.taskName}
      f('apDateHint').textContent=t?(t.summary?'As datas desta linha são calculadas pelas subtarefas. Altere as subtarefas no cronograma.':t.pred?'O início segue as dependências do cronograma. O término altera a duração; as regras do cronograma continuam valendo.':'As datas são compartilhadas com o cronograma. Dias úteis e marcos seguem as regras da tarefa.'):'As datas desta ação são independentes do cronograma.';
    }
    function tasks(selected){
      const project=projects.find(p=>p.id===f('apLinkProject').value),select=f('apLinkTask');select.replaceChildren();
      for(const t of project?.tasks||[])select.add(new Option(t.name,t.id));
      if(selected&&!project?.tasks.some(t=>t.id===selected))select.add(new Option('Linha indisponível — manter vínculo',selected));
      if(selected)select.value=selected;
      f('apTaskLabel').hidden=!f('apLinkProject').value;dates();
    }
    tasks(a.link?.taskId);f('apStart').onchange=()=>{if(task(chosenLink())?.mile)f('apEnd').value=f('apStart').value};f('apLinkProject').onchange=()=>tasks();f('apLinkTask').onchange=dates;
    m.querySelector('form').onsubmit=e=>{
      e.preventDefault();const link=chosenLink(),t=task(link);
      const updated={...a,title:f('apActionTitle').value.trim(),owner:f('apOwner').value.trim(),start:f('apStart').value,end:f('apEnd').value,status:f('apStatus').value,notes:f('apNotes').value.trim(),link};
      try{
        if(!updated.title)throw new Error('Informe o nome da ação.');
        if(updated.start&&updated.end&&updated.end<updated.start)throw new Error('O término deve ser igual ou posterior ao início.');
        const datesChanged=t&&!t.summary&&(updated.start!==t.start||updated.end!==t.end);
        checkpoint(datesChanged?{link,dates:{start:t.start,end:t.end}}:null);
        if(datesChanged)api.updateTask(link.projectId,link.taskId,updated);
        const actual=task(link);notice=actual&&(actual.start!==updated.start||actual.end!==updated.end)?'Datas ajustadas pelas regras do cronograma.':'';
        if(actual){updated.start=actual.start;updated.end=actual.end}
        if(existing)Object.assign(existing,updated);else p.actions.push(updated);
        closePopups();save();
      }catch(error){f('apError').textContent=error.message}
    };
  }
  function fromTask(projectId,taskId){
    api.flush();const link={projectId,taskId},t=task(link);if(!t)return;
    const m=modal('Criar plano / ação vinculada',`<p class="ap-hint">${esc(t.projectTitle)} · ${esc(t.taskName)}</p><label>Adicionar a<select id="apTargetPlan"><option value="">Novo plano de ação</option>${plans.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></label><label id="apNewTitleLabel">Nome do novo plano<input id="apNewTitle" value="${esc('Plano — '+t.taskName)}" maxlength="200"></label>`);
    m.querySelector('#apTargetPlan').onchange=e=>m.querySelector('#apNewTitleLabel').hidden=!!e.target.value;
    m.querySelector('form').onsubmit=e=>{e.preventDefault();const target=m.querySelector('#apTargetPlan').value,title=m.querySelector('#apNewTitle').value.trim();if(!target&&!title){m.querySelector('#apError').textContent='Informe o nome do plano.';return}checkpoint();activeId=target;if(!activeId){const p={id:id(),title,description:'',source:link,actions:[]};plans.push(p);activeId=p.id}const p=current();p.actions.push({id:id(),title:t.taskName,owner:'',start:t.start,end:t.end,status:'pending',notes:'',link});closePopups();save();switchView(true)};
  }
  function switchView(value){
    api.flush();
    const next=value==='todo'?'todo':value?'actions':'gantt';
    shown=next==='actions';
    document.documentElement.dataset.theme=shown?(planTheme||api.getTheme()):api.getTheme();
    document.documentElement.dataset.appView=next;
    document.getElementById('actionPanel').hidden=!shown;
    document.getElementById('actionToolbar').hidden=!shown;
    document.getElementById('todoPanel').hidden=next!=='todo';
    for(const [name,on]of [['tabGantt',next==='gantt'],['tabActions',shown],['tabTodo',next==='todo']]){
      const b=document.getElementById(name);b.classList.toggle('act',on);b.setAttribute('aria-selected',on);
    }
    if(next==='todo'){
      const frame=document.getElementById('todoFrame');
      if(!frame.getAttribute('src'))frame.src=frame.dataset.src;
    }else if(shown)refresh();else render();
  }
  function init(adapter){
    api=adapter;planTheme=localStorage.getItem('pf_action_plan_theme');if(!['dark','light'].includes(planTheme))planTheme='light';
    document.getElementById('apBackup').onclick=backup;document.getElementById('apImport').onclick=importFile;document.getElementById('apUndo').onclick=undoPlan;document.getElementById('apTheme').onclick=()=>{planTheme=(planTheme||api.getTheme())==='dark'?'light':'dark';localStorage.setItem('pf_action_plan_theme',planTheme);document.documentElement.dataset.theme=planTheme};
    document.getElementById('apExport').onclick=()=>{const p=current();if(p){sync();downloadJSON({version:1,type:'action-plans',actionPlans:[JSON.parse(JSON.stringify(p))]},cleanFileName(p.title)+'.json')}else{notice='Crie ou selecione um plano para exportar.';refresh()}};
    document.getElementById('apExcel').onclick=()=>{const p=current();if(p){sync();window.PlanExports.excel(p,task)}else{notice='Selecione um plano para exportar.';refresh()}};
    document.getElementById('apPDF').onclick=()=>{const p=current();if(p){sync();window.PlanExports.pdf(p,task)}else{notice='Selecione um plano para imprimir.';refresh()}};
    document.getElementById('apToggleNotes').onclick=e=>{notesShown=!notesShown;document.documentElement.dataset.apNotes=notesShown?'visible':'hidden';e.target.textContent='Observações: '+(notesShown?'sim':'não')};
    function setZoom(amount){zoom=Math.min(1.6,Math.max(.8,zoom+amount));document.documentElement.style.setProperty('--ap-zoom',zoom)}
    document.getElementById('apZoomIn').onclick=()=>setZoom(.1);document.getElementById('apZoomOut').onclick=()=>setZoom(-.1);
    document.addEventListener('keydown',e=>{if(shown&&!document.querySelector('.ap-modal')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&e.key==='z'&&(e.ctrlKey||e.metaKey)){e.preventDefault();undoPlan()}});
    for(const name of ['btnCloudSave','btnCloudHistory','btnBackupAll','btnCloudBackup','cloudBackupStatus'])document.getElementById(name).classList.add('global-control');
    document.getElementById('tabGantt').onclick=()=>switchView(false);document.getElementById('tabActions').onclick=()=>switchView(true);
    document.getElementById('tabTodo').onclick=()=>switchView('todo');
    document.getElementById('btnActionFromTask').onclick=()=>{const link=api.selectedTask();if(link)fromTask(link.projectId,link.taskId);else alert('Selecione uma linha do cronograma para criar uma ação vinculada. Para ações independentes, abra Planos de ação.')};
    sync();
  }
  return {init,load,validate,sync,refresh,fromTask,isVisible:()=>shown,exportData,backup,importData,restoreData};
})();
