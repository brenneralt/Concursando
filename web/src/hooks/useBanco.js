import { useState, useEffect } from 'react';

/**
 * Carrega o banco completo de questões (`questoes.json`) uma única vez.
 * Usado pelas telas que precisam do catálogo inteiro (ex.: Simulado).
 */
export function useBanco() {
  const [questoes, setQuestoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        setCarregando(true);
        const baseUrl = import.meta.env.BASE_URL || './';
        const url = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}questoes.json`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Falha ao carregar banco de questões (${res.status})`);
        }
        const data = await res.json();
        if (ativo) setQuestoes(data);
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

  return { questoes, carregando, erro };
}
