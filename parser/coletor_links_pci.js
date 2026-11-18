/*
 * Coletor de links do PCI — roda na aba real do navegador (extensão browse).
 *
 * Como usar
 * ---------
 * 1. Suba o receptor:      python3 parser/receptor_links.py
 * 2. Gere a fila:          python3 parser/fila_pci.py
 * 3. Abra qualquer página de https://www.pciconcursos.com.br (o domínio
 *    precisa ser o mesmo das páginas de download, para o iframe ser acessível).
 * 4. Injete este arquivo no console/`browse evaluate` e deixe rodar.
 *
 * O script abre a página de download de cada caderno num iframe
 * (`sandbox="allow-scripts allow-same-origin"`), espera o Cloudflare Turnstile
 * daquela página — que o navegador real resolve sozinho — e lê os links
 * assinados que o site libera. Nada é contornado: o link usado é o mesmo que
 * apareceria para o usuário. Cada caderno é enviado por `fetch` ao receptor
 * local, que grava `data/pci_links/link_<slug>.json`.
 *
 * Acompanhar o andamento (em outra injeção):
 *   JSON.stringify(window.__coletorPci.status())
 * Parar:
 *   window.__coletorPci.parar()
 */
(() => {
  if (window.__coletorPci && window.__coletorPci.rodando) {
    return 'já existe um coletor rodando';
  }

  const RECEPTOR = 'http://127.0.0.1:8765';
  const PAUSA_ENTRE_PAGINAS = 1200; // ms
  const ESPERA_LINKS = 45000; // ms por caderno
  const LOTE = 8; // cadernos pedidos por vez ao receptor

  const estado = {
    rodando: true,
    inicio: new Date().toISOString(),
    processados: 0,
    comLink: 0,
    vazios: 0,
    erros: 0,
    atual: null,
    ultimos: [],
  };

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  function anotar(mensagem) {
    const linha = `${new Date().toLocaleTimeString()} ${mensagem}`;
    estado.ultimos.unshift(linha);
    estado.ultimos = estado.ultimos.slice(0, 12);
  }

  async function pegarFila(limite) {
    const resposta = await fetch(`${RECEPTOR}/fila?limite=${limite}`, {
      cache: 'no-store',
    });
    if (!resposta.ok) throw new Error(`receptor respondeu ${resposta.status}`);
    const dados = await resposta.json();
    return dados.fila || [];
  }

  function enviar(payload) {
    return fetch(`${RECEPTOR}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
  }

  function nomeDoArquivo(ancora, href) {
    const atributo = ancora.getAttribute('download');
    if (atributo && /\.pdf$/i.test(atributo)) return atributo;
    const texto = (ancora.textContent || '').trim();
    if (/\.pdf$/i.test(texto)) return texto;
    const caminho = href.split('?')[0].split('#')[0].split('/').pop() || '';
    return decodeURIComponent(caminho) || 'arquivo.pdf';
  }

  function lerLinks(doc) {
    const vistos = new Set();
    const arquivos = [];
    doc
      .querySelectorAll('.prova-pdf-link[data-acao="baixar"]')
      .forEach((ancora) => {
        const href = ancora.href || ancora.getAttribute('href') || '';
        if (!/^https?:/i.test(href) || !/\.pdf(\?|#|$)/i.test(href)) return;
        if (vistos.has(href)) return;
        vistos.add(href);
        arquivos.push({ arquivo: nomeDoArquivo(ancora, href), href });
      });
    return arquivos;
  }

  function esperarCarregar(iframe, timeout) {
    return new Promise((resolve, reject) => {
      const limite = setTimeout(() => reject(new Error('timeout de carga')), timeout);
      iframe.addEventListener(
        'load',
        () => {
          clearTimeout(limite);
          resolve();
        },
        { once: true },
      );
    });
  }

  async function esperarLinks(iframe, timeout) {
    const fim = Date.now() + timeout;
    while (Date.now() < fim) {
      let doc = null;
      try {
        doc = iframe.contentDocument;
      } catch (_) {
        doc = null;
      }
      if (doc && doc.readyState !== 'loading') {
        const arquivos = lerLinks(doc);
        if (arquivos.length) return { arquivos, doc };
      }
      await dormir(800);
    }
    return { arquivos: [], doc: null };
  }

  async function processar(item) {
    estado.atual = item.id;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.style.cssText =
      'position:fixed;left:-9999px;width:900px;height:1200px;border:0;';
    iframe.src = item.link;

    try {
      const carregou = esperarCarregar(iframe, 30000);
      document.body.appendChild(iframe);
      await carregou;
      const { arquivos } = await esperarLinks(iframe, ESPERA_LINKS);
      if (arquivos.length) {
        await enviar({ id: item.id, ok: true, arquivos });
        estado.comLink += 1;
        anotar(`ok ${item.id} (${arquivos.length} arquivo(s))`);
      } else {
        await enviar({
          id: item.id,
          ok: false,
          arquivos: [],
          motivo: 'sem link liberado (Turnstile/página protegida)',
        });
        estado.vazios += 1;
        anotar(`vazio ${item.id}`);
      }
    } catch (erro) {
      estado.erros += 1;
      anotar(`erro ${item.id}: ${erro.message}`);
      await enviar({ id: item.id, ok: false, arquivos: [], motivo: erro.message });
    } finally {
      iframe.remove();
      estado.processados += 1;
      estado.atual = null;
    }
  }

  async function laco() {
    while (estado.rodando) {
      let fila = [];
      try {
        fila = await pegarFila(LOTE);
      } catch (erro) {
        anotar(`receptor fora do ar: ${erro.message}`);
        await dormir(15000);
        continue;
      }
      if (!fila.length) {
        anotar('fila vazia — encerrando');
        break;
      }
      for (const item of fila) {
        if (!estado.rodando) break;
        await processar(item);
        await dormir(PAUSA_ENTRE_PAGINAS);
      }
    }
    estado.rodando = false;
    anotar('fim');
    try {
      await fetch(`${RECEPTOR}/fim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
    } catch (_) {
      /* receptor já pode ter sido encerrado */
    }
  }

  window.__coletorPci = {
    status: () => ({ ...estado }),
    parar: () => {
      estado.rodando = false;
      return 'parando depois do caderno atual';
    },
  };

  laco();
  return 'coletor iniciado';
})();
