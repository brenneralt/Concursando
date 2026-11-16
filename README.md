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

O MCP **não entrega PDFs** e o site protege os arquivos com uma verificação
de segurança (Turnstile). O download em si é sempre feito por você, no
navegador — mas o trabalho braçal em volta é automatizado pelo
`parser/baixar_provas.py` (não contorna a verificação; só organiza):

```bash
# Ver o status do acervo (todas as 2.718 provas Cesgranrio; --orgao IBGE p/ recorte)
# As colunas P/G mostram o que já está no disco; --faltando lista o incompleto
python3 parser/baixar_provas.py --listar
python3 parser/baixar_provas.py --faltando gabarito

# Modo automático (recomendado): abre cada página pendente no seu navegador e
# vigia a pasta de Downloads; você só resolve a verificação e clica em baixar.
python3 parser/baixar_provas.py --auto --orgao IBGE --limite 10 --espera 120

# Modo interativo: o mesmo, mas pergunta ENTER a cada prova baixada.
python3 parser/baixar_provas.py                 # todas
python3 parser/baixar_provas.py --orgao IBGE    # só IBGE
python3 parser/baixar_provas.py --termo agente --ano 2009

# Importar PDFs já baixados manualmente (sem passar pelo fluxo interativo)
python3 parser/baixar_provas.py --importar <id-da-prova> prova.pdf gabarito.pdf
```

O status fica em `data/raw_pdfs/manifest.json` (`pendente`, `baixada`,
`parcial`, `pulada`). Os arquivos ficam em `data/raw_pdfs/<id>_prova.pdf` e
`<id>_gabarito.pdf`, prontos para o parser:
```bash
python3 parser/extrair_questoes.py --dir "data/raw_pdfs" \
  --out data/questoes.json --report data/relatorio_parser.json --verbose
python3 parser/normalizar_banco.py
```

> O parser atual está calibrado para IGECAP/CONTEMAX. Provas de outras bancas
> (Cesgranrio, FGV, etc.) podem exigir ajustes em `parse_sections()`,
> `read_gabarito_meta()` e `infer_banca()`.

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
