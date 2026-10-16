import { validateDocument } from '../src/schemas.mjs';
import { IntegrationError } from '../src/store.mjs';

const task = (id, patch = {}) => ({ id, title: `Tarefa ${id}`, project: 'R&D', date: '2026-10-13', deadline: '2026-10-28',
  status: 'Em Andamento', priority: 3, difficulty: 2, notes: '', subtasks: [{ text: 'Preservar', completed: false }],
  recurrence: { frequency: 'Nenhuma' }, deferBusinessDays: 0, customField: { preserve: true }, ...patch });
const scheduleTask = (id, patch = {}) => ({ id, name: `Atividade ${id}`, start: '2026-10-13', end: '2026-10-20',
  indent: 0, pred: '', dur: 6, pct: 0, ...patch });
const action = (id, patch = {}) => ({ id, title: `Ação ${id}`, owner: 'Bruno Souza', notes: '', status: 'pending',
  start: '', end: '2026-10-20', link: null, ...patch });
export function fixtures() {
  return {
    todo: { version: 1, type: 'todo', extraEnvelope: 'keep', settings: { projects: ['R&D', 'PM'], config: { priority: 'unchanged' } }, tasks: [
      task('t1'), task('t2', { date: '2026-10-14', deferBusinessDays: 1 }),
      task('recurring', { status: 'Recorrente', recurrence: { frequency: 'Semanal', daysOfWeek: [3] } }),
      task('done', { status: 'Concluída' }), task('reserve', { status: 'Reserva' }), task('cancelled', { status: 'Cancelada' })
    ] },
    plans: { version: 1, type: 'action-plans', actionPlans: [
      { id: 'p1', title: 'Plano principal', description: '', document: { participants: ['Bruno Souza'] }, actions: [
        action('a1', { end: '2026-10-15', owner: 'Vitória Diniz' }),
        action('a2', { status: 'done' }), action('linked', { link: { projectId: 's1', taskId: 'leaf' }, start: '2020-01-01', end: '2020-01-01' })
      ] },
      { id: 'p2', title: 'Subplano', parentId: 'p1', actions: [action('a3')] }
    ] },
    schedules: { version: 1, activeProjectId: 's1', projects: [
      { id: 'group', title: 'Grupo', kind: 'group', tasks: [] },
      { id: 's1', title: 'Cronograma', parentId: 'group', fmt: { keep: true }, tasks: [
        scheduleTask('summary'), scheduleTask('leaf', { indent: 1, pred: '3FS' }),
        scheduleTask('done', { pct: 100 }), scheduleTask('overdue', { end: '2026-10-15' }),
        scheduleTask('future', { start: '2026-10-18', end: '2026-10-25' })
      ] }
    ] }
  };
}
export class FakeStore {
  constructor(data = fixtures()) { this.data = structuredClone(data); this.version = 'a'.repeat(40); this.writes = []; }
  async read(area, workspace) {
    if (!['work', 'personal'].includes(workspace)) throw new Error('Workspace missing');
    return { data: structuredClone(this.data[area]), version: this.version, path: `${workspace}/${area}`, branch: 'main' };
  }
  async write(area, workspace, snapshot, data, message) {
    if (snapshot.version !== this.version) throw new IntegrationError('version_conflict', 'Conflict', 409);
    validateDocument(area, data); this.writes.push({ area, workspace, message }); this.data[area] = structuredClone(data);
    this.version = 'b'.repeat(40);
    return { saved: true, version: this.version, commit: 'c'.repeat(40) };
  }
}
