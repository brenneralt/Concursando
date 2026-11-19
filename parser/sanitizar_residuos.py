#!/usr/bin/env python3
"""
Saneamento de resíduos de formatação remanescentes no banco de questões.

Passes (em todo campo de texto: enunciado e alternativas):
  A) Marca d'água PCI "colada" ao texto:
       - remoção de `www.pciconcursos.com.br` (inclusive múltiplas seguidas)
       - remoção do bloco `<nº>? <CARGO EM CAPS> GABARITO <n>`
       - remoção do bloco `PROVA <n> - GABARITO <n> - <seção CAPS>`
  B) Sobra de `GABARITO <n>` (case-sensitive, sempre marca d'água nesses PDFs)
  C) Lixo espelhado do caderno (`R A SC U N H O`, `O H N U`...)
  D) Colapso de espaços duplos, `\n{3,}` e espaço antes de pontuação
  E) "Texto juntos": tokens de >=12 letras sem espaço são segmentados por
     DP que minimiza o nº de palavras (dicionário pt-BR normalizado).
     Tokens já dicionarizados ficam intactos; URLs são protegidas; a/e/o
     soltos são permitidos; ALL-CAPS sai em caixa alta; se qualquer pedaço
     falhar, o token inteiro é preservado e logado como FAIL.
  F) Números de linha soltos dos textos de apoio (5, 1 0, 1 5, ..., 7 5):
     removidos SOMENTE quando há progressão de passo 5 com >=5 valores no texto.
  G) "Muros de texto" (enunciado gigante com alternativas contaminadas):
     irrecuperáveis — removidos do banco para data/questoes_removidas.json.

Uso:
  python3 parser/sanitizar_residuos.py             # dry-run (só audita)
  python3 parser/sanitizar_residuos.py --apply     # reescreve data/questoes.json
  python3 parser/sanitizar_residuos.py --apply --sync-removidos   # também grava removidos
"""

import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "questoes.json"
REMOVIDOS_FILE = ROOT / "data" / "questoes_removidas.json"
AUDIT_FILE = Path("/tmp/saneamento_audit.json")

# ---------------------------------------------------------------------------
# Dicionário (mesmos arquivos usados pela hifenização no normalizar_banco.py)
# ---------------------------------------------------------------------------

