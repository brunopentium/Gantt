import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp.mjs';
import { storeFromEnv } from './store.mjs';

try {
  storeFromEnv();
  await createMcpServer(() => storeFromEnv()).connect(new StdioServerTransport());
} catch { console.error('Não foi possível iniciar o MCP local. Confira as variáveis do servidor.'); process.exitCode = 1; }
