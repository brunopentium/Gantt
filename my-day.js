/* A daily executive view over the original, independently stored records. */
window.MyDay=(()=>{
  'use strict';
  const SETTINGS_KEY='pf_my_day_settings_v1',PAGE_SIZE=20;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localDate=(value=new Date())=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  const stepDate=(value,step)=>{const d=new Date(value+'T12:00:00');d.setDate(d.getDate()+step);return localDate(d)};
  const fmt=value=>value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):'Sem data';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const icons={sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',edit:'<path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"/>',external:'<path d="M14 3h7v7m0-7-12 12M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',flag:'<path d="M5 21V3m0 1h14l-3 4 3 4H5"/>',folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>'};
  const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.calendar}</svg>`;
  const labels={today:'Hoje',overdue:'Atrasados',upcoming:'Próximos 7 dias',blocked:'Bloqueados',undated:'Sem prazo'};
  const descriptions={today:'O que pede sua atenção nesta data.',overdue:'Compromissos abertos cujo prazo já passou.',upcoming:'Antecipe entregas e organize os próximos sete dias.',blocked:'Pendências que precisam de decisão, ajuda ou cobrança.',undated:'Itens abertos sem data definida, para você revisar.'};
  const scheduleLabels={starting:'Iniciando',finishing:'Finalizando',ongoing:'Previstas em andamento',overdue:'Com término atrasado'};
  let api,services={},panel,root,editor,settingsDialog,unsubscribe,day=localDate(),scope='today',source='all',search='',scheduleScope='',scheduleProject='',scheduleSearch='',schedulePage=0,shown=false,busy=false,notice='',noticeError=false,renderQueued=false,settings={aliases:['Bruno','Bruno Souza']},snapshot={rows:[],work:{},schedule:{}},retained=new Map(),editing=null,focusBefore=null,workPages={mine:0,followup:0,unassigned:0};
  try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');if(saved?.aliases?.length&&saved.aliases.every(x=>typeof x==='string'))settings.aliases=saved.aliases}catch(_){/* Defaults also work when storage is unavailable. */}
  const ORDER_KEY='pf_my_day_order_v1';
  let ordering={automatic:true,first:'priority',hardFirst:false},focusKey='',ranks=new Map(),expandedHandled=new Set(),handledInSession=new Set();
  try{const saved=JSON.parse(localStorage.getItem(ORDER_KEY)||'null');if(saved)ordering={automatic:saved.automatic!==false,first:saved.first==='difficulty'?'difficulty':'priority',hardFirst:saved.hardFirst===true}}catch{}
  function saveOrdering(){try{localStorage.setItem(ORDER_KEY,JSON.stringify(ordering))}catch(error){message('Não foi possível guardar a preferência de ordenação.',true)}}
  const daily=row=>row.raw?.myDay?.[day]||{};
  const eligible=row=>row.open!==false&&!daily(row).handled&&!handledInSession.has(row.key);
  function ordered(list){
    const baseOrder=new Map(list.map((row,i)=>[row.key,i]));
    return [...list].sort((a,b)=>{
      const active=Number(!eligible(a))-Number(!eligible(b));if(active)return active;
      const x=daily(a),y=daily(b);
      const priority=(x.priority||3)-(y.priority||3),difficulty=((x.difficulty||3)-(y.difficulty||3))*(ordering.hardFirst?-1:1);
      const result=ordering.automatic?(ordering.first==='priority'?priority||difficulty:difficulty||priority):(x.order||Infinity)-(y.order||Infinity);
      return (Number.isNaN(result)?0:result)||baseOrder.get(a.key)-baseOrder.get(b.key);
    });
  }
  function dailyControls(row){
    const value=daily(row);
    const buttons=(field,label,max,selected)=>`<div class="md-rating-group"><span>${label}</span><div class="md-rating-buttons md-rating-${field}" role="group" aria-label="${label} de ${escape(row.title)}">${Array.from({length:max},(_,i)=>i+1).map(n=>`<button type="button" data-md-rating="${field}" data-key="${escape(row.key)}" data-value="${n}" aria-label="${label} ${n} de ${escape(row.title)}" aria-pressed="${selected===n}" ${busy?'disabled':''}>${n}</button>`).join('')}</div></div>`;
    return `<div class="md-daily-rating"><span class="md-daily-position">${ranks.has(row.key)?`#${ranks.get(row.key)}`:'Fora do foco'}</span>${buttons('priority','Prioridade do dia',5,value.priority||3)}${buttons('difficulty','Dificuldade do dia',5,value.difficulty||3)}${!ordering.automatic?buttons('order','Ordem manual',10,value.order):''}${(value.handled||handledInSession.has(row.key))&&row.open!==false?`<button class="md-text-button" data-md-refocus="${escape(row.key)}">Voltar à fila</button>`:''}</div>`;
  }
  function orderControls(){return `<div class="md-ordering"><label class="md-order-toggle"><input id="mdAutomaticOrder" type="checkbox" ${ordering.automatic?'checked':''}><span>Ordenar automaticamente</span></label><label><span>Primeiro critério</span><select id="mdOrderFirst" ${!ordering.automatic?'disabled':''}><option value="priority" ${ordering.first==='priority'?'selected':''}>Prioridade → dificuldade</option><option value="difficulty" ${ordering.first==='difficulty'?'selected':''}>Dificuldade → prioridade</option></select></label><label><span>Dificuldade</span><select id="mdHardFirst" ${!ordering.automatic?'disabled':''}><option value="easy" ${!ordering.hardFirst?'selected':''}>Fáceis primeiro</option><option value="hard" ${ordering.hardFirst?'selected':''}>Difíceis primeiro</option></select></label><p>${ordering.automatic?'Notas de 1 a 5; prioridade 1 é a mais alta. Sem avaliação, a nota é 3.':'Ordem manual: 1 vem primeiro, depois 2, 3… Itens sem número ficam por último.'} Avaliações apenas do Meu dia para ${fmt(day)}. O amarelo indica seu próximo foco.</p></div>`}
  function withHandled(item,patch){
    const dateFields=item.source==='todo'?['date','deadline']:['start','end'];
    const changedDate=dateFields.some(field=>Object.hasOwn(patch,field)&&String(patch[field]||'')!==String(item[field]||''));
    const closed=['done','cancelled','Concluída','Cancelada','Reserva'].includes(patch.status);
    return changedDate||closed?{...patch,...api.dailyPatch(item,day,{handled:true})}:patch;
  }
  function read(){try{snapshot=api.read(day,settings.aliases);snapshot.rows||=[];snapshot.work||={};snapshot.schedule||={}}catch(error){snapshot={rows:[],work:{},schedule:{},errors:[error.message]}}}
  function rowsFor(group,isSchedule=false){
    const list=[...(isSchedule?snapshot.schedule[group]:snapshot.work[group])||[]],keys=new Set(list.map(row=>row.key));
    for(const [key,groups]of retained){if(groups.has((isSchedule?'schedule:':'work:')+group)&&!keys.has(key)){const row=snapshot.rows.find(x=>x.key===key);if(row){list.push(row);keys.add(key)}}}
    return list;
  }
  const matches=(row,query)=>!query||normalize([row.title,row.context,row.path,row.owner,row.sourceLabel,row.notes].join(' ')).includes(normalize(query));
  const filtered=list=>list.filter(row=>(source==='all'||row.source===source)&&matches(row,search));
  function retain(row){
    const groups=retained.get(row.key)||new Set();
    for(const name of Object.keys(labels))if(rowsFor(name).some(x=>x.key===row.key))groups.add('work:'+name);
    for(const name of Object.keys(scheduleLabels))if(rowsFor(name,true).some(x=>x.key===row.key))groups.add('schedule:'+name);
    if(groups.size)retained.set(row.key,groups);
  }
  function retainedRow(row){return retained.has(row.key)}
  function statusOptions(row){
    if(Array.isArray(row.statusOptions))return row.statusOptions.map(x=>typeof x==='string'?{value:x,label:x}:x);
    if(row.source==='todo')return ['Em Andamento','Reserva','Recorrente','Concluída','Cancelada'].map(x=>({value:x,label:x}));
    return [{value:'pending',label:'Pendente'},{value:'doing',label:'Em andamento'},{value:'done',label:'Concluída'},{value:'blocked',label:'Bloqueada'},{value:'cancelled',label:'Cancelada'}];
  }
  function selectOptions(row){const options=statusOptions(row);if(!options.some(x=>String(x.value)===String(row.status)))options.unshift({value:row.status,label:row.statusLabel||row.status});return options.map(x=>`<option value="${escape(x.value)}" ${String(x.value)===String(row.status)?'selected':''}>${escape(x.label)}</option>`).join('')}
  function isRecurring(row){return row.source==='todo'&&(row.raw?.status==='Recorrente'||row.status==='Recorrente')&&row.raw?.recurrence?.frequency&&row.raw.recurrence.frequency!=='Nenhuma'}
  const linkedActivity=item=>item.ganttKey?snapshot.rows.find(row=>row.key===item.ganttKey):null;
  const isMilestone=item=>item.source==='gantt'?!!item.raw?.mile:!!linkedActivity(item)?.raw?.mile;
  function badge(row){return `<span class="md-source md-source-${escape(row.source)}">${escape(row.sourceLabel||({todo:'Todo',action:'Plano de ação',gantt:'Cronograma'}[row.source]))}</span>`}
  function dueText(row){
    if(row.source==='todo'){const bits=[];if(row.date)bits.push(`Programada ${fmt(row.date)}`);if(row.deadline)bits.push(`Prazo ${fmt(row.deadline)}`);return bits.join(' · ')||'Sem data'}
    if(row.source==='gantt')return `${fmt(row.start)} → ${fmt(row.end)}`;
    return row.end||row.deadline?`Prazo ${fmt(row.end||row.deadline)}`:'Sem prazo';
  }
  function rowHTML(row,isSchedule=false){
    const recurring=isRecurring(row),late=row.flags?.overdue&&row.open!==false;
    const completeLabel=recurring?`Concluir etapa e avançar ${row.title}`:`Concluir ${row.title}`;
    const dateValue=row.source==='todo'?row.date:row.end||row.deadline||'';
    const dateLabel=row.source==='todo'?'Programada':'Prazo';
    const statusControl=row.source==='gantt'?`<span class="md-progress"><span style="width:${Math.min(100,Math.max(0,Number(row.pct)||0))}%"></span></span><span class="md-progress-label">${Math.round(Number(row.pct)||0)}%</span>`:`<select data-md-status="${escape(row.key)}" aria-label="Status de ${escape(row.title)}">${selectOptions(row)}</select>`;
    const collapsed=!eligible(row),expanded=expandedHandled.has(row.key);
    const body=`
      <button class="md-complete ${row.open===false?'is-done':''}" data-md-complete="${escape(row.key)}" ${recurring?`data-md-advance="${escape(row.key)}"`:''} aria-label="${escape(completeLabel)}" title="${escape(recurring?'Concluir esta ocorrência e avançar para a próxima':row.open===false?'Já concluído ou encerrado':'Marcar como concluído')}" ${busy||row.open===false?'disabled':''}>${icon('check')}</button>
      <div class="md-item-content"><div class="md-item-tags">${badge(row)}${!isSchedule?`<span class="md-badge">${row.audience==='followup'?'Para cobrar':row.audience==='unassigned'?'Definir responsável':'Para fazer'}</span>${row.key===focusKey?'<span class="md-badge md-focus-badge">Foco agora</span>':''}`:''}${late?'<span class="md-badge md-badge-late">Atrasado</span>':''}${row.link?'<span class="md-badge md-badge-linked" title="Ação vinculada a uma atividade do cronograma">Vinculada ao cronograma</span>':''}${recurring?'<span class="md-badge">Recorrente</span>':''}${retainedRow(row)?'<span class="md-badge md-badge-updated">Atualizado nesta sessão</span>':''}</div>
      ${!collapsed?`<h4>${escape(row.title||'Sem título')}</h4>`:''}<button class="md-context" data-md-open="${escape(row.key)}" aria-label="Abrir ${escape(row.title)} na guia de origem">${icon('folder')}<span>${escape(row.path||row.context||'Sem projeto')}</span>${icon('external')}</button>${linkedActivity(row)?`<button class="md-context md-linked-context" data-md-open="${escape(linkedActivity(row).key)}" aria-label="Abrir atividade vinculada ${escape(linkedActivity(row).title)}">${icon('external')}<span>Cronograma: ${escape(linkedActivity(row).path)} · ${escape(linkedActivity(row).title)}</span></button>`:''}
      <div class="md-item-meta"><span class="${late?'md-late-text':''}">${icon('calendar')}${escape(dueText(row))}</span>${row.source==='action'?`<span class="md-owner">${escape(row.owner||'Responsável não informado')}</span>`:''}${row.priority?`<span>Prioridade original ${escape(row.priority)}</span>`:''}</div>${row.notes?`<p class="md-note">${escape(row.notes)}</p>`:''}${!isSchedule?dailyControls(row):''}
      </div><div class="md-item-controls">${statusControl}${!isSchedule?`<label class="md-inline-date"><span>${dateLabel}</span><input type="date" data-md-date="${escape(row.key)}" aria-label="${dateLabel} de ${escape(row.title)}" value="${escape(dateValue)}" ${row.source==='action'&&row.endLocked?'disabled':''} title="${escape(row.dateHint||'')}"></label>`:''}<button class="md-icon-button" data-md-edit="${escape(row.key)}" aria-label="Editar ${escape(row.title)}" title="Editar detalhes">${icon('edit')}</button></div>
      `;
    const summary=collapsed?`<div class="md-handled-summary"><div><h4>${escape(row.title||'Sem título')}</h4><span>${badge(row)} ${escape(row.statusLabel||row.status)} · ${escape(dueText(row))}</span></div><button type="button" class="md-button" data-md-toggle-handled="${escape(row.key)}" aria-expanded="${expanded}" aria-label="${expanded?'Recolher':'Expandir'} ${escape(row.title)}">${expanded?'Recolher ↑':'Expandir ↓'}</button></div>`:'';
    return `<article class="md-item ${retainedRow(row)?'md-retained':''} ${late?'md-item-late':''} ${!isSchedule&&row.key===focusKey?'md-daily-focus':''} ${collapsed?'md-handled-item':''}" data-my-day-item="${escape(row.key)}" data-source="${escape(row.source)}" data-audience="${escape(row.audience)}">${summary}${collapsed?`<div class="md-handled-body" ${expanded?'':'hidden'}>${body}</div>`:body}</article>`;
  }
  function sectionHTML(title,subtitle,rows,type){
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));workPages[type]=Math.min(workPages[type],pages-1);const visible=rows.slice(workPages[type]*PAGE_SIZE,(workPages[type]+1)*PAGE_SIZE);
    return `<section class="md-work-section md-${type}" data-audience="${type==='mine'?'mine':type==='followup'?'followup':'unassigned'}"><header><div><h3>${title}<span class="md-count">${rows.length}</span></h3><p>${subtitle}</p></div></header>${visible.map(row=>rowHTML(row)).join('')}${pages>1?`<nav class="md-pagination" aria-label="Páginas de ${title}"><button data-md-work-page="${type}" data-step="-1" ${workPages[type]===0?'disabled':''}>← Anterior</button><span>Página ${workPages[type]+1} de ${pages}</span><button data-md-work-page="${type}" data-step="1" ${workPages[type]>=pages-1?'disabled':''}>Próxima →</button></nav>`:''}</section>`;
  }
  function scheduleHTML(){
    const count=name=>rowsFor(name,true).length;
    let detail='';
    if(scheduleScope){
      const all=rowsFor(scheduleScope,true),projects=new Map();all.forEach(row=>projects.set(row.ref?.projectId||row.projectId||row.context,row.context||row.path||'Cronograma'));
      const rows=ordered(all.filter(row=>(!scheduleProject||(row.ref?.projectId||row.projectId||row.context)===scheduleProject)&&matches(row,scheduleSearch)));
      const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));schedulePage=Math.min(schedulePage,pages-1);const page=rows.slice(schedulePage*PAGE_SIZE,(schedulePage+1)*PAGE_SIZE);
      detail=`<div class="md-schedule-detail"><div class="md-schedule-detail-head"><div><h3>${scheduleLabels[scheduleScope]}</h3><p>${scheduleScope==='ongoing'?'Atividades abertas cujo intervalo planejado inclui esta data.':scheduleScope==='overdue'?'Atividades abertas com término planejado anterior à data escolhida.':`Atividades com ${scheduleScope==='starting'?'início':'término'} planejado em ${fmt(day)}.`}</p></div><button class="md-text-button" data-md-close-schedule>Recolher ↑</button></div><div class="md-schedule-filters"><label><span>Cronograma</span><select id="mdScheduleProject"><option value="">Todos os cronogramas</option>${[...projects].map(([id,title])=>`<option value="${escape(id)}" ${id===scheduleProject?'selected':''}>${escape(title)}</option>`).join('')}</select></label><label class="md-search">${icon('search')}<input id="mdScheduleSearch" type="search" placeholder="Buscar atividade ou cronograma" aria-label="Buscar nos cronogramas" value="${escape(scheduleSearch)}"></label><span class="md-result-count">${rows.length} atividade${rows.length===1?'':'s'}</span></div>${page.length?page.map(row=>rowHTML(row,true)).join(''):'<div class="md-empty md-empty-small">Nenhuma atividade para esta seleção.</div>'}${rows.length>PAGE_SIZE?`<nav class="md-pagination" aria-label="Páginas das atividades"><button data-md-page="-1" ${schedulePage===0?'disabled':''}>← Anterior</button><span>Página ${schedulePage+1} de ${pages}</span><button data-md-page="1" ${schedulePage>=pages-1?'disabled':''}>Próxima →</button></nav>`:''}</div>`;
    }
    return `<section class="md-schedule"><header class="md-schedule-header"><div class="md-schedule-title">${icon('calendar')}<div><h2>Cronogramas</h2><p>Marcos do dia e acompanhamento das atividades planejadas.</p></div></div><span class="md-small-label">Visão separada</span></header><div class="md-schedule-stats">${[['starting','Iniciando no dia','arrow'],['finishing','Finalizando no dia','flag'],['ongoing','Previstas em andamento','clock'],['overdue','Término atrasado','calendar']].map(([name,label,ico])=>`<button data-md-schedule="${name}" class="${scheduleScope===name?'is-selected':''}" aria-expanded="${scheduleScope===name}">${icon(ico)}<span><strong>${count(name)}</strong><span>${label}</span></span><span class="md-stat-arrow">${scheduleScope===name?'−':'+'}</span></button>`).join('')}</div>${detail}</section>`;
  }
  function render(){
    if(!root||!shown)return;
    const list=ordered(filtered(rowsFor(scope)));
    const active=list.filter(eligible);focusKey=active[0]?.key||'';ranks=new Map(active.map((row,i)=>[row.key,i+1]));
    const longDate=new Date(day+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const errors=(snapshot.errors||[]).map(error=>`<div class="md-alert md-alert-error" role="alert">${escape(typeof error==='string'?error:error.message||error)}</div>`).join('');
    const todayRows=rowsFor('today'),ownToday=todayRows.filter(row=>row.audience==='mine'||row.source==='todo').length,followToday=todayRows.filter(row=>row.audience==='followup').length;
    root.innerHTML=`<div class="md-shell"><header class="md-header"><div class="md-heading"><div class="md-sun">${icon('sun')}</div><div><span class="md-eyebrow">Seu painel executivo</span><h1>Meu dia</h1><p>Faça o que é seu. Acompanhe o que depende de outras pessoas.</p></div></div><div class="md-header-actions">${services.backup||window.WorkspaceBackup?'<button id="mdBackup" class="md-button">Backup geral</button>':''}${services.save?`<button id="mdSave" class="md-button" ${busy?'disabled':''}>Salvar no GitHub</button>`:''}<button id="mdSettings" class="md-icon-button" title="Definir seus nomes e responsáveis" aria-label="Configurar meus nomes">${icon('settings')}</button></div></header>
    <div class="md-date-bar"><div class="md-date-navigation"><button data-md-day="-1" aria-label="Dia anterior">‹</button><label class="md-date-input">${icon('calendar')}<input id="mdDate" type="date" value="${day}" aria-label="Data do painel"></label><button data-md-day="1" aria-label="Próximo dia">›</button><button id="mdToday" class="md-text-button">Hoje</button></div><span class="md-long-date">${escape(longDate)}</span><button id="mdRefresh" class="md-button md-primary" title="Atualizar painel" aria-label="Atualizar painel" ${busy?'disabled':''}>${icon('refresh')}Atualizar painel</button></div>
    ${notice?`<div class="md-alert ${noticeError?'md-alert-error':'md-alert-success'}" role="${noticeError?'alert':'status'}">${escape(notice)}</div>`:''}${errors}
    <div class="md-metrics">${[['today','Para hoje',rowsFor('today').length,'sun',`${ownToday} para fazer · ${followToday} para cobrar`],['overdue','Atrasados',rowsFor('overdue').length,'clock','Prazos que precisam de atenção'],['upcoming','Próximos 7 dias',rowsFor('upcoming').length,'calendar','Antecipe as próximas entregas'],['blocked','Bloqueados',rowsFor('blocked').length,'flag','Decisões e intervenções']].map(([name,label,count,ico,note])=>`<button class="md-metric md-metric-${name} ${scope===name?'is-selected':''}" data-md-scope="${name}" aria-pressed="${scope===name}"><span class="md-metric-top"><span>${label}</span>${icon(ico)}</span><strong>${count}</strong><small>${escape(note)}</small></button>`).join('')}</div>
    <div class="md-schedule-peek"><span>${icon('calendar')}Cronogramas</span>${[['starting','iniciando'],['finishing','finalizando'],['ongoing','previstas em andamento']].map(([name,label])=>`<button data-md-jump-schedule="${name}"><strong>${rowsFor(name,true).length}</strong> ${label} ${icon('arrow')}</button>`).join('')}</div>
    <section class="md-focus"><div class="md-focus-heading"><div><span class="md-eyebrow">Todo e planos de ação</span><h2>${labels[scope]} <span class="md-total">${list.length}</span></h2><p>${descriptions[scope]}</p></div><button class="md-text-button ${scope==='undated'?'is-selected':''}" data-md-scope="undated" aria-pressed="${scope==='undated'}">Sem prazo <span class="md-count">${rowsFor('undated').length}</span></button></div><div class="md-filters"><label class="md-search">${icon('search')}<input id="mdSearch" type="search" aria-label="Buscar tarefas e ações" placeholder="Buscar assunto, projeto ou responsável" value="${escape(search)}"></label><label class="md-source-filter"><span>Origem</span><select id="mdSource" aria-label="Origem das tarefas e ações"><option value="all" ${source==='all'?'selected':''}>Todo e planos de ação</option><option value="todo" ${source==='todo'?'selected':''}>Todo</option><option value="action" ${source==='action'?'selected':''}>Planos de ação</option></select></label></div>
    ${orderControls()}${focusKey?'<button id="mdGoToFocus" class="md-text-button">Ir para o foco agora ↓</button>':''}${list.length?`<div class="md-work-grid md-priority-queue">${sectionHTML('Fila de atenção','Tarefas e ações na ordem escolhida. Os rótulos distinguem o que fazer e o que cobrar.',list.filter(eligible),'mine')}${list.some(row=>!eligible(row))?`<section class="md-work-section md-handled-tail"><header><div><h3>Reagendados e encerrados <span class="md-count">${list.filter(row=>!eligible(row)).length}</span><p>Itens atualizados no fim da fila. Expanda para consultar ou alterar.</p></div></header>${list.filter(row=>!eligible(row)).map(row=>rowHTML(row)).join('')}</section>`:''}</div>`:`<div class="md-empty"><span>${icon('check')}</span><h3>Nenhum item nesta seleção</h3><p>Ajuste os filtros ou veja os atrasados.</p></div>`}
    <p class="md-refresh-note">${icon('refresh')}Alterações são aplicadas na guia de origem. Itens alterados permanecem nesta seleção até você atualizar o painel.</p></section>${scheduleHTML()}
    <footer class="md-footer"><span>Responsabilidades pessoais: ${escape(settings.aliases.join(' · '))}</span><button class="md-text-button" data-md-settings>Editar meus nomes</button><span>Concluídos, cancelados e itens em reserva ficam fora das listas abertas.</span></footer></div>`;
    bind();
  }
  function queuedRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;read();render()})}
  function row(key){return snapshot.rows.find(x=>x.key===key)}
  function message(value,error=false){notice=value;noticeError=error}
  async function mutate(item,operation){
    if(!item||busy)return;retain(item);busy=true;
    try{await operation();read();const updated=row(item.key);if(updated&&(updated.open===false||['date','deadline','start','end'].some(field=>String(updated[field]||'')!==String(item[field]||'')))){handledInSession.add(item.key);expandedHandled.delete(item.key)}message('Alteração aplicada. Atualize o painel quando quiser reorganizar a seleção.');read()}
    catch(error){message(error.message||'Não foi possível aplicar a alteração.',true)}
    finally{busy=false;render()}
  }
  function changeDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return;day=value;retained.clear();handledInSession.clear();expandedHandled.clear();notice='';schedulePage=0;workPages={mine:0,followup:0,unassigned:0};read();render()}
  function refresh(){retained.clear();handledInSession.clear();expandedHandled.clear();notice='';try{api?.flush?.()}catch(error){message(error.message,true)}read();render()}
  function debounceInput(input,callback){let timer;input.addEventListener('input',()=>{const value=input.value;clearTimeout(timer);timer=setTimeout(()=>{const start=input.selectionStart;callback(value);const current=document.getElementById(input.id);current?.focus();if(current?.type==='search')current.setSelectionRange(start,start)},160)})}
  function bind(){
    document.getElementById('mdAutomaticOrder').onchange=e=>{ordering.automatic=e.target.checked;saveOrdering();workPages.mine=0;render()};
    document.getElementById('mdOrderFirst').onchange=e=>{ordering.first=e.target.value;saveOrdering();workPages.mine=0;render()};
    document.getElementById('mdHardFirst').onchange=e=>{ordering.hardFirst=e.target.value==='hard';saveOrdering();workPages.mine=0;render()};
    document.getElementById('mdGoToFocus')?.addEventListener('click',()=>{workPages.mine=0;render();root.querySelector('.md-daily-focus')?.scrollIntoView({block:'center',behavior:'smooth'})});
    root.querySelectorAll('[data-md-rating]').forEach(button=>button.onclick=()=>{
      const item=row(button.dataset.key),field=button.dataset.mdRating,value=Number(button.dataset.value);
      try{const patch=api.dailyPatch(item,day,{[field]:value});mutate(item,()=>api.update(item.ref,patch))}catch(error){message(error.message,true);render()}
    });
    root.querySelectorAll('[data-md-toggle-handled]').forEach(button=>button.onclick=()=>{const key=button.dataset.mdToggleHandled;if(expandedHandled.has(key))expandedHandled.delete(key);else expandedHandled.add(key);render()});
    root.querySelectorAll('[data-md-refocus]').forEach(button=>button.onclick=()=>{const item=row(button.dataset.mdRefocus);handledInSession.delete(item.key);expandedHandled.delete(item.key);mutate(item,()=>api.update(item.ref,api.dailyPatch(item,day,{handled:false})))});

    root.querySelectorAll('[data-md-day]').forEach(button=>button.onclick=()=>changeDate(stepDate(day,Number(button.dataset.mdDay))));
    document.getElementById('mdDate').onchange=e=>changeDate(e.target.value);
    document.getElementById('mdToday').onclick=()=>changeDate(localDate());
    document.getElementById('mdRefresh').onclick=refresh;
    root.querySelectorAll('[data-md-scope]').forEach(button=>button.onclick=()=>{scope=button.dataset.mdScope;workPages={mine:0,followup:0,unassigned:0};render()});
    document.getElementById('mdSource').onchange=e=>{source=e.target.value;workPages={mine:0,followup:0,unassigned:0};render()};
    debounceInput(document.getElementById('mdSearch'),value=>{search=value;workPages={mine:0,followup:0,unassigned:0};render()});
    root.querySelectorAll('[data-md-schedule]').forEach(button=>button.onclick=()=>{scheduleScope=scheduleScope===button.dataset.mdSchedule?'':button.dataset.mdSchedule;schedulePage=0;scheduleProject='';scheduleSearch='';render()});
    root.querySelectorAll('[data-md-jump-schedule]').forEach(button=>button.onclick=()=>{scheduleScope=button.dataset.mdJumpSchedule;schedulePage=0;scheduleProject='';scheduleSearch='';render();root.querySelector('.md-schedule')?.scrollIntoView({block:'start',behavior:'smooth'})});
    root.querySelector('[data-md-close-schedule]')?.addEventListener('click',()=>{scheduleScope='';render()});
    document.getElementById('mdScheduleProject')?.addEventListener('change',e=>{scheduleProject=e.target.value;schedulePage=0;render()});
    const scheduleInput=document.getElementById('mdScheduleSearch');if(scheduleInput)debounceInput(scheduleInput,value=>{scheduleSearch=value;schedulePage=0;render()});
    root.querySelectorAll('[data-md-page]').forEach(button=>button.onclick=()=>{schedulePage+=Number(button.dataset.mdPage);render();document.querySelector('.md-schedule-detail-head')?.scrollIntoView({block:'nearest'})});
    root.querySelectorAll('[data-md-work-page]').forEach(button=>button.onclick=()=>{const name=button.dataset.mdWorkPage;workPages[name]+=Number(button.dataset.step);render();root.querySelector('.md-'+name)?.scrollIntoView({block:'nearest'})});
    root.querySelectorAll('[data-md-complete]').forEach(button=>button.onclick=()=>{const item=row(button.dataset.mdComplete);mutate(item,()=>isRecurring(item)&&api.advance?api.update(item.ref,withHandled(item,{date:api.nextRecurrence(item.raw,day)})):api.complete(item.ref))});
    root.querySelectorAll('[data-md-status]').forEach(select=>select.onchange=()=>{const item=row(select.dataset.mdStatus);mutate(item,()=>api.update(item.ref,withHandled(item,{status:select.value})))});
    root.querySelectorAll('[data-md-date]').forEach(input=>input.onchange=()=>{const item=row(input.dataset.mdDate);mutate(item,()=>api.update(item.ref,withHandled(item,{[item.source==='todo'?'date':'end']:input.value})))});
    root.querySelectorAll('[data-md-edit]').forEach(button=>button.onclick=()=>openEditor(row(button.dataset.mdEdit),button));
    root.querySelectorAll('[data-md-open]').forEach(button=>button.onclick=()=>{try{api.open(row(button.dataset.mdOpen).ref)}catch(error){message(error.message,true);render()}});
    document.getElementById('mdSettings').onclick=openSettings;root.querySelectorAll('[data-md-settings]').forEach(button=>button.onclick=openSettings);
    document.getElementById('mdBackup')?.addEventListener('click',()=>{try{(services.backup||window.WorkspaceBackup.exportAll)()}catch(error){message(error.message,true);render()}});
    document.getElementById('mdSave')?.addEventListener('click',openSave);
  }
  const field=(id,label,value,type='text',attrs='')=>`<label class="md-field"><span>${label}</span><input id="${id}" type="${type}" value="${escape(value)}" ${attrs}></label>`;
  function showDialog(dialog){focusBefore=document.activeElement;dialog.showModal();dialog.querySelector('input,select,textarea,button')?.focus()}
  function closeDialog(dialog){dialog.close();focusBefore?.focus()}
  function openEditor(item,button){
    if(!item)return;editing=item;focusBefore=button;
    const initial={title:item.title||'',notes:item.notes||'',date:item.date||'',deadline:item.deadline||'',status:item.status||'',priority:item.priority||1,owner:item.owner||'',start:item.start||'',end:item.end||'',pct:item.pct||0};
    editor.innerHTML=`<form id="mdEditForm" class="md-dialog-body"><header><div>${badge(item)}<h2>Editar item</h2><p>${escape(item.path||item.context)}</p></div><button type="button" class="md-dialog-close" data-md-close-editor aria-label="Fechar edição">×</button></header><div class="md-dialog-fields">${field('mdEditTitle','Título',item.title,'text','required maxlength="1000"')}${item.source!=='gantt'?`<label class="md-field"><span>Status</span><select id="mdEditStatus">${selectOptions(item)}</select></label>`:''}${item.source==='action'?field('mdEditOwner','Responsável',item.owner):''}
    <div class="md-field-pair">${item.source==='todo'?field('mdEditDate','Data programada',item.date,'date')+field('mdEditDeadline','Prazo',item.deadline,'date'):field('mdEditStart','Início planejado',item.start,'date',item.startLocked?'disabled':'')+field('mdEditEnd','Término planejado / prazo',item.end,'date',item.endLocked?'disabled':'')}</div>
    ${item.source==='todo'?field('mdEditPriority','Prioridade (1 a 5)',item.priority||1,'number','min="1" max="5" step="1"'):''}${item.source==='gantt'?field('mdEditPct','Progresso (%)',item.pct||0,'number','min="0" max="100" step="1"'):''}<label class="md-field"><span>Observações</span><textarea id="mdEditNotes" rows="4">${escape(item.notes)}</textarea></label><p class="md-editor-hint">${item.link?'As datas desta ação seguem o vínculo com o cronograma. Alterações respeitam as dependências existentes.':'A alteração será aplicada no registro da guia de origem.'}</p><div id="mdEditError" class="md-dialog-error" role="alert"></div></div><footer><button type="button" class="md-button" data-md-close-editor>Cancelar</button><button type="submit" id="mdEditSave" class="md-button md-primary">Salvar alterações</button></footer></form>`;
    editor.querySelectorAll('[data-md-close-editor]').forEach(button=>button.onclick=()=>closeDialog(editor));
    if(isMilestone(item)&&!item.startLocked&&!item.endLocked){const start=document.getElementById('mdEditStart'),end=document.getElementById('mdEditEnd');start.onchange=()=>{end.value=start.value};end.onchange=()=>{start.value=end.value}}
    document.getElementById('mdEditForm').onsubmit=async e=>{
      e.preventDefault();const item=editing;if(!item)return;const value=id=>document.getElementById(id)?.value||'';
      const patch={title:value('mdEditTitle').trim(),notes:value('mdEditNotes')};
      if(item.source==='todo'){Object.assign(patch,{date:value('mdEditDate'),deadline:value('mdEditDeadline'),status:value('mdEditStatus'),priority:Number(value('mdEditPriority'))})}
      if(item.source==='action')Object.assign(patch,{owner:value('mdEditOwner'),start:value('mdEditStart'),end:value('mdEditEnd'),status:value('mdEditStatus')});
      if(item.source==='gantt')Object.assign(patch,{start:value('mdEditStart'),end:value('mdEditEnd'),pct:Number(value('mdEditPct'))});
      // Unchanged dates must not clear deferred Todo dates or rewrite dependency-controlled dates.
      for(const key of Object.keys(patch))if(String(patch[key]??'')===String(initial[key]??'')||(item.editableFields?.length&&!item.editableFields.includes(key)))delete patch[key];
      if(!Object.keys(patch).length){closeDialog(editor);return}
      const button=document.getElementById('mdEditSave');button.disabled=true;retain(item);
      try{await api.update(item.ref,item.source==='gantt'?patch:withHandled(item,patch));if(['date','deadline','start','end'].some(field=>Object.hasOwn(patch,field))||['done','cancelled','Concluída','Cancelada','Reserva'].includes(patch.status)||patch.pct===100){handledInSession.add(item.key);expandedHandled.delete(item.key)}closeDialog(editor);message('Alterações aplicadas na guia de origem.');read();render()}
      catch(error){document.getElementById('mdEditError').textContent=error.message||'Não foi possível salvar.'}
      finally{button.disabled=false}
    };
    showDialog(editor);
  }
  function openSettings(){
    settingsDialog.innerHTML=`<form id="mdSettingsForm" class="md-dialog-body"><header><div><h2>Quem é você nas ações?</h2><p>O painel separa suas entregas das cobranças a outras pessoas.</p></div><button type="button" class="md-dialog-close" data-md-close-settings aria-label="Fechar configuração">×</button></header><div class="md-dialog-fields"><label class="md-field"><span>Seus nomes no campo responsável, um por linha</span><textarea id="mdAliases" rows="4" required>${escape(settings.aliases.join('\n'))}</textarea></label><p class="md-editor-hint">Bruno e Bruno Souza já estão configurados. Acentos e letras maiúsculas não mudam a identificação. Responsáveis separados por vírgula, ponto e vírgula, barra ou “e” também são reconhecidos.</p><label class="md-legacy-option"><input id="mdLegacyTodo" type="checkbox" ${window.AppNavigation?.isLegacyVisible()?'checked':''}><span>Mostrar a guia Todo antigo (Google)</span></label><p class="md-editor-hint">A guia antiga está preservada e só carrega o Google quando você a abre.</p><div id="mdSettingsError" class="md-dialog-error" role="alert"></div></div><footer><button type="button" class="md-button" data-md-close-settings>Cancelar</button><button type="submit" id="mdSettingsSave" class="md-button md-primary">Salvar configurações</button></footer></form>`;
    settingsDialog.querySelectorAll('[data-md-close-settings]').forEach(button=>button.onclick=()=>closeDialog(settingsDialog));
    document.getElementById('mdSettingsForm').onsubmit=e=>{e.preventDefault();const aliases=[...new Set(document.getElementById('mdAliases').value.split('\n').map(x=>x.trim()).filter(Boolean))];if(!aliases.length){document.getElementById('mdSettingsError').textContent='Informe pelo menos um nome.';return}try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({aliases}));window.AppNavigation?.setLegacyVisible(document.getElementById('mdLegacyTodo').checked);settings={aliases};closeDialog(settingsDialog);refresh()}catch(error){document.getElementById('mdSettingsError').textContent=error.message}};
    showDialog(settingsDialog);
  }
  function openSave(){
    settingsDialog.innerHTML=`<div class="md-dialog-body"><header><div><h2>Salvar no GitHub</h2><p>Escolha os dados que você alterou. Cada área mantém seu próprio histórico.</p></div><button class="md-dialog-close" data-md-close-save aria-label="Fechar salvamento">×</button></header><div class="md-save-options">${[['todo','Task'],['action','Planos de ação'],['gantt','Cronogramas']].map(([name,label])=>`<button class="md-save-option" data-md-save-source="${name}"><span>${label}<small>${escape(services.status?.(name)||'Salvar uma versão dos dados desta área')}</small></span>${icon('arrow')}</button>`).join('')}</div><footer><button class="md-button" data-md-close-save>Fechar</button></footer></div>`;
    settingsDialog.querySelectorAll('[data-md-close-save]').forEach(button=>button.onclick=()=>closeDialog(settingsDialog));
    settingsDialog.querySelectorAll('[data-md-save-source]').forEach(button=>button.onclick=async()=>{
      const source=button.dataset.mdSaveSource;closeDialog(settingsDialog);busy=true;message('Salvando '+({todo:'Task',action:'planos de ação',gantt:'cronogramas'}[source])+' no GitHub…');render();
      try{const result=await services.save(source);const status=result||services.status?.(source)||'Salvamento finalizado.';message(status,/não foi|não salvo|erro|falha|sem acesso|não encontrado|token inválido|conflito|not saved|error|failed|could not|invalid|denied|conflict/i.test(status))}
      catch(error){message(error.message,true)}finally{busy=false;read();render()}
    });
    showDialog(settingsDialog);
  }
  function init(adapter,options={}){
    api=adapter||window.MyDayData;services=options;panel=document.getElementById('myDayPanel');if(!panel||!api)return;
    panel.innerHTML='<div class="md-root"></div><dialog id="mdEditor" class="md-dialog" aria-label="Editar item do Meu dia"></dialog><dialog id="mdSettingsDialog" class="md-dialog" aria-label="Configurações do Meu dia"></dialog>';
    root=panel.querySelector('.md-root');editor=document.getElementById('mdEditor');settingsDialog=document.getElementById('mdSettingsDialog');
    for(const dialog of [editor,settingsDialog]){dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeDialog(dialog)}});dialog.addEventListener('cancel',()=>focusBefore?.focus())}
    unsubscribe?.();unsubscribe=api.subscribe?.(()=>{if(shown)queuedRender()});
  }
  function show(){if(!api||!root)return;shown=true;try{api.flush?.()}catch(error){message(error.message,true)}read();render()}
  function hide(){shown=false;if(editor?.open)closeDialog(editor);if(settingsDialog?.open)closeDialog(settingsDialog)}
  return {init,show,hide,refresh,date:()=>day};
})();
