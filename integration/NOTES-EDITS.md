# Propostas de edição de Notas

No assistente geral, abra **Notas e imagens**, selecione uma página e clique em **Editar esta nota**. O mesmo modo está disponível em **Notas → Editar com IA** e nos resultados de busca, em **Editar esta página**. A faixa de contexto identifica a página escolhida; **Voltar à consulta** encerra o modo de edição.

Descreva a mudança, revise o antes/depois e clique em **Aplicar nas Notas**. Descartar não modifica os dados. As edições entram pelo editor local e seguem o salvamento automático e o controle SHA já existentes em `NotesCloud`; não há gravação direta pelo modelo no repositório.

## Operações desta etapa

- Texto e listas de verificação; tabelas; título, tipo de fundo e cor do papel.
- Adição de texto, tabelas e formas; movimento e redimensionamento de objetos.
- Correção de descrição/transcrição de imagens, sem trocar os arquivos originais.
- Remoção de objetos com prévia e criação de subpáginas dentro da página selecionada.

A edição fica limitada a uma página existente e às subpáginas criadas por aquela proposta. Não cria pastas/cadernos, não apaga páginas/cadernos e não edita pixels de imagens. O contexto leva textos, tabelas, descrições, OCR e geometria; imagens visuais continuam no fluxo explícito de análise. Para aproveitar uma análise visual, faça-a antes e depois descreva a alteração desejada no modo de edição.

## Revisão, recuperação e conflitos

As propostas expiram em 15 minutos. Uma mudança no conteúdo da página desde a proposta bloqueia a aplicação. O ajuste automático de tamanho das tabelas não é considerado uma edição manual; posição, conteúdo e largura mínima continuam protegidos.

Antes de aplicar ou desfazer, uma cópia durável é criada em `LocalRecovery`. Se isso falhar, a alteração não é aplicada. **Desfazer última alteração nas Notas** guarda até 10 aplicações nesta sessão, preserva edições em outras páginas e recusa sobrescrever edições posteriores na página afetada. Criar novos descendentes de uma subpágina também impede um desfazer que a removeria. O histórico de Restaurações continua disponível após recarregar o aplicativo; restaurá-lo usa o fluxo de backup geral existente.

## Serviço

`POST /chat/notes` exige OAuth com `projectflow:read` e `projectflow:write`, origem autorizada e ambiente habilitado. O limite HTTP permanece em 100 KB. A página selecionada tem limite de 60 KB e 200 objetos, com até 20 operações por proposta. Não há truncamento silencioso de conteúdo editável: páginas maiores precisam ser divididas.

O serviço chama somente o modelo selecionado, sem ferramentas de domínio nem instância de Store, e valida a resposta com o mesmo núcleo de operações usado no navegador. Modelos gratuitos mantêm preço máximo zero. Não há repetição automática após falha. A capacidade é anunciada por `features.notesEdit.version: 1` em `/chat/config`; até a publicação do Worker, o modo fica indisponível no frontend.

Os testes de serviço e navegador usam respostas de IA, OAuth e GitHub simulados. Cobrem prévia, descarte, aplicação, desfazer, cópia de recuperação e falha, conflitos, isolamento Trabalho/Pessoal, arquivos imutáveis de imagem, sincronização e celular.
