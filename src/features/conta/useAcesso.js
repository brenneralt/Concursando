import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase.js';

/**
 * Carrega o registro user_access do usuário logado (RLS permite apenas o próprio).
 * Retorna { acesso, carregando, recarregar }.
 */
export function useAcesso(user) {
  const [acesso, setAcesso] = useState(null);
  const [carregando, setCarregando] = useState(Boolean(user));

  const recarregar = useCallback(async () => {
    if (!user) {
      setAcesso(null);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const { data, error } = await supabase
      .from('user_access')
      .select('status, is_admin, created_at, updated_at, approved_at, blocked_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) console.warn('Falha ao carregar acesso:', error.message);
    setAcesso(data ?? null);
    setCarregando(false);
  }, [user]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { acesso, carregando, recarregar };
}
