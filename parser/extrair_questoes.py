#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Parser de provas IGECAP/CONTEMAX
=================================

Extrai questões de cadernos de prova em PDF e cruza com os gabaritos oficiais,
gerando uma base consolidada em JSON (`questoes.json`).

Uso:
    python3 parser_provas.py
    python3 parser_provas.py --dir "/caminho/da/pasta" --out questoes.json
    python3 parser_provas.py --verbose
    python3 parser_provas.py --include-subdirs

Dependência externa:
    pdftotext (poppler-utils)

O script foi desenhado para os cadernos deste repositório:
  - 40 questões por prova;
  - alternativas de A a E;
  - blocos de Língua Portuguesa, Raciocínio Lógico/Matemática,
    Atualidades/Conhecimentos Gerais e Conhecimentos Específicos;
  - gabaritos em formatos variados (tabela, colunas, blocos por cargo,
    blocos "comuns aos cargos" + bloco específico).
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Iterable, Optional


# ---------------------------------------------------------------------------
# Utilidades de texto
# ---------------------------------------------------------------------------

def strip_accents(text: str) -> str:
    """Remove acentos sem alterar o restante do texto."""
    text = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def norm_key(text: str) -> str:
    """Normaliza texto para comparação: sem acento, minúsculo, sem pontuação."""
    text = strip_accents(text).lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def norm_cargo_key(text: str) -> str:
    """Normaliza nome de cargo removendo preposições e conectivos."""
    text = norm_key(text)
    text = re.sub(r"\b(de|da|do|das|dos|em|e)\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def title_cargo(text: str) -> str:
    """Coloca o cargo em caixa alta/baixa amigável."""
    small = {"de", "da", "do", "das", "dos", "em", "e", "a", "o", "as", "os"}
    parts = re.sub(r"\s+", " ", text).strip().split()
    out = []
    for i, part in enumerate(parts):
        if i > 0 and part.lower() in small:
            out.append(part.lower())
        else:
            out.append(part.capitalize())
    return " ".join(out)


def collapse_spaces(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text).strip()


# ---------------------------------------------------------------------------
# Extração de texto dos PDFs
# ---------------------------------------------------------------------------

def run_pdftotext(pdf_path: Path, mode: str = "raw") -> str:
    """
    Extrai texto via pdftotext.

    mode='raw'     -> ordem de leitura do conteúdo (melhor para colunas)
    mode='layout'  -> preserva posicionamento visual (fallback)
    """
    exe = "pdftotext"
    try:
        subprocess.run([exe, "-v"], capture_output=True, check=False)
    except FileNotFoundError as exc:
        raise RuntimeError(
            "pdftotext não encontrado. Instale o poppler-utils "
            "(Debian/Ubuntu: sudo apt install poppler-utils)."
        ) from exc

    cmd = [exe, "-enc", "UTF-8"]
    if mode == "raw":
        cmd.append("-raw")
    elif mode == "layout":
        cmd.append("-layout")
    cmd += [str(pdf_path), "-"]

    proc = subprocess.run(cmd, capture_output=True, text=False, check=False)
    if proc.returncode != 0:
        raise RuntimeError(
            f"Falha ao extrair {pdf_path.name}: "
            f"{proc.stderr.decode('utf-8', errors='ignore')[:300]}"
        )
    return proc.stdout.decode("utf-8", errors="ignore")


PAGE_BBOX_RE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)
LINE_BBOX_RE = re.compile(
    r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S
)
WORD_BBOX_RE = re.compile(r"<word[^>]*>(.*?)</word>", re.S)


def run_pdftotext_columns(pdf_path: Path) -> str:
    """Extrai texto respeitando a ordem das colunas (cadernos Cesgranrio).

    O `pdftotext -raw` lê a ordem do fluxo do PDF e embaralha questões quando
    o caderno tem duas colunas. Aqui usamos `-bbox-layout` para agrupar as
    linhas por coluna (esquerda/direita) e então ordená-las por y, gerando a
    ordem de leitura correta. Cai para o modo raw em caso de erro.
    """
    try:
        proc = subprocess.run(
            ["pdftotext", "-enc", "UTF-8", "-bbox-layout", str(pdf_path), "-"],
            capture_output=True,
            check=False,
        )
        if proc.returncode != 0:
            return run_pdftotext(pdf_path, "raw")
        saida = proc.stdout.decode("utf-8", errors="ignore")
    except OSError:
        return run_pdftotext(pdf_path, "raw")

    partes: list[str] = []
    for largura_s, _, corpo in PAGE_BBOX_RE.findall(saida):
        meio = float(largura_s) / 2
        colunas: tuple[list, list, list] = ([], [], [])
        for xmin_s, ymin_s, xmax_s, _, conteudo in LINE_BBOX_RE.findall(corpo):
            palavras = [html.unescape(p).strip() for p in WORD_BBOX_RE.findall(conteudo)]
            palavras = [p for p in palavras if p]
            if not palavras:
                continue
            texto = " ".join(palavras)
            xmin, ymin, xmax = float(xmin_s), float(ymin_s), float(xmax_s)
            if xmax <= meio + 5:
                colunas[0].append((ymin, xmin, texto))
            elif xmin >= meio - 5:
                colunas[1].append((ymin, xmin, texto))
            else:
                colunas[2].append((ymin, xmin, texto))
        for grupo in colunas:
            grupo.sort()
            partes.extend(texto for _, _, texto in grupo)
        partes.append("\f")
    return "\n".join(partes)


# ---------------------------------------------------------------------------
# Metadados (banca, ano, órgão, cargo, nível)
# ---------------------------------------------------------------------------

BANCA_NAMES = {
    "IGECAP": "IGECAP",
    "CONTEMAX": "CONTEMAX",
    "CESGRANRIO": "CESGRANRIO",
    "CEBRASPE": "CEBRASPE",
    "CESPE": "CEBRASPE",
    "FGV": "FGV",
    "VUNESP": "VUNESP",
    "FCC": "FCC",
    "IBFC": "IBFC",
    "AOCP": "AOCP",
    "IDECAN": "IDECAN",
    "QUADRIX": "QUADRIX",
}

NIVEL_POR_CARGO = {
    # Fundamental
    "auxiliar de servicos gerais": "Fundamental",
    "auxiliar de servicos": "Fundamental",
    "gari": "Fundamental",
    "merendeira": "Fundamental",
    "coveiro": "Fundamental",
    "eletricista": "Fundamental",
    "encanador": "Fundamental",
    "motorista": "Fundamental",
    "vigia": "Fundamental",
    "vigilante": "Fundamental",
    "operador de maquinas pesadas": "Fundamental",
    "oficineiro": "Fundamental",
    "monitor de atividades educacionais": "Fundamental",
    "auxiliar de manutencao": "Fundamental",
    "agente de limpeza urbana": "Fundamental",
    # Médio
    "agente administrativo": "Médio",
    "auxiliar administrativo": "Médio",
    "assistente administrativo": "Médio",
    "tecnico administrativo": "Médio",
    "agente legislativo": "Médio",
    "tecnico legislativo": "Médio",
    "recepcionista": "Médio",
    "agente comunitario de saude": "Médio",
    "tecnico em enfermagem": "Médio",
    "tecnico em laboratorio": "Médio",
    "tecnico em contabilidade": "Médio",
    "fiscal sanitario": "Médio",
    "auxiliar de consultorio odontologico": "Médio",
    "auxiliar de creche": "Médio",
    "auxiliar de patrimonio": "Médio",
    "auxiliar de recursos humanos": "Médio",
    "bombeiro civil": "Médio",
    "tecnico em vigilancia sanitaria": "Médio",
    "tecnico em seguranca do trabalho": "Médio",
    "assistente de gabinete": "Médio",
    "auxiliar de sala de aula": "Médio",
    # Superior
    "assistente social": "Superior",
    "fiscal de tributos": "Superior",
    "tesoureiro": "Superior",
    "assistente de controle interno": "Superior",
    "assistente tecnico": "Superior",
    "secretario legislativo": "Superior",
    "procurador juridico": "Superior",
    "contador": "Superior",
    "enfermeiro": "Superior",
    "farmaceutico": "Superior",
    "fisioterapeuta": "Superior",
    "fonoaudiologo": "Superior",
    "medico": "Superior",
    "nutricionista": "Superior",
    "odontologo": "Superior",
    "professor": "Superior",
    "psicologo": "Superior",
    "redator legislativo": "Superior",
    "assistente legislativo": "Superior",
    "interprete de libras": "Superior",
    "orientador educacional": "Superior",
    "supervisor escolar": "Superior",
    "bioquimico": "Superior",
    "educador fisico": "Superior",
    "analista": "Superior",
    "arquiteto": "Superior",
}


def infer_nivel(cargo: str, text: str = "") -> str:
    key = norm_cargo_key(cargo)
    for known, level in NIVEL_POR_CARGO.items():
        if norm_cargo_key(known) == key:
            return level
    for pattern, level in (
        (r"N[IÍ]VEL\s+FUNDAMENTAL", "Fundamental"),
        (r"N[IÍ]VEL\s+M[EÉ]DIO", "Médio"),
        (r"N[IÍ]VEL\s+SUPERIOR", "Superior"),
    ):
        if re.search(pattern, text, re.I):
            return level
    return "Médio"


def infer_banca(text: str, filename: str, ano: Optional[int] = None) -> str:
    upper = text.upper()
    base = filename.upper()
    for token, nome in BANCA_NAMES.items():
        if re.search(rf"(?<![A-Z]){re.escape(token)}(?![A-Z])", upper) or token in base:
            return nome
    if ano and ano >= 2025:
        return "IGECAP"
    return "CONTEMAX"


def infer_ano(text: str, filename: str) -> Optional[int]:
    m = re.search(r"(20\d{2})", filename)
    if m:
        return int(m.group(1))
    # ano do concurso explícito no cabeçalho
    m = re.search(r"Concurso\s+P[úu]blico\s+n[.º°]?\s*\d+\s*/\s*(20\d{2})", text, re.I)
    if m:
        return int(m.group(1))
    # último recurso: primeiro ano plausível no texto
    m = re.search(r"\b(20\d{2})\b", text)
    return int(m.group(1)) if m else None


def cargo_from_text(text: str) -> Optional[str]:
    lines = [collapse_spaces(l) for l in text.splitlines() if l.strip()]
    for line in lines[:120]:
        m = re.search(r"CARGO\s*[:\-–—]\s*(.+)$", line, re.I)
        if not m:
            continue
        cargo = m.group(1)
        cargo = re.sub(r"\s*[-–—]\s*(PB|PE)\s*$", "", cargo, flags=re.I)
        cargo = re.sub(
            r"\s+(INSTRU[ÇC][ÕO]ES|VERIFIQUE|CONCURSO P[ÚU]BLICO)\b.*$",
            "",
            cargo,
            flags=re.I,
        )
        cargo = collapse_spaces(cargo).strip(" .;:-")
        if cargo and len(cargo) < 90:
            return title_cargo(cargo)
    return None


def _filename_words(filename: str) -> list[str]:
    base = Path(filename).stem
    # separa CamelCase: BarradeSaoMiguel -> Barra de Sao Miguel
    base = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", base)
    base = strip_accents(base).lower()
    return [w for w in re.split(r"[^a-z0-9]+", base) if w]


