#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Baixador MANUAL-ASSISTIDO de provas/gabaritos do PCI Concursos.

O PCI protege os PDFs com uma "Verificação de segurança" (Cloudflare Turnstile).
Este script NÃO contorna essa verificação e não baixa nada sozinho. Ele faz o
trabalho braçal ao redor:

  1. Abre a página da prova no SEU navegador;
  2. Você resolve a verificação e baixa "prova" e "gabarito" pelo site;
  3. Ao apertar Enter, o script encontra os PDFs recém-baixados na sua pasta
     de Downloads, identifica qual é a prova e qual é o gabarito
     (heurística: nome com "gabarito" = gabarito) e salva tudo em
     data/raw_pdfs/ com nome padronizado: <id-da-prova>_prova.pdf e
     <id-da-prova>_gabarito.pdf;
  4. Mantém um manifesto (data/raw_pdfs/manifest.json) com o status de cada
     prova: pendente | baixada | pulada | parcial.

Uso:
  python3 parser/baixar_provas.py --listar                  # status do acervo (todas)
  python3 parser/baixar_provas.py --faltando gabarito       # só o que está sem gabarito
  python3 parser/baixar_provas.py                           # modo interativo (todas)
  python3 parser/baixar_provas.py --orgao IBGE              # só um órgão
  python3 parser/baixar_provas.py --termo "agente" --ano 2009
  python3 parser/baixar_provas.py --importar <id> <prova.pdf> <gabarito.pdf>

Nada aqui pula a verificação de segurança: sem você resolver o Turnstile no
navegador, nenhum PDF é obtido.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import time
import webbrowser
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
JSON_PADRAO = BASE / "data" / "pci_cesgranrio.json"
DIR_PDFS = BASE / "data" / "raw_pdfs"
MANIFESTO = DIR_PDFS / "manifest.json"


# --------------------------------------------------------------------------- helpers
def carregar_provas(json_path: Path) -> list[dict]:
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    return payload.get("data", payload if isinstance(payload, list) else [])


def filtrar(provas: list[dict], orgao: str | None, termo: str | None) -> list[dict]:
    out = provas
    if orgao:
        out = [p for p in out if re.search(re.escape(orgao), p.get("orgao") or "", re.I)]
    if termo:
        alvo = re.compile(re.escape(termo), re.I)
        out = [p for p in out if alvo.search((p.get("descricao") or "") + " " + (p.get("orgao") or ""))]
    return out


