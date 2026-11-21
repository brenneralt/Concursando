/**
 * Valida o banco de questões como dado de produto.
 *
 * Uso:
 *   node scripts/validar-questoes.mjs [--arquivo data/questoes.json] [--json]
 *
 * Sai com código 1 quando encontra erro. Avisos (questões-imagem, caderno sem
 * gabarito, referência a texto sem apoio) não quebram o build, mas aparecem no
 * relatório para revisão humana.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CAMPOS_OBRIGATORIOS = [
  'id',
  'banca',
  'ano',
  'orgao',
  'cargo',
  'nivel',
  'disciplina',
  'assunto',
  'enunciado',
  'alternativas',
  'gabarito',
  'anulada'
];
const CAMPOS_OPCIONAIS = ['material_id'];
const LETRAS = ['A', 'B', 'C', 'D', 'E'];

const REFERENCIA_A_TEXTO =
  /(com base no (texto|trecho|poema|quadro|tabela|gr[áa]fico)|de acordo com o texto|no texto (a seguir|acima)|texto (a seguir|acima)|observe o (texto|quadro|gr[áa]fico|poema))/i;
const MARCAS_DE_CONTAMINACAO = [/pciconcursos/i, /GABARITO\s*OFICIAL/i];

function argumentos(argv) {
  const opcoes = { arquivo: 'data/questoes.json', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--arquivo') opcoes.arquivo = argv[++i];
    else if (argv[i] === '--json') opcoes.json = true;
  }
  return opcoes;
}

function texto(valor) {
  return typeof valor === 'string' && valor.trim().length > 0;
}

function validarQuestao(q, indice, contexto) {
  const erros = [];
  const avisos = [];
  const rotulo = q?.id ? `questão ${q.id}` : `índice ${indice}`;

  if (!q || typeof q !== 'object' || Array.isArray(q)) {
    erros.push(`${rotulo}: registro não é um objeto`);
    return { erros, avisos };
  }

  const chaves = Object.keys(q);
  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (!(campo in q)) erros.push(`${rotulo}: campo obrigatório ausente "${campo}"`);
  }
  for (const chave of chaves) {
    if (!CAMPOS_OBRIGATORIOS.includes(chave) && !CAMPOS_OPCIONAIS.includes(chave)) {
      erros.push(`${rotulo}: campo não previsto no schema "${chave}"`);
    }
  }

  if (!texto(q.id)) erros.push(`${rotulo}: "id" vazio`);
  else if (contexto.ids.has(q.id)) erros.push(`${rotulo}: "id" duplicado`);
  else contexto.ids.add(q.id);

  for (const campo of ['banca', 'orgao', 'cargo', 'nivel', 'disciplina', 'assunto']) {
    if (!texto(q[campo])) erros.push(`${rotulo}: "${campo}" vazio`);
  }

  if (!Number.isInteger(q.ano) || q.ano < 1990 || q.ano > 2100) {
    erros.push(`${rotulo}: "ano" deve ser inteiro entre 1990 e 2100 (recebido: ${q.ano})`);
  }

  if (!texto(q.enunciado)) erros.push(`${rotulo}: "enunciado" vazio`);

  if (typeof q.anulada !== 'boolean') {
    erros.push(`${rotulo}: "anulada" deve ser booleano`);
  }

  const alternativas = q.alternativas;
  if (!alternativas || typeof alternativas !== 'object' || Array.isArray(alternativas)) {
    erros.push(`${rotulo}: "alternativas" deve ser um objeto {A: ...}`);
  } else {
    const letras = Object.keys(alternativas);
    if (letras.length < 2 || letras.length > LETRAS.length) {
      erros.push(`${rotulo}: "alternativas" deve ter entre 2 e 5 opções`);
    }
    const esperadas = LETRAS.slice(0, letras.length);
    if (letras.join('') !== esperadas.join('')) {
      erros.push(
        `${rotulo}: alternativas devem ser contíguas a partir de A (recebido: ${letras.join(', ')})`
      );
    }
    for (const letra of letras) {
      const valor = alternativas[letra];
      if (typeof valor !== 'string') {
        erros.push(`${rotulo}: alternativa ${letra} não é texto`);
      } else if (!valor.trim()) {
        avisos.push(`${rotulo}: alternativa ${letra} vazia (provável questão-imagem)`);
      }
    }
  }

  if (q.anulada === true) {
    if (q.gabarito !== null) {
      erros.push(`${rotulo}: questão anulada deve ter "gabarito": null`);
    }
  } else if (q.gabarito === null) {
    avisos.push(`${rotulo}: sem gabarito oficial (caderno não pareado)`);
  } else if (!LETRAS.includes(q.gabarito)) {
    erros.push(`${rotulo}: "gabarito" deve ser A-E ou null (recebido: ${JSON.stringify(q.gabarito)})`);
  } else if (alternativas && !(q.gabarito in alternativas)) {
    erros.push(`${rotulo}: gabarito ${q.gabarito} não existe entre as alternativas`);
  }

  if (q.material_id !== undefined && !texto(q.material_id)) {
    erros.push(`${rotulo}: "material_id" deve ser texto quando presente`);
  }
  if (q.material_id && contexto.materiais && !contexto.materiais.has(q.material_id)) {
    erros.push(`${rotulo}: "material_id" ${q.material_id} não existe em materiais.json`);
  }

  const serializado = JSON.stringify(q);
  for (const marca of MARCAS_DE_CONTAMINACAO) {
    if (marca.test(serializado)) {
      avisos.push(`${rotulo}: possível resíduo de captura (${marca})`);
    }
  }

  const temApoio =
    Boolean(q.material_id) || String(q.enunciado || '').includes('\n\n');
  if (!temApoio && REFERENCIA_A_TEXTO.test(String(q.enunciado || ''))) {
    avisos.push(`${rotulo}: enunciado remete a um texto de apoio que não está presente`);
  }

  return { erros, avisos };
}

async function lerJson(caminho) {
  try {
    return JSON.parse(await readFile(caminho, 'utf8'));
  } catch (erro) {
    throw new Error(`Não foi possível ler ${caminho}: ${erro.message}`, { cause: erro });
  }
}

async function principal() {
  const opcoes = argumentos(process.argv.slice(2));
  const caminhoQuestoes = path.resolve(raiz, opcoes.arquivo);
  const caminhoMateriais = path.join(path.dirname(caminhoQuestoes), 'materiais.json');

  const questoes = await lerJson(caminhoQuestoes);
  if (!Array.isArray(questoes)) throw new Error('O banco deve ser uma lista de questões');

  let materiais = null;
  try {
    const lista = await lerJson(caminhoMateriais);
    if (Array.isArray(lista)) materiais = new Set(lista.map((m) => m.id));
  } catch {
    materiais = null;
  }

  const contexto = { ids: new Set(), materiais };
  const erros = [];
  const avisos = [];

  questoes.forEach((q, indice) => {
    const resultado = validarQuestao(q, indice, contexto);
    erros.push(...resultado.erros);
    avisos.push(...resultado.avisos);
  });

  const resumo = {
    arquivo: path.relative(raiz, caminhoQuestoes),
    total: questoes.length,
    idsUnicos: contexto.ids.size,
    comMaterial: questoes.filter((q) => q.material_id).length,
    anuladas: questoes.filter((q) => q.anulada).length,
    semGabarito: questoes.filter((q) => q.anulada !== true && q.gabarito === null).length,
    erros: erros.length,
    avisos: avisos.length
  };

  if (opcoes.json) {
    console.log(JSON.stringify({ resumo, erros, avisos }, null, 2));
  } else {
    console.log('Validação do banco de questões');
    console.log(`  arquivo: ${resumo.arquivo}`);
    console.log(`  questões: ${resumo.total} | ids únicos: ${resumo.idsUnicos}`);
    console.log(`  anuladas: ${resumo.anuladas} | sem gabarito: ${resumo.semGabarito}`);
    console.log(`  com material estruturado: ${resumo.comMaterial}`);
    console.log(`  erros: ${resumo.erros} | avisos: ${resumo.avisos}`);

    if (erros.length) {
      console.log('\nERROS (impedem a publicação):');
      for (const erro of erros.slice(0, 50)) console.log(`  ✗ ${erro}`);
      if (erros.length > 50) console.log(`  ... e mais ${erros.length - 50}`);
    }
    if (avisos.length) {
      console.log('\nAVISOS (revisão recomendada):');
      for (const aviso of avisos.slice(0, 10)) console.log(`  ! ${aviso}`);
      if (avisos.length > 10) console.log(`  ... e mais ${avisos.length - 10}`);
    }
  }

  if (erros.length) process.exitCode = 1;
}

principal().catch((erro) => {
  console.error(`[validar-questoes] ${erro.message}`);
  process.exitCode = 1;
});
