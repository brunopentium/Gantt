import { pathToFileURL } from 'node:url';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createAuthenticator, httpConfig } from './auth.mjs';
import { createMcpServer, safeError, scopeFor } from './mcp.mjs';
import { storeFromEnv, IntegrationError } from './store.mjs';
import { execute } from './domain.mjs';

export function createApp({ config, storeFactory = () => storeFromEnv(), authenticate = createAuthenticator(config) }) {
  const app = createMcpExpressApp({ host: config.host,
    allowedHosts: [new URL(config.publicUrl).hostname, '127.0.0.1', 'localhost', '[::1]'] });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff');
    const origin = req.get('origin');
    if (origin && !config.origins.includes(origin)) return res.status(403).json({ error: { code: 'origin_denied', message: 'Origem não autorizada.' } });
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version');
      res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.set('Access-Control-Expose-Headers', 'WWW-Authenticate');
    }
    next();
  });
  const metadataUrl = `${config.publicUrl}/.well-known/oauth-protected-resource/mcp`;
  const challenge = scope => `Bearer resource_metadata="${metadataUrl}", scope="${scope || 'projectflow:read projectflow:write'}"`;
  app.get('/health', (_req, res) => res.json({ service: 'projectflow-integration', version: '1.0.0' }));
  for (const route of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    app.get(route, (_req, res) => res.json({ resource: `${config.publicUrl}/mcp`, authorization_servers: [config.issuer],
      scopes_supported: ['projectflow:read', 'projectflow:write'], bearer_methods_supported: ['header'] }));
  }
  app.options(['/mcp', '/api'], (_req, res) => res.sendStatus(204));
  app.use(['/mcp', '/api'], async (req, res, next) => {
    try { req.principal = await authenticate(req.get('authorization')); next(); }
    catch (error) {
      if (error.status === 401 || error.code === 'insufficient_scope') res.set('WWW-Authenticate', challenge());
      res.status(error.status || 500).json({ error: safeError(error) });
    }
  });
  app.post('/api', async (req, res) => {
    try {
      const { operation, arguments: args } = req.body || {};
      if (typeof operation !== 'string') throw new IntegrationError('invalid_input', 'Informe operation e arguments.');
      if (!req.principal.scopes.includes(scopeFor(operation))) {
        res.set('WWW-Authenticate', challenge(scopeFor(operation)));
        throw new IntegrationError('insufficient_scope', 'Permissão insuficiente para essa operação.', 403);
      }
      res.json(await execute(storeFactory(), operation, args));
    } catch (error) { res.status(error.status || 500).json({ error: safeError(error) }); }
  });
  app.post('/mcp', async (req, res) => {
    const server = createMcpServer(storeFactory, { ...req.principal, authMetadataUrl: metadataUrl });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch {
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Falha no transporte MCP.' } });
    }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST, OPTIONS').json({ error: 'Use POST para MCP stateless.' }));
  app.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ error: { code: 'invalid_request', message: 'Corpo JSON inválido ou grande demais.' } }));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = httpConfig(); storeFromEnv();
    const server = createApp({ config }).listen(config.port, config.host, () => console.log(`ProjectFlow integration listening on port ${config.port}`));
    server.requestTimeout = 60000;
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
  } catch { console.error('Configuração incompleta. Confira integration/README.md e as variáveis do servidor.'); process.exitCode = 1; }
}
