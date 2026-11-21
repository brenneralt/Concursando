import { describe, expect, it } from 'vitest';
import {
  dividirEnunciado,
  indexarMateriais
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
