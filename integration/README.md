# Integração ProjectFlow: terminal, API e MCP

Integração separada do frontend, usando os mesmos backups privados do aplicativo. O código não automatiza cliques nem acessa o armazenamento do navegador.

**Estado:** Worker publicado em `https://projectflow-integration.brunocesardesouza26.workers.dev`, com conexão OAuth instalada no ChatGPT. Leitura, criação sem duplicação e atualização foram validadas remotamente em uma branch privada com dados fictícios. O ambiente Trabalho usa os backups da branch `main`; Pessoal permanece desabilitado. Credenciais ficam em segredos do Worker.

## Operações

| Operação | Função |
| --- | --- |
| `list_tasks` | Tarefas, projetos, datas efetivas, filtros e versão atual |
| `create_task_project` | Criar projeto da guia Tarefas, sem duplicar nomes equivalentes |
| `create_task` | Criar tarefa em projeto existente, com data explícita e proteção contra duplicação |
| `update_task` | Atualizar campos solicitados de uma tarefa existente |
| `reschedule_tasks` | Simular/aplicar Configurações → A partir de hoje para uma data explícita |
| `list_actions` | Planos/subplanos e ações, responsáveis e datas vinculadas resolvidas |
| `create_action_plan` / `update_action_plan` | Criar e editar planos/subplanos, hierarquia, descrição, agenda, notas e participantes |
| `create_action` | Criar ação independente em plano consultado |
| `create_schedule` / `update_schedule` | Criar e editar cronogramas e grupos |
| `create_schedule_activity` / `update_schedule_activity` | Criar e editar atividades/marcos, progresso, datas, duração e dependências por ID |
| `update_action` | Atualizar a ação original; datas vinculadas exigem a interface |
| `list_schedule_activities` | Consultar atividades abertas pelo intervalo planejado |
| `get_my_day` | Hoje, atrasados, próximos sete dias, sem data, bloqueados e cronogramas |

Toda operação exige `workspace: "work"` (Trabalho) ou `"personal"` (Pessoal). Somente Trabalho fica habilitado por padrão. Quando omitido, `day` usa a data de `America/Sao_Paulo`. Datas são `AAAA-MM-DD`.

As listas retornam `total`, `offset`, `limit` e `nextOffset`. O padrão é 50, máximo 200. Para continuar, envie o `nextOffset` recebido. Cada lista de Meu dia tem sua própria paginação, com o mesmo offset informado.

## Usar pelo terminal sem hospedar um servidor

Requer Node.js 22.17 ou superior.

```sh
cd integration
npm ci
cp .env.example .env
```

Preencha **no arquivo local `.env`**, fora do Git, `GITHUB_REPOSITORY`, `GITHUB_TOKEN` e, se necessário, `GITHUB_BRANCH`. Use um token fine-grained limitado ao repositório privado de backups, com **Contents: Read and write**. Não use o repositório público `Gantt`. Não extraia credenciais do navegador nem envie tokens por chat ou nos argumentos dos comandos.

O modo local não precisa de OAuth nem de servidor HTTP; usa as permissões do processo local:

```sh
npm run cli -- --local list_tasks '{"workspace":"work","day":"2026-10-16","overdueOnly":true}'
npm run cli -- --local list_actions '{"workspace":"work","owner":"Bruno Souza","openOnly":true}'
npm run cli -- --local list_schedule_activities '{"workspace":"work","day":"2026-10-16","filter":"ongoing"}'
```

Consulte a versão antes de gravar. Substitua `SHA_DA_CONSULTA` pelo `version` da consulta de tarefas:

```sh
npm run cli -- --local create_task '{"workspace":"work","expectedVersion":"SHA_DA_CONSULTA","requestId":"teste-agente-2026-10-16-001","title":"Teste Agente Chatgpt","project":"R&D","date":"2026-10-16"}'
```

Use outro `requestId` para uma nova tarefa. **Reutilize o mesmo ID** ao repetir a mesma criação depois de uma falha ou resultado incerto. Após conflito, consulte novamente e revise a operação. `saved: true` confirma a gravação; uma nova gravação também retorna o SHA do commit.

A reprogramação primeiro simula, sem gravar:

