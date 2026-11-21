/** Fábricas mínimas para os testes, sem depender do banco real. */

export function criarQuestao(sobrescreve = {}) {
  return {
    id: 'Q1',
    banca: 'CESGRANRIO',
    ano: 2024,
    orgao: 'Órgão X',
    cargo: 'Assistente',
    nivel: 'Médio',
    disciplina: 'Português',
    assunto: 'Interpretação de texto',
    enunciado: 'Comando da questão.',
    alternativas: { A: 'Certa', B: 'Errada', C: 'Errada', D: 'Errada', E: 'Errada' },
    gabarito: 'A',
    anulada: false,
    ...sobrescreve
  };
}

export function criarProgresso(sobrescreve = {}) {
  return {
    respostas: {},
    favoritos: [],
    ...sobrescreve
  };
}
