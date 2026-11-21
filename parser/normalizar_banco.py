#!/usr/bin/env python3
"""
Módulo de Normalização, Validação e Auditoria de Questões
Garante conformidade estrita com o SCHEMA OFICIAL DO OBJETO (questoes.json),
audita integridade, questões anuladas e sincroniza com public/dados/questoes.json.
"""

import json
import re
import shutil
from pathlib import Path
from typing import List, Dict, Any, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT_DIR / "data" / "questoes.json"
WEB_PUBLIC_FILE = ROOT_DIR / "public" / "dados" / "questoes.json"

REQUIRED_FIELDS = [
    "id", "banca", "ano", "orgao", "cargo",
    "nivel", "disciplina", "assunto",
    "enunciado", "alternativas", "anulada"
]

_DICIONARIO = None


def _carregar_dicionario():
    """Carrega um dicionário pt-BR do sistema (opcional, usado só na hifenização)."""
    global _DICIONARIO
    if _DICIONARIO is None:
        palavras = set()
        for caminho in ("/usr/share/dict/brazilian", "/usr/share/dict/portuguese"):
            try:
                with open(caminho, encoding="utf-8", errors="ignore") as f:
                    for linha in f:
                        w = linha.strip().lower()
                        if w and not w.startswith("#"):
                            palavras.add(w)
            except OSError:
                pass
        _DICIONARIO = palavras
    return _DICIONARIO


def _juntar_hifenizacao(texto: str) -> str:
    """Remove hífens de quebra de linha quando o dicionário confirma a palavra.

    PDFs antigos quebram palavras no fim da linha ("mes-\\nmo"). Se a junção for
    uma palavra conhecida, o hífen é removido; caso contrário, ele é mantido
    (protege compostos como "mão-de-obra", "ceder-lhes" e URLs).
    """
    dic = _carregar_dicionario()
    if not dic:
        return texto

    def troca(m):
        esq, direita = m.group(1), m.group(2)
        # rótulos de tabela/siglas (I-X, X-II) não são palavras quebradas
        if len(esq) <= 2 and esq.isupper():
            return f"{esq}-{direita}"
        if (esq + direita).lower() in dic:
            return esq + direita
        return f"{esq}-{direita}"

    return re.sub(r"([A-Za-zÀ-ÿ]+)-\n([A-Za-zÀ-ÿ]+)", troca, texto)


def _eh_titulo(linha: str) -> bool:
    """Linha sem minúsculas e curta: cabeçalho de seção/cargo, não início de frase."""
    texto = linha.strip()
    return bool(texto) and not re.search(r"[a-zà-ÿ]", texto)


def _juntar_pontuacao(texto: str) -> str:
    """Corrige pontuação separada pela diagramação ("traduzi-\\n-la", "47 , às")."""
    # compostos quebrados com hífen dos dois lados: econômico-\n-administrativas
    texto = re.sub(r"-\n(?=-)", "", texto)

    # linha que começa com pontuação é continuação da anterior (exceto sob título)
    linhas = texto.split("\n")
    saida: List[str] = []
    for linha in linhas:
        if saida and linha and linha[0] in ",.;:!?)]" and not _eh_titulo(saida[-1]):
            saida[-1] += linha
        else:
            saida.append(linha)
    texto = "\n".join(saida)

    # espaço indevido antes de pontuação (preserva reticências "...")
    texto = re.sub(r"[ \t]+([,;:!?])", r"\1", texto)
    texto = re.sub(r"[ \t]+\.(?=\s|$)", ".", texto)
    return texto


# Linhas de cabeçalho/rodapé que o PDF repete no meio do texto ("PROVA 1 - VERDE",
# "GABARITO 3 - PROVA SALMÃO", "FORMAÇÃO: ENGENHARIA..."). Nunca são conteúdo.
_CABECALHO = re.compile(
    r"^\s*(?:"
    r"PROVA\s+\d+(?:\s*[-–]\s*[^\n]{0,60})?"
    r"|GABARITO(?:\s+\d+)?(?:\s*[-–]\s*[^\n]{0,60})?"
    r"|FORMAÇÃO\s*:[^\n]{0,80}"
    r"|NÍVEL\s+(?:MÉDIO|FUNDAMENTAL|SUPERIOR)"
    r"|(?:FUNDAÇÃO\s+)?CESGRANRIO(?:\s*[-–][^\n]{0,60})?"
    r"|LEIA\s+ATENTAMENTE[^\n]{0,80}"
    r"|CADERNO\s+DE\s+PROVAS[^\n]{0,60}"
    r")\s*$",
    re.IGNORECASE,
)

