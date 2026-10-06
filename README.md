# ProjectFlow — Gantt Manager

Aplicativo estático de cronogramas hospedado no GitHub Pages. Os cronogramas são mantidos no navegador enquanto você edita. A integração opcional com GitHub oferece salvamento manual, abertura da última versão e histórico de versões.

## Planos de ação

A guia **Planos de ação** permite criar vários planos, com ações, responsáveis, início, término, status e observações. **Tabela** e **Cards** mostram os mesmos dados. Ações independentes podem ter suas próprias datas, sem criar tarefas no Gantt.

Para partir de uma linha do cronograma, selecione-a e clique em **＋ Plano / ação vinculada**, ou use essa opção no menu da linha. Escolha um plano existente ou crie um novo: a primeira ação fica vinculada à linha selecionada. Acrescente outras ações independentes ou vinculadas pelo botão **＋ Nova ação**. No formulário da ação, é possível escolher uma linha de qualquer cronograma.

As ações vinculadas compartilham as datas da tarefa, identificada pelo ID do cronograma e da tarefa. Alterar as datas da ação atualiza a tarefa e recalcula o cronograma; alterar a tarefa atualiza a ação. O início de tarefas com dependências e as datas de linhas de resumo continuam calculados pelo Gantt. Marcos têm início e término iguais, e dias úteis seguem a configuração da tarefa. Responsável, status e observações pertencem à ação.

Para desvincular uma ação, edite-a e escolha **Ação independente**: as últimas datas são preservadas e podem ser editadas livremente. Excluir uma ação ou um plano não exclui tarefas. Se uma tarefa ou cronograma for removido, a ação mantém seus dados e mostra o vínculo indisponível; você pode desvincular ou escolher outra tarefa.

Os planos são incluídos em **💾 Salvar**, **Histórico** e **📥 Backup local**. Ao restaurar uma versão, cronogramas e planos são restaurados juntos. Versões antigas criadas antes deste recurso continuam compatíveis; restaurá-las traz apenas os cronogramas, sem planos de ação. Antes da restauração, o app baixa uma cópia local do estado atual.

## Conectar ao GitHub

1. Crie um repositório **privado** (por exemplo, `gantt-backups`), marque **Add a README file** e deixe o GitHub Pages desativado.
2. Em GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens, gere um token. Selecione o proprietário e **Only select repositories**, escolha apenas o repositório de backup e dê **Repository permissions → Contents: Read and write**. Defina uma validade; renove o token quando expirar.
3. No Gantt, clique em **☁ GitHub**, informe `usuário/repositório` e o token e clique em **Conectar / abrir última versão**. Isso abre a última versão existente; não cria um salvamento.
4. Se ainda não existir um arquivo de cronogramas, clique em **💾 Salvar** para criar a primeira versão com seus dados atuais.

O token fica apenas nesta aba por padrão. Para abrir automaticamente a última versão em novas sessões, marque **Lembrar token neste navegador pessoal**; nesse caso o token fica no localStorage. Nunca use um computador compartilhado nem inclua tokens no código ou nos arquivos de backup. Desconectar remove o token deste navegador. Nenhuma conta ou repositório é criado automaticamente.

## Salvar e reabrir

**💾 Salvar** grava todos os cronogramas no arquivo `backups/cronogramas.json` do repositório privado. Cada salvamento com alterações gera um commit e uma entrada no histórico. Clicar sem alterações não cria versões duplicadas. As edições continuam salvas imediatamente no navegador, mas **não são enviadas automaticamente ao GitHub**. Aguarde aparecer **Salvo no GitHub** antes de fechar a página.

Ao abrir o aplicativo conectado, ele busca e abre a última versão do GitHub. Se encontrar alterações locais não salvas, pede confirmação antes de substituí-las e baixa uma cópia local antes de prosseguir. Se você recusar, seus dados locais são preservados; é preciso abrir a última versão para reconectar o salvamento remoto. Falhas de rede e token expirado também preservam os dados locais e aparecem no status. Informe o token ou reconecte no botão **☁ GitHub** quando necessário.

Se outro dispositivo salvar enquanto você edita, a comparação do SHA bloqueia a sobrescrita. Use **📥 Backup local** para guardar suas mudanças antes de conectar e abrir a última versão. Não há mesclagem automática entre dispositivos.

## Histórico e restauração

Clique em **Histórico** para ver os salvamentos, do mais recente ao mais antigo, com data, hora e identificador. **Mais versões** carrega entradas adicionais.

Escolha uma versão e confirme a restauração. O app baixa uma cópia local dos cronogramas atuais, abre a versão escolhida e a salva como **um novo commit**, mantendo todas as versões anteriores. Assim, nas próximas aberturas, essa restauração será a última versão. Se a gravação falhar, a versão restaurada permanece localmente e o status informa que ela ainda não foi salva no GitHub; tente novamente com **💾 Salvar**.

Repositórios públicos e repositórios com GitHub Pages são recusados para evitar publicação dos cronogramas. A integração real depende da configuração de um repositório e token válidos.

## Validação de desenvolvimento

Com Python e Node.js instalados:

```sh
python -m http.server 8765
```

Em outro terminal:

```sh
npm install
npx playwright install chromium
npm test
```

Os testes usam Chromium e respostas simuladas da API do GitHub; não acessam cronogramas reais. Cobrem salvamento exclusivamente manual, histórico com paginação, restauração como novo commit, reabertura da última versão, preservação de alterações locais e proteção contra conflitos e falhas de autenticação.

Os testes de planos de ação cobrem ações independentes e vinculadas, sincronização de datas com cronogramas ativos e inativos, dependências, resumos, marcos, tabela/cards, desvinculação, exclusões, persistência e layout em celular. Os testes de GitHub verificam também salvamento e restauração dos planos e rejeição de planos inválidos.
