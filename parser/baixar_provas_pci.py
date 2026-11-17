#!/usr/bin/env python3
"""
Baixa PDFs de provas do PCI Concursos a partir dos links já liberados.

Contexto
========
As páginas `/provas/download/<slug>` do PCI são protegidas por Cloudflare
Turnstile. Um navegador real resolve a verificação sozinho e libera URLs
assinadas (`/provas/<id>/<hash>/arquivo.pdf`). Este script **não contorna**
nenhuma verificação: ele apenas baixa as URLs que o navegador liberou.

Fluxo completo
--------------
1. (navegador) abrir cada página e coletar os links liberados num JSON:

       [{"id": "<slug>", "ok": true,
         "arquivos": [{"arquivo": "prova.pdf", "href": "https://..."}]}, ...]

2. baixar os PDFs e salvá-los prontos para `parser/extrair_questoes.py`:

       python3 parser/baixar_provas_pci.py --links data/links_pci_ibge.json

Os arquivos ficam em `data/raw_pdfs/<id>_prova.pdf` e
`data/raw_pdfs/<id>_gabarito.pdf` (vários arquivos do mesmo tipo ganham sufixo
`_2`, `_3`, ...). PDFs já existentes são preservados, a menos que se use
`--forcar`.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DEST_PADRAO = ROOT / "data" / "raw_pdfs"
MANIFESTO_PADRAO = ROOT / "data" / "raw_pdfs" / "manifest.json"

BASE_PCI = "https://www.pciconcursos.com.br/provas/download/"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
    )
}


def classificar(arquivos: list[dict]) -> tuple[list[dict], list[dict]]:
    """Separa arquivos em (provas, gabaritos).

    Regra: nome contendo "gab" é gabarito, exceto quando o nome começa por
    "prova" (casos de "prova_branca_gabarito1.pdf", que são o caderno).
    """
    provas: list[dict] = []
    gabaritos: list[dict] = []
    for arq in arquivos:
        nome = (arq.get("arquivo") or "").lower()
        if nome.startswith("prova") or "prova_" in nome and "gabarito" not in nome:
            provas.append(arq)
        elif "gab" in nome:
            gabaritos.append(arq)
        else:
            provas.append(arq)
    return provas, gabaritos


def nome_destino(dest: Path, prova_id: str, tipo: str, indice: int) -> Path:
    sufixo = "" if indice == 1 else f"_{indice}"
    return dest / f"{prova_id}_{tipo}{sufixo}.pdf"


def baixar(sessao: requests.Session, url: str, referencia: str, destino: Path) -> dict:
    resp = sessao.get(url, headers={"Referer": referencia}, timeout=120)
    resp.raise_for_status()
    if resp.content[:4] != b"%PDF":
        raise ValueError(f"conteúdo não é PDF (Content-Type={resp.headers.get('Content-Type')})")
    destino.write_bytes(resp.content)
    return {"arquivo": destino.name, "bytes": len(resp.content), "origem": url}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Baixa provas do PCI a partir de links liberados pelo navegador.")
    ap.add_argument("--links", type=Path, required=True, help="JSON com os links liberados")
    ap.add_argument("--dest", type=Path, default=DEST_PADRAO, help="Pasta de destino (padrão: data/raw_pdfs)")
    ap.add_argument("--manifesto", type=Path, default=MANIFESTO_PADRAO, help="Manifesto de downloads")
    ap.add_argument("--forcar", action="store_true", help="Baixa de novo mesmo se o PDF já existir")
    ap.add_argument("--pausa", type=float, default=1.0, help="Pausa entre páginas, em segundos")
    args = ap.parse_args(argv)

    itens = json.loads(args.links.read_text(encoding="utf-8"))
    if isinstance(itens, dict):
        itens = itens.get("data") or itens.get("provas") or []

    args.dest.mkdir(parents=True, exist_ok=True)
    sessao = requests.Session()
    sessao.headers.update(HEADERS)
    manifesto: dict = {}
    if args.manifesto.exists():
        try:
            manifesto = json.loads(args.manifesto.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifesto = {}

    totais = {"ok": 0, "pulados": 0, "falhas": 0, "sem_link": 0}
    for item in itens:
        prova_id = item.get("id") or item.get("slug")
        if not prova_id:
            continue
        if not item.get("ok", True):
            print(f"[!] {prova_id}: links não liberados pelo navegador")
            totais["sem_link"] += 1
            continue

        provas, gabaritos = classificar(item.get("arquivos") or [])
        if not provas:
            print(f"[!] {prova_id}: nenhum caderno de prova identificado")
        referencia = BASE_PCI + prova_id
        registro = manifesto.get(prova_id, {"prova": [], "gabarito": []})

        for tipo, lista in (("prova", provas), ("gabarito", gabaritos)):
            for i, arq in enumerate(lista, 1):
                destino = nome_destino(args.dest, prova_id, tipo, i)
                if destino.exists() and not args.forcar:
                    print(f"[=] {destino.name} (já existe)")
                    totais["pulados"] += 1
                    continue
                try:
                    info = baixar(sessao, arq["href"], referencia, destino)
                    registro.setdefault(tipo, []).append(info)
                    print(f"[+] {destino.name} ({info['bytes']} bytes)")
                    totais["ok"] += 1
                except Exception as erro:  # noqa: BLE001
                    print(f"[x] {prova_id} [{tipo}]: {erro}")
                    totais["falhas"] += 1
        manifesto[prova_id] = registro
        time.sleep(args.pausa)

    args.manifesto.write_text(json.dumps(manifesto, ensure_ascii=False, indent=1), encoding="utf-8")
    print(
        f"\nConcluído: {totais['ok']} baixados, {totais['pulados']} já existiam, "
        f"{totais['falhas']} falhas, {totais['sem_link']} sem link."
    )
    return 1 if totais["falhas"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
