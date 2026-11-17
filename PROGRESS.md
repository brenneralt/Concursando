# 📋 PROGRESS.md - Concurso-Questões

> **Instruções para IAs e Desenvolvedores:** Este arquivo é a fonte única de verdade sobre o andamento do projeto. Antes de iniciar qualquer alteração, leia este arquivo e o histórico do Git (`git log`). Ao concluir qualquer tarefa ou etapa, atualize este arquivo e faça o commit semântico correspondente.

---

## 🎯 Visão Geral do Projeto
Plataforma web moderna, rápida e focada na resolução e treino de questões de concursos públicos (estilo QConcursos), com foco em catalogação limpa e sem ruídos, estruturada em:
1. **Módulo Parser (`/parser`):** Extração de PDFs e gabaritos, validação e normalização do banco JSON de questões.
2. **Módulo Web (`/web`):** Frontend SPA construído em React + Vite + Tailwind CSS, com persistência no `localStorage`, consumindo `questoes.json`. Hospedável gratuitamente na **Vercel** ou **GitHub Pages**.

---

## 📊 Status Atual de Desenvolvimento

- **Última Atualização:** 17/11/2026
- **Status Geral:** Módulo 1 (Parser) cobre IGECAP/CONTEMAX e Cesgranrio (duas colunas, gabarito por cargo, gabarito com uma coluna por versão e desambiguação por cor da prova, número do gabarito e blocos por versão). Módulo 2 (SPA) funcional com filtros no estilo QConcursos, login e ranque no Supabase. Módulo 3 (PCI Concursos) descobre e baixa provas do acervo inteiro. `main` publicada no GitHub em 17/11/2026. **Banco atual: 5.069 questões (4.389 Cesgranrio + 680 IGECAP/CONTEMAX), 119 provas, 19 órgãos Cesgranrio (2004–2023), 99,2% gabaritadas.** A coleta do acervo Cesgranrio (1.262 cadernos restantes) está parada porque a extensão do navegador caiu; 287 cadernos (596 PDFs) já estão em `data/raw_pdfs/`.

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
- [x] **Raspador direto do site PCI (`parser/raspador_pci.py`):** o MCP devolve só 50 provas por consulta; o raspador lê as páginas `/provas/<termo>/<n>` do site e junta o acervo inteiro (testado: 2.718 provas Cesgranrio em 55 páginas). Gera tabela, JSON, CSV e painel HTML. Requer `beautifulsoup4`.
- [x] **Baixador de provas do PCI (`parser/baixar_provas_pci.py`):** as páginas `/provas/download/<slug>` são protegidas por Cloudflare Turnstile. Num Chromium real a verificação é resolvida automaticamente e a página libera URLs assinadas (`/provas/<id>/<hash>/arquivo.pdf`); o script **não contorna** nada — apenas baixa as URLs que o navegador liberou, a partir de um JSON de links (`data/links_pci_ibge.json` tem as 83 provas do IBGE já liberadas). Salva `data/raw_pdfs/<slug>_prova.pdf` / `<slug>_gabarito.pdf` e registra tudo em `manifest.json`, com `--forcar`, `--pausa`, `--dest` e `--manifesto`. O antigo fluxo manual (`baixar_provas.py`) foi removido por ser redundante.
- [x] **Banco Cesgranrio importado (17/11/2026):** 4.389 questões de 103 provas Cesgranrio (19 órgãos, 2004–2023), recortadas para nível médio/fundamental por `parser/filtrar_escopo.py` (descarta cargos cujo nome é área de formação e prefixos de nível superior: Analista, Tecnologista, Engenheiro, Auditor, etc.). Total do banco: 5.069 questões (4.389 Cesgranrio + 680 IGECAP/CONTEMAX), 0 ids duplicados, 99,2% gabaritadas.
- [x] **Leitura da versão do caderno e de gabaritos em blocos (17/11/2026):**
  - `versao_do_caderno` agora casa "GABARITO N" **na mesma linha** (antes o `\s` do regex atravessava a quebra de linha e capturava dígitos da grade de respostas: o caderno do Banrisul 2023 era lido como versão "06") e usa a moda das ocorrências, já que o número se repete no cabeçalho de cada página.
  - `gabarito_em_blocos` lê gabaritos em que cada versão ocupa um bloco vertical: uma versão por página (Banrisul 2023, BB 2021), duas na mesma página (IBGE 2014) ou quatro blocos (BB 2010). O bloco é aberto por "GABARITO N" (com ou sem cor), as respostas são lidas em ordem de leitura e só valem se formarem 1..N sem repetição — condição que nunca ocorre numa tabela com versões lado a lado. Empates são resolvidos pelo nome do cargo no cabeçalho da página (F1 dos tokens) e, sem desempate, a prova é descartada.
  - A coluna da cor agora leva junto os blocos complementares na mesma faixa horizontal (básicos 1..30 + específicos 31..70), o que recuperou o Banco do Brasil 2010.
  - Resultado: +8 provas e +440 questões publicadas (Banrisul 2023, BB 2010/2018/2021, IBGE 2014), **sem nenhuma regressão** — as 168 provas que já entravam continuaram com a mesma cobertura.