def carregar_manifesto() -> dict:
    if MANIFESTO.exists():
        try:
            return json.loads(MANIFESTO.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def salvar_manifesto(man: dict) -> None:
    DIR_PDFS.mkdir(parents=True, exist_ok=True)
    MANIFESTO.write_text(json.dumps(man, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def status_de(man: dict, prova_id: str) -> str:
    return man.get(prova_id, {}).get("status", "pendente")


def marcar(man: dict, prova_id: str, status: str, extra: dict | None = None) -> None:
    man[prova_id] = {**man.get(prova_id, {}), "status": status, "atualizado_em": datetime.now().isoformat(timespec="seconds"), **(extra or {})}
    salvar_manifesto(man)


def pasta_downloads() -> Path:
    for candidato in (Path.home() / "Downloads", Path.home() / "downloads"):
        if candidato.is_dir():
            return candidato
    return Path.home()


def pdfs_recentes(pasta: Path, desde: float) -> list[Path]:
    margem = desde - 5  # 5s de tolerância
    try:
        return sorted(
            [p for p in pasta.glob("*.pdf") if p.is_file() and p.stat().st_mtime >= margem],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
    except Exception:
        return []


def identificar(pdfs: list[Path]) -> tuple[Path | None, Path | None]:
    """Retorna (prova, gabarito) dentre os PDFs baixados."""
    if not pdfs:
        return None, None
    gabarito = next((p for p in pdfs if "gabarito" in p.name.lower()), None)
    candidatos_prova = [p for p in pdfs if p is not gabarito]
    prova = candidatos_prova[0] if candidatos_prova else None
    return prova, gabarito


def destino(prova_id: str, tipo: str) -> Path:
    seguro = re.sub(r"[^A-Za-z0-9_.-]+", "-", prova_id).strip("-")
    return DIR_PDFS / f"{seguro}_{tipo}.pdf"


# --------------------------------------------------------------------------- ações
def importar(prova_id: str, prova_pdf: Path, gabarito_pdf: Path | None) -> int:
    DIR_PDFS.mkdir(parents=True, exist_ok=True)
    destino(prova_id, "prova").write_bytes(prova_pdf.read_bytes())
    if gabarito_pdf:
        destino(prova_id, "gabarito").write_bytes(gabarito_pdf.read_bytes())
        marcar(man := carregar_manifesto(), prova_id, "baixada", {"origem": "importado", "prova": str(prova_pdf), "gabarito": str(gabarito_pdf)})
        print(f"✔ {prova_id} importada (prova + gabarito) para {DIR_PDFS}")
    else:
        marcar(man := carregar_manifesto(), prova_id, "parcial", {"origem": "importado", "prova": str(prova_pdf), "gabarito": None})
        print(f"⚠ {prova_id}: só a prova foi importada. SEM GABARITO a questão não entra no banco.")
        print(f"  Rode de novo com os dois arquivos: --importar {prova_id} prova.pdf gabarito.pdf")
    return 0


def arquivos_no_banco(prova_id: str) -> tuple[bool, bool]:
    """(tem_prova, tem_gabarito) lendo o que realmente está em data/raw_pdfs/."""
    return destino(prova_id, "prova").exists(), destino(prova_id, "gabarito").exists()


def listar(provas: list[dict], man: dict) -> None:
    total = len(provas)
    completas = soma_prova = soma_gab = 0
    for p in provas:
        tem_prova, tem_gab = arquivos_no_banco(p["id"])
        soma_prova += tem_prova
        soma_gab += tem_gab
        if tem_prova and tem_gab:
            completas += 1
    print(f"Acervo filtrado: {total} provas")
    print(f"  prova no disco:    {soma_prova}")
    print(f"  gabarito no disco: {soma_gab}  ← sem gabarito a questão não entra no banco")
    print(f"  completas (prova+gabarito): {completas}\n")
    print("Legenda: [✔ prova] [✔ gabarito] | status no manifesto\n")
    for p in provas:
        tem_prova, tem_gab = arquivos_no_banco(p["id"])
        st = status_de(man, p["id"])
        marca = {"baixada": "✔", "pulada": "–", "parcial": "~"}.get(st, " ")
        print(
            f" [{marca}] {'P' if tem_prova else '·'}{'G' if tem_gab else '·'} | "
            f"{p.get('ano','?'):>4} | {p.get('orgao','?'):<28} | {(p.get('descricao') or '')[:50]:<50} | {p['id']}"
        )


def faltando(provas: list[dict], man: dict, o_que: str) -> int:
    """Lista provas com arquivo ausente no disco: 'prova', 'gabarito' ou 'ambos'."""
    faltam = []
    for p in provas:
        tem_prova, tem_gab = arquivos_no_banco(p["id"])
        if o_que == "prova" and not tem_prova:
            faltam.append(p)
        elif o_que == "gabarito" and tem_prova and not tem_gab:
            faltam.append(p)
        elif o_que == "ambos" and not (tem_prova and tem_gab):
            faltam.append(p)
    print(f"Provas sem {o_que}: {len(faltam)}")
    for p in faltam:
        print(f"  {p['id']}  ({p.get('orgao','?')} {p.get('ano','?')} — {p.get('descricao','')})")
    return 0


def modo_interativo(provas: list[dict], limite: int | None, downloads: Path) -> int:
    man = carregar_manifesto()
    pendentes = [p for p in provas if status_de(man, p["id"]) != "baixada"]
    if limite:
        pendentes = pendentes[:limite]

    if not pendentes:
        print("Nada pendente. 🎉")
        return 0

    print(f"{len(pendentes)} prova(s) pendentes. Pasta de downloads: {downloads}")
    print("Para cada prova: o navegador abrirá a página do PCI.")
    print("  → Resolva a verificação de segurança e baixe prova + gabarito;")
    print("  → Volte aqui e aperte ENTER (ou: p = pular, q = sair).\n")

    DIR_PDFS.mkdir(parents=True, exist_ok=True)

    for i, p in enumerate(pendentes, 1):
        prova_id = p["id"]
        link = p.get("link") or ""
        titulo = f"{p.get('descricao','')} — {p.get('orgao','')} ({p.get('ano','?')})"
        print(f"[{i}/{len(pendentes)}] {titulo}\n    id: {prova_id}\n    link: {link}")

        inicio = time.time()
        tem_prova, tem_gab = arquivos_no_banco(prova_id)
        if tem_prova and not tem_gab:
            print("    ↳ a prova já está salva; nesta rodada falta SÓ o gabarito.")
        elif tem_prova and tem_gab:
            print("    ↳ prova e gabarito já no banco.")
        if link:
            webbrowser.open(link)

        while True:
            resp = input("    ENTER = já baixei | p = pular | q = sair > ").strip().lower()
            if resp in ("q", "sair"):
                print("Saindo. Progresso salvo no manifesto.")
                return 0
            if resp in ("p", "pular"):
                marcar(man, prova_id, "pulada")
                break

            pdfs = pdfs_recentes(downloads, inicio)
            prova_pdf, gabarito_pdf = identificar(pdfs)

            if not prova_pdf and not gabarito_pdf:
                print("    ⚠ Nenhum PDF novo encontrado na pasta de downloads.")
                print("    (Os arquivos podem estar em outra pasta, ou o download ainda não terminou.)")
                print("    Aperte ENTER para tentar de novo, ou 'p' para pular esta.")
                continue

            extra = {}
            # Prova: baixada agora ou já salva em rodada anterior
            if prova_pdf:
                shutil.copy2(prova_pdf, destino(prova_id, "prova"))
                extra["origem_prova"] = prova_pdf.name
                print(f"    ✔ prova: {prova_pdf.name} → {destino(prova_id,'prova').name}")
            elif destino(prova_id, "prova").exists():
                print("    (prova já estava salva de uma rodada anterior)")
            else:
                print("    ⚠ Prova NÃO identificada entre os PDFs novos; nada salvo. Tente de novo.")
                continue

            # Gabarito: baixado agora, já salvo antes, ou ainda faltando
            if gabarito_pdf:
                shutil.copy2(gabarito_pdf, destino(prova_id, "gabarito"))
                extra["origem_gabarito"] = gabarito_pdf.name
                print(f"    ✔ gabarito: {gabarito_pdf.name} → {destino(prova_id,'gabarito').name}")
                marcar(man, prova_id, "baixada", extra)
            elif destino(prova_id, "gabarito").exists():
                print("    (gabarito já estava salvo de uma rodada anterior)")
                marcar(man, prova_id, "baixada", extra)
            else:
                print("    ⚠ GABARITO NÃO identificado. Sem ele a prova não entra no banco.")
                print("    Baixe o gabarito e complete com:")
                print(f"      python3 parser/baixar_provas.py --importar {prova_id} <prova.pdf> <gabarito.pdf>")
                marcar(man, prova_id, "parcial", extra)
            break

    print("\nConcluído. Veja o status com: python3 parser/baixar_provas.py --listar")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Baixador manual-assistido de provas PCI (não contorna a verificação de segurança).")
    ap.add_argument("--json", dest="json_path", type=Path, default=JSON_PADRAO, help="Acervo de provas (padrão: data/pci_cesgranrio.json)")
    ap.add_argument("--orgao", default=None, help="Filtro por órgão (padrão: todas as provas Cesgranrio; ex.: --orgao IBGE)")
    ap.add_argument("--termo", default=None, help="Filtro livre por descrição/órgão")
    ap.add_argument("--limite", type=int, default=None, help="Máximo de provas nesta sessão")
    ap.add_argument("--downloads", type=Path, default=None, help="Pasta de downloads (padrão: ~/Downloads)")
    ap.add_argument("--listar", action="store_true", help="Só lista o status do acervo filtrado")
    ap.add_argument("--faltando", choices=["prova", "gabarito", "ambos"], default=None,
                    help="Lista só o que está incompleto no disco (ex.: --faltando gabarito)")
    ap.add_argument("--importar", nargs="+", metavar="ARQ", help="--importar <id> <prova.pdf> [gabarito.pdf]")
    ap.add_argument("--ano", type=int, default=None, help="Filtra por ano (ex.: --ano 2009)")
    args = ap.parse_args(argv)

    if args.importar:
        if len(args.importar) < 2:
            ap.error("--importar exige <id> <prova.pdf> [gabarito.pdf]")
        prova_id, prova_pdf = args.importar[0], Path(args.importar[1])
        gabarito_pdf = Path(args.importar[2]) if len(args.importar) > 2 else None
        if not prova_pdf.exists():
            print(f"Arquivo não encontrado: {prova_pdf}", file=sys.stderr)
            return 2
        if gabarito_pdf and not gabarito_pdf.exists():
            print(f"Arquivo não encontrado: {gabarito_pdf}", file=sys.stderr)
            return 2
        return importar(prova_id, prova_pdf, gabarito_pdf)

    if not args.json_path.exists():
        print(f"Acervo não encontrado: {args.json_path}", file=sys.stderr)
        return 2

    provas = carregar_provas(args.json_path)
    provas = filtrar(provas, args.orgao or None, args.termo)
    if args.ano:
        provas = [p for p in provas if p.get("ano") == args.ano]

    man = carregar_manifesto()
    if args.listar:
        listar(provas, man)
        return 0
    if args.faltando:
        return faltando(provas, man, args.faltando)

    downloads = args.downloads or pasta_downloads()
    return modo_interativo(provas, args.limite, downloads)


if __name__ == "__main__":
    sys.exit(main())
