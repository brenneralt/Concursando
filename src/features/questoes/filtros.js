/**
 * Regras de filtragem do catálogo.
 *
 * Tudo aqui é função pura para poder ser testado sem React nem navegador.
 */

/** Lista vazia = "todas". Cada campo é um array de valores selecionados. */
export function filtrosIniciais() {
  return {
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
  };
}

/** Opções dinâmicas que alimentam os dropdowns, sempre em ordem estável. */
export function opcoesDeFiltro(questoes) {
  const bancas = new Set();
  const disciplinas = new Set();
  const assuntos = new Set();
  const cargos = new Set();
  const orgaos = new Set();
  const anos = new Set();
  const niveis = new Set();

  for (const q of questoes) {
    if (q.banca) bancas.add(q.banca);
    if (q.disciplina) disciplinas.add(q.disciplina);
    if (q.assunto) assuntos.add(q.assunto);
    if (q.cargo) cargos.add(q.cargo);
    if (q.orgao) orgaos.add(q.orgao);
    if (q.ano) anos.add(String(q.ano));
    if (q.nivel) niveis.add(q.nivel);
  }

  return {
    bancas: Array.from(bancas).sort(),
    disciplinas: Array.from(disciplinas).sort(),
    assuntos: Array.from(assuntos).sort(),
    cargos: Array.from(cargos).sort(),
    orgaos: Array.from(orgaos).sort(),
    anos: Array.from(anos).sort((a, b) => b - a),
    niveis: Array.from(niveis).sort()
  };
}

function correspondeAosCampos(questao, filtros) {
  const campos = ['banca', 'disciplina', 'assunto', 'cargo', 'orgao', 'nivel'];
  for (const campo of campos) {
    const selecionados = filtros[campo];
    if (selecionados.length > 0 && !selecionados.includes(questao[campo])) return false;
  }
  if (filtros.ano.length > 0 && !filtros.ano.includes(String(questao.ano))) return false;
  return true;
}

function correspondeAoStatus(questao, filtros, progresso) {
  const respostaInfo = progresso.respostas[questao.id];
  const resolvida = Boolean(respostaInfo);
  const acertou = Boolean(respostaInfo?.acertou);
  const ehFavorita = progresso.favoritos.includes(questao.id);

  if (filtros.status === 'ANULADAS' && !questao.anulada) return false;
  if (filtros.status === 'ACERTOS' && (!resolvida || !acertou)) return false;
  if (filtros.status === 'ERROS' && (!resolvida || acertou)) return false;
  if (filtros.status === 'NAO_RESOLVIDAS' && resolvida) return false;
  if (filtros.status === 'FAVORITAS' && !ehFavorita) return false;
  return true;
}

function correspondeABusca(questao, termoBruto) {
  const termo = termoBruto.trim().toLowerCase();
  if (!termo) return true;
  const textoCompleto = [
    questao.enunciado,
    questao.orgao,
    questao.cargo,
    questao.assunto,
    questao.disciplina,
    questao.banca,
    questao.id,
    ...Object.values(questao.alternativas || {})
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return textoCompleto.includes(termo);
}

/** Aplica todos os filtros e a busca textual, preservando a ordem original. */
export function aplicarFiltros(questoes, filtros, progresso) {
  return questoes.filter((questao) => {
    if (!correspondeAosCampos(questao, filtros)) return false;

    if (filtros.ocultarAnuladas && questao.anulada) return false;
    if (
      filtros.somenteComGabarito &&
      (questao.gabarito === null || questao.gabarito === undefined)
    ) {
      return false;
    }

    if (!correspondeAoStatus(questao, filtros, progresso)) return false;
    if (!correspondeABusca(questao, filtros.busca)) return false;

    return true;
  });
}
