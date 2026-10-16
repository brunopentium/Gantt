import { z } from 'zod';

export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T12:00:00Z'))
  && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
export const date = z.string().refine(validDate, 'Use uma data real em AAAA-MM-DD.');
const optionalDate = z.union([date, z.literal('')]);
const text = z.string().max(20000);
const title = z.string().trim().min(1).max(500);
const identifier = z.union([z.string().min(1).max(200), z.number().finite()]).transform(String);
export const todoStatuses = ['Em Andamento', 'Reserva', 'Recorrente', 'Concluída', 'Cancelada'];
export const actionStatuses = ['pending', 'doing', 'done', 'blocked', 'cancelled'];
export const workspace = z.enum(['work', 'personal']).describe('Ambiente explícito: work = Trabalho, personal = Pessoal.');
const version = z.string().regex(/^[a-f0-9]{40}$/).describe('SHA devolvido pela última consulta da área; impede sobrescrever outra versão.');
const rating = z.number().int().min(1).max(5);
const pagination = { limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().min(0).max(1000000).default(0) };
const taskPatch = z.object({
  title: title.optional(), project: title.optional(), date: optionalDate.optional(), deadline: optionalDate.optional(),
  status: z.enum(todoStatuses).optional(), priority: rating.optional(), difficulty: rating.optional(), notes: text.optional()
}).strict().refine(value => Object.keys(value).length > 0, 'Informe pelo menos um campo.');
const actionPatch = z.object({
  title: title.optional(), owner: z.string().trim().max(500).optional(), status: z.enum(actionStatuses).optional(),
  start: optionalDate.optional(), end: optionalDate.optional(), notes: text.optional()
}).strict().refine(value => Object.keys(value).length > 0, 'Informe pelo menos um campo.');
const requestId = z.string().min(8).max(100);
const parentId = z.string().min(1).max(200).nullable();
const documentPatch = z.object({ agenda: text.optional(), notes: text.optional(), participants: z.array(z.string().trim().min(1).max(500)).max(100).optional() }).strict();
const planPatch = z.object({ title: title.optional(), description: text.optional(), parentId: parentId.optional(), document: documentPatch.optional() }).strict().refine(v => Object.keys(v).length > 0);
const dependency = z.object({ id: identifier, type: z.enum(['FS','SS','FF','SF']).default('FS'), lag: z.number().int().min(-10000).max(10000).default(0) }).strict();
const barColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe('Cor hexadecimal #RRGGBB.');
const activityIds = z.array(identifier).min(1).max(100).refine(ids=>new Set(ids).size===ids.length,'IDs repetidos.');
const scheduleFields = { title: title.optional(), start: date.optional(), duration: z.number().int().min(1).max(10000).optional(),
  unit: z.enum(['bd','cd']).optional(), pct: z.number().min(0).max(100).optional(), milestone: z.boolean().optional(), color: barColor.optional(), dependencies: z.array(dependency).max(100).optional() };

export const inputs = {
  list_tasks: z.object({ workspace, day: date.optional(), project: title.optional(), status: z.enum(todoStatuses).optional(), overdueOnly: z.boolean().default(false), ...pagination }).strict(),
  create_task_project: z.object({ workspace, expectedVersion: version, title }).strict(),
  create_action_plan: z.object({ workspace, expectedVersion: version, requestId, title, description: text.default(''), parentId: parentId.default(null), document: documentPatch.optional() }).strict(),
  update_action_plan: z.object({ workspace, expectedVersion: version, id: identifier, patch: planPatch }).strict(),
  create_action: z.object({ workspace, expectedVersion: version, requestId, planId: identifier, title, owner: z.string().trim().max(500).default(''),
    start: optionalDate.default(''), end: optionalDate.default(''), status: z.enum(actionStatuses).default('pending'), notes: text.default('') }).strict(),
  create_schedule: z.object({ workspace, expectedVersion: version, requestId, title, parentId: parentId.default(null), kind: z.enum(['schedule','group']).default('schedule') }).strict(),
  update_schedule: z.object({ workspace, expectedVersion: version, id: identifier, patch: z.object({ title: title.optional(), parentId: parentId.optional() }).strict().refine(v=>Object.keys(v).length>0) }).strict(),
  create_schedule_activity: z.object({ workspace, expectedVersion: version, requestId, projectId: identifier, ...scheduleFields, title, start: date,
    duration: z.number().int().min(1).max(10000).default(1), unit: z.enum(['bd','cd']).default('bd'), pct: z.number().min(0).max(100).default(0), milestone: z.boolean().default(false), dependencies: z.array(dependency).max(100).default([]) }).strict(),
  update_schedule_activity: z.object({ workspace, expectedVersion: version, projectId: identifier, id: identifier, patch: z.object(scheduleFields).strict().refine(v=>Object.keys(v).length>0) }).strict(),
  list_schedule_structure: z.object({workspace,projectId:identifier,...pagination}).strict(),
  group_schedule_activities: z.object({workspace,expectedVersion:version,requestId,projectId:identifier,title,activityIds,color:barColor.optional()}).strict(),
  move_schedule_activities: z.object({workspace,expectedVersion:version,projectId:identifier,activityIds,parentActivityId:identifier.nullable().default(null),afterActivityId:identifier.nullable().default(null)}).strict(),
  set_schedule_activity_colors: z.object({workspace,expectedVersion:version,projectId:identifier,activityIds,color:barColor,includeDescendants:z.boolean().default(false)}).strict(),
  create_task: z.object({ workspace, expectedVersion: version, requestId: z.string().min(8).max(100), title, project: title, date,
    deadline: optionalDate.default(''), priority: rating.default(3), difficulty: rating.default(3), notes: text.default('') }).strict(),
  update_task: z.object({ workspace, expectedVersion: version, id: identifier, patch: taskPatch }).strict(),
  reschedule_tasks: z.object({ workspace, expectedVersion: version, from: date, dryRun: z.boolean().default(true) }).strict(),
  list_actions: z.object({ workspace, planId: z.string().min(1).max(200).optional(), includeChildren: z.boolean().default(true),
    owner: z.string().min(1).max(500).optional(), openOnly: z.boolean().default(false), ...pagination }).strict(),
  update_action: z.object({ workspace, expectedVersion: version, planId: z.string().min(1).max(200), id: identifier, patch: actionPatch }).strict(),
  list_schedule_activities: z.object({ workspace, day: date.optional(), projectId: z.string().min(1).max(200).optional(),
    includeChildren: z.boolean().default(true), includeClosed: z.boolean().default(false), filter: z.enum(['ongoing', 'starting', 'finishing', 'overdue', 'all']).default('ongoing'), ...pagination }).strict(),
  get_my_day: z.object({ workspace, day: date.optional(), aliases: z.array(z.string().min(1).max(200)).min(1).max(20).default(['Bruno', 'Bruno Souza']),
    ...pagination }).strict()
};

