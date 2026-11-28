#!/usr/bin/env node
/**
 * Testa as policies de RLS e as funções de acesso (migrations 0001 + 0002)
 * num PostgreSQL real, local e descartável.
 *
 * Substitui `supabase test db` (que exige Docker + Supabase CLI, indisponíveis
 * no ambiente de CI/dev atual) recriando apenas as peças mínimas do Supabase:
 *
 *   - schema `auth` com `auth.users` e `auth.uid()`;
 *   - papéis `anon`, `authenticated` e `service_role`;
 *   - claims JWT simuladas via `request.jwt.claims` (é o PostgREST que define
 *     isso em produção; aqui simulamos o mesmo comportamento).
 *
 * Uso: npm run test:db
 * Sai com código != 0 se qualquer asserção falhar.
 */
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import EmbeddedPostgres from 'embedded-postgres';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirDados = path.join(os.tmpdir(), 'concurso-questoes-rls');
const PORTA = 55432;

const U = {
  admin: '11111111-1111-1111-1111-111111111101',
  adm2: '11111111-1111-1111-1111-111111111102',
  aprov: '11111111-1111-1111-1111-111111111103',
  pend: '11111111-1111-1111-1111-111111111104',
  bloq: '11111111-1111-1111-1111-111111111105',
};

const pg = new EmbeddedPostgres({
  databaseDir: dirDados,
  user: 'postgres',
  password: 'postgres',
  port: PORTA,
  persistent: false,
  autoRehydrateSymlinks: true,
  onLog: () => {},
  onError: (e) => console.error('[postgres]', e),
});

let client;
let falhas = 0;
let total = 0;

const q = (sql, params) => (params ? client.query(sql, params) : client.query(sql));

/** Simula uma identidade: papel do Supabase + claims JWT do usuário. */
async function como(papel, userId = null) {
  await q('reset role');
  const claims = userId ? JSON.stringify({ sub: userId }) : '';
  await q("select set_config('request.jwt.claims', $1, false)", [claims]);
  if (papel !== 'postgres') await q(`set role ${papel}`);
}

async function teste(nome, fn) {
  total += 1;
  try {
    await fn();
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    falhas += 1;
    console.error(`  ✗ ${nome}\n      → ${e.message}`);
  }
}

/** Espera um erro: string = mensagem contida; número = SQLSTATE. */
async function esperaErro(sql, params, esperado) {
  try {
    await q(sql, params);
  } catch (e) {
    const msg = e.message || '';
    if (typeof esperado === 'number') {
      if (e.code === String(esperado)) return e;
      throw new Error(`SQLSTATE ${e.code} (esperado ${esperado}): ${msg}`, { cause: e });
    }
    if (msg.includes(esperado)) return e;
    throw new Error(`erro inesperado: ${msg}`, { cause: e });
  }
  throw new Error('nenhum erro foi lançado (esperava recusa)');
}

