import { useState, useEffect } from 'react';

const STORAGE_KEY = 'concurso_questoes_progresso_v1';

export function useLocalStorageProgress() {
  const [progresso, setProgresso] = useState(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) return JSON.parse(salvo);
    } catch (e) {
      console.warn('Falha ao ler localStorage:', e);
    }
    return {
      respostas: {}, // { [id]: { resposta, acertou, data } }
      favoritos: []  // [id]
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progresso));
    } catch (e) {
      console.warn('Falha ao salvar localStorage:', e);
    }
  }, [progresso]);

  const registrarResposta = (questaoId, respostaEscolhida, gabarito) => {
    const acertou = respostaEscolhida === gabarito;
    setProgresso(prev => ({
      ...prev,
      respostas: {
        ...prev.respostas,
        [questaoId]: {
          resposta: respostaEscolhida,
          acertou,
          data: new Date().toISOString()
        }
      }
    }));
    return acertou;
  };

  const limparResposta = (questaoId) => {
    setProgresso(prev => {
      const novasRespostas = { ...prev.respostas };
      delete novasRespostas[questaoId];
      return { ...prev, respostas: novasRespostas };
    });
  };

  const alternarFavorito = (questaoId) => {
    setProgresso(prev => {
      const favs = prev.favoritos.includes(questaoId)
        ? prev.favoritos.filter(id => id !== questaoId)
        : [...prev.favoritos, questaoId];
      return { ...prev, favoritos: favs };
    });
  };

  const resetarProgresso = () => {
    if (window.confirm("Deseja realmente zerar todo o seu histórico e estatísticas?")) {
      const limpo = { respostas: {}, favoritos: [] };
      setProgresso(limpo);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limpo));
    }
  };

  const respostasArray = Object.values(progresso.respostas);
  const totalResolvidas = respostasArray.length;
  const totalAcertos = respostasArray.filter(r => r.acertou).length;
  const totalErros = totalResolvidas - totalAcertos;
  const taxaAcerto = totalResolvidas > 0 ? Math.round((totalAcertos / totalResolvidas) * 100) : 0;

  return {
    progresso,
    registrarResposta,
    limparResposta,
    alternarFavorito,
    resetarProgresso,
    stats: {
      totalResolvidas,
      totalAcertos,
      totalErros,
      taxaAcerto,
      totalFavoritas: progresso.favoritos.length
    }
  };
}
