import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../../my-day-chat.js', import.meta.url), 'utf8');
const formatSource = await readFile(new URL('../../chat-format.js', import.meta.url), 'utf8');
const server = 'https://projectflow-integration.brunocesardesouza26.workers.dev';
// Exercise the actual form handlers with synthetic UI, OAuth and cloud adapters.
// This checks synchronization decisions, not rendering or a real login.
async function app(overrides = {}, area = 'todo', hooks = {}) {
  const elements = new Map(), events = new Map(), calls = [], refreshed = [], opened = [];
  let popup, uncertain = false;
  function element() {
    const classes=new Set(),listeners=new Map();
    return { dataset: {}, value: '', hidden: false, disabled: false, textContent: '', children:[], classList: { toggle(name,value) {if(value)classes.add(name);else classes.delete(name);}, contains:name=>classes.has(name) }, listeners,
      append(...items) {this.children.push(...items);}, replaceChildren() {this.children=[];}, scrollIntoView() {}, focus() {this.focused=true;}, show() {this.open=true;}, close() {this.open=false;}, addEventListener(name,fn) {listeners.set(name,fn);}, setAttribute() {}, contains:e=>[...elements.values()].includes(e),
      querySelector(selector) { return elements.get(selector.slice(1)); },
      set innerHTML(value) { for (const match of value.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element()); } };
  }
  for (const id of ['tabTodoNative', 'tabActions', 'tabGantt', 'ntCloudSettings', 'apCloudSettings','btnCloudBackup']) elements.set(id, { click: () => opened.push(id) });
  elements.set('app',{inert:false});
  const clean = { connected: true, ready: true, busy: false, blocked: false, dirty: false, repo: 'example/private' };
  const states = { todo: { ...clean }, plans: { ...clean }, schedules: { ...clean }, ...overrides };
  const adapter = area => ({ state: () => states[area], refreshRemote: async () => { refreshed.push(area); return { ok: true }; } });
  const storage=hooks.storage||new Map();
  const context = { Date, JSON, URL, URLSearchParams, AbortSignal, crypto: webcrypto, btoa, TextEncoder, setInterval: () => 1,
    localStorage:{getItem(key){if(hooks.blockStorage)throw Error('blocked');return storage.get(key)||null;},setItem(key,value){if(hooks.blockStorage)throw Error('blocked');storage.set(key,value);}},
    clearInterval() {}, document: { body: element(), createElement: element, createTextNode:text=>({textContent:text}), activeElement: null, getElementById: id => elements.get(id) },
    WorkspaceProfile: { personal: hooks.personal===true }, MyDay: { date: () => '2026-10-16', refresh() {} }, MyDayData: { flush() {} },
    WorkspaceAutosave: { async suspend() {}, resume() {}, refresh() {} }, TodoCloud: adapter('todo'), PlanCloud: adapter('plans'), GanttBackup: adapter('schedules'),
    open: () => (popup = { closed: false, close() { this.closed = true; } }), addEventListener: (name, fn) => events.set(name, fn),
    fetch: async (url, options) => {
      const path = new URL(url).pathname; calls.push(path);
      if (path === '/chat/config') return Response.json({ enabled: true, clientId: 'public', issuer: 'https://issuer.example/', redirectUri: server + '/chat/callback', audience: server + '/mcp', repository: 'example/private',workspaces:hooks.workspaces||['work','personal'],model:'openai/gpt-6-luna',models:[{id:'openai/gpt-6-luna',name:'GPT-6 Luna',free:false},{id:'openrouter/free',name:'Automático gratuito',free:true}] });
      if (path === '/chat/token') return Response.json({ access_token: 'synthetic-access', expires_in: 600 });
      assert.equal(options.headers.Authorization, 'Bearer synthetic-access');
      if (path === '/chat') {hooks.onChat?.(JSON.parse(options.body));return Response.json({workspace:hooks.responseWorkspace||(hooks.personal?'personal':'work'), reply: 'Revise', draft: { token: 'synthetic-draft', changes: [{ area, kind: 'task-project', title: 'Geral', created: true, fields: [{ label: 'Novo projeto de tarefas', after: 'Geral' }] }] } });}
      assert.equal(path, '/chat/apply');
      hooks.onApply?.(JSON.parse(options.body));
      await hooks.applying?.(elements);
      if (uncertain) throw new Error('synthetic network failure');
      return Response.json({ saved: true, changed: 1, results: [{ area, saved: true }] });
    } };
  context.window = context; vm.createContext(context);vm.runInContext(formatSource,context); vm.runInContext(source, context);
  context.document.body.append=panel=>{context.document.body.panel=panel;};
  context.MyDayChat.init(); await new Promise(setImmediate);
  await elements.get('mdChatLogin').onclick();
  await events.get('message')({ origin: server, source: popup, data: { type: 'projectflow-chat-auth', code: 'synthetic-code', state: new URL(popup.location).searchParams.get('state') } });
  elements.get('mdChatInput').value = 'Crie o projeto Geral';
  await elements.get('mdChatForm').onsubmit({ preventDefault() {} });
  return { elements, calls, refreshed, opened, states, context, dialog:context.document.body.panel, events, uncertain: () => { uncertain = true; } };
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
test('opening the sidebar keeps the app interactive and closing preserves the proposal',async()=>{
  const h=await app();h.context.MyDayChat.open();
  assert.equal(h.dialog.open,true);assert.equal(h.elements.get('app').inert,false);
  assert.equal(h.context.document.body.classList.contains('md-chat-open'),true);
  h.elements.get('tabGantt').click();assert.deepEqual(h.opened,['tabGantt']);assert.equal(h.dialog.open,true);
  h.context.MyDayChat.close();assert.equal(h.dialog.open,false);
  assert.equal(h.context.document.body.classList.contains('md-chat-open'),false);
  h.context.MyDayChat.open();assert.equal(h.elements.get('mdChatDraft').hidden,false);
  let stopped=false;h.dialog.listeners.get('keydown')({key:'Tab',stopPropagation(){stopped=true;}});assert(stopped);
  h.events.get('projectflow:workspace-switch')();assert.equal(h.dialog.open,false);
  assert.equal(h.context.document.body.classList.contains('md-chat-open'),false);
});
test('only applying changes locks editing, and success or uncertainty releases the app',async()=>{
  for(const uncertain of [false,true]){
    let applying=false;
    const h=await app({},'todo',{applying(elements){applying=true;assert.equal(elements.get('app').inert,true);}});
    assert.equal(h.elements.get('app').inert,false);if(uncertain)h.uncertain();
    await h.elements.get('mdChatApply').onclick();assert(applying);assert.equal(h.elements.get('app').inert,false);
  }
});
test('an assistant reply does not take keyboard focus from an app editor',async()=>{
  const h=await app();h.context.MyDayChat.open();
  const input=h.elements.get('mdChatInput');input.focused=false;
  h.context.document.activeElement={tagName:'INPUT'};input.value='Consulte minhas tarefas';
  await h.elements.get('mdChatForm').onsubmit({preventDefault(){}});
  assert.equal(input.focused,false);assert.equal(h.elements.get('app').inert,false);
});
test('model choice survives closing and a fresh page session and is sent with every request',async()=>{
  const storage=new Map(),requests=[];
  const h=await app({},'todo',{storage,onChat:body=>requests.push(body)});
  const select=h.elements.get('mdChatModel');select.value='openrouter/free';select.onchange();
  h.context.MyDayChat.open();h.context.MyDayChat.close();h.context.MyDayChat.open();assert.equal(select.value,'openrouter/free');
  const fresh=await app({},'todo',{storage,onChat:body=>requests.push(body)});
  assert.equal(fresh.elements.get('mdChatModel').value,'openrouter/free');
  assert.equal(requests.at(-1).model,'openrouter/free');assert.match(fresh.elements.get('mdChatModelHint').textContent,/Gratuito/);
  const old=await app({},'todo',{storage:new Map([['projectflow:chat:model:v1','removed/model']])});
  assert.equal(old.elements.get('mdChatModel').value,'removed/model');assert.equal(old.elements.get('mdChatSend').disabled,true);assert.match(old.elements.get('mdChatModelHint').textContent,/Selecione outro/);
  const blocked=await app({},'todo',{blockStorage:true});assert.match(blocked.elements.get('mdChatModelHint').textContent,/só nesta sessão/);
});
test('personal mode enables sending after login and binds consultation and apply to personal',async()=>{
  const sent=[],saved=[];const h=await app({},'todo',{personal:true,onChat:body=>sent.push(body),onApply:body=>saved.push(body)});
  assert.equal(h.elements.get('mdChatSend').disabled,false);assert.equal(sent.length,1);assert.equal(sent[0].workspace,'personal');
  assert.equal(h.elements.get('mdChatWorkspace').textContent,'Pessoal');assert.match(h.elements.get('mdChatDraftTitle').textContent,/Pessoal/);
  await h.elements.get('mdChatApply').onclick();assert.equal(saved[0].workspace,'personal');assert.deepEqual(h.refreshed,['todo']);
  h.elements.get('mdChatInput').value='Novo pedido';await h.elements.get('mdChatForm').onsubmit({preventDefault(){}});
  h.events.get('projectflow:workspace-switch')();assert.equal(h.elements.get('mdChatSend').disabled,true);assert.equal(h.elements.get('mdChatApply').disabled,true);assert.equal(h.elements.get('mdChatDraft').hidden,true);
  assert(sent.every(body=>body.workspace==='personal'));
});
test('personal stays unavailable when disabled on the server and rejects another workspace response',async()=>{
  const blocked=await app({},'todo',{personal:true,workspaces:['work']});assert(!blocked.calls.includes('/chat'));assert.equal(blocked.elements.get('mdChatSend').disabled,true);assert.match(blocked.elements.get('mdChatStatus').textContent,/Pessoal não está habilitado/);
  const wrong=await app({},'todo',{personal:true,responseWorkspace:'work'});assert.equal(wrong.elements.get('mdChatApply').disabled,true);assert.match(wrong.elements.get('mdChatStatus').textContent,/outro ambiente/);
});