def cargo_from_filename(filename: str) -> str:
    words = _filename_words(filename)
    stop = {
        "contemax", "igecap", "gabarito", "prova", "definitivo", "definitiva",
        "preliminar", "preliminares", "caderno", "concurso",
    }
    words = [w for w in words if w not in stop and not re.fullmatch(r"20\d{2}", w)]
    # tenta identificar o cargo pelas palavras conhecidas
    cargo_words = [
        "agente", "administrativo", "auxiliar", "assistente", "tecnico",
        "legislativo", "enfermagem", "fiscal", "tributos", "tesoureiro",
        "motorista", "servicos", "gerais", "saude", "comunitario",
        "laboratorio", "contabilidade", "social", "professor", "medico",
        "enfermeiro", "odontologico", "consultorio", "creche", "patrimonio",
        "recursos", "humanos", "bombeiro", "civil", "libras", "interprete",
    ]
    cargo = [w for w in words if w in cargo_words]
    if cargo:
        return title_cargo(" ".join(cargo))
    return title_cargo(" ".join(words))


def city_from_filename(filename: str) -> str:
    words = _filename_words(filename)
    stop = {
        "contemax", "igecap", "gabarito", "prova", "definitivo", "definitiva",
        "preliminar", "preliminares", "caderno", "concurso", "camara",
    }
    cargo_words = {
        "agente", "administrativo", "auxiliar", "assistente", "tecnico",
        "legislativo", "enfermagem", "fiscal", "tributos", "tesoureiro",
        "motorista", "servicos", "gerais", "saude", "comunitario",
        "laboratorio", "contabilidade", "social", "professor", "medico",
        "enfermeiro", "odontologico", "consultorio", "creche", "patrimonio",
        "recursos", "humanos", "bombeiro", "civil", "libras", "interprete",
    }
    city = [
        w for w in words
        if w not in stop and w not in cargo_words and not re.fullmatch(r"20\d{2}", w)
    ]
    return title_cargo(" ".join(city))


ORG_PREFIX_RE = re.compile(r"^(PREFEITURA|C[ÂA]MARA)\s+MUNICIPAL\b", re.I)


def clean_orgao(text: str) -> str:
    text = collapse_spaces(text)
    # corta prosa que vem depois do nome do órgão (ex.: ", no uso de suas
    # atribuições...", ", e a CONTEMAX...")
    text = text.split(",")[0]
    text = re.sub(r"\s+DE\s+VEREADORES\b", "", text, flags=re.I)
    text = re.split(
        r"\s+(?=(?:CARGO|INSTRU[ÇC][ÕO]ES|VERIFIQUE|CONCURSO P[ÚU]BLICO|P[ÁA]GINA)\b)",
        text,
        flags=re.I,
    )[0]
    text = re.sub(r"\s*[-–—]\s*(PB|PE)\s*$", "", text, flags=re.I)
    text = re.sub(r"\s*[/]\s*(PB|PE)\s*$", "", text, flags=re.I)
    text = re.sub(r"\s*[-–—]?\s*ESTADO DA PARA[ÍI]BA.*$", "", text, flags=re.I)
    text = re.sub(r"\s*P[ÁA]GINA\s*\d+\s*$", "", text, flags=re.I)
    text = re.sub(r"\s+DE$", "", text, flags=re.I)
    return collapse_spaces(text).strip(" .,;-")


def orgao_from_text(text: str) -> Optional[str]:
    lines = [collapse_spaces(l) for l in text.splitlines() if l.strip()]
    candidates = []
    for i, line in enumerate(lines):
        s = line
        # linhas de rodapé/cabeçalho com o órgão no meio
        if not ORG_PREFIX_RE.match(s):
            m = re.search(r"((?:PREFEITURA|C[ÂA]MARA)\s+MUNICIPAL\b.*)$", s, re.I)
            if not m:
                continue
            # evita frases de questão: exige linha majoritariamente maiúscula
            letters = [c for c in s if c.isalpha()]
            upper_ratio = sum(1 for c in letters if c.isupper()) / max(1, len(letters))
            if upper_ratio < 0.8:
                continue
            s = m.group(1)

        base = s
        # junta continuação do nome do município
        if i + 1 < len(lines):
            nxt = lines[i + 1]
            if (
                re.search(r"\b(MUNICIPAL|DE)$", base, re.I)
                or re.match(r"^DE\b", nxt, re.I)
                or re.match(r"^[A-ZÀ-Ý][A-ZÀ-Ý\s\-/]+(?:-?(?:PB|PE))?$", nxt)
            ):
                if not re.match(r"^(CARGO|INSTRU|VERIFIQUE|CONCURSO)\b", nxt, re.I):
                    base = base + " " + nxt

        base = clean_orgao(base)
        if len(norm_key(base)) > 8:
            candidates.append(base)

    if not candidates:
        return None

    # prefere o primeiro candidato do começo do documento
    return candidates[0]


def city_from_orgao(orgao: Optional[str]) -> str:
    if not orgao:
        return ""
    city = re.sub(r"^(PREFEITURA|C[ÂA]MARA)\s+MUNICIPAL\s+(DE\s+)?", "", orgao, flags=re.I)
    city = re.sub(r"\s*[-–—]\s*(PB|PE).*$", "", city, flags=re.I)
    city = re.sub(r"\s*[/]\s*(PB|PE).*$", "", city, flags=re.I)
    city = re.sub(r"\s*[-–—]?\s*ESTADO DA PARA[ÍI]BA.*$", "", city, flags=re.I)
    return collapse_spaces(city).strip(" .,;-")


@dataclass
class ProvaMeta:
    path: Path
    filename: str
    banca: str
    ano: Optional[int]
    orgao: str
    city: str
    cargo: str
    nivel: str
    text: str = field(repr=False)

    @property
    def city_tokens(self) -> set[str]:
        return set(norm_key(self.city).split())

    @property
    def cargo_key(self) -> str:
        return norm_cargo_key(self.cargo)


@dataclass
class GabaritoMeta:
    path: Path
    filename: str
    banca: str
    ano: Optional[int]
    orgao: str
    city: str
    text: str = field(repr=False)

    @property
    def city_tokens(self) -> set[str]:
        return set(norm_key(self.city).split())


def read_prova_meta(path: Path) -> ProvaMeta:
    text = run_pdftotext(path, "raw")
    filename = path.name
    cargo = cargo_from_text(text) or cargo_from_filename(filename)
    orgao = orgao_from_text(text) or ""
    city = city_from_orgao(orgao) or city_from_filename(filename)
    ano = infer_ano(text, filename)
    banca = infer_banca(text, filename, ano)
    nivel = infer_nivel(cargo, text)
    return ProvaMeta(path, filename, banca, ano, orgao, city, cargo, nivel, text)


def read_gabarito_meta(path: Path) -> GabaritoMeta:
    text = run_pdftotext(path, "raw")
    filename = path.name
    orgao = orgao_from_text(text) or ""
    city = city_from_orgao(orgao) or city_from_filename(filename)
    ano = infer_ano(text, filename)
    banca = infer_banca(text, filename, ano)
    return GabaritoMeta(path, filename, banca, ano, orgao, city, text)


# ---------------------------------------------------------------------------
# Detecção de seções/disciplinas na prova
# ---------------------------------------------------------------------------

SEC_RE = re.compile(
    r"^(?:[IVX]+\s*[-–—.]?\s*)?"
    r"(?:QUEST[ÕO]ES?\s*(?:DE|–|-)?\s*)?"
    r"(L[IÍ]NGUA\s+PORTUGUESA|"
    r"LINGUA\s+PORTUGUESA|"
    r"RACIOC[IÍ]NIO\s+L[OÓ]GICO|"
    r"RACIC[IÍ]NIO\s+L[OÓ]GICO|"
    r"MATEM[ÁA]TICA|"
    r"DADOS\s+MUNICIPAIS|"
    r"ATUALIDADES|"
    r"CONHECIMENTOS\s+(?:GERAIS|ESPEC\w+))"
    r"\b",
    re.I,
)

RANGE_RE = re.compile(
    r"\(?\s*(\d{1,2})\s*(?:A|ATÉ|–|—|-)\s*(\d{1,2})\s*\)?",
    re.I,
)
START_ONLY_RE = re.compile(r"\(?\s*(\d{1,2})\s*(?:A|ATÉ|–|—|-)\s*$", re.I)


def canonical_discipline(header: str) -> str:
    u = strip_accents(header).upper()
    if "PORTUGUESA" in u:
        return "Língua Portuguesa"
    if "RACIOC" in u or "RACIC" in u or "MATEMATICA" in u:
        return "Raciocínio Lógico"
    if "DADOS MUNICIPAIS" in u:
        return "Dados Municipais"
    if "ATUALIDADES" in u:
        return "Atualidades"
    if "ESPEC" in u:
        return "Conhecimentos Específicos"
    if "GERAIS" in u:
        return "Conhecimentos Gerais"
    return title_cargo(header)


def default_start(discipline: str) -> int:
    mapping = {
        "Língua Portuguesa": 1,
        "Raciocínio Lógico": 11,
        "Dados Municipais": 13,
        "Atualidades": 16,
        "Conhecimentos Específicos": 21,
        "Conhecimentos Gerais": 16,
    }
    return mapping.get(discipline, 21)


def join_wrapped_headers(text: str) -> str:
    """
    Junta cabeçalhos quebrados em duas linhas pelo PDF, por exemplo:
        QUESTÕES - CONHECIMENTOS
        ESPECÍFICOS (21 – 40)
    """
    lines = text.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        current = lines[i]
        if (
            re.search(r"\bCONHECIMENTOS\s*$", current, re.I)
            and i + 1 < len(lines)
            and re.match(r"^\s*ESPEC[IÍ]FICOS\b", lines[i + 1], re.I)
        ):
            out.append(current.rstrip() + " " + lines[i + 1].strip())
            i += 2
            continue
        out.append(current)
        i += 1
    return "\n".join(out)


def parse_sections(text: str) -> list[dict]:
    """
    Lê os cabeçalhos de disciplina e devolve faixas de questões.
    Ex.: [{"disciplina": "Língua Portuguesa", "inicio": 1, "fim": 10}, ...]
    """
    text = join_wrapped_headers(text)
    raw_lines = text.splitlines()
    found: list[tuple[int, str, str]] = []
    i = 0
    while i < len(raw_lines):
        line = collapse_spaces(raw_lines[i])
        m = SEC_RE.match(line)
        if m and len(line) < 180 and not re.match(r"^\d", line):
            header = line
            # incorpora a linha seguinte quando ela contém apenas a faixa
            j = i + 1
            while j < len(raw_lines) and not raw_lines[j].strip():
                j += 1
            if j < len(raw_lines):
                nxt = collapse_spaces(raw_lines[j])
                if (
                    START_ONLY_RE.search(nxt)
                    or RANGE_RE.search(nxt)
                ) and not SEC_RE.match(nxt) and len(nxt) < 100:
                    header += " " + nxt
                    i = j
            found.append((i, header, canonical_discipline(header)))
        i += 1

    # remove duplicatas mantendo a primeira ocorrência de cada disciplina
    seen = set()
    sections = []
    for _, header, disc in found:
        if disc in seen:
            continue
        seen.add(disc)
        sections.append({"header": header, "disciplina": disc})

    if not sections:
        # fallback absoluto
        return [
            {"header": "Língua Portuguesa", "disciplina": "Língua Portuguesa", "inicio": 1, "fim": 10},
            {"header": "Raciocínio Lógico", "disciplina": "Raciocínio Lógico", "inicio": 11, "fim": 15},
            {"header": "Atualidades", "disciplina": "Atualidades", "inicio": 16, "fim": 20},
            {"header": "Conhecimentos Específicos", "disciplina": "Conhecimentos Específicos", "inicio": 21, "fim": 40},
        ]

    # 1ª passada: inícios
    for idx, sec in enumerate(sections):
        m = RANGE_RE.search(sec["header"])
        start = int(m.group(1)) if m else None
        if start is None:
            m2 = START_ONLY_RE.search(sec["header"])
            if m2:
                start = int(m2.group(1))
        if start is None:
            if idx > 0:
                start = sections[idx - 1].get("fim") or default_start(sec["disciplina"])
                if idx > 0 and sections[idx - 1].get("fim") is None:
                    start = default_start(sec["disciplina"])
            else:
                start = default_start(sec["disciplina"])
        sec["inicio"] = start

    # 2ª passada: fins
    for idx, sec in enumerate(sections):
        m = RANGE_RE.search(sec["header"])
        end = int(m.group(2)) if m else None
        if end is None:
            if idx + 1 < len(sections):
                end = sections[idx + 1]["inicio"] - 1
            else:
                end = 40
        if end < sec["inicio"]:
            end = sec["inicio"]
        sec["fim"] = min(40, end)

    return sections


