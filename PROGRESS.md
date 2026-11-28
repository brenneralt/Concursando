# 📋 PROGRESS.md - Concurso-Questões

> **Instruções para IAs e Desenvolvedores:** Este arquivo é a fonte única de verdade sobre o andamento do projeto. Antes de iniciar qualquer alteração, leia este arquivo e o histórico do Git (`git log`). Ao concluir qualquer tarefa ou etapa, atualize este arquivo e faça o commit semântico correspondente.

---

## 🎯 Visão Geral do Projeto
Plataforma web moderna, rápida e focada na resolução e treino de questões de concursos públicos (estilo QConcursos), com foco em catalogação limpa e sem ruídos, estruturada em:
1. **Módulo Parser (`/parser`):** Extração de PDFs e gabaritos, validação e normalização do banco JSON de questões.
2. **Módulo Web (`src/`):** Frontend SPA construído em React + Vite + Tailwind CSS, com persistência no `localStorage`, consumindo `questoes.json`. Hospedável gratuitamente na **Vercel** ou **GitHub Pages**. (Antes ficava em `web/`; ver seção de reestruturação acima.)

---

## 🔐 Controle de acesso por aprovação (Etapa 1) — implementado

- Migration `supabase/migrations/0002_user_access.sql`: tabela separada `user_access` com estados `pending`/`approved`/`blocked`, `is_admin`, rastreabilidade de quem aprovou/bloqueou e quando.
- Trigger cria `user_access` (pending) ao cadastrar; backfill das contas existentes.
- RLS: usuário lê apenas o próprio status; `progresso` e `ranque` apenas para `approved`; admin via funções `SECURITY DEFINER` que verificam `is_admin` no banco.
- **Endurecimento (revisão de 27/11/2026):** `set search_path = ''` + nomes totalmente qualificados em todas as funções; `GRANT` explícito em `user_access` (`anon` sem acesso algum, `authenticated` só `SELECT` — sem escrita direta, logo sem auto-aprovação); `auth.users` só é lido dentro das funções administrativas.
- **Guardas administrativas:** administrador não se bloqueia/pendenta nem remove a própria admin; não é possível promover conta `pending`/`blocked`; auto-lockout impedido mantém sempre ≥1 administrador ativo.
- Conta bloqueada perde acesso mesmo com sessão ativa (RotaProtegida revalida ao navegar; `progresso` exige `approved` na policy).
- Frontend: `RotaProtegida` mostra telas de aguardando/bloqueado; painel `/admin` com busca, abas por status, contadores, aprovar/bloquear/reativar/promover/rebaixar; link Admin no Navbar só para admin.
- **Correção do bug de redirecionamento:** a decisão de rota/passagem só acontece depois que sessão (`authLoading`) **e** registro de acesso terminaram de carregar (`estadoAcesso`/`estadoAdmin`/`estadoRota` em `permissoes.js`, testadas). Admin, RotaProtegida, Navbar e a rota `/aguardando-aprovacao` seguem o mesmo fluxo.
- **Cadastro sem sessão (confirmação de e-mail ativa):** `Login.jsx` mostra "Cadastro realizado — confirme o e-mail" em vez de navegar para `/escolher-apelido`; com sessão, segue para `/aguardando-aprovacao`.
- **Testes:** `src/test/permissoes.test.js` com 26 casos (acesso, rota, painel admin, próximo passo do cadastro) + `npm run test:db` com **27 asserções de RLS/funções** rodando num PostgreSQL local real aplicando `0001` + `0002` (`scripts/testar-acesso-db.mjs`, incluído no `verificar`/CI).
- Nenhum `service_role` no front; chave anônima + RLS decidem.
- Bootstrap do admin via SQL manual (documentado no README).
- **Limitações conhecidas:** o harness do `test:db` recria `auth.uid()`/papéis do Supabase (não usa o Supabase CLI, indisponível aqui); a aplicação no projeto Supabase de produção **não foi feita** e `main` **não foi publicada**.

## 🧱 Reestruturação (21/11/2026)

