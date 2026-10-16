import { createHash } from 'node:crypto';
import { inputs, validDate } from './schemas.mjs';
import { IntegrationError } from './store.mjs';
import { executePlanning, planningAreas } from './planning.mjs';
import { scheduleStructure } from './schedule-structure.mjs';
import { scheduleDependencies } from './schedule.mjs';

const clone = value => structuredClone(value);
const own = (obj, field) => Object.hasOwn(obj, field);
export const today = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(now);
export function addDays(day, amount) {
  const value = new Date(day + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
const weekend = day => [0, 6].includes(new Date(day + 'T12:00:00Z').getUTCDay());
export function businessShift(day, amount) {
  if (!day) return '';
  if (!Number.isInteger(amount) || Math.abs(amount) > 10000) throw new IntegrationError('invalid_shift', 'Reagendamento inválido.');
  let remaining = Math.abs(amount), result = day;
  while (remaining) { result = addDays(result, amount < 0 ? -1 : 1); if (!weekend(result)) remaining--; }
  return result;
}
const nextBusinessDay = day => weekend(day) ? businessShift(day, 1) : day;
export const effectiveDate = task => task.status === 'Recorrente' ? (task.date || '') : businessShift(task.date || '', Number(task.deferBusinessDays) || 0);
const openTask = task => !['Concluída', 'Cancelada', 'Reserva'].includes(task.status);
const openAction = action => !['done', 'cancelled'].includes(action.status);
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
const ownerMatches = (owner, aliases) => String(owner || '').split(/[,;\/&+\n]|\s+e\s+/i).some(name => aliases.map(normalize).includes(normalize(name)));
const audience = (owner, aliases) => !owner?.trim() ? 'unassigned' : ownerMatches(owner, aliases) ? 'mine' : 'followup';
const page = (items, input) => ({ total: items.length, offset: input.offset, limit: input.limit,
  nextOffset: input.offset + input.limit < items.length ? input.offset + input.limit : null,
  items: items.slice(input.offset, input.offset + input.limit) });
function pathOf(record, records) {
  const path = [], seen = new Set(); let current = record;
  while (current && !seen.has(current.id)) { seen.add(current.id); path.unshift({ id: current.id, title: current.title }); current = records.find(r => r.id === current.parentId); }
  return path;
}
function inBranch(record, id, records, includeChildren) {
  return !id || record.id === id || (includeChildren && pathOf(record, records).some(p => p.id === id));
}
function flags(row, day) {
  const dates = [row.date, row.deadline].filter(validDate), past = dates.filter(d => d < day).sort();
  return { today: dates.includes(day), overdue: past.length > 0,
    upcoming: dates.some(d => d > day && d <= addDays(day, 7)), undated: !dates.length,
    blocked: row.status === 'blocked', starting: row.start === day, finishing: row.end === day,
    ongoing: !!(row.start && row.end && row.start <= day && row.end >= day) };
}
function scheduledRows(data, day) {
  return data.projects.filter(p => p.kind !== 'group').flatMap(project => project.tasks.flatMap((task, i, tasks) => {
    if (task.summary || (tasks[i + 1] && tasks[i + 1].indent > task.indent)) return [];
    const row = { source: 'gantt', id: task.id, projectId: project.id, projectTitle: project.title,
      path: pathOf(project, data.projects).map(p => p.title).join(' / '), title: task.name,
      start: task.start || '', end: task.end || '', date: task.end || '', pct: task.pct,
      status: task.pct >= 100 ? 'done' : task.pct > 0 ? 'doing' : 'pending', open: task.pct < 100,
      includedInMyDay: task.myDay?.[day]?.included === true };
    return [{ ...row, flags: flags(row, day) }];
  }));
}
function actionRows(plans, schedules) {
  return plans.flatMap(plan => plan.actions.map(action => {
    const project = action.link && schedules?.projects.find(p => p.id === action.link.projectId);
    const task = project?.tasks.find(t => String(t.id) === action.link.taskId);
    return { ...action, source: 'action', planId: plan.id, planTitle: plan.title,
      path: pathOf(plan, plans).map(p => p.title).join(' / '),
      start: task?.start || action.start || '', end: task?.end || action.end || '',
      date: task?.end || action.end || '', open: openAction(action), linkResolved: action.link ? !!task : null };
  }));
}
const todoRows = data => data.tasks.map(task => ({ ...task, source: 'todo', date: effectiveDate(task), storedDate: task.date || '', open: openTask(task) }));
function requireVersion(snapshot, input) {
  if (snapshot.version !== input.expectedVersion) throw new IntegrationError('version_conflict', 'A versão mudou. Consulte novamente e revise a alteração.', 409);
}
function requireProject(data, project) {
  if (!data.settings.projects?.includes(project)) throw new IntegrationError('unknown_project', 'Selecione um projeto existente; a integração não cria projetos implicitamente.');
}
function checkTaskStatus(old, next) {
  if (next.status === 'Recorrente' && old.status !== 'Recorrente') {
    throw new IntegrationError('recurrence_required', 'Configure a recorrência pela interface antes de usar esse status.');
  }
}

export async function execute(store, name, raw) {
  if (!Object.hasOwn(inputs, name)) throw new IntegrationError('unknown_operation', 'Operação desconhecida.', 404);
  const parsed = inputs[name].safeParse(raw);
  if (!parsed.success) throw new IntegrationError('invalid_input', parsed.error.issues.map(i => `${i.path.join('.') || 'entrada'}: ${i.message}`).join('; '));
  const input = parsed.data, day = input.day || today(), workspace = input.workspace;
  if (Object.hasOwn(planningAreas,name)) return executePlanning(store,name,input);
  const read = area => store.read(area, workspace);
  if(name==='list_schedule_structure'){
    const snapshot=await read('schedules'),project=snapshot.data.projects.find(p=>p.id===input.projectId&&p.kind!=='group');
    if(!project)throw new IntegrationError('not_found','Cronograma não encontrado.',404);
    const {nodes}=scheduleStructure(project),rows=nodes.map(n=>({source:'gantt',id:n.id,projectId:project.id,projectTitle:project.title,title:n.task.name,
      parentActivityId:n.parentId,row:n.index+1,indent:n.depth,summary:n.children.length>0,children:n.children,
      start:n.task.start||'',end:n.task.end||'',duration:n.task.dur,unit:n.task.unit||'bd',pct:n.task.pct,color:n.task.color||'#4a9eff',rowBackgroundColor:project.fmt?.[n.id+'_row']?.bg??null,
      dependencies:scheduleDependencies(project.tasks,n.task.pred).map(p=>({id:String(project.tasks[p.index].id),type:p.type,lag:p.lag}))}));
    return {workspace,version:snapshot.version,project:{source:'schedule',id:project.id,title:project.title,colorMode:project.view?.statusOn?'status':'custom'},...page(rows,input)};
  }
  if (name === 'list_tasks') {
    const snapshot = await read('todo');
    const tasks = todoRows(snapshot.data).filter(t => (!input.project || t.project === input.project)
      && (!input.status || t.status === input.status) && (!input.overdueOnly || (t.open && t.date && t.date < day)))
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || String(a.id).localeCompare(String(b.id)));
    return { workspace, day, version: snapshot.version, projects: snapshot.data.settings.projects || [], ...page(tasks, input) };
  }
  if (['create_task_project', 'create_task', 'update_task', 'reschedule_tasks'].includes(name)) {
    const snapshot = await read('todo'); requireVersion(snapshot, input);
    const data = clone(snapshot.data);
    let result;
    if (name === 'create_task_project') {
      const existing = (data.settings.projects || []).find(project => normalize(project) === normalize(input.title));
      if (existing !== undefined) return { workspace, saved: true, unchanged: true, version: snapshot.version, project: { title: existing } };
      data.settings.projects = [...(data.settings.projects || []), input.title];
      result = { project: { title: input.title } };
    } else if (name === 'create_task') {
      requireProject(data, input.project);
      const id = 'agent-' + createHash('sha256').update(`${workspace}:${input.requestId}`).digest('hex').slice(0, 32);
      const payload = { title: input.title, project: input.project, date: input.date, deadline: input.deadline,
        priority: input.priority, difficulty: input.difficulty, notes: input.notes };
      const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const existing = data.tasks.find(t => String(t.id) === id);
      if (existing) {
        if (existing.metadata?.integrationFingerprint !== fingerprint) throw new IntegrationError('request_id_reused', 'requestId já usado para outra tarefa.', 409);
        return { workspace, saved: true, unchanged: true, version: snapshot.version, task: existing };
      }
      const task = { id, ...payload, status: 'Em Andamento', deferBusinessDays: 0, subtasks: [],
        recurrence: { frequency: 'Nenhuma', daysOfWeek: [], daysOfMonth: [] }, metadata: { integrationFingerprint: fingerprint } };
      data.tasks.push(task); result = { task };
    } else if (name === 'update_task') {
      const task = data.tasks.find(t => String(t.id) === input.id);
      if (!task) throw new IntegrationError('not_found', 'Tarefa não encontrada.', 404);
      if (own(input.patch, 'project')) requireProject(data, input.patch.project);
      const updated = { ...task, ...input.patch, ...(own(input.patch, 'date') ? { deferBusinessDays: 0 } : {}) };
      checkTaskStatus(task, updated); Object.assign(task, updated); result = { task };
    } else {
      const pending = data.tasks.filter(openTask), dates = pending.map(t => t.date).filter(validDate).sort();
      const target = nextBusinessDay(input.from), earliest = dates[0];
      let shift = 0, current = earliest;
      while (current && current < target) {
        current = businessShift(current, 1); shift++;
        if (shift > 10000) throw new IntegrationError('invalid_shift', 'Intervalo de reprogramação grande demais.');
      }
      const changes = [];
      if (shift) for (const task of pending) {
        const before = task.date || nextBusinessDay(today()), after = businessShift(before, shift);
        changes.push({ id: task.id, title: task.title, before: task.date || '', after }); task.date = after;
      }
      result = { targetDate: target, shiftBusinessDays: shift, changed: changes.length, changes };
      if (input.dryRun) return { workspace, dryRun: true, saved: false, version: snapshot.version, ...result };
    }
    if (JSON.stringify(data) === JSON.stringify(snapshot.data)) return { workspace, saved: true, unchanged: true, version: snapshot.version, ...result };
    const saved = await store.write('todo', workspace, snapshot, data, name);
    return { workspace, ...saved, ...result };
  }
  if (name === 'list_actions') {
    const [snapshot, schedules] = await Promise.all([read('plans'), read('schedules')]);
    if (input.planId && !snapshot.data.actionPlans.some(p => p.id === input.planId)) throw new IntegrationError('not_found', 'Plano não encontrado.', 404);
    const plans = snapshot.data.actionPlans;
    const selected = plans.filter(p => inBranch(p, input.planId, plans, input.includeChildren));
    const ids = new Set(selected.map(p => p.id));
    const rows = actionRows(plans, schedules.data).filter(a => ids.has(a.planId)
      && (!input.owner || ownerMatches(a.owner, [input.owner])) && (!input.openOnly || a.open));
    return { workspace, version: snapshot.version, scheduleVersion: schedules.version,
      plans: selected.map(p => ({ source: 'plan', id: p.id, title: p.title, description: p.description || '', document: p.document || {}, parentId: p.parentId || null,
        path: pathOf(p, plans).map(p => p.title).join(' / '), actions: p.actions.length })), ...page(rows, input) };
  }
  if (name === 'update_action') {
    const snapshot = await read('plans'); requireVersion(snapshot, input);
    const data = clone(snapshot.data), action = data.actionPlans.find(p => p.id === input.planId)?.actions.find(a => a.id === input.id);
    if (!action) throw new IntegrationError('not_found', 'Ação não encontrada nesse plano.', 404);
    if (action.link && (own(input.patch, 'start') || own(input.patch, 'end'))) {
      throw new IntegrationError('linked_dates_require_ui', 'Datas vinculadas exigem o cálculo de dependências do cronograma. Altere-as pela interface.', 409);
    }
    Object.assign(action, input.patch);
    if (action.start && action.end && action.end < action.start) throw new IntegrationError('invalid_dates', 'Fim anterior ao início.');
    if (JSON.stringify(data) === JSON.stringify(snapshot.data)) return { workspace, saved: true, unchanged: true, version: snapshot.version, action };
    return { workspace, ...await store.write('plans', workspace, snapshot, data, name), action };
  }
  if (name === 'list_schedule_activities') {
    const snapshot = await read('schedules');
    if (input.projectId && !snapshot.data.projects.some(p => p.id === input.projectId)) throw new IntegrationError('not_found', 'Cronograma não encontrado.', 404);
    const ids = new Set(snapshot.data.projects.filter(p => inBranch(p, input.projectId, snapshot.data.projects, input.includeChildren)).map(p => p.id));
    const rows = scheduledRows(snapshot.data, day).filter(r => ids.has(r.projectId) && (input.includeClosed || r.open) && (input.filter === 'all' || r.flags[input.filter]));
    return { workspace, day, version: snapshot.version, projects: snapshot.data.projects.filter(p=>ids.has(p.id)).map(p=>({source:'schedule',id:p.id,title:p.title,parentId:p.parentId||null,kind:p.kind||'schedule',activities:p.tasks.length})), meaning: 'Atividades pelo intervalo PLANEJADO; pct é o progresso registrado.', ...page(rows, input) };
  }
  const [todo, plans, schedules] = await Promise.all([read('todo'), read('plans'), read('schedules')]);
  const rows = [
    ...todoRows(todo.data).map(r => ({ ...r, audience: 'mine' })),
    ...actionRows(plans.data.actionPlans, schedules.data).map(r => ({ ...r, audience: audience(r.owner, input.aliases) })),
    ...scheduledRows(schedules.data, day)
  ].filter(row => row.open).map(row => ({ ...row, flags: flags(row, day) }));
  const work = { today: [], overdue: [], upcoming: [], undated: [], blocked: [] };
  const schedule = { starting: [], finishing: [], ongoing: [], overdue: [] };
  for (const row of rows) {
    if (row.source === 'gantt') {
      for (const bucket of Object.keys(schedule)) if (row.flags[bucket]) schedule[bucket].push(row);
      if (row.includedInMyDay) work.today.push(row);
    } else {
      if (row.flags.today) work.today.push(row);
      if (row.flags.overdue) work.overdue.push(row);
      if (!row.flags.today && !row.flags.overdue && row.flags.upcoming) work.upcoming.push(row);
      if (row.flags.undated) work.undated.push(row);
      if (row.flags.blocked) work.blocked.push(row);
    }
  }
  const counts = Object.fromEntries(Object.entries(work).map(([key, items]) => [key, items.length]));
  counts.mineToday = work.today.filter(r => r.audience === 'mine').length;
  counts.followupToday = work.today.filter(r => r.audience === 'followup').length;
  return { workspace, day, taskProjects: todo.data.settings.projects || [],
    plans: plans.data.actionPlans.map(p=>({source:'plan',id:p.id,title:p.title,parentId:p.parentId||null})),
    projects: schedules.data.projects.map(p=>({source:'schedule',id:p.id,title:p.title,kind:p.kind||'schedule',parentId:p.parentId||null})),
    versions: { todo: todo.version, plans: plans.version, schedules: schedules.version }, counts,
    work: Object.fromEntries(Object.entries(work).map(([key, items]) => [key, page(items, input)])),
    schedule: Object.fromEntries(Object.entries(schedule).map(([key, items]) => [key, page(items, input)])) };
}
