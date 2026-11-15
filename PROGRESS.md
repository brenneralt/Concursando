# 📋 PROGRESS.md - Concurso-Questões

> **Instruções para IAs e Desenvolvedores:** Este arquivo é a fonte única de verdade sobre o andamento do projeto. Antes de iniciar qualquer alteração, leia este arquivo e o histórico do Git (`git log`). Ao concluir qualquer tarefa ou etapa, atualize este arquivo e faça o commit semântico correspondente.

---

## 🎯 Visão Geral do Projeto
Plataforma web moderna, rápida e focada na resolução e treino de questões de concursos públicos (estilo QConcursos), com foco em catalogação limpa e sem ruídos, estruturada em:
1. **Módulo Parser (`/parser`):** Extração de PDFs e gabaritos, validação e normalização do banco JSON de questões.
2. **Módulo Web (`/web`):** Frontend SPA construído em React + Vite + Tailwind CSS, com persistência no `localStorage`, consumindo `questoes.json`. Hospedável gratuitamente na **Vercel** ou **GitHub Pages**.

---

## 📊 Status Atual de Desenvolvimento

- **Última Atualização:** 15/11/2026
- **Status Geral:** Módulo 1 (Parser com PDFs reais IGECAP/CONTEMAX) concluído e validado. Módulo 2 (SPA) funcional com 520 questões reais, filtros no estilo QConcursos e texto de apoio compartilhado entre questões. Módulo 3 (integração com o MCP público da PCI Concursos) implementado para descoberta de provas e concursos.

### ✅ O Que Já Está Feito e Testado
- [x] **Repositório Git:** Inicializado na branch `main` com `.gitignore` completo para Node/Python.
- [x] **Estrutura de Pastas:** Configurada conforme arquitetura (`data/`, `parser/`, `web/`).
- [x] **Base Real IGECAP/CONTEMAX (`data/questoes.json`):**
  - 520 questões reais extraídas de 13 cadernos (Nível Médio/Técnico Administrativo; expurgados cargos técnicos de saúde e ensino fundamental puro, ver decisão 4).
  - Gabaritos oficiais pareados automaticamente (IGECAP 2026 SP/Ouricuri e Bayeux; CONTEMAX 2020–2024). 1 caderno sem gabarito local (Cubati).
  - Metadados completos: `banca`, `orgao`, `cargo`, `ano`, `nivel`, `disciplina`, `assunto`, `enunciado`, `alternativas`, `gabarito`, `anulada`.
  - Schema estrito validado: 12 chaves por questão, A–E, ids únicos, numeração 1–40 por caderno.
  - 19 questões oficiais marcadas como anuladas (`gabarito: null`, `anulada: true`). 4 questões-imagem com alternativas vazias (Iguaracy Q14/Q40, Lagoa Itaenga Ag./Assist. Legislativo Q13) — preservar e reportar.
  - **114 questões com texto de apoio embutido** (antes eram 24): textos citados por várias questões ("questões 1 e 2", "de 1 a 8") e textos longos de Língua Portuguesa são replicados em cada questão atendida, para que o card faça sentido isoladamente (ver decisão 6).
- [x] **Módulo Parser (`parser/`):**
  - `requirements.txt`, `extrair_questoes.py`, `normalizar_banco.py`.
  - Filtro administrativo aplica-se ao conjunto padrão; usar `--verbose` para ver o pareamento.
- [x] **Módulo Frontend (`web/`):** React 18 + Vite + Tailwind; Navbar, Filtros, CardQuestao, Estatisticas, hooks de progresso em `localStorage`; build de produção OK.
  - Filtros no estilo QConcursos: palavra-chave (enunciado, alternativas, cargo, órgão, assunto), Disciplina, Assunto, Banca, Instituição/Órgão, Ano, Cargo, Nível, exclusão de anuladas/sem gabarito e chips de status (Todas, Não resolvidas, Acertos, Erros, Salvas, Anuladas).
  - `CardQuestao` separa o texto de apoio (bloco recolhível "Texto de apoio") do comando da questão.