- **Monólito reorganizado:** `web/` deixou de existir; o frontend está em `src/` na raiz, com `src/app`, `src/components`, `src/features/{conta,questoes,simulados,desempenho}`, `src/services` e `src/test`. O `package.json` e o lockfile ficam junto ao fonte e há **um único caminho de build** (`npm run build`).
- **Dados como produto:** `data/questoes.json` é a fonte única; `public/dados/` é gerado por `scripts/preparar-dados.mjs` e não é versionado. `scripts/validar-questoes.mjs` valida schema, ids, alternativas, gabarito, anuladas e `material_id` (0 erros, 185 avisos no acervo atual).
- **Texto de apoio × comando:** o frontend entende o formato legado (linha em branco) e o novo (`material_id` + `data/materiais.json`). `scripts/separar-materiais.mjs` gera proposta deduplicada para revisão; nada foi aplicado ao acervo ainda.
- **Testes:** Vitest com 26 casos cobrindo filtros multiseleção/status/busca, correção de resposta, estatísticas, montagem e correção de simulado e separação do texto de apoio.
- **CI/CD:** `deploy.yml` agora roda `npm ci`, lint, typecheck, testes, validação dos dados e build antes de publicar; dispara em mudanças de `src/`, `scripts/`, `data/`, configs e do próprio workflow. Publicação manual de `dist` na `main` está proibida na documentação.
- **Incidente corrigido:** um `npx gh-pages -d dist -b main -f` havia substituído o `main` remoto por um commit raiz com apenas o build. A branch foi restaurada a partir do histórico local e o site voltou a servir o JSON reparado (22,3 MB, Q04 do BANRISUL com texto de apoio).
- **Documentação:** `README.md`, `CONTRIBUTING.md`, `LICENSE` (MIT para código) e `docs/dados.md` (proveniência, direitos, limites e regras de qualidade).
- **Supabase:** schema convertido em migration (`supabase/migrations/0001_schema_rls.sql`) e `supabase/seed.sql` vazio por design; variáveis públicas e secretas documentadas.

---

## 📊 Status Atual de Desenvolvimento

- **Última Atualização:** 21/11/2026
- **Status Geral:** Módulo 1 (Parser) cobre IGECAP/CONTEMAX e Cesgranrio (duas colunas, gabarito por cargo, gabarito com uma coluna por versão e desambiguação por cor da prova, número do gabarito e blocos por versão). Módulo 2 (SPA) funcional com filtros no estilo QConcursos, login e ranque no Supabase. Módulo 3 (PCI Concursos) descobre e baixa provas do acervo inteiro. `main` publicada no GitHub em 17/11/2026. **Banco atual: 17.698 questões (17.034 Cesgranrio + 680 IGECAP/CONTEMAX menos 16 removidas no saneamento), 366 provas Cesgranrio, 47 órgãos (2004–2024), 99,8% gabaritadas.** A coleta do acervo Cesgranrio está **concluída: 1.230/1.230 cadernos do escopo com link liberado (1.199 com PDF, 2.581 arquivos)**. Os 2 cadernos que não entraram no banco têm gabarito ambíguo (versões conflitantes ou respostas de outro cargo) e foram descartados por segurança. O `questoes.json` pesa **19 MB** compacto (~4,0 MB gzip), o que ainda pesa no carregamento do app (plano: fatiar por disciplina/ano).

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
- [x] **Coleta resumível do acervo Cesgranrio (17/11/2026):** a extensão do navegador (`browse`) ficou offline, então a coleta passou a usar o **navegador in-app** (`tools.browser`), que resolve o Turnstile normalmente. Três peças versionadas tornam o processo retomável depois de qualquer queda:
  - `parser/fila_pci.py` cruza o catálogo do raspador (`data/pci_cesgranrio.json`) com o `manifest.json` e grava `data/pci_links/fila.json`: 1.473 cadernos no escopo médio/fundamental, dos quais 1.141 pendentes.
  - `parser/receptor_links.py` é um servidor local (`localhost:8765`) com `/fila`, `/link`, `/lote`, `/status`, `/fim` e `/coletor.js`; grava um `link_<slug>.json` por caderno em `data/pci_links/` e atualiza `coletados.json`. As URLs assinadas expiram, por isso ficam no `.gitignore`; fila e índice são versionados.
  - `parser/coletor_links_pci.js` roda na aba real: abre um iframe **visível** por caderno, espera o próprio site escrever as URLs em `a.prova-pdf-link[data-acao="baixar"]` e devolve `{id, ok, arquivos[]}`. Nada é contornado: o link usado é o que o site entregou após a verificação.
  - Concorrência 1 é a única que funciona de forma estável (iframes simultâneos ou fora da viewport impedem o widget de renderizar). O ritmo é ~1 caderno a cada 15–40 s.
  - Procedimento de retomada em `README.md` (seção "Coleta resumível do PCI").
  - Ganho medido em 17/11/2026: 410 cadernos com PDF (838 arquivos), 154 links liberados, 1.076 pendentes. Duas abas em paralelo (uma worker em cada) dobram o ritmo para ~18 cadernos/min; concorrência >1 **dentro** da mesma aba derruba a taxa de sucesso, mas abas separadas não se atrapalham.
  - Ao pausar: `__pciParar()` nas abas (os workers param depois do caderno atual), drenar o último lote e rodar o downloader. Recarregar a aba mata o worker e é a forma de limpar workers zumbis.
