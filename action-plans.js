/* Action plans share linked dates with the original task; identifiers survive row reordering. */
window.ActionPlans=(()=>{
  'use strict';
  let includeChildren=true,statusFilter='all',hideStatuses=false,retainedEntries=new Set(),visibleStatuses=new Map();
  let api,plans=[],activeId=null,view='table',shown=false,notice='',undo=[],zoom=1,notesShown=true,planTheme=null;
  const changeListeners=new Set();
  function changed(){for(const listener of changeListeners)listener()}
  const statuses={pending:'Pending',doing:'In progress',done:'Completed',blocked:'Blocked',cancelled:'Cancelled'};
  const statusFilters={all:'All statuses',hide_done:'Hide completed',hide_blocked:'Hide blocked',...statuses};
  const id=()=>crypto.randomUUID();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>{if(!value)return true;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===value};
  const linkValid=link=>!link||(typeof link.projectId==='string'&&typeof link.taskId==='string');
  function validate(data){
    if(!Array.isArray(data))throw new Error('Invalid action plans in the file.');
    const seen=new Set();
    for(const p of data){
      if(!p||typeof p.id!=='string'||seen.has(p.id)||typeof p.title!=='string'||(p.description!=null&&typeof p.description!=='string')||!linkValid(p.source)||!Array.isArray(p.actions))throw new Error('Invalid action plan.');
      if(p.document!=null){const d=p.document;if(typeof d!=='object'||Array.isArray(d)||['agenda','notes'].some(k=>d[k]!=null&&typeof d[k]!=='string')||(d.participants!=null&&(!Array.isArray(d.participants)||d.participants.some(x=>typeof x!=='string'))))throw new Error('Invalid document sections.');}
      seen.add(p.id);const actionIds=new Set();
      for(const a of p.actions){
        if(!a||typeof a.id!=='string'||actionIds.has(a.id)||typeof a.title!=='string'||typeof a.owner!=='string'||typeof a.notes!=='string'||!Object.hasOwn(statuses,a.status)||!date(a.start)||!date(a.end)||(a.start&&a.end&&a.end<a.start)||!linkValid(a.link))throw new Error('Invalid action in the file.');
        actionIds.add(a.id);
      }
    }
    const byId=new Map(data.map(p=>[p.id,p]));
    for(const p of data){
      if(p.parentId!=null&&(typeof p.parentId!=='string'||!byId.has(p.parentId)))throw new Error('Parent plan is missing or invalid.');
      const ancestors=new Set([p.id]);let parent=p.parentId;
      while(parent){if(ancestors.has(parent))throw new Error('A plan cannot be the parent of itself or an ancestor.');ancestors.add(parent);const ancestor=byId.get(parent);if(!ancestor)throw new Error('Parent plan is missing or invalid.');parent=ancestor.parentId}
    }
  }
  function load(data){validate(data);peopleCache=null;undo=[];applyStatusFilter();plans=JSON.parse(JSON.stringify(data));activeId=plans.some(p=>p.id===activeId)?activeId:plans[0]?.id||null;changed()}
  function checkpoint(taskChange,previousPlans){undo.push({plans:previousPlans||JSON.parse(JSON.stringify(plans)),activeId,taskChange});if(undo.length>50)undo.shift()}
  function undoPlan(){
    const previous=undo.at(-1);if(!previous)return;
    try{if(previous.taskChange){const {link,dates}=previous.taskChange,t=task(link);if(t&&!t.summary)api.updateTask(link.projectId,link.taskId,{...dates,start:t.pred?t.start:dates.start})}undo.pop();plans=previous.plans;activeId=previous.activeId;notice='Change undone';save()}catch(e){notice=e.message;refresh()}
  }
  function backup(){api.flush();sync();downloadJSON({version:1,type:'action-plans',exportedAt:new Date().toISOString(),actionPlans:exportData()},'planos-de-acao-backup.json')}
  function exportData(){return JSON.parse(JSON.stringify(plans))}
  function importData(data){
    const incoming=data.actionPlans||(data.actions?[data]:null);validate(incoming);if(!incoming.length)throw new Error('The file contains no plans.');checkpoint();const copies=JSON.parse(JSON.stringify(incoming));
    const mapping=new Map(copies.map(p=>[p.id,id()]));
    for(const p of copies){p.id=mapping.get(p.id);if(p.parentId)p.parentId=mapping.get(p.parentId);p.actions.forEach(a=>a.id=id());plans.push(p)}activeId=copies[0].id;sync();notice=copies.length+' plan(s) imported. Existing plans were kept.';save();
  }
  function importFile(){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{if(input.files[0])importData(JSON.parse(await input.files[0].text()))}catch(e){notice='Import failed: '+e.message;refresh()}};input.click()}
  function restoreData(data,applyDates=true){
    validate(data);
    const copy=JSON.parse(JSON.stringify(data));
    if(applyDates)for(const p of copy)for(const a of p.actions){const t=task(a.link);if(t&&!t.summary&&a.start&&a.end){const start=t.pred?t.start:a.start;if(a.end>=start)api.updateTask(a.link.projectId,a.link.taskId,{start,end:t.mile?start:a.end})}}
    load(copy);sync();notice='Plans restored. Linked dates follow schedule rules.';save();
  }
  function duplicatePlan(){
    const p=current();if(!p)return;checkpoint();
    const copies=JSON.parse(JSON.stringify(branch(p))),mapping=new Map(copies.map(p=>[p.id,id()]));
    for(const copy of copies){const original=copy.id;copy.id=mapping.get(original);if(original===p.id)copy.title+=' — copy';else copy.parentId=mapping.get(copy.parentId);copy.actions.forEach(a=>a.id=id());plans.push(copy)}
    activeId=mapping.get(p.id);save();
  }
  function current(){return plans.find(p=>p.id===activeId)}
  function children(p){return plans.filter(x=>(x.parentId||null)===(p?.id||null))}
  function branch(p){return p?[p,...children(p).flatMap(branch)]:[]}
  function path(p){const chain=[];while(p){chain.unshift(p);p=plans.find(x=>x.id===p.parentId)}return chain}
  function planOptions(exclude){
    const blocked=new Set(exclude?branch(exclude).map(p=>p.id):[]);
    function options(p,depth){return `${blocked.has(p.id)?'':`<option value="${esc(p.id)}">${'　'.repeat(depth)}${depth?'↳ ':''}${esc(p.title)}</option>`}${children(p).map(x=>options(x,depth+1)).join('')}`}
    return children(null).map(p=>options(p,0)).join('');
  }
  function scopeEntries(p=current()){return (includeChildren?branch(p):[p]).filter(Boolean).flatMap(plan=>plan.actions.map(action=>({plan,action})))}
  const entryKey=({plan,action})=>JSON.stringify([plan.id,action.id]);
  function matchesStatus(action){
    if(hideStatuses&&['done','blocked','cancelled'].includes(action.status))return false;
    if(statusFilter==='hide_done')return action.status!=='done';
    if(statusFilter==='hide_blocked')return action.status!=='blocked';
    return statusFilter==='all'||action.status===statusFilter;
  }
  function persistFilters(){localStorage.setItem('pf_action_plan_filter',statusFilter);localStorage.setItem('pf_action_plan_hide_statuses',String(hideStatuses))}
  function applyStatusFilter(){retainedEntries.clear();visibleStatuses.clear()}
  // Matching new actions appear immediately; only status edits to displayed actions are retained.
  function visibleEntries(p=current()){
    const entries=scopeEntries(p);
    for(const entry of entries){const key=entryKey(entry);if(visibleStatuses.has(key)&&visibleStatuses.get(key)!==entry.action.status)retainedEntries.add(key)}
    const visible=entries.filter(entry=>matchesStatus(entry.action)||retainedEntries.has(entryKey(entry)));
    visibleStatuses=new Map(visible.map(entry=>[entryKey(entry),entry.action.status]));return visible;
  }
  function filterDescription(){return [statusFilter==='all'?'All statuses':statusFilters[statusFilter],hideStatuses?'Hide completed, blocked and cancelled':''].filter(Boolean).join(' · ')}
  function reportPlan(p,filtered=false){const entries=filtered?visibleEntries(p):scopeEntries(p);return {...p,...(filtered?{printFilter:`Applied filter: ${filterDescription()}. Current status of displayed actions.`}:{}),actions:entries.map(({plan,action})=>({...action,title:plan===p?action.title:`[${path(plan).map(p=>p.title).join(' / ')}] ${action.title}`}))}}
  function exportBranch(p){const copies=JSON.parse(JSON.stringify(branch(p)));if(copies[0])delete copies[0].parentId;return copies}
  function treeHTML(){
    const expanded=new Set(path(current()).slice(0,-1).map(p=>p.id));
    function node(p){const sub=children(p),open=expanded.has(p.id);return `<li><div class="ap-tree-row"><button data-select-plan="${esc(p.id)}" ${p.id===activeId?'aria-current="true"':''}>${esc(p.title)}<span>${branch(p).reduce((n,p)=>n+p.actions.length,0)} actions</span></button>${sub.length?`<button class="ap-tree-expand" data-expand-plan aria-expanded="${open}" aria-label="Show subplans of ${esc(p.title)}">${open?'▾':'▸'}</button>`:''}</div>${sub.length?`<ul ${open?'':'hidden'}>${sub.map(node).join('')}</ul>`:''}</li>`}
    return `<details class="ap-tree-picker"><summary>Plan tree ▾</summary><nav class="ap-tree-menu" aria-label="Plan tree"><ul>${children(null).map(node).join('')||'<li class="ap-empty">No plans created.</li>'}</ul></nav></details>`;
  }
  function task(link){return link&&api?api.task(link.projectId,link.taskId):null}
  function sync(){if(!api)return;for(const p of plans)for(const a of p.actions){const t=task(a.link);if(t){a.start=t.start;a.end=t.end}}}
  function save(){peopleCache=null;api.save();refresh();changed()}
  // Dashboard edits resolve the current owner plan instead of retaining a stale clone.
  // Linked dates use the scheduler; action status never changes task progress.
  function updateAction(planId,actionId,patch){
    if(!api)throw new Error('Plans are not available yet.');
    api.flush();sync();
    const p=plans.find(p=>p.id===planId),a=p?.actions.find(a=>a.id===actionId);
    if(!a)throw new Error('This action is no longer available in this plan.');
    const allowed=['title','owner','start','end','status','notes'];
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!allowed.includes(k)))throw new Error('Invalid action change.');
    const updated={...a,...patch};
    for(const k of ['title','owner','notes'])if(Object.hasOwn(patch,k)){if(typeof patch[k]!=='string')throw new Error('Invalid action text.');updated[k]=patch[k].trim()}
    if(!updated.title)throw new Error('Enter the action name.');
    const t=task(a.link),datesChanged=t&&(updated.start!==t.start||updated.end!==t.end);
    if(datesChanged){
      if(t.summary)throw new Error('This row\'s dates are calculated from its subtasks.');
      if(t.pred&&updated.start!==t.start)throw new Error('This task\'s start is calculated from its dependencies.');
      if(t.mile){
        if(t.pred)throw new Error('This milestone\'s date follows schedule dependencies.');
        const chosen=Object.hasOwn(patch,'start')?updated.start:updated.end;updated.start=chosen;updated.end=chosen;
      }
      if(!updated.start||!updated.end)throw new Error('A linked action requires start and end dates.');
    }
    const candidate=exportData(),candidateAction=candidate.find(p=>p.id===planId).actions.find(a=>a.id===actionId);Object.assign(candidateAction,updated);validate(candidate);
    if(JSON.stringify(updated)===JSON.stringify(a))return JSON.parse(JSON.stringify(a));
    const previous=datesChanged?{link:a.link,dates:{start:t.start,end:t.end}}:null,previousPlans=exportData();
    // Rejected scheduler changes do not create a misleading undo entry.
    if(datesChanged)api.updateTask(a.link.projectId,a.link.taskId,{start:updated.start,end:updated.end});
    checkpoint(previous,previousPlans);
    const actual=task(a.link);if(actual){updated.start=actual.start;updated.end=actual.end}
    Object.assign(a,updated);notice=datesChanged&&actual&&(actual.start!==candidateAction.start||actual.end!==candidateAction.end)?'Dates adjusted by schedule rules.':'';save();return JSON.parse(JSON.stringify(a));
  }
  function openAction(planId,actionId){
    const p=plans.find(p=>p.id===planId),a=p?.actions.find(a=>a.id===actionId);if(!a)throw new Error('This action is no longer available in this plan.');
    activeId=planId;retainedEntries.add(entryKey({plan:p,action:a}));notice='';switchView(true);
    setTimeout(()=>{const node=[...document.querySelectorAll('[data-plan-id]')].find(n=>n.dataset.planId===planId&&[...n.querySelectorAll('[data-action], [data-edit]')].some(b=>b.dataset.action===actionId||b.dataset.edit===actionId));node?.scrollIntoView({block:'center'});node?.querySelector('button')?.focus()},0);
  }
  function format(value){return value?value.split('-').reverse().join('/'):'—'}
  function linkedHTML(link){const t=task(link);return t?`<button class="ap-link" data-open-project="${esc(link.projectId)}" data-open-task="${esc(link.taskId)}">↗ ${esc(t.projectTitle)} · ${esc(t.taskName)}</button>`:link?'<span class="ap-orphan">Link unavailable — local dates preserved</span>':''}
  function late(a){const now=new Date(),day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');return a.end&&a.end<day&&!['done','cancelled'].includes(a.status)}
  const icons={plan:'<path d="M9 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-3M9 3h6v4H9zM8 14l3 3 5-6"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5"/>',agenda:'<path d="M4 3h16v18H4zM8 8h8M8 12h8M8 16h5"/>',notes:'<path d="M4 3h16v14l-4 4H4zM8 8h8M8 12h8M8 16h4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>',copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>'};
  const icon=name=>`<svg class="ap-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.plan}</svg>`;
  const personKey=name=>String(name||'').trim().replace(/\s+/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function uniquePeople(names){const seen=new Set();return names.map(name=>String(name||'').trim()).filter(name=>{const key=personKey(name);if(!key||seen.has(key))return false;seen.add(key);return true})}
  let peopleCache=null,peopleCacheKey='';
  function peopleColors(extra=[]){
    if(!extra.length&&peopleCache)return peopleCache;
    const names=uniquePeople([...plans.flatMap(p=>[...(p.document?.participants||[]),...p.actions.map(a=>a.owner)]),...extra]).map(personKey).sort();
    const key=JSON.stringify(names);if(peopleCache&&key===peopleCacheKey)return peopleCache;
    const palette=[{fill:'EEE4FF',ink:'6940B5'},{fill:'E8F2FF',ink:'2768B1'},{fill:'E6F7E6',ink:'267238'},{fill:'FFF9E7',ink:'866114'},{fill:'E2F4F2',ink:'206C69'},{fill:'FFF0F0',ink:'AE3548'}];
    function hex(h,s,l){s/=100;l/=100;const a=s*Math.min(l,1-l),channel=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0')};return (channel(0)+channel(8)+channel(4)).toUpperCase()}
    for(let i=6;i<Math.max(36,names.length);i++){const hue=(i*137.508+23)%360;palette.push({fill:hex(hue,65,94),ink:hex(hue,65,32)})}
    const colors=new Map(),used=new Set();
    const hash=name=>{let n=0;for(const c of personKey(name))n=(n*31+c.charCodeAt(0))>>>0;return n};
    for(const name of names){let slot=hash(name)%palette.length;while(used.has(slot))slot=(slot+1)%palette.length;used.add(slot);colors.set(name,palette[slot])}
    const registry={palette,color:name=>colors.get(personKey(name))||palette[hash(name)%palette.length]};if(!extra.length){peopleCacheKey=key;peopleCache=registry}return registry;
  }
  function ownerOptions(p){return uniquePeople([...path(p).flatMap(plan=>plan.document?.participants||[]),...p.actions.map(a=>a.owner)]).sort((a,b)=>a.localeCompare(b,'pt-BR'))}
  function ownerChoiceHTML(name){const c=peopleColors().color(name);return `<span class="ap-owner-dot" style="background:#${c.ink}" aria-hidden="true"></span><span>${esc(name)}</span>`}
  function ownerChoiceStyle(name){const c=peopleColors().color(name);return `background:#${c.fill};color:#${c.ink}`}
  function ownerHTML(name){
    if(!name)return '<span class="ap-person ap-unassigned">＋ Assign</span>';
    const parts=name.trim().split(/[\s,]+/),initials=((parts[0]?.[0]||'')+(parts.length>1?parts.at(-1)[0]:'')).toLocaleUpperCase('pt-BR');
    const color=peopleColors().color(name);
    return `<span class="ap-person ap-person-colored" style="--person-bg:#${color.fill};--person-ink:#${color.ink}"><span class="ap-avatar" aria-hidden="true">${esc(initials)}</span><span>${esc(name)}</span></span>`;
  }
  function dateHTML(a){return `<span class="ap-date ${late(a)?'ap-date-late':''}">${icon('calendar')}<span>${a.end?format(a.end):'Set date'}</span></span>`}
  const sectionLabels={participants:'Participants',agenda:'Agenda',notes:'Notes'};
  function sectionControls(key){return `<div class="ap-section-options"><button data-section-edit="${key}" aria-label="Edit ${sectionLabels[key]}">${icon('edit')}</button><button data-section-remove="${key}" aria-label="Remove ${sectionLabels[key]}">${icon('trash')}</button></div>`}
  function documentHTML(p){const d=p.document||{};return ['agenda','notes'].filter(k=>d[k]?.trim()).map(k=>`<section class="ap-section ap-section-${k}" data-document-section="${k}"><div class="ap-section-head"><h2><span class="ap-section-icon">${icon(k)}</span>${sectionLabels[k]}</h2>${sectionControls(k)}</div><div class="ap-section-content">${k==='agenda'?`<ul>${d[k].split('\n').map(x=>x.trim()).filter(Boolean).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`<p>${esc(d[k])}</p>`}</div></section>`).join('')}
  function editSection(p,key){
    const value=key==='participants'?(p.document?.participants||[]).join('\n'):p.document?.[key]||'';
    const hint=key==='participants'?'Enter one name per line.':key==='agenda'?'Enter one topic per line.':'Record plan notes and decisions.';
    const m=modal(sectionLabels[key],`<label>${hint}<textarea id="apSectionValue" rows="7" placeholder="${esc(hint)}">${esc(value)}</textarea></label>`);m.querySelector('textarea').focus();
    m.querySelector('form').onsubmit=e=>{e.preventDefault();const text=m.querySelector('textarea').value.trim();if(!text){m.querySelector('#apError').textContent='Fill in this section. To remove it, use the remove button in the document.';return}checkpoint();p.document={...p.document,[key]:key==='participants'?[...new Set(text.split('\n').map(x=>x.trim()).filter(Boolean))]:text};closePopups();notice='';save()};
  }
  function addSection(p){const m=modal('Add section','<div class="ap-section-choices">'+Object.entries(sectionLabels).map(([key,label])=>`<button type="button" data-add-section="${key}">${icon(key==='participants'?'people':key)}<span>${label}${p.document?.[key]?.length?' · edit':''}</span></button>`).join('')+'</div>');m.querySelector('button[type=submit]').hidden=true;m.querySelectorAll('[data-add-section]').forEach(b=>b.onclick=()=>editSection(p,b.dataset.addSection))}
  function badge(a){return `<span class="ap-badge ${a.status}"><span class="ap-status-dot" aria-hidden="true">${a.status==='done'?'✓':''}</span>${statuses[a.status]}<span class="ap-chevron" aria-hidden="true">⌄</span></span>${late(a)?' <span class="ap-late">Overdue</span>':''}`}
  function field(a,name,label){return `<button class="ap-inline" data-field="${name}" data-action="${esc(a.id)}" aria-label="Change ${name==='owner'?'owner':name==='end'?'end date':'status'} for ${esc(a.title)}" title="Click to change">${label}</button>`}
  function inlineEdit(a,name,ownerPlan=current()){
    api.flush();sync();const t=task(a.link);
    if(name==='end'&&t&&(t.summary||(t.mile&&t.pred))){notice=t.summary?'This row\'s end date is calculated from its subtasks.':'This milestone\'s date follows schedule dependencies.';refresh();return}
    const title={owner:'Owner',end:'End',status:'Status'}[name];
    const m=modal(title,'<div id="apInlineOptions"></div>');m.classList.add('ap-inline-dialog');
    const options=m.querySelector('#apInlineOptions'),error=m.querySelector('#apError');
    function apply(value){
      try{
        if(name==='end'&&(!date(value)||(t&&!value)))throw new Error('Select a valid date.');
        const start=t?.mile?value:a.start;
        if(name==='end'&&start&&value&&value<start)throw new Error('The end date must be on or after the start date.');
        if(a[name]===value){closePopups();return}
        const changed=name==='end'&&t;
        // Update the scheduler first: a rejected date must not create an undo entry.
        const previous=changed?{link:a.link,dates:{start:t.start,end:t.end}}:null;
        if(changed)api.updateTask(a.link.projectId,a.link.taskId,{start,end:value});
        checkpoint(previous);a[name]=value;const actual=task(a.link);
        notice=changed&&actual.end!==value?'Date adjusted by schedule rules.':'';
        if(changed){a.start=actual.start;a.end=actual.end}
        closePopups();save();document.querySelector(`[data-action="${a.id}"][data-field="${name}"]`)?.focus();
      }catch(e){error.textContent=e.message}
    }
    function choice(label,value){const b=document.createElement('button');b.type='button';b.className='ap-choice';if(name==='owner'&&value){b.innerHTML=ownerChoiceHTML(label);b.style.cssText=ownerChoiceStyle(label)}else b.textContent=label;b.setAttribute('aria-pressed',String(a[name]===value));b.onclick=()=>apply(value);options.append(b)}
    if(name==='status'){for(const [key,label]of Object.entries(statuses))choice(label,key);m.querySelector('button[type=submit]').hidden=true}
    if(name==='owner'){
      choice('Unassigned','');
      for(const owner of ownerOptions(ownerPlan))choice(owner,owner);
      options.insertAdjacentHTML('beforeend','<label>Add a new owner<input id="apInlineOwner" maxlength="200" placeholder="Owner name" autocomplete="off"></label>');
      m.querySelector('form').onsubmit=e=>{e.preventDefault();const value=m.querySelector('input').value.trim();if(!value){error.textContent='Enter a name or choose an owner above.';return}apply(value)};
    }
    if(name==='end'){
      options.insertAdjacentHTML('beforeend',`<label>Select a date<input id="apInlineEnd" type="date" value="${esc(a.end)}" ${t?'required':''} ${a.start&&!t?.mile?`min="${esc(a.start)}"`:''}></label>`);
      const input=m.querySelector('input');input.onchange=()=>apply(input.value);m.querySelector('form').onsubmit=e=>{e.preventDefault();apply(input.value)};input.focus();try{input.showPicker()}catch(e){/* The date input remains available in unsupported browsers. */}
    }else m.querySelector('input, .ap-choice')?.focus();
    m.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closePopups()}};
  }
  function buttons(a){return `<div class="ap-row-options"><button data-edit="${esc(a.id)}" aria-label="Edit action" title="Edit action">${icon('edit')}</button><button data-copy="${esc(a.id)}" aria-label="Duplicate action" title="Duplicate action">${icon('copy')}</button><button class="del" data-delete="${esc(a.id)}" aria-label="Delete action" title="Delete action">${icon('trash')}</button></div>`}
  function refresh(){
    if(!api||!shown)return;document.documentElement.dataset.theme=planTheme||api.getTheme();document.getElementById('apUndo').disabled=!undo.length;sync();const panel=document.getElementById('actionPanel'),p=current();
    panel.innerHTML=`<div class="ap-document"><div class="ap-head"><h2>Action plans</h2><select id="apPlanSelect" aria-label="Action plan">${planOptions()}</select>${treeHTML()}<button id="apNewPlan">＋ New plan</button></div><div id="apNotice" role="status">${esc(notice)}</div><div id="apDocumentBody"></div></div>`;
    panel.querySelector('#apNewPlan').onclick=()=>editPlan();const select=panel.querySelector('#apPlanSelect');select.value=activeId||'';select.onchange=()=>{activeId=select.value;notice='';refresh()};
    panel.querySelectorAll('[data-select-plan]').forEach(b=>b.onclick=()=>{activeId=b.dataset.selectPlan;notice='';refresh()});
    panel.querySelectorAll('.ap-tree-row').forEach(row=>{
      const toggle=row.querySelector('[data-expand-plan]'),list=row.parentElement.querySelector(':scope > ul');if(!toggle)return;
      function open(value){list.hidden=!value;toggle.setAttribute('aria-expanded',String(value));toggle.textContent=value?'▾':'▸'}
      row.onpointerenter=e=>{if(e.pointerType==='mouse')open(true)};
      toggle.onclick=()=>open(list.hidden);
      row.onkeydown=e=>{if(e.key==='ArrowRight'){e.preventDefault();open(true)}else if(e.key==='ArrowLeft'){e.preventDefault();open(false)}};
    });
    const body=panel.querySelector('#apDocumentBody');
    if(!p){body.innerHTML='<div class="ap-empty">Create a plan to organize actions, dates and owners.<br>You can add independent actions or actions linked to any schedule.</div>';return}
    const entries=visibleEntries(p),actions=entries.map(e=>e.action),scope=branch(p),entryFor=b=>{const owner=plans.find(x=>x.id===b.closest('[data-plan-id]').dataset.planId);return {plan:owner,action:owner.actions.find(a=>a.id===(b.dataset.action||b.dataset.complete||b.dataset.edit||b.dataset.copy||b.dataset.delete))}};
    const done=actions.filter(a=>a.status==='done').length,overdue=actions.filter(late).length,blocked=actions.filter(a=>a.status==='blocked').length,progress=actions.length?Math.round(done/actions.length*100):0,d=p.document||{};
    body.innerHTML=`<div class="ap-hierarchy-context"><nav class="ap-breadcrumbs" aria-label="Plan path">${path(p).map(x=>`<button data-select-plan="${esc(x.id)}" ${x===p?'aria-current="page"':''}>${esc(x.title)}</button>`).join('<span aria-hidden="true">›</span>')}</nav><label><input id="apIncludeChildren" type="checkbox" ${includeChildren?'checked':''}> Include subplans</label><span>${scope.length-1} subplans · ${includeChildren?'actions from this entire branch':'only actions from this plan'}</span></div><header class="ap-hero"><div class="ap-hero-main"><div class="ap-hero-icon">${icon('plan')}</div><div class="ap-hero-copy"><span class="ap-eyebrow">ACTION PLAN</span><h1>${esc(p.title)}</h1>${p.description?`<p class="ap-description">${esc(p.description)}</p>`:''}${p.source?linkedHTML(p.source):''}</div><button id="apAddSection">＋ Add section</button></div><div class="ap-plan-title"><button id="apNewChild">＋ New subplan</button><button id="apDuplicatePlan">Duplicate branch</button><button id="apEditPlan">Rename / edit</button><button id="apDeletePlan" class="del">Delete plan</button></div>${d.participants?.length?`<div class="ap-participants" data-document-section="participants"><h2>${icon('people')}Participants</h2><div class="ap-participant-list">${d.participants.map(ownerHTML).join('')}</div>${sectionControls('participants')}</div>`:''}</header>${documentHTML(p)}<section class="ap-section ap-action-section"><div class="ap-section-head"><h2><span class="ap-section-icon">${icon('plan')}</span>Action plan</h2><div class="ap-views"><button id="apTable" class="${view==='table'?'act':''}" aria-pressed="${view==='table'}">Table</button><button id="apCards" class="${view==='cards'?'act':''}" aria-pressed="${view==='cards'}">Cards</button></div></div><div class="ap-filters"><label for="apStatusFilter">Filter by status</label><select id="apStatusFilter">${Object.entries(statusFilters).map(([value,label])=>`<option value="${value}" ${statusFilter===value?'selected':''}>${label}</option>`).join('')}</select><label class="ap-hide-statuses"><input id="apHideStatuses" type="checkbox" ${hideStatuses?'checked':''}> Hide completed, blocked and cancelled</label><button id="apApplyFilter">Refresh filter</button><span>New actions appear automatically when they match the filter. Changed actions remain until you refresh the filter. The PDF uses the displayed actions.</span></div><div class="ap-tools"><button class="act" id="apAddAction">＋ New action</button><span>${actions.length} of ${scopeEntries(p).length} actions · ${done} completed</span><div class="ap-indicators">${overdue?`<span class="ap-indicator ap-late">${overdue} overdue</span>`:''}${blocked?`<span class="ap-indicator ap-blocked-count">${blocked} blocked</span>`:''}<span class="ap-progress-label">${progress}% complete</span><progress class="ap-progress" max="100" value="${progress}" aria-label="Plan progress">${progress}%</progress></div></div><div id="apActionContent"></div></section>`;
    panel.querySelector('#apDuplicatePlan').onclick=duplicatePlan;panel.querySelector('#apEditPlan').onclick=()=>editPlan(p);panel.querySelector('#apDeletePlan').onclick=()=>{if(confirm('Delete this plan and its direct actions? Subplans will move up one level. Schedules will be kept.')){checkpoint();children(p).forEach(child=>child.parentId=p.parentId||null);plans=plans.filter(x=>x!==p);activeId=p.parentId||plans[0]?.id||null;save()}};
    panel.querySelector('#apNewChild').onclick=()=>editPlan(null,p.id);
    panel.querySelector('#apIncludeChildren').onchange=e=>{includeChildren=e.target.checked;refresh()};
    body.querySelectorAll('[data-select-plan]').forEach(b=>b.onclick=()=>{activeId=b.dataset.selectPlan;notice='';refresh()});
    panel.querySelector('#apAddSection').onclick=()=>addSection(p);
    panel.querySelectorAll('[data-section-edit]').forEach(b=>b.onclick=()=>editSection(p,b.dataset.sectionEdit));
    panel.querySelectorAll('[data-section-remove]').forEach(b=>b.onclick=()=>{checkpoint();delete p.document[b.dataset.sectionRemove];notice='Section removed. Use Undo to restore it.';save()});
    panel.querySelector('#apStatusFilter').onchange=e=>{statusFilter=e.target.value;persistFilters();applyStatusFilter();refresh()};
    panel.querySelector('#apHideStatuses').onchange=e=>{hideStatuses=e.target.checked;persistFilters();applyStatusFilter();refresh()};
    panel.querySelector('#apApplyFilter').onclick=()=>{applyStatusFilter();refresh()};
    panel.querySelector('#apAddAction').onclick=()=>editAction();
    panel.querySelector('#apTable').onclick=()=>{view='table';refresh()};panel.querySelector('#apCards').onclick=()=>{view='cards';refresh()};
    const content=panel.querySelector('#apActionContent');
    if(!actions.length)content.innerHTML=scopeEntries(p).length?`<div class="ap-empty">No actions match the filter. Select another status, refresh the filter${hideStatuses?' or uncheck “Hide completed, blocked and cancelled”':''}.</div>`:'<div class="ap-empty">This plan has no actions yet. Click <strong>＋ New action</strong> to get started.</div>';
    else if(view==='table')content.innerHTML=`<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th class="ap-number">#</th><th>Action / link</th><th>${icon('people')} Assigned to</th><th>${icon('calendar')} Due date</th><th>Status</th><th><span class="ap-sr-only">Options</span></th></tr></thead><tbody>${entries.map(({plan,action:a},i)=>`<tr class="ap-row-${a.status} ${late(a)?'ap-row-late':''}" data-plan-id="${esc(plan.id)}" data-action-id="${esc(a.id)}"><td class="ap-number">${i+1}</td><td><div class="ap-task-cell"><button class="ap-complete ${a.status==='done'?'is-done':''}" data-complete="${esc(a.id)}" aria-label="${a.status==='done'?'Reopen':'Complete'} ${esc(a.title)}" aria-pressed="${a.status==='done'}" title="${a.status==='done'?'Reopen action':'Complete action'}">${a.status==='done'?'✓':''}</button><div class="ap-task-copy"><div class="ap-title">${esc(a.title)}</div>${scope.length>1?`<button class="ap-origin-plan" data-select-plan="${esc(plan.id)}">${esc(path(plan).map(p=>p.title).join(' / '))}</button>`:''}${linkedHTML(a.link)}${a.notes?`<div class="ap-note">${esc(a.notes)}</div>`:''}</div></div></td><td>${field(a,'owner',ownerHTML(a.owner))}</td><td>${field(a,'end',dateHTML(a))}<div class="ap-start">Start: ${format(a.start)}</div></td><td>${field(a,'status',badge(a))}</td><td>${buttons(a)}</td></tr>`).join('')}</tbody></table></div>`;
    else content.innerHTML=`<div class="ap-cards">${entries.map(({plan,action:a},i)=>`<article class="ap-card ap-row-${a.status} ${late(a)?'ap-row-late':''}" data-plan-id="${esc(plan.id)}" data-action-id="${esc(a.id)}"><div class="ap-card-top"><span class="ap-card-number">${String(i+1).padStart(2,'0')}</span>${field(a,'status',badge(a))}</div><div class="ap-task-cell"><button class="ap-complete ${a.status==='done'?'is-done':''}" data-complete="${esc(a.id)}" aria-label="${a.status==='done'?'Reopen':'Complete'} ${esc(a.title)}" aria-pressed="${a.status==='done'}">${a.status==='done'?'✓':''}</button><div class="ap-title">${esc(a.title)}</div>${scope.length>1?`<button class="ap-origin-plan" data-select-plan="${esc(plan.id)}">${esc(path(plan).map(p=>p.title).join(' / '))}</button>`:''}</div>${linkedHTML(a.link)}<div class="ap-meta"><span class="ap-meta-label">Owner</span>${field(a,'owner',ownerHTML(a.owner))}</div><div class="ap-meta"><span class="ap-meta-label">End</span>${field(a,'end',dateHTML(a))}</div><div class="ap-start">Start: ${format(a.start)}</div>${a.notes?`<div class="ap-note">${esc(a.notes)}</div>`:''}<div class="ap-card-footer">${buttons(a)}</div></article>`).join('')}</div>`;
    content.querySelectorAll('[data-select-plan]').forEach(b=>b.onclick=()=>{activeId=b.dataset.selectPlan;notice='';refresh()});
    panel.querySelectorAll('[data-complete]').forEach(b=>b.onclick=()=>{const {action:a}=entryFor(b);checkpoint();a.status=a.status==='done'?'pending':'done';notice='';save()});
    panel.querySelectorAll('[data-field]').forEach(b=>b.onclick=()=>{const entry=entryFor(b);inlineEdit(entry.action,b.dataset.field,entry.plan)});
    panel.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const entry=entryFor(b);editAction(entry.action,null,entry.plan)});
    panel.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{const {plan,action:a}=entryFor(b);checkpoint();plan.actions.push({...JSON.parse(JSON.stringify(a)),id:id(),title:a.title+' — copy'});save()});
    panel.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('Delete this action? The linked schedule task will be kept.')){const {plan,action}=entryFor(b);checkpoint();plan.actions=plan.actions.filter(a=>a!==action);save()}});
    panel.querySelectorAll('[data-open-task]').forEach(b=>b.onclick=()=>{switchView(false);api.openTask(b.dataset.openProject,b.dataset.openTask)});
  }
  function modal(title,body){
    closePopups();closeEditor();const overlay=document.createElement('div');overlay.className='popup-overlay';const m=document.createElement('div');m.className='modal ap-modal';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');
    m.innerHTML=`<h3>${esc(title)}</h3><form>${body}<div class="ap-error" role="alert" id="apError"></div><div class="modal-actions"><button type="button" id="apCancel">Cancel</button><button class="act" type="submit">Save</button></div></form>`;
    document.body.append(overlay,m);m.querySelector('#apCancel').onclick=closePopups;overlay.onclick=closePopups;m.querySelector('input,select')?.focus();return m;
  }
  function editPlan(p,parentId=null){
    const m=modal(p?'Edit plan':'New plan',`<label>Plan name<input id="apPlanTitle" required maxlength="200" value="${esc(p?.title)}"></label><label>Description<textarea id="apPlanDescription">${esc(p?.description)}</textarea></label><label>Parent plan<select id="apPlanParent"><option value="">None — top-level plan</option>${planOptions(p)}</select></label>`);
    m.querySelector('#apPlanParent').value=p?.parentId||parentId||'';
    m.querySelector('form').onsubmit=e=>{e.preventDefault();const title=m.querySelector('#apPlanTitle').value.trim();if(!title)return;const data={title,description:m.querySelector('#apPlanDescription').value.trim(),parentId:m.querySelector('#apPlanParent').value||null};checkpoint();if(p)Object.assign(p,data);else{const plan={id:id(),...data,source:null,actions:[]};plans.push(plan);activeId=plan.id}closePopups();notice='';save()};
  }
  function editAction(existing,initialLink,ownerPlan=current()){
    api.flush();sync();const p=ownerPlan;if(!p)return;
    const a=existing||{id:id(),title:'',owner:'',start:'',end:'',status:'pending',notes:'',link:initialLink||null};
    const m=modal(existing?'Edit action':'New action',`<p class="ap-hint">Plan: ${esc(path(p).map(p=>p.title).join(' / '))}</p><label>Action<input id="apActionTitle" required maxlength="300"></label><label>Owner<input id="apOwner" maxlength="200" placeholder="Owner name"></label><label>Linked schedule<select id="apLinkProject"><option value="">Independent action</option></select></label><label id="apTaskLabel">Schedule row<select id="apLinkTask"></select></label><div class="ap-dates"><label>Start<input type="date" id="apStart"></label><label>End<input type="date" id="apEnd"></label></div><p class="ap-hint" id="apDateHint"></p><label>Status<select id="apStatus">${Object.entries(statuses).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Notes<textarea id="apNotes"></textarea></label>`);
    const f=k=>m.querySelector('#'+k),projects=api.projects();
    f('apActionTitle').value=a.title||task(a.link)?.taskName||'';f('apOwner').value=a.owner;f('apStart').value=a.start;f('apEnd').value=a.end;f('apStatus').value=a.status;f('apNotes').value=a.notes;
    const people=ownerOptions(p);
    if(people.length){
      const choices=document.createElement('div');choices.className='ap-owner-options';choices.setAttribute('role','group');choices.setAttribute('aria-label','Participants and existing owners');
      f('apOwner').parentElement.after(choices);
      function renderOwners(query=''){const filter=personKey(query),selected=personKey(f('apOwner').value);choices.innerHTML=people.filter(name=>!filter||personKey(name).includes(filter)).map(name=>`<button type="button" class="ap-choice" style="${ownerChoiceStyle(name)}" data-select-owner="${esc(name)}" aria-pressed="${personKey(name)===selected}">${ownerChoiceHTML(name)}</button>`).join('');choices.querySelectorAll('button').forEach(button=>button.onclick=()=>{f('apOwner').value=button.dataset.selectOwner;renderOwners();f('apOwner').focus();f('apOwner').select()})}
      f('apOwner').placeholder='Choose a participant or type a name';f('apOwner').addEventListener('input',()=>renderOwners(f('apOwner').value));renderOwners();
    }
    for(const project of projects){const o=new Option(project.title,project.id);f('apLinkProject').add(o)}
    if(a.link&&!projects.some(p=>p.id===a.link.projectId))f('apLinkProject').add(new Option('Schedule unavailable',a.link.projectId));
    f('apLinkProject').value=a.link?.projectId||'';
    function chosenLink(){return f('apLinkProject').value&&f('apLinkTask').value?{projectId:f('apLinkProject').value,taskId:f('apLinkTask').value}:null}
    function dates(){
      const t=task(chosenLink());f('apStart').disabled=!!t&&(t.summary||!!t.pred);f('apEnd').disabled=!!t&&(t.summary||t.mile);
      f('apStart').required=!!t;f('apEnd').required=!!t;
      if(t){f('apStart').value=t.start;f('apEnd').value=t.end;if(!f('apActionTitle').value)f('apActionTitle').value=t.taskName}
      f('apDateHint').textContent=t?(t.summary?'This row\'s dates are calculated from its subtasks. Edit the subtasks in the schedule.':t.pred?'The start follows schedule dependencies. The end changes the duration; schedule rules still apply.':'Dates are shared with the schedule. Working days and milestones follow task rules.'):'This action\'s dates are independent of the schedule.';
    }
    function tasks(selected){
      const project=projects.find(p=>p.id===f('apLinkProject').value),select=f('apLinkTask');select.replaceChildren();
      for(const t of project?.tasks||[])select.add(new Option(t.name,t.id));
      if(selected&&!project?.tasks.some(t=>t.id===selected))select.add(new Option('Row unavailable — keep link',selected));
      if(selected)select.value=selected;
      f('apTaskLabel').hidden=!f('apLinkProject').value;dates();
    }
    tasks(a.link?.taskId);f('apStart').onchange=()=>{if(task(chosenLink())?.mile)f('apEnd').value=f('apStart').value};f('apLinkProject').onchange=()=>tasks();f('apLinkTask').onchange=dates;
    m.querySelector('form').onsubmit=e=>{
      e.preventDefault();const link=chosenLink(),t=task(link);
      const updated={...a,title:f('apActionTitle').value.trim(),owner:f('apOwner').value.trim(),start:f('apStart').value,end:f('apEnd').value,status:f('apStatus').value,notes:f('apNotes').value.trim(),link};
      try{
        if(!updated.title)throw new Error('Enter the action name.');
        if(updated.start&&updated.end&&updated.end<updated.start)throw new Error('The end date must be on or after the start date.');
        const datesChanged=t&&!t.summary&&(updated.start!==t.start||updated.end!==t.end);
        checkpoint(datesChanged?{link,dates:{start:t.start,end:t.end}}:null);
        if(datesChanged)api.updateTask(link.projectId,link.taskId,updated);
        const actual=task(link);notice=actual&&(actual.start!==updated.start||actual.end!==updated.end)?'Dates adjusted by schedule rules.':'';
        if(actual){updated.start=actual.start;updated.end=actual.end}
        if(existing)Object.assign(existing,updated);else p.actions.push(updated);
        closePopups();save();
      }catch(error){f('apError').textContent=error.message}
    };
  }
  function fromTask(projectId,taskId){
    api.flush();const link={projectId,taskId},t=task(link);if(!t)return;
    const m=modal('Create linked plan / action',`<p class="ap-hint">${esc(t.projectTitle)} · ${esc(t.taskName)}</p><label>Add to<select id="apTargetPlan"><option value="">New action plan</option>${planOptions()}</select></label><label id="apNewTitleLabel">New plan name<input id="apNewTitle" value="${esc('Plan — '+t.taskName)}" maxlength="200"></label>`);
    m.querySelector('#apTargetPlan').onchange=e=>m.querySelector('#apNewTitleLabel').hidden=!!e.target.value;
    m.querySelector('form').onsubmit=e=>{e.preventDefault();const target=m.querySelector('#apTargetPlan').value,title=m.querySelector('#apNewTitle').value.trim();if(!target&&!title){m.querySelector('#apError').textContent='Enter the plan name.';return}checkpoint();activeId=target;if(!activeId){const p={id:id(),title,description:'',source:link,actions:[]};plans.push(p);activeId=p.id}const p=current();p.actions.push({id:id(),title:t.taskName,owner:'',start:t.start,end:t.end,status:'pending',notes:'',link});closePopups();save();switchView(true)};
  }
  function switchView(value){
    api.flush();
    const next=value==='todo'?'todo':value==='native-todo'?'native-todo':value==='my-day'?'my-day':value?'actions':'gantt';
    if(next!=='my-day')window.MyDay?.hide();
    shown=next==='actions';
    document.documentElement.dataset.theme=shown?(planTheme||api.getTheme()):api.getTheme();
    document.documentElement.dataset.appView=next;
    document.getElementById('actionPanel').hidden=!shown;
    document.getElementById('actionToolbar').hidden=!shown;
    document.getElementById('todoPanel').hidden=next!=='todo';
    document.getElementById('todoNativePanel').hidden=next!=='native-todo';
    document.getElementById('todoNativeToolbar').hidden=next!=='native-todo';
    document.getElementById('myDayPanel').hidden=next!=='my-day';
    for(const [name,on]of [['tabGantt',next==='gantt'],['tabActions',shown],['tabTodo',next==='todo'],['tabTodoNative',next==='native-todo'],['tabMyDay',next==='my-day']]){
      const b=document.getElementById(name);b.classList.toggle('act',on);b.setAttribute('aria-selected',on);
    }
    if(next==='todo'||next==='native-todo'){
      const frame=document.getElementById(next==='todo'?'todoFrame':'todoNativeFrame');
      if(!frame.getAttribute('src'))frame.src=frame.dataset.src;
      if(next==='native-todo')window.TodoCloud.start();
    }else if(next==='my-day'){window.MyDay.show();window.TodoCloud.start()}else if(shown)refresh();else render();
  }
  function init(adapter){
    const savedFilter=localStorage.getItem('pf_action_plan_filter'),savedHide=localStorage.getItem('pf_action_plan_hide_statuses');
    statusFilter=Object.hasOwn(statusFilters,savedFilter)?savedFilter:'all';hideStatuses=savedHide===null?savedFilter==='hide_done_blocked':savedHide==='true';persistFilters();
    api=adapter;planTheme=localStorage.getItem('pf_action_plan_theme');if(!['dark','light'].includes(planTheme))planTheme='light';
    document.getElementById('apBackup').onclick=backup;document.getElementById('apImport').onclick=importFile;document.getElementById('apUndo').onclick=undoPlan;document.getElementById('apTheme').onclick=()=>{planTheme=(planTheme||api.getTheme())==='dark'?'light':'dark';localStorage.setItem('pf_action_plan_theme',planTheme);document.documentElement.dataset.theme=planTheme};
    document.getElementById('apExport').onclick=()=>{const p=current();if(p){sync();downloadJSON({version:1,type:'action-plans',actionPlans:exportBranch(p)},cleanFileName(p.title)+'.json')}else{notice='Create or select a plan to export.';refresh()}};
    document.getElementById('apExcel').onclick=()=>{const p=current();if(p){sync();window.PlanExports.excel(reportPlan(p),task)}else{notice='Select a plan to export.';refresh()}};
    document.getElementById('apPDF').onclick=()=>{const p=current();if(p){sync();window.PlanExports.pdf(reportPlan(p,true),task)}else{notice='Select a plan to print.';refresh()}};
    document.getElementById('apToggleNotes').onclick=e=>{notesShown=!notesShown;document.documentElement.dataset.apNotes=notesShown?'visible':'hidden';e.target.textContent='Notes: '+(notesShown?'on':'off')};
    function setZoom(amount){zoom=Math.min(1.6,Math.max(.8,zoom+amount));document.documentElement.style.setProperty('--ap-zoom',zoom)}
    document.getElementById('apZoomIn').onclick=()=>setZoom(.1);document.getElementById('apZoomOut').onclick=()=>setZoom(-.1);
    document.addEventListener('keydown',e=>{if(shown&&!document.querySelector('.ap-modal')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&e.key==='z'&&(e.ctrlKey||e.metaKey)){e.preventDefault();undoPlan()}});
    for(const name of ['btnCloudSave','btnCloudHistory','btnBackupAll','btnCloudBackup','cloudBackupStatus'])document.getElementById(name).classList.add('global-control');
    document.getElementById('tabGantt').onclick=()=>switchView(false);document.getElementById('tabActions').onclick=()=>switchView(true);
    document.getElementById('tabTodo').onclick=()=>switchView('todo');
    document.getElementById('tabTodoNative').onclick=()=>switchView('native-todo');
    document.getElementById('tabMyDay').onclick=()=>switchView('my-day');
    document.getElementById('btnActionFromTask').onclick=()=>{const link=api.selectedTask();if(link)fromTask(link.projectId,link.taskId);else alert('Select a schedule row to create a linked action. For independent actions, open Action plans.')};
    document.addEventListener('click',e=>{const picker=document.querySelector('.ap-tree-picker[open]');if(picker&&!picker.contains(e.target))picker.open=false});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){const picker=document.querySelector('.ap-tree-picker[open]');if(picker){picker.open=false;picker.querySelector('summary').focus()}}});
    sync();
  }
  return {init,load,validate,sync,refresh,fromTask,isVisible:()=>shown,exportData,backup,importData,restoreData,updateAction,openAction,switchView,peopleColors,
    subscribe:listener=>{changeListeners.add(listener);return ()=>changeListeners.delete(listener)}};
})();
