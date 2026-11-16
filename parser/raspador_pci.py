#!/usr/bin/env python3
"""
Raspador das listas de provas do PCI Concursos (acesso direto ao site).

O MCP devolve no máximo 50 provas por consulta, mas a página de busca do PCI
lista o acervo inteiro em tabelas paginadas (`/provas/<termo>/<pagina>`).
Este script percorre essas páginas, extrai todos os itens e reutiliza as
funções de formatação de `buscar_provas.py` (tabela, JSON, CSV e painel HTML).

Apenas lista as páginas das provas: o download dos PDFs continua manual no
navegador (o PCI protege os arquivos com Cloudflare Turnstile).

Exemplos:
    python3 parser/raspador_pci.py "cesgranrio"
    python3 parser/raspador_pci.py "cesgranrio" --paginas 10
    python3 parser/raspador_pci.py "cesgranrio" --html painel_cesgranrio.html --abrir
    python3 parser/raspador_pci.py "cesgranrio agente administrativo" --csv provas.csv
"""

from __future__ import annotations

import argparse
import re
import sys
import time
import unicodedata
import webbrowser
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

import buscar_provas

BASE = "https://www.pciconcursos.com.br"
SESSAO = requests.Session()
SESSAO.headers.update(
    {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
        ),
        "Accept-Language": "pt-BR,pt;q=0.9",
    }
)


def slug_url(termo: str) -> str:
    """'Cesgranrio Agente Administrativo' -> 'cesgranrio-agente-administrativo'."""
    sem_acento = unicodedata.normalize("NFKD", termo)
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    limpo = re.sub(r"[^a-z0-9]+", "-", sem_acento.lower()).strip("-")
    return quote(limpo)


def buscar_html(url: str, tentativas: int = 3) -> Optional[BeautifulSoup]:
    for n in range(1, tentativas + 1):
        try:
            resp = SESSAO.get(url, timeout=30)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return BeautifulSoup(resp.text, "html.parser")
        except requests.RequestException as exc:
            if n == tentativas:
                print(f"[aviso] falha em {url}: {exc}", file=sys.stderr)
                return None
            time.sleep(1.5 * n)
    return None


def extrair_pagina(sopa: BeautifulSoup) -> list[dict[str, Any]]:
    """Lê a tabela #lista_provas e devolve os itens da página."""
    itens: list[dict[str, Any]] = []
    tabela = sopa.find("table", id="lista_provas")
    if not tabela:
        return itens
    for tr in tabela.find_all("tr", class_="lk_link"):
        link_tag = tr.find("a", class_="prova_download")
        if not link_tag or not link_tag.get("href"):
            continue
        link = link_tag["href"].strip()
        descricao = link_tag.get_text(" ", strip=True)
        tds = tr.find_all("td")
        ano = tds[1].get_text(" ", strip=True) if len(tds) > 1 else ""
        orgao = tds[2].get_text(" ", strip=True) if len(tds) > 2 else ""
        organizadora = tds[3].get_text(" ", strip=True) if len(tds) > 3 else ""
        itens.append(
            {
                "id": link.rstrip("/").rsplit("/", 1)[-1],
                "descricao": descricao,
                "orgao": orgao,
                "ano": int(ano) if ano.isdigit() else ano,
                "organizadora": organizadora,
                "link": link,
            }
        )
    return itens


def total_paginas(sopa: BeautifulSoup) -> int:
    """Maior número de página nos links de paginação (0 se não houver)."""
    maior = 0
    for a in sopa.find_all("a", class_="page-link"):
        m = re.search(r"/provas/[^/]+/(\d+)$", a.get("href", ""))
        if m:
            maior = max(maior, int(m.group(1)))
    return maior


