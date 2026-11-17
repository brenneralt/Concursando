#!/usr/bin/env python3
"""Mescla um JSON de questões extraídas ao banco principal, sem duplicar ids.

Uso:
    python3 parser/mesclar_questoes.py --novo /tmp/questoes_ibge.json
    python3 parser/mesclar_questoes.py --novo lote.json --base data/questoes.json --dry-run

Regras:
- ids já existentes na base são preservados (a base manda);
- questões com alternativa vazia ou enunciado muito curto são descartadas
  (normalmente são questões com figura/tabela que o PDF não entrega em texto);
- o resultado sai ordenado por banca, ano, orgao, cargo e id.

Depois de mesclar, rode `python3 parser/normalizar_banco.py` para auditar e
sincronizar `web/public/questoes.json`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_PADRAO = ROOT / "data" / "questoes.json"
MIN_ENUNCIADO = 40


def carregar(caminho: Path) -> list[dict]:
    dados = json.loads(caminho.read_text(encoding="utf-8"))
    if isinstance(dados, dict):
        dados = dados.get("data") or dados.get("questoes") or []
    if not isinstance(dados, list):
        raise SystemExit(f"[!] {caminho}: esperava uma lista de questões")
    return dados


def problema(questao: dict) -> str | None:
    """Devolve o motivo para descartar a questão, ou None se ela está ok."""
    alternativas = questao.get("alternativas") or {}
    if not isinstance(alternativas, dict) or len(alternativas) < 2:
        return "menos de 2 alternativas"
    vazias = [letra for letra, texto in alternativas.items() if not str(texto).strip()]
    if vazias:
        return f"alternativas vazias ({', '.join(sorted(vazias))})"
    enunciado = (questao.get("enunciado") or "").strip()
    if len(enunciado) < MIN_ENUNCIADO:
        return "enunciado muito curto"
    return None


def chave_ordenacao(q: dict) -> tuple:
    return (
        str(q.get("banca") or ""),
        int(q.get("ano") or 0),
        str(q.get("orgao") or ""),
        str(q.get("cargo") or ""),
        str(q.get("id") or ""),
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Mescla questões novas ao banco principal.")
    ap.add_argument("--novo", type=Path, required=True, help="JSON com as questões extraídas")
    ap.add_argument("--base", type=Path, default=BASE_PADRAO, help="Banco principal (padrão: data/questoes.json)")
    ap.add_argument("--dry-run", action="store_true", help="Só mostra o que aconteceria")
    args = ap.parse_args(argv)

    base = carregar(args.base) if args.base.exists() else []
    novas = carregar(args.novo)

    ids = {q.get("id") for q in base}
    aceitas: list[dict] = []
    descartadas: list[tuple[str, str]] = []
    repetidas = 0

    for questao in novas:
        qid = questao.get("id")
        if qid in ids:
            repetidas += 1
            continue
        motivo = problema(questao)
        if motivo:
            descartadas.append((str(qid), motivo))
            continue
        ids.add(qid)
        aceitas.append(questao)

    todas = sorted(base + aceitas, key=chave_ordenacao)
    print(f"base: {len(base)} | novas: {len(novas)} | aceitas: {len(aceitas)} "
          f"| descartadas: {len(descartadas)} | duplicadas: {repetidas}")
    for qid, motivo in descartadas:
        print(f"  [-] {qid}: {motivo}")

    if args.dry_run:
        print("[i] dry-run: nada foi gravado.")
        return 0

    args.base.parent.mkdir(parents=True, exist_ok=True)
    args.base.write_text(json.dumps(todas, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ok] {len(todas)} questões gravadas em {args.base}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
