import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubStore } from '../src/store.mjs';
import { fixtures } from './fixtures.mjs';

const version = 'a'.repeat(40);
const file = data => ({ encoding: 'base64', sha: version, size: Buffer.byteLength(JSON.stringify(data)), content: Buffer.from(JSON.stringify(data)).toString('base64') });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
function setup(responses, extra = {}) {
  const requests = [];
  const store = new GitHubStore({ repository: 'example/private-backups', token: 'fake-test-token',
    fetcher: async (url, options) => { requests.push({ url, options }); const next = responses.shift(); if (next instanceof Error) throw next; return next; }, ...extra });
  return { store, requests };
}
test('public repository and Pages-enabled backup repositories are refused', async () => {
  for (const metadata of [{ private: false }, { private: true, has_pages: true }]) {
    const { store, requests } = setup([json(metadata)]);
    await assert.rejects(store.read('todo', 'work'), { code: 'unsafe_repository' }); assert.equal(requests.length, 1);
  }
});
test('personal workspace is disabled by default and no request is made', async () => {
  const { store, requests } = setup([]);
  await assert.rejects(store.read('todo', 'personal'), { code: 'workspace_forbidden' }); assert.equal(requests.length, 0);
});
test('work/personal paths are isolated, branch names encoded, secrets stay in headers', async () => {
  const { store, requests } = setup([json({ private: true, has_pages: false, default_branch: 'data/main' }), json(file(fixtures().todo))], { workspaces: ['work', 'personal'] });
  const snapshot = await store.read('todo', 'personal');
  assert.equal(snapshot.path, 'backups/pessoal/todo.json'); assert.match(requests[1].url, /ref=data%2Fmain$/);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer fake-test-token'); assert.equal(requests[1].options.redirect, 'manual');
  assert.equal(JSON.stringify(snapshot).includes('fake-test-token'), false);
});
test('saving uses the exact source SHA and preserves unknown envelope data', async () => {
  const data = fixtures().todo;
  const { store, requests } = setup([json({ private: true, has_pages: false, default_branch: 'main' }), json(file(data)),
    json({ content: { sha: 'b'.repeat(40) }, commit: { sha: 'c'.repeat(40) } })]);
  const snapshot = await store.read('todo', 'work');
  const result = await store.write('todo', 'work', snapshot, data, 'update_task');
  const body = JSON.parse(requests[2].options.body), saved = JSON.parse(Buffer.from(body.content, 'base64'));
  assert.equal(body.sha, version); assert.equal(body.branch, 'main'); assert.equal(saved.extraEnvelope, 'keep');
  assert.equal(result.saved, true); assert.equal(result.commit, 'c'.repeat(40));
});
test('redirects are rejected without following or forwarding credentials', async () => {
  for (const status of [301, 302, 307, 308]) {
    const { store, requests } = setup([new Response(null, { status, headers: { Location: 'https://other.example/private' } })]);
    await assert.rejects(store.read('todo', 'work'), { code: 'github_redirect' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.redirect, 'manual');
  }
});
test('concurrent saves, missing files, malformed data and upstream failures are never success', async () => {
  for (const [response, code] of [[json({}, 404), 'backup_missing'], [json({}, 409), 'version_conflict'],
    [json(file({ wrong: true })), 'invalid_backup'], [new Error('network failure including secret'), 'upstream_unavailable']]) {
    const { store } = setup([json({ private: true, default_branch: 'main' }), response]);
    await assert.rejects(store.read('todo', 'work'), { code });
  }
});
test('a real SHA conflict on PUT is not retried or overwritten', async () => {
  const { store, requests } = setup([json({ private: true, default_branch: 'main' }), json(file(fixtures().todo)), json({}, 409)]);
  const snapshot = await store.read('todo', 'work');
  await assert.rejects(store.write('todo', 'work', snapshot, snapshot.data, 'update_task'), { code: 'version_conflict' });
  assert.equal(requests.filter(r => r.options.method === 'PUT').length, 1);
});