- [x] **Banco Cesgranrio importado em duas ondas (17/11/2026):** primeira carga de 4.389 questões de 103 provas; depois a coleta nova acrescentou **+447 questões de 14 provas** (BASA 2024, CEF 2024, TRANSPETRO 2023, ELETRONUCLEAR 2022, CNU 2024, Fundação Osório 2026…). Hoje são **4.836 questões Cesgranrio em 117 provas de 21 órgãos (2004–2024)**. Recorte por `parser/filtrar_escopo.py` (descarta cargos cujo nome é área de formação e prefixos de nível superior: Analista, Tecnologista, Engenheiro, Auditor, etc.). Total do banco: 5.516 questões (4.836 Cesgranrio + 680 IGECAP/CONTEMAX), 0 ids duplicados, 98,9% gabaritadas e 0,3% anuladas.
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

## ⏸️ Ponto de Retomada (18/11/2026, 11:30)

Estado exato ao pausar:

| Item | Valor |
|---|---|
| Banco publicado | 6.022 questões (5.342 Cesgranrio em 126 provas + 680 IGECAP/CONTEMAX) |
| PDFs em `data/raw_pdfs/` | 1.575 arquivos / 746 cadernos |
| Fila do PCI | 1.473 no escopo · 574 links liberados · **657 pendentes** |
| PDFs ainda não extraídos | **302** (baixados depois da extração v6) |
| Coletores | parados (`rodando: false`) nas duas abas; receptor e downloader encerrados |

O que rendeu na sessão de 18/11: 294 + 302 PDFs baixados (1.273 → 1.575), 420 links
novos na fila, +506 questões publicadas (5.516 → 6.022).

Para continuar amanhã:

```bash
# 1. receptor (se não estiver de pé)
curl -s localhost:8765/status || setsid python3 parser/receptor_links.py --porta 8765

# 2. extrair os 302 PDFs novos e publicar
python3 parser/extrair_questoes.py --dir data/raw_pdfs \
  --out /tmp/opencode/questoes_v7.json --report /tmp/opencode/relatorio_v7.json \
  --meta data/pci_cesgranrio.json --all-cargos --min-cobertura 0.95
python3 parser/filtrar_escopo.py --novo /tmp/opencode/questoes_v7.json --out /tmp/opencode/questoes_v7_medio.json
python3 parser/mesclar_questoes.py --novo /tmp/opencode/questoes_v7_medio.json
python3 parser/normalizar_banco.py && (cd web && npm run build)

# 3. retomar a coleta: abrir UMA página do PCI e deixá-la em foco
#    (aba em segundo plano tem os timers estrangulados e o worker quase para).
#    window.__pciIniciar(fila, { concorrencia: 1 })
#    drenar com __pciDrenar() e POST /lote; baixar com:
python3 parser/baixar_provas_pci.py --links data/pci_links --pausa 0.1
```

> Medições de 18/11: uma aba **em foco** coleta ~6 cadernos/min e mantém ~90% de
> sucesso; duas abas em paralelo caem para ~3/min porque a aba sem foco sofre
> throttling de timers no Chrome (e concorrência >1 na mesma aba gera timeouts).
> Dividir a fila com `?de=2&parte=I` continua útil quando as duas abas estão em
> foco alternado.

---

