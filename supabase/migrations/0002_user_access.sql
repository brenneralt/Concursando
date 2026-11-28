-- ============================================================================
-- Supabase: controle de acesso por aprovação administrativa (Etapa 1)
-- Nova migration versionada; NÃO altera 0001_schema_rls.sql.
-- Estados de acesso: 'pending' | 'approved' | 'blocked'
--
-- Princípios aplicados:
--   * autorização em uma tabela própria (user_access), fora de profiles;
--   * RLS + GRANTs explícitos (nenhum substitui o outro);
--   * funções SECURITY DEFINER com `set search_path = ''` e nomes qualificados;
--   * verificação de papel no banco; nada confiado ao navegador;
--   * nenhum segredo / `service_role` envolvido.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabela de autorização separada do perfil (profiles segue público).
-- ----------------------------------------------------------------------------
create table if not exists public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'blocked')),
  is_admin boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  blocked_by uuid references auth.users(id) on delete set null,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2) Trigger: cria user_access (pending) ao cadastrar.
--    Função de trigger: só executa no contexto de trigger, não é chamável
--    como RPC; por isso o EXECUTE segue concedido via PUBLIC (a API de
--    autenticação do Supabase grava em auth.users sem papel revogado aqui).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_access (user_id, status, is_admin)
  values (new.id, 'pending', false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_access on auth.users;
create trigger on_auth_user_created_access
  after insert on auth.users
  for each row execute procedure public.handle_new_user_access();

-- Backfill: contas existentes sem user_access viram 'pending'.
insert into public.user_access (user_id, status, is_admin)
select u.id, 'pending', false
from auth.users u
left join public.user_access a on a.user_id = u.id
where a.user_id is null
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 3) RLS: usuário lê apenas o próprio status; nenhuma escrita direta.
-- ----------------------------------------------------------------------------
alter table public.user_access enable row level security;

drop policy if exists user_access_select_own on public.user_access;
create policy user_access_select_own on public.user_access
  for select using (auth.uid() = user_id);

-- Sem policies de insert/update/delete para anon/authenticated: alterações
-- acontecem apenas pelas funções administrativas (SECURITY DEFINER).

-- ----------------------------------------------------------------------------
-- 4) GRANTs explícitos (independem dos privilégios padrão do Supabase).
--    - anon: sem acesso algum à tabela;
--    - authenticated: somente SELECT (o RLS restringe à própria linha);
--    - service_role: mantém acesso total (dashboard/backup).
-- ----------------------------------------------------------------------------
revoke all on table public.user_access from anon;
revoke all on table public.user_access from authenticated;
grant select on table public.user_access to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Ranque: apenas contas aprovadas aparecem.
-- ----------------------------------------------------------------------------
create or replace view public.ranque as
select
  p.id,
  p.apelido,
  p.total_resolvidas,
  p.total_acertos,
  p.pct_acerto,
  rank() over (order by p.total_resolvidas desc, p.total_acertos desc) as posicao
from public.profiles p
join public.user_access ua on ua.user_id = p.id
where ua.status = 'approved'
order by posicao;

-- Mantém as permissões já concedidas em 0001 (o REPLACE preserva, mas o
-- grant explícito deixa a intenção registrada e idempotente).
grant select on public.ranque to anon;
grant select on public.ranque to authenticated;

-- ----------------------------------------------------------------------------
-- 6) progresso: apenas contas aprovadas leem/escrevem o próprio progresso.
-- ----------------------------------------------------------------------------
drop policy if exists progresso_select_own on public.progresso;
create policy progresso_select_own on public.progresso
  for select using (
    auth.uid() = user_id
    and exists (select 1 from public.user_access ua
                where ua.user_id = auth.uid() and ua.status = 'approved')
  );

drop policy if exists progresso_insert_own on public.progresso;
create policy progresso_insert_own on public.progresso
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.user_access ua
                where ua.user_id = auth.uid() and ua.status = 'approved')
  );

drop policy if exists progresso_update_own on public.progresso;
create policy progresso_update_own on public.progresso
  for update using (
    auth.uid() = user_id
    and exists (select 1 from public.user_access ua
                where ua.user_id = auth.uid() and ua.status = 'approved')
  );

drop policy if exists progresso_delete_own on public.progresso;
create policy progresso_delete_own on public.progresso
  for delete using (
    auth.uid() = user_id
    and exists (select 1 from public.user_access ua
                where ua.user_id = auth.uid() and ua.status = 'approved')
  );

-- ----------------------------------------------------------------------------
-- 7) atualizar_perfil: só o próprio usuário e somente se aprovado.
-- ----------------------------------------------------------------------------
create or replace function public.atualizar_perfil(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Não autorizado';
  end if;

  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.status = 'approved'
  ) then
    raise exception 'Acesso não autorizado';
  end if;

  update public.profiles p
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
    from public.progresso
    where user_id = p_user_id and alternativa is not null
  ) sub
  where p.id = p_user_id;
end;
$$;

