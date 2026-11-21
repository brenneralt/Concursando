# Direitos de uso e proveniência dos dados

## O que é código e o que é conteúdo

- **Código** (parser, frontend, scripts, migrations): licença MIT, conforme [`LICENSE`](../LICENSE).
- **Conteúdo das questões** (enunciados, alternativas, textos de apoio, gabaritos): produzido pelas bancas organizadoras e reproduzido aqui apenas para **estudo pessoal**. A licença MIT do repositório não relicencia esse conteúdo.

## Proveniência

| Origem | Volume | Como entrou |
| --- | --- | --- |
| Provas Cesgranrio (2004–2024) | 17.018 questões | PDFs oficiais baixados do acervo público do PCI Concursos, com links liberados pelo próprio site |
| Provas IGECAP/CONTEMAX (2020–2026) | 680 questões | PDFs oficiais enviados/coletados localmente |

O pareamento pergunta ↔ gabarito é feito por caderno e por cargo. Cadernos com gabarito ambíguo (versões conflitantes ou resposta de outro cargo) são descartados em vez de adivinhados.

## O que fica fora do Git

- PDFs brutos (`data/raw_pdfs/*.pdf`) — permanecem apenas na máquina de quem extrai.
- Links assinados do PCI (`data/pci_links/link_*.json`) — expiram e não devem ser redistribuídos.
- `data/migracao_materiais/` — propostas locais de migração.

Ao adicionar uma nova fonte de provas, registre aqui a origem, a data da coleta e a base legal/uso permitido. **Não** comite material cuja redistribuição não esteja clara.

## Qualidade do dado

O CI executa `npm run validar:dados` em todo push. O validador trata como **erro**:

- campo obrigatório ausente ou fora do schema;
- `id` vazio ou duplicado;
- alternativas fora do padrão A–E ou não contíguas;
- gabarito inexistente entre as alternativas;
- questão anulada com gabarito preenchido;
- `material_id` apontando para material inexistente.

E como **aviso** (não bloqueia, mas deve ser revisado):

- alternativa vazia (questão cuja resposta é uma imagem/tabela do PDF);
- questão sem gabarito por caderno não pareado;
- enunciado que menciona “o texto acima” sem texto de apoio;
- resíduos de captura (`pciconcursos`, cabeçalhos de gabarito).

## Limitações conhecidas

- Questões cuja resposta depende de imagem não têm o elemento gráfico preservado; as alternativas ficam vazias e a questão é mantida para não perder a numeração.
- A separação automática entre texto de apoio e comando usa a primeira linha em branco. A migração para `material_id` torna a relação explícita, mas a origem (arquivo/página) ainda precisa ser conferida no PDF antes de publicar.
- Citações e URLs dentro de enunciados são conteúdo legítimo, não marca d’água.
