import { describe, expect, it } from 'vitest';
import {
  calcularResultado,
  filtrarDisponiveis,
  formatarTempo,
  montarProva,
  questaoElegivel
} from '../features/simulados/montarSimulado.js';
import { criarQuestao } from './fixtures.js';

const questoes = [
  criarQuestao({ id: 'Q1', disciplina: 'Português', ano: 2024 }),
  criarQuestao({ id: 'Q2', disciplina: 'Português', ano: 2023 }),
  criarQuestao({ id: 'Q3', disciplina: 'Matemática', ano: 2024 }),
  criarQuestao({ id: 'Q4', disciplina: 'Português', ano: 2024, anulada: true, gabarito: null }),
  criarQuestao({ id: 'Q5', disciplina: 'Português', ano: 2024, gabarito: null })
];

const base = { disciplina: 'TODAS', ano: 'TODOS', nivel: 'TODOS', quantidade: 10 };

describe('montagem de simulado', () => {
  it('exclui anuladas e questões sem gabarito', () => {
    expect(questaoElegivel(questoes[0])).toBe(true);
    expect(questaoElegivel(questoes[3])).toBe(false);
    expect(questaoElegivel(questoes[4])).toBe(false);
  });

  it('aplica o recorte de disciplina e ano', () => {
    const ids = filtrarDisponiveis(questoes, {
      ...base,
      disciplina: 'Português',
      ano: '2024'
    }).map((q) => q.id);
    expect(ids).toEqual(['Q1']);
  });

  it('respeita a quantidade pedida e não repete questões', () => {
    const prova = montarProva(questoes, { ...base, quantidade: 2 }, () => 0.5);
    expect(prova).toHaveLength(2);
    expect(new Set(prova.map((q) => q.id)).size).toBe(2);
  });

  it('nunca devolve mais questões do que existem no recorte', () => {
    const prova = montarProva(questoes, { ...base, disciplina: 'Matemática', quantidade: 50 });
    expect(prova.map((q) => q.id)).toEqual(['Q3']);
  });

  it('é determinístico quando o gerador aleatório é fixo', () => {
    const rng = () => 0.25;
    const a = montarProva(questoes, base, rng).map((q) => q.id);
    const b = montarProva(questoes, base, rng).map((q) => q.id);
    expect(a).toEqual(b);
  });
});

describe('resultado do simulado', () => {
  it('separa acertos, erros e questões em branco', () => {
    const prova = questoes.slice(0, 3);
    const resultado = calcularResultado(prova, { Q1: 'A', Q2: 'C' });

    expect(resultado.acertos).toBe(1);
    expect(resultado.erros).toBe(1);
    expect(resultado.emBranco).toBe(1);
    expect(resultado.detalhes.map((d) => d.acertou)).toEqual([true, false, false]);
    expect(resultado.detalhes[2].marcada).toBeNull();
  });

  it('formata o tempo em mm:ss e h:mm:ss', () => {
    expect(formatarTempo(0)).toBe('00:00');
    expect(formatarTempo(65)).toBe('01:05');
    expect(formatarTempo(3661)).toBe('1:01:01');
    expect(formatarTempo(-10)).toBe('00:00');
  });
});
