# Notas

A guia Notas fica depois de Cronogramas. Pastas contêm pastas/cadernos; cadernos contêm páginas e páginas podem conter subpáginas. Selecione o caderno para criar páginas irmãs; selecione uma página para criar uma subpágina. A árvore pode ser recolhida e o modo foco aumenta a área útil. A busca fica na lateral e também pode ser aberta pelo menu no modo foco. Salvar e backup fica no cabeçalho, junto de Assistente e Modo foco; as ferramentas se distribuem em linhas compactas sem rolagem horizontal.

## Uso pela interface

- Texto: clique em Texto ou dê dois cliques num local vazio. O texto continua editável e pesquisável. Selecione-o para alterar cor, tamanho ou negrito. Lista acrescenta marcadores de verificação. No modo Navegar, clique no quadradinho para concluir: ele fica preto com X e o texto recebe um risco. Clique novamente para reabrir; listas antigas com ☐ também funcionam. No modo Selecionar, o conteúdo continua editável como texto.
- Tabela: escolha o número de linhas/colunas e se deseja cabeçalho. Edite as células diretamente no modo Selecionar; a tabela cresce com o conteúdo. Ao selecioná-la, use + Linha/+ Coluna ou Remover linha/coluna, relativos à última célula ativa. Até 100 linhas e 30 colunas; o conteúdo também aparece na pesquisa, no contexto do assistente, na impressão e no backup.
- Imagem: use Imagem, arraste um arquivo ou cole uma captura com Ctrl+V. PNG, JPEG e WebP são aceitos. Imagens são normalizadas para até 1800 pixels no maior lado e até 900 KB; anexos maiores que 25 MB são recusados antes do processamento.
- Lápis, marca-texto, reta, seta, retângulo e círculo: escolha a ferramenta e arraste. Borracha remove o objeto tocado. Desfazer/refazer funciona durante a sessão.
- Selecionar: escolha um objeto; arraste o controle de mover ou redimensionar. Detalhes permite editar texto, posição, tamanho, rotação, descrição/transcrição da imagem e camada. Duplicar cria outro objeto.
- Navegar permite rolar com o dedo sem desenhar. Zoom varia de 20% a 300%; Ajustar à tela mostra a largura da página. A área cresce quando objetos são movidos para mais longe.
- Pesquisa: use o campo Buscar nas notas no menu lateral. Digite e pressione Enter/Buscar. Restrinja a qualquer pasta, caderno ou página pelo seletor. Resultados apresentam caminho e trecho. Abra imagens pela própria página para inspecioná-las ampliadas.

## Pesquisa de imagens e assistente

A busca inclui texto digitado, tabelas, títulos, descrições e transcrições das imagens. Selecione uma imagem e use **Ler texto da imagem** (ou abra a imagem) para reconhecer seu texto em português, inglês ou ambos. O resultado fica em um rascunho ao lado da imagem: corrija e clique em Salvar para torná-lo pesquisável. Cancelar, falhas no download e leituras vazias preservam a transcrição anterior. Fechar durante a leitura encerra o worker, inclusive durante os downloads. Uma nova leitura solicita confirmação quando existe texto no rascunho. Se o conteúdo mudar por restauração enquanto a revisão estiver aberta, o salvamento pede que a imagem seja reaberta para preservar a alteração mais recente.

O reconhecimento usa Tesseract.js 6.0.1 / Tesseract.js-core 6.0.0 (Apache-2.0). O motor e os idiomas são baixados sob demanda, de `cdn.jsdelivr.net` e `tessdata.projectnaptha.com`; a primeira leitura depende de conexão a esses endereços e pode demorar. A imagem é processada no próprio dispositivo, sem upload para serviço de OCR nem consumo de créditos de IA. Os idiomas usam cache no IndexedDB; a disponibilidade offline do aplicativo inteiro não é garantida. Uma única imagem é processada de cada vez, com limite de três minutos e descarte do worker ao concluir. O texto reconhecido é limitado a 200 mil caracteres. A confiança mostrada é uma estimativa; escrita à mão e imagens pequenas/pouco nítidas podem precisar de transcrição manual. OCR identifica texto, não o significado visual de diagramas ou fotos.

A transcrição salva segue os mesmos backups, restaurações e salvamento automático das Notas, isolada entre Trabalho e Pessoal. Não há novo índice externo nem duplicação de imagens. Quando o texto reconhecido é salvo sem edição, guardamos motor, idiomas, confiança e data da revisão; alterações manuais no texto removem essa indicação.

Na conversa, peça por exemplo **“Busque nas Notas o laudo ABC-123”**. A busca de Notas é ativada ao mencionar Notas/cadernos/páginas, ou manualmente em **Buscar nas Notas → Incluir Notas nesta conversa**. Escolha Todas as notas ou uma pasta/caderno/página. Ao enviar, o aplicativo pesquisa o conteúdo disponível neste navegador e compartilha somente os trechos encontrados com o modelo selecionado, pelo chat autenticado existente. Imagens binárias, anexos e credenciais não são incluídos. O botão Assistente de uma página já seleciona esse local e prepara uma pergunta para você enviar. A opção de desativar a consulta é respeitada mesmo que a pergunta seguinte mencione Notas.

