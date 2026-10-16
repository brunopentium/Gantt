import { inputs } from './schemas.mjs';
import { descriptions, safeError } from './mcp.mjs';
import { execute } from './domain.mjs';
import { IntegrationError, storeFromEnv } from './store.mjs';

const args = process.argv.slice(2), local = args[0] === '--local';
if (local) args.shift();
const [operation, json] = args;
if (!operation || operation === '--help') {
  console.log('Uso: npm run cli -- [--local] OPERACAO JSON\nUse - no lugar de JSON para ler stdin.\n\n'
    + Object.entries(descriptions).map(([name, description]) => `${name}: ${description}`).join('\n'));
} else {
  try {
    if (!Object.hasOwn(inputs, operation)) throw new IntegrationError('unknown_operation', 'Operação desconhecida.');
    let raw = json;
    if (raw === '-') { raw = ''; for await (const chunk of process.stdin) { raw += chunk; if (raw.length > 100000) throw new IntegrationError('invalid_input', 'Entrada grande demais.'); } }
    let input;
    try { input = JSON.parse(raw || '{}'); } catch { throw new IntegrationError('invalid_input', 'Informe os argumentos em JSON válido.'); }
    let result;
    if (local) result = await execute(storeFromEnv(), operation, input);
    else {
      const base = new URL(process.env.PROJECTFLOW_URL || '');
      if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new IntegrationError('configuration', 'PROJECTFLOW_URL exige HTTPS.');
      if (base.username || base.password || base.pathname !== '/' || base.search || base.hash || !process.env.PROJECTFLOW_ACCESS_TOKEN) throw new IntegrationError('configuration', 'Configure PROJECTFLOW_URL (origem) e PROJECTFLOW_ACCESS_TOKEN.');
      const response = await fetch(new URL('/api', base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PROJECTFLOW_ACCESS_TOKEN}` },
        body: JSON.stringify({ operation, arguments: input }) });
      result = await response.json();
      if (!response.ok) { console.error(JSON.stringify(result)); process.exitCode = 1; }
    }
    if (!process.exitCode) console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(JSON.stringify({ error: safeError(error) })); process.exitCode = 1; }
}
