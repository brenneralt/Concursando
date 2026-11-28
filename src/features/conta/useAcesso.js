import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../services/supabase.js';

/**
 * Carrega o registro `user_access` do usuário logado (RLS permite apenas o
 * próprio registro).
 *
 * O carregamento é derivado durante a renderização a partir do id da sessão,
 * e não apenas de um efeito: assim não existe janela em que a sessão já foi
 * recuperada mas o registro ainda não chegou — situação que fazia o painel
 * administrativo redirecionar um administrador legítimo.
 *
 * Retorna { acesso, erro, carregando, recarregar }.
 * - `acesso` só é exposto quando pertence à sessão atual (nunca de outra).
 * - `carregando` cobre: sem registro ainda, recarregando ou usuário novo.
 * - `recarregar({ silencioso: true })` refaz a consulta em segundo plano sem
 *   mostrar carregamento (usado ao navegar para revogar acesso de sessões ativas).
 */
export function useAcesso(user) {
  const [resultado, setResultado] = useState(null); // { userId, acesso, erro }
  const [carregando, setCarregando] = useState(true);
  const userRef = useRef(user);
  userRef.current = user;

  const recarregar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!user) {
        setResultado(null);
        setCarregando(false);
        return;
      }
      if (!silencioso) setCarregando(true);

      const { data, error } = await supabase
        .from('user_access')
        .select('status, is_admin, created_at, updated_at, approved_at, blocked_at')
        .eq('user_id', user.id)
        .maybeSingle();

      // Descarta resposta de sessão que mudou durante a consulta.
      if (userRef.current?.id !== user.id) return;

      setResultado({
        userId: user.id,
        acesso: error ? null : data ?? null,
        erro: error ? error.message : null,
      });
      setCarregando(false);
    },
    [user]
  );

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const userIdAtual = user?.id ?? null;
  const resultadoDoUsuario =
    resultado && resultado.userId === userIdAtual ? resultado : null;

  return {
    acesso: resultadoDoUsuario?.acesso ?? null,
    erro: resultadoDoUsuario?.erro ?? null,
    // Enquanto a sessão mudou e o registro não veio: aguarda em vez de decidir.
    carregando: Boolean(userIdAtual) && (carregando || !resultadoDoUsuario),
    recarregar,
  };
}