```sh
npm run cli -- --local reschedule_tasks '{"workspace":"work","expectedVersion":"SHA_DA_CONSULTA","from":"2026-10-16"}'
```

Após revisar as mudanças, envie o mesmo pedido com `"dryRun":false`. Se a versão mudou, consulte e simule novamente. O procedimento segue a regra atual da interface: usa dias úteis, preserva os intervalos, prazos finais e recorrência, exclui concluídas/canceladas/reservas e não antecipa tarefas futuras para trás. Alvos no fim de semana passam para o próximo dia útil.

Para JSON longo, use `-` como último argumento e forneça o JSON pelo stdin. `npm run cli -- --help` lista os comandos.

## MCP local por stdio

Clientes com MCP local podem iniciar `node src/stdio.mjs`, fornecendo `GITHUB_REPOSITORY`, `GITHUB_TOKEN` e `PROJECTFLOW_WORKSPACES` pelo gerenciador de credenciais/ambiente. `npm run stdio` carrega o `.env` local. Esse transporte não abre portas e não substitui uma conexão remota do ChatGPT.

Exemplo sem segredos embutidos; ajuste o caminho e forneça as variáveis pelo cliente:

```json
{
  "mcpServers": {
    "projectflow": {
      "command": "node",
      "args": ["/caminho/para/Gantt/integration/src/stdio.mjs"]
    }
  }
}
```

## Hospedar na Cloudflare

Use um **Worker separado** de `orgoffice.pages.dev`, sem mover o aplicativo. A entrada é `src/worker.mjs`; `nodejs_compat` está habilitado. Não são necessários banco de dados ou KV para este serviço.

1. Configure o provedor OAuth descrito abaixo.
2. Ajuste `wrangler.toml`: nome, repositório, `PUBLIC_URL`, `OAUTH_ISSUER`, `OAUTH_JWKS_URL` e `OAUTH_AUDIENCE`. A URL pública deve ser a URL real do Worker, sem caminho. O audience é essa URL seguida de `/mcp`.
3. Autentique a conta de implantação: `npx wrangler login`.
4. Configure os segredos: `npx wrangler secret put GITHUB_TOKEN` e `npx wrangler secret put OAUTH_SUBJECTS`. O segundo contém o ID `sub` do usuário autorizado no provedor, não o nome de exibição. Não coloque tokens no arquivo TOML.
5. `npm run build:worker` verifica o bundle sem publicar. Após revisão e configuração, `npm run deploy:worker` publica o serviço na sua conta.
6. Verifique `/health`, a descoberta OAuth e uma consulta autenticada. Teste primeiro com um repositório privado de testes contendo os três backups válidos, antes de habilitar os dados reais.

Sem configuração de autenticação o Worker retorna 503. Para desenvolvimento, Wrangler aceita segredos em `.dev.vars` (ignorado pelo Git); ajuste a URL pública e o audience para o endereço local. Não publique configurações de desenvolvimento.

## OAuth para HTTP/MCP remoto

O token GitHub autentica o servidor no GitHub; **não autentica o usuário que chama a integração**. Configure um provedor OAuth/OIDC administrado por você, como Auth0 ou Keycloak, que ofereça:

- Authorization code + PKCE S256, metadata OAuth/OIDC e cliente registrado para ChatGPT ou DCR/CIMD configurado pelo provedor.
- Access tokens JWT com assinatura RS256, ES256 ou PS256 e campos `iss`, `aud`, `sub`, `exp`.
- Audience **exatamente** `PUBLIC_URL/mcp` e escopos `projectflow:read` / `projectflow:write`. Configure o provedor para tratar o parâmetro `resource` do cliente e emitir esse audience. Não use um ID token para chamar o serviço.
- Usuário explicitamente listado em `OAUTH_SUBJECTS`; pertencer ao mesmo provedor não concede acesso.
- Callbacks e credenciais de cliente conforme os valores exibidos no cadastro da conexão do ChatGPT. O serviço não inventa callbacks nem cria usuários.

