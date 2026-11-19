import { useState, useEffect, useMemo } from 'react';

// Lista vazia = "todas". Cada campo é um array de valores selecionados.
const filtrosIniciais = () => ({
  banca: [],
  disciplina: [],
  assunto: [],
  cargo: [],
  orgao: [],
  ano: [],
  nivel: [],
  status: 'TODAS', // TODAS, ACERTOS, ERROS, NAO_RESOLVIDAS, FAVORITAS, ANULADAS
  ocultarAnuladas: false,
  somenteComGabarito: false,
  busca: ''
});

export function useQuestao(progresso) {
  const [todasQuestoes, setTodasQuestoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [filtros, setFiltros] = useState(filtrosIniciais);

  useEffect(() => {
    async function carregar() {
      try {
        setCarregando(true);
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

  // Opções dinâmicas para os filtros
  const opcoesFiltro = useMemo(() => {
    const bancas = new Set();
    const disciplinas = new Set();
    const assuntos = new Set();
    const cargos = new Set();
    const orgaos = new Set();
    const anos = new Set();
    const niveis = new Set();

    todasQuestoes.forEach(q => {
      if (q.banca) bancas.add(q.banca);
      if (q.disciplina) disciplinas.add(q.disciplina);
      if (q.assunto) assuntos.add(q.assunto);
      if (q.cargo) cargos.add(q.cargo);
      if (q.orgao) orgaos.add(q.orgao);
      if (q.ano) anos.add(String(q.ano));
      if (q.nivel) niveis.add(q.nivel);
    });

    return {
      bancas: Array.from(bancas).sort(),
      disciplinas: Array.from(disciplinas).sort(),
      assuntos: Array.from(assuntos).sort(),
      cargos: Array.from(cargos).sort(),
      orgaos: Array.from(orgaos).sort(),
      anos: Array.from(anos).sort((a, b) => b - a),
      niveis: Array.from(niveis).sort()
    };
  }, [todasQuestoes]);

  // Aplicar filtros e busca
  const questoesFiltradas = useMemo(() => {
    return todasQuestoes.filter(q => {
      if (filtros.banca.length > 0 && !filtros.banca.includes(q.banca)) return false;
      if (filtros.disciplina.length > 0 && !filtros.disciplina.includes(q.disciplina)) return false;
      if (filtros.assunto.length > 0 && !filtros.assunto.includes(q.assunto)) return false;
      if (filtros.cargo.length > 0 && !filtros.cargo.includes(q.cargo)) return false;
      if (filtros.orgao.length > 0 && !filtros.orgao.includes(q.orgao)) return false;
      if (filtros.ano.length > 0 && !filtros.ano.includes(String(q.ano))) return false;
      if (filtros.nivel.length > 0 && !filtros.nivel.includes(q.nivel)) return false;

      // Ausência de gabarito (null) e questões anuladas
      if (filtros.ocultarAnuladas && q.anulada) return false;
      if (filtros.somenteComGabarito && (q.gabarito === null || q.gabarito === undefined)) return false;

      // Status do usuário
      const respostaInfo = progresso.respostas[q.id];
      const resolvida = !!respostaInfo;
      const acertou = respostaInfo?.acertou;
      const ehFavorita = progresso.favoritos.includes(q.id);

      if (filtros.status === 'ANULADAS' && !q.anulada) return false;
      if (filtros.status === 'ACERTOS' && (!resolvida || !acertou)) return false;
      if (filtros.status === 'ERROS' && (!resolvida || acertou)) return false;
      if (filtros.status === 'NAO_RESOLVIDAS' && resolvida) return false;
      if (filtros.status === 'FAVORITAS' && !ehFavorita) return false;

      // Busca textual ampla
      if (filtros.busca.trim()) {
        const termo = filtros.busca.toLowerCase();
        const textoCompleto = [
          q.enunciado,
          q.orgao,
          q.cargo,
          q.assunto,
          q.disciplina,
          q.banca,
          q.id,
          ...Object.values(q.alternativas || {})
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!textoCompleto.includes(termo)) return false;
      }

      return true;
    });
  }, [todasQuestoes, filtros, progresso]);

  const atualizarFiltro = (campo, valor) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  };

  const limparFiltros = () => {
    setFiltros(filtrosIniciais());
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