- [x] **Integração com o MCP da PCI Concursos (`parser/pci_mcp.py`, `parser/buscar_provas.py`):**
  - Cliente JSON-RPC/Streamable HTTP (somente stdlib + `requests`) para o servidor público `https://mcp.pciconcursos.com.br/mcp`, sem login.
  - Ferramentas expostas: `pesquisar_provas`, `pesquisar_concursos`, `buscar_por_cargo`, `buscar_por_cidade`, `listar_concursos`.
  - CLI `buscar_provas.py` com saída em tabela, `--json`, `--csv` e `--html` (painel clicável com nomes de arquivo sugeridos para prova e gabarito).
  - `opencode.json` registra o servidor como `pci-concursos`, disponível para agentes OpenCode.
  - Servidor conectado e validado no OpenCode em 15/11/2026: as 5 ferramentas aparecem em `tools["pci-concursos"]` e a busca "cesgranrio agente administrativo" retornou as 4 provas esperadas.
  - Testado: "cesgranrio agente administrativo" → 4 provas (FUNASA 2009, TCE/RO 2007, IBGE 2009, UNEMAT 2024); cargo "agente administrativo" na PB → 6 concursos; "legislativo" → 31 concursos.

---

## ⏳ O Que Falta Fazer (Backlog)
- [ ] **Adaptar o parser para a Cesgranrio:** reconhecer banca, seções, cargos e formato de gabarito da Cesgranrio (hoje o parser assume IGECAP/CONTEMAX e cai em CONTEMAX por padrão).
- [ ] **Fluxo GitHub Actions:** Adicionar workflow para deploy automático no GitHub Pages ou Vercel CLI.
- [ ] **Modo Simulado / Cronômetro:** Adicionar temporizador de prova com relatório final de tempo por questão.
- [ ] **Caderno de Erros:** Aba dedicada para focar exclusivamente na repetição de questões marcadas com erro.
- [ ] **Importador Drag-and-Drop no Frontend (Opcional):** Permitir upload local de novo `questoes.json` direto pela interface do usuário.
- [ ] **Expansão do Banco:** Adicionar mais provas e PDFs em `data/raw_pdfs/` e rodar parser em lote.

---

## 📐 Decisões de Arquitetura Tomadas

1. **SPA Estática sem Backend Obrigatório:**
   - O banco de questões é empacotado como `public/questoes.json`. O frontend faz `fetch('./questoes.json')` no carregamento.
   - Todo o progresso do usuário (respostas, acertos, erros, questões salvas) é gravado no `localStorage` do navegador sob a chave `concurso_questoes_progresso_v1`.
   - Vantagem: custo de hospedagem zero, tempo de resposta instantâneo, funciona 100% offline se cacheado (PWA ready).

2. **Garantia de Compatibilidade com Vercel e GitHub Pages:**
   - O Vite utiliza `base: './'`, permitindo que o build funcione tanto no caminho raiz de um domínio customizado / Vercel quanto em subdiretórios de repositório (`https://usuario.github.io/concurso-questoes/`).

3. **Taxonomia Rigorosa:**
   - Toda questão obrigatoriamente passa por `parser/normalizar_banco.py`, que rejeita questões sem gabarito ou com IDs duplicados antes de publicar para o frontend.

4. **Filtro Administrativo (escopo do produto):**
   - `extrair_questoes.py` aplica um filtro que mantém apenas cadernos com cargo de perfil administrativo/técnico-administrativo ou legislativo (Agente/Auxiliar/Assistente Administrativo, Técnico Administrativo, Agente/Assistente/Técnico Legislativo).
   - Exclui cargos técnicos de saúde (Técnico em Enfermagem), fiscais (Fiscal de Tributos) e fundamental puro (Auxiliar de Serviços Gerais), conforme briefing do produto. Saída: 520 questões de 13 cadernos.
   - Pareamento prova↔gabarito é por tokens de cidade com tolerância a ano divergente (ex.: São Domingos 2021 no cabeçalho da prova, gabarito IGECAP 2026).

5. **Decisões de extração de texto:**
   - Extração via `pdftotext -raw` (duas colunas).
   - Translineação com dicionário pt-BR (`/usr/share/dict/brazilian`): hífens de quebra de linha são fundidos quando a palavra existe no dicionário; hífens de prefixos/compostos/pronomes enclíticos/URLs são preservados.
   - Textos de apoio são anexados ao enunciado das questões que atendem (ver decisão 6).
   - Rodapés, cabeçalhos de seção, "MODELO DE GABARITO" e linhas de pontos/peso são removidos.
   - Alternativas vazias só ocorrem em questões-imagem (5 no total, identificadas no relatório).

