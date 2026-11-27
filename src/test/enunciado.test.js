import { describe, expect, it } from 'vitest';
import {
  dividirEnunciado,
  indexarMateriais,
  extrairTermoBusca,
  urlYoutubeBusca
} from '../features/questoes/enunciado.js';
import { criarQuestao } from './fixtures.js';

describe('texto de apoio', () => {
  it('separa o bloco legado do comando na primeira linha em branco', () => {
    const questao = criarQuestao({
      enunciado: 'Texto de apoio longo.\n\nCom base no texto, assinale a correta.'
    });

    expect(dividirEnunciado(questao)).toEqual({
      textoApoio: 'Texto de apoio longo.',
      comando: 'Com base no texto, assinale a correta.',
      material: null
    });
  });

  it('mantém o enunciado inteiro quando não há separador', () => {
    const questao = criarQuestao({ enunciado: 'Comando único.' });
    expect(dividirEnunciado(questao)).toEqual({
      textoApoio: null,
      comando: 'Comando único.',
      material: null
    });
  });

  it('prefere o material estruturado quando material_id existe', () => {
    const materiais = indexarMateriais([
      {
        id: 'MAT_1',
        tipo: 'texto',
        conteudo: 'Texto vindo de materiais.json.',
        fonte: { arquivo: 'prova.pdf', pagina_inicial: 1, pagina_final: 1 }
      }
    ]);
    const questao = criarQuestao({
      material_id: 'MAT_1',
      enunciado: 'Comando que usa o material.'
    });

    const resultado = dividirEnunciado(questao, materiais);
    expect(resultado.textoApoio).toBe('Texto vindo de materiais.json.');
    expect(resultado.comando).toBe('Comando que usa o material.');
    expect(resultado.material.id).toBe('MAT_1');
  });

  it('cai no formato legado quando o material_id não resolve', () => {
    const questao = criarQuestao({
      material_id: 'MAT_INEXISTENTE',
      enunciado: 'Apoio.\n\nComando.'
    });
    expect(dividirEnunciado(questao, []).textoApoio).toBe('Apoio.');
  });
});

describe('termo de busca para YouTube', () => {
  it('usa assunto + disciplina + palavras do comando', () => {
    const q = criarQuestao({
      disciplina: 'Língua Portuguesa',
      assunto: 'Gramática Aplicada e Texto',
      enunciado: 'Texto de apoio.\n\nAssinale a alternativa que apresenta o uso correto da crase.'
    });
    const termo = extrairTermoBusca(q);
    expect(termo).toContain('Gramática Aplicada e Texto');
    expect(termo).toContain('Língua Portuguesa');
    expect(termo).toContain('crase');
  });

  it('limita a 80 caracteres', () => {
    const q = criarQuestao({
      disciplina: 'D',
      assunto: 'A'.repeat(100),
      enunciado: 'Comando ' + 'palavra '.repeat(50)
    });
    expect(extrairTermoBusca(q).length).toBeLessThanOrEqual(80);
  });

  it('gera URL válida do YouTube', () => {
    const q = criarQuestao({
      disciplina: 'Informática',
      assunto: 'Sistemas Operacionais',
      enunciado: 'Qual a função do kernel?'
    });
    const url = urlYoutubeBusca(q);
    expect(url).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
    expect(url).toContain('Sistemas%20Operacionais');
    expect(url).toContain('Inform%C3%A1tica');
  });

  it('não quebra com acentos', () => {
    const q = criarQuestao({
      disciplina: 'Matemática',
      assunto: 'Funções & Gráficos',
      enunciado: 'Determine a raiz.'
    });
    const url = urlYoutubeBusca(q);
    expect(url).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
    expect(url).toContain('Fun%C3%A7%C3%B5es');
    expect(url).toContain('Gr%C3%A1ficos');
    expect(url).toContain('Matem%C3%A1tica');
  });
});