Cada consulta usa o texto atual, incluindo edições locais ainda não sincronizadas. A primeira consulta solicita o carregamento das Notas pelo GitHub quando a conexão já está configurada; sem essa conexão, a busca continua limitada aos dados locais e informa essa condição. A referência de cada trecho inclui caminho, tipo (texto/tabela/OCR) e posição. **Abrir origem** abre a nota/objeto correspondente; no celular, fecha a conversa para deixar a página visível. **Aprofundar nesta página** seleciona a página e prepara uma nova pergunta. Perguntas de seguimento usam as páginas encontradas; um novo pedido explícito de busca libera essa restrição, mantendo o local escolhido no seletor. **Nova busca** limpa o contexto de seguimento. Nomes duplicados pedem o caminho completo em vez de escolher silenciosamente um caderno.

A busca é textual, sem um índice semântico externo: considera palavras, títulos e caminhos, ignora diferenças de maiúsculas/acentos e mostra janelas ao redor de correspondências, inclusive no final de textos longos. São enviados até seis trechos por pergunta, com orçamento de tamanho; **Próximos trechos** prepara a continuação. Resumos de páginas longas também precisam dessa continuação. O modelo recebe a indicação de cobertura parcial e de possíveis erros de OCR. Ausência de resultado não comprova ausência do assunto; tente palavras diferentes ou reconheça o texto da imagem. A resposta da IA deve ser conferida com as fontes.

Os trechos automáticos são reconstruídos a cada envio, sem guardar cópias ocultas no histórico local da conversa. O histórico das perguntas e respostas permanece durante a sessão como já ocorria; desativar a busca interrompe novas consultas, sem apagar o que já foi conversado. Trabalho e Pessoal mantêm documentos e contexto separados. Não foram acrescentadas ferramentas para modificar Notas pela IA: a edição continua na própria página.

Próximas etapas: interpretação visual de imagens por modelos compatíveis e agrupamento/seleção de múltiplos objetos. A leitura visual por IA exige uma integração adicional e ainda não está incluída. O reconhecimento de texto continua sendo executado no dispositivo; perguntas ao assistente usam o modelo e seus limites/créditos habituais.

## Persistência e backup

- Metadados e textos: armazenamento local isolado por WorkspaceProfile; arquivo remoto `backups/notas.json` (ou `backups/pessoal/notas.json`).
- Imagens imutáveis: IndexedDB isolado por perfil e arquivos individuais em `backups/notas-imagens/<SHA256>.<ext>` (pessoal sob `backups/pessoal/`). Imagens novas são enviadas antes do documento que as referencia. Imagens existentes não são reenviadas a cada alteração textual.
- A guia reutiliza a conexão privada do GitHub já configurada. É ativada ao abrir Notas; depois, o salvamento automático global também acompanha Notas, mesmo noutra guia. Uma nova instalação carrega as notas ao abrir a guia. Salvamentos são guardados por SHA e conflitos preservam o rascunho local.
- Backups gerais sem imagens continuam JSON. Havendo imagens em Notas, o backup geral é ZIP contendo `backup.json` e os anexos. ZIPs são locais, sem serviço externo; somente o formato armazenado gerado pelo app é aceito. O limite por arquivo de backup é 200 MB.
- JSONs antigos sem `notes` preservam as notas atuais ao restaurar. Não se deve remover imagens do ZIP ou dos diretórios de anexos manualmente.
- Pontos de restauração guardam a estrutura das páginas; os anexos são imutáveis e retidos no navegador. Baixar um ponto gera ZIP com os anexos referenciados. As cópias internas continuam sujeitas à limpeza do armazenamento do navegador; use backup portátil e/ou GitHub.
- Não existe criptografia adicional nem autenticação de servidor no ambiente pessoal; vale o mecanismo de separação e bloqueio local já existente no app.

## Verificação

`tests/notes.cjs`: hierarquia, texto e desenho, imagens coladas, pesquisa, backup, recuperação, persistência e celular nos dois perfis.
`tests/notes-cloud.cjs`: API GitHub interceptada com dados sintéticos, uploads imutáveis, revisões, carregamento num dispositivo novo, conflitos e caminhos isolados.

`tests/notes-editing.cjs`: alinhamento entre traço e desenho final com zoom, tabelas expansíveis, listas interativas, undo, pesquisa, persistência e ambos os ambientes.

`tests/notes-ink.cjs`: todas as ferramentas de desenho mantêm a mesma geometria da prévia ao soltar, sobre texto e imagem, com rolagem, zoom e toque real no celular.

`tests/notes-ocr.cjs`: revisão, salvar/cancelar, falhas e resultados vazios, concorrência com restauração, busca por pasta, contexto do assistente, backup, celular e isolamento. Também verifica cancelamento/timeout/retry do worker. `OCR_NETWORK=1` acrescenta uma leitura real em português e inglês com os downloads públicos.

`tests/notes-search.cjs`: busca lexical, tabelas/OCR, textos longos, hierarquia, ambiguidades, seguimento, paginação sem repetições e conteúdo limitado. `tests/notes-chat.cjs`: formulário e OAuth com serviço sintético, opt-in/opt-out, fontes, leitura atualizada, navegação, aprofundamento, limites de mensagem e celular em ambos os ambientes.
