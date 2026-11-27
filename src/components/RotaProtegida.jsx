import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../services/supabase.js';
import { podeAcessar } from '../features/conta/permissoes.js';
import AguardandoAprovacao from '../features/conta/AguardandoAprovacao.jsx';
import ContaBloqueada from '../features/conta/ContaBloqueada.jsx';

/**
 * Rotas que um usuário autenticado (mesmo pendente/bloqueado) pode abrir:
 * - /login é tratado fora desta rota
 * - /escolher-apelido e /aguardando-aprovacao são permitidos para pendentes
 */
const ROTAS_PERMITIDAS_PENDENTE = new Set(['/escolher-apelido', '/aguardando-aprovacao']);

export default function RotaProtegida() {
  const [verificando, setVerificando] = useState(true);
  const [user, setUser] = useState(null);
  const [acesso, setAcesso] = useState(null);
  const location = useLocation();

  const carregarAcesso = async (uid) => {
    if (!uid) {
      setAcesso(null);
      return;
    }
    const { data, error } = await supabase
      .from('user_access')
      .select('status, is_admin')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) console.warn('Falha ao carregar acesso:', error.message);
    setAcesso(data ?? { status: 'pending', is_admin: false });
  };

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!ativo) return;
      setUser(session?.user ?? null);
      carregarAcesso(session?.user?.id).finally(() => {
        if (ativo) setVerificando(false);
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, session) => {
      setUser(session?.user ?? null);
      carregarAcesso(session?.user?.id).finally(() => setVerificando(false));
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  // Revalida o status ao navegar (conta bloqueada perde acesso mesmo com sessão ativa).
  useEffect(() => {
    if (user) carregarAcesso(user.id);
  }, [location.pathname, user]);

  if (verificando) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
        <p className="text-xs font-medium text-slate-500">Verificando sua conta...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ de: `${location.pathname}${location.search}` }}
      />
    );
  }

  const status = acesso?.status ?? 'pending';

  // Bloqueado: perde acesso em qualquer rota.
  if (status === 'blocked') {
    return <ContaBloqueada user={user} onLogout={() => supabase.auth.signOut()} />;
  }

  // Pendente: só pode acessar rotas permitidas.
  if (status !== 'approved' && !ROTAS_PERMITIDAS_PENDENTE.has(location.pathname)) {
    return (
      <AguardandoAprovacao
        user={user}
        carregando={false}
        onRecarregar={() => carregarAcesso(user.id)}
        onLogout={() => supabase.auth.signOut()}
      />
    );
  }

  return <Outlet />;
}
