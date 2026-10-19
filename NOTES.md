# Notas — primeira entrega

A guia Notas fica depois de Cronogramas. Pastas contêm pastas/cadernos; cadernos contêm páginas e páginas podem conter subpáginas. Selecione o caderno para criar páginas irmãs; selecione uma página para criar uma subpágina. A árvore pode ser recolhida e o modo foco aumenta a área útil.

## Uso pela interface

- Texto: clique em Texto ou dê dois cliques num local vazio. O texto continua editável e pesquisável. Selecione-o para alterar cor, tamanho ou negrito. Lista acrescenta marcadores de verificação em texto.
- Imagem: use Imagem, arraste um arquivo ou cole uma captura com Ctrl+V. PNG, JPEG e WebP são aceitos. Imagens são normalizadas para até 1800 pixels no maior lado e até 900 KB; anexos maiores que 25 MB são recusados antes do processamento.
- Lápis, marca-texto, reta, seta, retângulo e círculo: escolha a ferramenta e arraste. Borracha remove o objeto tocado. Desfazer/refazer funciona durante a sessão.
- Selecionar: escolha um objeto; arraste o controle de mover ou redimensionar. Detalhes permite editar texto, posição, tamanho, rotação, descrição/transcrição da imagem e camada. Duplicar cria outro objeto.
- Navegar permite rolar com o dedo sem desenhar. Zoom varia de 20% a 300%; Ajustar à tela mostra a largura da página. A área cresce quando objetos são movidos para mais longe.
- Pesquisa: digite e pressione Enter/Buscar. Restrinja a qualquer pasta, caderno ou página pelo seletor. Resultados apresentam caminho e trecho. Abra imagens pela própria página para inspecioná-las ampliadas.

## Pesquisa de imagens e assistente

Nesta entrega a busca inclui texto digitado, títulos, descrições e transcrições manuais das imagens. **Não há OCR automático nem integração com um serviço de IA.** Em Detalhes da imagem pode-se registrar uma transcrição para pesquisa. Imagens podem ser ampliadas para interpretação visual por um assistente que tenha essa capacidade no navegador. O botão Assistente prepara o texto da página na conversa existente, e os resultados da pesquisa também podem ser levados ao chat. Nada é enviado automaticamente: a mensagem fica para revisão e envio pelo usuário. Imagens binárias não são anexadas ao chat nesta etapa. Todos os controles principais têm nomes acessíveis. O assistente pode pesquisar e editar pelas mesmas telas; não precisa acessar APIs, código ou armazenamento interno.

Evolução prevista: OCR automático, revisão do texto reconhecido e agrupamento/seleção de múltiplos objetos. Serviços externos de OCR/IA dependem de escolha explícita, incluindo custo e tratamento dos dados.

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