revoke execute on function public.atualizar_perfil(uuid) from public;
revoke execute on function public.atualizar_perfil(uuid) from anon;
grant execute on function public.atualizar_perfil(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) Funções administrativas: a verificação de papel acontece sempre no
--    banco (SECURITY DEFINER). `set search_path = ''` + nomes qualificados.
--    A chegação de admin é idêntica em todas as três: `is_admin = true` e
--    `status = 'approved'` no registro da própria sessão.
-- ----------------------------------------------------------------------------

-- 8.1) Lista de usuários (admin only). Junta auth.users internamente para não
--      expor a tabela auth.users diretamente pela API.
create or replace function public.listar_usuarios()
returns table (
  user_id uuid,
  email text,
  apelido text,
  status text,
  is_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  approved_at timestamptz,
  blocked_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid()
      and ua.is_admin = true
      and ua.status = 'approved'
  ) then
    raise exception 'Não autorizado';
  end if;

  return query
    select
      ua.user_id,
      u.email::text,
      p.apelido::text,
      ua.status,
      ua.is_admin,
      ua.created_at,
      ua.updated_at,
      ua.approved_at,
      ua.blocked_at
    from public.user_access ua
    join auth.users u on u.id = ua.user_id
    left join public.profiles p on p.id = ua.user_id
    order by
      case ua.status when 'pending' then 0 when 'approved' then 1 else 2 end,
      ua.created_at desc;
end;
$$;

revoke execute on function public.listar_usuarios() from public;
revoke execute on function public.listar_usuarios() from anon;
grant execute on function public.listar_usuarios() to authenticated;

-- 8.2) Definir status de acesso (admin only).
create or replace function public.definir_acesso(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo_eh_admin boolean;
begin
  if p_status not in ('pending', 'approved', 'blocked') then
    raise exception 'Status inválido';
  end if;

  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid()
      and ua.is_admin = true
      and ua.status = 'approved'
  ) then
    raise exception 'Não autorizado';
  end if;

  -- O administrador não pode tirar o próprio acesso (bloquear ou pendentar).
  if p_user_id = auth.uid() and p_status <> 'approved' then
    raise exception 'Você não pode remover o próprio acesso';
  end if;

  select ua.is_admin into alvo_eh_admin
  from public.user_access ua
  where ua.user_id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado';
  end if;

  -- Proteção contra perda acidental do último administrador ativo.
  if alvo_eh_admin and p_status <> 'approved' then
    if not exists (
      select 1 from public.user_access ua
      where ua.is_admin = true
        and ua.status = 'approved'
        and ua.user_id <> p_user_id
    ) then
      raise exception 'Operação impedida: existiria nenhum administrador ativo';
    end if;
  end if;

  update public.user_access
  set
    status = p_status,
    approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
    approved_at = case when p_status = 'approved' then now() else approved_at end,
    blocked_by = case when p_status = 'blocked' then auth.uid() else blocked_by end,
    blocked_at = case when p_status = 'blocked' then now() else blocked_at end,
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke execute on function public.definir_acesso(uuid, text) from public;
revoke execute on function public.definir_acesso(uuid, text) from anon;
grant execute on function public.definir_acesso(uuid, text) to authenticated;

-- 8.3) Promover/remover administrador (admin only).
create or replace function public.definir_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid()
      and ua.is_admin = true
      and ua.status = 'approved'
  ) then
    raise exception 'Não autorizado';
  end if;

  -- Não pode remover o próprio acesso de administrador.
  if p_user_id = auth.uid() and p_is_admin = false then
    raise exception 'Você não pode remover seu próprio acesso de administrador';
  end if;

  if p_is_admin then
    -- Só é possível promover uma conta já aprovada.
    if not exists (
      select 1 from public.user_access ua
      where ua.user_id = p_user_id and ua.status = 'approved'
    ) then
      raise exception 'Só é possível promover uma conta aprovada';
    end if;
  elsif not exists (
    select 1 from public.user_access ua
    where ua.user_id = p_user_id
  ) then
    raise exception 'Usuário não encontrado';
  end if;

  -- Proteção contra perda acidental do último administrador ativo.
  if p_is_admin = false
     and exists (
       select 1 from public.user_access ua
       where ua.user_id = p_user_id and ua.is_admin = true and ua.status = 'approved'
     )
     and not exists (
       select 1 from public.user_access ua
       where ua.is_admin = true
         and ua.status = 'approved'
         and ua.user_id <> p_user_id
     ) then
    raise exception 'Operação impedida: existiria nenhum administrador ativo';
  end if;

  update public.user_access
  set is_admin = p_is_admin, updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke execute on function public.definir_admin(uuid, boolean) from public;
revoke execute on function public.definir_admin(uuid, boolean) from anon;
grant execute on function public.definir_admin(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 9) Observação: nenhum papel comum pode alterar user_access (não existem
--    policies de insert/update/delete). Para reverter tudo em caso de
--    emergência:
--      drop policy user_access_select_own on public.user_access;
-- ----------------------------------------------------------------------------
