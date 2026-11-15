#!/usr/bin/env python3
"""
Busca provas e concursos no MCP público da PCI Concursos.

O MCP não entrega PDFs: entrega o link da página da prova, onde o download é
feito pelo navegador (o PCI usa verificação Turnstile). Por isso este CLI tem
dois papéis:

1. Consultar e listar (terminal, JSON, CSV).
2. Gerar um painel HTML com os links e os nomes de arquivo sugeridos, para
   baixar as provas/gabaritos e depois rodar o parser.

Exemplos:
    python3 parser/buscar_provas.py provas "cesgranrio agente administrativo"
    python3 parser/buscar_provas.py provas "cesgranrio" --html painel.html --abrir
    python3 parser/buscar_provas.py concursos "INSS" --uf sp
    python3 parser/buscar_provas.py cargo "agente administrativo" --uf pb
    python3 parser/buscar_provas.py cidade "Campina Grande" --uf pb
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import unicodedata
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional

import requests

import pci_mcp

PASTA_PADRAO = Path("data/raw_pdfs")
COMANDO_PARSER = (
    'python3 parser/extrair_questoes.py --dir "data/raw_pdfs" '
    "--out data/questoes.json --report data/relatorio_parser.json --verbose"
)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------


def slug(texto: Any) -> str:
    """Converte texto livre em um nome de arquivo seguro, sem acentos."""
    sem_acento = unicodedata.normalize("NFKD", str(texto or ""))
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    limpo = re.sub(r"[^A-Za-z0-9]+", "_", sem_acento).strip("_").lower()
    return limpo or "prova"


def data_br(iso: Optional[str]) -> str:
    """2026-11-17 -> 17/11/2026"""
    if not iso:
        return "—"
    try:
        return datetime.strptime(iso[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return iso


def situacao(datas: dict) -> str:
    if not datas:
        return "—"
    if datas.get("aberto"):
        dias = datas.get("dias_ate_fim")
        if dias == 0:
            return "último dia"
        if isinstance(dias, int):
            return f"aberto até {data_br(datas.get('fim'))} ({dias} dias)"
        return f"aberto até {data_br(datas.get('fim'))}"
    if datas.get("em_breve"):
        dias = datas.get("dias_ate_inicio")
        if isinstance(dias, int):
            return f"abre em {data_br(datas.get('inicio'))} ({dias} dias)"
        return f"abre em {data_br(datas.get('inicio'))}"
    return "—"


def limitar(payload: dict, limite: Optional[int]) -> dict:
    if not limite or limite <= 0:
        return payload
    payload = dict(payload)
    payload["data"] = (payload.get("data") or [])[:limite]
    return payload


def imprimir_tabela(headers: list[str], linhas: Iterable[list[Any]]) -> None:
    linhas = [[str(c) for c in linha] for linha in linhas]
    larguras = [len(h) for h in headers]
    for linha in linhas:
        for i, celula in enumerate(linha):
            larguras[i] = max(larguras[i], len(celula))
    formato = "  ".join(f"{{:<{w}}}" for w in larguras)
    print(formato.format(*headers))
    print(formato.format(*["-" * w for w in larguras]))
    for linha in linhas:
        print(formato.format(*linha))


def salvar_json(payload: Any, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def salvar_csv(cabecalhos: list[str], registros: list[dict], destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", encoding="utf-8-sig", newline="") as arq:
        writer = csv.DictWriter(arq, fieldnames=cabecalhos)
        writer.writeheader()
        writer.writerows(registros)


# ---------------------------------------------------------------------------
# Provas
# ---------------------------------------------------------------------------


def registros_provas(payload: dict) -> list[dict]:
    registros = []
    for item in payload.get("data") or []:
        base = "_".join(
            parte
            for parte in (
                slug(item.get("organizadora")),
                slug(item.get("ano")),
                slug(item.get("orgao")),
                slug(item.get("descricao")),
            )
            if parte
        )
        registros.append(
            {
                "id": item.get("id", ""),
                "ano": item.get("ano", ""),
                "orgao": item.get("orgao", ""),
                "cargo": item.get("descricao", ""),
                "banca": item.get("organizadora", ""),
                "pagina": item.get("link", ""),
                "arquivo_prova": f"{base}_prova.pdf",
                "arquivo_gabarito": f"{base}_gabarito.pdf",
            }
        )
    return registros


def mostrar_provas(payload: dict) -> None:
    meta = payload.get("meta", {})
    total = meta.get("total", 0)
    encontrado = meta.get("total_encontrado", total)
    exibindo = len(payload.get("data") or [])
    if exibindo < total:
        print(f"\nProvas encontradas: {total} (exibindo {exibindo}) de {encontrado} no acervo.")
    else:
        print(f"\nProvas encontradas: {total} de {encontrado} no acervo.")
    if meta.get("link_pesquisa"):
        print(f"Lista completa no PCI: {meta['link_pesquisa']}")
    if not total:
        print(payload.get("message") or "Nenhum resultado.")
        return
    print()
    imprimir_tabela(
        ["#", "ANO", "ÓRGÃO", "CARGO", "BANCA"],
        [
            [i, r["ano"], r["orgao"], r["cargo"], r["banca"]]
            for i, r in enumerate(registros_provas(payload), start=1)
        ],
    )
    print("\nPáginas para download:")
    for i, r in enumerate(registros_provas(payload), start=1):
        print(f"  {i:>2}. {r['pagina']}")


def gerar_html_painel(payload: dict, termo: str, destino: Path, pasta: Path) -> None:
    registros = registros_provas(payload)
    meta = payload.get("meta", {})
    linhas = []
    for i, r in enumerate(registros, start=1):
        linhas.append(
            f"""
      <tr>
        <td class="num">{i}</td>
        <td>{html.escape(str(r['ano']))}</td>
        <td>{html.escape(r['orgao'])}</td>
        <td>{html.escape(r['cargo'])}</td>
        <td>{html.escape(r['banca'])}</td>
        <td><code>{html.escape(r['arquivo_prova'])}</code><br>
            <code>{html.escape(r['arquivo_gabarito'])}</code></td>
        <td><a class="btn" href="{html.escape(r['pagina'])}" target="_blank"
               rel="noreferrer noopener">Abrir no PCI</a></td>
      </tr>"""
        )

    gerado = datetime.now().strftime("%d/%m/%Y %H:%M")
    link_pesquisa = meta.get("link_pesquisa") or ""
    total = meta.get("total", len(registros))
    encontrado = meta.get("total_encontrado", total)
    mais = ""
    if link_pesquisa:
        mais = (
            f'<p class="meta">O site tem <strong>{encontrado}</strong> resultados; '
            f'o MCP devolve os <strong>{total}</strong> primeiros. '
            f'<a href="{html.escape(link_pesquisa)}" target="_blank" rel="noreferrer noopener">'
            "ver a lista completa no PCI</a>.</p>"
        )

    pagina = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PCI Concursos — provas encontradas</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: #f1f5f9; color: #0f172a;
         font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }}
  header {{ background: #0f172a; color: #f8fafc; padding: 28px 24px; }}
  header h1 {{ margin: 0 0 6px; font-size: 22px; }}
  header p {{ margin: 0; color: #cbd5e1; }}
  main {{ max-width: 1180px; margin: 0 auto; padding: 24px; }}
  .card {{ background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
           padding: 20px 22px; margin-bottom: 20px; box-shadow: 0 1px 2px rgba(15,23,42,.05); }}
  .card h2 {{ margin: 0 0 10px; font-size: 16px; }}
  ol {{ margin: 8px 0 0 20px; padding: 0; }}
  li {{ margin-bottom: 6px; }}
  code, pre {{ background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px;
               padding: 1px 5px; font-size: 13px; }}
  pre {{ padding: 12px 14px; overflow-x: auto; }}
  table {{ width: 100%; border-collapse: collapse; background: #fff; }}
  th, td {{ padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left;
            vertical-align: top; }}
  th {{ background: #f8fafc; font-size: 12px; text-transform: uppercase;
        letter-spacing: .04em; color: #475569; }}
  tr:hover td {{ background: #f8fafc; }}
  td.num {{ color: #64748b; }}
  .btn {{ display: inline-block; background: #0284c7; color: #fff; text-decoration: none;
          padding: 6px 12px; border-radius: 8px; font-weight: 600; font-size: 13px;
          white-space: nowrap; }}
  .btn:hover {{ background: #0369a1; }}
  .meta {{ color: #475569; margin: 6px 0 0; }}
  .aviso {{ border-left: 4px solid #f59e0b; background: #fffbeb; padding: 12px 16px;
            border-radius: 8px; color: #78350f; }}
  .contador {{ display: inline-block; background: #e0f2fe; color: #075985;
               padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: 13px; }}
  footer {{ text-align: center; color: #64748b; font-size: 12px; padding: 8px 0 32px; }}
</style>
</head>
<body>
<header>
  <h1>PCI Concursos — provas encontradas</h1>
  <p>Busca: <strong>{html.escape(termo)}</strong> · gerado em {gerado}</p>
</header>
<main>
  <div class="card">
    <h2>Como baixar e importar</h2>
    <ol>
      <li>Clique em <strong>Abrir no PCI</strong>, conclua a verificação de segurança do site
          e baixe <strong>a prova</strong> e <strong>o gabarito</strong>.</li>
      <li>Salve os dois PDFs em <code>{html.escape(str(pasta.resolve()))}</code>
          usando os nomes sugeridos na tabela (o nome do gabarito precisa conter
          <code>gabarito</code>).</li>
      <li>Depois de baixar tudo, rode o parser:
        <pre id="cmd">{html.escape(COMANDO_PARSER)}</pre>
        <button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('cmd').innerText)">Copiar comando</button>
      </li>
    </ol>
    <p class="meta" style="margin-top:12px">O MCP do PCI só devolve o link da página;
    o download em si é feito pelo navegador (o site usa Turnstile).</p>
  </div>

  <div class="card">
    <h2>Resultados <span class="contador">{total}</span></h2>
    {mais}
    <table>
      <thead>
        <tr><th>#</th><th>Ano</th><th>Órgão</th><th>Cargo</th><th>Banca</th>
            <th>Nomes sugeridos</th><th>Download</th></tr>
      </thead>
      <tbody>{''.join(linhas) if linhas else '<tr><td colspan="7">Nenhum resultado.</td></tr>'}
      </tbody>
    </table>
  </div>
  <p class="aviso"><strong>Atenção:</strong> o parser atual foi calibrado para
  IGECAP/CONTEMAX. Provas de outras bancas (como a Cesgranrio) podem exigir
  ajustes em <code>parse_sections()</code>, <code>read_gabarito_meta()</code> e
  <code>infer_banca()</code> antes de gerar o banco final.</p>
</main>
<footer>Gerado por <code>parser/buscar_provas.py</code> — dados públicos da PCI Concursos.</footer>
</body>
</html>
"""
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(pagina, encoding="utf-8")