- [x] **Gabarito com uma coluna por versão (`gabarito_por_colunas`):** CHESF, BNDES, LIQUIGÁS e TRANSPETRO publicam um gabarito único com as respostas de todas as versões lado a lado. O parser lê o PDF em `-bbox-layout`, reconstrói as linhas pela coordenada y (`31 -` e `A` vêm em elementos separados), agrupa as respostas por x, atribui cada palavra do cabeçalho à coluna mais próxima e empilha a mesma coluna nas páginas seguintes. A escolha combina o nome do cargo com o total de questões do caderno; se não houver cabeçalho compatível e desempate claro, mantém a leitura antiga (nunca arrisca a versão errada). Questões sem gabarito não são publicadas (`questoes_sem_gabarito` no relatório).
- [x] **Desambiguação de versões do gabarito (17/11/2026):**
  - Rótulos de coluna agora são frases (vãos > 12 pt), atribuídos por interseção horizontal; títulos que atravessam mais de duas colunas (nome da prova, "conhecimentos específicos") são ignorados.
  - Comparação de cargo tolerante a abreviações (`SequenceMatcher`: "AG. ADMINISTRATIVO" casa com "Agente Administrativo"), o que resolveu TCE/RO 2007 (21-B para Agente Administrativo, 21-E para Controle Externo).
  - Tabelas de uma coluna só viram "bloco comum" e nunca se misturam com a coluna de uma versão; completam a numeração só quando todas as colunas concordam.
  - Gabaritos em grade horizontal (1-C | 2-A | 3-C em cada linha, caso BNDES 2013) são detectados e entregues à leitura por texto.
  - `versao_do_caderno` lê "GABARITO N - PROVA AZUL" na capa do caderno; a cor da prova escolhe a coluna/página certa (Casa da Moeda 2005 é o caso de referência).
  - Regra de segurança: se há versões conflitantes e nenhuma coluna/bloco cobre ao menos 95% do caderno, a prova é descartada (`provas_incompletas`) em vez de publicar resposta de outro cargo. 124 provas caíram nessa regra no lote atual (eram 132).
- [x] **Parser adaptado ao caderno Cesgranrio (`parser/extrair_questoes.py`):**
  - Ordem de leitura de duas colunas reconstruída por `pdftotext -bbox-layout` (o `-raw` embaralhava as questões).
  - Numeração isolada (`18` sozinho na linha) convertida em início de questão, com escolha da maior cadeia consecutiva e tolerância a inversões pontuais de diagramação.
  - Alternativas `(A)`…`(E)` e alternativas que continuam em várias linhas.
  - Gabarito com uma página por cargo (`gabarito_por_pagina`), questão anulada (`39 - Anul` → `#`) e gabarito de tabela única com 4 versões (usa a 1ª coluna = prova oficial).
  - Pareamento prova↔gabarito pelo slug do arquivo (`<slug>_prova.pdf` ↔ `<slug>_gabarito.pdf`).
  - `--meta data/pci_cesgranrio.json` corrige cargo/órgão/ano a partir do JSON do raspador (o texto do PDF trunca nomes de cargo).
  - `parser/mesclar_questoes.py` mescla lotes extraídos no banco principal, sem duplicar ids e descartando questões com alternativas vazias (figuras/tabelas que o PDF não entrega em texto).
- [x] **Login e ranque com Supabase (backend):** `supabase/schema.sql` cria `profiles` (apelido único), `progresso` (por questão) e a view `ranque` (ranking de questões resolvidas por usuário), com RLS e trigger de criação de perfil. Frontend: `web/src/supabase.js` (cliente), `hooks/useProgress.js` (progresso local + sincronização na nuvem), telas `Login`, `ChooseNickname` e `Ranking`. Usuário escolhe apelido; ranque público por resoluções/acertos. `localStorage` continua como fallback off-line.
- [x] **Credenciais fora do código (17/11/2026):** `web/src/supabase.js` lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` de `import.meta.env`; o modelo versionado é `web/.env.example` e o `.env` real fica fora do Git (`.gitignore` da raiz e de `web/`). Se as variáveis não existirem, o cliente vira um stub inativo: o app abre e segue off-line com `localStorage`, e login/ranque mostram um aviso claro em vez de quebrar o build. Deploy precisa declarar as duas variáveis (Vercel: Settings → Environment Variables; Actions: Secrets).
- [x] **Integração com o MCP da PCI Concursos (`parser/pci_mcp.py`, `parser/buscar_provas.py`):**
  - Cliente JSON-RPC/Streamable HTTP (somente stdlib + `requests`) para o servidor público `https://mcp.pciconcursos.com.br/mcp`, sem login.
  - Ferramentas expostas: `pesquisar_provas`, `pesquisar_concursos`, `buscar_por_cargo`, `buscar_por_cidade`, `listar_concursos`.
  - CLI `buscar_provas.py` com saída em tabela, `--json`, `--csv` e `--html` (painel clicável com nomes de arquivo sugeridos para prova e gabarito).
  - `opencode.json` registra o servidor como `pci-concursos`, disponível para agentes OpenCode.
  - Servidor conectado e validado no OpenCode em 15/11/2026: as 5 ferramentas aparecem em `tools["pci-concursos"]` e a busca "cesgranrio agente administrativo" retornou as 4 provas esperadas.
  - Testado: "cesgranrio agente administrativo" → 4 provas (FUNASA 2009, TCE/RO 2007, IBGE 2009, UNEMAT 2024); cargo "agente administrativo" na PB → 6 concursos; "legislativo" → 31 concursos.

