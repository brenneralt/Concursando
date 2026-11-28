# ConcursoQuestões

Plataforma de treino para concursos públicos: catálogo de questões da **Cesgranrio** (nível médio/fundamental) e de bancas municipais **IGECAP/CONTEMAX**, com resolução comentada por alternativa, filtros combináveis, estatísticas por disciplina, simulado cronometrado e ranque entre contas.

O app é uma SPA estática (React + Vite) servida pelo GitHub Pages. O catálogo é um JSON versionado; o Supabase guarda apenas **contas, perfis e progresso**.

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 18, Vite 6, Tailwind CSS 3, React Router (HashRouter) |
| Dados | JSON estático em `data/questoes.json` (17.698 questões) |
| Contas/progresso | Supabase (Auth + Postgres com RLS) |
| Extração | Python 3 (`parser/`), pdfplumber e regras por banca |
| Testes | Vitest |
| CI/CD | GitHub Actions → GitHub Pages |

---

## Estrutura

```text
.
├── src/
│   ├── app/                 # entrada, rotas e layout principal
│   ├── components/          # UI compartilhada (Navbar, MultiSelect, RotaProtegida)
│   ├── features/
│   │   ├── conta/           # login e escolha de apelido
│   │   ├── questoes/        # card, filtros, texto de apoio e hook de catálogo
│   │   ├── simulados/       # montagem, cronômetro e correção do simulado
│   │   └── desempenho/      # progresso, estatísticas e ranque
│   ├── services/            # Supabase e carregamento do catálogo
│   └── test/                # testes de filtros, correção, estatísticas e simulado
├── public/dados/            # GERADO no build (não versionado)
├── scripts/
│   ├── preparar-dados.mjs   # data/questoes.json → public/dados/
│   ├── validar-questoes.mjs # validação do dado de produto (roda no CI)
│   └── separar-materiais.mjs# proposta de migração para material_id/materiais
├── data/                    # catálogo, relatórios e PDFs brutos (política em docs/dados.md)
├── parser/                  # pipeline de extração/normalização em Python
├── supabase/
│   ├── migrations/          # schema + RLS versionados
│   └── seed.sql             # vazio por design (catálogo não fica no Postgres)
├── .github/workflows/       # CI + deploy do Pages
└── docs/                    # políticas de dados e operação
```

O frontend e o `package.json` ficam na **raiz**: existe um único caminho de build, usado tanto localmente quanto no CI.

---

## Como rodar

Pré-requisitos: **Node.js 22+** e **npm**.

```bash
npm ci
cp .env.example .env   # preencha as variáveis públicas do Supabase (opcional para navegar)
npm run dev            # http://localhost:3000
```

`npm run dev` copia `data/questoes.json` para `public/dados/` antes de subir o Vite. O arquivo gerado não é versionado.

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Copia os dados e gera `dist/` |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | ESLint |
| `npm run typecheck` | Checagem sintática/tipos com `tsc` (JS + JSDoc, sem migrar para TS) |
| `npm run test` | Testes Vitest (regras puras: acesso, rotas, filtros, simulados) |
| `npm run test:db` | Sobe um PostgreSQL local e testa RLS + funções de acesso de verdade (substituto do `supabase test db`) |
| `npm run validar:dados` | Valida schema, ids, alternativas, gabaritos e materiais |
| `npm run materiais:separar` | Gera proposta de separação texto de apoio × comando (dry-run) |
| `npm run verificar` | Lint + typecheck + testes + testes de banco + validação + build (mesmo gate do CI) |

---

## Dados

- **Fonte:** provas oficiais publicadas pelas bancas, coletadas via acervo público do PCI Concursos e PDFs locais. O processo e os direitos de uso estão em [`docs/dados.md`](docs/dados.md).
- **Escopo:** nível médio/fundamental; Cesgranrio (17.018 questões) + IGECAP/CONTEMAX (680). Enfermagem, fiscal, serviços gerais, limpeza, cozinha e merendeira ficam fora.
- **Schema:** 12 campos obrigatórios por questão (`id`, `banca`, `ano`, `orgao`, `cargo`, `nivel`, `disciplina`, `assunto`, `enunciado`, `alternativas`, `gabarito`, `anulada`), mais o opcional `material_id`.
- **Regras do validador:** ids únicos, alternativas contíguas A–E, gabarito existente entre as alternativas, questão anulada com `gabarito: null`, `ano` inteiro e enunciado não vazio. Questões-imagem e referências a texto ausente saem como **aviso**, para revisão humana.
- **Atualização:** `python3 parser/normalizar_banco.py` audita e reescreve o banco; `python3 parser/anexar_textos_apoio.py` recupera textos de apoio a partir dos PDFs. Sempre rode `npm run validar:dados` e `npm run verificar` depois.

### Texto de apoio × comando

O acervo atual guarda o texto de apoio no início do `enunciado`, separado do comando por uma linha em branco. O frontend entende os dois formatos:

- **legado:** separa na primeira linha em branco;
- **novo:** questão com `material_id` + registro em `data/materiais.json`
  (`{ id, tipo, conteudo, fonte: { arquivo, pagina_inicial, pagina_final } }`), permitindo compartilhar o mesmo texto entre várias questões.

`npm run materiais:separar` gera uma proposta em `data/migracao_materiais/` (questões, materiais deduplicados e relatório). Nada é aplicado sem revisão; `--aplicar` promove a proposta para `data/materiais.json` e `data/questoes.json`.

