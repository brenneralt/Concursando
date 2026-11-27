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

/**
 * Extrai um termo de busca curto a partir da questão para usar no YouTube.
 * Prioriza: assunto + disciplina + até 3 palavras-chave do comando (sem stopwords).
 * O resultado não passa de 80 caracteres para caber na URL.
 */
export function extrairTermoBusca(questao) {
  const partes = [];

  if (questao.assunto) partes.push(questao.assunto);
  if (questao.disciplina) partes.push(questao.disciplina);

  // Pega o comando (sem o texto de apoio)
  const { comando } = dividirEnunciado(questao);
  if (comando) {
    // Stopwords básicas em PT
    const stop = new Set([
      'a','o','e','de','da','do','das','dos','em','na','no','nas','nos','um','uma','para','com','por','que','se','ao','à','as','os','pelo','pela','pelos','pelas','um','uma','uns','umas','ao','aos','à','às',
      'assinale','alternativa','alternativas','apresenta','apresentam','correta','corretas','errada','erradas','indique','indica','qual','quais','segue','seguem','diz','dizem','afirma','afirmam'
    ]);
    const palavras = comando
      .toLowerCase()
      .replace(/[.,;:!?()[\]{}"]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stop.has(w))
      .slice(-3); // pega as últimas 3 palavras-chave (mais específicas)
    if (palavras.length) partes.push(palavras.join(' '));
  }

  const termo = partes.join(' ');
  return termo.slice(0, 80);
}

/**
 * Gera a URL de busca no YouTube para a questão.
 */
export function urlYoutubeBusca(questao) {
  const termo = extrairTermoBusca(questao);
  const q = encodeURIComponent(`${termo} questão concurso`);
  return `https://www.youtube.com/results?search_query=${q}`;
}