O servidor publica `/.well-known/oauth-protected-resource/mcp` e `/.well-known/oauth-protected-resource`, valida os tokens a cada requisição e oferece desafios `WWW-Authenticate`. Login, consentimento e emissão/renovação de tokens pertencem ao provedor OAuth. O token de usuário não é repassado ao GitHub.

Referências: [autenticação de plugins](https://developers.openai.com/plugins/build/auth), [conectar e testar](https://developers.openai.com/plugins/deploy/connect-chatgpt), [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server).

## Servidor Node/Docker, alternativa ao Worker

Preencha `.env` (incluindo OAuth) e execute `npm start`. O padrão escuta somente `127.0.0.1:8787`; exponha-o por proxy HTTPS ou túnel autorizado. Para Docker, rode o build **dentro de `integration/`**:

```sh
docker build -t projectflow-integration .
docker run --rm --env-file .env -p 127.0.0.1:8787:8787 projectflow-integration
```

O Docker usa `HOST=0.0.0.0` internamente; com proxy local mantenha a porta publicada apenas em loopback. Hosts/origens são verificados. `ALLOWED_ORIGINS`, se necessário para uma ferramenta de inspeção no navegador, é uma lista explícita separada por vírgula; não aceita `*`.

## Conectar ao ChatGPT

Depois de publicar e testar o login, adicione um servidor MCP personalizado nas configurações de plugins/conexões disponíveis na sua conta, com a **URL HTTPS + `/mcp`** e autenticação OAuth. Revise os escopos e instale a conexão. A interface e a disponibilidade dependem da conta/ambiente; este código não instala o plugin automaticamente.

Para CLI remota, configure `PROJECTFLOW_URL` (origem do serviço) e `PROJECTFLOW_ACCESS_TOKEN` (access token OAuth obtido pelo login do cliente) e omita `--local`. `/api` recebe POST JSON com `{ "operation": "list_tasks", "arguments": { "workspace": "work" } }`. O serviço não fornece um fluxo client-credentials.

## Chat OpenRouter no Meu Dia

O botão **Conversar com assistente** abre um painel lateral (tela inteira no celular). Enter quebra a linha e Shift + Enter envia. Usa login Auth0 com PKCE, usuário autorizado e os escopos existentes. O token de acesso fica somente na memória da aba. Nenhuma chave OpenRouter é enviada ao navegador.

- Worker: configurar o segredo `OPENROUTER_API_KEY` em **Settings → Variables and Secrets → Add → Secret**. `OPENROUTER_MODEL` define o padrão inicial (`openai/gpt-6-luna`). O seletor do chat oferece modelos pagos e gratuitos compatíveis com ferramentas, listados em `src/chat-models.mjs` e conferidos no catálogo da OpenRouter em 16/10/2026. A escolha fica no navegador até o usuário mudar, inclusive após recarregar a página; não é sincronizada entre dispositivos. Se a opção salva sair da lista, o envio fica bloqueado até outra escolha, sem troca automática. Modelos gratuitos usam limite de preço zero e podem ter limites de capacidade/disponibilidade.
- As respostas recebem instruções permanentes para separar grupos e itens com detalhes por linhas em branco. O cliente renderiza parágrafos, títulos, listas, negrito e código inline sem interpretar HTML do modelo. O histórico enviado continua como texto original.
- O catálogo contém 17 opções: dez pagas e sete gratuitas (incluindo o roteador gratuito variável). Opções de maior capacidade incluem GPT-6.1 Sol, Claude Sonnet 5.5, Gemini 4 Argon, DeepSeek V4 Pro 0813, Qwen3.8 Max 0902 e MiniMax M3. Google gratuito usa Gemma 4 31B ou 26B A4B; Gemini não tem opção gratuita neste catálogo da OpenRouter. A seleção prévia não muda quando o catálogo é ampliado.
- `CHAT_CLIENT_ID` é um cliente público dedicado, registrado com callback `${PUBLIC_URL}/chat/callback`, authorization code e autenticação de token `none`. `ALLOWED_ORIGINS` contém somente o site e a prévia autorizados, sem curingas.
- `/chat/config` retorna apenas configuração pública. `/chat/token` troca código+PKCE pelo token, valida a identidade autorizada e não retorna ID token ou refresh token.
- `/chat` consulta os backups e executa as operações do domínio em uma cópia temporária. O resultado contém uma proposta assinada, vinculada ao usuário/repositório/branch e válida por 15 minutos. Nenhuma ferramenta do modelo grava diretamente.
- **Aplicar alterações** chama `/chat/apply`: exige escopo de escrita, assinatura íntegra e as versões consultadas ainda atuais. Todas as operações são validadas antes do primeiro PUT; há no máximo uma gravação por área. Se outra área falhar, a resposta lista somente os salvamentos confirmados, sem repetir automaticamente.
- Antes de aplicar, o aplicativo pausa o salvamento automático e exige somente as áreas alteradas conectadas e sem edições pendentes. Depois recarrega as áreas alteradas, guardando cópia de recuperação. A recarga de planos pelo chat não reaplica datas vinculadas ao Gantt.
- Qualquer projeto de tarefas informado no pedido pode ser criado automaticamente junto com a tarefa na mesma proposta e gravação. Projetos de tarefas, planos de ação e cronogramas são entidades distintas. Nomes configurados, inclusive Geral, são preservados pela interface.
- O chat exige conexão com a internet e saldo/limite disponível na chave OpenRouter. O servidor limita pedidos e chamadas por conversa; o limite por minuto em memória é uma proteção adicional, não um teto financeiro global. Configure também o limite da chave na OpenRouter.
- A prévia usa o mesmo backend de Trabalho: uma proposta aplicada altera os backups reais. A publicação da prévia, por si só, não altera os dados nem o frontend principal.

### Convivência com o aplicativo e limites

- Trabalho usa `backups/{todo,planos-de-acao,cronogramas}.json`; Pessoal usa `backups/pessoal/`. Pessoal exige habilitação explícita em `PROJECTFLOW_WORKSPACES`. A senha local da interface não autentica esta API.
- Toda gravação exige o SHA consultado e também usa esse SHA no `PUT` do GitHub. Conflitos não são repetidos automaticamente. Os commits entram no histórico existente da área.
- Uma aba já aberta pode manter uma cópia antiga. **Salve edições locais antes de usar a integração**; depois da alteração remota use a conexão do aplicativo para abrir a última versão. O mecanismo existente preserva edições locais e pode exigir resolução de conflitos. O serviço não força a atualização da aba.
- Consultas agregadas leem as três áreas separadamente e informam cada versão; não são uma transação simultânea.
- Esta versão não exclui dados nem altera avaliações diárias ou inclusão no Meu dia. As ações novas são independentes; a edição direta de datas de ações vinculadas ainda exige atuar na atividade do cronograma. Datas dependentes de linhas de resumo exigem a interface; as demais dependências FS/SS/FF/SF são validadas e recalculadas. Consultas não inventam progresso: 0% registrado continua 0%.
- Arquivos ausentes/inválidos não viram listas vazias: conecte e salve a área no aplicativo primeiro. Campos desconhecidos do formato atual são preservados.

## Regra proposta para o Assistente ProjectFlow

Depois de a integração estar publicada e conectada, o usuário pode substituir a regra de atuação exclusivamente visual por:

> Use prioritariamente a integração autenticada do ProjectFlow para operações suportadas. Declare o ambiente Trabalho ou Pessoal, consulte registros e versões antes de alterar, preserve campos não solicitados e confira o salvamento. Use a interface para operações não suportadas, conflitos ou conferência. Não altere backups manualmente fora da integração. Não inclua atividades no Meu dia sem pedido. Peça confirmação antes de excluir informações.

É uma proposta: estes arquivos **não atualizam a habilidade instalada**.

## Verificação

```sh
npm ci
npm test
npm run build:worker
```

Os testes usam dados fictícios, GitHub simulado, JWTs de teste e clientes MCP reais em conexão local. Cobrem datas, versões, duplicatas, preservação, validadores originais, vínculos, OAuth, escopos, ambientes, API e MCP nas entradas Node/Worker. Os testes automatizados locais não leem nem modificam backups privados do usuário. A validação remota de leitura/gravação foi executada somente na branch privada `codex/projectflow-integration-test`, criada com dados fictícios; a branch real `main` não recebeu essas gravações.
