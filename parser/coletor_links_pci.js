/*
 * Coletor de links do PCI — roda na aba real do navegador.
 *
 * Por que não usa `fetch` para o receptor local: a página é HTTPS e o
 * navegador bloqueia requisições a http://127.0.0.1 (mixed content). Então o
 * coletor guarda os resultados em memória (`window.__pci.resultados`) e o
 * agente drena por `evaluate` e grava em `data/pci_links/link_<slug>.json`.
 *
 * Como funciona
 * -------------
 * Cada caderno é aberto num iframe e a página de download resolve o Cloudflare
 * Turnstile sozinha; quando termina, o próprio site escreve as URLs assinadas
 * nos links (`a.prova-pdf-link[data-acao="baixar"]`). Nada é contornado: o
 * endereço usado é o que o site entregou ao navegador do usuário.
 *
 * O iframe precisa ficar VISÍVEL (dentro da viewport): com o widget fora da
 * tela o Turnstile não renderiza e a página nunca libera os links.
 *
 * Uso no console da aba (ou via `browse evaluate`):
 *   __pciIniciar([{id: 'slug', link: 'https://www.pciconcursos.com.br/provas/download/slug'}])
 *   __pciEstado()      // contadores
 *   __pciDrenar()      // devolve e limpa os resultados prontos
 *   __pciParar()       // encerra os workers
 */
(() => {
  const padrao = { concorrencia: 4, tempoLimite: 60000, pausa: 400 };

  const estado = (window.__pci = window.__pci || {
    fila: [],
    resultados: [],
    rodando: false,
    processados: 0,
    ok: 0,
    vazios: 0,
    erros: 0,
    ativos: 0,
    concorrencia: padrao.concorrencia,
  });

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  async function processar(item, slot) {
    estado.ativos += 1;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.style.cssText = `position:fixed;left:${8 + (slot % 2) * 12}px;top:${
      8 + Math.floor(slot / 2) * 12
    }px;width:1000px;height:720px;border:2px solid #c00;z-index:${
      99990 + slot
    };background:#fff`;

    let resultado = null;
    try {
      iframe.src = item.link;
      document.body.appendChild(iframe);
      const fim = Date.now() + (item.tempoLimite || padrao.tempoLimite);
      while (Date.now() < fim) {
        let doc = null;
        try {
          doc = iframe.contentDocument;
        } catch (_) {
          doc = null;
        }
        if (doc && doc.readyState !== 'loading') {
          const arquivos = [...doc.querySelectorAll('.prova-pdf-link[data-acao="baixar"]')]
            .map((a) => ({ arquivo: a.dataset.arquivo || '', href: a.href }))
            .filter((a) => a.arquivo && /^https?:/i.test(a.href));
          if (arquivos.length) {
            resultado = { id: item.id, ok: true, arquivos };
            break;
          }
        }
        await dormir(1500);
      }
    } catch (erro) {
      resultado = {
        id: item.id,
        ok: false,
        arquivos: [],
        motivo: String(erro).slice(0, 140),
      };
    } finally {
      iframe.remove();
    }

    if (!resultado) {
      resultado = {
        id: item.id,
        ok: false,
        arquivos: [],
        motivo: 'sem link liberado dentro do tempo limite',
      };
    }
    estado.resultados.push(resultado);
    estado.processados += 1;
    if (resultado.ok) estado.ok += 1;
    else if (/tempo limite/.test(resultado.motivo || '')) estado.vazios += 1;
    else estado.erros += 1;
    estado.ativos -= 1;
  }

  function trabalhador(slot) {
    (async () => {
      while (estado.rodando) {
        const item = estado.fila.shift();
        if (!item) {
          await dormir(2000);
          continue;
        }
        await processar(item, slot);
        await dormir(padrao.pausa);
      }
    })();
  }

  window.__pciIniciar = (itens, opcoes = {}) => {
    const concorrencia = opcoes.concorrencia || padrao.concorrencia;
    if (Array.isArray(itens) && itens.length) estado.fila.push(...itens);
    if (!estado.rodando) {
      estado.rodando = true;
      estado.concorrencia = concorrencia;
      for (let i = 0; i < concorrencia; i += 1) trabalhador(i);
      return `coletor iniciado (${concorrencia} workers, ${estado.fila.length} na fila)`;
    }
    return `fila alimentada (${estado.fila.length} na fila)`;
  };

  window.__pciDrenar = () => estado.resultados.splice(0, estado.resultados.length);

  window.__pciParar = () => {
    estado.rodando = false;
    return 'parando depois dos cadernos atuais';
  };

  window.__pciEstado = () => ({
    rodando: estado.rodando,
    processados: estado.processados,
    ok: estado.ok,
    vazios: estado.vazios,
    erros: estado.erros,
    ativos: estado.ativos,
    naFila: estado.fila.length,
    prontos: estado.resultados.length,
  });

  return 'coletor instalado';
})();
