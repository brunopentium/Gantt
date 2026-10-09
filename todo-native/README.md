# TaskMaster integrado

Interface adaptada de [brunopentium/Todo-list](https://github.com/brunopentium/Todo-list), commit `66d829f`, e conferida com o HTML publicado pelo Apps Script em 2026-10-08. A versão publicada inclui **Reserva** nas opções de status e exclui reservas dos alertas de deadline, estatísticas pendentes, planejamento e reprogramação em massa. Esses ajustes foram preservados.

`app.jsx` conserva a interface e as funções de tarefas do original. A persistência do Apps Script foi substituída pelo armazenamento local do Gantt através de `backend.js`; os controles de GitHub e backup geral pertencem ao aplicativo principal. O documento interno servido pelo mesmo site isola os estilos do TaskMaster dos estilos dos cronogramas e planos. A janela antiga do Google permanece independente.

A compilação usa React 18.3.1, Lucide React 0.468.0, Tailwind 3.4.19 e esbuild 0.25.12. Os SVGs são componentes React, com os mesmos ícones do original. JSX e CSS são compilados antecipadamente, com dependências incluídas no site. `app.js.LEGAL.txt` contém os avisos de licença das dependências.

Execute `npm run build:todo` na raiz para atualizar `app.js`, `app.css` e os avisos de licença. `tests/todo-native.cjs` verifica os controles e a persistência; `tests/todo-cloud.cjs` verifica salvamento manual, carregamento entre dispositivos, histórico e proteção contra conflitos.

As datas de execução e deadline nos cartões abrem o calendário nativo no primeiro clique ou toque. `tests/todo-date-picker.cjs` verifica a abertura imediata, persistência e compatibilidade quando o navegador não oferece `showPicker`.
