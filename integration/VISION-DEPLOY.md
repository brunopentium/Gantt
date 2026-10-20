# Ativar a análise visual de Notas

O frontend e o código do Worker são publicados separadamente. Esta entrega está pronta para implantação, mas a leitura visual só é ativada após o serviço anunciar sua capacidade em `/chat/config`. Não basta publicar o repositório no GitHub.

## Publicação pelo GitHub conectado

O Worker `projectflow-integration` acompanha `brunopentium/Gantt`, branch `main`, com publicações automáticas habilitadas. A pasta de trabalho é `integration`, o comando de build é `npm ci` e o comando de publicação é `npx wrangler deploy --config=wrangler.production.toml`.

A configuração de produção usa `keep_vars = true` e não declara `[vars]`, preservando as variáveis e os segredos já cadastrados no painel. Um novo commit na branch de produção dispara o build. Confirme o sucesso na Cloudflare e a capacidade anunciada em `/chat/config` antes de considerar a análise visual ativada.

## Caminho usando o pacote compilado

O pacote [projectflow-vision-worker.zip](https://orgoffice.pages.dev/downloads/projectflow-vision-worker.zip) contém o Worker compilado, configuração mínima e instruções. Ele não contém tokens nem outros segredos. Requer Node.js 22 ou superior e acesso à conta Cloudflare que já hospeda `projectflow-integration`.

1. Extraia o ZIP e abra o terminal na pasta extraída.
2. Execute `npx --yes wrangler@4.151.0 login` e entre na conta Cloudflare correta.
3. Execute `npx --yes wrangler@4.151.0 deploy --config wrangler.toml`.
4. A configuração do pacote usa `keep_vars = true`, sem declarar `[vars]`, para preservar as variáveis existentes. Segredos existentes também são mantidos. Não é necessário copiar tokens ou gerar chaves novas.
5. Abra `https://projectflow-integration.brunocesardesouza26.workers.dev/chat/config`. Confirme `features.vision.version` igual a `1` e `vision:true` no modelo escolhido. O endpoint não mostra os segredos.
6. Reabra/atualize o ProjectFlow, entre no assistente e teste uma imagem sem dados sensíveis. A interface deixa de mostrar a pendência de atualização quando recebe a configuração nova.

Se o envio continuar bloqueado, confira a conta/Worker publicados, a capacidade do modelo e a mensagem do aplicativo. Nunca coloque a chave OpenRouter ou o token GitHub no frontend. A publicação usa a autenticação da Cloudflare; o token do GitHub informado no aplicativo não serve para isso.

## Reconstruir pelo código-fonte

Na pasta `integration`, execute `npm ci`, `npm test` e `npm run build:worker`. O bundle fica em `.worker-build/worker.js`. Para implantar diretamente com `npm run deploy:worker`, revise os `[vars]` de `wrangler.toml`, pois valores declarados no arquivo podem substituir os do painel. O pacote compilado evita isso usando uma configuração mínima.

## Validação e limites

A rota `/chat/vision` exige OAuth de leitura, origem autorizada e ambiente explícito. Aceita até duas imagens PNG/JPEG/WebP, 900 KB cada, pergunta até 8.000 caracteres e corpo total até 2.600.000 bytes. Não carrega dados pelo GitHub, não instancia Store e não oferece ferramentas nem proposta de alteração. URLs de imagens externas não são aceitas. O endpoint encaminha apenas a seleção enviada explicitamente ao modelo, preservando preço máximo zero em modelos gratuitos.

Os testes usam imagens e credenciais sintéticas, com o provedor de IA interceptado. O bundle pode ser compilado sem autenticação Cloudflare; a implantação real exige uma sessão autenticada na conta existente.

## Imagens do clipboard e extração revisável

A configuração agora anuncia `features.vision.extract: true`. `/chat/vision` aceita `output: "text" | "table"` opcional; sem esse campo, o contrato anterior de análise permanece. No modo de extração, a resposta inclui `extraction: {kind:"text",text}` ou `{kind:"table",cells}`, estritamente validada antes do retorno. Limites: texto 12.000 caracteres; tabelas 30×15, 2.000 caracteres por célula, 30.000 no total. O limite de resposta do modelo fica em 6.000 tokens apenas nesse modo. Não há Store, ferramenta de alteração ou novo escopo OAuth. A inserção acontece somente no cliente após revisão explícita, usando a recuperação, o desfazer e o autosave de Notas existentes.
