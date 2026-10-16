import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createAuthenticator, httpConfig } from './auth.mjs';
import { createMcpServer, safeError, scopeFor } from './mcp.mjs';
import { IntegrationError, storeFromEnv } from './store.mjs';
import { execute } from './domain.mjs';
import { chat, applyChatDraft, chatRateLimit } from './chat.mjs';
import { chatConfig, chatCallback, exchangeChatCode } from './chat-http.mjs';

async function boundedJson(request) {
  let size = 0;
  const chunks = [], reader = request.body?.getReader();
  if (!reader) throw new IntegrationError('invalid_input', 'Informe um corpo JSON.');
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 100000) { await reader.cancel(); throw new IntegrationError('request_too_large', 'Corpo da requisição grande demais.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new IntegrationError('invalid_input', 'Corpo JSON inválido.'); }
}
export function createWorkerHandler({ config, storeFactory, authenticate = createAuthenticator(config), env = {} }) {
  return async request => {
    const url = new URL(request.url), metadataUrl = `${config.publicUrl}/.well-known/oauth-protected-resource/mcp`;
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const json = (data, status = 200) => Response.json(data, { status, headers });
    const challenge = scope => `Bearer resource_metadata="${metadataUrl}", scope="${scope || 'projectflow:read projectflow:write'}"`;
    try {
      if (url.origin !== config.publicUrl) throw new IntegrationError('host_denied', 'Host não autorizado.', 403);
      const origin = request.headers.get('origin');
      if (origin && !config.origins.includes(origin)) throw new IntegrationError('origin_denied', 'Origem não autorizada.', 403);
      if (origin) {
        headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin');
        headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version');
        headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate');
      }
      if (request.method === 'GET' && url.pathname === '/health') return json({ service: 'projectflow-integration', version: '1.0.0' });
      if (request.method === 'GET' && url.pathname === '/chat/config') return json(chatConfig(env, config));
      if (request.method === 'GET' && url.pathname === '/chat/callback') return chatCallback(config);
      if (request.method === 'GET' && ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(url.pathname)) {
        return json({ resource: `${config.publicUrl}/mcp`, authorization_servers: [config.issuer],
          scopes_supported: ['projectflow:read', 'projectflow:write'], bearer_methods_supported: ['header'] });
      }
      if (!['/mcp', '/api', '/chat', '/chat/apply', '/chat/token'].includes(url.pathname)) throw new IntegrationError('not_found', 'Rota inexistente.', 404);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (url.pathname === '/chat/token') {
        if (request.method !== 'POST' || !origin || !request.headers.get('content-type')?.startsWith('application/json')) throw new IntegrationError('invalid_input', 'Solicitação de login inválida.', 400);
        return json(await exchangeChatCode(env, config, await boundedJson(request), authenticate));
      }
      let principal;
      try { principal = await authenticate(request.headers.get('authorization')); }
      catch (error) { if (error.status === 401 || error.code === 'insufficient_scope') headers.set('WWW-Authenticate', challenge()); throw error; }
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...Object.fromEntries(headers), Allow: 'POST, OPTIONS' } });
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new IntegrationError('invalid_input', 'Use Content-Type: application/json.', 415);
      const body = await boundedJson(request);
      if (url.pathname === '/chat' || url.pathname === '/chat/apply') {
        if (!origin) throw new IntegrationError('origin_denied', 'Abra o chat pelo ProjectFlow.', 403);
        chatRateLimit(principal.subject);
        return json(url.pathname === '/chat'
          ? await chat(env, principal, body, storeFactory())
          : await applyChatDraft(env, principal, body.token, storeFactory()));
      }
      if (url.pathname === '/api') {
        if (typeof body?.operation !== 'string') throw new IntegrationError('invalid_input', 'Informe operation e arguments.');
        if (!principal.scopes.includes(scopeFor(body.operation))) {
          headers.set('WWW-Authenticate', challenge(scopeFor(body.operation)));
          throw new IntegrationError('insufficient_scope', 'Permissão insuficiente para essa operação.', 403);
        }
        return json(await execute(storeFactory(), body.operation, body.arguments));
      }
      const server = createMcpServer(storeFactory, { ...principal, authMetadataUrl: metadataUrl });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 100000 });
      try {
        await server.connect(transport);
        const response = await transport.handleRequest(request, { parsedBody: body });
        const responseBody = response.body ? await response.arrayBuffer() : null;
        const resultHeaders = new Headers(response.headers);
        for (const [name, value] of headers) resultHeaders.set(name, value);
        return new Response(responseBody, { status: response.status, headers: resultHeaders });
      } finally { await server.close(); }
    } catch (error) { return json({ error: safeError(error) }, error.status || 500); }
  };
}

let cachedKey, cachedConfig, cachedAuthenticate;
export default {
  async fetch(request, env) {
    try {
      const key = JSON.stringify([env.PUBLIC_URL, env.OAUTH_ISSUER, env.OAUTH_JWKS_URL, env.OAUTH_AUDIENCE, env.OAUTH_SUBJECTS, env.ALLOWED_ORIGINS]);
      if (cachedKey !== key) {
        cachedConfig = httpConfig(env); cachedAuthenticate = createAuthenticator(cachedConfig); cachedKey = key;
      }
      return await createWorkerHandler({ config: cachedConfig, authenticate: cachedAuthenticate, storeFactory: () => storeFromEnv(env), env })(request);
    } catch {
      return Response.json({ error: { code: 'configuration', message: 'Configure a autenticação e as variáveis do servidor antes de ativar a integração.' } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  }
};