def discipline_for(n: int, sections: list[dict]) -> str:
    for sec in sections:
        if sec["inicio"] <= n <= sec["fim"]:
            return sec["disciplina"]
    # fallback por faixa clássica
    if 1 <= n <= 10:
        return "Língua Portuguesa"
    if 11 <= n <= 15:
        return "Raciocínio Lógico"
    if 16 <= n <= 20:
        return "Atualidades"
    return "Conhecimentos Específicos"


# ---------------------------------------------------------------------------
# Extração das questões
# ---------------------------------------------------------------------------

Q_RE = re.compile(r"^\s*(\d{1,2})\s*[.)](?!\d)\s*(.*)$")
OPT_RE = re.compile(r"^\s*([a-eA-E])\s*[.)]\s*")
# Cesgranrio numera a questão com um número isolado e usa "(A)" nas opções.
OPT_PAREN_RE = re.compile(r"^\s*\(([a-eA-E])\)\s*")
BARE_Q_RE = re.compile(r"^\s*(\d{1,2})\s*$")

# Início de textos de apoio que aparecem entre as opções de uma questão e o
# enunciado da questão seguinte.
SUPPORT_START_RE = re.compile(
    r"^(?:"
    r"TEXTO\b|Texto\b|"
    r"LEIA\b|Leia\b|"
    r"Considere\b|Observe\b|Analise\b|Analise\b|"
    r"Com base\b|A partir\b|De acordo com\b|"
    r"O texto\b|A imagem\b|A charge\b|A tirinha\b|"
    r"Charge\b|Tirinha\b|Poema\b|Música\b|Canção\b|Fragmento\b"
    r")",
)

PAGE_ARTIFACT_PATTERNS = [
    re.compile(r"^pcimarkpci\b", re.I),
    re.compile(r"^www\.pciconcursos\.com\.br$", re.I),
    re.compile(r"^Página\s*\d*$", re.I),
    re.compile(r"^RASCUNHO$", re.I),
    re.compile(r"^Assinatura do\(a\) Candidato", re.I),
    re.compile(r"^N[ºo°] da inscrição$", re.I),
    re.compile(r"^\d{1,3}$"),
    re.compile(r"^Concurso Público\s*$", re.I),
    re.compile(r"^\d{3}/\d{4}$"),
    re.compile(r"^CONCURSO\s+P[ÚU]BLICO\s+N?[.º°\s]*\d+\s*/\s*\d+.*$", re.I),
    re.compile(r"^MODELO DE GABARITO\b.*$", re.I),
    re.compile(r"^_+$"),
    re.compile(r"^\d+([,.]\d+)?\s*PONTOS?$", re.I),
    re.compile(r"^PREFEITURA MUNICIPAL DE .*$", re.I),
    re.compile(r"^CÂMARA MUNICIPAL DE .*$", re.I),
    re.compile(r"^ESTADO D[AE] PARA[ÍI]BA$", re.I),
]


# ---------------------------------------------------------------------------
# Junção de palavras quebradas por hífen no fim da linha (translineação)
# ---------------------------------------------------------------------------

PT_WORDS: Optional[set[str]] = None
PT_WORDS_CHECKED = False

PT_DICT_CANDIDATES = (
    "/usr/share/dict/brazilian",
    "/usr/share/dict/portuguese",
    "/usr/share/hunspell/pt_BR.dic",
    "/usr/share/myspell/pt_BR.dic",
    "/usr/share/myspell/dicts/pt_BR.dic",
)

CLITIC_PRONOUNS = {
    "se", "me", "te", "lhe", "lhes", "nos", "vos", "o", "a", "os", "as",
    "lo", "la", "los", "las", "no", "na", "nas", "mo", "ma", "mos", "mas",
}

COMPOUND_PREFIXES = {
    "anti", "contra", "pré", "pós", "pró", "ex", "vice", "recém", "bem", "mal",
    "micro", "macro", "auto", "semi", "super", "ultra", "hiper", "sub", "infra",
    "intra", "inter", "extra", "multi", "pluri", "mono", "bi", "tri", "co",
    "não", "além", "aquém", "sem", "entre", "sobre", "arco", "sexta", "segunda",
    "terça", "quarta", "quinta", "dois", "três", "quatro", "cinco",
}

# Terminações que, à direita do hífen, caracterizam translineação e não
# composição (ex.: "formal-mente", "homogeneiza-ção").
SOFT_SUFFIXES = {
    "mente", "ção", "ções", "são", "sões", "dade", "dades", "mento", "mentos",
    "vel", "veis", "ável", "ível", "al", "ais", "ico", "ica", "icos", "icas",
    "ivo", "iva", "ivos", "ivas", "oso", "osa", "osos", "osas", "ência",
    "ância", "ismo", "ismos", "ista", "istas", "ização", "izações", "amento",
    "amentos", "ário", "ária", "ório", "ória",
}


