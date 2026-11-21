/**
 * Copia o banco de questões para o diretório público do build.
 *
 * `data/questoes.json` é a fonte única de verdade (versionada). O arquivo em
 * `public/dados/` é artefato gerado e não deve ser commitado.
 */
import { copyFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(raiz, 'public', 'dados');

async function existe(caminho) {
  try {
    await access(caminho, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function copiar(nome, { obrigatorio }) {
  const origem = path.join(raiz, 'data', nome);
  if (!(await existe(origem))) {
    if (obrigatorio) {
      console.error(`[dados] Arquivo obrigatório ausente: data/${nome}`);
      process.exitCode = 1;
    }
    return false;
  }
  await copyFile(origem, path.join(destino, nome));
  console.log(`[dados] data/${nome} → public/dados/${nome}`);
  return true;
}

await mkdir(destino, { recursive: true });
await copiar('questoes.json', { obrigatorio: true });
await copiar('materiais.json', { obrigatorio: false });
