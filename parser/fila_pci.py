#!/usr/bin/env python3
"""Monta a fila de cadernos do PCI que ainda faltam baixar.

Lê a lista completa do raspador (`data/pci_cesgranrio.json`), cruza com o que
já está em `data/raw_pdfs/manifest.json` e aplica o recorte de escopo do
projeto (nível médio/fundamental, sem enfermagem/fiscal/serviços gerais).
O resultado fica em `data/pci_links/fila.json`, versionado, para que a coleta
sobreviva à limpeza de diretórios temporários.

Uso:
    python3 parser/fila_pci.py
    python3 parser/fila_pci.py --limite 200
    python3 parser/fila_pci.py --todos   # sem recorte de escopo
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOGO = ROOT / "data" / "pci_cesgranrio.json"
MANIFESTO = ROOT / "data" / "raw_pdfs" / "manifest.json"
PASTA_FILA = ROOT / "data" / "pci_links"

# mesmo recorte do parser (evita cargos de saúde/fiscal/serviços gerais)
EXCLUIR = (
    "enfermagem",
    "enfermeiro",
    "fiscal",
    "servicos gerais",
    "limpeza",
    "cozinha",
    "merendeira",
)


def norm(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", texto.lower())).strip()


def carregar_catalogo() -> list[dict]:
    dados = json.loads(CATALOGO.read_text(encoding="utf-8"))
    if isinstance(dados, dict):
        return dados.get("data") or []
    return dados


def baixados() -> set[str]:
    if not MANIFESTO.exists():
        return set()
    manifesto = json.loads(MANIFESTO.read_text(encoding="utf-8"))
    return set(manifesto)


def dentro_do_escopo(cargo: str) -> bool:
    chave = norm(cargo)
    if not chave:
        return False
    if any(norm(t) in chave for t in EXCLUIR):
        return False
    try:
        from filtrar_escopo import cargo_superior  # type: ignore

        if cargo_superior(cargo):
            return False
    except ImportError:  # execução fora da pasta parser
        pass
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--catalogo", type=Path, default=CATALOGO)
    ap.add_argument("--manifesto", type=Path, default=MANIFESTO)
    ap.add_argument("--out", type=Path, default=PASTA_FILA / "fila.json")
    ap.add_argument("--limite", type=int, default=0, help="Máximo de cadernos na fila")
    ap.add_argument("--todos", action="store_true", help="Não aplicar o recorte de escopo")
    args = ap.parse_args(argv)

    catalogo = carregar_catalogo()
    prontos = baixados()
    fila: list[dict] = []
    pulados = Counter()

    for item in catalogo:
        slug = item.get("id") or ""
        if not slug:
            continue
        if slug in prontos:
            pulados["ja baixado"] += 1
            continue
        cargo = item.get("descricao") or ""
        if not args.todos and not dentro_do_escopo(cargo):
            pulados["fora do escopo"] += 1
            continue
        fila.append(
            {
                "id": slug,
                "cargo": cargo,
                "orgao": item.get("orgao"),
                "ano": item.get("ano"),
                "link": item.get("link")
                or f"https://www.pciconcursos.com.br/provas/download/{slug}",
            }
        )

    fila.sort(key=lambda i: (-(i.get("ano") or 0), i["id"]))
    if args.limite:
        fila = fila[: args.limite]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(
            {
                "gerado_em": __import__("datetime").date.today().isoformat(),
                "total_catalogo": len(catalogo),
                "ja_baixados": len(prontos),
                "na_fila": len(fila),
                "pulados": dict(pulados),
                "fila": fila,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"[i] catálogo: {len(catalogo)} | já baixados: {len(prontos)}")
    for motivo, quantos in pulados.most_common():
        print(f"    - {motivo}: {quantos}")
    print(f"[ok] {len(fila)} cadernos na fila -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
