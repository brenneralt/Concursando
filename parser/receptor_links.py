#!/usr/bin/env python3
"""Receptor local dos links liberados pelo PCI.

O navegador (aba real, com a extensão do browse) abre cada página de download
do PCI, espera o Cloudflare Turnstile daquela página e lê os links assinados
que o próprio site libera. Esses links são enviados por `fetch` para este
servidor, que grava um JSON por caderno em `data/pci_links/`.

Não há contorno de CAPTCHA: o script só transporta o link que o site entregou
ao navegador do usuário.

Uso:
    python3 parser/receptor_links.py            # porta 8765
    python3 parser/receptor_links.py --porta 9000

Endpoints:
    GET  /status          -> contadores (fila, coletados, faltando)
    GET  /fila?limite=50  -> próximos cadernos ainda sem link
    POST /link            -> grava um caderno {"id", "ok", "arquivos": [...]}
    POST /fim             -> apenas registra o encerramento do worker
"""

from __future__ import annotations

import argparse
import json
import re
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
PASTA = ROOT / "data" / "pci_links"
FILA = PASTA / "fila.json"
INDICE = PASTA / "coletados.json"

_lock = threading.Lock()


def slug_seguro(slug: str) -> str:
    limpo = re.sub(r"[^a-zA-Z0-9._-]+", "-", slug).strip("-")
    return limpo[:120] or "sem-id"


def ler_fila() -> list[dict]:
    if not FILA.exists():
        return []
    dados = json.loads(FILA.read_text(encoding="utf-8"))
    return dados.get("fila", dados) if isinstance(dados, dict) else dados


def coletados() -> set[str]:
    """Ids já coletados: o índice versionado + os arquivos link_*.json."""
    feitos: set[str] = set()
    if INDICE.exists():
        try:
            feitos |= set(json.loads(INDICE.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            pass
    if PASTA.exists():
        feitos |= {p.stem[len("link_") :] for p in PASTA.glob("link_*.json")}
    return feitos


def registrar_coletado(slug: str) -> None:
    """Guarda o id no índice (sem as URLs assinadas, que expiram)."""
    feitos = coletados()
    feitos.add(slug_seguro(slug))
    INDICE.write_text(
        json.dumps(sorted(feitos), ensure_ascii=False, indent=2), encoding="utf-8"
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "ReceptorLinksPCI/1.0"

    def log_message(self, formato: str, *args) -> None:  # silencia o log padrão
        if self.server.verbose:  # type: ignore[attr-defined]
            super().log_message(formato, *args)

    def _responder(self, codigo: int, corpo: dict) -> None:
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dados)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(dados)

    def do_OPTIONS(self) -> None:  # noqa: N802 (API do BaseHTTPRequestHandler)
        self._responder(204, {})

    def do_GET(self) -> None:  # noqa: N802
        rota = urlparse(self.path)
        if rota.path == "/status":
            fila = ler_fila()
            feitos = coletados()
            self._responder(
                200,
                {
                    "fila": len(fila),
                    "coletados": len(feitos),
                    "faltando": sum(1 for i in fila if i["id"] not in feitos),
                    "pasta": str(PASTA),
                },
            )
            return
        if rota.path == "/fila":
            limite = int(parse_qs(rota.query).get("limite", ["0"])[0] or 0)
            feitos = coletados()
            pendentes = [i for i in ler_fila() if i["id"] not in feitos]
            if limite:
                pendentes = pendentes[:limite]
            self._responder(200, {"total": len(pendentes), "fila": pendentes})
            return
        self._responder(404, {"erro": "rota desconhecida"})

    def do_POST(self) -> None:  # noqa: N802
        rota = urlparse(self.path)
        tamanho = int(self.headers.get("Content-Length") or 0)
        bruto = self.rfile.read(tamanho) if tamanho else b"{}"
        try:
            corpo = json.loads(bruto.decode("utf-8"))
        except json.JSONDecodeError:
            self._responder(400, {"erro": "JSON inválido"})
            return

        if rota.path == "/fim":
            print(f"[fim] worker encerrado em {datetime.now():%H:%M:%S}: {corpo}")
            self._responder(200, {"ok": True})
            return

        if rota.path != "/link":
            self._responder(404, {"erro": "rota desconhecida"})
            return

        slug = str(corpo.get("id") or "")
        if not slug:
            self._responder(400, {"erro": "id obrigatório"})
            return

        arquivos = [
            a for a in corpo.get("arquivos") or [] if a.get("href") and a.get("arquivo")
        ]
        registro = {
            "id": slug,
            "ok": bool(corpo.get("ok")) and bool(arquivos),
            "arquivos": [
                {"arquivo": slug_seguro(str(a["arquivo"])), "href": a["href"]}
                for a in arquivos
            ],
            "motivo": corpo.get("motivo"),
            "recebido_em": datetime.now().isoformat(timespec="seconds"),
        }

        PASTA.mkdir(parents=True, exist_ok=True)
        destino = PASTA / f"link_{slug_seguro(slug)}.json"
        with _lock:
            destino.write_text(
                json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            if registro["ok"]:
                registrar_coletado(slug)
        estado = "ok" if registro["ok"] else "vazio"
        print(f"[{estado}] {slug} ({len(registro['arquivos'])} arquivo(s))")
        self._responder(200, {"ok": True, "arquivo": destino.name})


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--porta", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)

    servidor = ThreadingHTTPServer((args.host, args.porta), Handler)
    servidor.verbose = args.verbose  # type: ignore[attr-defined]
    print(f"[i] receptor em http://{args.host}:{args.porta}")
    print(f"[i] gravando em {PASTA}")
    print(f"[i] fila: {len(ler_fila())} cadernos, {len(coletados())} já coletados")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n[i] encerrado")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
