/**
 * Montagem e correção de simulados.
 * Sem React, sem relógio global: o sorteio recebe o gerador aleatório.
 */

/** Fisher-Yates com gerador injetável (permite teste determinístico). */
export function embaralhar(lista, rng = Math.random) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** Só entra no simulado questão válida, com gabarito e pelo menos duas alternativas. */
export function questaoElegivel(questao) {
  return Boolean(
    !questao.anulada &&
      questao.gabarito !== null &&
      questao.gabarito !== undefined &&
      questao.alternativas &&
      Object.keys(questao.alternativas).length >= 2
  );
}

/** Recorte configurado na tela (disciplina/ano/nível), antes do sorteio. */
export function filtrarDisponiveis(questoes, config) {
  return questoes.filter((questao) => {
    if (!questaoElegivel(questao)) return false;
    if (config.disciplina !== 'TODAS' && questao.disciplina !== config.disciplina) return false;
    if (config.ano !== 'TODOS' && String(questao.ano) !== config.ano) return false;
    if (config.nivel !== 'TODOS' && questao.nivel !== config.nivel) return false;
    return true;
  });
}

/** Sorteia até `config.quantidade` questões do recorte. */
export function montarProva(questoes, config, rng = Math.random) {
  const disponiveis = filtrarDisponiveis(questoes, config);
  const total = Math.min(config.quantidade, disponiveis.length);
  return embaralhar(disponiveis, rng).slice(0, total);
}

/**
 * Fecha o simulado: marca acerto/erro/branco de cada questão.
 * `marcada` é a alternativa escolhida (ou null quando em branco).
 */
export function calcularResultado(prova, respostas) {
  const detalhes = prova.map((questao) => {
    const marcada = respostas[questao.id] || null;
    return {
      questao,
      marcada,
      acertou: marcada !== null && marcada === questao.gabarito
    };
  });

  return {
    detalhes,
    acertos: detalhes.filter((d) => d.acertou).length,
    erros: detalhes.filter((d) => d.marcada && !d.acertou).length,
    emBranco: detalhes.filter((d) => !d.marcada).length
  };
}

/** mm:ss (ou h:mm:ss) para o cronômetro e o resultado. */
export function formatarTempo(totalSegundos) {
  const seg = Math.max(0, Math.floor(totalSegundos));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const dois = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}