def _normalizar(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace("ç", "c")


_DIC_NORM = None

def _carregar_dic_norm():
    global _DIC_NORM
    if _DIC_NORM is None:
        palavras = set()
        for caminho in ("/usr/share/dict/brazilian", "/usr/share/dict/portuguese"):
            try:
                with open(caminho, encoding="utf-8", errors="ignore") as f:
                    for linha in f:
                        w = linha.split("/")[0].strip().lower()
                        if w and not w.startswith("#"):
                            n = _normalizar(w)
                            if n.isalpha():
                                palavras.add(n)
            except OSError:
                pass
        _DIC_NORM = palavras
    return _DIC_NORM

# ---------------------------------------------------------------------------
# Pass A/B/C/D — marcas d'água e espaços
# ---------------------------------------------------------------------------

RE_URL_PCI = re.compile(r"(?:w\s*){0,3}w+\.pciconcursos\.com\.br", re.IGNORECASE)
# "<nº>? <CARGO EM CAPS...> GABARITO <n>" (marca de rodapé do caderno)
RE_CARGO_GAB = re.compile(
    r"(?:(?<=^)|(?<=\s))\d{1,2}\s+[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 /.&(),-]{3,}?GABARITO\s*\d{1,2}",
)
# "PROVA 10 - GABARITO 1 - TECNOLOGIA, DADOS E INFORMAÇÃO"
RE_PROVA_GAB = re.compile(
    r"PROVA\s+\d{1,3}\s*[-–]\s*GABARITO\s*\d{1,2}(?:\s*[-–]\s*[A-ZÀ-Ú0-9 ,.&/-]+)*",
    re.IGNORECASE,
)
RE_GABARITO = re.compile(r"GABARITO\s*\d{1,2}")  # case-sensitive de propósito
RE_RASCUNHO = re.compile(
    r"(?:R\s*A\s*S\s*C\s*U\s*N\s*H\s*O"          # R A SC U N H O (e variantes)
    r"|O\s*H\s*N\s*U(?:\s+[A-ZÀ-Ú0-9]{1,12}){0,9})"  # espelho + lixeira à direita
)
RE_FORM = re.compile(r"FORMAÇÃO:\s*[A-ZÀ-Ú0-9 /.&-]{0,60}")
RE_NIVEL = re.compile(r"NÍVEL\s+(?:MÉDIO|FUNDAMENTAL|SUPERIOR)")
RE_CONH = re.compile(r"CONHECIMENTOS?\s+(?:BÁSICOS(?:[\s\-–]+NÍVEL\s+(?:MÉDIO|FUNDAMENTAL|SUPERIOR))?|ESPECÍFICOS)")
RE_PROVA = re.compile(r"\bPROVA\s+[A-Z0-9]{1,3}(?:\s*[-–]\s*[A-Z0-9]{1,3})?")
RE_CAPSRUN = re.compile(r"(?:\b[A-ZÀ-Ú0-9()][A-ZÀ-Ú0-9()&/.'-]{0,30}[,–-]?\s+){3,}[A-ZÀ-Ú0-9()][A-ZÀ-Ú0-9()&/.'-]{1,30},?")

# marcas que denunciam contaminação irrecuperável em uma alternativa
RE_CONTAMINACAO = re.compile(
    r"pciconcursos|GABARITO|R\s*A\s*S\s*C\s*U\s*N\s*H\s*O|O\s*H\s*N\s*U"
    r"|NACIONAL\s+UNIFICADO|R\s*A\s*SC\s*U\s*N\s*H\s*O"
    r"|PROVA\s+\d|TECNICO\(A\)|TÉCNICO\(A\)"
    r"|N\s*O\s*Ç\s*Õ\s*E\s*S\s+DE\s+INFO",
    re.IGNORECASE,
)


def _remover_capsruns(t: str) -> str:
    def filtro(m):
        seq = m.group(0)
        toks = [x for x in re.split(r"[\s,/–-]+", seq) if x]
        letras = lambda tk: sum(1 for c in tk if c.isalpha())
        longos = sum(1 for tk in toks if letras(tk) >= 4)
        todos_curtos = all(letras(tk) <= 4 for tk in toks)
        if todos_curtos:
            return seq  # lista tipo "FTP, HTTP, SMTP, DNS" ou "(A) (B) (C)" — legítimo
        if len(toks) >= 6 or (len(toks) >= 4 and longos >= 3):
            return ""
        return seq
    return RE_CAPSRUN.sub(filtro, t)


def _pass_a(t: str, log, campo, qid):
    antes = t
    t = RE_URL_PCI.sub("", t)
    t = RE_CARGO_GAB.sub("", t)
    t = RE_PROVA_GAB.sub("", t)
    t = RE_RASCUNHO.sub("", t)
    t = RE_GABARITO.sub("", t)  # idempotente (pass B)
    t = RE_FORM.sub("", t)
    t = RE_NIVEL.sub("", t)
    t = RE_CONH.sub("", t)
    t = RE_PROVA.sub("", t)
    t = _remover_capsruns(t)
    if not t.strip() and antes.strip():
        # marca como esvaziado: decisão na etapa G (enunciado é preservado lá)
        log.append({"id": qid, "campo": campo, "pass": "A/B/C", "antes": antes,
                    "depois": t, "aviso": "esvaziado"})
    elif t != antes:
        log.append({"id": qid, "campo": campo, "pass": "A/B/C", "antes": antes, "depois": t})
    return t


def _pass_d(t: str, log, campo, qid):
    antes = t
    t = re.sub(r"[ \t]{2,}", " ", t)
    t = re.sub(r"([,;:!?])", r"\1", t)          # espaço antes de pontuação
    t = re.sub(r"[ \t]+\.(?=[\s)\]]|$)", ".", t)
    t = re.sub(r"\(\s+", "(", t)
    t = re.sub(r"\s+\)", ")", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n[ \t]+", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    if t != antes:
        log.append({"id": qid, "campo": campo, "pass": "D", "antes": antes, "depois": t})
    return t

# ---------------------------------------------------------------------------
# Pass E — segmentação de "texto juntos"
# ---------------------------------------------------------------------------

TOKEN_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]{12,}")
URL_RE = re.compile(r"https?://\S+|www\.\S+")
# somente palavras funcionais curtas entram como palavra solta de 1-2 letras
SINGLES = {"a", "e", "o"}
FUNC2 = {"as", "os", "um", "de", "da", "do", "em", "na", "no", "ao", "ou",
         "eu", "te", "me", "se"}


def _dividir_chunks(token: str) -> List[Tuple[str, str]]:
    """Divide o token nas transições minúscula→MAIÚSCULA.
    Retorna lista de (chunk, tipo) com tipo em {'caps', 'normal'}."""
    chunks = []
    inicio = 0
    for i in range(1, len(token)):
        if token[i].isupper() and not token[i - 1].isupper():
            chunks.append((token[inicio:i], "caps" if token[inicio].isupper() else "normal"))
            inicio = i
    chunks.append((token[inicio:], "caps" if token[inicio].isupper() else "normal"))
    return chunks


def _segmentar_chunk(chunk: str, dic: set, todo_caps: bool = False) -> List[str] | None:
    """DP de word-break minimizando o nº de palavras. None se impossível.

    Regras de aceite por palavra:
      - 1 letra: apenas a/e/o;
      - 2 letras: apenas palavras funcionais (de, da, em, na...);
      - demais pedaços: precisam existir no dicionário pt-BR
        (ou, em blocos ALL-CAPS, ter <=6 letras: siglas como II, EN);
    """
    s = _normalizar(chunk)
    n = len(s)
    INF = float("inf")
    best = [INF] * (n + 1)
    score = [0] * (n + 1)
    passo = [None] * (n + 1)
    best[0] = 0
    for i in range(n):
        if best[i] == INF:
            continue
        for j in range(i + 1, n + 1):
            w = s[i:j]
            tam = len(w)
            if tam == 1:
                ok = w in SINGLES
            elif tam == 2:
                ok = w in FUNC2
            elif todo_caps and chunk[i:j].isupper() and tam <= 6:
                ok = True
            else:
                ok = w in dic
            if not ok:
                continue
            cand = best[i] + 1
            sc = score[i] + tam * tam
            # menos palavras; no empate, prefere palavras mais longas
            if cand < best[j] or (cand == best[j] and sc > score[j]):
                best[j] = cand
                score[j] = sc
                passo[j] = i
    if best[n] == INF:
        return None
    palavras, pos = [], n
    while pos > 0:
        ant = passo[pos]
        palavras.append(chunk[ant:pos])
        pos = ant
    return palavras[::-1]


def _pass_e(t: str, log, campo, qid):
    if not TOKEN_RE.search(t):
        return t

    dic = _carregar_dic_norm()

    urls: List[str] = []

    def _guarda(m):
        urls.append(m.group(0))
        return f"\x00{len(urls) - 1}\x00"

    t_prot = URL_RE.sub(_guarda, t)

    # segmentar cada token
    cache = {}
    for m in TOKEN_RE.finditer(t_prot):
        tok = m.group(0)
        if _normalizar(tok) in dic:
            continue  # já é palavra conhecida
        if tok.upper() == tok and len(tok) <= 8:
            continue  # sigla curta (ex.: IBGE, DECEA) — deixa como está
        cache[tok] = None  # marca para processar

    def _segmentar_token(tok: str) -> str | None:
        chunks = _dividir_chunks(tok)
        saida = []
        for chunk, tipo in chunks:
            if chunk.isupper():
                palavras = _segmentar_chunk(chunk, dic, todo_caps=True)
                if palavras is None:
                    return None
                saida.append(" ".join(p.upper() for p in palavras))
                continue
            palavras = _segmentar_chunk(chunk, dic)
            if palavras is None:
                return None
            if tipo == "caps":
                # mantém apenas a inicial maiúscula na primeira palavra
                palavras = [palavras[0][:1].upper() + palavras[0][1:]] + palavras[1:]
            saida.append(" ".join(palavras))
        return " ".join(saida)

    resultado = []
    last = 0
    falhas = 0
    for m in TOKEN_RE.finditer(t_prot):
        tok = m.group(0)
        resultado.append(t_prot[last:m.start()])
        if tok in cache:
            novo = cache[tok]
            if novo is None:
                novo = _segmentar_token(tok)
                if novo is None:
                    novo = tok
                    falhas += 1
                cache[tok] = novo
            resultado.append(cache[tok])
        else:
            resultado.append(tok)
        last = m.end()
    resultado.append(t_prot[last:])
    t_prot = "".join(resultado)

    # restaura URLs
    def _restaura(m):
        return urls[int(m.group(1))]

    t_final = re.sub(r"\x00(\d+)\x00", _restaura, t_prot)

    if t_final != t:
        log.append({"id": qid, "campo": campo, "pass": "E", "antes": t, "depois": t_final, "falhas": falhas})
    return t_final

# ---------------------------------------------------------------------------
# Pass F — números de linha soltos (5, 1 0, 1 5, ..., 7 5) de textos de apoio
# ---------------------------------------------------------------------------

LINE_NUM_RE = re.compile(r"(?<![\w])(5|[1-7] [05])(?![\w])")
VALORES = {"5": 5}
for _d in range(1, 8):
    VALORES[f"{_d} 0"] = _d * 10
    VALORES[f"{_d} 5"] = _d * 10 + 5


def _pass_f(t: str, log, campo, qid):
    matches = list(LINE_NUM_RE.finditer(t))
    if len(matches) < 5:
        return t
    presentes = {VALORES[m.group(1)] for m in matches}
    multiplos = {v for v in presentes if v % 5 == 0}
    if len(multiplos) < 5:
        return t
    # progressão de passo 5 com >=5 termos (ex.: 5,10,15,20,25)
    ordenados = sorted(multiplos)
    melhor = 1
    atuais = 1
    for i in range(1, len(ordenados)):
        if ordenados[i] - ordenados[i - 1] == 5:
            atuais += 1
            melhor = max(melhor, atuais)
        else:
            atuais = 1
    if melhor < 5:
        return t

    antes = t
    t2 = LINE_NUM_RE.sub(lambda m: "", t)
    t2 = re.sub(r"[ \t]{2,}", " ", t2)
    t2 = re.sub(r"\n[ \t]*\n[ \t]*\n+", "\n\n", t2)
    t2 = re.sub(r"(^|\n)[ \t]+", r"\1", t2)
    log.append({"id": qid, "campo": campo, "pass": "F",
                "removidos": len(matches), "valores": ordenados,
                "antes": antes, "depois": t2})
    return t2

# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------

def sanitizar(q: Dict):
    log: List[Dict] = []
    qid = q.get("id")
    campos = [("enunciado", q.get("enunciado", ""))]
    alts = q.get("alternativas") or {}
    for k, v in alts.items():
        campos.append((f"alternativas.{k}", v))

    for campo, valor in campos:
        if not isinstance(valor, str):
            continue
        v = _pass_a(valor, log, campo, qid)
        v = _pass_d(v, log, campo, qid)
        v = _pass_e(v, log, campo, qid)
        v = _pass_d(v, log, campo, qid)  # colapsa resíduos da segmentação
        v = _pass_f(v, log, campo, qid)
        v = _pass_d(v, log, campo, qid)
        if isinstance(v, str) and not v.strip() and valor.strip():
            if campo == "enunciado":
                v = valor  # nunca perde o enunciado inteiro
                log.append({"id": qid, "campo": campo, "pass": "*",
                            "aviso": "enunciado esvaziaria no sanemento — original mantido"})
            else:
                log.append({"id": qid, "campo": campo, "pass": "*",
                            "aviso": "alternativa esvaziada"})
                vazias = q.setdefault("_alt_esvaziadas", [])
                vazias.append(campo.split(".", 1)[1])
        if campo == "enunciado":
            q["enunciado"] = v
        else:
            q["alternativas"][campo.split(".", 1)[1]] = v
    return log


def texto_alternativas_limpo(q: Dict) -> bool:
    """True se nenhuma alternativa ainda denuncia marca d'água/conteúdo de caderno."""
    for a in (q.get("alternativas") or {}).values():
        if RE_CONTAMINACAO.search(str(a)):
            return False
    return True


def main():
    apply = "--apply" in sys.argv
    with open(DATA_FILE, encoding="utf-8") as f:
        questoes = json.load(f)

    audit: List[Dict] = []
    alteradas = 0
    for q in questoes:
        log = sanitizar(q)
        if log:
            alteradas += 1
            audit.extend(log)

    # Alternativas esvaziadas pós-limpeza:
    #  - gabarito na alternativa morta -> questão irrecuperável, removida;
    #  - senão -> a chave vazia é deletada (sobram A–D válidas).
    removidas_vazias = []
    alternativas_deletadas = []
    for q in questoes:
        vz = q.pop("_alt_esvaziadas", [])
        if not vz:
            continue
        if q.get("gabarito") in vz:
            removidas_vazias.append(q)
        else:
            for k in vz:
                q["alternativas"].pop(k, None)
            alternativas_deletadas.append((q.get("id"), vz))

    # Pass G — muros irrecuperáveis (pós A–D: ainda contaminados?)
    id_vazias = {q.get("id") for q in removidas_vazias}
    removidas = list(removidas_vazias)
    mantidas = []
    for q in questoes:
        if q.get("id") in id_vazias:
            continue
        tam = len(q.get("enunciado") or "")
        if tam > 2500 and not texto_alternativas_limpo(q):
            removidas.append(q)
        else:
            mantidas.append(q)

    print(f"Total lidas: {len(questoes)}")
    print(f"Questões com texto alterado: {alteradas}")
    print(f"Campos alterados (log): {len(audit)}")
    print(f"Alternativas vazias deletadas: {len(alternativas_deletadas)} "
          f"({sum(len(v) for _, v in alternativas_deletadas)} chaves)")
    for qid, vz in alternativas_deletadas:
        print(f"   - {qid}: removida(s) {','.join(vz)}")
    print(f"Removidas (muros/sem conteúdo): {len(removidas)}")
    for q in removidas:
        print("   -", q.get("id"))

    if not apply:
        print("\n[dry-run] Nada foi gravado. Use --apply para persistir.")
        with open(AUDIT_FILE, "w", encoding="utf-8") as f:
            json.dump({"alteracoes": audit, "removidas": [q.get("id") for q in removidas]},
                      f, ensure_ascii=False, indent=1)
        print(f"Auditoria: {AUDIT_FILE}")
        return

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(mantidas, f, ensure_ascii=False, separators=(",", ":"))

    if "--sync-removidos" in sys.argv and removidas:
        existentes = []
        if REMOVIDOS_FILE.exists():
            try:
                existentes = json.load(open(REMOVIDOS_FILE, encoding="utf-8"))
            except json.JSONDecodeError:
                existentes = []
        ids = {q.get("id") for q in existentes}
        novas = [{"motivo_remocao": "muro_de_texto: enunciado gigante + alternativas contaminadas", **q}
                 for q in removidas if q.get("id") not in ids]
        existentes.extend(novas)
        with open(REMOVIDOS_FILE, "w", encoding="utf-8") as f:
            json.dump(existentes, f, ensure_ascii=False, separators=(",", ":"))

    with open(AUDIT_FILE, "w", encoding="utf-8") as f:
        json.dump({"alteracoes": audit, "removidas": [q.get("id") for q in removidas]},
                  f, ensure_ascii=False, indent=1)
    print(f"\n[+] Banco reescrito: {DATA_FILE} ({len(mantidas)} questões)")
    print(f"[+] Auditoria: {AUDIT_FILE}")


if __name__ == "__main__":
    main()
