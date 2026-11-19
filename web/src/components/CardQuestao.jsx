import React, { useState } from 'react';
import { Check, X, Star, AlertTriangle, CheckCircle2, RotateCcw, HelpCircle, Copy } from 'lucide-react';

export function CardQuestao({
  questao,
  indice,
  respostaUsuario,
  ehFavorito,
  onResponder,
  onLimparResposta,
  onAlternarFavorito
}) {
  const [selecaoTemporaria, setSelecaoTemporaria] = useState(respostaUsuario?.resposta || null);
  const [copiado, setCopiado] = useState(false);

  const jaRespondida = !!respostaUsuario;
  const acertou = respostaUsuario?.acertou;
  const ehAnulada = questao.anulada === true;
  const temGabarito = questao.gabarito !== null && questao.gabarito !== undefined;

  const handleConfirmarResposta = () => {
    if (!selecaoTemporaria || ehAnulada) return;
    onResponder(questao.id, selecaoTemporaria, questao.gabarito);
  };

  const handleLimpar = () => {
    setSelecaoTemporaria(null);
    onLimparResposta(questao.id);
  };

  // Converte objeto alternativas {'A': '...', 'B': '...'} em array ordenado
  const alternativasList = Object.entries(questao.alternativas || {}).sort(([a], [b]) => a.localeCompare(b));

  // O parser separa o texto de apoio do comando da questão por uma linha em
  // branco (o apoio não tem linhas vazias internas). Quando existe apoio, ele
  // é exibido em um bloco próprio e o restante vira o comando.
  const separador = String(questao.enunciado || '').indexOf('\n\n');
  const textoApoio = separador > 0 ? questao.enunciado.slice(0, separador) : null;
  const comando = separador > 0 ? questao.enunciado.slice(separador + 2) : questao.enunciado;

  // Monta um prompt pronto para colar em qualquer IA (ChatGPT, Claude, Gemini...).
  const montarPrompt = () => {
    const linhas = [
      'Quero a explicação de uma questão de concurso público.',
      `Banca: ${questao.banca || 'não informada'} | Ano: ${questao.ano || '?'} | Nível: ${questao.nivel || '?'}`,
      `Órgão: ${questao.orgao || 'não informado'} | Cargo: ${questao.cargo || 'não informado'}`,
      `Disciplina: ${questao.disciplina || 'não informada'} | Assunto: ${questao.assunto || 'não informado'}`,
      '',
      'ENUNCIADO:',
      String(questao.enunciado || ''),
      '',
      'ALTERNATIVAS:',
      ...alternativasList.map(([letra, textoAlt]) => `${letra}) ${textoAlt}`),
      '',
    ];
    if (ehAnulada) {
      linhas.push('Observação: esta questão foi ANULADA pela banca organizadora.');
    } else if (temGabarito) {
      linhas.push(`Gabarito oficial: ${questao.gabarito}.`);
    } else {
      linhas.push('Não há gabarito oficial disponível no acervo; por favor, resolva e indique a alternativa correta.');
    }
    if (respostaUsuario && !ehAnulada) {
      linhas.push(
        `Minha resposta: ${respostaUsuario.resposta} (${respostaUsuario.acertou ? 'acertei' : 'errei'}).`
      );
    }
    linhas.push(
      '',
      'Explique, em português, de forma didática: por que a alternativa correta está certa; por que cada uma das demais está errada; e qual é a matéria-chave da questão. Se houver norma, jurisprudência ou entendimento que mudou desde a publicação da prova, avise.'
    );
    return linhas.join('\n');
  };

  const handleCopiarPrompt = async () => {
    const texto = montarPrompt();
    let ok = false;
    try {
      await navigator.clipboard.writeText(texto);
      ok = true;
    } catch {
      // Fallback para navegadores/contextos sem a Clipboard API
      try {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    }
  };

  return (
    <article className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:border-slate-300 mb-5">
      {/* Cabeçalho de Metadados / Catalogação */}
      <div className="bg-slate-50/90 px-4 sm:px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-mono font-bold text-slate-800 bg-slate-200/90 px-2 py-0.5 rounded">
            #{indice}
          </span>
          <span className="font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded">
            {questao.disciplina}
          </span>
          <span className="font-medium text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
            {questao.assunto}
          </span>
          <span className="font-semibold text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded">
            {questao.banca} • {questao.ano}
          </span>
          <span className="text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded hidden sm:inline-block">
            {questao.cargo} ({questao.nivel})
          </span>
          {questao.orgao && (
            <span className="text-slate-500 hidden md:inline-block truncate max-w-xs" title={questao.orgao}>
              {questao.orgao}
            </span>
          )}
        </div>

        {/* Ações Topo: Anulada Badge, Copiar para IA & Favoritar */}
        <div className="flex items-center gap-2">
          {ehAnulada && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              ANULADA PELA BANCA
            </span>
          )}

          <button
            type="button"
            onClick={handleCopiarPrompt}
            className={`flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              copiado
                ? 'text-emerald-700 bg-emerald-50 border border-emerald-300'
                : 'text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100'
            }`}
            title="Copiar a questão com gabarito para pedir explicação a uma IA (ChatGPT, Claude, Gemini...)"
            aria-label="Copiar questão para explicar com IA"
          >
            {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span className="hidden sm:inline">{copiado ? 'Copiado!' : 'Copiar para IA'}</span>
          </button>

          <button
            onClick={() => onAlternarFavorito(questao.id)}
            className={`p-1.5 rounded-lg transition-colors ${
              ehFavorito
                ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100'
            }`}
            title={ehFavorito ? 'Remover dos favoritos' : 'Salvar questão'}
          >
            <Star className={`w-4 h-4 ${ehFavorito ? 'fill-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Corpo da Questão */}
      <div className="p-4 sm:p-6">
        {/* Identificador Oficial */}
        <div className="text-[11px] font-mono text-slate-400 mb-2 select-all">
          ID: {questao.id}
        </div>

        {/* Texto de apoio (quando a questão depende de um trecho/tabela/imagem) */}
        {textoApoio && (
          <details open className="mb-4 rounded-lg border border-slate-200 bg-slate-50/70">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800">
              Texto de apoio
            </summary>
            <div className="px-4 pb-3 pt-1 text-slate-800 whitespace-pre-line leading-relaxed text-sm sm:text-base">
              {textoApoio}
            </div>
          </details>
        )}

        {/* Enunciado */}
        <div className="text-slate-900 text-sm sm:text-base leading-relaxed mb-6 whitespace-pre-line font-normal">
          {comando}
        </div>

        {/* Alternativas */}
        <div className="space-y-2.5 mb-6">
          {alternativasList.map(([letra, textoAlt]) => {
            const isSelected = (jaRespondida ? respostaUsuario.resposta : selecaoTemporaria) === letra;
            const isGabarito = questao.gabarito === letra;

            let estiloContainer = 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60';
            let estiloBadge = 'bg-slate-100 text-slate-700 border-slate-300';

            if (ehAnulada) {
              estiloContainer = 'border-amber-200 bg-amber-50/30 text-slate-700';
              estiloBadge = 'bg-amber-100 text-amber-800 border-amber-300';
            } else if (jaRespondida) {
              if (isGabarito) {
                estiloContainer = 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-medium';
                estiloBadge = 'bg-emerald-600 text-white border-emerald-600';
              } else if (isSelected && !acertou) {
                estiloContainer = 'border-rose-400 bg-rose-50/70 text-rose-950';
                estiloBadge = 'bg-rose-600 text-white border-rose-600';
              } else {
                estiloContainer = 'border-slate-100 opacity-60';
              }
            } else if (isSelected) {
              estiloContainer = 'border-sky-500 bg-sky-50/70 text-sky-950 ring-1 ring-sky-500 font-medium';
              estiloBadge = 'bg-sky-600 text-white border-sky-600';
            }

            return (
              <label
                key={letra}
                onClick={() => {
                  if (!jaRespondida && !ehAnulada) setSelecaoTemporaria(letra);
                }}
                className={`flex items-start gap-3 p-3 sm:p-3.5 rounded-lg border text-xs sm:text-sm ${
                  ehAnulada ? 'cursor-default' : 'cursor-pointer'
                } transition-all ${estiloContainer}`}
              >
                <div className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center font-bold text-xs mt-0.5 ${estiloBadge}`}>
                  {letra}
                </div>
                <div className="flex-1 leading-relaxed pt-0.5">
                  {textoAlt}
                </div>
                {jaRespondida && isGabarito && (
                  <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                )}
                {jaRespondida && isSelected && !acertou && (
                  <X className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                )}
              </label>
            );
          })}
        </div>

        {/* Rodapé / Ações */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-3">
            {ehAnulada ? (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg font-medium">
                Questão anulada oficialmente pela banca organizadora no gabarito definitivo.
              </div>
            ) : !temGabarito ? (
              <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-slate-400" />
                Caderno sem gabarito oficial pareado no acervo
              </div>
            ) : !jaRespondida ? (
              <button
                disabled={!selecaoTemporaria}
                onClick={handleConfirmarResposta}
                className="px-5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                Responder
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {acertou ? (
                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Parabéns, você acertou!
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-rose-700 bg-rose-100 px-3 py-1.5 rounded-lg">
                    <X className="w-4 h-4 text-rose-600" />
                    Você errou. Gabarito oficial: <strong className="underline">{questao.gabarito}</strong>
                  </span>
                )}
                <button
                  onClick={handleLimpar}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Refazer questão"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
