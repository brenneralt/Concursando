/**
 * Correção de respostas e estatísticas do progresso.
 * Funções puras: não tocam em rede, localStorage ou React.
 */

export const PROGRESSO_VAZIO = { respostas: {}, favoritos: [] };

/** Uma resposta só conta como acerto quando a alternativa coincide com o gabarito. */
export function corrigirResposta(respostaEscolhida, gabarito) {
  return respostaEscolhida !== null &&
    respostaEscolhida !== undefined &&
    gabarito !== null &&
    gabarito !== undefined &&
    respostaEscolhida === gabarito;
}

/**
 * Devolve um novo progresso com a resposta registrada.
 * `data` é injetável para deixar o teste determinístico.
 */
export function registrarRespostaNoProgresso(
  progresso,
  questaoId,
  respostaEscolhida,
  gabarito,
  data = new Date().toISOString()
) {
  const acertou = corrigirResposta(respostaEscolhida, gabarito);
  return {
    ...progresso,
    respostas: {
      ...progresso.respostas,
      [questaoId]: { resposta: respostaEscolhida, acertou, data }
    }
  };
}

/** Remove a resposta de uma questão, mantendo favoritos intactos. */
export function limparRespostaDoProgresso(progresso, questaoId) {
  const respostas = { ...progresso.respostas };
  delete respostas[questaoId];
  return { ...progresso, respostas };
}

/** Alterna o favorito e devolve um novo progresso. */
export function alternarFavoritoNoProgresso(progresso, questaoId) {
  const favoritos = progresso.favoritos.includes(questaoId)
    ? progresso.favoritos.filter((id) => id !== questaoId)
    : [...progresso.favoritos, questaoId];
  return { ...progresso, favoritos };
}

/** Números exibidos na navbar e no modal de estatísticas. */
export function calcularEstatisticas(progresso) {
  const respostas = Object.values(progresso.respostas);
  const totalResolvidas = respostas.length;
  const totalAcertos = respostas.filter((r) => r.acertou).length;
  const totalErros = totalResolvidas - totalAcertos;
  const taxaAcerto =
    totalResolvidas > 0 ? Math.round((totalAcertos / totalResolvidas) * 100) : 0;

  return {
    totalResolvidas,
    totalAcertos,
    totalErros,
    taxaAcerto,
    totalFavoritas: progresso.favoritos.length
  };
}

/** Resumo de desempenho por disciplina, usado no modal de estatísticas. */
export function desempenhoPorDisciplina(questoes, progresso) {
  const porId = new Map(questoes.map((q) => [q.id, q]));
  const acumulado = new Map();

  for (const [questaoId, resposta] of Object.entries(progresso.respostas)) {
    const questao = porId.get(questaoId);
    if (!questao) continue;
    const chave = questao.disciplina || 'Sem disciplina';
    const atual = acumulado.get(chave) || { disciplina: chave, resolvidas: 0, acertos: 0 };
    atual.resolvidas += 1;
    if (resposta.acertou) atual.acertos += 1;
    acumulado.set(chave, atual);
  }

  return Array.from(acumulado.values())
    .map((item) => ({
      ...item,
      erros: item.resolvidas - item.acertos,
      taxaAcerto:
        item.resolvidas > 0 ? Math.round((item.acertos / item.resolvidas) * 100) : 0
    }))
    .sort((a, b) => b.resolvidas - a.resolvidas);
}