const taskRecord = z.object({
  id: z.union([z.string().min(1), z.number().finite()]), title: z.string(),
  date: optionalDate.nullish(), deadline: optionalDate.nullish(), status: z.string().nullish(), project: z.string().nullish(), notes: z.string().nullish(),
  priority: z.coerce.number().min(1).max(5).nullish(), difficulty: z.coerce.number().min(1).max(5).nullish(),
  deferBusinessDays: z.coerce.number().int().min(-10000).max(10000).nullish(),
  subtasks: z.array(z.object({ text: z.string(), completed: z.boolean() }).passthrough()).nullish(),
  recurrence: z.object({}).passthrough().nullish(), metadata: z.object({}).passthrough().nullish()
}).passthrough();
const link = z.object({ projectId: z.string(), taskId: z.string() }).passthrough().nullish();
const actionRecord = z.object({
  id: z.string().min(1), title: z.string(), owner: z.string(), notes: z.string(), status: z.enum(actionStatuses),
  start: optionalDate.nullish(), end: optionalDate.nullish(), link
}).passthrough().refine(a => !a.start || !a.end || a.end >= a.start, 'Fim anterior ao início.');
const planRecord = z.object({ id: z.string().min(1), title: z.string(), actions: z.array(actionRecord), parentId: z.string().nullish() }).passthrough();
const scheduleTask = z.object({
  id: z.string().min(1), name: z.string(), indent: z.number().int().min(0).max(100), pred: z.string(),
  dur: z.number().nonnegative(), pct: z.number().min(0).max(100), start: optionalDate.nullish(), end: optionalDate.nullish()
}).passthrough();
export const documents = {
  todo: z.object({ version: z.literal(1), type: z.literal('todo'), tasks: z.array(taskRecord),
    settings: z.object({ projects: z.array(z.string()).optional(), config: z.object({}).passthrough().optional() }).passthrough() }).passthrough(),
  plans: z.object({ version: z.literal(1), type: z.literal('action-plans'), actionPlans: z.array(planRecord) }).passthrough(),
  schedules: z.object({ version: z.literal(1), projects: z.array(z.object({ id: z.string().min(1), title: z.string(),
    parentId: z.string().nullish(), tasks: z.array(scheduleTask) }).passthrough()).min(1) }).passthrough()
};

// Validate without normalizing/coercing stored records: preserve every original field.
export function validateDocument(area, data) {
  documents[area].parse(data);
  const unique = (records, label) => {
    const ids = records.map(record => String(record.id));
    if (new Set(ids).size !== ids.length) throw new Error(`IDs repetidos em ${label}.`);
  };
  if (area === 'todo') unique(data.tasks, 'tarefas');
  else {
    const records = area === 'plans' ? data.actionPlans : data.projects;
    unique(records, area);
    const byId = new Map(records.map(record => [record.id, record]));
    for (const record of records) {
      unique(area === 'plans' ? record.actions : record.tasks, record.id);
      let current = record;
      const seen = new Set();
      while (current) {
        if (seen.has(current.id)) throw new Error('Hierarquia circular.');
        seen.add(current.id);
        if (current.parentId && !byId.has(current.parentId)) throw new Error('Pai inexistente.');
        current = byId.get(current.parentId);
      }
    }
  }
  return data;
}
