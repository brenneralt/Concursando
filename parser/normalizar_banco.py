#!/usr/bin/env python3
"""
Módulo de Normalização, Validação e Auditoria de Questões
Garante conformidade estrita com o SCHEMA OFICIAL DO OBJETO (questoes.json),
audita integridade, questões anuladas e sincroniza com web/public/questoes.json.
"""

import json
import re
import shutil
from pathlib import Path
from typing import List, Dict, Any, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT_DIR / "data" / "questoes.json"
WEB_PUBLIC_FILE = ROOT_DIR / "web" / "public" / "questoes.json"

REQUIRED_FIELDS = [
    "id", "banca", "ano", "orgao", "cargo",
    "nivel", "disciplina", "assunto",
    "enunciado", "alternativas", "anulada"
]

def limpar_texto(texto: str) -> str:
    """Sanitiza espaços e quebras redundantes sem perder formatação essencial."""
    if not isinstance(texto, str):
        return texto
    texto = re.sub(r'\r\n|\r', '\n', texto)
    texto = re.sub(r'[ \t]+', ' ', texto)
    texto = re.sub(r'\n{3,}', '\n\n', texto)
    return texto.strip()

def validar_questao(q: Dict[str, Any], index: int) -> Tuple[bool, List[str]]:
    erros = []
    for campo in REQUIRED_FIELDS:
        if campo not in q or q[campo] is None:
            erros.append(f"Questão #{index} ({q.get('id', 'SEM_ID')}): campo obrigatório ausente: '{campo}'")

    # Validar alternativas (dict)
    alts = q.get("alternativas")
    if not isinstance(alts, dict):
        erros.append(f"Questão {q.get('id')}: 'alternativas' deve ser um dicionário/objeto com chaves (ex: A, B, C, D, E).")
    else:
        if len(alts) < 2:
            erros.append(f"Questão {q.get('id')}: possui menos de 2 alternativas.")

    # Validar gabarito
    gabarito = q.get("gabarito")
    anulada = q.get("anulada", False)
    if not anulada and gabarito is not None:
        if isinstance(alts, dict) and gabarito not in alts:
            erros.append(f"Questão {q.get('id')}: gabarito '{gabarito}' não é uma alternativa válida ({list(alts.keys())}).")

    return len(erros) == 0, erros

def normalizar_e_auditar(dry_run: bool = False, sync_web: bool = True) -> bool:
    if not DATA_FILE.exists():
        print(f"[-] Erro: Arquivo {DATA_FILE} não encontrado.")
        return False

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            questoes = json.load(f)
        except json.JSONDecodeError as e:
            print(f"[-] Erro de sintaxe JSON: {e}")
            return False

    if not isinstance(questoes, list):
        print("[-] Erro: O banco de questões deve ser uma lista JSON.")
        return False

    print(f"==================================================")
    print(f"   AUDITORIA E VALIDAÇÃO DE BASE: {len(questoes)} QUESTÕES")
    print(f"==================================================")

    todos_erros = []
    ids_vistos = set()
    questoes_limpas = []

    # Estatísticas de Auditoria
    stats = {
        "total": len(questoes),
        "com_gabarito": 0,
        "sem_gabarito": 0,
        "anuladas": 0,
        "por_banca": {},
        "por_ano": {},
        "por_cargo": {},
        "por_nivel": {},
        "por_disciplina": {},
        "por_assunto": {}
    }

    for idx, q in enumerate(questoes, start=1):
        valido, erros = validar_questao(q, idx)
        if not valido:
            todos_erros.extend(erros)

        qid = q.get("id")
        if qid in ids_vistos:
            todos_erros.append(f"ID duplicado detectado: {qid}")
        ids_vistos.add(qid)

        # Limpeza
        q_limpa = dict(q)
        q_limpa["enunciado"] = limpar_texto(q.get("enunciado", ""))
        if isinstance(q_limpa.get("alternativas"), dict):
            q_limpa["alternativas"] = {
                k: limpar_texto(v) for k, v in q_limpa["alternativas"].items()
            }

        # Contagem
        if q_limpa.get("anulada"):
            stats["anuladas"] += 1
        elif q_limpa.get("gabarito"):
            stats["com_gabarito"] += 1
        else:
            stats["sem_gabarito"] += 1

        b = q_limpa.get("banca", "Outra")
        stats["por_banca"][b] = stats["por_banca"].get(b, 0) + 1

        ano = q_limpa.get("ano", 0)
        stats["por_ano"][ano] = stats["por_ano"].get(ano, 0) + 1

        c = q_limpa.get("cargo", "Outro")
        stats["por_cargo"][c] = stats["por_cargo"].get(c, 0) + 1

        niv = q_limpa.get("nivel", "Outro")
        stats["por_nivel"][niv] = stats["por_nivel"].get(niv, 0) + 1

        d = q_limpa.get("disciplina", "Outra")
        stats["por_disciplina"][d] = stats["por_disciplina"].get(d, 0) + 1

        ass = q_limpa.get("assunto", "Outro")
        stats["por_assunto"][ass] = stats["por_assunto"].get(ass, 0) + 1

        questoes_limpas.append(q_limpa)

    if todos_erros:
        print(f"[-] Foram detectados {len(todos_erros)} erros de validação no banco:")
        for err in todos_erros[:20]:
            print(f"   • {err}")
        if len(todos_erros) > 20:
            print(f"   ... e mais {len(todos_erros) - 20} erros.")
        return False

    print("\n[+] Integridade dos Dados: 100% VÁLIDA (Zero erros de schema / Zero IDs duplicados)")
    print(f"[+] Total de Questões: {stats['total']}")
    print(f"    - Gabaritadas e Ativas: {stats['com_gabarito']} ({stats['com_gabarito']/stats['total']*100:.1f}%)")
    print(f"    - Anuladas Oficialmente: {stats['anuladas']} ({stats['anuladas']/stats['total']*100:.1f}%)")
    print(f"    - Sem Gabarito Pareado: {stats['sem_gabarito']} ({stats['sem_gabarito']/stats['total']*100:.1f}%)")

    print("\n📌 Distribuição por Cargo (Escopo Alvo Administrativo):")
    for c, count in sorted(stats["por_cargo"].items(), key=lambda x: x[1], reverse=True):
        print(f"   • {c}: {count} questões")

    print("\n📌 Distribuição por Nível:")
    for n, count in sorted(stats["por_nivel"].items(), key=lambda x: x[1], reverse=True):
        print(f"   • {n}: {count} questões")

    print("\n📌 Distribuição por Disciplina:")
    for d, count in sorted(stats["por_disciplina"].items(), key=lambda x: x[1], reverse=True):
        print(f"   • {d}: {count} questões")

    print("\n📌 Amostra dos Principais Assuntos Classificados:")
    for ass, count in sorted(stats["por_assunto"].items(), key=lambda x: x[1], reverse=True)[:8]:
        print(f"   • {ass}: {count} questões")

    if not dry_run:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(questoes_limpas, f, ensure_ascii=False, indent=2)
        print(f"\n[+] Base atualizada e formatada em: {DATA_FILE}")

        if sync_web:
            WEB_PUBLIC_FILE.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(DATA_FILE, WEB_PUBLIC_FILE)
            print(f"[+] Base sincronizada com o frontend em: {WEB_PUBLIC_FILE}")

    return True

if __name__ == "__main__":
    import sys
    dry_run = "--dry-run" in sys.argv
    normalizar_e_auditar(dry_run=dry_run, sync_web=True)
