# ProjectFlow — Gantt Manager

Aplicativo estático de cronogramas hospedado no GitHub Pages. As edições são mantidas no navegador enquanto você trabalha. A integração opcional com GitHub oferece salvamento automático, abertura da última versão e histórico de versões para cronogramas, planos de ação e Task.

## Task e navegação

A ordem das guias é **Meu dia → Task → Planos de ação → Cronogramas**. **Meu dia** é sempre a tela inicial. **Task** é o nome da antiga guia Todo novo e executa o TaskMaster no próprio site, com os mesmos Dashboard, Conflitos, Planejamento, Configurações, filtros, edição direta, notas, subtarefas, recorrências, prioridades, projetos e reprogramação em massa. O status **Reserva** mantém o comportamento da versão publicada do Google.

O **Todo antigo** do Google está oculto, com seu código e endereço preservados. Para reativá-lo, abra **Meu dia → Configurar meus nomes**, marque **Mostrar a guia Todo antigo (Google)** e clique em **Salvar configurações**. A preferência fica neste navegador; o Google só é carregado quando você abre essa guia. Desmarcar a opção volta a ocultá-la.

As tarefas e configurações do Task são gravadas automaticamente neste navegador. Com **Salvar automaticamente** ativo e o GitHub conectado, alterações são enviadas após 20 segundos sem editar. **💾 Salvar** envia imediatamente todo o Task para `backups/todo.json`, no mesmo repositório privado e com o mesmo token dos cronogramas e planos. O app verifica a versão remota ao abrir, mesmo antes de entrar na guia Task. **Histórico** consulta apenas versões do Task; restaurar guarda uma cópia interna e cria uma nova versão. Conflitos entre dispositivos, falhas de autenticação e arquivos inválidos preservam a cópia local. Os três históricos e arquivos remotos permanecem separados.

**Backup do Todo** baixa todas as tarefas e configurações, incluindo concluídas, canceladas e reservas. **Configurações → Exportar Backup / Restaurar Backup** mantém o formato JSON do Todo original (`tasks`, `projects`, `config`) e também aceita o backup novo. Assim é possível transferir tarefas do Google usando o botão existente. Após a migração, as duas guias têm dados independentes; alterações em uma não são propagadas para a outra.

**Backup geral**, disponível no Task e em Meu dia, baixa um único JSON com todos os cronogramas e grupos, todos os planos e subplanos e todas as tarefas/configurações do Task. Inclui os dados completos, independentemente dos filtros e níveis recolhidos, e não inclui credenciais. **Restaurar geral** valida as três áreas antes de aplicar, pede confirmação e guarda uma cópia interna da versão atual em **Restaurações**. Com salvamento automático ativo e as áreas conectadas, as alterações restauradas são enviadas ao GitHub após o período de espera; com ele desligado, use Salvar em cada área. A guia do Google continua independente desse arquivo.

Para reconstruir os arquivos estáticos do Todo, rode `npm ci` e `npm run build:todo`. O código da interface está em `todo-native/app.jsx`; React, os ícones e o CSS são incluídos nos arquivos gerados, sem dependência de CDNs durante o uso. A origem e os ajustes estão documentados em `todo-native/README.md`.

## Planos de ação

As áreas de **Planos de ação** e **Cronogramas** usam textos gerados em inglês para permitir capturas de tela e impressão: cabeçalhos, status, indicadores, filtros, controles, PDFs e Excel. Títulos, responsáveis, descrições e observações cadastrados pelo usuário permanecem como foram escritos; os códigos internos de status e os formatos dos backups continuam compatíveis. A interface do Task permanece em português.

A guia **Planos de ação** permite criar vários planos, com ações, responsáveis, início, término, status e observações. **Tabela** e **Cards** mostram os mesmos dados. Ações independentes podem ter suas próprias datas, sem criar tarefas no Gantt.

Para partir de uma linha do cronograma, selecione-a e clique em **＋ Plano / ação vinculada**, ou use essa opção no menu da linha. Escolha um plano existente ou crie um novo: a primeira ação fica vinculada à linha selecionada. Acrescente outras ações independentes ou vinculadas pelo botão **＋ Nova ação**. No formulário da ação, é possível escolher uma linha de qualquer cronograma.