---

## Contas e Supabase

1. Crie um projeto gratuito no [Supabase](https://supabase.com).
2. Rode as migrations de `supabase/migrations/` no SQL Editor (ou `supabase db push`).
3. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. No GitHub, cadastre os mesmos valores em **Settings → Secrets and variables → Actions**.

Somente variáveis com prefixo `VITE_` chegam ao navegador — e isso é intencional para a URL e a **chave anônima**, que são públicas. A `service_role` **nunca** deve ir para o frontend nem para o CI de deploy: ela ignora RLS.

As policies em `supabase/migrations/0001_schema_rls.sql` garantem que:

- `profiles` é legível por todos (ranque) e gravável apenas pelo dono;
- `progresso` é privado (select/insert/update/delete só do próprio `user_id`);
- `atualizar_perfil()` recalcula contadores e recusa atualizar perfil alheio.

A migration `supabase/migrations/0002_user_access.sql` adiciona o **controle de acesso por aprovação**:

- Tabela separada `user_access` (status `pending` / `approved` / `blocked`, `is_admin`, quem aprovou/bloqueou e quando).
- Novo cadastro nasce `pending` e não acessa as áreas protegidas.
- `progresso` e `ranque` só funcionam para contas `approved`.
- Ações administrativas (`listar_usuarios`, `definir_acesso`, `definir_admin`) verificam `is_admin` no próprio banco.
- Conta bloqueada perde acesso mesmo com sessão ativa.

Garantias aplicadas no banco (independem do frontend):

- `GRANT` explícito: `anon` **não** tem acesso algum a `user_access`; `authenticated` só tem `SELECT` (restrito à própria linha pelo RLS) — não existe caminho de escrita direta, logo ninguém se auto-aprova.
- Todas as funções são `SECURITY DEFINER` com `set search_path = ''` e referências qualificadas por schema (`public.*`, `auth.*`).
- Regras administrativas: administrador não se bloqueia/pendenta nem remove a própria admin; não é possível promover conta `pending`/`blocked`; o auto-lockout impedido mantém sempre pelo menos um administrador ativo.
- `auth.users` não é legível pela API: `listar_usuarios()` junta internamente (com `search_path` vazio) e só devolve para administradores.

**Testes do banco:** `npm run test:db` sobe um PostgreSQL descartável local (via `embedded-postgres`), aplica `0001` + `0002` e executa ~27 asserções de RLS/funções (é o equivalente ao `supabase test db` sem exigir Docker/CLI). Roda dentro de `npm run verificar` e no CI. **Limitação:** o harness recria `auth.uid()`/papéis do Supabase; a validação final no projeto Supabase real (SQL Editor + `supabase db push`) continua sendo um passo manual de publicação.

**Bootstrap do administrador (rode uma vez no SQL Editor, após aplicar as migrations):**

```sql
update public.user_access
set status = 'approved', is_admin = true, updated_at = now()
where user_id = (select id from auth.users where lower(email) = lower('SEU_EMAIL@email.com'));
```

Este `UPDATE` é intencionalmente manual e só funciona para quem tem acesso ao SQL Editor (dono das tabelas, fora da API). Enquanto não existir nenhum administrador aprovado, **não existe painel** que consiga aprovar ninguém — por isso este passo é obrigatório antes de publicar a Etapa 1.

Depois disso, acesse `/admin` no site para aprovar os demais cadastros.

A conta é obrigatória em toda a navegação: sem sessão, o app redireciona para `/login` e volta ao destino original depois do acesso.

---

## Visão de produto e roadmap

O objetivo de longo prazo é evoluir o Concursando de uma plataforma de questões para uma biblioteca comunitária que centralize, relacione e compartilhe conhecimento: questões, assuntos, aulas, documentos e referências.

**Princípio central:** em vez de três pessoas organizarem o mesmo conteúdo separadamente, a comunidade constrói uma biblioteca compartilhada.

O roadmap, as decisões de arquitetura, as etapas de implementação e os cuidados de acesso, privacidade e licenciamento estão registrados em [docs/visao-produto-biblioteca-conhecimento.md](docs/visao-produto-biblioteca-conhecimento.md).

**Ordem de prioridade registrada:** (1) cadastro com confirmação de e-mail e aprovação administrativa; (2) biblioteca de recursos independente das questões e dos provedores; (3) contribuições moderadas e compartilhamento; (4) integrações com YouTube, Drive e Telegram; (5) melhorias de descoberta e inteligência. Não implementar os vídeos dos cursos antes de concluir o controle de acesso.

---

## Deploy

O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) roda em push para `main` (e em pull requests, apenas os checks):

1. `npm ci` (instalação reproduzível pelo lockfile);
2. lint, typecheck, testes, validação do banco e build;
3. publicação do `dist/` como artefato do Pages **somente** se todos os passos passarem.

O Pages precisa estar configurado em **Settings → Pages → Source: GitHub Actions**. O Vite usa `base: './'`, então o app funciona em subpasta (`/Concursando/`), e o `HashRouter` evita 404 em rotas profundas.

> Não publique `dist/` manualmente na branch `main`. Isso substitui o histórico do repositório pelo conteúdo do build.

---

## Licença

Código sob [MIT](LICENSE). Os enunciados, alternativas e textos de apoio pertencem às bancas organizadoras e são usados exclusivamente para estudo; consulte [`docs/dados.md`](docs/dados.md) antes de redistribuir o acervo.
