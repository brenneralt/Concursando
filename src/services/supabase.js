import { createClient } from '@supabase/supabase-js';

// Credenciais vêm do ambiente (.env local ou variáveis do provedor de deploy).
// Nunca comite valores reais: use .env.example como referência.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_CONFIGURADO = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const AVISO_CONFIG =
  'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY ' +
  'em .env (local) ou nas variáveis de ambiente do provedor de deploy.';

/**
 * Cliente inativo usado quando as variáveis de ambiente não existem.
 * Mantém o app funcionando off-line (localStorage) em vez de quebrar o build,
 * e devolve um erro claro em login/ranque.
 */
function clienteInativo() {
  const semSuporte = () =>
    Promise.resolve({ data: null, error: { message: AVISO_CONFIG } });
  const semSessao = () =>
    Promise.resolve({ data: { session: null, user: null }, error: null });

  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    order: () => consulta,
    upsert: semSuporte,
    single: semSuporte,
    delete: () => consulta,
    insert: semSuporte,
    then: (ok, falha) => semSuporte().then(ok, falha),
  };

  return {
    auth: {
      getSession: semSessao,
      getUser: semSessao,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      signInWithPassword: semSuporte,
      signUp: semSuporte,
      signOut: semSuporte,
    },
    from: () => consulta,
    rpc: semSuporte,
  };
}

export const supabase = SUPABASE_CONFIGURADO
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : clienteInativo();