# ---------------------------------------------------------------------------
# Concursos
# ---------------------------------------------------------------------------


def mostrar_concursos(payload: dict) -> None:
    meta = payload.get("meta", {})
    total = meta.get("total", 0)
    exibindo = len(payload.get("data") or [])
    if exibindo < total:
        print(f"\nConcursos encontrados: {total} (exibindo {exibindo}).")
    else:
        print(f"\nConcursos encontrados: {total}.")
    if meta.get("link_lista"):
        print(f"Lista completa no PCI: {meta['link_lista']}")
    if not total:
        print(payload.get("message") or "Nenhum resultado.")
        return
    print()
    imprimir_tabela(
        ["#", "CONCURSO", "UF", "VAGAS", "INSCRIÇÕES"],
        [
            [
                i,
                item.get("titulo", ""),
                item.get("uf", ""),
                item.get("vagas_salario", ""),
                situacao(item.get("datas") or {}),
            ]
            for i, item in enumerate(payload.get("data") or [], start=1)
        ],
    )
    print("\nLinks:")
    for i, item in enumerate(payload.get("data") or [], start=1):
        link = (item.get("noticia") or {}).get("link", "")
        if link:
            print(f"  {i:>2}. {link}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _opcoes_saida(parser: argparse.ArgumentParser, provas: bool = False) -> None:
    parser.add_argument("--json", dest="json_out", type=Path, help="Salva o retorno bruto em JSON.")
    parser.add_argument("--csv", dest="csv_out", type=Path, help="Salva os registros em CSV.")
    parser.add_argument("--limite", type=int, help="Mostra apenas os N primeiros resultados.")
    if provas:
        parser.add_argument("--html", dest="html_out", type=Path, help="Gera o painel HTML de download.")
        parser.add_argument("--pasta", type=Path, default=PASTA_PADRAO,
                            help=f"Pasta de destino dos PDFs (padrão: {PASTA_PADRAO}).")
        parser.add_argument("--abrir", action="store_true", help="Abre o painel HTML no navegador.")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Consulta provas e concursos no MCP público da PCI Concursos."
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("ferramentas", help="Lista as ferramentas do MCP.")

    p_provas = sub.add_parser("provas", help="Pesquisa provas anteriores (prova + gabarito).")
    p_provas.add_argument("termo", nargs="+", help="Cargo, órgão, banca e/ou ano.")
    _opcoes_saida(p_provas, provas=True)

    p_conc = sub.add_parser("concursos", help="Pesquisa concursos abertos ou prestes a abrir.")
    p_conc.add_argument("termo", nargs="+")
    p_conc.add_argument("--uf", help="Sigla do estado (ex.: sp, pb).")
    _opcoes_saida(p_conc)

    p_cargo = sub.add_parser("cargo", help="Concursos abertos para um cargo.")
    p_cargo.add_argument("cargo", nargs="+")
    p_cargo.add_argument("--uf")
    _opcoes_saida(p_cargo)

    p_cidade = sub.add_parser("cidade", help="Concursos abertos em uma cidade.")
    p_cidade.add_argument("cidade", nargs="+")
    p_cidade.add_argument("--uf", required=True)
    _opcoes_saida(p_cidade)

    args = parser.parse_args(argv)

    if args.cmd == "ferramentas":
        for tool in pci_mcp.listar_ferramentas():
            descricao = (tool.get("description") or "").splitlines()[0]
            print(f"- {tool['name']}: {descricao}")
        return 0

    if args.cmd == "provas":
        termo = " ".join(args.termo)
        payload = limitar(pci_mcp.pesquisar_provas(termo), args.limite)
        mostrar_provas(payload)
        if args.json_out:
            salvar_json(payload, args.json_out)
            print(f"\n[+] JSON salvo em {args.json_out}")
        if args.csv_out:
            registros = registros_provas(payload)
            if registros:
                salvar_csv(list(registros[0]), registros, args.csv_out)
                print(f"[+] CSV salvo em {args.csv_out}")
        if args.html_out or args.abrir:
            destino = args.html_out or Path("painel_provas.html")
            args.pasta.mkdir(parents=True, exist_ok=True)
            gerar_html_painel(payload, termo, destino, args.pasta)
            print(f"[+] Painel HTML salvo em {destino.resolve()}")
            if args.abrir:
                webbrowser.open(destino.resolve().as_uri())
        if payload.get("data"):
            args.pasta.mkdir(parents=True, exist_ok=True)
            print(f"\n[i] Salve os PDFs em: {args.pasta.resolve()}")
        return 0

    if args.cmd == "concursos":
        termo = " ".join(args.termo)
        payload = limitar(pci_mcp.pesquisar_concursos(termo, args.uf), args.limite)
    elif args.cmd == "cargo":
        payload = limitar(pci_mcp.buscar_por_cargo(" ".join(args.cargo), args.uf), args.limite)
    else:
        payload = limitar(pci_mcp.buscar_por_cidade(args.uf, " ".join(args.cidade)), args.limite)

    mostrar_concursos(payload)
    if args.json_out:
        salvar_json(payload, args.json_out)
        print(f"\n[+] JSON salvo em {args.json_out}")
    if args.csv_out:
        registros = [
            {
                "id": item.get("id", ""),
                "titulo": item.get("titulo", ""),
                "uf": item.get("uf", ""),
                "orgao": item.get("orgao", ""),
                "vagas_salario": item.get("vagas_salario", ""),
                "situacao": situacao(item.get("datas") or {}),
                "link": (item.get("noticia") or {}).get("link", ""),
            }
            for item in payload.get("data") or []
        ]
        if registros:
            salvar_csv(list(registros[0]), registros, args.csv_out)
            print(f"[+] CSV salvo em {args.csv_out}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (pci_mcp.MCPError, OSError, requests.RequestException) as exc:
        print(f"[erro] {exc}", file=sys.stderr)
        sys.exit(1)
