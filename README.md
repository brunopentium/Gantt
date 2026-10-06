# ProjectFlow — Gantt Manager

Aplicativo estático de cronogramas hospedado no GitHub Pages. Os cronogramas continuam salvos no navegador; o backup no GitHub é opcional.

## Ativar o backup automático

1. Crie um repositório **privado** (por exemplo, `gantt-backups`), marque **Add a README file** e deixe o GitHub Pages desativado.
2. Em GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens, gere um token. Selecione o proprietário e **Only select repositories**, escolha apenas o repositório de backup e dê **Repository permissions → Contents: Read and write**. Defina uma validade; renove o token quando expirar.
3. No Gantt, clique em **☁ GitHub**, informe `usuário/repositório` e o token e clique em **Salvar e ativar**.
4. O backup inicial é imediato. Depois, alterações são agrupadas e salvas até um minuto após a primeira alteração pendente. Mantenha a página aberta até aparecer **Backup salvo**.

O arquivo `backups/cronogramas.json` contém todos os cronogramas. O histórico de commits preserva versões anteriores. O token fica apenas nesta aba, salvo se você marcar **Lembrar token neste navegador pessoal**; nesse caso ele fica no localStorage. Nunca inclua tokens no código ou nos arquivos de backup. Desconectar remove o token deste navegador.

## Restaurar e usar outro dispositivo

No outro navegador, configure o mesmo repositório e token e clique em **Restaurar**. Confirme a substituição dos cronogramas locais. Antes da restauração, o app baixa um backup local dos dados atuais.

Se o arquivo remoto já existir, um navegador que ainda não o restaurou não o sobrescreve. Se outro dispositivo atualizar o arquivo, o app interrompe o backup e pede restauração. Exporte as mudanças locais antes de restaurar caso queira preservá-las. O recurso é backup com proteção contra conflitos, sem mesclagem automática entre dispositivos.

Falhas de rede, token expirado e falta de permissão aparecem ao lado do botão. As alterações locais permanecem no navegador. Para tentar novamente, clique em **Salvar e ativar**; o retorno da conexão também tenta retomar backups pendentes. A gravação remota depende de internet e de manter o app aberto. O botão **💾 All** continua disponível para backup manual.

Repositórios públicos e repositórios com GitHub Pages são recusados para evitar publicação dos cronogramas. Nenhuma conta ou repositório é criado automaticamente.

## Validação de desenvolvimento

Com Node.js e Playwright instalados:

```sh
python -m http.server 8765
```

Em outro terminal:

```sh
npm install
npx playwright install chromium
npm test
```

Os testes usam respostas simuladas da API do GitHub e não acessam backups reais.
