# 🎯 Concurso-Questões

Plataforma web moderna, rápida e responsiva para resolução e treino de questões de concursos públicos (estilo QConcursos), desenvolvida para eliminar o ruído visual e os problemas crônicos de catalogação dos sites tradicionais.

Desenvolvida para rodar com custo zero na **Vercel** ou no **GitHub Pages**.

---

## 🗂️ Arquitetura do Repositório

```text
concurso-questoes/
├── PROGRESS.md                    # Tracker de status e handoff para outras IAs
├── README.md                      # Instruções de setup e deploy
├── data/
│   ├── raw_pdfs/                  # PDFs originais de provas e gabaritos
│   └── questoes.json              # Banco mestre normalizado de questões
├── parser/                        # MÓDULO 1: Extrator e Normalizador (Python)
│   ├── requirements.txt
│   ├── extrair_questoes.py        # Extrai questões e pareia com gabarito
│   └── normalizar_banco.py        # Valida schema e sincroniza com o frontend
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
