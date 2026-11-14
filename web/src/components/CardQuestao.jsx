import React, { useState } from 'react';
import { Check, X, Star, BookOpen, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

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
  const [mostrarExplicacao, setMostrarExplicacao] = useState(false);

  const jaRespondida = !!respostaUsuario;
  const acertou = respostaUsuario?.acertou;

  const handleConfirmarResposta = () => {
    if (!selecaoTemporaria) return;
    onResponder(questao.id, selecaoTemporaria, questao.gabarito);
  };

  const handleLimpar = () => {
    setSelecaoTemporaria(null);
    setMostrarExplicacao(false);
    onLimparResposta(questao.id);
  };

  return (
    <article className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:border-slate-300 mb-5">
      {/* Cabeçalho de Metadados / Catalogação */}
      <div className="bg-slate-50/80 px-4 sm:px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-mono font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded">
            #{indice}
          </span>
          <span className="font-semibold text-sky-800 bg-sky-100/70 px-2 py-0.5 rounded">
            {questao.disciplina}
          </span>
          <span className="text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
            {questao.assunto}
          </span>
          {questao.subassunto && (
            <span className="text-slate-500 hidden sm:inline-block bg-white border border-slate-200 px-2 py-0.5 rounded">
              {questao.subassunto}
            </span>
          )}
          <span className="text-slate-700 font-medium bg-slate-200/50 px-2 py-0.5 rounded">
            {questao.banca} • {questao.ano}
          </span>
          <span className="text-slate-500 hidden md:inline-block">
            {questao.orgao} ({questao.cargo})
          </span>
        </div>

        {/* Favoritar */}
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

      {/* Corpo da Questão */}
      <div className="p-4 sm:p-6">
        {/* Enunciado */}
        <div className="text-slate-900 text-sm sm:text-base leading-relaxed mb-6 font-normal whitespace-pre-line">
          {questao.enunciado}
        </div>

        {/* Alternativas */}
        <div className="space-y-2.5 mb-6">
          {questao.alternativas.map((alt) => {
            const isSelected = (jaRespondida ? respostaUsuario.resposta : selecaoTemporaria) === alt.id;
            const isGabarito = questao.gabarito === alt.id;

            let estiloContainer = 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50';
            let estiloBadge = 'bg-slate-100 text-slate-700 border-slate-300';

            if (jaRespondida) {
              if (isGabarito) {
                estiloContainer = 'border-emerald-500 bg-emerald-50/60 text-emerald-950 font-medium';
                estiloBadge = 'bg-emerald-600 text-white border-emerald-600';
              } else if (isSelected && !acertou) {
                estiloContainer = 'border-rose-400 bg-rose-50/60 text-rose-950';
                estiloBadge = 'bg-rose-600 text-white border-rose-600';
              } else {
                estiloContainer = 'border-slate-100 opacity-60';
              }
            } else if (isSelected) {
              estiloContainer = 'border-sky-500 bg-sky-50/60 text-sky-950 ring-1 ring-sky-500';
              estiloBadge = 'bg-sky-600 text-white border-sky-600';
            }

            return (
              <label
                key={alt.id}
                onClick={() => {
                  if (!jaRespondida) setSelecaoTemporaria(alt.id);
                }}
                className={`flex items-start gap-3 p-3 sm:p-3.5 rounded-lg border text-xs sm:text-sm cursor-pointer transition-all ${estiloContainer}`}
              >
                <div className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center font-bold text-xs mt-0.5 ${estiloBadge}`}>
                  {alt.id}
                </div>
                <div className="flex-1 leading-relaxed pt-0.5">
                  {alt.texto}
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

        {/* Rodapé / Ações de Resolução */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-3">
            {!jaRespondida ? (
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
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    Você errou. Gabarito: {questao.gabarito}
                  </span>
                )}
                <button
                  onClick={handleLimpar}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                  title="Refazer questão"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Botão de Exibir Gabarito Comentado */}
          {questao.explicacao && (
            <button
              onClick={() => setMostrarExplicacao(!mostrarExplicacao)}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-sky-700 hover:bg-sky-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <BookOpen className="w-4 h-4 text-sky-600" />
              <span>Gabarito Comentado</span>
              {mostrarExplicacao ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Bloco de Gabarito Comentado */}
        {mostrarExplicacao && questao.explicacao && (
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-700">
            <div className="font-semibold text-slate-900 mb-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500"></span>
              Comentário do Professor / Fundamentação:
            </div>
            <p className="leading-relaxed whitespace-pre-line text-slate-600">
              {questao.explicacao}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