As ações vinculadas compartilham as datas da tarefa, identificada pelo ID do cronograma e da tarefa. Alterar as datas da ação atualiza a tarefa e recalcula o cronograma; alterar a tarefa atualiza a ação. O início de tarefas com dependências e as datas de linhas de resumo continuam calculados pelo Gantt. Marcos têm início e término iguais, e dias úteis seguem a configuração da tarefa. Responsável, status e observações pertencem à ação.

Para desvincular uma ação, edite-a e escolha **Ação independente**: as últimas datas são preservadas e podem ser editadas livremente. Excluir uma ação ou um plano não exclui tarefas. Se uma tarefa ou cronograma for removido, a ação mantém seus dados e mostra o vínculo indisponível; você pode desvincular ou escolher outra tarefa.

### Comandos próprios dos planos

A barra da guia tem **💾 Salvar**, **Histórico**, **☁ GitHub**, **Backup dos planos**, **Exportar JSON**, **Importar JSON**, **Excel**, **PDF**, **Desfazer**, **Tema**, **Observações** e zoom. Também há novo plano, duplicar, renomear/editar e excluir plano, além de criar, editar, duplicar e excluir ações. Tema e desfazer dos planos são independentes dos controles do Gantt.

- **Salvar / Histórico:** gravam todos os planos em `backups/planos-de-acao.json`, com histórico próprio. Usam a conexão existente e não exigem um novo token. O salvamento automático também cria o arquivo na primeira utilização; Salvar permite enviá-lo imediatamente. O salvamento dos cronogramas continua em `backups/cronogramas.json`.
- **Exportar JSON:** exporta apenas o plano selecionado. **Backup dos planos** exporta todos os planos, sem cronogramas ou credenciais.
- **Importar JSON:** aceita um plano ou um backup de planos e acrescenta cópias com IDs novos, preservando planos e cronogramas existentes. Também aceita os planos presentes em backups antigos completos. Datas vinculadas seguem as tarefas correspondentes que existirem no app.
- **Histórico dos planos:** restaura somente os planos como uma nova versão e guarda uma cópia interna antes. Tarefas vinculadas podem receber as datas restauradas; nomes, hierarquia e tarefas sem vínculo são mantidos. **Histórico anterior** permite recuperar apenas os planos de versões antigas que eram salvas junto com os cronogramas.
- **Desfazer:** mantém até 50 alterações dos planos na sessão, incluindo as datas vinculadas alteradas por uma edição de ação. Importações e duplicações também podem ser desfeitas.

Na migração do formato anterior, planos locais não salvos (inclusive exclusões) são preservados; a versão anterior remota é adotada automaticamente apenas quando a cópia local estava salva. Na reabertura, o app carrega as duas versões separadamente. Para datas compartilhadas, o salvamento mais recente entre cronogramas e planos prevalece, respeitando dependências, resumos e dias úteis. Datas de tarefas já salvas pelos planos não geram um aviso falso de alterações pendentes no Gantt; alterações não relacionadas continuam protegidas. Excluir ou importar planos não substitui os cronogramas, e importar/restaurar cronogramas mantém os planos.

### Documento do plano de ação

A tela usa blocos com título do plano, responsáveis com iniciais e cores consistentes, status coloridos, datas destacadas e indicadores de conclusão, atraso e bloqueio. Clique em responsável, término ou status para alterar diretamente na tabela ou nos cards; o círculo da ação conclui ou reabre a ação. Datas vinculadas continuam seguindo as regras do cronograma.

**＋ Adicionar seção** permite incluir **Participantes**, **Agenda** e **Notas** no plano selecionado. Participantes e assuntos da agenda são escritos um por linha. Cada seção pode ser editada ou removida pelos ícones ao lado do título; Desfazer recupera uma remoção. Sem essas seções, o documento vai direto às ações. Seções são próprias de cada plano, entram em importação, backup, duplicação, salvamento e histórico. O tema claro é o padrão para planos sem preferência de tema, e o botão Tema permite alternar para escuro.