# Marcadores que indicam início de item/alternativa: não devem ser "colados" na
# linha anterior pelo reflow.
_INICIO_ITEM = re.compile(r"^\s*(?:[IVXLC]{1,6}|[a-z]|\d{1,3})\s*[-–—.)]\s+")
_INICIO_ALTERNATIVA = re.compile(r"^\s*\(?[A-E]\)\s")
_URL = re.compile(r"https?://|www\.")
_FIM_DE_FRASE = re.compile(r"[.!?:;]\s*$")


def _remover_cabecalhos(texto: str) -> str:
    linhas = [l for l in texto.split("\n") if not _CABECALHO.match(l)]
    return "\n".join(linhas)


def _pode_juntar(anterior: str, seguinte: str) -> bool:
    """True quando `seguinte` é continuação da frase de `anterior`."""
    if not anterior or not seguinte:
        return False
    if _FIM_DE_FRASE.search(anterior):
        return False
    if _INICIO_ITEM.match(seguinte) or _INICIO_ALTERNATIVA.match(seguinte):
        return False
    if _URL.search(anterior) or _URL.search(seguinte):
        return False
    if len(anterior.strip()) < 12:
        return False
    if _eh_titulo(anterior):
        return False
    # continuação de prosa: minúscula (ou parêntese) no início da linha seguinte.
    # Números também continuam frases ("entre 2002 e\n2003"), desde que a linha
    # tenha texto — linhas só com número ("14.", "1.149") são itens/tabela.
    if re.match(r"^[a-zà-ÿ(]", seguinte):
        return True
    return bool(re.match(r"^\d", seguinte) and re.search(r"[A-Za-zÀ-ÿ]{2,}", seguinte))