## ⏳ O Que Falta Fazer (Backlog)
- [x] **Adaptar o parser para a Cesgranrio:** banca, seções, cargos, numeração isolada, duas colunas e gabarito por cargo/versão. Painel com 2.718 provas Cesgranrio em `painel_cesgranrio.html`.
- [x] **Primeiro push no GitHub:** `main` publicada em `github.com/brenneralt/Concursando`.
- [x] **Deploy no GitHub Pages (18/11/2026):** site publicado em **https://brenneralt.github.io/Concursando/** com login/ranque ativos. Pages habilitado em modo *GitHub Actions* e os secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` cadastrados; o bundle publicado contém o endpoint do Supabase e o `questoes.json` (**17.714 questões**).
- [x] **Fluxo GitHub Actions:** `.github/workflows/deploy.yml` faz build (`npm ci` + `vite build`), confere `dist/questoes.json` e publica no GitHub Pages a cada push em `web/`. Pages já ligado (Source: GitHub Actions) e secrets `VITE_*` cadastrados.
- [x] **Modo Simulado / Cronômetro (18/11/2026):** rota `/simulado` com montagem do recorte (disciplina, ano, nível), quantidade (10/20/30/50) e tempo (sem limite/20/40/60 min). Durante a prova há cronômetro, navegador de questões, atalhos ← → e seleção sem feedback imediato; ao finalizar, calcula acertos/erros/em branco/tempo, mostra revisão com gabarito e grava as respostas no progresso (ranque).
- [x] **Formatação das questões antigas — hifenização (18/11/2026):** os PDFs de 2004–2010 quebram palavras no fim da linha (`mes-\nmo`, `extremamen-\nte`, `da-\nnos`). `parser/normalizar_banco.py` passou a juntar o par **somente quando a palavra resultante existe no dicionário pt-BR** (`/usr/share/dict/brazilian` + `portuguese`, 471.943 palavras); compostos legítimos (`mão-de-obra`, `ceder-lhes`), URLs e rótulos de tabela/siglas (`I-X`, `PSV-PSV`) ficam intactos. Resultado: **682 → 6 questões** com hifenização quebrada (os 6 restantes são artefatos de tabela: `Flip-Flip`, `I-X`, `PSHH-PSLL`). O JSON também passou a ser gravado compacto (`separators`), caindo de **21 MB para 19 MB** (4,3 MB gzip).
- [x] **Formatação das questões antigas — reflow de linhas (18/11/2026):** os cadernos em PDF quebram a prosa a cada ~80 caracteres, e o texto chegava ao app com uma linha por linha do PDF (`Tendo em vista o aspecto geográfico da Região Norte, a\ninclusão de...`). O normalizador agora:
  - junta linhas de continuação (a seguinte começa em minúscula, ou em número com texto) e preserva parágrafos separados por linha em branco, que é o que o card usa para montar o bloco "Texto de apoio";
  - **não mexe** em blocos com mediana de largura < 45 colunas (versos, tabelas, listas de valores) nem em linhas iniciadas por marcadores de item/alternativa (`I –`, `a)`, `1.`, `(A)`);
  - remove cabeçalhos/rodapés de página repetidos no meio do texto (`PROVA 1 - VERDE`, `GABARITO 3 - PROVA SALMÃO`, `FORMAÇÃO: ...`, `NÍVEL MÉDIO`), que apareciam dentro de 77 enunciados;
  - corrige pontuação separada pela diagramação (`traduzi-\n-la` → `traduzi-la`, `matéria-\n-prima` → `matéria-prima`, `47 , às` → `47, às`) e linhas que começam com pontuação.
  - Resultado: **13.836 enunciados reformatados**, média de **9,0 → 4,9 linhas** por questão, ids/metadados/gabaritos inalterados (auditado) e transformação idempotente. Payload: 19 MB (**4,03 MB gzip**).
