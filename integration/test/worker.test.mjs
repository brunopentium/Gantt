import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerHandler } from '../src/worker.mjs';
import worker from '../src/worker.mjs';
import { httpConfig } from '../src/auth.mjs';
import { IntegrationError } from '../src/store.mjs';
import { FakeStore } from './fixtures.mjs';

const config = httpConfig({ PUBLIC_URL: 'https://integration.example', OAUTH_ISSUER: 'https://issuer.example/',
  OAUTH_JWKS_URL: 'https://issuer.example/jwks', OAUTH_SUBJECTS: 'bruno' });
function setup(scopes = ['projectflow:read', 'projectflow:write']) {
  const store = new FakeStore();
  const handle = createWorkerHandler({ config, storeFactory: () => store, authenticate: async token => {
    if (token !== 'Bearer test') throw new IntegrationError('unauthorized', 'Login necessário.', 401);
    return { subject: 'bruno', scopes };
  } });
  const call = (route, body, headers = {}) => handle(new Request('https://integration.example' + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer test', ...headers }, body: JSON.stringify(body)
  }));
  return { store, handle, call };
}
test('unconfigured Worker stays closed and does not expose data', async () => {
  const response = await worker.fetch(new Request('https://integration.example/api'), {});
  assert.equal(response.status, 503);
});
test('Worker rejects missing credentials, cross-origin access, wrong host and oversized bodies', async () => {
  const { handle, call, store } = setup();
  assert.equal((await call('/api', {}, { Authorization: '' })).status, 401);
  assert.equal((await call('/api', {}, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await handle(new Request('https://attacker.example/health'))).status, 403);
  assert.equal((await call('/api', { operation: 'list_tasks', arguments: { extra: 'x'.repeat(100001) } })).status, 413);
  assert.equal(store.writes.length, 0);
});
test('Worker supports MCP initialization, schemas and real tool dispatch', async () => {
  const { call } = setup();
  const init = await call('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' }
  } });
  assert.equal(init.status, 200); assert.equal((await init.json()).result.serverInfo.name, 'projectflow');
  const tools = await (await call('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })).json();
  assert.equal(tools.result.tools.length, 9);
  const data = await (await call('/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
    name: 'list_tasks', arguments: { workspace: 'work', day: '2026-10-16' }
  } })).json();
  assert.equal(data.result.structuredContent.total, 6);
});
test('Worker API enforces write scopes and confirms a permitted save', async () => {
  const readonly = setup(['projectflow:read']);
  assert.equal((await readonly.call('/api', { operation: 'create_task', arguments: {} })).status, 403);
  const { call, store } = setup();
  const response = await call('/api', { operation: 'create_task', arguments: { workspace: 'work', expectedVersion: store.version,
    requestId: 'worker-request-0001', title: 'Worker task', project: 'R&D', date: '2026-10-16' } });
  assert.equal(response.status, 200); assert.equal((await response.json()).saved, true); assert.equal(store.writes.length, 1);
});
