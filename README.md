# ProjectFlow — Gantt Manager

Aplicativo estático de cronogramas hospedado no GitHub Pages. Os cronogramas são mantidos no navegador enquanto você edita. A integração opcional com GitHub oferece salvamento manual, abertura da última versão e histórico de versões.

## Planos de ação

A guia **Planos de ação** permite criar vários planos, com ações, responsáveis, início, término, status e observações. **Tabela** e **Cards** mostram os mesmos dados. Ações independentes podem ter suas próprias datas, sem criar tarefas no Gantt.

Para partir de uma linha do cronograma, selecione-a e clique em **＋ Plano / ação vinculada**, ou use essa opção no menu da linha. Escolha um plano existente ou crie um novo: a primeira ação fica vinculada à linha selecionada. Acrescente outras ações independentes ou vinculadas pelo botão **＋ Nova ação**. No formulário da ação, é possível escolher uma linha de qualquer cronograma.

As ações vinculadas compartilham as datas da tarefa, identificada pelo ID do cronograma e da tarefa. Alterar as datas da ação atualiza a tarefa e recalcula o cronograma; alterar a tarefa atualiza a ação. O início de tarefas com dependências e as datas de linhas de resumo continuam calculados pelo Gantt. Marcos têm início e término iguais, e dias úteis seguem a configuração da tarefa. Responsável, status e observações pertencem à ação.

Para desvincular uma ação, edite-a e escolha **Ação independente**: as últimas datas são preservadas e podem ser editadas livremente. Excluir uma ação ou um plano não exclui tarefas. Se uma tarefa ou cronograma for removido, a ação mantém seus dados e mostra o vínculo indisponível; você pode desvincular ou escolher outra tarefa.

### Comandos próprios dos planos

A barra da guia tem **💾 Salvar**, **Histórico**, **☁ GitHub**, **Backup dos planos**, **Exportar JSON**, **Importar JSON**, **Excel**, **PDF**, **Desfazer**, **Tema**, **Observações** e zoom. Também há novo plano, duplicar, renomear/editar e excluir plano, além de criar, editar, duplicar e excluir ações. Tema e desfazer dos planos são independentes dos controles do Gantt.

- **Salvar / Histórico:** gravam todos os planos em `backups/planos-de-acao.json`, com histórico próprio. Usam a conexão existente e não exigem um novo token. Na primeira utilização, clique em Salvar para criar o arquivo. O salvamento dos cronogramas continua em `backups/cronogramas.json`.
- **Exportar JSON:** exporta apenas o plano selecionado. **Backup dos planos** exporta todos os planos, sem cronogramas ou credenciais.
- **Importar JSON:** aceita um plano ou um backup de planos e acrescenta cópias com IDs novos, preservando planos e cronogramas existentes. Também aceita os planos presentes em backups antigos completos. Datas vinculadas seguem as tarefas correspondentes que existirem no app.
- **Histórico dos planos:** restaura somente os planos como uma nova versão e baixa uma cópia local antes. Tarefas vinculadas podem receber as datas restauradas; nomes, hierarquia e tarefas sem vínculo são mantidos. **Histórico anterior** permite recuperar apenas os planos de versões antigas que eram salvas junto com os cronogramas.
- **Desfazer:** mantém até 50 alterações dos planos na sessão, incluindo as datas vinculadas alteradas por uma edição de ação. Importações e duplicações também podem ser desfeitas.

Na reabertura, o app carrega as duas versões separadamente. Para datas compartilhadas, o salvamento mais recente entre cronogramas e planos prevalece, respeitando dependências, resumos e dias úteis. Datas de tarefas já salvas pelos planos não geram um aviso falso de alterações pendentes no Gantt; alterações não relacionadas continuam protegidas. Excluir ou importar planos não substitui os cronogramas, e importar/restaurar cronogramas mantém os planos.

### Excel e PDF dos planos

**Excel** exporta o plano selecionado em um template `.xlsx` com abas **Resumo** e **Ações**. O resumo tem indicadores de total, status, atrasos e percentual concluído. A tabela tem filtros, cabeçalho congelado, linhas alternadas, responsáveis, datas reais do Excel, duração, status, prazo, vínculos e observações. Fórmulas recalculam duração, prazo e indicadores; status tem lista de seleção e atrasos recebem destaque. O arquivo usa layout de impressão em paisagem. Texto digitado pelo usuário permanece texto, mesmo quando começa com `=`.

**PDF** abre a impressão do navegador com um relatório do plano, cabeçalho, indicadores e tabela; selecione Salvar como PDF. Excel e PDF são relatórios independentes da aba do cronograma. Alterações feitas no Excel não são sincronizadas com o app; o formato de reimportação é JSON.

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

Os testes de planos de ação cobrem ações independentes e vinculadas, sincronização de datas com cronogramas ativos e inativos, dependências, resumos, marcos, tabela/cards, desvinculação, exclusões, persistência e layout em celular. Os testes adicionais verificam controles próprios, históricos e arquivos separados, reuso das credenciais, importação/exportação, backup, desfazer, duplicação, prioridade das datas compartilhadas e recuperação do histórico anterior. Nenhum teste usa dados reais do usuário.

Para verificar o Excel baixado pelos testes, com `openpyxl` instalado, rode `python tests/validate-plan-excel.py`. A verificação cobre estrutura XML, abas, datas, fórmulas e valores em cache, tabela/filtros, estilos, validação, impressão e preservação de texto literal.
