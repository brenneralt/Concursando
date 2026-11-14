import { useState, useEffect, useMemo } from 'react';

export function useQuestao(progresso) {
  const [todasQuestoes, setTodasQuestoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [filtros, setFiltros] = useState({
    banca: 'TODAS',
    disciplina: 'TODAS',
    ano: 'TODOS',
    modalidade: 'TODAS',
    status: 'TODAS', // TODAS, ACERTOS, ERROS, NAO_RESOLVIDAS, FAVORITAS
    busca: ''
  });

  useEffect(() => {
    async function carregar() {
      try {
        setCarregando(true);
        // Suporta tanto deploy relativo (GH Pages) quanto raiz (Vercel)
        const baseUrl = import.meta.env.BASE_URL || './';
        const url = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}questoes.json`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Falha ao carregar banco de questões (${res.status})`);
        }
        const data = await res.json();
        setTodasQuestoes(data);
      } catch (err) {
        console.error(err);
        setErro(err.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  // Extrair opções dinâmicas para os filtros
  const opcoesFiltro = useMemo(() => {
    const bancas = new Set();
    const disciplinas = new Set();
    const anos = new Set();
    const modalidades = new Set();

    todasQuestoes.forEach(q => {
      if (q.banca) bancas.add(q.banca);
      if (q.disciplina) disciplinas.add(q.disciplina);
      if (q.ano) anos.add(String(q.ano));
      if (q.modalidade) modalidades.add(q.modalidade);
    });

    return {
      bancas: Array.from(bancas).sort(),
      disciplinas: Array.from(disciplinas).sort(),
      anos: Array.from(anos).sort((a, b) => b - a),
      modalidades: Array.from(modalidades).sort()
    };
  }, [todasQuestoes]);

  // Aplicar filtros e busca
  const questoesFiltradas = useMemo(() => {
    return todasQuestoes.filter(q => {
      // Filtro de Banca
      if (filtros.banca !== 'TODAS' && q.banca !== filtros.banca) return false;

      // Filtro de Disciplina
      if (filtros.disciplina !== 'TODAS' && q.disciplina !== filtros.disciplina) return false;

      // Filtro de Ano
      if (filtros.ano !== 'TODOS' && String(q.ano) !== String(filtros.ano)) return false;

      // Filtro de Modalidade
      if (filtros.modalidade !== 'TODAS' && q.modalidade !== filtros.modalidade) return false;

      // Filtro de Status de Resolução
      const respostaInfo = progresso.respostas[q.id];
      const resolvida = !!respostaInfo;
      const acertou = respostaInfo?.acertou;
      const ehFavorita = progresso.favoritos.includes(q.id);

      if (filtros.status === 'ACERTOS' && (!resolvida || !acertou)) return false;
      if (filtros.status === 'ERROS' && (!resolvida || acertou)) return false;
      if (filtros.status === 'NAO_RESOLVIDAS' && resolvida) return false;
      if (filtros.status === 'FAVORITAS' && !ehFavorita) return false;

      // Busca textual (enunciado, cargo, órgão, assunto)
      if (filtros.busca.trim()) {
        const termo = filtros.busca.toLowerCase();
        const textoCompleto = `${q.enunciado} ${q.orgao} ${q.cargo} ${q.assunto} ${q.subassunto || ''}`.toLowerCase();
        if (!textoCompleto.includes(termo)) return false;
      }

      return true;
    });
  }, [todasQuestoes, filtros, progresso]);

  const atualizarFiltro = (campo, valor) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  };

  const limparFiltros = () => {
    setFiltros({
      banca: 'TODAS',
      disciplina: 'TODAS',
      ano: 'TODOS',
      modalidade: 'TODAS',
      status: 'TODAS',
      busca: ''
    });
  };

  return {
    questoes: questoesFiltradas,
    totalOriginal: todasQuestoes.length,
    carregando,
    erro,
    filtros,
    opcoesFiltro,
    atualizarFiltro,
    limparFiltros
  };
}
