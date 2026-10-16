import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createAuthenticator, httpConfig } from '../src/auth.mjs';
import { createApp } from '../src/http.mjs';
import { FakeStore } from './fixtures.mjs';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256' };
const env = { PUBLIC_URL: 'http://127.0.0.1:8787', OAUTH_ISSUER: 'https://issuer.example/',
  OAUTH_JWKS_URL: 'https://issuer.example/jwks', OAUTH_SUBJECTS: 'bruno' };
const config = httpConfig(env);
const authenticate = createAuthenticator(config, createLocalJWKSet({ keys: [jwk] }));
async function token(patch = {}) {
  return new SignJWT({ scope: 'projectflow:read projectflow:write', ...patch }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(patch.iss || config.issuer).setAudience(patch.aud || config.audience).setSubject(patch.sub || 'bruno')
    .setIssuedAt().setExpirationTime(patch.exp || '1h').sign(privateKey);
}
async function serve(t) {
  const store = new FakeStore();
  const server = createApp({ config, authenticate, storeFactory: () => store }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { store, url: `http://127.0.0.1:${server.address().port}` };
}
test('JWT verification checks signature, issuer, audience, expiry, scopes and subject allowlist', async () => {
  assert.equal((await authenticate(`Bearer ${await token()}`)).subject, 'bruno');
  for (const patch of [{ iss: 'https://attacker.example/' }, { aud: 'other-service' }, { exp: 1 }, { sub: 'other-user' }, { scope: '' }]) {
    await assert.rejects(authenticate(`Bearer ${await token(patch)}`));
  }
  await assert.rejects(authenticate('Bearer fake-test-token'), { code: 'unauthorized' });
  await assert.rejects(authenticate(undefined), { code: 'unauthorized' });
});
test('HTTP configuration fails closed without authorized subjects or with insecure remote URLs', () => {
  assert.throws(() => httpConfig({ ...env, OAUTH_SUBJECTS: '' }));
  assert.throws(() => httpConfig({ ...env, PUBLIC_URL: 'http://remote.example' }));
  assert.throws(() => httpConfig({ ...env, PUBLIC_URL: 'https://example.com/path' }));
  assert.throws(() => httpConfig({ ...env, OAUTH_AUDIENCE: 'other-service' }));
});
test('health and OAuth metadata are public; MCP and API require authentication', async t => {
  const { url, store } = await serve(t);
  assert.equal((await fetch(url + '/health')).status, 200);
  const metadata = await (await fetch(url + '/.well-known/oauth-protected-resource/mcp')).json();
  assert.equal(metadata.resource, config.audience); assert.deepEqual(metadata.authorization_servers, [config.issuer]);
  const response = await fetch(url + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 401); assert.match(response.headers.get('www-authenticate'), /resource_metadata=/);
  assert.equal((await fetch(url + '/mcp', { method: 'POST' })).status, 401); assert.equal(store.writes.length, 0);
});
test('read-only OAuth token cannot write through HTTP API', async t => {
  const { url, store } = await serve(t), access = await token({ scope: 'projectflow:read' });
  const response = await fetch(url + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
    body: JSON.stringify({ operation: 'create_task', arguments: {} }) });
  assert.equal(response.status, 403); assert.equal(store.writes.length, 0);
});
test('origin and Host validation reject cross-origin browser requests', async t => {
  const { url } = await serve(t);
  assert.equal((await fetch(url + '/health', { headers: { Origin: 'https://attacker.example' } })).status, 403);
  const status = await new Promise((resolve, reject) => {
    const req = request(url + '/health', { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 403);
});
test('SDK client completes MCP initialize, tool discovery, query and confirmed write over HTTP', async t => {
  const { url, store } = await serve(t), access = await token();
  const client = new Client({ name: 'projectflow-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${access}` } } }));
  t.after(() => client.close());
  const tools = await client.listTools(); assert.equal(tools.tools.length, 21);
  assert.equal(tools.tools.find(t => t.name === 'list_tasks').annotations.readOnlyHint, true);
  assert.deepEqual(tools.tools.find(t => t.name === 'create_task')._meta.securitySchemes[0].scopes, ['projectflow:write']);
  const listed = await client.callTool({ name: 'list_tasks', arguments: { workspace: 'work' } });
  assert.equal(listed.structuredContent.total, 6);
  const created = await client.callTool({ name: 'create_task', arguments: { workspace: 'work', expectedVersion: listed.structuredContent.version,
    requestId: 'mcp-request-0001', project: 'R&D', title: 'MCP task', date: '2026-10-16' } });
  assert.equal(created.structuredContent.saved, true); assert.equal(store.writes.length, 1);
  const invalid = await client.callTool({ name: 'update_task', arguments: { workspace: 'work', expectedVersion: store.version, id: 'missing', patch: { notes: 'x' } } });
  assert.equal(invalid.isError, true);
});
test('MCP tool-level scope errors include OAuth reauthorization metadata', async t => {
  const { url, store } = await serve(t), access = await token({ scope: 'projectflow:read' });
  const client = new Client({ name: 'readonly-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${access}` } } }));
  t.after(() => client.close());
  const response = await client.callTool({ name: 'create_task', arguments: { workspace: 'work', expectedVersion: store.version,
    requestId: 'readonly-request', title: 'Denied', project: 'R&D', date: '2026-10-16' } });
  assert.equal(response.isError, true); assert.match(response._meta['mcp/www_authenticate'][0], /insufficient_scope/);
  assert.equal(store.writes.length, 0);
});
