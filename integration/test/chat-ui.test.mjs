import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../../my-day-chat.js', import.meta.url), 'utf8');
const server = 'https://projectflow-integration.brunocesardesouza26.workers.dev';
// Exercise the actual form handlers with synthetic UI, OAuth and cloud adapters.
// This checks synchronization decisions, not rendering or a real login.
async function app(overrides = {}, area = 'todo') {
  const elements = new Map(), events = new Map(), calls = [], refreshed = [], opened = [];
  let popup, uncertain = false;
  function element() {
    return { dataset: {}, value: '', hidden: false, disabled: false, textContent: '', classList: { toggle() {} },
      append() {}, replaceChildren() {}, scrollIntoView() {}, focus() {}, showModal() {}, close() {}, addEventListener() {}, setAttribute() {},
      querySelector(selector) { return elements.get(selector.slice(1)); },
      set innerHTML(value) { for (const match of value.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element()); } };
  }
  for (const id of ['tabTodoNative', 'tabActions', 'tabGantt', 'ntCloudSettings', 'apCloudSettings','btnCloudBackup']) elements.set(id, { click: () => opened.push(id) });
  const clean = { connected: true, ready: true, busy: false, blocked: false, dirty: false, repo: 'example/private' };
  const states = { todo: { ...clean }, plans: { ...clean }, schedules: { ...clean }, ...overrides };
  const adapter = area => ({ state: () => states[area], refreshRemote: async () => { refreshed.push(area); return { ok: true }; } });
  const context = { Date, JSON, URL, URLSearchParams, AbortSignal, crypto: webcrypto, btoa, TextEncoder, setInterval: () => 1,
    clearInterval() {}, document: { body: { append() {} }, createElement: element, activeElement: null, getElementById: id => elements.get(id) },
    WorkspaceProfile: { personal: false }, MyDay: { date: () => '2026-10-16', refresh() {} }, MyDayData: { flush() {} },
    WorkspaceAutosave: { async suspend() {}, resume() {}, refresh() {} }, TodoCloud: adapter('todo'), PlanCloud: adapter('plans'), GanttBackup: adapter('schedules'),
    open: () => (popup = { closed: false, close() { this.closed = true; } }), addEventListener: (name, fn) => events.set(name, fn),
    fetch: async (url, options) => {
      const path = new URL(url).pathname; calls.push(path);
      if (path === '/chat/config') return Response.json({ enabled: true, clientId: 'public', issuer: 'https://issuer.example/', redirectUri: server + '/chat/callback', audience: server + '/mcp', repository: 'example/private' });
      if (path === '/chat/token') return Response.json({ access_token: 'synthetic-access', expires_in: 600 });
      assert.equal(options.headers.Authorization, 'Bearer synthetic-access');
      if (path === '/chat') return Response.json({ reply: 'Revise', draft: { token: 'synthetic-draft', changes: [{ area, kind: 'task-project', title: 'Geral', created: true, fields: [{ label: 'Novo projeto de tarefas', after: 'Geral' }] }] } });
      assert.equal(path, '/chat/apply');
      if (uncertain) throw new Error('synthetic network failure');
      return Response.json({ saved: true, changed: 1, results: [{ area, saved: true }] });
    } };
  context.window = context; vm.createContext(context); vm.runInContext(source, context);
  context.MyDayChat.init(); await new Promise(setImmediate);
  await elements.get('mdChatLogin').onclick();
  await events.get('message')({ origin: server, source: popup, data: { type: 'projectflow-chat-auth', code: 'synthetic-code', state: new URL(popup.location).searchParams.get('state') } });
  elements.get('mdChatInput').value = 'Crie o projeto Geral';
  await elements.get('mdChatForm').onsubmit({ preventDefault() {} });
  return { elements, calls, refreshed, opened, states, uncertain: () => { uncertain = true; } };
}

test('task-only proposal saves and reloads with unrelated areas disconnected and dirty', async () => {
  const h = await app({ plans: { connected: false, ready: false, dirty: true }, schedules: { connected: false, ready: false, blocked: true } });
  await h.elements.get('mdChatApply').onclick();
  assert(h.calls.includes('/chat/apply')); assert.deepEqual(h.refreshed, ['todo']);
  assert.match(h.elements.get('mdChatStatus').textContent, /atualizado/);
});
test('missing, dirty or mismatched affected areas cannot apply; connection control opens the correct settings', async () => {
  for (const override of [{ connected: false }, { ready: false }, { blocked: true }, { dirty: true }, { repo: 'other/private' }]) {
    const h = await app(); Object.assign(h.states.todo, override);
    await h.elements.get('mdChatApply').onclick();
    assert(!h.calls.includes('/chat/apply')); assert.deepEqual(h.refreshed, []);
    assert.equal(h.elements.get('mdChatDraft').hidden, false);
    if ('connected' in override) {
      assert.match(h.elements.get('mdChatStatus').textContent, /Tarefas/);
      assert.equal(h.elements.get('mdChatConnect').hidden, false);
      h.elements.get('mdChatConnect').onclick();
      assert.deepEqual(h.opened, ['tabTodoNative', 'ntCloudSettings']);
    }
  }
});
test('an uncertain save blocks more requests and recovery reloads only the proposed area', async () => {
  const h = await app({ plans: { connected: false }, schedules: { connected: false } }); h.uncertain();
  await h.elements.get('mdChatApply').onclick();
  assert.equal(h.elements.get('mdChatSend').disabled, true); assert.equal(h.elements.get('mdChatReload').hidden, false);
  await h.elements.get('mdChatReload').onclick();
  assert.deepEqual(h.refreshed, ['todo']); assert.equal(h.elements.get('mdChatSend').disabled, false);
});
test('Enter keeps its newline behavior; Shift+Enter submits once and respects composition and disabled controls',async()=>{
  const h=await app();let submissions=0,prevented=0;
  h.elements.get('mdChatForm').requestSubmit=()=>submissions++;
  const key=props=>h.elements.get('mdChatInput').onkeydown({key:'Enter',shiftKey:false,isComposing:false,repeat:false,preventDefault:()=>prevented++,...props});
  key({});assert.equal(submissions,0);assert.equal(prevented,0);
  key({shiftKey:true});assert.equal(submissions,1);assert.equal(prevented,1);
  key({shiftKey:true,repeat:true});key({shiftKey:true,isComposing:true});assert.equal(submissions,1);
  h.elements.get('mdChatSend').disabled=true;key({shiftKey:true});assert.equal(submissions,1);
});
test('schedule changes reload schedules and cannot overwrite pending linked action dates',async()=>{
  const h=await app({todo:{connected:false},plans:{connected:false}},'schedules');
  await h.elements.get('mdChatApply').onclick();assert.deepEqual(h.refreshed,['schedules']);
  const blocked=await app({},'schedules');blocked.states.plans.linkedDirty=true;
  await blocked.elements.get('mdChatApply').onclick();assert(!blocked.calls.includes('/chat/apply'));assert.match(blocked.elements.get('mdChatStatus').textContent,/ações vinculadas/);
  const missing=await app({},'schedules');missing.states.schedules.connected=false;
  await missing.elements.get('mdChatApply').onclick();missing.elements.get('mdChatConnect').onclick();
  assert.deepEqual(missing.opened,['tabGantt','btnCloudBackup']);
});
