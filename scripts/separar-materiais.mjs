/**
 * Propõe a separação entre material de leitura e comando da questão.
 *
 * O acervo atual guarda o texto de apoio dentro de `enunciado`, separado do
 * comando por uma linha em branco. Este script gera uma proposta:
 *
 *   data/migracao_materiais/questoes.json   → questões com `material_id`
 *   data/migracao_materiais/materiais.json  → materiais deduplicados por texto
 *   data/migracao_materiais/relatorio.json  → estatísticas e pendências
 *
 * Nada é sobrescrito por padrão. Depois da revisão humana (especialmente dos
 * textos que mencionam tabelas/imagens), rode com `--aplicar` para instalar os
 * arquivos em `data/`. A heurística é a mesma já usada na exibição, portanto a
 * proposta não muda o que o usuário lê — só organiza o dado.
 *
 * Uso:
 *   node scripts/separar-materiais.mjs            # dry-run
 *   node scripts/separar-materiais.mjs --aplicar  # grava em data/
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pastaProposta = path.join(raiz, 'data', 'migracao_materiais');
const aplicar = process.argv.includes('--aplicar');

function idDoMaterial(conteudo) {
  return `MAT_${createHash('sha1').update(conteudo).digest('hex').slice(0, 12).toUpperCase()}`;
}

function tipoDoMaterial(conteudo) {
  const t = conteudo.toLowerCase();
  if (/\btabela\b|\|\s*-{3,}/.test(t)) return 'tabela';
  if (/\b(poema|soneto|verso|estrofe)\b/.test(t)) return 'poema';
  if (/\b(charge|imagem|figura|gr[áa]fico|quadro)\b/.test(t)) return 'imagem';
  return 'texto';
}

const questoes = JSON.parse(await readFile(path.join(raiz, 'data', 'questoes.json'), 'utf8'));
const materiais = new Map();

// Preserva materiais já migrados em execuções anteriores.
try {
  const existentes = JSON.parse(await readFile(path.join(raiz, 'data', 'materiais.json'), 'utf8'));
  for (const material of existentes) materiais.set(material.id, material);
} catch {
  // ainda não existe: primeira migração
}
const propostas = [];
const semSeparador = [];
const compartilhados = new Map();

for (const questao of questoes) {
  const enunciado = String(questao.enunciado || '');
  const separador = enunciado.indexOf('\n\n');

  if (questao.material_id) {
    propostas.push({ ...questao });
    continue;
  }

  if (separador <= 0) {
    semSeparador.push(questao.id);
    propostas.push({ ...questao });
    continue;
  }

  const conteudo = enunciado.slice(0, separador).trim();
  const comando = enunciado.slice(separador + 2).trim();
  const id = idDoMaterial(conteudo);

  if (!materiais.has(id)) {
    materiais.set(id, {
      id,
      tipo: tipoDoMaterial(conteudo),
      conteudo,
      fonte: {
        arquivo: null,
        pagina_inicial: null,
        pagina_final: null,
        observacao: 'Extraído do enunciado; revisar no PDF original antes de publicar.'
      }
    });
  }

  const uso = compartilhados.get(id) || [];
  uso.push(questao.id);
  compartilhados.set(id, uso);

  propostas.push({ ...questao, material_id: id, enunciado: comando });
}

const materiaisLista = Array.from(materiais.values()).sort((a, b) => a.id.localeCompare(b.id));
const reutilizados = materiaisLista.filter((m) => (compartilhados.get(m.id) || []).length > 1);
const relatorio = {
  totalQuestoes: questoes.length,
  comMaterial: questoes.filter((q) => q.material_id).length,
  separadas: propostas.filter((q) => q.material_id).length,
  materiaisUnicos: materiaisLista.length,
  materiaisCompartilhados: reutilizados.length,
  semSeparador: semSeparador.length,
  geradoEm: new Date().toISOString()
};

if (aplicar) {
  await writeFile(
    path.join(raiz, 'data', 'materiais.json'),
    `${JSON.stringify(materiaisLista, null, 2)}\n`
  );
  await writeFile(
    path.join(raiz, 'data', 'questoes.json'),
    `${JSON.stringify(propostas, null, 2)}\n`
  );
  console.log('[materiais] aplicado em data/questoes.json e data/materiais.json');
} else {
  await mkdir(pastaProposta, { recursive: true });
  await writeFile(
    path.join(pastaProposta, 'questoes.json'),
    `${JSON.stringify(propostas, null, 2)}\n`
  );
  await writeFile(
    path.join(pastaProposta, 'materiais.json'),
    `${JSON.stringify(materiaisLista, null, 2)}\n`
  );
  await writeFile(
    path.join(pastaProposta, 'relatorio.json'),
    `${JSON.stringify(relatorio, null, 2)}\n`
  );
  console.log(`[materiais] proposta gravada em ${path.relative(raiz, pastaProposta)}/`);
}

console.log(
  `[materiais] ${relatorio.separadas} questões com material | ` +
    `${relatorio.materiaisUnicos} materiais únicos | ` +
    `${relatorio.materiaisCompartilhados} compartilhados | ` +
    `${relatorio.semSeparador} sem texto de apoio`
);
if (!aplicar) {
  console.log('[materiais] revise o relatório e rode com --aplicar para promover.');
}
