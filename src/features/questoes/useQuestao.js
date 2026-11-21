import { useState, useEffect, useMemo } from 'react';
import { carregarDados } from '../../services/banco.js';
import {
  filtrosIniciais,
  opcoesDeFiltro,
  aplicarFiltros
} from './filtros.js';

export function useQuestao(progresso) {
  const [todasQuestoes, setTodasQuestoes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [filtros, setFiltros] = useState(filtrosIniciais);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        setCarregando(true);
        const dados = await carregarDados();
        if (!ativo) return;
        setTodasQuestoes(dados.questoes);
        setMateriais(dados.materiais);
      } catch (err) {
        console.error(err);
        if (ativo) setErro(err.message);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const opcoesFiltro = useMemo(() => opcoesDeFiltro(todasQuestoes), [todasQuestoes]);

  const questoesFiltradas = useMemo(
    () => aplicarFiltros(todasQuestoes, filtros, progresso),
    [todasQuestoes, filtros, progresso]
  );

  const atualizarFiltro = (campo, valor) => {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  };

  const limparFiltros = () => {
    setFiltros(filtrosIniciais());
  };

  return {
    questoes: questoesFiltradas,
    materiais,
    totalOriginal: todasQuestoes.length,
    carregando,
    erro,
    filtros,
    opcoesFiltro,
    atualizarFiltro,
    limparFiltros
  };
}
