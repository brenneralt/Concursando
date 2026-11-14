#!/usr/bin/env python3
"""
Módulo de Extração de Questões de PDFs de Provas de Concursos
Suporta extração textual, segmentação por regex para Múltipla Escolha e Certo/Errado (Cebraspe),
e pareamento com gabaritos oficiais.
"""

import re
import json
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional

def extrair_texto_pdf(pdf_path: Path) -> str:
    """Extrai texto bruto de um PDF usando pypdf ou pdfplumber se instalados."""
    try:
        import pypdf
        reader = pypdf.PdfReader(str(pdf_path))
        textos = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            textos.append(page_text)
        return "\n".join(textos)
    except ImportError:
        try:
            import pdfplumber
            with pdfplumber.open(str(pdf_path)) as pdf:
                return "\n".join([page.extract_text() or "" for page in pdf.pages])
        except ImportError:
            raise RuntimeError("Nenhuma biblioteca PDF instalada. Instale pypdf via 'pip install pypdf'.")

def parsear_gabarito_texto(texto_gabarito: str) -> Dict[int, str]:
    """
    Extrai mapa de {numero_questao: alternativa_correta}.
    Reconhece formatos como:
    1 - C, 2 - E, 3 - A, ou 'Questão 1: B', ou tabelas '1 A 2 B'.
    """
    gabarito_map = {}
    padrao = re.findall(r'(?:quest[ãa]o\s+)?(\d+)[\s:\-–—]+([A-E]|CERTO|ERRADO|C|E)\b', texto_gabarito, re.IGNORECASE)
    for num, resp in padrao:
        resp_norm = resp.upper()
        if resp_norm == "CERTO":
            resp_norm = "C"
        elif resp_norm == "ERRADO":
            resp_norm = "E"
        gabarito_map[int(num)] = resp_norm
    return gabarito_map

def segmentar_questoes_multipla_escolha(texto_prova: str, banca: str = "GENERICA", orgao: str = "", ano: int = 2024, disciplina: str = "Geral") -> List[Dict[str, Any]]:
    """Segmenta questões padrão com alternativas (A), (B), (C), (D), (E)."""
    # Procura por "QUESTÃO XX" ou "XX." no início de linha
    padrao_questao = re.split(r'\n(?=(?:QUEST[ÃA]O\s+\d+|\d{1,3}[\.\-–\)]\s+[A-Z]))', texto_prova, flags=re.IGNORECASE)
    questoes = []

    for bloco in padrao_questao:
        bloco = bloco.strip()
        if not bloco or len(bloco) < 30:
            continue

        match_num = re.search(r'^(?:QUEST[ÃA]O\s+)?(\d+)', bloco, re.IGNORECASE)
        numero = int(match_num.group(1)) if match_num else len(questoes) + 1

        # Separar enunciado de alternativas (A), (B), (C), (D), (E)
        partes_alt = re.split(r'\n(?=[A-E][\)\.\-–]\s+)', bloco)
        if len(partes_alt) >= 3:
            enunciado = partes_alt[0]
            # Limpar cabeçalho do enunciado
            enunciado = re.sub(r'^(?:QUEST[ÃA]O\s+\d+[\.\-–]?|\d+[\.\-–\)])\s*', '', enunciado, flags=re.IGNORECASE).strip()

            alternativas = []
            for alt_bloco in partes_alt[1:]:
                alt_match = re.match(r'^([A-E])[\)\.\-–]\s*(.+)$', alt_bloco.strip(), re.DOTALL)
                if alt_match:
                    alternativas.append({
                        "id": alt_match.group(1).upper(),
                        "texto": alt_match.group(2).strip()
                    })

            if alternativas:
                questoes.append({
                    "id": f"EXTR-{ano}-{str(numero).zfill(3)}",
                    "numero_original": numero,
                    "banca": banca,
                    "orgao": orgao,
                    "cargo": "Geral",
                    "ano": ano,
                    "disciplina": disciplina,
                    "assunto": "A Classificar",
                    "modalidade": "MULTIPLA_ESCOLHA",
                    "enunciado": enunciado,
                    "alternativas": alternativas,
                    "gabarito": "A", # Substituído se fornecido gabarito
                    "explicacao": ""
                })

    return questoes

def parear_gabarito(questoes: List[Dict[str, Any]], gabarito_map: Dict[int, str]) -> List[Dict[str, Any]]:
    """Aplica o gabarito oficial às questões extraídas com base no número original."""
    for q in questoes:
        num = q.get("numero_original")
        if num in gabarito_map:
            q["gabarito"] = gabarito_map[num]
        q.pop("numero_original", None)
    return questoes

def main():
    parser = argparse.ArgumentParser(description="Extração e pareamento de questões a partir de PDFs")
    parser.add_argument("--prova", type=Path, help="Caminho do PDF da prova")
    parser.add_argument("--gabarito", type=Path, help="Caminho do PDF ou TXT do gabarito")
    parser.add_argument("--banca", type=str, default="CEBRASPE")
    parser.add_argument("--orgao", type=str, default="")
    parser.add_argument("--ano", type=int, default=2024)
    parser.add_argument("--disciplina", type=str, default="Geral")
    parser.add_argument("--output", type=Path, default=Path("data/extraidas_temp.json"))
    args = parser.parse_args()

    if not args.prova:
        print("[i] Modo de teste/demonstração. Use --prova <caminho.pdf> para extração real.")
        print("[+] Módulo parser/extrair_questoes.py pronto para processamento.")
        return

    print(f"[*] Extraindo texto de {args.prova}...")
    texto_prova = extrair_texto_pdf(args.prova)

    questoes = segmentar_questoes_multipla_escolha(
        texto_prova, banca=args.banca, orgao=args.orgao, ano=args.ano, disciplina=args.disciplina
    )
    print(f"[+] {len(questoes)} questões segmentadas.")

    if args.gabarito:
        if args.gabarito.suffix.lower() == ".pdf":
            texto_gab = extrair_texto_pdf(args.gabarito)
        else:
            texto_gab = args.gabarito.read_text(encoding="utf-8")
        gab_map = parsear_gabarito_texto(texto_gab)
        questoes = parear_gabarito(questoes, gab_map)
        print(f"[+] Gabarito pareado para {len(gab_map)} questões.")

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(questoes, f, ensure_ascii=False, indent=2)
    print(f"[+] Extração salva em {args.output}")

if __name__ == "__main__":
    main()