6. **Texto de apoio compartilhado (cards autônomos):**
   - O texto de apoio é embutido no campo `enunciado` (schema continua com 12 chaves), separado do comando da questão por **uma linha em branco** (`\n\n`). O frontend usa a primeira linha em branco como separador e exibe o apoio em um bloco recolhível "Texto de apoio".
   - Prioridade de propagação: (a) referências explícitas no texto — `questões 1 e 2`, `questões de 1 a 8`, `questão 5`; (b) texto longo (≥ 300 caracteres) sem referência — vale da questão seguinte até o fim da disciplina/seção; (c) texto curto (legenda, tirinha) — apenas a questão seguinte.
   - Linhas vazias internas do apoio são removidas para que o separador `\n\n` seja único e inequívoco.
   - Um bloco de apoio posterior substitui o anterior nas questões em comum (ex.: "TEXTO 3" e o poema de Afogados), evitando acumular textos que não se aplicam.
   - Efeito: 114 questões passam a exibir o texto de apoio; `questoes.json` fica com ~878 KB crus, mas ~131 KB gzip (textos repetidos comprimem muito bem).

7. **Descoberta de provas via MCP oficial da PCI Concursos:**
   - O PCI publica um servidor MCP público e somente-leitura (`https://mcp.pciconcursos.com.br/mcp`), sem login, com busca de concursos e de provas anteriores.
   - O projeto usa esse MCP em vez de scraping: `parser/pci_mcp.py` fala JSON-RPC/Streamable HTTP e `parser/buscar_provas.py` oferece a CLI (tabela, JSON, CSV e painel HTML).
   - O MCP **não devolve PDFs**: devolve o link da página da prova. O download é feito pelo navegador, pois o PCI protege os arquivos com Cloudflare Turnstile. Não contornamos CAPTCHA.
   - Fluxo: MCP encontra → painel HTML → usuário baixa prova e gabarito para `data/raw_pdfs/` → `extrair_questoes.py` → `normalizar_banco.py`.
   - O servidor também fica registrado em `opencode.json` (`pci-concursos`), para agentes OpenCode consultarem direto.
   - O parser continua específico para IGECAP/CONTEMAX; importar Cesgranrio/FGV exige adaptar `parse_sections()`, `read_gabarito_meta()` e `infer_banca()`.

---

## 🧪 Como Rodar e Testar

### 1. Buscar provas e concursos (MCP da PCI Concursos):
```bash
# Provas anteriores por cargo/órgão/banca/ano
python3 parser/buscar_provas.py provas "cesgranrio agente administrativo"

# Painel HTML clicável, com nomes de arquivo sugeridos
python3 parser/buscar_provas.py provas "cesgranrio agente administrativo" \
  --html painel_provas.html --abrir

# Concursos abertos
python3 parser/buscar_provas.py cargo "agente administrativo" --uf pb
python3 parser/buscar_provas.py concursos "legislativo" --uf pb

# Ferramentas disponíveis no servidor
python3 parser/buscar_provas.py ferramentas
```

### 2. Extrair e Validar o Banco Real (Python):
```bash
# Extrai as questões dos PDFs e pareia com os gabaritos (pasta padrão: ~/Downloads/Provas IGECAP):
python3 parser/extrair_questoes.py --dir "/home/brenneralt/Downloads/Provas IGECAP" --out data/questoes.json --report data/relatorio_parser.json --verbose

# Valida, formata e sincroniza com o frontend:
python3 parser/normalizar_banco.py
python3 parser/normalizar_banco.py --dry-run   # apenas verifica
```

### 3. Rodar o Frontend Localmente (Node.js):
```bash
cd web
npm install
npm run dev
# Acesse no navegador: http://localhost:3000
```

### 4. Testar o Build de Produção:
```bash
cd web
npm run build
# Gera web/dist/ com base './' (compatível Vercel e GitHub Pages)
```