- [ ] **Rodar o patch de RLS de exclusão de progresso** no SQL Editor do Supabase (`progresso_delete_own`, já presente em `supabase/schema.sql`) e apagar as contas de teste.
- [x] **Conta obrigatória (19/11/2026):** toda navegação agora exige sessão ativa. Ao abrir o site sem conta, o app verifica a sessão do Supabase; sem sessão, redireciona para `/login` (guardando a rota original para voltar depois de logar). Quem já entrou não precisa logar de novo — o Supabase mantém a sessão entre visitas. O progresso é armazenado por usuário (`localStorage` com chave `concurso_questoes_progresso_v3:<user_id>`) e sincronizado com Supabase ao logar. Ao logar pela primeira vez, o progresso legado (chave global antiga) é migrado para a nova conta e enviado para a nuvem em lotes. Rotas agora usam `HashRouter` (`#/...`): com `BrowserRouter` os links saíam da subpasta `/Concursando/` no GitHub Pages e quebravam com 404.
- [x] **Botão “Copiar para IA” (19/11/2026):** cada questão tem um botão que copia um prompt pronto (metadados, enunciado, alternativas A–E, gabarito oficial quando houver, sua resposta se você já respondeu e instrução de explicação didática) para colar em qualquer IA gratuita — ChatGPT, Claude, Gemini, DeepSeek etc. Sem chave de API no site, sem custo e sem expor credenciais.
- [x] **Filtros multiseleção (19/11/2026):** os sete filtros do painel principal (banca, disciplina, assunto, cargo, órgão, ano e nível) viraram dropdowns de múltipla escolha com busca interna (ignora acento), checkbox, ações “Selecionar todos/visíveis” e “Limpar”, fecha com clique fora/Esc. Lista vazia = “todas”. Curso/ano etc. podem ser combinados (ex.: 2 disciplinas + 2 anos). Simulado continua com seleção única (decisões de sorteio).
- [ ] **Caderno de Erros:** Aba dedicada para focar exclusivamente na repetição de questões marcadas com erro.
- [x] **Formatação — resíduos limpos (19/11/2026):** saneamento em massa de todo o banco (3.771 → 4.715 questões com texto corrigido em algum campo, 7.650 campos no total). `parser/sanitizar_residuos.py` aplica, por campo: (A/B/C) remoção de marca d'água/rodapé do PDF (`www.pciconcursos.com.br` com ou sem espaços `w ww`, `GABARITO n`, `<nº> <CARGO CAPS> GABARITO n`, `PROVA n - GABARITO n - <seção>`, espelhos `R A SC U N H O` / `O H N U …`, `NÍVEL MÉDIO/FUNDAMENTAL/SUPERIOR`, `CONHECIMENTOS ESPECÍFICOS/BÁSICOS`, `FORMAÇÃO: …`, `PROVA n [A-Z] -`, sequências-CAPS de 4+ tokens, sequências de tokens de ≤2 letras exceto julgamento V/F/C/E); (D) colapso de espaços/quebras/pontuação; (E) segmentação de "texto juntos" (tokens ≥12 letras sem espaço) por programação dinâmica que minimiza o nº de palavras contra o dicionário pt-BR (desempate por palavras mais longas; tokens já no dicionário intactos; a/e/o e funcionais de 2 letras; siglas ALL-CAPS ≤6 mantidas; **se qualquer pedaço falhar, o token inteiro é preservado e logado** — 268 tokens assim, ex. termos técnicos fora do dicionário); (F) números de linha soltos removidos só com progressão múltipla de 5 ativa (136 textos); (G) **16 questões removidas** por irrecuperabilidade (enunciados-muro ou alternativa cujo gabarito era só lixo de digitalização; ver `data/questoes_removidas.json` para auditoria). **97 alternativas-vaso** (conteúdo zero pós-limpeza, gabarito em outra) foram deletadas — sobram A–D válidas. Schema 100% válido (normalizar --dry-run), IDs únicos, gabaritos dentro das alternativas, 17.714 → **17.698 questões**. Web sincronizado (19 MB, ~4,0 MB gzip).
  - **Resíduos cosméticos conhecidos (não vale limpar):** splits ocasionais em compostos técnicos fora do dicionário (`autoexecutoriedade` preservada, `desfragmenta dor`, `coletiviza ção`), envelope `w ww.pcic…` totalmente removido, e lixo residual de cabeçalho em algumas alternativas E (ex.: sobra `- Microrregião`). São leitura-amiga, não impedem resolver.
  - **CONTEMAX 2022 (banco inclui questões de outra banca):** 25+ alternativas já nascem vazias na origem — problema de parsing, fora deste escopo.
- [x] **Formatação — resíduos (resolvido em 19/11/2026):** os quatro itens abaixo foram endereçados pelo saneamento de 19/11 (ver seção acima): palavras coladas → segmentação por dicionário + logs; números de linha → removidos só com progressão de passo 5; enunciados-muro → 16 questões irrecuperáveis removidas para `data/questoes_removidas.json`; bloco de alternativas vazado → 97 alternativas-vaso deletadas e 16 questões removidas (gabarito morto). Resta apenas a questão **TRANSPETRO 2006 Q22** (e 15 outras) documentada em `questoes_removidas.json`.
- [ ] **Importador Drag-and-Drop no Frontend (Opcional):** Permitir upload local de novo `questoes.json` direto pela interface do usuário.
- [x] **Concluir a coleta Cesgranrio (18/11/2026):** coleta finalizada — **1.230/1.230 cadernos do escopo com link liberado** (1.199 com PDF, 2.581 arquivos); os 2 cadernos restantes têm gabarito ambíguo e foram descartados por segurança. Pipeline reproduzível: `parser/fila_pci.py` → `parser/receptor_links.py` → `parser/coletor_links_pci.js` → `baixar_provas_pci.py` → `extrair_questoes.py` → `filtrar_escopo.py` → `mesclar_questoes.py` → `normalizar_banco.py`. Os IDs truncados em `coletados.json` foram corrigidos; a fila resumível está fechada (0 pendentes).
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