def coletar(termo: str, max_paginas: Optional[int], pausa: float) -> dict[str, Any]:
    slug = slug_url(termo)
    url_base = f"{BASE}/provas/{slug}"

    primeira = buscar_html(url_base)
    if primeira is None:
        return {
            "meta": {"total": 0, "total_encontrado": 0, "link_pesquisa": url_base, "termo": termo},
            "data": [],
            "message": f'Nenhuma página de provas encontrada para "{termo}".',
        }

    dados: list[dict[str, Any]] = []
    vistos: set[str] = set()

    def acumular(itens: list[dict[str, Any]]) -> int:
        novos = 0
        for item in itens:
            if item["link"] in vistos:
                continue
            vistos.add(item["link"])
            dados.append(item)
            novos += 1
        return novos

    acumular(extrair_pagina(primeira))
    ultima = total_paginas(primeira)
    limite = max_paginas or ultima
    if ultima:
        print(f"[i] {len(dados)} provas na página 1 de {ultima} (limite atual: {limite}).")

    pagina = 2
    while pagina <= limite and ultima:
        url = f"{url_base}/{pagina}"
        sopa = buscar_html(url)
        if sopa is None:
            break
        antes = len(dados)
        acumular(extrair_pagina(sopa))
        if len(dados) == antes:
            # página vazia: chegamos ao fim
            break
        print(f"[i] página {pagina}/{limite}: {len(dados)} provas acumuladas.")
        time.sleep(pausa)
        pagina += 1

    meta = {
        "total": len(dados),
        "total_encontrado": len(dados),
        "data_atual": time.strftime("%Y-%m-%d"),
        "endpoint": "site",
        "parametros": {"termo": termo, "paginas_lidas": pagina - 1},
        "link_pesquisa": url_base,
    }
    return {"meta": meta, "data": dados}


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Lista todas as provas de um termo direto no site do PCI (contorna o limite de 50 do MCP)."
    )
    parser.add_argument("termo", nargs="+", help="Cargo, órgão, banca e/ou ano.")
    parser.add_argument("--paginas", type=int, help="Máximo de páginas a ler (padrão: todas).")
    parser.add_argument("--pausa", type=float, default=0.4, help="Pausa entre páginas, em segundos.")
    parser.add_argument("--top", type=int, help="Mostra apenas as N primeiras no terminal.")
    parser.add_argument("--json", dest="json_out", type=Path, help="Salva o resultado bruto em JSON.")
    parser.add_argument("--csv", dest="csv_out", type=Path, help="Salva os registros em CSV.")
    parser.add_argument("--html", dest="html_out", type=Path, help="Gera o painel HTML de download.")
    parser.add_argument("--pasta", type=Path, default=Path("data/raw_pdfs"),
                        help="Pasta de destino dos PDFs (padrão: data/raw_pdfs).")
    parser.add_argument("--abrir", action="store_true", help="Abre o painel HTML no navegador.")
    args = parser.parse_args(argv)

    termo = " ".join(args.termo)
    payload = coletar(termo, args.paginas, args.pausa)
    if args.top:
        payload["data"] = payload["data"][: args.top]
        payload["meta"]["total"] = min(payload["meta"]["total"], args.top)

    buscar_provas.mostrar_provas(payload)
    if args.json_out:
        buscar_provas.salvar_json(payload, args.json_out)
        print(f"\n[+] JSON salvo em {args.json_out}")
    if args.csv_out:
        registros = buscar_provas.registros_provas(payload)
        if registros:
            buscar_provas.salvar_csv(list(registros[0]), registros, args.csv_out)
            print(f"[+] CSV salvo em {args.csv_out}")
    if args.html_out or args.abrir:
        destino = args.html_out or Path("painel_provas.html")
        args.pasta.mkdir(parents=True, exist_ok=True)
        buscar_provas.gerar_html_painel(payload, termo, destino, args.pasta)
        print(f"[+] Painel HTML salvo em {destino.resolve()}")
        if args.abrir:
            webbrowser.open(destino.resolve().as_uri())
    if payload["data"]:
        print(f"\n[i] Salve os PDFs em: {args.pasta.resolve()}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n[interrompido]", file=sys.stderr)
        sys.exit(130)