### Filtro por status dos planos

O flag **Ocultar concluídas, bloqueadas e canceladas** combina pendentes e ações em andamento, tanto na tabela como nos cards. Ele fica salvo neste navegador e reaplica a ocultação ao abrir o app. Quem usava a opção anterior **Ocultar concluídas e bloqueadas** recebe o flag marcado automaticamente.

Novas ações que atendem ao filtro aparecem imediatamente. Se uma ação visível mudar de status, ela permanece na tela com o novo status até **Atualizar filtro**. O PDF usa exatamente essas ações exibidas, incluindo as recém-concluídas, bloqueadas ou canceladas. Ao recarregar o app, as exceções temporárias são descartadas e o flag salvo volta a ocultar os três status. Trocar o filtro ou o flag também reaplica a seleção.

**Filtrar por status** permite mostrar todos ou apenas um status, além das opções individuais de ocultar concluídas ou bloqueadas. Para consultar somente concluídas, bloqueadas ou canceladas, desmarque o flag. O filtro respeita o plano e **Incluir subplanos**. **Cancelada** está disponível nos formulários e na edição direta, entra em JSON, backups, histórico, PDF e Excel, e não é contada como atraso.

### Excel e PDF dos planos

**Excel** exporta o plano selecionado em um template `.xlsx` com abas **Summary** e **Actions**; a aba **Context** é incluída quando participantes, agenda ou notas estão preenchidos. O resumo tem indicadores de total, status, atrasos e percentual concluído. A tabela tem filtros, cabeçalho congelado, linhas alternadas, responsáveis, datas reais do Excel, duração, status, prazo, vínculos e observações. Fórmulas recalculam duração, prazo e indicadores; status tem lista de seleção e atrasos recebem destaque. O arquivo usa layout de impressão em paisagem. Texto digitado pelo usuário permanece texto, mesmo quando começa com `=`.

**PDF** abre a impressão do navegador com um relatório do plano, cabeçalho, seções opcionais preenchidas, indicadores e tabela; selecione Salvar como PDF. Excel e PDF são relatórios independentes da aba do cronograma. Alterações feitas no Excel não são sincronizadas com o app; o formato de reimportação é JSON.

## Meu dia

A guia **Meu dia**, primeira guia e tela inicial, reúne todos os planos e subplanos, todos os cronogramas e o Todo integrado. A data inicial usa o dia local do dispositivo; as setas e o calendário permitem revisar outra data. O Todo antigo do Google continua independente.

Os cartões **Para hoje**, **Atrasados**, **Próximos 7 dias** e **Bloqueados**, além da visão **Sem prazo**, abrem listas filtráveis por origem e busca. **Para fazer** reúne suas ações e seus Todos. **Para cobrar** mostra ações atribuídas a outras pessoas. Ações sem responsável ficam em uma seção própria. Em **Configurar meus nomes**, ajuste os nomes usados para identificar sua responsabilidade; os valores iniciais são Bruno e Bruno Souza. A identificação aceita acentos, variações de maiúsculas e responsáveis compartilhados, mas não considera Bruno Silva como Bruno.

O Todo distingue **data programada** e **prazo final**, incluindo reagendamentos em dias úteis. Concluídos, cancelados e tarefas em reserva ficam fora das listas de trabalho. Uma ocorrência recorrente pode ser avançada seguindo as regras do Todo. As ações usam sua data de término como prazo. Os caminhos mostram o plano ou subplano de origem, e vínculos explícitos com o cronograma são identificados.

**Cronogramas** tem uma área separada: **Iniciando no dia**, **Finalizando no dia**, **Previstas em andamento** e **Término atrasado**. Toque em um indicador para consultar as atividades, com busca, seleção de cronograma e páginas de 20 itens. Somente tarefas executáveis e marcos abertos entram nos indicadores; grupos e linhas de resumo não são contados novamente. A previsão de andamento considera o intervalo planejado, sem afirmar que houve execução real. Tarefas recolhidas no cronograma também são consideradas pelo painel do dia.

