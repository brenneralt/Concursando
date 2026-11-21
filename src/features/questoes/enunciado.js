/**
 * Separação entre material de leitura e comando da questão.
 *
 * Formato novo (recomendado): a questão tem `material_id` e o texto de apoio
 * fica em `materiais` (`{ id, tipo, conteudo, fonte }`), compartilhável entre
 * várias questões.
 *
 * Formato legado: o texto inteiro está em `enunciado`, separado do comando por
 * uma linha em branco. Continuamos lendo esse formato para não quebrar o acervo
 * atual enquanto a migração não é revisada.
 */

/** Indexa a lista de materiais por id para busca O(1). */
export function indexarMateriais(materiais) {
  if (!materiais) return new Map();
  const lista = Array.isArray(materiais) ? materiais : [];
  return new Map(lista.filter((m) => m && m.id).map((m) => [m.id, m]));
}

/**
 * Devolve `{ textoApoio, comando, material }`.
 * - Quando existe `material_id` resolvido, o apoio vem do material e o
 *   `enunciado` já é o comando.
 * - Caso contrário, aplica a heurística do formato legado.
 */
export function dividirEnunciado(questao, materiais) {
  const mapa = materiais instanceof Map ? materiais : indexarMateriais(materiais);
  const material = questao.material_id ? mapa.get(questao.material_id) : null;
  const enunciado = String(questao.enunciado || '');

  if (material) {
    return {
      textoApoio: material.conteudo || null,
      comando: enunciado,
      material
    };
  }

  const separador = enunciado.indexOf('\n\n');
  if (separador > 0) {
    return {
      textoApoio: enunciado.slice(0, separador),
      comando: enunciado.slice(separador + 2),
      material: null
    };
  }

  return { textoApoio: null, comando: enunciado, material: null };
}
