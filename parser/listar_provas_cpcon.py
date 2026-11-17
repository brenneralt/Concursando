#!/usr/bin/env python3
"""
Script de Extração e Listagem de Provas CPCON (2022-2026) - PCI Concursos
Gera lista com links diretos das páginas de download para cada prova e gabarito.
"""

import os
import re
import json
import urllib.request
from bs4 import BeautifulSoup

OUTPUT_DIR = os.path.expanduser("~/Downloads/Provas CPCON")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Palavras-chave para filtrar a área administrativa
KEYWORDS_ADMIN = [
    "agente administrativo",
    "assistente administrativo",
    "auxiliar administrativo",
    "assistente de administração",
    "auxiliar de administração",
    "técnico administrativo",
]

def extrair_provas_cpcon(apenas_administrativo=True, ano_min=2022, ano_max=2026):
    base_url = "https://www.pciconcursos.com.br/provas/cpcon"
    provas = []
    
    print(f"[*] Iniciando varredura na CPCON (PCI Concursos) - Anos {ano_min} a {ano_max}...")
    print(f"[*] Filtro Administrativo ativado: {apenas_administrativo}")

    for pagina in range(1, 20):
        url = f"{base_url}/{pagina}" if pagina > 1 else base_url
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            html = urllib.request.urlopen(req, timeout=10).read().decode("utf-8", errors="ignore")
        except Exception as e:
            print(f"[!] Fim das páginas ou erro na página {pagina}: {e}")
            break

        soup = BeautifulSoup(html, "html.parser")
        links = soup.find_all("a")
        achou_na_pagina = 0

        for a in links:
            href = a.get("href", "")
            if "/provas/download/" in href:
                achou_na_pagina += 1
                cargo = a.get_text().strip()
                
                # Extrai o ano do final do slug
                m_ano = re.search(r"-(202[2-6])(?:$|/)", href)
                if not m_ano:
                    continue
                
                ano = int(m_ano.group(1))
                if not (ano_min <= ano <= ano_max):
                    continue

                # Aplica filtro de cargo se solicitado
                cargo_lower = cargo.lower()
                if apenas_administrativo:
                    if not any(k in cargo_lower for k in KEYWORDS_ADMIN):
                        continue

                # Extrai slug da URL para identificar órgão/cidade
                slug = href.split("/provas/download/")[1]
                
                provas.append({
                    "ano": ano,
                    "cargo": cargo,
                    "slug": slug,
                    "url_download": href
                })

        if achou_na_pagina == 0:
            break

    print(f"\n[+] Total de provas mapeadas: {len(provas)}")
    
    # Salva lista em JSON para o subagente de download processar
    caminho_json = os.path.join(OUTPUT_DIR, "lista_provas_cpcon.json")
    with open(caminho_json, "w", encoding="utf-8") as f:
        json.dump(provas, f, indent=2, ensure_ascii=False)
    
    print(f"[+] Lista salva em: {caminho_json}")
    return provas

if __name__ == "__main__":
    import sys
    filtrar_admin = True
    if len(sys.argv) > 1 and sys.argv[1].lower() == "--todos":
        filtrar_admin = False
    
    extrair_provas_cpcon(apenas_administrativo=filtrar_admin)
