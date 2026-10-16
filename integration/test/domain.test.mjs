import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { execute, today, businessShift, effectiveDate } from '../src/domain.mjs';
import { validateDocument } from '../src/schemas.mjs';
import { FakeStore, fixtures } from './fixtures.mjs';

const version = 'a'.repeat(40);
const writeInput = { workspace: 'work', expectedVersion: version };
const createInput = { ...writeInput, requestId: 'request-0001', title: 'Teste Agente Chatgpt', project: 'R&D', date: '2026-10-16' };
test('São Paulo date does not follow UTC midnight', () => {
  assert.equal(today(new Date('2026-10-16T01:00:00Z')), '2026-10-15');
  assert.equal(today(new Date('2026-10-16T07:00:00Z')), '2026-10-16');
});
test('business-day movement skips weekends, supports negative offsets and recurrence', () => {
  assert.equal(businessShift('2026-10-16', 1), '2026-10-19');
  assert.equal(businessShift('2026-10-19', -1), '2026-10-16');
  assert.equal(effectiveDate({ date: '2026-10-16', deferBusinessDays: 1 }), '2026-10-19');
  assert.equal(effectiveDate({ date: '2026-10-16', deferBusinessDays: 1, status: 'Recorrente' }), '2026-10-16');
});
test('workspace, valid dates and known fields are required before any write', async () => {
  const store = new FakeStore();
  for (const input of [{ ...createInput, workspace: undefined }, { ...createInput, date: '2026-02-30' },
    { ...createInput, token: 'must not be accepted' }, { ...createInput, expectedVersion: undefined }]) {
    await assert.rejects(execute(store, 'create_task', input), { code: 'invalid_input' });
  }
  await assert.rejects(execute(store, '__proto__', {}), { code: 'unknown_operation' });
  assert.equal(store.writes.length, 0);
});
test('list returns effective dates and pagination with stable identifiers', async () => {
  const result = await execute(new FakeStore(), 'list_tasks', { workspace: 'work', day: '2026-10-16', overdueOnly: true, limit: 1 });
  assert.equal(result.total, 3); assert.equal(result.items.length, 1); assert.equal(result.nextOffset, 1); assert.equal(result.version, version);
});
test('creating a task preserves settings and unknown stored fields and is idempotent', async () => {
  const store = new FakeStore(), before = structuredClone(store.data);
  const result = await execute(store, 'create_task', createInput);
  assert.equal(result.saved, true); assert.equal(result.task.date, '2026-10-16'); assert.equal(result.task.deadline, '');
  assert.deepEqual(store.data.todo.settings, before.todo.settings); assert.equal(store.data.todo.extraEnvelope, 'keep');
  assert.deepEqual(store.data.todo.tasks.slice(0, -1), before.todo.tasks);
  const again = await execute(store, 'create_task', { ...createInput, expectedVersion: store.version });
  assert.equal(again.unchanged, true); assert.equal(store.writes.length, 1);
  await assert.rejects(execute(store, 'create_task', { ...createInput, title: 'Different', expectedVersion: store.version }), { code: 'request_id_reused' });
});
test('stale versions and unknown projects never write', async () => {
  const store = new FakeStore();
  await assert.rejects(execute(store, 'create_task', { ...createInput, expectedVersion: '0'.repeat(40) }), { code: 'version_conflict' });
  await assert.rejects(execute(store, 'create_task', { ...createInput, project: 'Inventado' }), { code: 'unknown_project' });
  assert.equal(store.writes.length, 0);
});
test('explicit task projects preserve all other data, reject stale versions and reuse equivalent names', async () => {
  const store = new FakeStore(), before = structuredClone(store.data);
  await assert.rejects(execute(store, 'create_task_project', { ...writeInput, expectedVersion: '0'.repeat(40), title: 'Geral' }), { code: 'version_conflict' });
  await assert.rejects(execute(store, 'create_task_project', { ...writeInput, title: '  ' }), { code: 'invalid_input' });
  assert.equal(store.writes.length, 0);
  const result = await execute(store, 'create_task_project', { ...writeInput, title: '  Geral  ' });
  assert.equal(result.project.title, 'Geral');
  assert.deepEqual(store.data.todo.settings.projects, [...before.todo.settings.projects, 'Geral']);
  assert.deepEqual(store.data.todo.tasks, before.todo.tasks);
  assert.deepEqual(store.data.todo.settings.config, before.todo.settings.config);
  assert.deepEqual(store.data.plans, before.plans); assert.deepEqual(store.data.schedules, before.schedules);
  assert.equal(store.data.todo.extraEnvelope, before.todo.extraEnvelope);
  const again = await execute(store, 'create_task_project', { ...writeInput, expectedVersion: store.version, title: 'gÉral' });
  assert.equal(again.unchanged, true); assert.equal(again.project.title, 'Geral'); assert.equal(store.writes.length, 1);
  await execute(store, 'create_task', { ...createInput, expectedVersion: store.version, project: result.project.title });
  assert.equal(store.data.todo.tasks.at(-1).project, 'Geral');
});
test('updates preserve subtasks and metadata, date changes reset defer offset', async () => {
  const store = new FakeStore(), before = structuredClone(store.data.todo.tasks[1]);
  const result = await execute(store, 'update_task', { ...writeInput, id: 't2', patch: { date: '2026-10-20', notes: 'Updated' } });
  assert.equal(result.task.deferBusinessDays, 0); assert.equal(result.task.deadline, before.deadline);
  assert.deepEqual(result.task.subtasks, before.subtasks); assert.deepEqual(result.task.customField, before.customField);
});
test('cannot create an unconfigured recurring task or touch unknown fields', async () => {
  const store = new FakeStore();
  await assert.rejects(execute(store, 'update_task', { ...writeInput, id: 't1', patch: { status: 'Recorrente' } }), { code: 'recurrence_required' });
  await assert.rejects(execute(store, 'update_task', { ...writeInput, id: 't1', patch: { id: 'renamed' } }), { code: 'invalid_input' });
  assert.equal(store.writes.length, 0);
});
test('reschedule defaults to preview, preserves deadlines and does not touch closed/reserve tasks', async () => {
  const store = new FakeStore(), before = structuredClone(store.data);
  const preview = await execute(store, 'reschedule_tasks', { ...writeInput, from: '2026-10-16' });
  assert.equal(preview.dryRun, true); assert.equal(preview.shiftBusinessDays, 3); assert.equal(preview.changed, 3);
  assert.equal(store.writes.length, 0); assert.deepEqual(store.data, before);
  const saved = await execute(store, 'reschedule_tasks', { ...writeInput, from: '2026-10-16', dryRun: false });
  assert.equal(saved.saved, true); assert.equal(store.data.todo.tasks[0].date, '2026-10-16');
  assert.equal(store.data.todo.tasks[1].date, '2026-10-19');
  assert.equal(store.data.todo.tasks[2].recurrence.frequency, 'Semanal');
  for (let i = 0; i < 3; i++) assert.equal(store.data.todo.tasks[i].deadline, before.todo.tasks[i].deadline);
  assert.deepEqual(store.data.todo.tasks.slice(3), before.todo.tasks.slice(3));
  const again = await execute(store, 'reschedule_tasks', { ...writeInput, expectedVersion: store.version, from: '2026-10-16', dryRun: false });
  assert.equal(again.unchanged, true); assert.equal(store.writes.length, 1);
});
test('weekend target moves to Monday; never pulls future tasks backwards', async () => {
  const store = new FakeStore();
  const result = await execute(store, 'reschedule_tasks', { ...writeInput, from: '2026-10-17' });
  assert.equal(result.targetDate, '2026-10-19'); assert.equal(result.changes[0].after, '2026-10-19');
  const past = await execute(store, 'reschedule_tasks', { ...writeInput, from: '2026-10-01' }); assert.equal(past.changed, 0);
});
test('actions include parent paths, exact owner matching, calculated linked dates', async () => {
  const store = new FakeStore();
  const result = await execute(store, 'list_actions', { workspace: 'work', planId: 'p1', owner: 'Bruno Souza', openOnly: true });
  assert.equal(result.total, 2); assert.equal(result.plans.length, 2);
  assert.equal(result.items.find(a => a.id === 'linked').end, '2026-10-20');
  assert.equal(result.items.find(a => a.id === 'a3').path, 'Plano principal / Subplano');
  const partial = await execute(store, 'list_actions', { workspace: 'work', owner: 'Bruno' }); assert.equal(partial.total, 0);
});
test('linked date changes are rejected; independent status changes never update the Gantt', async () => {
  const store = new FakeStore(), before = structuredClone(store.data.schedules);
  await assert.rejects(execute(store, 'update_action', { ...writeInput, planId: 'p1', id: 'linked', patch: { end: '2026-11-01' } }), { code: 'linked_dates_require_ui' });
  const result = await execute(store, 'update_action', { ...writeInput, planId: 'p1', id: 'linked', patch: { status: 'done' } });
  assert.equal(result.action.status, 'done'); assert.deepEqual(store.data.schedules, before); assert.equal(store.writes[0].area, 'plans');
});
test('unlinked action dates are validated and fields not requested remain unchanged', async () => {
  const store = new FakeStore();
  await assert.rejects(execute(store, 'update_action', { ...writeInput, planId: 'p1', id: 'a1', patch: { start: '2026-10-22' } }), { code: 'invalid_dates' });
  assert.equal(store.writes.length, 0);
});
test('schedules show planned ongoing leaf tasks and exclude summaries and completed tasks', async () => {
  const store = new FakeStore();
  const result = await execute(store, 'list_schedule_activities', { workspace: 'work', day: '2026-10-16', projectId: 'group' });
  assert.deepEqual(result.items.map(r => r.id), ['leaf']); assert.equal(result.items[0].pct, 0);
  assert.equal(store.writes.length, 0);
});
test('Meu dia matches execution versus deadline rules and never includes a Gantt task implicitly', async () => {
  const store = new FakeStore(); store.data.todo.tasks[0].deadline = '2026-10-16';
  const result = await execute(store, 'get_my_day', { workspace: 'work', day: '2026-10-16' });
  assert.equal(result.counts.today, 1); assert.equal(result.counts.overdue, 4);
  assert.equal(result.schedule.ongoing.total, 1);
  assert.equal(result.work.today.items.some(r => r.source === 'gantt'), false); assert.equal(store.writes.length, 0);
});
test('written documents pass the existing browser validators', async () => {
  const store = new FakeStore(); await execute(store, 'create_task', createInput);
  const window = { WorkspaceProfile: { key: s => s, personal: false } };
  const context = vm.createContext({ window, localStorage: { getItem: () => null } });
  vm.runInContext(await readFile(new URL('../../todo-native.js', import.meta.url), 'utf8'), context);
  vm.runInContext(await readFile(new URL('../../action-plans.js', import.meta.url), 'utf8'), context);
  window.NativeTodo.validate(store.data.todo); window.ActionPlans.validate(store.data.plans.actionPlans);
});
test('corrupt data, duplicate IDs and hierarchy cycles are rejected', () => {
  const data = fixtures(); data.todo.tasks.push(data.todo.tasks[0]); assert.throws(() => validateDocument('todo', data.todo));
  const plans = fixtures().plans; plans.actionPlans[0].parentId = 'p2'; assert.throws(() => validateDocument('plans', plans));
});
