import { useEffect, useState } from 'react';
import { carregarDados } from './banco.js';

/**
 * Carrega o banco completo de questões e os materiais de apoio.
 * Usado pelas telas que precisam do catálogo inteiro (ex.: Simulado).
 */
export function useBanco() {
  const [questoes, setQuestoes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        setCarregando(true);
        const dados = await carregarDados();
        if (!ativo) return;
        setQuestoes(dados.questoes);
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

  return { questoes, materiais, carregando, erro };
}
