import { describe, expect, it } from 'vitest';
import {
  alternarFavoritoNoProgresso,
  calcularEstatisticas,
  corrigirResposta,
  desempenhoPorDisciplina,
  limparRespostaDoProgresso,
  registrarRespostaNoProgresso
} from '../features/desempenho/estatisticas.js';
import { criarProgresso, criarQuestao } from './fixtures.js';

describe('correção de resposta', () => {
  it('acerta apenas quando a alternativa coincide com o gabarito', () => {
    expect(corrigirResposta('A', 'A')).toBe(true);
    expect(corrigirResposta('B', 'A')).toBe(false);
  });

  it('não considera acerto quando falta resposta ou gabarito', () => {
    expect(corrigirResposta(null, 'A')).toBe(false);
    expect(corrigirResposta('A', null)).toBe(false);
    expect(corrigirResposta(undefined, undefined)).toBe(false);
  });

  it('registra a resposta sem mutar o progresso anterior', () => {
    const anterior = criarProgresso();
    const novo = registrarRespostaNoProgresso(anterior, 'Q1', 'A', 'A', '2026-01-01T00:00:00Z');

    expect(anterior.respostas).toEqual({});
    expect(novo.respostas.Q1).toEqual({
      resposta: 'A',
      acertou: true,
      data: '2026-01-01T00:00:00Z'
    });
  });

  it('limpar resposta mantém favoritos e outras respostas', () => {
    const progresso = criarProgresso({
      respostas: { Q1: { resposta: 'A', acertou: true } },
      favoritos: ['Q1']
    });
    const novo = limparRespostaDoProgresso(progresso, 'Q1');
    expect(novo.respostas).toEqual({});
    expect(novo.favoritos).toEqual(['Q1']);
  });

  it('alterna favorito nos dois sentidos', () => {
    const comFavorito = alternarFavoritoNoProgresso(criarProgresso(), 'Q1');
    expect(comFavorito.favoritos).toEqual(['Q1']);
    expect(alternarFavoritoNoProgresso(comFavorito, 'Q1').favoritos).toEqual([]);
  });
});

describe('estatísticas', () => {
  it('zera quando não há respostas', () => {
    expect(calcularEstatisticas(criarProgresso())).toEqual({
      totalResolvidas: 0,
      totalAcertos: 0,
      totalErros: 0,
      taxaAcerto: 0,
      totalFavoritas: 0
    });
  });

  it('conta acertos, erros, taxa e favoritas', () => {
    const progresso = criarProgresso({
      respostas: {
        Q1: { resposta: 'A', acertou: true },
        Q2: { resposta: 'B', acertou: true },
        Q3: { resposta: 'C', acertou: false }
      },
      favoritos: ['Q1', 'Q2']
    });

    expect(calcularEstatisticas(progresso)).toEqual({
      totalResolvidas: 3,
      totalAcertos: 2,
      totalErros: 1,
      taxaAcerto: 67,
      totalFavoritas: 2
    });
  });

  it('agrupa o desempenho por disciplina e ignora questões fora do catálogo', () => {
    const questoes = [
      criarQuestao({ id: 'Q1', disciplina: 'Português' }),
      criarQuestao({ id: 'Q2', disciplina: 'Português' }),
      criarQuestao({ id: 'Q3', disciplina: 'Matemática' })
    ];
    const progresso = criarProgresso({
      respostas: {
        Q1: { acertou: true },
        Q2: { acertou: false },
        Q3: { acertou: true },
        SUMIU: { acertou: true }
      }
    });

    const resumo = desempenhoPorDisciplina(questoes, progresso);
    expect(resumo).toEqual([
      { disciplina: 'Português', resolvidas: 2, acertos: 1, erros: 1, taxaAcerto: 50 },
      { disciplina: 'Matemática', resolvidas: 1, acertos: 1, erros: 0, taxaAcerto: 100 }
    ]);
  });
});
