# 📋 PROGRESS.md - Concurso-Questões

> **Instruções para IAs e Desenvolvedores:** Este arquivo é a fonte única de verdade sobre o andamento do projeto. Antes de iniciar qualquer alteração, leia este arquivo e o histórico do Git (`git log`). Ao concluir qualquer tarefa ou etapa, atualize este arquivo e faça o commit semântico correspondente.

---

## 🎯 Visão Geral do Projeto
Plataforma web moderna, rápida e focada na resolução e treino de questões de concursos públicos (estilo QConcursos), com foco em catalogação limpa e sem ruídos, estruturada em:
1. **Módulo Parser (`/parser`):** Extração de PDFs e gabaritos, validação e normalização do banco JSON de questões.
2. **Módulo Web (`/web`):** Frontend SPA construído em React + Vite + Tailwind CSS, com persistência no `localStorage`, consumindo `questoes.json`. Hospedável gratuitamente na **Vercel** ou **GitHub Pages**.

---

## 📊 Status Atual de Desenvolvimento

- **Última Atualização:** 14/11/2026
- **Status Geral:** Módulo 1 (Parser & Schema) e Módulo 2 (Frontend SPA Base) inicializados e funcionais.

### ✅ O Que Já Está Feito e Testado
- [x] **Repositório Git:** Inicializado na branch `main` com `.gitignore` completo para Node/Python.
- [x] **Estrutura de Pastas:** Configurada conforme arquitetura (`data/`, `parser/`, `web/`).
- [x] **Banco Inicial de Questões (`data/questoes.json`):**
  - Questões reais/simuladas com padrão Cebraspe (Certo/Errado) e Múltipla Escolha (FGV, FCC, VUNESP).
  - Metadados completos: `banca`, `orgao`, `cargo`, `ano`, `disciplina`, `assunto`, `subassunto`, `modalidade`, `enunciado`, `alternativas`, `gabarito`, `explicacao`.
- [x] **Módulo Parser (`parser/`):**
  - `requirements.txt`: Dependências especificadas (`pypdf`, `pdfplumber`, `pydantic`, `tqdm`).
  - `normalizar_banco.py`: Validador de schema, limpador de textos, deduplicador e sincronizador automático com `web/public/questoes.json`.
  - `extrair_questoes.py`: Parser com regex para segmentação de questões de PDFs e pareamento com gabaritos oficiais.
- [x] **Módulo Frontend (`web/`):**
  - Setup React + Vite + Tailwind CSS.
  - Configuração do `vite.config.js` com `base: './'` para suporte tanto à Vercel quanto ao GitHub Pages.
  - Componente `Navbar`: Marca, contadores em tempo real e botão de desempenho.
  - Componente `Filtros`: Busca textual, filtros por Banca, Disciplina, Ano, Modalidade e chips de status (Todas, Não Resolvidas, Acertos, Erros, Salvas).
  - Componente `CardQuestao`: Seleção interativa de alternativas, gabarito instantâneo, gabarito comentado expansível e favoritar.
  - Componente `Estatisticas`: Painel com taxa de assertividade e distribuição por matéria.
  - Hooks `useQuestao` e `useLocalStorageProgress`: Persistência no navegador sem necessidade de backend.

---

## ⏳ O Que Falta Fazer (Backlog)
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

---

## 🧪 Como Rodar e Testar

### 1. Testar e Validar o Banco de Questões (Python):
```bash
# Validar e sincronizar o banco com a pasta pública do frontend:
python3 parser/normalizar_banco.py

# Apenas verificar sem salvar alterações:
python3 parser/normalizar_banco.py --dry-run
```

### 2. Rodar o Frontend Localmente (Node.js):
```bash
cd web
npm run dev
# Acesse no navegador: http://localhost:3000
```

### 3. Testar o Build de Produção:
```bash
cd web
npm run build
```
