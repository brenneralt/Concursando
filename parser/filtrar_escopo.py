#!/usr/bin/env python3
"""Recorta um lote extraído para o escopo do projeto (nível médio/fundamental).

O parser não tem como saber, só pelo texto do caderno, que "Administração" ou
"Ciências Contábeis" são cargos de nível superior; o raspador do PCI também
devolve esses cargos entre as provas de nível médio. Este filtro remove os
casos em que o nome do cargo é a própria área de formação, além de respeitar
o nível detectado no caderno.

Uso:
    python3 parser/filtrar_escopo.py --novo /tmp/questoes_cesgranrio.json \
        --out /tmp/questoes_cesgranrio_medio.json --relatorio /tmp/escopo.json
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

# cargos cujo nome é a área de formação (nível superior)
CARGOS_SUPERIORES = {
    "administracao",
    "administracao de empresas",
    "administracao escolar",
    "administracao geral",
    "administracao publica",
    "advocacia",
    "arquitetura",
    "arquivologia",
    "biblioteconomia",
    "biologia",
    "ciencias atuariais",
    "ciencias biologias",
    "ciencias contabeis",
    "ciencias economicas",
    "ciencias sociais",
    "comunicacao social",
    "comunicacao social jornalismo",
    "comunicacao social publicidade e propaganda",
    "comunicacao social relacoes publicas",
    "contabilidade",
    "direito",
    "economia",
    "enfermagem",
    "engenharia ambiental",
    "engenharia cartografica",
    "engenharia civil",
    "engenharia de producao",
    "engenharia de seguranca do trabalho",
    "engenharia eletrica",
    "engenharia eletronica",
    "engenharia florestal",
    "engenharia mecanica",
    "engenharia quimica",
    "estatistica",
    "farmacia",
    "filosofia",
    "fisica",
    "fisioterapia",
    "fonoaudiologia",
    "geografia",
    "geologia",
    "historia",
    "jornalismo",
    "letras",
    "matematica",
    "medicina",
    "medicina do trabalho",
    "medicina veterinaria",
    "nutricao",
    "odontologia",
    "pedagogia",
    "psicologia",
    "quimica",
    "servico social",
    "sociologia",
    "turismo",
}


def norm(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", texto.lower())).strip()


def cargo_superior(cargo: str) -> bool:
    chave = norm(cargo)
    if chave in CARGOS_SUPERIORES:
        return True
    # "Administração - Júnior", "Ciências Contábeis Júnior"... continuam sendo
    # a área de formação; já "Técnico em Administração" é cargo de nível médio.
    return bool(re.fullmatch(r"(.+)\s+junior", chave)) and chave.rsplit(" junior", 1)[0] in CARGOS_SUPERIORES


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--novo", type=Path, required=True, help="JSON extraído")
    ap.add_argument("--out", type=Path, required=True, help="JSON recortado")
    ap.add_argument("--relatorio", type=Path, default=None, help="Resumo do recorte")
    ap.add_argument(
        "--manter-superior",
        action="store_true",
        help="Não descarta questões marcadas como nível Superior",
    )
    args = ap.parse_args(argv)

    dados = json.loads(args.novo.read_text(encoding="utf-8"))
    if isinstance(dados, dict):
        dados = dados.get("data") or dados.get("questoes") or []

    mantidas: list[dict] = []
    motivos = Counter()
    por_cargo = Counter()

    for q in dados:
        if cargo_superior(q.get("cargo") or ""):
            motivos["cargo de area superior"] += 1
            por_cargo[q.get("cargo")] += 1
            continue
        if not args.manter_superior and (q.get("nivel") or "") == "Superior":
            motivos["nivel superior no caderno"] += 1
            continue
        mantidas.append(q)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(mantidas, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"entrada: {len(dados)} | mantidas: {len(mantidas)} | descartadas: {len(dados) - len(mantidas)}")
    for motivo, total in motivos.most_common():
        print(f"  - {motivo}: {total}")
    for cargo, total in por_cargo.most_common(10):
        print(f"    {total:5d}  {cargo}")
    print(f"[ok] {args.out}")

    if args.relatorio:
        args.relatorio.write_text(
            json.dumps(
                {
                    "entrada": len(dados),
                    "mantidas": len(mantidas),
                    "motivos": dict(motivos),
                    "cargos_descartados": dict(por_cargo),
                },
                ensure_ascii=False,
                indent=1,
            ),
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
