import test from 'node:test';
import assert from 'node:assert/strict';
import { projectNames } from '../../todo-native/project-names.mjs';
test('loading and saving preserves Geral, its task assignments and separate project priorities', () => {
  for (const defaultProject of ['R&D', 'Pessoal']) {
    const names = projectNames(defaultProject);
    const stored = { tasks: [{ id: 'test', project: 'Geral' }], projects: [defaultProject, 'Geral', 'Geral'], priorities: { Geral: 1, [defaultProject]: 4 } };
    const restored = { tasks: stored.tasks.map(t => ({ ...t, project: names.normalizeProjectName(t.project) })),
      projects: names.ensureDefaultProject(stored.projects), priorities: Object.fromEntries(Object.entries(stored.priorities).map(([k,v]) => [names.normalizeProjectName(k),v])) };
    assert.equal(restored.tasks[0].project, 'Geral'); assert.deepEqual(restored.projects, [defaultProject, 'Geral']);
    assert.equal(restored.priorities.Geral, 1); assert.equal(restored.priorities[defaultProject], 4);
    assert.equal(names.normalizeProjectName(''), defaultProject);
  }
});