async function esperaValor(sql, params, esperado) {
  const r = await q(sql, params);
  const obtido = r.rows[0]?.valor;
  if (obtido !== esperado) {
    throw new Error(`esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
  }
}

async function main() {
  rmSync(dirDados, { recursive: true, force: true });

  console.log('1) Subindo PostgreSQL local...');
  await pg.initialise();
  await pg.start();
  client = pg.getPgClient();
  await client.connect();

  try {
    console.log('2) Ambiente Supabase mínimo (auth schema, papéis, claims)...');
    await q(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;

      create schema auth;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid
      language sql stable as $fn$
        select nullif(
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
          ''
        )::uuid
      $fn$;

      grant usage on schema auth, public to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);

    console.log('3) Aplicando migrations 0001 + 0002...');
    for (const arquivo of ['0001_schema_rls.sql', '0002_user_access.sql']) {
      const sql = readFileSync(
        path.join(raiz, 'supabase', 'migrations', arquivo),
        'utf8'
      );
      await q(sql);
      console.log(`   - ${arquivo} aplicado`);
    }

    console.log('4) Fixtures (5 contas: 2 admins, 1 aprovada, 1 pendente, 1 bloqueada)...');
    await q(`
      insert into auth.users (id, email, raw_user_meta_data) values
        ('${U.admin}', 'admin@exemplo.com', '{"apelido":"admin"}'),
        ('${U.adm2}', 'adm2@exemplo.com', '{"apelido":"adm2"}'),
        ('${U.aprov}', 'aprov@exemplo.com', '{"apelido":"aprovado"}'),
        ('${U.pend}',  'pend@exemplo.com',  '{"apelido":"pendente"}'),
        ('${U.bloq}',  'bloq@exemplo.com',  '{"apelido":"bloqueado"}');

      update public.user_access
        set status = 'approved', is_admin = true, approved_by = '${U.admin}', approved_at = now()
        where user_id = '${U.admin}';
      update public.user_access
        set status = 'approved', is_admin = true, approved_by = '${U.admin}', approved_at = now()
        where user_id = '${U.adm2}';
      update public.user_access
        set status = 'approved', approved_by = '${U.admin}', approved_at = now()
        where user_id = '${U.aprov}';
      update public.user_access
        set status = 'blocked', blocked_by = '${U.admin}', blocked_at = now()
        where user_id = '${U.bloq}';

      -- Pendente com pontuação alta: não pode aparecer no ranque.
      update public.profiles set total_resolvidas = 999 where id = '${U.pend}';
    `);

    console.log('\n5) GRANTs da tabela user_access');
    await teste('anon NÃO lê public.user_access', async () => {
      await como('anon');
      await esperaErro('select count(*) from public.user_access', null, 42501);
    });
    await teste('authenticated NÃO insere em user_access', async () => {
      await como('authenticated', U.aprov);
      await esperaErro(
        `insert into public.user_access (user_id, status) values ('${U.aprov}', 'approved')`,
        null,
        42501
      );
    });
    await teste('authenticated NÃO atualiza user_access (nem a própria linha: sem auto-promoção)', async () => {
      await como('authenticated', U.aprov);
      await esperaErro(
        `update public.user_access set is_admin = true, status = 'approved' where user_id = '${U.aprov}'`,
        null,
        42501
      );
    });
    await teste('authenticated NÃO apaga de user_access', async () => {
      await como('authenticated', U.aprov);
      await esperaErro(
        `delete from public.user_access where user_id = '${U.aprov}'`,
        null,
        42501
      );
    });
    await teste('authenticated lê apenas a própria linha de user_access', async () => {
      await como('authenticated', U.aprov);
      await esperaValor('select count(*)::int as valor from public.user_access', null, 1);
      await esperaValor(
        `select count(*)::int as valor from public.user_access where user_id = '${U.admin}'`,
        null,
        0
      );
    });
    await teste('authenticated NÃO lê auth.users (e-mail não vaza pela API)', async () => {
      await como('authenticated', U.aprov);
      await esperaErro('select email from auth.users', null, 42501);
    });

    console.log('\n6) Ranque público (view) só com contas aprovadas');
    await teste('anon lê o ranque e pendente/bloqueado não aparecem', async () => {
      await como('anon');
      await esperaValor('select count(*)::int as valor from public.ranque', null, 3);
      await esperaValor(
        `select count(*)::int as valor from public.ranque where id = '${U.pend}' or id = '${U.bloq}'`,
        null,
        0
      );
    });

    console.log('\n7) RLS de progresso (pendente/bloqueado sem acesso; aprovado ok)');
    await teste('linhas de progresso do pendente existem mas ficam invisíveis para ele', async () => {
      await como('postgres');
      await q(
        `insert into public.progresso (user_id, questao_id, alternativa, acerto)
         values ('${U.pend}', 'q1', 'A', true)`
      );
      await como('authenticated', U.pend);
      await esperaValor('select count(*)::int as valor from public.progresso', null, 0);
    });
    await teste('pendente NÃO consegue inserir progresso', async () => {
      await como('authenticated', U.pend);
      await esperaErro(
        `insert into public.progresso (user_id, questao_id, alternativa, acerto)
         values ('${U.pend}', 'q2', 'B', false)`,
        null,
        42501
      );
    });
    await teste('aprovado insere o próprio progresso', async () => {
      await como('authenticated', U.aprov);
      await q(
        `insert into public.progresso (user_id, questao_id, alternativa, acerto)
         values ('${U.aprov}', 'q1', 'A', true)`
      );
      await esperaValor('select count(*)::int as valor from public.progresso', null, 1);
    });
    await teste('aprovado NÃO consegue inserir progresso de outra conta', async () => {
      await como('authenticated', U.aprov);
      await esperaErro(
        `insert into public.progresso (user_id, questao_id, alternativa, acerto)
         values ('${U.admin}', 'q9', 'A', true)`,
        null,
        42501
      );
    });

    console.log('\n8) Funções administrativas: papel verificado no banco');
    await teste('anon NÃO tem EXECUTE nas funções administrativas', async () => {
      await como('anon');
      await esperaErro(`select public.listar_usuarios()`, null, 42501);
      await esperaErro(`select public.atualizar_perfil('${U.aprov}')`, null, 42501);
      await esperaErro(
        `select public.definir_acesso('${U.aprov}', 'approved')`, null, 42501
      );
      await esperaErro(`select public.definir_admin('${U.aprov}', true)`, null, 42501);
    });
    await teste('conta comum aprovada: listar_usuarios/definir_* recusados', async () => {
      await como('authenticated', U.aprov);
      await esperaErro(`select public.listar_usuarios()`, null, 'Não autorizado');
      await esperaErro(
        `select public.definir_acesso('${U.pend}', 'approved')`, null, 'Não autorizado'
      );
      await esperaErro(
        `select public.definir_admin('${U.aprov}', true)`, null, 'Não autorizado'
      );
    });
    await teste('conta pendente: chamadas administrativas recusadas', async () => {
      await como('authenticated', U.pend);
      await esperaErro(`select public.listar_usuarios()`, null, 'Não autorizado');
      await esperaErro(
        `select public.definir_acesso('${U.pend}', 'approved')`, null, 'Não autorizado'
      );
    });
    await teste('administrador lista usuários com e-mail (inclui pendentes)', async () => {
      await como('authenticated', U.admin);
      const r = await q(`select * from public.listar_usuarios()`);
      if (r.rowCount !== 5) throw new Error(`esperava 5, veio ${r.rowCount}`);
      if (!r.rows.some((l) => l.email === 'pend@exemplo.com')) {
        throw new Error('pendente ausente da listagem');
      }
      if (!r.rows.some((l) => l.status === 'pending')) {
        throw new Error('status pendente ausente da listagem');
      }
    });
    await teste('administrador NÃO pode se bloquear (auto-lockout impedido)', async () => {
      await como('authenticated', U.admin);
      await esperaErro(
        `select public.definir_acesso('${U.admin}', 'blocked')`,
        null,
        'Você não pode remover o próprio acesso'
      );
    });
    await teste('administrador NÃO pode se pendentar', async () => {
      await como('authenticated', U.admin);
      await esperaErro(
        `select public.definir_acesso('${U.admin}', 'pending')`,
        null,
        'Você não pode remover o próprio acesso'
      );
    });
    await teste('administrador NÃO pode remover a própria admin', async () => {
      await como('authenticated', U.admin);
      await esperaErro(
        `select public.definir_admin('${U.admin}', false)`,
        null,
        'Você não pode remover seu próprio acesso de administrador'
      );
    });
    await teste('último administrador permanece: nenhum caminho remove o acesso do próprio admin', async () => {
      // Cenário: só U.admin é administrador aprovado. Os dois únicos caminhos
      // possíveis (status != approved e is_admin = false) são recusados acima;
      // revalida também que não há caminho via escrita direta na tabela.
      await como('authenticated', U.admin);
      await esperaErro(
        `update public.user_access set is_admin = false where user_id = '${U.admin}'`,
        null,
        42501
      );
      await como('postgres');
      await esperaValor(
        `select count(*)::int as valor from public.user_access
         where is_admin = true and status = 'approved'`,
        null,
        2
      );
    });
    await teste('não é possível promover conta pendente a administradora', async () => {
      await como('authenticated', U.admin);
      await esperaErro(
        `select public.definir_admin('${U.pend}', true)`,
        null,
        'Só é possível promover uma conta aprovada'
      );
    });
    await teste('não é possível promover conta bloqueada a administradora', async () => {
      await como('authenticated', U.admin);
      await esperaErro(
        `select public.definir_admin('${U.bloq}', true)`,
        null,
        'Só é possível promover uma conta aprovada'
      );
    });
    await teste('aprovação registra quem aprovou e quando', async () => {
      await como('authenticated', U.admin);
      await q(`select public.definir_acesso('${U.pend}', 'approved')`);
      await como('postgres');
      const r = await q(
        `select status, approved_by, approved_at is not null as tem_data
         from public.user_access where user_id = '${U.pend}'`
      );
      const l = r.rows[0];
      if (l.status !== 'approved' || l.approved_by !== U.admin || !l.tem_data) {
        throw new Error(`registro inesperado: ${JSON.stringify(l)}`);
      }
      // devolve para pendente para não afetar os demais testes
      await como('authenticated', U.admin);
      await q(`select public.definir_acesso('${U.pend}', 'pending')`);
      await como('postgres');
      await q(
        `update public.profiles set total_resolvidas = 999 where id = '${U.pend}'`
      );
    });

    console.log('\n9) Sessão ativa perde acesso assim que a conta é bloqueada');
    await teste('aprovado perde leitura/escrita de progresso após bloqueio', async () => {
      // enquanto aprovado: tem progresso
      await como('authenticated', U.aprov);
      await q(
        `insert into public.progresso (user_id, questao_id, alternativa, acerto)
         values ('${U.aprov}', 'q2', 'B', false)`
      );
      await esperaValor('select count(*)::int as valor from public.progresso', null, 2);

      // administrador bloqueia
      await como('authenticated', U.admin);
      await q(`select public.definir_acesso('${U.aprov}', 'blocked')`);

      // mesma "sessão" (mesmas claims) já não escreve nem lê
      await como('authenticated', U.aprov);
      await esperaErro(
        `insert into public.progresso (user_id, questao_id, alternativa, acerto)
         values ('${U.aprov}', 'q3', 'C', true)`,
        null,
        42501
      );
      await esperaValor('select count(*)::int as valor from public.progresso', null, 0);

      // registro de bloqueio
      await como('postgres');
      const r = await q(
        `select status, blocked_by, blocked_at is not null as tem_data
         from public.user_access where user_id = '${U.aprov}'`
      );
      const l = r.rows[0];
      if (l.status !== 'blocked' || l.blocked_by !== U.admin || !l.tem_data) {
        throw new Error(`registro inesperado: ${JSON.stringify(l)}`);
      }

      // restaura para os próximos testes
      await como('authenticated', U.admin);
      await q(`select public.definir_acesso('${U.aprov}', 'approved')`);
      await como('authenticated', U.aprov);
      await q(
        `delete from public.progresso where user_id = '${U.aprov}' and questao_id = 'q2'`
      );
    });

    console.log('\n10) atualizar_perfil');
    await teste('pendente não pode chamar atualizar_perfil', async () => {
      await como('authenticated', U.pend);
      await esperaErro(
        `select public.atualizar_perfil('${U.pend}')`, null, 'Acesso não autorizado'
      );
    });
    await teste('aprovado não pode atualizar perfil alheio', async () => {
      await como('authenticated', U.aprov);
      await esperaErro(
        `select public.atualizar_perfil('${U.admin}')`, null, 'Não autorizado'
      );
    });
    await teste('aprovado atualiza o próprio perfil (contadores recalculados)', async () => {
      await como('postgres');
      await q(`delete from public.progresso where user_id = '${U.aprov}'`);
      await como('authenticated', U.aprov);
      await q(
        `insert into public.progresso (user_id, questao_id, alternativa, acerto)
         values ('${U.aprov}', 'q1', 'A', true)`
      );
      await q(`select public.atualizar_perfil('${U.aprov}')`);
      await como('postgres');
      await esperaValor(
        `select total_resolvidas as valor from public.profiles where id = '${U.aprov}'`,
        null,
        1
      );
    });

    console.log('\n11) Autocadastro');
    await teste('novo usuário nasce pendente, com perfil criado pelo trigger', async () => {
      const novo = '11111111-1111-1111-1111-111111111106';
      await como('postgres');
      await q(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ('${novo}', 'novo@exemplo.com', '{"apelido":"novato"}')`
      );
      await esperaValor(
        `select status::text as valor from public.user_access where user_id = '${novo}'`,
        null,
        'pending'
      );
      await esperaValor(
        `select apelido as valor from public.profiles where id = '${novo}'`,
        null,
        'novato'
      );
      // sem permissão de escrita direta, mesmo sendo o dono do registro
      await como('authenticated', novo);
      await esperaErro(
        `update public.user_access set status = 'approved' where user_id = '${novo}'`,
        null,
        42501
      );
    });
  } finally {
    await como('postgres').catch(() => {});
    await client?.end().catch(() => {});
    await pg.stop().catch(() => {});
  }

  console.log(`\nResultado: ${total - falhas}/${total} testes aprovados.`);
  if (falhas > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error('\nFalha no harness:', e.message);
  try {
    await client?.end();
    await pg.stop();
  } catch {
    /* ignora */
  }
  process.exit(1);
});