def load_pt_words() -> set[str]:
    """Carrega, se existir, uma lista de palavras do português do sistema."""
    global PT_WORDS, PT_WORDS_CHECKED
    if PT_WORDS_CHECKED:
        return PT_WORDS or set()
    PT_WORDS_CHECKED = True
    words: set[str] = set()
    for path in PT_DICT_CANDIDATES:
        try:
            with open(path, encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    w = line.strip().lower()
                    if not w or w.startswith("#"):
                        continue
                    w = w.split("/", 1)[0]  # remove flags do hunspell
                    if w.replace("-", "").isalpha():
                        words.add(w)
        except OSError:
            continue
        if words:
            break
    PT_WORDS = words or None
    return words


def is_soft_hyphen(left: str, right: str, line: str) -> bool:
    """
    Decide se o hífen no fim da linha é translineação (deve ser removido) ou
    parte de uma palavra composta (deve ser mantido).
    """
    words = load_pt_words()
    if not words:
        # sem dicionário, preserva o hífen: comportamento seguro
        return False
    if re.search(r"https?://|www\.|\.(?:com|org|net|br)\b|/", line, re.I):
        return False
    if right in CLITIC_PRONOUNS or len(left) == 1:
        return False

    l, r = left.lower(), right.lower()
    if f"{l}-{r}" in words:
        return False
    if l in COMPOUND_PREFIXES:
        return f"{l}{r}" in words
    if r in SOFT_SUFFIXES:
        return True
    if f"{l}{r}" in words:
        return True
    if l in words and r in words:
        return False
    return True


def join_hyphenated_breaks(lines: list[str]) -> list[str]:
    """Funde a linha seguinte quando a anterior termina em palavra hifenizada."""
    work = list(lines)
    out: list[str] = []
    while work:
        cur = work.pop(0)
        while work:
            m = re.search(r"([^\W\d_]+)-$", cur.rstrip())
            n = re.match(r"\s*([a-zà-öø-ÿ][^\W\d_]*)", work[0])
            if not m or not n or not is_soft_hyphen(m.group(1), n.group(1), cur):
                break
            cur = cur.rstrip()[:-1] + work.pop(0).lstrip()
        out.append(cur)
    return out


def keep_question_numbers(lines: list[str]) -> list[str]:
    """Transforma números de questão isolados em `N.` (formato Cesgranrio).

    Cadernos da Cesgranrio trazem o número da questão sozinho na linha
    ("18") e as alternativas como "(A)". Sem esta normalização, o número
    seria descartado como número de página e a questão ficaria sem início.

    Só considera candidato o número isolado que tem as cinco alternativas
    "(A)".."(E)" logo abaixo; em seguida mantém a maior sequência crescente
    de 1 em 1 (evita números de tabelas, páginas e figuras).
    """
    numeros_soltos: list[tuple[int, int]] = []
    for i, line in enumerate(lines):
        m = BARE_Q_RE.match(line)
        if m:
            numeros_soltos.append((i, int(m.group(1))))

    candidatos: list[tuple[int, int]] = []
    for pos, (i, numero) in enumerate(numeros_soltos):
        # a janela vai até o provável número da questão seguinte (aceita até
        # 3 posições de ruído) ou, no máximo, 160 linhas — questões com texto
        # de apoio/tabelas longas empurram as alternativas bem para baixo
        fim = min(i + 160, len(lines))
        for j, valor in numeros_soltos[pos + 1 :]:
            if valor > numero:
                if valor - numero <= 3:
                    fim = min(fim, j)
                break
        janela = " ".join(lines[i + 1 : fim])
        letras = set(re.findall(r"\(([A-Ea-e])\)", janela))
        if len(letras) >= 3:
            candidatos.append((i, numero))
    if not candidatos:
        return lines

    # maior cadeia de números consecutivos (ignora ruído de páginas/figuras)
    ocorrencias: dict[int, list[int]] = {}
    for indice, numero in candidatos:
        ocorrencias.setdefault(numero, []).append(indice)
    tamanho: dict[int, int] = {}
    melhor_valor, melhor_tamanho = 0, 0
    for numero in sorted(ocorrencias):
        tamanho[numero] = tamanho.get(numero - 1, 0) + 1
        if tamanho[numero] > melhor_tamanho:
            melhor_valor, melhor_tamanho = numero, tamanho[numero]
    if not melhor_valor:
        return lines

    # reconstrói a cadeia de trás para frente, preferindo a ocorrência mais
    # próxima (números trocados de posição pela diagramação são tolerados)
    inicio = melhor_valor - melhor_tamanho + 1
    marcados: dict[int, int] = {}
    limite: Optional[int] = None
    for numero in range(melhor_valor, inicio - 1, -1):
        opcoes = ocorrencias.get(numero, [])
        if not opcoes:
            break
        if limite is None:
            indice = opcoes[-1]
        else:
            indice = min(opcoes, key=lambda i: abs(i - limite))
        marcados[indice] = numero
        limite = indice

    return [f"{marcados[i]}." if i in marcados else line for i, line in enumerate(lines)]


def clean_body_lines(text: str) -> list[str]:
    """
    Remove cabeçalhos, rodapés e linhas de disciplina do corpo da prova.
    As faixas de disciplina já foram lidas separadamente em parse_sections().
    """
    out: list[str] = []
    linhas = keep_question_numbers(join_wrapped_headers(text).splitlines())
    for raw in linhas:
        s = collapse_spaces(raw)
        # o "MODELO DE GABARITO" no fim do caderno inicia um anexo que não
        # faz parte das questões
        if re.match(r"^MODELO DE GABARITO\b", s, re.I):
            break
        if any(p.match(s) for p in PAGE_ARTIFACT_PATTERNS):
            continue
        if SEC_RE.match(s) and len(s) < 180 and not re.match(r"^\d", s):
            continue
        if re.match(r"^\(?\s*\d{1,2}\s*(A|ATÉ|–|—|-)\s*\d{1,2}\s*\)?\s*(?:[-–—]\s*)?(?:(?:PESOS?|PONTOS?)\s*)?\d{0,2}(?:[,.]\d+)?\s*(?:PESOS?|PONTOS?)?\s*$", s, re.I):
            continue
        if re.match(r"^Peso\s*\d+$", s, re.I):
            continue
        if re.match(r"^(PB|PE)\s*[-–]?\s*$", s):
            continue
        out.append(s)

    # colapsa linhas vazias repetidas
    result = []
    for s in out:
        if s == "" and (not result or result[-1] == ""):
            continue
        result.append(s)
    return join_hyphenated_breaks(result)


def find_option_markers(block: list[str]) -> list[tuple[int, int, int, str]]:
    """
    Devolve ocorrências de alternativas no bloco:
    (linha, coluna_inicial, coluna_final, letra).
    Aceita alternativas por linha e alternativas inline (a) b) c) d) e)).
    """
    occ: list[tuple[int, int, int, str]] = []
    for li, line in enumerate(block):
        m = OPT_RE.match(line) or OPT_PAREN_RE.match(line)
        if not m:
            continue
        occ.append((li, m.start(), m.end(), m.group(1).lower()))
        # alternativas inline: "a) b) c) d) e)"
        for mm in re.finditer(r"([b-eB-E])\s*\)", line[m.end():]):
            start = m.end() + mm.start(1)
            occ.append((li, start, m.end() + mm.end(), mm.group(1).lower()))
    occ.sort(key=lambda x: (x[0], x[1]))
    return occ


def parse_question_block(block: list[str]) -> tuple[str, dict[str, str], list[str]]:
    """Separa enunciado, alternativas A-E e eventual texto de apoio seguinte."""
    m = Q_RE.match(block[0])
    first_line = m.group(2).strip() if m else block[0].strip()

    occ = find_option_markers(block)

    # localiza a última sequência completa a, b, c, d, e
    chosen: Optional[dict[str, int]] = None
    for ei in range(len(occ) - 1, -1, -1):
        if occ[ei][3] != "e":
            continue
        seq = {"e": ei}
        p = ei
        ok = True
        for letter in "dcba":
            found = None
            for j in range(p - 1, -1, -1):
                if occ[j][3] == letter:
                    found = j
                    break
            if found is None:
                ok = False
                break
            seq[letter] = found
            p = found
        if ok:
            chosen = seq
            break

    if not chosen:
        enunciado = "\n".join(line for line in block if line).strip()
        enunciado = re.sub(r"^\s*\d{1,2}\s*[.)]\s*", "", enunciado)
        return enunciado, {}, []

    idxs = sorted(chosen.values())
    first_idx = idxs[0]
    a_li, a_start, _, _ = occ[first_idx]

    # texto de apoio que aparece depois da última alternativa e antes da
    # próxima questão; deve ser anexado ao enunciado da questão seguinte
    last_li = occ[idxs[-1]][0]
    support_start: Optional[int] = None
    for li in range(last_li + 1, len(block)):
        if SUPPORT_START_RE.match(block[li].strip()):
            support_start = li
            break

    enunciado_lines = []
    for li in range(a_li):
        enunciado_lines.append(block[li])
    pre = block[a_li][:a_start].strip()
    if pre:
        enunciado_lines.append(pre)
    # remove o número da questão do começo do enunciado
    if enunciado_lines:
        enunciado_lines[0] = re.sub(r"^\s*\d{1,2}\s*[.)]\s*", "", enunciado_lines[0])

    options: dict[str, str] = {}
    for k, oi in enumerate(idxs):
        li, start, end, letter = occ[oi]
        if k + 1 < len(idxs):
            next_li, next_start, _, _ = occ[idxs[k + 1]]
        elif support_start is not None and support_start > li:
            next_li, next_start = support_start, 0
        else:
            next_li, next_start = len(block), None

        if next_li == li and next_start is not None:
            parts = [block[li][end:next_start]]
        else:
            parts = [block[li][end:]]
            parts += block[li + 1:min(next_li, len(block))]
            if next_li < len(block) and next_start is not None:
                parts.append(block[next_li][:next_start])

        text = " ".join(p.strip() for p in parts if p.strip())
        text = re.sub(r"\s+", " ", text).strip()
        # corrige palavra quebrada por hífen no fim da linha
        text = re.sub(r"([a-záéíóúâêôãõç])-\s+([a-záéíóúâêôãõç])", r"\1-\2", text)
        options[letter.upper()] = text

    enunciado = "\n".join(x for x in enunciado_lines if x.strip()).strip()
    enunciado = re.sub(r"([a-záéíóúâêôãõç])-\s+([a-záéíóúâêôãõç])", r"\1-\2", enunciado)
    support = block[support_start:] if support_start is not None else []
    return enunciado, options, support


INSTRUCTION_LINE_RE = re.compile(
    r"^(?:[\uf0b7\uf0d8\u2022\u25aa\u25cf\u2756•❖➢\-]\s*|"
    r"INSTRU[ÇC][ÕO]ES\b|VERIFIQUE SE ESTE CADERNO|VOC[ÊE] DEVE|"
    r"ATEN[ÇC][ÃA]O\b|Proibida a divulga|Devolva esse caderno|"
    r"N[ÃA]O serão aceitas|Corresponde a sua op[çc][ãa]o|"
    r"Contém 40|Marque as respostas|Para cada quest|Voc[êe] ter[áa]|"
    r"N[ãa]o ser[áa] permitida|Procure na FOLHA|Marque apenas uma letra)",
    re.I,
)

DOC_HEADER_RE = re.compile(
    r"^(?:PREFEITURA\b|C[ÂA]MARA\b|CARGO\b|CONCURSO\b|ESTADO\b|"
    r"RASCUNHO\b|Assinatura do|N[ºo°] da inscri)",
    re.I,
)


def extract_preamble(lines: list[str], first_question: int) -> list[str]:
    """
    Recupera o texto de apoio que antecede a questão 1, descartando o bloco
    de instruções do caderno.
    """
    before = lines[:first_question]
    # cadernos com bloco de instruções (Cesgranrio, por exemplo) não têm texto
    # de apoio para a questão 1: o "preâmbulo" é só o manual do candidato
    if any(re.search(r"LEIA ATENTAMENTE AS INSTRU", line, re.I) for line in before):
        return []
    start = 0
    for idx, line in enumerate(before):
        if INSTRUCTION_LINE_RE.match(line.strip()):
            start = idx + 1
    # descarta linhas de cabeçalho que tenham sobrado e linhas vazias
    preamble = []
    for line in before[start:]:
        s = line.strip()
        if not s or DOC_HEADER_RE.match(s):
            continue
        # nome da cidade/estado em caixa alta, sozinho na linha
        if (
            re.fullmatch(r"[A-ZÀ-Ý][A-ZÀ-Ý0-9\s\-–—/.]*", s)
            and len(s.split()) <= 8
            and not re.match(r"^(TEXTO|LEIA)\b", s, re.I)
        ):
            continue
        preamble.append(line)
    text = " ".join(preamble).strip()
    if len(text) < 80 or len(text.split()) < 10:
        return []
    return preamble


# Referências do texto de apoio às questões que ele atende.
# Ex.: "responda as questões 1 e 2", "questões de 1 a 8", "questão 5".
QUESTION_REF_RANGE_RE = re.compile(
    r"quest[õo]es?\s*(?:de\s*)?(\d{1,2})\s*(?:a|até|–|—|-)\s*(\d{1,2})", re.I
)
QUESTION_REF_LIST_RE = re.compile(
    r"quest[õo]es?[^\d]{0,25}((?:\d{1,2}\s*(?:,|e)\s*)+\d{1,2})", re.I
)
QUESTION_REF_SINGLE_RE = re.compile(r"quest[ãa]o\s*(\d{1,2})", re.I)


def extract_question_refs(text: str) -> list[int]:
    """
    Devolve os números de questão citados explicitamente no texto de apoio
    (ex.: "questões 1 e 2", "questões de 1 a 8", "questão 5").
    Retorna lista vazia quando o texto não cita nenhuma questão.
    """
    refs: list[int] = []
    for m in QUESTION_REF_RANGE_RE.finditer(text):
        a, b = int(m.group(1)), int(m.group(2))
        if 1 <= a <= b <= 40:
            refs.extend(range(a, b + 1))
    if not refs:
        for m in QUESTION_REF_LIST_RE.finditer(text):
            nums = [int(x) for x in re.findall(r"\d{1,2}", m.group(1))]
            if nums and all(1 <= n <= 40 for n in nums):
                refs.extend(nums)
    if not refs:
        for m in QUESTION_REF_SINGLE_RE.finditer(text):
            n = int(m.group(1))
            if 1 <= n <= 40:
                refs.append(n)
    return sorted(set(refs))


# Textos de apoio longos sem referência explícita ("Leia o texto...") valem
# para toda a disciplina/seção em que aparecem. Textos curtos (legendas,
# tirinhas) ficam restritos à questão seguinte.
LONG_SUPPORT_CHARS = 300


def section_end_for(n: int, sections: list[dict]) -> int:
    """Última questão da seção/disciplina que contém a questão n."""
    for sec in sections:
        if sec["inicio"] <= n <= sec["fim"]:
            return sec["fim"]
    return 40


def parse_questions(text: str) -> list[dict]:
    """Extrai as questões 1..40 de um caderno de prova."""
    lines = clean_body_lines(text)

    # corrige numeração duplicada produzida pela diagramação: "1) 11. ..."
    lines = [
        re.sub(r"^\s*\d{1,2}\)\s+(\d{1,2}[.)]\s+)", r"\1", line)
        for line in lines
    ]

    starts: list[tuple[int, int]] = []
    expected = 1
    buracos: set[int] = set()
    for i, line in enumerate(lines):
        m = Q_RE.match(line)
        if not m:
            continue
        n = int(m.group(1))
        if n == expected:
            starts.append((i, n))
            expected = n + 1
            while expected in buracos:
                buracos.discard(expected)
                expected += 1
        elif n in buracos:
            # número que apareceu fora de ordem (diagramação trocou duas
            # questões de lugar); o bloco ainda é o do texto sob ele
            starts.append((i, n))
            buracos.discard(n)
        elif n == expected + 1:
            # inversão simples: a questão seguinte apareceu antes
            buracos.add(expected)
            starts.append((i, n))
            expected = n + 1

    sections = parse_sections(text)

    questions = []
    support_map: dict[int, list[str]] = {}

    def add_support(support_lines: list[str], default_q: int) -> None:
        """
        Anexa o texto de apoio às questões que ele atende.

        Prioridade: referências explícitas no texto > texto longo sem
        referência (vale até o fim da seção) > apenas a questão seguinte.
        Um bloco posterior substitui o anterior nas questões em comum.
        """
        if not support_lines:
            return
        text = " ".join(support_lines)
        refs = extract_question_refs(text)
        if not refs:
            if len(text) >= LONG_SUPPORT_CHARS:
                refs = list(
                    range(default_q, section_end_for(default_q, sections) + 1)
                )
            else:
                refs = [default_q]
        for ref in refs:
            support_map[ref] = support_lines

    if starts:
        add_support(extract_preamble(lines, starts[0][0]), 1)

    for k, (i, n) in enumerate(starts):
        j = starts[k + 1][0] if k + 1 < len(starts) else len(lines)
        block = lines[i:j]
        enunciado, options, support = parse_question_block(block)
        questions.append({"numero": n, "enunciado": enunciado, "alternativas": options})
        add_support(support, n + 1)

    for q in questions:
        sup = support_map.get(q["numero"])
        if sup:
            # remove linhas vazias internas para que a primeira linha em branco
            # seja sempre o separador entre apoio e comando da questão
            support_text = "\n".join(line for line in sup if line.strip())
            q["enunciado"] = support_text + "\n\n" + q["enunciado"]
    questions.sort(key=lambda q: q["numero"])
    return questions


# ---------------------------------------------------------------------------
# Gabaritos
# ---------------------------------------------------------------------------

CARGO_STARTS = (
    "AGENTE", "ASSISTENTE", "AUXILIAR", "TÉCNICO", "TECNICO", "FISCAL",
    "TESOUREIRO", "PROCURADOR", "CONTADOR", "ENFERMEIRO", "MÉDICO", "MEDICO",
    "PROFESSOR", "PSICÓLOGO", "PSICOLOGO", "REDATOR", "BOMBEIRO",
    "INTÉRPRETE", "INTERPRETE", "CUIDADOR", "MERENDEIRA", "GARI", "COVEIRO",
    "ELETRICISTA", "ENCANADOR", "MOTORISTA", "VIGILANTE", "VIGIA",
    "OPERADOR", "OFICINEIRO", "MONITOR", "ORIENTADOR", "SUPERVISOR",
    "NUTRICIONISTA", "FONOAUDIÓLOGO", "FONOAUDIOLOGO", "FISIOTERAPEUTA",
    "ODONTÓLOGO", "ODONTOLOGO", "FARMACÊUTICO", "FARMACEUTICO",
    "BIOQUÍMICO", "BIOQUIMICO", "EDUCADOR", "ANALISTA", "ARQUITETO",
    "SECRETÁRIO", "SECRETARIO",
)

GAB_TABLE_SPLIT_RE = re.compile(
    r"\s+(?=(?:QUESTÕES?(?:\s+DE)?|LÍNGUA\s+PORTUGUESA|LINGUA\s+PORTUGUESA|"
    r"RACIOC[IÍ]NIO\s+L[OÓ]GICO|ATUALIDADES|CONHECIMENTOS\s+ESPEC[IÍ]FICOS|"
    r"RESPOSTA|RESPPOSTA)\b)",
    re.I,
)


def gabarito_lines(text: str) -> list[str]:
    """Quebra linhas que misturam cabeçalho de cargo e tabela."""
    out = []
    for raw in text.splitlines():
        s = collapse_spaces(raw)
        if not s:
            continue
        chunks = [c.strip() for c in GAB_TABLE_SPLIT_RE.split(s) if c.strip()]
        out.extend(chunks)
    return out


def is_cargo_heading(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 220:
        return False
    if re.match(r"^\d", s):
        return False
    if re.search(r"\b(QUESTÃO|QUESTÕES|RESPOSTA|RESPPOSTA)\b", s, re.I) and not re.match(
        r"^(CARGO|CARGOS)\b", s, re.I
    ):
        return False
    if re.search(r"^(LÍNGUA|LINGUA|RACIOC|RACIC|ATUALIDADES|CONHECIMENTOS)\b", s, re.I):
        return False
    if re.match(r"^(CARGO|CARGOS)\b", s, re.I):
        return True
    if re.search(r"^COMUNS AOS CARGOS\b", s, re.I):
        return True
    if s.startswith(("➢", "\uf0d8", "")):
        return True
    if re.match(r"^(I|II|III|IV|V|VI|VII|VIII|IX|X)[.\-–—]\s+", s):
        return True
    if s.upper().startswith(CARGO_STARTS) and "?" not in s and len(s) < 110:
        return True
    return False


def is_strong_heading(line: str) -> bool:
    s = line.strip()
    if re.match(r"^(CARGO|CARGOS)\b", s, re.I):
        return True
    if re.match(r"^COMUNS AOS CARGOS\b", s, re.I):
        return True
    if s.startswith(("➢", "\uf0d8", "")):
        return True
    if re.match(r"^(I|II|III|IV|V|VI|VII|VIII|IX|X)[.\-–—]\s+", s):
        return True
    return False


def split_gabarito_segments(text: str) -> list[dict]:
    lines = gabarito_lines(text)
    segments: list[dict] = []
    cur: Optional[dict] = None

    for s in lines:
        if re.match(r"^N[IÍ]VEL\s+(FUNDAMENTAL|M[EÉ]DIO|SUPERIOR)\b", s, re.I):
            if cur:
                segments.append(cur)
                cur = None
            continue

        # continuação de um cabeçalho quebrado em duas linhas pelo PDF
        # (ex.: "... e Técnico em" + "Enfermagem")
        if (
            cur is not None
            and cur["open"]
            and not cur["body"]
            and not re.search(r"\d", s)
            and len(s) < 160
            and not re.match(
                r"^(L[IÍ]NGUA|LINGUA|RACIOC|RACIC|ATUALIDADES|CONHECIMENTOS|"
                r"QUEST\w*|RESPOSTA|RESPPOSTA)\b",
                s,
                re.I,
            )
        ):
            cur["head"] += " " + s
            continue

        if is_cargo_heading(s):
            if is_strong_heading(s) or cur is None or not cur["open"]:
                if cur:
                    segments.append(cur)
                cur = {"head": s, "body": [], "open": True}
            else:
                cur["head"] += " " + s
        else:
            if cur is None:
                continue
            cur["body"].append(s)
            if re.search(
                r"\b(QUESTÕES?|LÍNGUA|LINGUA|RACIOC|RACIC|ATUALIDADES|"
                r"CONHECIMENTOS|RESPOSTA|\d)\b",
                s,
                re.I,
            ):
                cur["open"] = False

    if cur:
        segments.append(cur)
    return segments


def parse_gabarito_answers(body: list[str]) -> dict[int, str]:
    """Extrai pares questão -> resposta de um bloco de gabarito."""
    ans: dict[int, str] = {}
    i = 0
    while i < len(body):
        line = body[i].strip()

        # par isolado: "36 - D" (formato Cesgranrio)
        par = re.fullmatch(r"\s*(\d{1,2})\s*[-–:.]?\s*([A-Ea-e#])\s*", line)
        if par:
            n = int(par.group(1))
            if 1 <= n <= 99:
                ans[n] = par.group(2).upper()
            i += 1
            continue

        # questão anulada: "39 - Anul"
        if re.search(r"\banul", line, re.I):
            m_anul = re.match(r"\s*(\d{1,2})\b", line)
            if m_anul and 1 <= int(m_anul.group(1)) <= 99:
                ans[int(m_anul.group(1))] = "#"
            i += 1
            continue

        # pares inline: "01 A 02 C ..." — em gabaritos com várias colunas
        # (ex.: 4 versões do mesmo caderno) a primeira coluna é a oficial
        pairs = re.findall(
            r"(?<![\d])(\d{1,2})\s*[-–:.]?\s*([A-Ea-e#])(?![\w])", line
        )
        if len(pairs) >= 2 and re.fullmatch(r"[\d\sA-Ea-e#\-–:.]*", line):
            for n, a in pairs:
                n = int(n)
                if 1 <= n <= 99 and n not in ans:
                    ans[n] = a.upper()
            i += 1
            continue

        tmp = re.sub(
            r"^(QUEST[ÃA]O|QUEST[ÕO]ES:?|RESPOSTA:?|RESPPOSTA:?)\s*",
            "",
            line,
            flags=re.I,
        ).strip()
        nums = re.findall(r"\b(\d{1,2})\b", tmp)
        only_nums = bool(nums) and re.fullmatch(r"[\d\s.\-–—]+", tmp) is not None

        tmp2 = re.sub(r"^(RESPOSTA|RESPPOSTA):?\s*", "", line, flags=re.I).strip()
        toks = re.findall(r"[A-Ea-e#]", tmp2)
        only_ans = bool(toks) and re.fullmatch(r"[A-Ea-e#\s.\-–—]+", tmp2) is not None

        if only_nums:
            nlist = [int(x) for x in nums if 1 <= int(x) <= 99]
            j = i + 1
            alist: list[str] = []
            while j < len(body):
                l2 = body[j].strip()
                t2 = re.sub(r"^(RESPOSTA|RESPPOSTA):?\s*", "", l2, flags=re.I).strip()
                a2 = re.findall(r"[A-Ea-e#]", t2)
                if a2 and re.fullmatch(r"[A-Ea-e#\s.\-–—]+", t2) is not None:
                    alist += [x.upper() for x in a2]
                    j += 1
                else:
                    break

            if alist and nlist:
                # se a numeração estiver truncada/duplicada, usa a sequência
                out_of_order = any(
                    nlist[k] >= nlist[k + 1] for k in range(len(nlist) - 1)
                )
                use_sequence = len(nlist) != len(alist) or out_of_order
                if use_sequence:
                    start = nlist[0]
                    for k, a in enumerate(alist):
                        n = start + k
                        if 1 <= n <= 99:
                            ans[n] = a
                else:
                    for n, a in zip(nlist, alist):
                        ans[n] = a
                i = j
                continue

        elif only_ans and toks:
            # linha de respostas sem numeração imediatamente acima
            nxt = 1
            while nxt in ans:
                nxt += 1
            for k, a in enumerate(toks):
                n = nxt + k
                if 1 <= n <= 99:
                    ans[n] = a.upper()
            i += 1
            continue

        i += 1

    return ans


def gabarito_heading_items(head: str) -> list[str]:
    raw = head
    raw = re.sub(
        r"^(CARGOS? DE N[IÍ]VEL [A-ZÀ-Ý]+|"
        r"COMUNS AOS CARGOS DE N[IÍ]VEL [A-ZÀ-Ý]+|"
        r"CARGOS?|CARGO)\s*:?\s*",
        "",
        raw,
        flags=re.I,
    )
    raw = re.sub(r"^[\uf0d8➢]\s*", "", raw)
    raw = re.sub(r"^(I|II|III|IV|V|VI|VII|VIII|IX|X)[.\-–—]\s+", "", raw)
    raw = collapse_spaces(raw).strip(" .;:-")
    items = re.split(r"[,;/]|\s+e\s+|\s+E\s+", raw)
    return [norm_cargo_key(x) for x in items if norm_cargo_key(x)]


def gabarito_por_pagina(text: str, cargo: str) -> dict[int, str]:
    """Extrai respostas de gabaritos com uma página por cargo (Cesgranrio).

    Cada página repete o cabeçalho com o nome do cargo e traz a sequência
    completa (1..N) daquele cargo. Se nenhuma página casar com o cargo,
    devolve vazio e o fluxo antigo (por blocos) assume.
    """
    alvo = norm_cargo_key(cargo)
    if not alvo:
        return {}
    respostas: dict[int, str] = {}
    for pagina in text.split("\f"):
        linhas = pagina.splitlines()
        cabecalho = norm_cargo_key(" ".join(linhas[:8]))
        if alvo not in cabecalho:
            continue
        respostas.update(parse_gabarito_answers(linhas))
    return respostas


WORD_BBOX_POS_RE = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>',
    re.S,
)
ANSWER_PAIR_WORD_RE = re.compile(r"^(\d{1,2})\s*[-–:.]?\s*([A-Ea-e#])$")
ANSWER_NUM_WORD_RE = re.compile(r"^(\d{1,2})\s*[-–:.]?$")
ANSWER_LETTER_RE = re.compile(r"^[-–:.]?([A-Ea-e#])$")
GABARITO_HEADER_NOISE_RE = re.compile(
    r"(pcimarkpci|pciconcursos|www\.|^\s*$)|\S{40,}", re.I
)
GABARITO_HEADER_STOPWORDS = {
    "prova", "provas", "nivel", "superior", "medio", "fundamental", "de", "da",
    "do", "das", "dos", "em", "e", "a", "o", "para", "conhecimentos", "basicos",
    "especificos", "gabarito", "i", "ii", "iii", "iv", "v",
}


def paginas_com_palavras(pdf_path: Path) -> list[dict]:
    """Lê o PDF em -bbox-layout devolvendo páginas -> linhas -> palavras com x.

    Cada página vira `{"largura": float, "linhas": [{"y": float, "palavras":
    [(x0, x1, texto), ...]}]}`, o que permite separar colunas de gabaritos
    com uma versão por cargo. As linhas são reconstruídas pela coordenada y:
    o `-bbox-layout` costuma quebrar cada par "31 - A" em vários `<line>`.
    """
    try:
        proc = subprocess.run(
            ["pdftotext", "-enc", "UTF-8", "-bbox-layout", str(pdf_path), "-"],
            capture_output=True,
            check=False,
        )
        if proc.returncode != 0:
            return []
        saida = proc.stdout.decode("utf-8", errors="ignore")
    except OSError:
        return []

    paginas = []
    for largura_s, _, corpo in PAGE_BBOX_RE.findall(saida):
        palavras = []
        for x0_s, y0_s, x1_s, _, texto in WORD_BBOX_POS_RE.findall(corpo):
            texto = html.unescape(texto).strip()
            if texto:
                palavras.append((float(x0_s), float(y0_s), float(x1_s), texto))
        palavras.sort(key=lambda w: (w[1], w[0]))
        linhas: list[dict] = []
        for x0, y0, x1, texto in palavras:
            if linhas and abs(y0 - linhas[-1]["y"]) <= 3:
                linhas[-1]["palavras"].append((x0, x1, texto))
            else:
                linhas.append({"y": y0, "palavras": [(x0, x1, texto)]})
        for linha in linhas:
            linha["palavras"].sort()
        paginas.append({"largura": float(largura_s), "linhas": linhas})
    return paginas


def pares_de_resposta(palavras: list[tuple[float, float, str]]) -> list[tuple[int, str, float]]:
    """Encontra pares (questão, letra) numa linha, com o x do par.

    O `-bbox-layout` da Cesgranrio costuma separar o par em palavras:
    `"1-"` + `"D"`, ou `"31"` + `"-"` + `"A"`. Também aceita `"ANULADA"`.
    """
    pares = []
    i = 0
    while i < len(palavras):
        x0, x1, texto = palavras[i]
        casado = ANSWER_PAIR_WORD_RE.match(texto)
        if casado:
            n = int(casado.group(1))
            if 1 <= n <= 99:
                pares.append((n, casado.group(2).upper(), (x0 + x1) / 2))
            i += 1
            continue
        numero = ANSWER_NUM_WORD_RE.match(texto)
        if numero:
            j = i + 1
            letra = None
            while j < len(palavras) and j <= i + 2:
                if re.fullmatch(r"[-–:.]", palavras[j][2]):
                    j += 1
                    continue
                achado = ANSWER_LETTER_RE.match(palavras[j][2])
                if achado:
                    letra = achado.group(1).upper()
                    break
                if re.fullmatch(r"ANULAD[AO]", palavras[j][2], re.I):
                    letra = "#"
                    break
                break
            if letra:
                x_fim = palavras[min(j, len(palavras) - 1)][1]
                pares.append((int(numero.group(1)), letra, (x0 + x_fim) / 2))
                i = j + 1
                continue
        i += 1
    return pares


def gabarito_por_colunas(
    path: Path, cargo: str, total_questoes: Optional[int] = None
) -> dict[int, str]:
    """Escolhe a coluna da versão certa num gabarito com várias provas.

    A Cesgranrio publica um único PDF com as respostas de todas as versões
    lado a lado (ex.: "PROVA 1 (TÉCNICO EM EDIFICAÇÕES)"). Cada bloco de
    respostas vira uma âncora; as palavras do cabeçalho são atribuídas à
    âncora mais próxima e as colunas equivalentes das páginas seguintes são
    empilhadas. A escolha usa o nome do cargo e, quando disponível, o total
    de questões do caderno. Devolve `{}` se nada casar com segurança.
    """
    alvo = set(norm_cargo_key(cargo).split())
    if not alvo:
        return {}

    def tokens_de(texto: str) -> set[str]:
        return set(norm_cargo_key(texto).split()) - GABARITO_HEADER_STOPWORDS

    # 1) colunas de cada página, com as palavras do cabeçalho mais próximas
    brutas: list[dict] = []
    for pagina in paginas_com_palavras(path):
        pares_pagina: list[tuple[int, str, float, float]] = []
        linhas_com_par: list[float] = []
        for linha in pagina["linhas"]:
            achados = pares_de_resposta(linha["palavras"])
            if achados:
                linhas_com_par.append(linha["y"])
            for n, letra, x in achados:
                pares_pagina.append((n, letra, x, linha["y"]))
        if not pares_pagina:
            continue

        xs = sorted({round(x, 1) for _, _, x, _ in pares_pagina})
        grupos: list[list[float]] = []
        for x in xs:
            if grupos and x - grupos[-1][-1] <= 28:
                grupos[-1].append(x)
            else:
                grupos.append([x])
        if len(grupos) < 2:
            continue

        primeira_linha = min(linhas_com_par)
        for grupo in grupos:
            lo, hi = grupo[0] - 12, grupo[-1] + 12
            respostas = [(n, letra) for n, letra, x, _ in pares_pagina if lo <= x <= hi]
            if not respostas:
                continue
            ancora = sum(grupo) / len(grupo)
            palavras_cab: list[str] = []
            for linha in pagina["linhas"]:
                if linha["y"] >= primeira_linha or linha["y"] < primeira_linha - 260:
                    continue
                for x0, x1, texto in linha["palavras"]:
                    if GABARITO_HEADER_NOISE_RE.search(texto):
                        continue
                    centro = (x0 + x1) / 2
                    if abs(centro - ancora) <= 70:
                        palavras_cab.append(texto)
            brutas.append(
                {
                    "x": ancora,
                    "respostas": respostas,
                    "tokens": tokens_de(" ".join(palavras_cab)),
                }
            )

    if not brutas:
        return {}

    # 2) empilha a mesma coluna ao longo das páginas
    pilhas: list[dict] = []
    for coluna in brutas:
        destino = None
        for pilha in pilhas:
            if abs(coluna["x"] - pilha["x"]) > 24:
                continue
            if coluna["tokens"] and pilha["tokens"] and not (coluna["tokens"] & pilha["tokens"]):
                continue
            destino = pilha
            break
        if destino is None:
            pilhas.append(
                {
                    "x": coluna["x"],
                    "respostas": list(coluna["respostas"]),
                    "tokens": set(coluna["tokens"]),
                    "paginas": 1,
                }
            )
        else:
            destino["respostas"].extend(coluna["respostas"])
            destino["tokens"] |= coluna["tokens"]
            destino["paginas"] += 1

    def pontuar(pilha: dict) -> float:
        if not pilha["tokens"]:
            return 0.0
        return len(alvo & pilha["tokens"]) / len(alvo)

    def ajuste(pilha: dict) -> float:
        """Quão bem a coluna cobre 1..N (N = questões do caderno)."""
        if not total_questoes:
            return 0.0
        numeros = {n for n, _ in pilha["respostas"]}
        presentes = sum(1 for n in range(1, total_questoes + 1) if n in numeros)
        extras = sum(1 for n in numeros if n > total_questoes)
        return presentes / total_questoes - extras / total_questoes

    candidatas = [p for p in pilhas if pontuar(p) >= 0.6]
    if not candidatas:
        return {}

    def chave(pilha: dict) -> tuple[float, float]:
        return (ajuste(pilha), pontuar(pilha))

    candidatas.sort(key=chave, reverse=True)
    melhor = candidatas[0]
    if len(candidatas) > 1:
        empate = chave(candidatas[1])
        if abs(empate[0] - chave(melhor)[0]) < 0.01 and abs(empate[1] - chave(melhor)[1]) < 0.01:
            if candidatas[1]["tokens"] != melhor["tokens"]:
                return {}

    respostas: dict[int, str] = {}
    for n, letra in melhor["respostas"]:
        respostas.setdefault(n, letra)

    # respostas comuns (bloco básico) podem estar em outra coluna/página:
    # completa só o que vem antes do bloco específico e apenas quando todas
    # as colunas concordam (é resposta comum a todos os cargos)
    primeira = min(respostas) if respostas else 0
    for n in range(1, primeira):
        if n in respostas:
            continue
        letras = {
            letra
            for pilha in pilhas
            for numero, letra in pilha["respostas"]
            if numero == n
        }
        if len(letras) == 1:
            respostas[n] = letras.pop()
    return respostas


def extract_gabarito_for_cargo(path: Path, cargo: str) -> tuple[dict[int, str], list[dict]]:
    """
    Extrai respostas de um gabarito para um cargo.
    Retorna (dict 1..40 -> letra, lista de blocos usados).
    """
    text = run_pdftotext(path, "raw")

    # Cesgranrio: uma página por cargo, com a sequência completa do cargo
    por_pagina = gabarito_por_pagina(text, cargo)
    if por_pagina:
        return por_pagina, [
            {
                "cabecalho": "página do cargo",
                "respostas": len(por_pagina),
                "bloco_comum": False,
                "primeira": min(por_pagina),
                "ultima": max(por_pagina),
            }
        ]

    segments = split_gabarito_segments(text)
    target = norm_cargo_key(cargo)

    common: dict[int, str] = {}
    specific: dict[int, str] = {}
    used: list[dict] = []

    for seg in segments:
        head = seg["head"]
        items = gabarito_heading_items(head)
        exact = target in items
        # fallback: permite "Técnico em Enfermagem - SMS", mas evita
        # "Agente Administrativo" casar com "Agente Administrativo Escolar".
        fuzzy = False
        if not exact:
            target_tokens = target.split()
            for item in items:
                item_tokens = item.split()
                if target_tokens and target_tokens == item_tokens[:len(target_tokens)]:
                    extra = item_tokens[len(target_tokens):]
                    if all(tok in {"sms", "esf", "01", "02", "03", "04", "05", "06"} for tok in extra):
                        fuzzy = True
                        break
        if not exact and not fuzzy:
            continue

        answers = parse_gabarito_answers(seg["body"])
        if not answers:
            continue

        is_common = bool(re.search(r"COMUNS AOS CARGOS", head, re.I)) or (
            bool(re.search(r"CARGOS DE N[IÍ]VEL", head, re.I)) and len(items) > 1
        )
        used.append(
            {
                "cabecalho": head[:160],
                "respostas": len(answers),
                "bloco_comum": is_common,
                "primeira": min(answers),
                "ultima": max(answers),
            }
        )
        if is_common:
            common.update(answers)
        else:
            specific.update(answers)

    merged = dict(common)
    merged.update(specific)
    if not merged:
        # fallback: gabarito de arquivo único (todas as versões na mesma
        # tabela); usa a primeira coluna, que é a versão oficial do caderno
        merged = parse_gabarito_answers(text.splitlines())
        if merged:
            used.append(
                {
                    "cabecalho": "tabela única (primeira coluna)",
                    "respostas": len(merged),
                    "bloco_comum": True,
                    "primeira": min(merged),
                    "ultima": max(merged),
                }
            )
    return merged, used


# ---------------------------------------------------------------------------
# Pareamento prova <-> gabarito
# ---------------------------------------------------------------------------

def city_similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def base_slug(filename: str) -> str:
    """Remove o sufixo de tipo (_prova/_gabarito) do nome do arquivo."""
    return re.sub(r"_(prova|gabarito)(_\d+)?\.pdf$", "", filename, flags=re.I)


def pair_gabaritos(
    provas: list[ProvaMeta], gabaritos: list[GabaritoMeta]
) -> dict[str, Optional[GabaritoMeta]]:
    pairs: dict[str, Optional[GabaritoMeta]] = {}
    for prova in provas:
        candidates = []
        for gab in gabaritos:
            score = city_similarity(prova.city_tokens, gab.city_tokens)
            # nomes controlados pelo nosso baixador: mesmo slug = mesmo par
            if base_slug(prova.filename) == base_slug(gab.filename):
                score = 1.0
            if score < 0.6:
                continue
            if prova.ano and gab.ano and prova.ano != gab.ano:
                # cidade é o critério principal; o ano da prova pode ter sido
                # inferido de um trecho qualquer do texto (ex.: São Domingos).
                score -= 0.25
            # bônus por cargo no nome do arquivo do gabarito
            cargo_bonus = 0.0
            gname = norm_key(gab.filename)
            for token in prova.cargo_key.split():
                if len(token) > 3 and token in gname:
                    cargo_bonus += 0.05
            candidates.append((score + cargo_bonus, gab))
        candidates.sort(key=lambda x: x[0], reverse=True)
        pairs[prova.filename] = candidates[0][1] if candidates else None
    return pairs


def merge_meta(prova: ProvaMeta, gab: Optional[GabaritoMeta]) -> ProvaMeta:
    """Usa dados do gabarito para completar/corrigir metadados da prova."""
    if not gab:
        return prova

    banca = gab.banca or prova.banca
    if gab.ano and not re.search(r"20\d{2}", prova.filename):
        # sem ano no nome do arquivo, o gabarito é a fonte mais confiável
        ano = gab.ano
    else:
        ano = prova.ano or gab.ano
    orgao = gab.orgao or prova.orgao
    city = city_from_orgao(orgao) or prova.city
    nivel = infer_nivel(prova.cargo, prova.text)

    return ProvaMeta(
        path=prova.path,
        filename=prova.filename,
        banca=banca,
        ano=ano,
        orgao=orgao,
        city=city,
        cargo=prova.cargo,
        nivel=nivel,
        text=prova.text,
    )


# ---------------------------------------------------------------------------
# Montagem do dataset
# ---------------------------------------------------------------------------

def slug(text: str, abbreviate_admin: bool = False) -> str:
    s = norm_cargo_key(text) if abbreviate_admin else norm_key(text)
    s = s.replace(" ", "")
    if abbreviate_admin:
        s = s.replace("administrativo", "admin")
    return s.upper()


def make_id(prova: ProvaMeta, n: int) -> str:
    banca = slug(prova.banca)
    ano = prova.ano or 0
    # provas nacionais (ex.: Cesgranrio) podem não ter cidade; usa o órgão
    local = slug(prova.city) or slug(prova.orgao) or "SEMLOCAL"
    cargo = slug(prova.cargo, abbreviate_admin=True)
    return f"{banca}_{ano}_{local}_{cargo}_Q{n:02d}"


def classify_pdfs(folder: Path, include_subdirs: bool = False) -> tuple[list[Path], list[Path]]:
    pattern = "**/*.pdf" if include_subdirs else "*.pdf"
    pdfs = sorted(folder.glob(pattern))
    provas: list[Path] = []
    gabaritos: list[Path] = []

    for path in pdfs:
        name = path.name.lower()
        if "edital" in name:
            continue
        # Nomes controlados pelo nosso baixador: <id>_prova.pdf / <id>_gabarito.pdf
        if re.search(r"_gabarito(?:_\d+)?\.pdf$", name):
            gabaritos.append(path)
            continue
        if re.search(r"_prova(?:_\d+)?\.pdf$", name):
            provas.append(path)
            continue
        if "gabarito" in name:
            gabaritos.append(path)
            continue
        # alguns cadernos não têm "prova" no nome; decide pelo conteúdo
        try:
            sample = run_pdftotext(path, "raw")[:12000].upper()
        except Exception:
            continue
        if "GABARITO" in sample and "CARGO:" not in sample:
            gabaritos.append(path)
        else:
            provas.append(path)

    return provas, gabaritos


def classificar_assunto(disciplina: str, enunciado: str, alternativas: dict) -> str:
    """Classifica automaticamente o assunto com base no enunciado e alternativas."""
    texto = (enunciado + " " + " ".join(alternativas.values())).lower()

    if "Português" in disciplina or "Portuguesa" in disciplina:
        if re.search(r"\b(crase|aquel[ae]s?|às?)\b", texto) and "crase" in texto:
            return "Crase e Regência"
        if re.search(r"\b(ortograf|acentua[çc]|ox[íi]ton|parox[íi]ton|proparox[íi]ton|d[íi]grafo|hifen|hífen|grafia)\b", texto):
            return "Ortografia e Acentuação"
        if re.search(r"\b(sin[ôo]nim|ant[ôo]nim|sentido|significa|conotati|denotati|figurada|met[áa]fora|abissal)\b", texto):
            return "Semântica e Vocabulário"
        if re.search(r"\b(concord[âa]ncia|singular|plural)\b", texto):
            return "Concordância Verbal e Nominal"
        if re.search(r"\b(reg[êe]ncia)\b", texto):
            return "Regência Verbal e Nominal"
        if re.search(r"\b(pontua[çc]|v[íi]rgula|aspas|ponto e v[íi]rgula|travess[ãa]o)\b", texto):
            return "Pontuação"
        if re.search(r"\b(sujeito|predicado|objeto direto|objeto indireto|ora[çc][ãa]o|per[íi]odo|sintaxe|aposto|vocativo)\b", texto):
            return "Sintaxe da Oração e do Período"
        if re.search(r"\b(pronome|substantivo|adjetivo|adv[ée]rbio|verbo|conjun[çc]|preposi[çc]|morfologia|classe)\b", texto):
            return "Morfologia e Classes de Palavras"
        if re.search(r"\b(texto|autor|lide|par[áa]grafo|infere|conclui|compreens[ãa]o|interpreta[çc]|ideia central)\b", texto):
            return "Compreensão e Interpretação de Texto"
        return "Gramática Aplicada e Texto"

    elif "Raciocínio" in disciplina or "Matemática" in disciplina:
        if re.search(r"\b(proposi[çc]|conectiv|nega[çc]|equival[êe]ncia|tabela.verdade|tautologia|conjunção|disjunção)\b", texto):
            return "Lógica Proposicional"
        if re.search(r"\b(porcent|%|taxa|juros)\b", texto):
            return "Porcentagem e Matemática Financeira"
        if re.search(r"\b(probabilidade|combina[çc]|arranjo|permuta[çc]|fatorial)\b", texto):
            return "Análise Combinatória e Probabilidade"
        if re.search(r"\b(conjunto|diagrama|interse[çc]|uni[ãa]o|venn)\b", texto):
            return "Teoria dos Conjuntos"
        if re.search(r"\b(regra de tr[êe]s|propor[çc]|raz[ãa]o)\b", texto):
            return "Razão, Proporção e Regra de Três"
        if re.search(r"\b([áa]rea|per[íi]metro|volume|tri[âa]ngulo|quadrado|geometri)\b", texto):
            return "Geometria e Medidas"
        if re.search(r"\b(equa[çc]|fun[çc]|sistema|1[º°] grau|2[º°] grau)\b", texto):
            return "Equações e Álgebra"
        return "Raciocínio Lógico e Aritmética"

    elif "Atualidades" in disciplina or "Gerais" in disciplina or "Dados" in disciplina:
        if re.search(r"\b(munic[íi]pio|para[íi]ba|pernambuco|emancipa[çc]|prefeit|popula[çc]|censo|limites?)\b", texto):
            return "Aspectos Históricos e Geográficos Regionais"
        if re.search(r"\b(israel|ir[ãa]|guerra|conflito|eua|internacional|onu|ucr[âa]nia|oriente m[ée]dio)\b", texto):
            return "Geopolítica e Atualidades Internacionais"
        if re.search(r"\b(brasil|economia|infla[çc]|governo|pol[íi]tica|ambiente|clima|sustentab)\b", texto):
            return "Atualidades Nacionais e Cidadania"
        return "Atualidades Gerais"

    elif "Específicos" in disciplina or "Administra" in disciplina:
        if re.search(r"\b(limpe|legalidade|impessoalidade|moralidade|publicidade|efici[êe]ncia|princ[íi]pio)\b", texto):
            return "Princípios da Administração Pública (LIMPE)"
        if re.search(r"\b(redator|redação oficial|of[íi]cio|memorando|manual da presid[êe]ncia|padr[ãa]o of[íi]cio|fecho)\b", texto):
            return "Redação Oficial"
        if re.search(r"\b(arquivo|arquivologia|tabela de temporalidade|corrente|intermedi[áa]rio|permanente|método alfabético)\b", texto):
            return "Arquivologia e Gestão de Documentos"
        if re.search(r"\b(ato administrativo|anula[çc]|revoga[çc]|autoexecutoriedade|imperatividade|atributos?)\b", texto):
            return "Atos Administrativos"
        if re.search(r"\b(licita[çc]|contrato|dispensa|inexigibilidade|8\.666|14\.133)\b", texto):
            return "Licitações e Contratos Públicos"
        if re.search(r"\b(atendimento|rela[çc][õo]es humanas|p[úu]blico|comunica[çc]|postura)\b", texto):
            return "Atendimento ao Público e Relações Interpessoais"
        if re.search(r"\b(patrim[ôo]nio|almoxarifado|bens|invent[áa]rio|estoque)\b", texto):
            return "Administração de Recursos Materiais e Patrimônio"
        if re.search(r"\b(constitui[çc]|art\. 37|servidor|estabilidade|cargo p[úu]blico)\b", texto):
            return "Noções de Direito Administrativo e Constitucional"
        return "Rotinas Administrativas e Gestão Pública"

    return "Conhecimentos Gerais de Concursos"


def cargo_permitido(
    cargo: str,
    incluir: Optional[list[str]] = None,
    excluir: Optional[list[str]] = None,
) -> bool:
    """Decide se o cargo entra no recorte.

    - `excluir`: trechos normalizados que nunca entram (enfermagem, fiscal...).
    - `incluir`: se informado, o cargo precisa conter um destes trechos;
      caso contrário vale o recorte administrativo/legislativo padrão.
    """
    norm = norm_cargo_key(cargo)
    padrao_excluir = [
        "enfermagem", "vigia", "motorista", "guarda", "tesoureiro",
        "fiscal de tributos", "gari", "merendeira", "coveiro",
    ]
    termos_excluir = [norm_key(t) for t in (excluir or [])] + padrao_excluir
    if any(termo in norm for termo in termos_excluir if termo):
        return False
    alvos = [norm_key(t) for t in incluir] if incluir else ["administrativo", "legislativo"]
    return any(alvo in norm for alvo in alvos if alvo)


def is_target_admin_cargo(cargo: str, termos: Optional[list[str]] = None) -> bool:
    """Compatibilidade: filtro administrativo padrão (ou lista de termos)."""
    return cargo_permitido(cargo, incluir=termos)


def carregar_meta(caminho: Path) -> dict[str, dict]:
    """Lê um JSON de metadados (lista de provas do PCI) indexado pelo slug."""
    dados = json.loads(caminho.read_text(encoding="utf-8"))
    if isinstance(dados, dict):
        itens = dados.get("data") or dados.get("provas") or []
    else:
        itens = dados
    meta: dict[str, dict] = {}
    for item in itens:
        chave = item.get("id") or item.get("slug")
        if chave:
            meta[chave] = item
    return meta


def build_dataset(folder: Path, include_subdirs: bool = False, verbose: bool = False, admin_only: bool = True, meta: Optional[dict] = None, cargos: Optional[list[str]] = None, excluir_cargos: Optional[list[str]] = None, niveis: Optional[list[str]] = None, min_cobertura: float = 0.0) -> tuple[list[dict], dict]:
    provas_paths, gabaritos_paths = classify_pdfs(folder, include_subdirs)

    if verbose:
        print(f"[i] {len(provas_paths)} cadernos de prova e {len(gabaritos_paths)} gabaritos encontrados.")

    provas = [read_prova_meta(p) for p in provas_paths]
    gabaritos = [read_gabarito_meta(p) for p in gabaritos_paths]

    if meta:
        for prova in provas:
            info = meta.get(base_slug(prova.filename))
            if not info:
                continue
            if info.get("descricao"):
                prova.cargo = title_cargo(str(info["descricao"]))
            if info.get("orgao"):
                prova.orgao = str(info["orgao"])
            if info.get("ano"):
                prova.ano = int(info["ano"])
            prova.nivel = infer_nivel(prova.cargo, prova.text)
            # o slug do arquivo já carrega órgão/cargo; não é uma cidade
            prova.city = ""

    def cargo_aceito(cargo: str) -> bool:
        norm = norm_cargo_key(cargo)
        if excluir_cargos and any(norm_key(t) in norm for t in excluir_cargos if t):
            return False
        if cargos:
            return any(norm_key(t) in norm for t in cargos if t)
        if admin_only:
            return is_target_admin_cargo(cargo)
        return True

    if admin_only or cargos or excluir_cargos:
        provas_filtradas = [p for p in provas if cargo_aceito(p.cargo)]
        if verbose:
            print(f"[i] Filtro de cargos aplicado: {len(provas_filtradas)} de {len(provas)} cadernos mantidos.")
        provas = provas_filtradas

    if niveis:
        alvo = {nivel.lower() for nivel in niveis}
        provas_nivel = [p for p in provas if (p.nivel or "").lower() in alvo]
        if verbose:
            print(f"[i] Filtro de nível aplicado: {len(provas_nivel)} de {len(provas)} cadernos mantidos.")
        provas = provas_nivel

    pairs = pair_gabaritos(provas, gabaritos)

    dataset: list[dict] = []
    report = {
        "provas": [],
        "provas_incompletas": [],
        "gabaritos_sem_par": [],
        "questoes_sem_alternativas": [],
        "questoes_sem_gabarito": [],
        "ids_duplicados": [],
    }

    paired_gabaritos = set()
    for prova in provas:
        gab = pairs.get(prova.filename)
        prova = merge_meta(prova, gab)
        if gab:
            paired_gabaritos.add(gab.filename)

        sections = parse_sections(prova.text)
        questions = parse_questions(prova.text)
        # cadernos em duas colunas (Cesgranrio) exigem a ordem reconstruída
        if len(re.findall(r"^\s*\([A-Ea-e]\)", prova.text, re.M)) >= 3:
            texto_colunas = run_pdftotext_columns(prova.path)
            if texto_colunas and texto_colunas != prova.text:
                questoes_colunas = parse_questions(texto_colunas)
                if len(questoes_colunas) > len(questions):
                    prova.text = texto_colunas
                    questions = questoes_colunas
                    sections = parse_sections(texto_colunas)
        answers, used_blocks = ({}, [])
        if gab:
            answers, used_blocks = extract_gabarito_for_cargo(gab.path, prova.cargo)
            # gabaritos com uma coluna por versão: a coluna que casa com o
            # cargo é mais confiável que a leitura misturada das versões.
            # Só completa o bloco comum (números anteriores ao específico)
            # com o que a leitura por blocos já tinha.
            total = max((q["numero"] for q in questions), default=0)
            por_coluna = gabarito_por_colunas(gab.path, prova.cargo, total)
            cobertas = sum(1 for q in questions if q["numero"] in por_coluna)
            if por_coluna and cobertas >= 0.8 * len(questions):
                primeira = min(por_coluna)
                for n, letra in answers.items():
                    if n < primeira and n not in por_coluna:
                        por_coluna[n] = letra
                answers = por_coluna
                used_blocks = [
                    {
                        "cabecalho": "coluna do cargo (tabela de versões)",
                        "respostas": len(por_coluna),
                        "bloco_comum": False,
                        "primeira": min(por_coluna),
                        "ultima": max(por_coluna),
                    }
                ]

        # cobertura baixa indica extração quebrada (numeração perdida, páginas
        # em imagem, caderno fora do padrão): melhor não publicar questões
        # desalinhadas do gabarito
        if min_cobertura > 0 and answers:
            cobertura = len(questions) / len(answers)
            if cobertura < min_cobertura:
                report["provas_incompletas"].append(
                    {
                        "arquivo": prova.filename,
                        "questoes_extraidas": len(questions),
                        "respostas_gabarito": len(answers),
                        "cobertura": round(cobertura, 3),
                    }
                )
                if verbose:
                    print(
                        f"[!] {prova.filename}: {len(questions)} questões para "
                        f"{len(answers)} respostas (cobertura {cobertura:.0%}) — ignorada"
                    )
                continue

        missing_alt = []
        missing_gab = []
        for q in questions:
            n = q["numero"]
            opts = q["alternativas"]
            alt = {letter: opts.get(letter, "") for letter in "ABCDE"}
            gabarito = answers.get(n)
            anulada = gabarito == "#"
            # sem gabarito não há como corrigir: melhor não publicar a questão
            if gabarito is None:
                missing_gab.append(n)
                continue
            disciplina = discipline_for(n, sections)
            assunto = classificar_assunto(disciplina, q["enunciado"], alt)

            item = {
                "id": make_id(prova, n),
                "banca": prova.banca,
                "ano": prova.ano,
                "orgao": prova.orgao,
                "cargo": prova.cargo,
                "nivel": prova.nivel,
                "disciplina": disciplina,
                "assunto": assunto,
                "enunciado": q["enunciado"],
                "alternativas": alt,
                "gabarito": gabarito if not anulada else None,
                "anulada": anulada,
            }
            dataset.append(item)

            if any(not alt[letter].strip() for letter in "ABCDE"):
                missing_alt.append(n)

        report["provas"].append(
            {
                "arquivo": prova.filename,
                "banca": prova.banca,
                "ano": prova.ano,
                "orgao": prova.orgao,
                "cargo": prova.cargo,
                "nivel": prova.nivel,
                "questoes_extraidas": len(questions),
                "gabarito": gab.filename if gab else None,
                "respostas_gabarito": len(answers),
                "blocos_gabarito": used_blocks,
                "disciplinas": sections,
                "questoes_com_alternativa_vazia": missing_alt,
                "questoes_sem_gabarito": missing_gab,
            }
        )
        if missing_gab:
            report["questoes_sem_gabarito"].append(
                {"arquivo": prova.filename, "questoes": missing_gab}
            )
        if missing_alt:
            report["questoes_sem_alternativas"].append(
                {"arquivo": prova.filename, "questoes": missing_alt}
            )

    report["gabaritos_sem_par"] = sorted(
        g.filename for g in gabaritos if g.filename not in paired_gabaritos
    )

    ids = [q["id"] for q in dataset]
    seen = set()
    dup = set()
    for _id in ids:
        if _id in seen:
            dup.add(_id)
        seen.add(_id)
    report["ids_duplicados"] = sorted(dup)
    report["total_questoes"] = len(dataset)

    return dataset, report


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extrai questões de provas IGECAP/CONTEMAX e cruza com gabaritos."
    )
    parser.add_argument(
        "--dir",
        default=str(Path(__file__).resolve().parent),
        help="Pasta com os PDFs (padrão: pasta do script).",
    )
    parser.add_argument(
        "--out",
        default="questoes.json",
        help="Arquivo JSON de saída (padrão: questoes.json).",
    )
    parser.add_argument(
        "--report",
        default="relatorio_parser.json",
        help="Arquivo JSON do relatório de validação.",
    )
    parser.add_argument("--include-subdirs", action="store_true", help="Inclui subpastas.")
    parser.add_argument("--all-cargos", action="store_true", help="Inclui todos os cargos, sem filtrar administrativos.")
    parser.add_argument(
        "--cargos",
        default=None,
        help="Lista de trechos de cargo a aceitar (separados por vírgula), no lugar do filtro administrativo padrão.",
    )
    parser.add_argument(
        "--excluir-cargos",
        default=None,
        help="Lista de trechos de cargo a excluir (separados por vírgula), ex.: enfermagem,fiscal.",
    )
    parser.add_argument(
        "--niveis",
        default=None,
        help="Níveis a manter, separados por vírgula (ex.: Fundamental,Médio).",
    )
    parser.add_argument(
        "--min-cobertura",
        type=float,
        default=0.0,
        help="Ignora cadernos cuja extração cobre menos que esta fração das respostas do gabarito (ex.: 0.95).",
    )
    parser.add_argument("--meta", default=None, help="JSON de metadados do PCI (id/descricao/orgao/ano) para enriquecer a base.")
    parser.add_argument("--verbose", action="store_true", help="Mostra o progresso.")
    args = parser.parse_args(list(argv) if argv is not None else None)

    folder = Path(args.dir).expanduser().resolve()
    if not folder.is_dir():
        print(f"[!] Pasta não encontrada: {folder}", file=sys.stderr)
        return 1

    meta = None
    if args.meta:
        meta_path = Path(args.meta).expanduser()
        if not meta_path.is_absolute():
            meta_path = Path.cwd() / meta_path
        if not meta_path.exists():
            print(f"[!] Metadados não encontrados: {meta_path}", file=sys.stderr)
            return 1
        meta = carregar_meta(meta_path)

    try:
        admin_only = (not args.all_cargos) or bool(args.cargos)
        cargos = [c.strip() for c in args.cargos.split(",") if c.strip()] if args.cargos else None
        excluir = [c.strip() for c in args.excluir_cargos.split(",") if c.strip()] if args.excluir_cargos else None
        niveis = [n.strip() for n in args.niveis.split(",") if n.strip()] if args.niveis else None
        dataset, report = build_dataset(
            folder,
            args.include_subdirs,
            args.verbose,
            admin_only=admin_only,
            meta=meta,
            cargos=cargos,
            excluir_cargos=excluir,
            niveis=niveis,
            min_cobertura=args.min_cobertura,
        )
    except RuntimeError as exc:
        print(f"[!] {exc}", file=sys.stderr)
        return 1

    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = Path.cwd() / out_path
    report_path = Path(args.report)
    if not report_path.is_absolute():
        report_path = Path.cwd() / report_path

    save_json(out_path, dataset)
    save_json(report_path, report)

    print(f"[ok] {len(dataset)} questões gravadas em {out_path}")
    print(f"[ok] Relatório em {report_path}")
    if args.verbose:
        for item in report["provas"]:
            print(
                f"  - {item['arquivo']}: {item['questoes_extraidas']} questões | "
                f"gabarito: {item['gabarito'] or 'AUSENTE'} ({item['respostas_gabarito']} respostas)"
            )
        if report["ids_duplicados"]:
            print(f"[!] IDs duplicados: {len(report['ids_duplicados'])}")
        if report["gabaritos_sem_par"]:
            print(f"[i] Gabaritos sem par: {', '.join(report['gabaritos_sem_par'])}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