def _reflow_bloco(linhas: List[str]) -> List[str]:
    """Junta linhas quebradas pela diagramação do PDF dentro de um parágrafo.

    A guarda de largura evita mexer em versos, tabelas e listas curtas: só
    reflui blocos cuja mediana de largura é de texto corrido.
    """
    uteis = [l.strip() for l in linhas if l.strip()]
    if len(uteis) < 2:
        return linhas
    larguras = sorted(len(l) for l in uteis)
    mediana = larguras[len(larguras) // 2]
    if mediana < 45:
        return linhas

    saida: List[str] = []
    for linha in linhas:
        if saida and _pode_juntar(saida[-1], linha):
            saida[-1] = saida[-1].rstrip() + " " + linha.lstrip()
        else:
            saida.append(linha)
    return saida


def _reflow_paragrafos(texto: str) -> str:
    """Remove quebras de linha da diagramação, preservando parágrafos (linha em branco)."""
    partes = re.split(r"(\n{2,})", texto)
    saida: List[str] = []
    for parte in partes:
        if parte.startswith("\n"):
            saida.append(parte)
        else:
            saida.append("\n".join(_reflow_bloco(parte.split("\n"))))
    return "".join(saida)


def limpar_texto(texto: str) -> str:
    """Sanitiza espaços e quebras redundantes sem perder formatação essencial."""
    if not isinstance(texto, str):
        return texto
    texto = re.sub(r'\r\n|\r', '\n', texto)
    if '-\n' in texto:
        texto = _juntar_hifenizacao(texto)
    texto = _juntar_pontuacao(texto)
    if '\n' in texto:
        texto = _remover_cabecalhos(texto)
        texto = _reflow_paragrafos(texto)
    texto = re.sub(r'[ \t]+', ' ', texto)
    texto = re.sub(r'\n{3,}', '\n\n', texto)
    return texto.strip()

def validar_questao(q: Dict[str, Any], index: int) -> Tuple[bool, List[str]]:
    erros = []
    for campo in REQUIRED_FIELDS:
        if campo not in q or q[campo] is None:
            erros.append(f"Questão #{index} ({q.get('id', 'SEM_ID')}): campo obrigatório ausente: '{campo}'")

    # Validar alternativas (dict)
    alts = q.get("alternativas")
    if not isinstance(alts, dict):
        erros.append(f"Questão {q.get('id')}: 'alternativas' deve ser um dicionário/objeto com chaves (ex: A, B, C, D, E).")
    else:
        if len(alts) < 2:
            erros.append(f"Questão {q.get('id')}: possui menos de 2 alternativas.")

    # Validar gabarito
    gabarito = q.get("gabarito")
    anulada = q.get("anulada", False)
    if not anulada and gabarito is not None:
        if isinstance(alts, dict) and gabarito not in alts:
            erros.append(f"Questão {q.get('id')}: gabarito '{gabarito}' não é uma alternativa válida ({list(alts.keys())}).")

    return len(erros) == 0, erros

def normalizar_e_auditar(dry_run: bool = False, sync_web: bool = True) -> bool:
    if not DATA_FILE.exists():
        print(f"[-] Erro: Arquivo {DATA_FILE} não encontrado.")
        return False

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            questoes = json.load(f)
        except json.JSONDecodeError as e:
            print(f"[-] Erro de sintaxe JSON: {e}")
            return False

    if not isinstance(questoes, list):
        print("[-] Erro: O banco de questões deve ser uma lista JSON.")
        return False

    print(f"==================================================")
    print(f"   AUDITORIA E VALIDAÇÃO DE BASE: {len(questoes)} QUESTÕES")
    print(f"==================================================")

    todos_erros = []
    ids_vistos = set()
    questoes_limpas = []

    # Estatísticas de Auditoria
    stats = {
        "total": len(questoes),
        "com_gabarito": 0,
        "sem_gabarito": 0,
        "anuladas": 0,
        "por_banca": {},
        "por_ano": {},
        "por_cargo": {},
        "por_nivel": {},
        "por_disciplina": {},
        "por_assunto": {}
    }

    for idx, q in enumerate(questoes, start=1):
        valido, erros = validar_questao(q, idx)
        if not valido:
            todos_erros.extend(erros)

        qid = q.get("id")
        if qid in ids_vistos:
            todos_erros.append(f"ID duplicado detectado: {qid}")
        ids_vistos.add(qid)

        # Limpeza
        q_limpa = dict(q)
        q_limpa["enunciado"] = limpar_texto(q.get("enunciado", ""))
        if isinstance(q_limpa.get("alternativas"), dict):
            q_limpa["alternativas"] = {
                k: limpar_texto(v) for k, v in q_limpa["alternativas"].items()
            }

        # Contagem
        if q_limpa.get("anulada"):
            stats["anuladas"] += 1
        elif q_limpa.get("gabarito"):
            stats["com_gabarito"] += 1
        else:
            stats["sem_gabarito"] += 1

        b = q_limpa.get("banca", "Outra")
        stats["por_banca"][b] = stats["por_banca"].get(b, 0) + 1

        ano = q_limpa.get("ano", 0)
        stats["por_ano"][ano] = stats["por_ano"].get(ano, 0) + 1

        c = q_limpa.get("cargo", "Outro")
        stats["por_cargo"][c] = stats["por_cargo"].get(c, 0) + 1

        niv = q_limpa.get("nivel", "Outro")
        stats["por_nivel"][niv] = stats["por_nivel"].get(niv, 0) + 1

        d = q_limpa.get("disciplina", "Outra")
        stats["por_disciplina"][d] = stats["por_disciplina"].get(d, 0) + 1

        ass = q_limpa.get("assunto", "Outro")
        stats["por_assunto"][ass] = stats["por_assunto"].get(ass, 0) + 1

        questoes_limpas.append(q_limpa)

    if todos_erros:
        print(f"[-] Foram detectados {len(todos_erros)} erros de validação no banco:")
        for err in todos_erros[:20]:
            print(f"   • {err}")
        if len(todos_erros) > 20:
            print(f"   ... e mais {len(todos_erros) - 20} erros.")
        return False

    print("\n[+] Integridade dos Dados: 100% VÁLIDA (Zero erros de schema / Zero IDs duplicados)")
    print(f"[+] Total de Questões: {stats['total']}")
    print(f"    - Gabaritadas e Ativas: {stats['com_gabarito']} ({stats['com_gabarito']/stats['total']*100:.1f}%)")
    print(f"    - Anuladas Oficialmente: {stats['anuladas']} ({stats['anuladas']/stats['total']*100:.1f}%)")
    print(f"    - Sem Gabarito Pareado: {stats['sem_gabarito']} ({stats['sem_gabarito']/stats['total']*100:.1f}%)")

    print("\n📌 Distribuição por Cargo (Escopo Alvo Administrativo):")
    for c, count in sorted(stats["por_cargo"].items(), key=lambda x: x[1], reverse=True):
        print(f"   • {c}: {count} questões")

    print("\n📌 Distribuição por Nível:")
    for n, count in sorted(stats["por_nivel"].items(), key=lambda x: x[1], reverse=True):
        print(f"   • {n}: {count} questões")

    print("\n📌 Distribuição por Disciplina:")
    for d, count in sorted(stats["por_disciplina"].items(), key=lambda x: x[1], reverse=True):
        print(f"   • {d}: {count} questões")

    print("\n📌 Amostra dos Principais Assuntos Classificados:")
    for ass, count in sorted(stats["por_assunto"].items(), key=lambda x: x[1], reverse=True)[:8]:
        print(f"   • {ass}: {count} questões")

    if not dry_run:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(questoes_limpas, f, ensure_ascii=False, separators=(",", ":"))
        print(f"\n[+] Base atualizada e formatada em: {DATA_FILE}")

        if sync_web:
            WEB_PUBLIC_FILE.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(DATA_FILE, WEB_PUBLIC_FILE)
            print(f"[+] Base sincronizada com o frontend em: {WEB_PUBLIC_FILE}")

    return True

if __name__ == "__main__":
    import sys
    dry_run = "--dry-run" in sys.argv
    normalizar_e_auditar(dry_run=dry_run, sync_web=True)