Altere status ou data diretamente nas listas ou use **Editar** para título, responsável, datas, observações, prioridade do Todo ou progresso do cronograma. As alterações são aplicadas ao registro original e respeitam dependências, marcos e dias úteis. Clicar no caminho abre o item na guia de origem. Um item editado permanece na seleção até **Atualizar painel** ou mudar a data; novos itens que atendem às regras aparecem automaticamente.

As alterações são salvas no navegador e entram no salvamento automático da área original. Para enviar imediatamente, use **Salvar no GitHub** no painel e escolha a área alterada. **Backup geral** exporta o conteúdo completo das três áreas integradas. A tela se adapta ao celular, com rolagem da página e acesso a todas as listas.

## Conectar ao GitHub

1. Crie um repositório **privado** (por exemplo, `gantt-backups`), marque **Add a README file** e deixe o GitHub Pages desativado.
2. Em GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens, gere um token. Selecione o proprietário e **Only select repositories**, escolha apenas o repositório de backup e dê **Repository permissions → Contents: Read and write**. Defina uma validade; renove o token quando expirar.
3. No Gantt, clique em **☁ GitHub**, informe `usuário/repositório` e o token e clique em **Conectar / abrir última versão**. Isso abre a última versão existente; não cria um salvamento.
4. Com **Salvar automaticamente** ativo, aguarde o envio da primeira versão. **💾 Salvar** cria essa versão imediatamente.

O token fica apenas nesta aba por padrão. Para abrir automaticamente a última versão em novas sessões, marque **Lembrar token neste navegador pessoal**; nesse caso o token fica no localStorage. Nunca use um computador compartilhado nem inclua tokens no código ou nos arquivos de backup. Desconectar remove o token deste navegador. Nenhuma conta ou repositório é criado automaticamente.

## Salvar e reabrir

A barra comum às guias oferece **Salvar automaticamente**, o status do salvamento, **Criar ponto de restauração** e **Restaurações**. O salvamento automático fica ativo por padrão; a preferência é mantida neste navegador. Com GitHub conectado, o app espera **20 segundos sem editar** e envia somente as áreas alteradas, uma por vez. **💾 Salvar** continua disponível para enviar imediatamente. Desligar o automático mantém as edições no navegador e permite trabalhar com os botões Salvar.

Cada área conserva seu arquivo: `backups/cronogramas.json`, `backups/planos-de-acao.json` e `backups/todo.json`. Cada envio com alterações gera um commit e uma entrada no histórico da área. Clicar em Salvar sem alterações não cria versões duplicadas. A barra mostra alterações pendentes, envio em andamento, dados salvos, ausência de conexão ou problemas que precisam de atenção. Aguarde **Salvo no GitHub** para confirmar que a versão remota foi atualizada.

Ao reabrir, o app verifica a última versão do GitHub. Se o arquivo remoto continua na versão conhecida, as alterações locais ainda pendentes são mantidas para o próximo envio. Se existirem mudanças locais e uma versão remota diferente, a sincronização para e oferece **Resolver sincronização**. A abertura de uma versão remota diferente deve ser escolhida na conexão do GitHub; antes da substituição, o app guarda uma cópia interna dos dados atuais. Abrir o site, salvar e restaurar não baixam arquivos JSON automaticamente.

Sem internet, as alterações permanecem neste navegador. O app tenta novamente quando a conexão volta; falhas temporárias também têm nova tentativa automática. Token inválido, falta de acesso e conflitos entre dispositivos exigem resolver a conexão. A comparação do SHA bloqueia a sobrescrita de uma versão remota que mudou enquanto você editava. Não há mesclagem automática entre dispositivos.

## Histórico e restauração

Clique em **Histórico** para ver os salvamentos, do mais recente ao mais antigo, com data, hora e identificador. **Mais versões** carrega entradas adicionais.

