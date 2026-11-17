# 🎯 Concurso-Questões

Plataforma web moderna, rápida e responsiva para resolução e treino de questões de concursos públicos (estilo QConcursos), desenvolvida para eliminar o ruído visual e os problemas crônicos de catalogação dos sites tradicionais.

Desenvolvida para rodar com custo zero na **Vercel** ou no **GitHub Pages**.

---

## 🗂️ Arquitetura do Repositório

```text
concurso-questoes/
├── PROGRESS.md                    # Tracker de status e handoff para outras IAs
├── README.md                      # Instruções de setup e deploy
├── opencode.json                  # MCP público da PCI Concursos para agentes
├── data/
│   ├── raw_pdfs/                  # PDFs originais de provas e gabaritos
│   └── questoes.json              # Banco mestre normalizado de questões
├── parser/                        # MÓDULO 1: Extrator e Normalizador (Python)
│   ├── requirements.txt
│   ├── extrair_questoes.py        # Extrai questões e pareia com gabarito
│   ├── normalizar_banco.py        # Valida schema e sincroniza com o frontend
│   ├── pci_mcp.py                 # Cliente do MCP público da PCI Concursos
│   ├── buscar_provas.py           # Busca provas/concursos via MCP (até 50)
│   └── raspador_pci.py            # Raspa o site do PCI (lista completa, sem limite de 50)
└── web/                           # MÓDULO 2: Frontend SPA (React + Vite + Tailwind)
    ├── package.json
    ├── public/questoes.json       # Consumido via fetch pelo frontend
    └── src/
        ├── components/            # Filtros, CardQuestao, Estatisticas, Navbar
        ├── hooks/                 # useQuestao, useLocalStorageProgress
        └── App.jsx
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Node.js** >= 18
- **Python** >= 3.10

### 1. Backend/Parser (Normalização dos Dados)
```bash
# Validar e sincronizar as questões para o frontend
python3 parser/normalizar_banco.py
```

### 2. Frontend Web
```bash
cd web
npm install
npm run dev
```
Acesse no seu navegador: `http://localhost:3000`

---

## ☁️ Login e ranque (Supabase)

O progresso de cada usuário fica salvo na nuvem (Supabase) e há um **ranque
público de questões resolvidas** com apelido escolhido.

1. Cole o arquivo [`supabase/schema.sql`](supabase/schema.sql) no **SQL Editor**
   do seu projeto Supabase (Settings → API mostra a URL e a chave pública).
2. As credenciais já estão em `web/src/supabase.js` (URL + publishable key são
   públicas; troque se mudar de projeto).
3. No frontend, use **Entrar → Criar conta**, escolha o apelido e comece a
   resolver questões. O ranque aparece no botão "Ranque" da navbar.

> Sem login, o app continua funcionando off-line usando `localStorage`.

---

## 🔎 Buscar provas e concursos (MCP da PCI Concursos)

O projeto usa o **MCP público da PCI Concursos** (`https://mcp.pciconcursos.com.br/mcp`)
para descobrir provas anteriores (prova + gabarito) e concursos abertos.

### Pelo OpenCode

O [opencode.json](opencode.json) já registra o servidor `pci-concursos`. Basta pedir
ao agente, por exemplo:

> "Pesquise provas da Cesgranrio para agente administrativo."
> "Quais concursos para técnico legislativo estão abertos na Paraíba?"

As ferramentas ficam disponíveis com o prefixo `pci-concursos`
(`pci-concursos_pesquisar_provas`, `pci-concursos_pesquisar_concursos`,
`pci-concursos_buscar_por_cargo`, `pci-concursos_buscar_por_cidade` e
`pci-concursos_listar_concursos`). No Code Mode elas aparecem agrupadas em
`tools["pci-concursos"]`.

### Pelo terminal

```bash
# Provas anteriores (ano, órgão, cargo, banca e link da página no PCI)
python3 parser/buscar_provas.py provas "cesgranrio agente administrativo"

# Gera um painel HTML com links e nomes de arquivo sugeridos
python3 parser/buscar_provas.py provas "cesgranrio agente administrativo" \
  --html painel_provas.html --abrir

# Exporta os resultados
python3 parser/buscar_provas.py provas "cesgranrio" \
  --json data/pci_cesgranrio.json --csv data/pci_cesgranrio.csv --limite 20

# Concursos abertos / prestes a abrir
python3 parser/buscar_provas.py concursos "legislativo" --uf pb
python3 parser/buscar_provas.py cargo "agente administrativo" --uf pb
python3 parser/buscar_provas.py cidade "Campina Grande" --uf pb

# Lista as ferramentas disponíveis no servidor
python3 parser/buscar_provas.py ferramentas
```

