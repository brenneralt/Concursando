-- ============================================================================
-- Supabase: banco da plataforma Concurso-Questões
-- Cole tudo no SQL Editor do seu projeto Supabase (https://supabase.com/dashboard)
-- ============================================================================

-- Apelido único para cada usuário (fica visível no ranque)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  apelido text not null unique check (length(apelido) between 3 and 24),
  total_resolvidas int not null default 0,
  total_acertos int not null default 0,
  pct_acerto numeric(5,2) not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Progresso de cada usuário por questão (privado)
create table if not exists progresso (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  questao_id text not null,
  alternativa char(1),                    -- A-E (null = apenas favoritada/zerada)
  acerto boolean not null default false,
  respondida_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, questao_id)
);

-- View pública do ranque (qualquer logado pode ler)
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

-- ===================================================================
-- Row Level Security
-- ===================================================================
alter table profiles enable row level security;
alter table progresso enable row level security;

-- Todos podem ler o perfil e o ranque
create policy if not exists profiles_select_all on profiles
  for select using (true);
create policy if not exists ranque_select_all on ranque
  for select using (true);

-- Mas cada um só edita o próprio perfil
create policy if not exists profiles_update_own on profiles
  for update using (auth.uid() = id);

-- Cada um lê/escreve só o próprio progresso
create policy if not exists progresso_select_own on progresso
  for select using (auth.uid() = user_id);
create policy if not exists progresso_insert_own on progresso
  for insert with check (auth.uid() = user_id);
create policy if not exists progresso_update_own on progresso
  for update using (auth.uid() = user_id);

-- ===================================================================
-- Trigger: cria perfil com apelido aleatório ao cadastrar
-- ===================================================================
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

-- ===================================================================
-- Função auxiliar: atualiza contadores do perfil a partir do progresso
-- Roda uma vez, usada pelo cliente a cada alteração
-- ===================================================================
create or replace function public.atualizar_perfil(p_user_id uuid)
returns void as $$
begin
  update profiles p
  set
    total_resolvidas = sub.tot,
    total_acertos    = sub.acr,
    pct_acerto       = case when sub.tot > 0
                            then round((sub.acr::numeric / sub.tot) * 100, 2)
                            else 0 end,
    atualizado_em    = now()
  from (
    select count(*)::int as tot, coalesce(sum(case when acerto then 1 else 0 end), 0)::int as acr
    from progresso
    where user_id = p_user_id and alternativa is not null
  ) sub
  where p.id = p_user_id;
end;
$$ language plpgsql security definer;