Escolha uma versão e confirme a restauração. O app guarda uma cópia interna dos dados atuais, abre a versão escolhida e a salva como **um novo commit**, mantendo todas as versões anteriores. Assim, nas próximas aberturas, essa restauração será a última versão. Se a gravação falhar, a versão restaurada permanece localmente e o status informa que ela ainda não foi salva no GitHub; o automático pode repetir o envio após uma falha temporária, ou você pode tentar com **💾 Salvar**. Todos os commits continuam disponíveis nos históricos das respectivas áreas, incluindo os envios automáticos.

**Restaurações**, na barra comum, mostra cópias completas das três áreas guardadas em IndexedDB neste navegador. O app mantém até **30 cópias**; os **10 pontos nomeados mais recentes** têm prioridade de retenção. Uma cópia é guardada antes de carregar dados do GitHub ou restaurar versões. **Criar ponto de restauração** permite guardar o estado atual com um nome, por exemplo, “Antes de revisar os prazos”. Restaurar uma cópia interna aplica as três áreas e guarda primeiro outra cópia do estado atual.

As cópias internas pertencem a este navegador e não acompanham outro dispositivo. Os históricos do GitHub oferecem recuperação das versões enviadas entre dispositivos. Para obter um arquivo portátil, use explicitamente **Backup geral**, o backup da área ou **Baixar JSON** em Restaurações. Nenhuma dessas cópias inclui o token.

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

Os testes usam Chromium e respostas simuladas da API do GitHub; não acessam cronogramas reais. Cobrem salvamento manual e automático, espera após edição, histórico com paginação, restauração como novo commit, reabertura da última versão, cópias internas, ausência de downloads automáticos, preservação de alterações locais e proteção contra conflitos e falhas de autenticação.

Os testes de planos de ação cobrem ações independentes e vinculadas, sincronização de datas com cronogramas ativos e inativos, dependências, resumos, marcos, tabela/cards, desvinculação, exclusões, persistência e layout em celular. Os testes adicionais verificam controles próprios, históricos e arquivos separados, reuso das credenciais, importação/exportação, backup, desfazer, duplicação, prioridade das datas compartilhadas e recuperação do histórico anterior. Nenhum teste usa dados reais do usuário.

Para verificar o Excel baixado pelos testes, com `openpyxl` instalado, rode `python tests/validate-plan-excel.py`. A verificação cobre estrutura XML, abas, datas, fórmulas e valores em cache, tabela/filtros, estilos, validação, impressão e preservação de texto literal.


## Planos e subplanos

Na guia **Planos de ação**, use **Novo subplano** para criar um filho do plano selecionado. Em **Renomear / editar → Plano pai**, você pode mover um plano existente para outro ramo ou torná-lo principal. O app impede relações circulares.

Abra **Árvore de planos**: passar o mouse sobre um plano revela seus filhos; no celular, toque na seta. Selecionar um pai reúne suas ações e as de todos os descendentes. **Incluir subplanos** permite alternar entre esse conjunto e apenas as ações diretas. O caminho abaixo de cada ação mostra seu plano de origem; editar uma ação agregada altera a original.

A hierarquia acompanha o salvamento local e os backups dos planos. **Exportar JSON** e **Duplicar ramo** incluem os descendentes; Excel usa todas as ações do ramo selecionado; PDF usa as ações exibidas, respeitando o filtro por status. Excluir um plano mantém seus subplanos, movendo-os para o nível acima. **Desfazer** restaura a estrutura anterior.


## Navegação dos cronogramas no celular

No celular, tanto em retrato como em paisagem, a página rola até a última tarefa. No cronograma individual, arraste para os lados para navegar pela tabela e pelas barras juntas; os atalhos **Tabela** e **Barras** permanecem acessíveis durante a rolagem. O gesto com dois dedos amplia a página inteira. Os botões **＋Z / －Z** continuam ajustando a escala das datas. A visão agrupada também usa a rolagem vertical da página, com movimento horizontal na linha do tempo. O layout e a rolagem do desktop permanecem iguais.

## Impressão / PDF