---

## ⏳ O Que Falta Fazer (Backlog)
- [x] **Adaptar o parser para a Cesgranrio:** banca, seções, cargos, numeração isolada, duas colunas e gabarito por cargo/versão. Painel com 2.718 provas Cesgranrio em `painel_cesgranrio.html`.
- [x] **Primeiro push no GitHub:** `main` publicada em `github.com/brenneralt/Concursando`.
- [ ] **Deploy no Vercel/GitHub Pages:** subir o frontend com login/ranque e cadastrar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel do provedor (Settings → Environment Variables / Secrets).
- [ ] **Fluxo GitHub Actions:** Adicionar workflow para deploy automático no GitHub Pages ou Vercel CLI.
- [ ] **Modo Simulado / Cronômetro:** Adicionar temporizador de prova com relatório final de tempo por questão.
- [ ] **Rodar o patch de RLS de exclusão de progresso** no SQL Editor do Supabase (`progresso_delete_own`, já presente em `supabase/schema.sql`) e apagar as contas de teste.
- [ ] **Caderno de Erros:** Aba dedicada para focar exclusivamente na repetição de questões marcadas com erro.
- [ ] **Importador Drag-and-Drop no Frontend (Opcional):** Permitir upload local de novo `questoes.json` direto pela interface do usuário.
- [ ] **Retomar a coleta Cesgranrio:** 287 de ~1.262 cadernos baixados. O worker de iframes/Turnstile roda na aba real do Chrome e grava `link_<slug>.json`; a extensão do navegador está offline (`browse status` = paired-offline) e o estado em `/tmp/opencode` foi limpo, então é preciso recriar receptor local + worker. Scripts e fila de links devem ficar no repositório (ex.: `data/pci_links/`) para sobreviver à limpeza de `/tmp`.
- [ ] **Recuperar os 124 gabaritos ambíguos restantes:** os formatos "uma versão por página", "versões empilhadas" e "coluna por cor com blocos complementares" já são lidos automaticamente. O que sobra são cadernos que **não dizem a versão em lugar nenhum** (UNEMAT 2024 "PROVAS 1 A 9", UNIRIO 2016/2019, AGERIO 2023, SEE-SP 2009): 54 provas de nível médio/fundamental, ~2.239 questões. Sem marcador de versão a escolha seria adivinhação, então elas ficam fora por decisão de segurança. Para resgatar: (a) usar as questões anuladas do caderno como impressão digital da versão (o `#` no gabarito identifica a coluna); (b) achar o número da prova em outra página/arquivo do PCI; (c) aceitar apenas as questões cuja resposta é igual em todas as versões (hoje a regra exige 95% de cobertura, o que descarta o caderno inteiro).

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
   - Fluxo: MCP/raspador encontra → `baixar_provas.py` abre as páginas → usuário resolve a verificação e baixa → PDFs padronizados em `data/raw_pdfs/` → `extrair_questoes.py` → `normalizar_banco.py`.
   - O servidor também fica registrado em `opencode.json` (`pci-concursos`), para agentes OpenCode consultarem direto.
   - O parser continua específico para IGECAP/CONTEMAX; importar Cesgranrio/FGV exige adaptar `parse_sections()`, `read_gabarito_meta()` e `infer_banca()`.

8. **Segredos e configuração por ambiente:**
   - Nenhuma credencial de serviço no código versionado. O frontend só usa a chave pública (`publishable`/anon), que é protegida por RLS, e mesmo assim vem de `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
   - `web/.env` fica no `.gitignore` (raiz e `web/`); `web/.env.example` documenta as chaves sem valores reais.
   - Chaves de serviço (`service_role`) e acesso administrativo ao banco **nunca** entram no frontend: operações privilegiadas rodam no SQL Editor ou em script local fora do repositório.
   - O build do Vite embute qualquer `VITE_*` no bundle: só variáveis públicas podem usar esse prefixo.

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
