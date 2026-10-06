# ProjectFlow — Gantt Manager

Aplicativo estático de cronogramas hospedado no GitHub Pages. Os cronogramas são mantidos no navegador enquanto você edita. A integração opcional com GitHub oferece salvamento manual, abertura da última versão e histórico de versões.

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
