/**
 * Carregamento do catálogo estático.
 *
 * O `questoes.json` é gerado a partir de `data/questoes.json` no build
 * (`scripts/preparar-dados.mjs`) e servido em `public/dados/`. O arquivo de
 * materiais é opcional: enquanto a migração para `material_id` não é aplicada,
 * ele não existe e o app segue usando o texto embutido no enunciado.
 */

const CAMINHO_QUESTOES = 'dados/questoes.json';
const CAMINHO_MATERIAIS = 'dados/materiais.json';

function urlPublica(caminho) {
  const base = import.meta.env.BASE_URL || './';
  return `${base.endsWith('/') ? base : `${base}/`}${caminho}`;
}

async function buscarJson(caminho, { opcional = false } = {}) {
  const resposta = await fetch(urlPublica(caminho));
  if (!resposta.ok) {
    if (opcional) return null;
    throw new Error(`Falha ao carregar ${caminho} (${resposta.status})`);
  }
  return resposta.json();
}

let promessa = null;

/**
 * Carrega questões e materiais uma única vez por sessão da página.
 * Chamadas concorrentes (App e Simulado) compartilham a mesma requisição.
 */
export function carregarDados({ recarregar = false } = {}) {
  if (promessa && !recarregar) return promessa;

  promessa = (async () => {
    const [questoes, materiais] = await Promise.all([
      buscarJson(CAMINHO_QUESTOES),
      buscarJson(CAMINHO_MATERIAIS, { opcional: true }).catch(() => null)
    ]);

    if (!Array.isArray(questoes)) {
      throw new Error('Formato inválido: questoes.json deve ser uma lista');
    }

    return {
      questoes,
      materiais: Array.isArray(materiais) ? materiais : []
    };
  })();

  promessa.catch(() => {
    promessa = null;
  });

  return promessa;
}

/** Só para testes: descarta o cache entre casos. */
export function limparCacheDeDados() {
  promessa = null;
}
