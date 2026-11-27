-- ============================================================================
-- Supabase: controle de acesso por aprovação administrativa (Etapa 1)
-- Nova migration versionada; NÃO altera 0001_schema_rls.sql.
-- Estados de acesso: 'pending' | 'approved' | 'blocked'
-- ============================================================================

-- 1) Tabela de autorização separada do perfil (profiles segue público).
create table if not exists user_access (
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

-- 2) Trigger: cria user_access (pending) ao cadastrar.
create or replace function public.handle_new_user_access()
returns trigger as $$
begin
  insert into public.user_access (user_id, status, is_admin)
  values (new.id, 'pending', false)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

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

-- 3) RLS: usuário lê apenas o próprio status; ninguém altera diretamente.
alter table user_access enable row level security;

drop policy if exists user_access_select_own on user_access;
create policy user_access_select_own on user_access
  for select using (auth.uid() = user_id);

-- Sem policies de insert/update/delete para authenticated/anon: alterações
-- só acontecem via RPCs security definer (admin), que verificam is_admin.

-- 4) Ranque: apenas contas aprovadas aparecem.
create or replace view ranque as
select
  p.id,
  p.apelido,
  p.total_resolvidas,
  p.total_acertos,
  p.pct_acerto,
  rank() over (order by p.total_resolvidas desc, p.total_acertos desc) as posicao
from profiles p
join user_access ua on ua.user_id = p.id
where ua.status = 'approved'
order by posicao;

-- 5) progresso: apenas contas aprovadas leem/escrevem o próprio progresso.
drop policy if exists progresso_select_own on progresso;
create policy progresso_select_own on progresso
  for select using (
    auth.uid() = user_id
    and exists (select 1 from public.user_access ua
                where ua.user_id = auth.uid() and ua.status = 'approved')
  );

drop policy if exists progresso_insert_own on progresso;
create policy progresso_insert_own on progresso
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.user_access ua
                where ua.user_id = auth.uid() and ua.status = 'approved')
  );

drop policy if exists progresso_update_own on progresso;
create policy progresso_update_own on progresso
  for update using (
    auth.uid() = user_id
    and exists (select 1 from public.user_access ua
                where ua.user_id = auth.uid() and ua.status = 'approved')
  );

drop policy if exists progresso_delete_own on progresso;
create policy progresso_delete_own on progresso
  for delete using (
    auth.uid() = user_id
    and exists (select 1 from public.user_access ua
                where ua.user_id = auth.uid() and ua.status = 'approved')
  );

-- 6) atualizar_perfil: recusa quem não está aprovado.
create or replace function public.atualizar_perfil(p_user_id uuid)
returns void as $$
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

-- 7) RPC administrativas (verificam is_admin no próprio banco).

-- Lista de usuários (admin only). Junta auth.users internamente; não expõe
-- a tabela auth.users diretamente via API.
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
language plpgsql security definer stable
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.is_admin = true and ua.status = 'approved'
  ) then
    raise exception 'Não autorizado';
  end if;

  return query
    select
      ua.user_id,
      u.email,
      p.apelido,
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

grant execute on function public.listar_usuarios() to authenticated;

-- Promover/remover administrador.
create or replace function public.definir_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.is_admin = true and ua.status = 'approved'
  ) then
    raise exception 'Não autorizado';
  end if;

  -- Não pode remover o próprio acesso de administrador.
  if p_user_id = auth.uid() and p_is_admin = false then
    raise exception 'Você não pode remover seu próprio acesso de administrador';
  end if;

  update public.user_access
  set is_admin = p_is_admin, updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado';
  end if;
end;
$$;

grant execute on function public.definir_admin(uuid, boolean) to authenticated;

create or replace function public.definir_acesso(p_user_id uuid, p_status text)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if p_status not in ('pending', 'approved', 'blocked') then
    raise exception 'Status inválido';
  end if;

  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.is_admin = true and ua.status = 'approved'
  ) then
    raise exception 'Não autorizado';
  end if;

  if p_user_id = auth.uid() and p_status = 'blocked' then
    raise exception 'Você não pode bloquear a própria conta';
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

  if not found then
    raise exception 'Usuário não encontrado';
  end if;
end;
$$;

grant execute on function public.definir_acesso(uuid, text) to authenticated;
path">
/home/brenneralt/.gemini/antigravity/scratch/concurso-questoes/supabase/migrations/0002_user_access.sql