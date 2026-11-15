#!/usr/bin/env python3
"""
Cliente do servidor MCP público da PCI Concursos.

O servidor é somente de consulta, não exige login e expõe cinco ferramentas
(listar_concursos, pesquisar_concursos, buscar_por_cargo, buscar_por_cidade e
pesquisar_provas). Os resultados de provas trazem o link da página no PCI, onde
o download dos PDFs é feito pelo navegador (o site usa verificação Turnstile).

Uso rápido:
    python3 parser/pci_mcp.py ferramentas
    python3 parser/pci_mcp.py provas "cesgranrio agente administrativo"
    python3 parser/pci_mcp.py concursos "INSS" --uf sp
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Optional

import requests

MCP_URL = "https://mcp.pciconcursos.com.br/mcp"
PROTOCOL_VERSION = "2025-06-18"
USER_AGENT = "concurso-questoes/1.0 (+https://github.com/brenneralt/Concursando)"

_session: Optional[requests.Session] = None
_session_id: Optional[str] = None
_initialized = False


class MCPError(RuntimeError):
    """Erro retornado pelo servidor MCP."""


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update(
            {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "User-Agent": USER_AGENT,
            }
        )
    return _session


def _decode_body(text: str) -> dict:
    """Aceita resposta JSON ou SSE (event: message / data: {...})."""
    text = text.strip()
    if not text:
        raise MCPError("resposta vazia do servidor MCP")
    if text[0] == "{":
        return json.loads(text)
    for line in text.splitlines():
        if line.startswith("data:"):
            return json.loads(line[5:].strip())
    raise MCPError(f"resposta não reconhecida do servidor MCP: {text[:200]!r}")


def _post(payload: dict, timeout: float = 30) -> dict:
    global _session_id
    headers = {}
    if _session_id:
        headers["Mcp-Session-Id"] = _session_id
    resp = _get_session().post(MCP_URL, json=payload, headers=headers, timeout=timeout)
    resp.raise_for_status()
    _session_id = resp.headers.get("Mcp-Session-Id") or _session_id
    return _decode_body(resp.text)


def _notificar(payload: dict, timeout: float = 30) -> None:
    """Envia uma notificação JSON-RPC (sem id); a resposta pode vir vazia."""
    global _session_id
    headers = {}
    if _session_id:
        headers["Mcp-Session-Id"] = _session_id
    resp = _get_session().post(MCP_URL, json=payload, headers=headers, timeout=timeout)
    resp.raise_for_status()
    _session_id = resp.headers.get("Mcp-Session-Id") or _session_id


def _rpc(method: str, params: Optional[dict] = None, timeout: float = 30) -> dict:
    data = _post(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
        timeout=timeout,
    )
    if "error" in data:
        erro = data["error"]
        raise MCPError(erro.get("message") or json.dumps(erro, ensure_ascii=False))
    return data.get("result", {})


def inicializar(timeout: float = 30) -> dict:
    """Handshake MCP (idempotente por processo)."""
    global _initialized
    if _initialized:
        return {}
    result = _rpc(
        "initialize",
        {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "concurso-questoes", "version": "1.0"},
        },
        timeout=timeout,
    )
    _initialized = True
    # Notificação obrigatória no protocolo; o servidor é stateless e a ignora
    # quando não há sessão, então falhas aqui não interrompem a consulta.
    try:
        _notificar({"jsonrpc": "2.0", "method": "notifications/initialized"}, timeout=timeout)
    except requests.RequestException:
        pass
    return result


def listar_ferramentas() -> list[dict]:
    """Lista as ferramentas expostas pelo servidor."""
    inicializar()
    return _rpc("tools/list").get("tools", [])


def chamar_ferramenta(nome: str, argumentos: Optional[dict] = None, timeout: float = 60) -> Any:
    """
    Chama uma ferramenta e devolve o payload já decodificado.
    O MCP devolve o conteúdo como texto JSON dentro de content[].text.
    """
    inicializar()
    resultado = _rpc(
        "tools/call",
        {"name": nome, "arguments": argumentos or {}},
        timeout=timeout,
    )
    if resultado.get("isError"):
        textos = [c.get("text", "") for c in resultado.get("content", [])]
        raise MCPError("; ".join(t for t in textos if t) or f"falha em {nome}")

    payloads: list[Any] = []
    for item in resultado.get("content", []):
        if item.get("type") != "text":
            continue
        texto = item.get("text", "")
        try:
            payloads.append(json.loads(texto))
        except json.JSONDecodeError:
            payloads.append(texto)
    if not payloads:
        return None
    return payloads[0] if len(payloads) == 1 else payloads


# ---------------------------------------------------------------------------
# Atalhos por ferramenta
# ---------------------------------------------------------------------------


def pesquisar_provas(termo: str, timeout: float = 60) -> dict:
    """Provas anteriores (prova + gabarito) por cargo, órgão, banca e/ou ano."""
    return chamar_ferramenta("pesquisar_provas", {"termo": termo}, timeout=timeout)


def pesquisar_concursos(termo: str, uf: Optional[str] = None, timeout: float = 60) -> dict:
    """Concursos com inscrições abertas ou prestes a abrir."""
    argumentos: dict[str, Any] = {"termo": termo}
    if uf:
        argumentos["uf"] = uf.lower()
    return chamar_ferramenta("pesquisar_concursos", argumentos, timeout=timeout)


def buscar_por_cargo(cargo: str, uf: Optional[str] = None, timeout: float = 60) -> dict:
    """Concursos abertos para um cargo."""
    argumentos: dict[str, Any] = {"cargo": cargo}
    if uf:
        argumentos["uf"] = uf.lower()
    return chamar_ferramenta("buscar_por_cargo", argumentos, timeout=timeout)


def buscar_por_cidade(uf: str, cidade: str, timeout: float = 60) -> dict:
    """Concursos abertos em uma cidade."""
    return chamar_ferramenta(
        "buscar_por_cidade", {"uf": uf.lower(), "cidade": cidade}, timeout=timeout
    )


def listar_concursos(
    regiao: Optional[str] = None, professores: bool = False, timeout: float = 60
) -> dict:
    """Lista geral de concursos abertos."""
    argumentos: dict[str, Any] = {"professores": professores}
    if regiao:
        argumentos["regiao"] = regiao.lower()
    return chamar_ferramenta("listar_concursos", argumentos, timeout=timeout)


# ---------------------------------------------------------------------------
# Execução direta (teste rápido no terminal)
# ---------------------------------------------------------------------------


def _main() -> int:
    parser = argparse.ArgumentParser(description="Cliente de teste do MCP da PCI Concursos.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("ferramentas", help="Lista as ferramentas do servidor.")

    p_provas = sub.add_parser("provas", help="Pesquisa provas anteriores.")
    p_provas.add_argument("termo", nargs="+")

    p_conc = sub.add_parser("concursos", help="Pesquisa concursos abertos.")
    p_conc.add_argument("termo", nargs="+")
    p_conc.add_argument("--uf")

    p_cargo = sub.add_parser("cargo", help="Concursos abertos para um cargo.")
    p_cargo.add_argument("cargo", nargs="+")
    p_cargo.add_argument("--uf")

    p_cidade = sub.add_parser("cidade", help="Concursos abertos em uma cidade.")
    p_cidade.add_argument("cidade", nargs="+")
    p_cidade.add_argument("--uf", required=True)

    args = parser.parse_args()

    if args.cmd == "ferramentas":
        for tool in listar_ferramentas():
            print(f"- {tool['name']}: {tool.get('description', '').splitlines()[0]}")
        return 0

    if args.cmd == "provas":
        payload = pesquisar_provas(" ".join(args.termo))
    elif args.cmd == "concursos":
        payload = pesquisar_concursos(" ".join(args.termo), args.uf)
    elif args.cmd == "cargo":
        payload = buscar_por_cargo(" ".join(args.cargo), args.uf)
    else:
        payload = buscar_por_cidade(args.uf, " ".join(args.cidade))

    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(_main())
    except (MCPError, requests.RequestException) as exc:
        print(f"[erro] {exc}", file=sys.stderr)
        sys.exit(1)
