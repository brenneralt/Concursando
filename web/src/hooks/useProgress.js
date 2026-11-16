import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase.js';

const STORAGE_KEY = 'concurso_questoes_progresso_v3';

function carregarLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Falha ao ler localStorage:', e);
  }
  return { respostas: {}, favoritos: [] };
}

function salvarLocal(progresso) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progresso));
  } catch (e) {
    console.warn('Falha ao salvar localStorage:', e);
  }
}

function gerarStats(progresso) {
  const respostasArray = Object.values(progresso.respostas);
  const totalResolvidas = respostasArray.length;
  const totalAcertos = respostasArray.filter((r) => r.acertou).length;
  const totalErros = totalResolvidas - totalAcertos;
  const taxaAcerto = totalResolvidas > 0 ? Math.round((totalAcertos / totalResolvidas) * 100) : 0;

  return {
    totalResolvidas,
    totalAcertos,
    totalErros,
    taxaAcerto,
    totalFavoritas: progresso.favoritos.length,
  };
}

export function useProgress() {
  const [progresso, setProgresso] = useState(carregarLocal);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const progressoRef = useRef(progresso);
  progressoRef.current = progresso;

  // Sessão inicial + listener de autenticação
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const salvar = useCallback((novo) => {
    progressoRef.current = novo;
    setProgresso(novo);
    salvarLocal(novo);
  }, []);

  // Ao logar, baixa o progresso do servidor e mescla com o localStorage
  useEffect(() => {
    if (!user) return;
    let ativo = true;
    (async () => {
      const { data: rows, error } = await supabase
        .from('progresso')
        .select('questao_id, alternativa, acerto, respondida_em')
        .eq('user_id', user.id);
      if (error) {
        console.warn('Falha ao sincronizar progresso:', error.message);
        return;
      }
      if (!ativo) return;
      const respostasRemotas = {};
      for (const r of rows ?? []) {
        if (!r.alternativa) continue;
        respostasRemotas[r.questao_id] = {
          resposta: r.alternativa,
          acertou: r.acerto,
          data: r.respondida_em,
        };
      }
      const novo = {
        ...progressoRef.current,
        respostas: respostasRemotas,
      };
      salvar(novo);
    })();
    return () => {
      ativo = false;
    };
  }, [user, salvar]);

  async function sincronizarResposta(questaoId, alternativa, acertou) {
    if (!user) return;
    const now = new Date().toISOString();
    await supabase.from('progresso').upsert(
      {
        user_id: user.id,
        questao_id: questaoId,
        alternativa,
        acerto: acertou,
        respondida_em: now,
        atualizado_em: now,
      },
      { onConflict: 'user_id,questao_id' }
    );
    await atualizarContadores(user.id);
  }

  async function removerRespostaRemota(questaoId) {
    if (!user) return;
    const { error } = await supabase
      .from('progresso')
      .delete()
      .eq('user_id', user.id)
      .eq('questao_id', questaoId);
    if (error) console.warn('Falha ao remover resposta na nuvem:', error.message);
    await atualizarContadores(user.id);
  }

  async function atualizarContadores(userId) {
    const { error } = await supabase.rpc('atualizar_perfil', { p_user_id: userId });
    if (error) console.warn('Falha ao atualizar contadores:', error.message);
  }

  const registrarResposta = (questaoId, respostaEscolhida, gabarito) => {
    const acertou = respostaEscolhida === gabarito;
    const entry = {
      resposta: respostaEscolhida,
      acertou,
      data: new Date().toISOString(),
    };
    const novo = {
      ...progressoRef.current,
      respostas: { ...progressoRef.current.respostas, [questaoId]: entry },
    };
    salvar(novo);
    sincronizarResposta(questaoId, respostaEscolhida, acertou);
    return acertou;
  };

  const limparResposta = (questaoId) => {
    const novasRespostas = { ...progressoRef.current.respostas };
    delete novasRespostas[questaoId];
    salvar({ ...progressoRef.current, respostas: novasRespostas });
    removerRespostaRemota(questaoId);
  };

  const alternarFavorito = (questaoId) => {
    const favs = progressoRef.current.favoritos.includes(questaoId)
      ? progressoRef.current.favoritos.filter((id) => id !== questaoId)
      : [...progressoRef.current.favoritos, questaoId];
    salvar({ ...progressoRef.current, favoritos: favs });
  };

  const resetarProgresso = () => {
    if (!window.confirm('Deseja realmente zerar todo o seu histórico e estatísticas?')) return;
    salvar({ respostas: {}, favoritos: [] });
    if (user) {
      supabase
        .from('progresso')
        .delete()
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) console.warn('Falha ao zerar progresso na nuvem:', error.message);
          return atualizarContadores(user.id);
        });
    }
  };

  const login = async (email, senha) => {
    return supabase.auth.signInWithPassword({ email, password: senha });
  };

  const cadastrar = async (email, senha, apelido) => {
    return supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { apelido } },
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return {
    progresso,
    user,
    authLoading,
    registrarResposta,
    limparResposta,
    alternarFavorito,
    resetarProgresso,
    login,
    cadastrar,
    logout,
    stats: gerarStats(progresso),
  };
}