#!/usr/bin/env python3
"""Anexa textos de apoio que ficaram de fora do enunciado.

O extrator original descartava o texto que antecede a questão 1 sempre que o
caderno tinha bloco de instruções (caso clássico da Cesgranrio) e limitava o
texto compartilhado ao fim "calculado" da seção, que nem sempre coincide com o
fim real. O resultado eram questões como "De acordo com o texto..." sem o texto.

Este script não reextrai a prova inteira: ele lê o PDF de origem, localiza os
blocos de apoio (preâmbulo e blocos entre questões), confere a quais questões
cada bloco se aplica e prefixa o texto apenas nas questões afetadas do banco.

Uso:
    python3 parser/anexar_textos_apoio.py --mapa /tmp/opencode/mapa_final.json \
        --dry-run --relatorio /tmp/opencode/apoio_dry.json

    python3 parser/anexar_textos_apoio.py --mapa /tmp/opencode/mapa_final.json \
        --relatorio data/relatorio_textos_apoio.json

Depois de aplicar:
    python3 parser/normalizar_banco.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "parser"))

import extrair_questoes as ex  # noqa: E402

BASE_PADRAO = ROOT / "data" / "questoes.json"

# Cabeçalhos de disciplina/seção que delimitam o começo de um texto de apoio.
HEAD_RE = re.compile(
    r"^(?:CONHECIMENTOS\s+(?:B[ÁA]SICOS|GERAIS|ESPEC[ÍI]FICOS)|"
    r"L[ÍI]NGUA\s+PORTUGUESA|PORTUGU[ÊE]S(?:\s+[IVX]+)?|"
    r"RACIOC[ÍI]NIO\s+L[ÓO]GICO|MATEM[ÁA]TICA|ATUALIDADES|"
    r"INFORM[ÁA]TICA|DIREITO|LEGISLA[ÇC][ÃA]O|"
    r"ADMINISTRA[ÇC][ÃA]O|NO[ÇC][ÕO]ES\s+DE\s+\w+)\b",
    re.I,
)
INSTR_ITEM_RE = re.compile(r"^\d{1,2}\s*[-–—.)]\s+")
LABEL_RE = re.compile(r"^TEXTO\b", re.I)
INSTRUCOES_RE = re.compile(r"^\s*LEIA\s+ATENTAMENTE\s+AS\s+INSTRU", re.I)
INSTR_FRAG_RE = re.compile(
    r"LEIA\s+ATENTAMENTE\s+AS\s+INSTRU|"
    r"N[ÃA]O ser[ãa]o aceitas|reclama[çc][ões] posteriores|"
    r"^\s*quest[ãa]o\.?\s*$|^\s*prova\.?\s*$|^\s*caderno\b|"
    r"gabarito|www\.|pcimarkpci|^\s*nome\b|^\s*assinatura\b",
    re.I,
)

# Referências fortes: a questão precisa de um texto externo.
REF_FORTE_RE = re.compile(
    r"\btexto\s+(?:i{1,4}|[1-9])\b|"
    r"\b(?:o|do|no|ao|pelo|deste|desse|nesse|neste|esse|este)\s+texto\b|"
    r"\btexto\s+(?:acima|abaixo|a seguir|apresentado|reproduzido|citado|dado)\b|"
    r"\b(?:segundo|conforme|leia|ler|leitura do|com base no|"
    r"de acordo com o|de acordo com as informações do)\s+texto\b",
    re.I,
)
# Referências fracas: podem ser texto de apoio, mas também podem ser outro uso.
REF_FRACA_RE = re.compile(r"\bo autor\b|\bo trecho\b|\bpar[áa]grafo\b", re.I)
TEXTO_NAO_APOIO_RE = re.compile(
    r"\btrecho\s+(?:reto|de estrada|de rodovia|de mapa|de código|"
    r"de programa|de algoritmo|de comando)\b|"
    r"\btexto\s+sobre\b|\bText[oa]?\s+(?:Word|do Word)\b",
    re.I,
)
# Questões de informática/desenho técnico que mencionam "texto" sem texto de apoio.
FALSO_POSITIVO_RE = re.compile(
    r"\b(?:Word|Excel|Windows|PowerPoint|Microsoft|Outlook|NBR|CLP)\b|"
    r"\bformata[çc][ãa]o\s+das\s+linhas\b|\bcomando\s+Justificar\b|"
    r"\bbarra\s+de\s+ferramentas\b|\bdisposi[çc][ãa]o\s+do\s+texto\b",
    re.I,
)

LABEL_QUESTAO_RE = re.compile(r"\btexto\s+(i{1,4}|[1-9])\b", re.I)
OPT_RE = re.compile(r"^\s*\(([A-Ea-e])\)\s")
CARGO_RE = re.compile(
    r"^(?:T[ÉE]CNIC[OA]\(A\)|T[ÉE]CNIC[OA]\b|ANALISTA\b|AGENTE\b|"
    r"ASSISTENTE\b|AUXILIAR\b|PROFISSIONAL\b|ENGENHEIR[OA]\b|M[ÉE]DIC[OA]\b|"
    r"ESCRITUR[ÁA]RI[OA]\b|PESQUISADOR\b|FISCAL\b|AUDITOR\b|ADVOGAD[OA]\b|"
    r"ECONOMISTA\b|CONTADOR\b|ADMINISTRADOR\b|ARQUITET[OA]\b|"
    r"ENFERMEIR[OA]\b|PROFESSOR\b|INSTRUTOR\b|OPERADOR\b|MOTORISTA\b)",
    re.I,
)

MIN_BLOCO_CHARS = 150
MAX_QUESTAO_CHARS = 450
MAX_ALCANCE = 15  # questões cobertas por um texto longo sem referência explícita


def achar_opcoes(linhas: list[str], inicio: int, limite: int = 160) -> dict[str, int]:
    """Índices das alternativas (A-E) a partir de `inicio`.

    Aceita alternativas em linhas separadas e alternativas na mesma linha.
    Ignora linhas do manual que apenas citam as letras (A)-(E).
    """
    achados: dict[str, int] = {}
    for i in range(inicio, min(len(linhas), inicio + limite)):
        s = linhas[i]
        if re.search(r"alternativas|letras|classificadas", s, re.I):
            continue
        for letra in re.findall(r"\(([A-Ea-e])\)", s):
            achados.setdefault(letra.upper(), i)
        if len(achados) >= 5:
            break
    return achados if len(achados) >= 3 else {}


def detectar_questoes(linhas: list[str]) -> list[tuple[int, int]]:
    """Localiza (índice, número) das questões na ordem do caderno.

    O `keep_question_numbers` do extrator escolhe a maior cadeia de números
    soltos e, em cadernos com muitos números de linha, pode começar no meio
    da prova. Aqui partimos do primeiro bloco de alternativas e caminhamos
    questão a questão: depois da alternativa E, o próximo número esperado é
    o início da questão seguinte, o que evita confundir número de linha com
    número de questão.
    """
    primeiro: tuple[int, int] | None = None
    for i, linha in enumerate(linhas):
        if OPT_RE.match(linha) and linha.strip().upper().startswith("(A)"):
            if len(achar_opcoes(linhas, i)) >= 4:
                for j in range(i - 1, max(-1, i - 80), -1):
                    if re.fullmatch(r"1\s*[.)-]?", linhas[j].strip()):
                        primeiro = (j, 1)
                        break
                if primeiro:
                    break
    if not primeiro:
        return []

    marcados = [primeiro]
    numero = 1
    pos = primeiro[0]
    while True:
        opcoes = achar_opcoes(linhas, pos + 1, 220)
        if not opcoes:
            break
        ultima = max(opcoes.values())
        proximo = None
        for j in range(ultima + 1, min(len(linhas), ultima + 250)):
            m = re.fullmatch(r"(\d{1,2})\s*[.)-]?", linhas[j].strip())
            if m and int(m.group(1)) == numero + 1:
                if len(achar_opcoes(linhas, j + 1, 220)) >= 4:
                    proximo = j
                    break
        if proximo is None:
            break
        numero += 1
        marcados.append((proximo, numero))
        pos = proximo
    return marcados


def normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", texto).strip().lower()


def palavras(texto: str) -> list[str]:
    return [w for w in re.split(r"\s+", texto) if re.search(r"[A-Za-zÀ-Ý]", w)]


def primeiro_numero_questao(texto: str) -> tuple[list[str], int | None]:
    """Devolve as linhas do PDF e o índice da questão 1."""
    linhas = ex.join_wrapped_headers(texto).splitlines()
    marcados = detectar_questoes(linhas)
    if marcados:
        return linhas, marcados[0][0]
    numeradas = ex.keep_question_numbers(linhas)
    for i, linha in enumerate(numeradas):
        m = ex.Q_RE.match(linha)
        if m and int(m.group(1)) == 1:
            return linhas, i
    return linhas, None


def preparar_corpo(texto: str) -> list[str]:
    """Remove números soltos (linhas de página/linha) e fixa a numeração.

    O `clean_body_lines` descarta qualquer linha que seja só um número, então
    a questão 1 de alguns cadernos desaparecia. Aqui os inícios detectados
    viram "N." antes da limpeza; os demais números soltos são descartados.
    """
    brutas = ex.join_wrapped_headers(texto).splitlines()
    marcados = {i: n for i, n in detectar_questoes(brutas)}
    preparadas: list[str] = []
    for i, linha in enumerate(brutas):
        if i in marcados:
            preparadas.append(f"{marcados[i]}.")
        elif re.fullmatch(r"\s*\d{1,3}\s*", linha):
            continue
        else:
            preparadas.append(linha)
    return ex.clean_body_lines("\n".join(preparadas))


def limpar_apoio(linhas: list[str]) -> list[str]:
    """Remove cabeçalhos, rodapés, números de linha e restos de instruções."""
    saida: list[str] = []
    for indice, cru in enumerate(linhas):
        s = ex.collapse_spaces(cru)
        if not s:
            continue
        if any(p.match(s) for p in ex.PAGE_ARTIFACT_PATTERNS):
            continue
        if ex.DOC_HEADER_RE.match(s):
            continue
        if INSTRUCOES_RE.match(s):
            continue
        if ex.INSTRUCTION_LINE_RE.match(s) and not LABEL_RE.match(s):
            continue
        if INSTR_ITEM_RE.match(s):
            continue
        if (
            CARGO_RE.match(s)
            and len(s.split()) <= 12
            and s.upper() == s
        ):
            continue
        letras = [c for c in s if c.isalpha()]
        if letras and len(s.split()) <= 8 and not LABEL_RE.match(s):
            proporcao_maiusculas = sum(1 for c in letras if c.isupper()) / len(letras)
            if proporcao_maiusculas > 0.9:
                # títulos em caixa alta são legítimos quando a linha seguinte
                # já é prosa; cabeçalhos de cargo/órgão vêm antes de outra
                # linha em caixa alta ou do bloco de instruções.
                proxima = ""
                for j in range(indice + 1, len(linhas)):
                    candidata = ex.collapse_spaces(linhas[j])
                    if not candidata or re.fullmatch(r"\d{1,3}", candidata):
                        continue
                    proxima = candidata
                    break
                letras_proxima = [c for c in proxima if c.isalpha()]
                if letras_proxima and len(proxima.split()) >= 5:
                    up_proxima = sum(1 for c in letras_proxima if c.isupper()) / len(letras_proxima)
                    if up_proxima <= 0.7:
                        saida.append(s)
                        continue
                continue
        saida.append(s)
    return saida


def parece_inicio(s: str, proxima: str | None) -> bool:
    """Reconhece a primeira linha do texto (título curto ou parágrafo)."""
    if LABEL_RE.match(s):
        return True
    if INSTR_FRAG_RE.search(s):
        return False
    n = len(palavras(s))
    if n >= 5:
        return True
    if 2 <= n <= 4 and not s.rstrip().endswith((".", "!", "?", ":", ";")):
        if proxima is not None and len(palavras(proxima)) >= 5:
            return True
    return False


def extrair_preambulo(texto: str) -> list[str]:
    """Texto de apoio que antecede a questão 1, sem o manual de instruções."""
    linhas, questao_1 = primeiro_numero_questao(texto)
    if questao_1 is None:
        return []

    inicio = 0
    for i in range(questao_1):
        s = ex.collapse_spaces(linhas[i])
        if HEAD_RE.match(s) and len(s) < 120:
            inicio = i + 1

    bloco = limpar_apoio(linhas[inicio:questao_1])

    # o corte pelo cabeçalho ainda pode deixar tabelas de pontuação e restos
    # do manual; o texto começa no primeiro título/parágrafo reconhecível.
    comeco = 0
    for i, linha in enumerate(bloco):
        proxima = bloco[i + 1] if i + 1 < len(bloco) else None
        if parece_inicio(linha, proxima):
            comeco = i
            break
    bloco = bloco[comeco:]

    while bloco and INSTR_FRAG_RE.search(bloco[-1]):
        bloco.pop()

    texto_bloco = "\n".join(bloco)
    if len(texto_bloco) < 80 or len(texto_bloco.split()) < 10:
        return []
    return bloco


def bloco_valido(linhas: list[str]) -> bool:
    texto = "\n".join(linhas)
    if len(texto) < MIN_BLOCO_CHARS or len(texto.split()) < 20:
        return False
    if re.search(r"\([A-Ea-e]\)\s", texto):
        return False
    letras = [c for c in texto if c.isalpha()]
    digitos = [c for c in texto if c.isdigit()]
    if letras and len(digitos) / max(1, len(letras)) > 0.35:
        return False
    if len(re.findall(r"[.!?]", texto)) < 2:
        return False
    return True


def extrair_blocos(texto: str) -> list[dict]:
    """Devolve os blocos de apoio na ordem em que aparecem na prova."""
    linhas = preparar_corpo(texto)
    inicios: list[tuple[int, int]] = []
    esperado = 1
    for i, linha in enumerate(linhas):
        m = ex.Q_RE.match(linha)
        if not m:
            continue
        n = int(m.group(1))
        if n == esperado:
            inicios.append((i, n))
            esperado += 1

    blocos: list[dict] = []

    preambulo = extrair_preambulo(texto)
    if preambulo and bloco_valido(preambulo):
        blocos.append({"origem": "preâmbulo", "default": 1, "linhas": preambulo})

    for k, (i, n) in enumerate(inicios):
        fim = inicios[k + 1][0] if k + 1 < len(inicios) else len(linhas)
        _, _, apoio = ex.parse_question_block(linhas[i:fim])
        apoio = limpar_apoio(apoio)
        if apoio and bloco_valido(apoio):
            blocos.append({"origem": f"após Q{n}", "default": n + 1, "linhas": apoio})

    if not blocos:
        return []

    ultima = inicios[-1][1] if inicios else 40
    blocos.sort(key=lambda b: b["default"])
    for idx, bloco in enumerate(blocos):
        texto_bloco = "\n".join(bloco["linhas"])
        refs = ex.extract_question_refs(texto_bloco)
        proximo = blocos[idx + 1]["default"] if idx + 1 < len(blocos) else ultima + 1
        if refs:
            bloco["questoes"] = refs
        elif len(texto_bloco) >= ex.LONG_SUPPORT_CHARS:
            fim = min(bloco["default"] + MAX_ALCANCE - 1, proximo - 1, ultima)
            bloco["questoes"] = list(range(bloco["default"], fim + 1))
        else:
            bloco["questoes"] = [bloco["default"]]
        bloco["texto"] = texto_bloco
    return blocos


def bloco_por_rotulo(blocos: list[dict], rotulo: str) -> dict | None:
    padrao = re.compile(rf"\btexto\s+{re.escape(rotulo)}\b", re.I)
    for bloco in blocos:
        if padrao.search(bloco["texto"][:600]):
            return bloco
    return None


def precisa_de_apoio(enunciado: str) -> tuple[bool, str]:
    """Classifica a questão e devolve (precisa, motivo)."""
    if len(enunciado) > MAX_QUESTAO_CHARS or "\n\n" in enunciado:
        return False, "já tem bloco de apoio"
    if FALSO_POSITIVO_RE.search(enunciado):
        return False, "menção a texto sem apoio (informática/técnico)"
    if TEXTO_NAO_APOIO_RE.search(enunciado):
        return False, "trecho/texto sem função de apoio"
    if REF_FORTE_RE.search(enunciado):
        return True, "referência forte ao texto"
    if REF_FRACA_RE.search(enunciado):
        return True, "referência fraca (autor/trecho/parágrafo)"
    return False, "sem referência a texto"


def ja_contem(enunciado: str, bloco_texto: str) -> bool:
    a = normalizar(enunciado)
    b = normalizar(bloco_texto)
    if not b:
        return False
    return b[:120] in a or a.startswith(b[:60])


def carregar(caminho: Path) -> list[dict]:
    dados = json.loads(caminho.read_text(encoding="utf-8"))
    if isinstance(dados, dict):
        dados = dados.get("data") or dados.get("questoes") or []
    if not isinstance(dados, list):
        raise SystemExit(f"[!] {caminho}: esperava uma lista de questões")
    return dados


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", type=Path, default=BASE_PADRAO)
    ap.add_argument("--mapa", type=Path, required=True,
                    help="JSON com {grupo: caminho_do_pdf}")
    ap.add_argument("--out", type=Path, default=None,
                    help="Saída (padrão: sobrescreve a base)")
    ap.add_argument("--relatorio", type=Path, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--grupo", action="append", default=None,
                    help="Processa só este grupo (pode repetir)")
    args = ap.parse_args(argv)

    dados = carregar(args.base)
    mapa = json.loads(args.mapa.read_text(encoding="utf-8"))
    if "mapa" in mapa:
        mapa = mapa["mapa"]
    if args.grupo:
        mapa = {g: p for g, p in mapa.items() if g in set(args.grupo)}

    por_grupo: dict[str, list[dict]] = {}
    for q in dados:
        qid = str(q.get("id") or "")
        if "_Q" not in qid:
            continue
        grupo = qid.rsplit("_Q", 1)[0]
        por_grupo.setdefault(grupo, []).append(q)

    alteradas: list[dict] = []
    sem_bloco: list[dict] = []
    ignoradas: list[dict] = []
    grupos_sem_pdf: list[str] = []

    for grupo, questoes in sorted(por_grupo.items()):
        caminho = mapa.get(grupo)
        if not caminho:
            grupos_sem_pdf.append(grupo)
            continue
        pdf = Path(caminho)
        if not pdf.exists():
            grupos_sem_pdf.append(f"{grupo} (arquivo ausente: {caminho})")
            continue

        try:
            texto_pdf = ex.run_pdftotext_columns(pdf)
        except Exception as erro:  # noqa: BLE001
            sem_bloco.append({"grupo": grupo, "motivo": f"falha no PDF: {erro}"})
            continue

        blocos = extrair_blocos(texto_pdf)
        if not blocos:
            sem_bloco.append({"grupo": grupo, "motivo": "nenhum bloco de apoio encontrado"})
            continue

        for q in questoes:
            enunciado = str(q.get("enunciado") or "").strip()
            precisa, motivo = precisa_de_apoio(enunciado)
            if not precisa:
                if motivo not in {"já tem bloco de apoio", "sem referência a texto"}:
                    ignoradas.append({"id": q.get("id"), "motivo": motivo})
                continue

            qid = str(q.get("id") or "")
            numero = int(qid[-2:]) if qid[-2:].isdigit() else None
            bloco = None

            # 1) rótulo explícito ("Texto II") manda mais que a posição
            rotulos = LABEL_QUESTAO_RE.findall(enunciado)
            for rotulo in rotulos:
                bloco = bloco_por_rotulo(blocos, rotulo)
                if bloco:
                    break

            # 2) bloco cuja faixa cobre a questão
            if bloco is None and numero is not None:
                for candidato in blocos:
                    if numero in candidato["questoes"]:
                        bloco = candidato
                        break

            if bloco is None:
                sem_bloco.append({"id": qid, "grupo": grupo, "motivo": motivo})
                continue

            if ja_contem(enunciado, bloco["texto"]):
                continue

            novo = bloco["texto"].strip() + "\n\n" + enunciado
            alteradas.append({
                "id": qid,
                "grupo": grupo,
                "origem": bloco["origem"],
                "bloco_chars": len(bloco["texto"]),
                "antes": len(enunciado),
                "depois": len(novo),
            })
            if not args.dry_run:
                q["enunciado"] = novo

    if args.relatorio:
        args.relatorio.parent.mkdir(parents=True, exist_ok=True)
        args.relatorio.write_text(
            json.dumps({
                "alteradas": alteradas,
                "sem_bloco": sem_bloco,
                "ignoradas": ignoradas,
                "grupos_sem_pdf": grupos_sem_pdf,
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(
        f"grupos: {len(por_grupo)} | com PDF: {len(mapa)} | "
        f"questões alteradas: {len(alteradas)} | sem bloco: {len(sem_bloco)} | "
        f"ignoradas: {len(ignoradas)} | grupos sem PDF: {len(grupos_sem_pdf)}"
    )
    if alteradas:
        print("\nAmostra de alterações:")
        for item in alteradas[:12]:
            print(
                f"  {item['id']} <- {item['origem']} "
                f"({item['bloco_chars']} chars; {item['antes']} -> {item['depois']})"
            )
    if grupos_sem_pdf:
        print("\nSem PDF:")
        for grupo in grupos_sem_pdf[:15]:
            print(f"  {grupo}")

    if args.dry_run:
        print("\n[i] dry-run: nada foi gravado.")
        return 0

    destino = args.out or args.base
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[ok] {len(dados)} questões gravadas em {destino}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
