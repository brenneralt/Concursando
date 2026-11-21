-- ============================================================================
-- Seed do Supabase
--
-- O catálogo de questões NÃO fica no Postgres: ele é servido como JSON estático
-- (`data/questoes.json` → `public/dados/questoes.json` no build). O banco guarda
-- apenas autenticação, perfis e progresso.
--
-- Este arquivo existe para o fluxo `supabase db reset` funcionar de ponta a
-- ponta. Ele é intencionalmente vazio e idempotente; dados de demonstração
-- devem ser criados em um seed local separado, nunca em produção.
-- ============================================================================

-- Nada a inserir por padrão.
select 1;
