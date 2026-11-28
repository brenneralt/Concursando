import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../services/supabase.js';
import { estadoRota } from '../features/conta/permissoes.js';
import { useAcesso } from '../features/conta/useAcesso.js';
import AguardandoAprovacao from '../features/conta/AguardandoAprovacao.jsx';
import ContaBloqueada from '../features/conta/ContaBloqueada.jsx';

/**
 * Rotas que um usuário autenticado (mesmo pendente/bloqueado) pode abrir.
 * /login é tratado fora desta rota.
 */
const ROTAS_PERMITIDAS_PENDENTE = ['/escolher-apelido', '/aguardando-aprovacao'];

export default function RotaProtegida() {
  const [user, setUser] = useState(null);
  const [sessaoVerificada, setSessaoVerificada] = useState(false);
  const location = useLocation();
  const { acesso, erro, carregando, recarregar } = useAcesso(user);

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(
      ({ data: { session } }) => {
        if (!ativo) return;
        setUser(session?.user ?? null);
        setSessaoVerificada(true);
      },
      () => {
        if (!ativo) return;
        setUser(null);
        setSessaoVerificada(true);
      }
    );

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, session) => {
      setUser(session?.user ?? null);
      setSessaoVerificada(true);
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  // Revalida o status a cada navegação em segundo plano: uma conta que for
  // bloqueada com a sessão aberta perde o acesso ao próximo roteamento.
  useEffect(() => {
    if (user) recarregar({ silencioso: true });
  }, [location.pathname, user, recarregar]);

  const estado = estadoRota({
    verificando: !sessaoVerificada,
    user,
    acesso,
    erro,
    carregando,
    caminho: location.pathname,
    permitidas: ROTAS_PERMITIDAS_PENDENTE,
  });

  if (estado === 'aguardar') {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
        <p className="text-xs font-medium text-slate-500">Verificando sua conta...</p>
      </div>
    );
  }

  if (estado === 'login') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ de: `${location.pathname}${location.search}` }}
      />
    );
  }

  // Falha ao consultar permissões: fechado, sem expor conteúdo.
  if (estado === 'erro') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 w-full max-w-md text-center">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
          <h1 className="font-bold text-lg text-slate-900 mb-2">Não foi possível verificar seu acesso</h1>
          <p className="text-xs text-slate-500 mb-5">
            {erro || 'Registro de acesso não encontrado.'}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => recarregar()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700"
            >
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="px-4 py-2 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (estado === 'bloqueado') {
    return <ContaBloqueada user={user} onLogout={() => supabase.auth.signOut()} />;
  }

  if (estado === 'pendente') {
    return (
      <AguardandoAprovacao
        user={user}
        carregando={carregando}
        onRecarregar={() => recarregar()}
        onLogout={() => supabase.auth.signOut()}
      />
    );
  }

  return <Outlet />;
}
