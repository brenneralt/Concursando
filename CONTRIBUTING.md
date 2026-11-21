# Contribuindo

## Antes de abrir um PR

```bash
npm ci
npm run verificar   # lint + typecheck + testes + validação dos dados + build
```

O mesmo comando roda no CI. PR que falha em qualquer etapa não é publicado.

## Organização do código

- `src/app` — entrada, rotas e layout. Não coloque regra de negócio aqui.
- `src/components` — UI reutilizável e sem dependência de uma feature específica.
- `src/features/<área>` — componente + hook + regras puras da área.
  - Regras testáveis ficam em módulos sem React (`filtros.js`, `estatisticas.js`, `montarSimulado.js`, `enunciado.js`).
- `src/services` — integrações (Supabase, carregamento do catálogo).
- `src/test` — testes Vitest. Um arquivo por área, usando as fábricas de `fixtures.js`.

Imports devem ser relativos e explícitos. Não crie aliases sem necessidade.

## Dados

- `data/questoes.json` é **dado de produto**: toda alteração precisa passar em `npm run validar:dados`.
- Não edite questões em massa à mão. Prefira script em `parser/` com dry-run, relatório e execução separada.
- Nunca comite PDFs, links assinados ou credenciais. Veja `docs/dados.md`.
- Mudou o schema? Atualize, no mesmo PR: o validador (`scripts/validar-questoes.mjs`), o extrator/normalizador e esta documentação.

## Banco (Supabase)

- Alterações de schema vão em `supabase/migrations/` com nome numérico (`0002_...sql`), idempotentes quando possível.
- Toda tabela nova precisa de RLS habilitado e policies explícitas.
- Segredos administrativos (`service_role`) não entram no frontend, no repositório nem no workflow de deploy.

## Commits

Use Conventional Commits em português, como no histórico:

```text
feat(web): filtros multiseleção com busca
fix(dados): anexar textos de apoio ausentes
docs: documentar variáveis do Supabase
```

## Checklist do PR

- [ ] `npm run verificar` passa localmente.
- [ ] Testes novos cobrem a regra alterada.
- [ ] Dados alterados têm relatório ou justificativa no PR.
- [ ] README/docs atualizados quando o comportamento muda.
- [ ] Nenhum segredo, PDF ou artefato de build entrou no diff.
