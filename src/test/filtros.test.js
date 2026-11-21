import { describe, expect, it } from 'vitest';
import {
  aplicarFiltros,
  filtrosIniciais,
  opcoesDeFiltro
} from '../features/questoes/filtros.js';
import { criarProgresso, criarQuestao } from './fixtures.js';

const questoes = [
  criarQuestao({ id: 'Q1', disciplina: 'Português', ano: 2024, gabarito: 'A' }),
  criarQuestao({ id: 'Q2', disciplina: 'Matemática', ano: 2023, gabarito: 'B' }),
  criarQuestao({
    id: 'Q3',
    disciplina: 'Português',
    ano: 2023,
    anulada: true,
    gabarito: null
  }),
  criarQuestao({
    id: 'Q4',
    disciplina: 'Direito',
    ano: 2024,
    gabarito: null,
    enunciado: 'Texto sobre ética nas empresas.'
  })
];

describe('filtros', () => {
  it('sem filtros devolve o catálogo inteiro', () => {
    expect(aplicarFiltros(questoes, filtrosIniciais(), criarProgresso())).toHaveLength(4);
  });

  it('multiseleção no mesmo campo funciona como OU', () => {
    const filtros = { ...filtrosIniciais(), disciplina: ['Português', 'Direito'] };
    const ids = aplicarFiltros(questoes, filtros, criarProgresso()).map((q) => q.id);
    expect(ids).toEqual(['Q1', 'Q3', 'Q4']);
  });

  it('campos diferentes funcionam como E', () => {
    const filtros = { ...filtrosIniciais(), disciplina: ['Português'], ano: ['2024'] };
    const ids = aplicarFiltros(questoes, filtros, criarProgresso()).map((q) => q.id);
    expect(ids).toEqual(['Q1']);
  });

  it('oculta anuladas e questões sem gabarito quando pedido', () => {
    const filtros = {
      ...filtrosIniciais(),
      ocultarAnuladas: true,
      somenteComGabarito: true
    };
    const ids = aplicarFiltros(questoes, filtros, criarProgresso()).map((q) => q.id);
    expect(ids).toEqual(['Q1', 'Q2']);
  });

  it('filtra por status do usuário', () => {
    const progresso = criarProgresso({
      respostas: {
        Q1: { resposta: 'A', acertou: true },
        Q2: { resposta: 'C', acertou: false }
      },
      favoritos: ['Q3']
    });

    const erros = aplicarFiltros(
      questoes,
      { ...filtrosIniciais(), status: 'ERROS' },
      progresso
    ).map((q) => q.id);
    expect(erros).toEqual(['Q2']);

    const favoritas = aplicarFiltros(
      questoes,
      { ...filtrosIniciais(), status: 'FAVORITAS' },
      progresso
    ).map((q) => q.id);
    expect(favoritas).toEqual(['Q3']);

    const naoResolvidas = aplicarFiltros(
      questoes,
      { ...filtrosIniciais(), status: 'NAO_RESOLVIDAS' },
      progresso
    ).map((q) => q.id);
    expect(naoResolvidas).toEqual(['Q3', 'Q4']);
  });

  it('busca textual ignora caixa e varre alternativas', () => {
    const filtros = { ...filtrosIniciais(), busca: 'ÉTICA' };
    const ids = aplicarFiltros(questoes, filtros, criarProgresso()).map((q) => q.id);
    expect(ids).toEqual(['Q4']);
  });

  it('monta opções ordenadas e sem repetição', () => {
    const opcoes = opcoesDeFiltro(questoes);
    expect(opcoes.disciplinas).toEqual(['Direito', 'Matemática', 'Português']);
    expect(opcoes.anos).toEqual(['2024', '2023']);
  });
});
