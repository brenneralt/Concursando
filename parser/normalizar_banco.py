#!/usr/bin/env python3
"""
Módulo de Normalização, Validação e Catalogação de Questões
Garante que todas as questões sigam o schema padrão, deduplica e sincroniza com web/public/questoes.json
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
    "id", "banca", "orgao", "cargo", "ano",
    "disciplina", "assunto", "modalidade",
    "enunciado", "alternativas", "gabarito"
]

def limpar_texto(texto: str) -> str:
    """Remove quebras desnecessárias de linha e espaços múltiplos."""
    if not isinstance(texto, str):
        return texto
    texto = re.sub(r'\r\n|\r', '\n', texto)
    texto = re.sub(r'[ \t]+', ' ', texto)
    texto = re.sub(r'\n{3,}', '\n\n', texto)
    return texto.strip()

def validar_questao(q: Dict[str, Any], index: int) -> Tuple[bool, List[str]]:
    erros = []
    for campo in REQUIRED_FIELDS:
        if campo not in q or q[campo] is None or q[campo] == "":
            erros.append(f"Questão #{index} (id: {q.get('id', 'SEM_ID')}): campo obrigatório ausente ou vazio: '{campo}'")
    
    # Validar alternativas
    alternativas = q.get("alternativas", [])
    if not isinstance(alternativas, list) or len(alternativas) < 2:
        erros.append(f"Questão {q.get('id')}: precisa ter pelo menos 2 alternativas.")
    else:
        ids_alt = [alt.get("id") for alt in alternativas if isinstance(alt, dict)]
        if q.get("gabarito") not in ids_alt:
            erros.append(f"Questão {q.get('id')}: gabarito '{q.get('gabarito')}' não está presente nas alternativas ({ids_alt}).")

    return len(erros) == 0, erros

def normalizar_banco(dry_run: bool = False, sync_web: bool = True) -> bool:
    if not DATA_FILE.exists():
        print(f"[-] Erro: Arquivo de dados não encontrado em {DATA_FILE}")
        return False

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            questoes = json.load(f)
        except json.JSONDecodeError as e:
            print(f"[-] Erro de sintaxe JSON em {DATA_FILE}: {e}")
            return False

    if not isinstance(questoes, list):
        print("[-] O banco de questões deve ser uma lista JSON.")
        return False

    print(f"[*] Analisando {len(questoes)} questões...")
    todos_erros = []
    ids_vistos = set()
    questoes_limpas = []

    for idx, q in enumerate(questoes, start=1):
        # Validação
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
        if "explicacao" in q_limpa and q_limpa["explicacao"]:
            q_limpa["explicacao"] = limpar_texto(q_limpa["explicacao"])
        
        if isinstance(q_limpa.get("alternativas"), list):
            for alt in q_limpa["alternativas"]:
                if isinstance(alt, dict) and "texto" in alt:
                    alt["texto"] = limpar_texto(alt["texto"])
        
        questoes_limpas.append(q_limpa)

    if todos_erros:
        print(f"[-] Encontrados {len(todos_erros)} erros de validação:")
        for err in todos_erros:
            print(f"   - {err}")
        return False

    # Estatísticas
    disciplinas = {}
    bancas = {}
    for q in questoes_limpas:
        disciplinas[q["disciplina"]] = disciplinas.get(q["disciplina"], 0) + 1
        bancas[q["banca"]] = bancas.get(q["banca"], 0) + 1

    print("\n[+] Validação 100% aprovada!")
    print("\n--- Estatísticas por Disciplina ---")
    for disc, count in sorted(disciplinas.items(), key=lambda x: x[1], reverse=True):
        print(f"  • {disc}: {count} questões")

    print("\n--- Estatísticas por Banca ---")
    for banca, count in sorted(bancas.items(), key=lambda x: x[1], reverse=True):
        print(f"  • {banca}: {count} questões")

    if not dry_run:
        # Salva formatado no data/questoes.json
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(questoes_limpas, f, ensure_ascii=False, indent=2)
        print(f"\n[+] Base atualizada e formatada em: {DATA_FILE}")

        # Sincroniza com frontend se solicitado
        if sync_web:
            WEB_PUBLIC_FILE.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(DATA_FILE, WEB_PUBLIC_FILE)
            print(f"[+] Sincronizado com o frontend em: {WEB_PUBLIC_FILE}")

    return True

if __name__ == "__main__":
    import sys
    dry_run = "--dry-run" in sys.argv
    normalizar_banco(dry_run=dry_run, sync_web=True)
