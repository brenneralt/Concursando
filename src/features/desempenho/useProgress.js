import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../services/supabase.js';
import {
  PROGRESSO_VAZIO,
  alternarFavoritoNoProgresso,
  calcularEstatisticas,
  limparRespostaDoProgresso,
  registrarRespostaNoProgresso
} from './estatisticas.js';

const STORAGE_KEY = 'concurso_questoes_progresso_v3';

/** Cada conta tem sua própria chave: trocar de usuário no mesmo navegador não mistura dados. */
function chaveStorage(userId) {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

function carregarChave(chave) {
  try {
    const raw = localStorage.getItem(chave);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Falha ao ler localStorage:', e);
  }
  return null;
}

function salvarChave(chave, progresso) {
  try {
    localStorage.setItem(chave, JSON.stringify(progresso));
  } catch (e) {
    console.warn('Falha ao salvar localStorage:', e);
  }
}

/** Envia o progresso legado (chave global antiga) para a nuvem, em lotes de 500. */
async function migrarLegadoParaNuvem(userId, respostasLegadas) {
  const linhas = Object.entries(respostasLegadas).map(([questaoId, r]) => ({
    user_id: userId,
    questao_id: questaoId,
    alternativa: r.resposta,
    acerto: Boolean(r.acertou),
    respondida_em: r.data || new Date().toISOString(),
    atualizado_em: r.data || new Date().toISOString(),
  }));
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase
      .from('progresso')
      .upsert(linhas.slice(i, i + 500), { onConflict: 'user_id,questao_id' });
    if (error) {
      console.warn('Falha ao migrar progresso legado:', error.message);
      return;
    }
  }
  await supabase.rpc('atualizar_perfil', { p_user_id: userId });
}

export function useProgress() {
  const [progresso, setProgresso] = useState(PROGRESSO_VAZIO);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const progressoRef = useRef(progresso);
  progressoRef.current = progresso;
  const userRef = useRef(user);
  userRef.current = user;

  const salvar = useCallback((novo) => {
    progressoRef.current = novo;
    setProgresso(novo);
    const chave = chaveStorage(userRef.current?.id);
    if (chave !== STORAGE_KEY) salvarChave(chave, novo);
  }, []);

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

  // Quando o usuário entra ou sai, carrega o progresso na chave certa.
  // Cada conta tem seu próprio localStorage para não misturar dados entre usuários
  // que usam o mesmo navegador.
  useEffect(() => {
    if (!user) {
      setProgresso(PROGRESSO_VAZIO);
      return;
    }
    const chave = chaveStorage(user.id);
    const salvo = carregarChave(chave);
    if (salvo) {
      setProgresso(salvo);
      progressoRef.current = salvo;
    }

    // Baixa o progresso do servidor e mescla com o localStorage (o servidor vence
    // nas questões conflitantes, pois é a fonte de verdade na nuvem).
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

      const temDadosLocais = Object.keys(progressoRef.current.respostas).length > 0;
      const temDadosRemotos = Object.keys(respostasRemotas).length > 0;

      // Migração: usuário entrando pela primeira vez, sem nenhum progresso próprio.
      // Importa o legado da chave global antiga e envia para a nuvem (uma única vez).
      if (!temDadosLocais && !temDadosRemotos) {
        const dadoGlobal = carregarChave(STORAGE_KEY);
        const respostasLegadas = dadoGlobal?.respostas || {};
        if (Object.keys(respostasLegadas).length > 0) {
          const novo = {
            respostas: { ...respostasLegadas },
            favoritos: dadoGlobal.favoritos || [],
          };
          salvar(novo);
          migrarLegadoParaNuvem(user.id, respostasLegadas);
          return;
        }
      }

      salvar({
        ...progressoRef.current,
        respostas: respostasRemotas,
      });
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
    const novo = registrarRespostaNoProgresso(
      progressoRef.current,
      questaoId,
      respostaEscolhida,
      gabarito
    );
    const acertou = novo.respostas[questaoId].acertou;
    salvar(novo);
    sincronizarResposta(questaoId, respostaEscolhida, acertou);
    return acertou;
  };

  const limparResposta = (questaoId) => {
    salvar(limparRespostaDoProgresso(progressoRef.current, questaoId));
    removerRespostaRemota(questaoId);
  };

  const alternarFavorito = (questaoId) => {
    salvar(alternarFavoritoNoProgresso(progressoRef.current, questaoId));
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
    stats: calcularEstatisticas(progresso),
  };
}