### Limitação importante

O MCP devolve no máximo 50 provas por consulta. Para varrer o acervo inteiro
(ex.: todas as 2.718 provas da Cesgranrio), use o raspador direto do site:

```bash
# Lista completa de um termo, com painel HTML, JSON e CSV
python3 parser/raspador_pci.py "cesgranrio" \
  --html painel_cesgranrio.html --json data/pci_cesgranrio.json --csv data/pci_cesgranrio.csv

# Só as primeiras N páginas (cada página tem 50 provas)
python3 parser/raspador_pci.py "cesgranrio agente administrativo" --paginas 5
```

O MCP **não entrega PDFs** e o site protege os arquivos com a verificação
Cloudflare Turnstile. Num Chromium real a verificação é resolvida
automaticamente e a página libera URLs assinadas
(`/provas/<id>/<hash>/arquivo.pdf`); não há contorno de CAPTCHA, só o uso do
link que o próprio site liberou. O fluxo tem duas etapas:

1. **Coletar os links liberados** (feito pelo agente no navegador, uma vez por
   lote) e salvar num JSON no formato:
   ```json
   [{"id": "<slug>", "ok": true,
     "arquivos": [{"arquivo": "prova.pdf", "href": "https://..."}]}]
   ```
   O recorte já coletado do IBGE está em `data/links_pci_ibge.json`
   (83 provas, 166 arquivos).
2. **Baixar os PDFs** com o script:

```bash
python3 parser/baixar_provas_pci.py --links data/links_pci_ibge.json
python3 parser/baixar_provas_pci.py --links data/links_pci_ibge.json --forcar
```

Os arquivos ficam em `data/raw_pdfs/<slug>_prova.pdf` e
`<slug>_gabarito.pdf` (downloads já existentes são preservados, a menos que se
use `--forcar`), com o registro em `data/raw_pdfs/manifest.json`. Depois:

```bash
python3 parser/extrair_questoes.py --dir data/raw_pdfs \
  --out data/questoes_ibge.json --report data/relatorio_ibge.json \
  --meta data/pci_cesgranrio.json --verbose
python3 parser/normalizar_banco.py
```

Para lotes grandes (todo o acervo Cesgranrio), dá para recortar por nível e por
cargo já na extração, e exigir cobertura mínima do gabarito para descartar
cadernos mal extraídos:

```bash
python3 parser/extrair_questoes.py --dir data/raw_pdfs \
  --out /tmp/questoes_cesgranrio.json --report data/relatorio_cesgranrio.json \
  --meta data/pci_cesgranrio.json --all-cargos \
  --excluir-cargos "enfermagem,fiscal,servicos gerais,limpeza,cozinha,merendeira" \
  --niveis "Fundamental,Médio" --min-cobertura 0.95 --verbose

python3 parser/mesclar_questoes.py --novo /tmp/questoes_cesgranrio.json
python3 parser/normalizar_banco.py
```

> O parser já entende o caderno padrão da Cesgranrio: duas colunas (ordem de
> leitura reconstruída via `pdftotext -bbox-layout`), numeração isolada,
> alternativas `(A)` e gabarito com uma página por cargo. `--meta` usa o JSON
> do raspador (`descricao`, `orgao`, `ano`) para corrigir cargo/órgão/ano —
> o texto do PDF costuma truncar nomes de cargo.

---

## 📦 Build para Produção & Deploy

### Gerar os arquivos estáticos:
```bash
cd web
npm run build
```
O build estático otimizado será gerado na pasta `web/dist/`.

### Hospedagem na Vercel:
- **Framework Preset:** Vite
- **Root Directory:** `web`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

### Hospedagem no GitHub Pages:
- O Vite já está configurado com `base: './'` no [vite.config.js](file:///home/brenneralt/.gemini/antigravity/scratch/concurso-questoes/web/vite.config.js).
- Basta publicar a pasta `web/dist` ou utilizar a Action padrão do GitHub Pages.

---

## 👥 Fluxo Multi-Agentes & Continuidade
Consulte sempre o arquivo [PROGRESS.md](file:///home/brenneralt/.gemini/antigravity/scratch/concurso-questoes/PROGRESS.md) para verificar o checklist de status, decisões arquiteturais e tarefas pendentes.
