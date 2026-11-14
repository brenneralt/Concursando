import React from 'react';
import { X, Award, CheckCircle, XCircle, Percent, Bookmark } from 'lucide-react';

export function Estatisticas({ aberto, aoFechar, stats, questoes, progresso }) {
  if (!aberto) return null;

  // Calcular estatísticas por disciplina
  const statsPorDisciplina = {};
  questoes.forEach(q => {
    const disc = q.disciplina || 'Outras';
    if (!statsPorDisciplina[disc]) {
      statsPorDisciplina[disc] = { total: 0, resolvidas: 0, acertos: 0 };
    }
    statsPorDisciplina[disc].total += 1;

    const resp = progresso.respostas[q.id];
    if (resp) {
      statsPorDisciplina[disc].resolvidas += 1;
      if (resp.acertou) statsPorDisciplina[disc].acertos += 1;
    }
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-sky-600" />
            <h2 className="font-bold text-slate-800 text-base sm:text-lg">Painel de Desempenho</h2>
          </div>
          <button
            onClick={aoFechar}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Métricas Principais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
              <span className="text-xs text-slate-500 font-medium">Resolvidas</span>
              <p className="text-xl font-extrabold text-slate-800 mt-0.5">{stats.totalResolvidas}</p>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
              <span className="text-xs text-emerald-600 font-medium">Acertos</span>
              <p className="text-xl font-extrabold text-emerald-700 mt-0.5">{stats.totalAcertos}</p>
            </div>

            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-center">
              <span className="text-xs text-rose-600 font-medium">Erros</span>
              <p className="text-xl font-extrabold text-rose-700 mt-0.5">{stats.totalErros}</p>
            </div>

            <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-center">
              <span className="text-xs text-sky-600 font-medium">Assertividade</span>
              <p className="text-xl font-extrabold text-sky-700 mt-0.5">{stats.taxaAcerto}%</p>
            </div>
          </div>

          {/* Barra de Progresso Geral */}
          <div>
            <div className="flex justify-between text-xs text-slate-600 font-medium mb-1.5">
              <span>Aproveitamento Geral</span>
              <span>{stats.taxaAcerto}% de acerto</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
              <div
                className="bg-emerald-500 transition-all duration-300"
                style={{ width: `${stats.totalResolvidas > 0 ? (stats.totalAcertos / stats.totalResolvidas) * 100 : 0}%` }}
              />
              <div
                className="bg-rose-400 transition-all duration-300"
                style={{ width: `${stats.totalResolvidas > 0 ? (stats.totalErros / stats.totalResolvidas) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Desempenho por Disciplina */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Desempenho por Matéria
            </h3>
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {Object.entries(statsPorDisciplina).map(([disc, dStats]) => {
                const taxa = dStats.resolvidas > 0
                  ? Math.round((dStats.acertos / dStats.resolvidas) * 100)
                  : 0;

                return (
                  <div key={disc} className="border border-slate-100 rounded-lg p-2.5 bg-slate-50/50">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-semibold text-slate-700 truncate max-w-[240px]">{disc}</span>
                      <span className="text-slate-500 font-mono">
                        {dStats.acertos}/{dStats.resolvidas} ({taxa}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-sky-600 h-full rounded-full transition-all"
                        style={{ width: `${taxa}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-right">
          <button
            onClick={aoFechar}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
