import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../supabase.js';

/**
 * Exige uma sessão ativa para acessar as rotas da plataforma.
 * - Enquanto a sessão é verificada, mostra um carregando.
 * - Sem sessão, manda para /login guardando a rota de origem.
 * - Com sessão, renderiza a rota pedida (o Supabase mantém a sessão entre visitas,
 *   então quem já entrou não precisa entrar de novo).
 */
export default function RotaProtegida() {
  const [verificando, setVerificando] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!ativo) return;
      setAutenticado(Boolean(session?.user));
      setVerificando(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, session) => {
      setAutenticado(Boolean(session?.user));
      setVerificando(false);
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  if (verificando) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
        <p className="text-xs font-medium text-slate-500">Verificando sua conta...</p>
      </div>
    );
  }

  if (!autenticado) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ de: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}