O botão **PDF** permite escolher **Retrato / Paisagem** e **Páginas na altura** (1 a 50), mantendo **uma página na largura** com todo o período do Gantt. O app sugere uma quantidade de páginas para preservar a leitura. As linhas visíveis são exportadas, incluindo as que ficam fora da tela ao rolar. Descendentes de níveis recolhidos ficam fora do PDF; tabela e barras compartilham a mesma escala e as mesmas linhas. Cada página repete o título, as colunas, o período e a numeração. A janela de impressão mantém a opção de trocar a orientação. Para aproveitar melhor o papel, use a mesma orientação escolhida no relatório. A impressão dos grupos usa essa mesma configuração e respeita a busca, os filtros e a expansão de grupos, cronogramas e níveis internos de tarefas.

Na guia **Planos de ação**, **PDF** também permite escolher orientação e páginas na altura, mantendo uma página na largura. A sugestão de páginas considera o tamanho real das ações e dos textos. O relatório inclui as ações exibidas após o filtro por status e os subplanos conforme **Incluir subplanos**, além de participantes, agenda, notas, responsáveis, datas, status, prazos e vínculos. As colunas e o título se repetem nas páginas seguintes. Observações muito extensas continuam em novas linhas, sem truncar o texto. Planos e tarefas originais são preservados durante a preparação e impressão.

## Grupos de cronogramas

Na guia **Cronogramas**, **Novo grupo** cria um agrupamento no nível principal e já marca o item atual para ficar dentro dele. Marque outros cronogramas para reuni-los sob esse grupo. **Subgrupo** é uma opção separada para criar um grupo dentro do grupo atual; **Subcronograma** cria um cronograma filho. Use **Editar / mover** para escolher o pai de um cronograma já existente. A **Árvore de cronogramas** revela os filhos com o mouse ou pelas setas no celular; escolher um pai reúne todo o ramo. Um cronograma também pode ter filhos sem perder suas tarefas diretas.

**Expandir tudo / Recolher tudo**, ao lado da árvore, controla todos os níveis de tarefas no cronograma individual. Na visão consolidada, os mesmos botões abrem ou recolhem todos os cronogramas, subgrupos e níveis internos de tarefas do ramo mostrado. Cada tarefa de resumo também tem sua própria seta para controlar os filhos sem sair da visão agrupada; clicar no nome ou na barra continua abrindo o cronograma de origem. A expansão é independente por cronograma e não modifica as tarefas de origem nem os indicadores. Os PDFs respeitam os níveis expandidos e recolhidos da visualização.

Ao criar ou editar um **grupo**, use a lista de caixas de seleção para reunir vários cronogramas e subgrupos de uma vez. O botão **Selecionar cronogramas** também abre essa lista. Os membros atuais já aparecem marcados; marcar outro mantém as escolhas anteriores. Subgrupos levam seus descendentes, sem achatar a árvore. Se um grupo estiver dentro de um cronograma que deveria reunir, marque esse cronograma: o grupo sobe automaticamente e passa a contê-lo, preservando as tarefas e evitando ciclos. Desmarcar um membro atual o move para o nível acima. Cada item tem um único pai; o campo **Colocar este grupo/cronograma dentro de** muda sua posição na árvore.

**Incluir subcronogramas** alterna entre a visão consolidada e o cronograma individual. A consolidação mostra uma linha do tempo comum, período total, atrasos e progresso ponderado pela duração das tarefas executáveis (marcos têm peso 1); tarefas de resumo não são contadas novamente. Os caminhos críticos são calculados separadamente em cada origem. Busca e filtros ajudam a comparar as entregas.

Clique em uma tarefa consolidada para abrir e editar seu cronograma de origem. Os IDs e as dependências permanecem locais ao cronograma; a análise não cria cópias de tarefas nos grupos. Excel exporta o ramo completo. PDF exporta as linhas visíveis após busca, filtros e recolhimento, mantendo as barras de resumo e a numeração do relatório completo. Os índices de dependências são ajustados apenas no relatório. JSON, backup local e histórico do GitHub preservam a árvore. **Duplicar** copia o ramo; excluir um grupo mantém seus filhos no nível acima.
