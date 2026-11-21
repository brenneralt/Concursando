-- ============================================================================
-- Supabase: banco da plataforma Concurso-Questões
-- Cole tudo no SQL Editor do seu projeto Supabase (https://supabase.com/dashboard)
-- Pode rodar várias vezes sem quebrar (idempotente).
-- ============================================================================

-- 1) Perfil público de cada usuário (apelido é escolhido no primeiro acesso)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  apelido text not null unique check (length(apelido) between 3 and 24),
  total_resolvidas int not null default 0,
  total_acertos int not null default 0,
  pct_acerto numeric(5,2) not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- 2) Progresso de cada usuário por questão (privado)
create table if not exists progresso (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  questao_id text not null,
  alternativa char(1),                    -- A-E (null = zerada/favoritada)
  acerto boolean not null default false,
  respondida_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, questao_id)
);

-- Se a tabela já existe de uma execução anterior, garante a coluna alternativa
alter table progresso add column if not exists alternativa char(1);

-- 3) View pública do ranque (lê apenas profiles, que permite leitura geral)
create or replace view ranque as
select
  p.id,
  p.apelido,
  p.total_resolvidas,
  p.total_acertos,
  p.pct_acerto,
  rank() over (order by p.total_resolvidas desc, p.total_acertos desc) as posicao
from profiles p
order by posicao;

-- 4) Row Level Security
alter table profiles enable row level security;
alter table progresso enable row level security;

-- 4.1) profiles: leitura pública, escrita só do próprio dono
drop policy if exists profiles_select_all on profiles;
create policy profiles_select_all on profiles
  for select using (true);

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (auth.uid() = id);

-- 4.2) progresso: cada um só lê/escreve o próprio progresso
drop policy if exists progresso_select_own on progresso;
create policy progresso_select_own on progresso
  for select using (auth.uid() = user_id);

drop policy if exists progresso_insert_own on progresso;
create policy progresso_insert_own on progresso
  for insert with check (auth.uid() = user_id);

drop policy if exists progresso_update_own on progresso;
create policy progresso_update_own on progresso
  for update using (auth.uid() = user_id);

drop policy if exists progresso_delete_own on progresso;
create policy progresso_delete_own on progresso
  for delete using (auth.uid() = user_id);

-- 4.3) Granularidade fina para o papel authenticated
grant select on profiles to anon, authenticated;
grant select on ranque to anon, authenticated;
grant select, insert, update, delete on progresso to authenticated;

-- 5) Trigger: cria o perfil automaticamente quando o usuário se cadastra
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, apelido, total_resolvidas, total_acertos, pct_acerto)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'apelido'), ''),
      'usuario_' || substr(md5(new.id::text), 1, 8)
    ),
    0, 0, 0
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 6) Função: recalcula contadores do perfil a partir da tabela progresso.
--    Restrita ao próprio usuário, para ninguém atualizar perfil alheio.
create or replace function public.atualizar_perfil(p_user_id uuid)
returns void as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Não autorizado';
  end if;

  update profiles p
  set
    total_resolvidas = sub.tot,
    total_acertos    = sub.acr,
    pct_acerto       = case when sub.tot > 0
                            then round((sub.acr::numeric / sub.tot) * 100, 2)
                            else 0 end,
    atualizado_em    = now()
  from (
    select
      count(*)::int as tot,
      coalesce(sum(case when acerto then 1 else 0 end), 0)::int as acr
    from progresso
    where user_id = p_user_id and alternativa is not null
  ) sub
  where p.id = p_user_id;
end;
$$ language plpgsql security definer;

grant execute on function public.atualizar_perfil(uuid) to authenticated;
