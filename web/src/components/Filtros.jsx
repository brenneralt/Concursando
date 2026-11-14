import React from 'react';
import { Search, Filter, X, CheckCircle, XCircle, HelpCircle, Star } from 'lucide-react';

export function Filtros({
  filtros,
  opcoesFiltro,
  atualizarFiltro,
  limparFiltros,
  totalQuestoes,
  totalFiltradas
}) {
  const statusChips = [
    { id: 'TODAS', label: 'Todas as Questões', icon: null },
    { id: 'NAO_RESOLVIDAS', label: 'Não Resolvidas', icon: HelpCircle },
    { id: 'ACERTOS', label: 'Acertos', icon: CheckCircle, color: 'text-emerald-600' },
    { id: 'ERROS', label: 'Erros', icon: XCircle, color: 'text-rose-600' },
    { id: 'FAVORITAS', label: 'Salvas', icon: Star, color: 'text-amber-500' }
  ];

  const temFiltroAtivo =
    filtros.banca !== 'TODAS' ||
    filtros.disciplina !== 'TODAS' ||
    filtros.ano !== 'TODOS' ||
    filtros.modalidade !== 'TODAS' ||
    filtros.status !== 'TODAS' ||
    filtros.busca.trim() !== '';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 mb-6">
      {/* Barra de Busca e Reset */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Pesquisar por assunto, cargo, órgão ou palavra-chave..."
            value={filtros.busca}
            onChange={(e) => atualizarFiltro('busca', e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
          />
          {filtros.busca && (
            <button
              onClick={() => atualizarFiltro('busca', '')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {temFiltroAtivo && (
          <button
            onClick={limparFiltros}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <X className="w-4 h-4" />
            Limpar Filtros
          </button>
        )}
      </div>

      {/* Selects: Disciplina, Banca, Ano, Modalidade */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Disciplina</label>
          <select
            value={filtros.disciplina}
            onChange={(e) => atualizarFiltro('disciplina', e.target.value)}
            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
          >
            <option value="TODAS">Todas as disciplinas</option>
            {opcoesFiltro.disciplinas.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Banca Examinadora</label>
          <select
            value={filtros.banca}
            onChange={(e) => atualizarFiltro('banca', e.target.value)}
            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
          >
            <option value="TODAS">Todas as bancas</option>
            {opcoesFiltro.bancas.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Ano</label>
          <select
            value={filtros.ano}
            onChange={(e) => atualizarFiltro('ano', e.target.value)}
            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
          >
            <option value="TODOS">Todos os anos</option>
            {opcoesFiltro.anos.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Modalidade</label>
          <select
            value={filtros.modalidade}
            onChange={(e) => atualizarFiltro('modalidade', e.target.value)}
            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
          >
            <option value="TODAS">Todas as modalidades</option>
            <option value="MULTIPLA_ESCOLHA">Múltipla Escolha</option>
            <option value="CERTO_ERRADO">Certo / Errado (Cebraspe)</option>
          </select>
        </div>
      </div>

      {/* Status Chips & Contador */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
        <div className="flex flex-wrap gap-2">
          {statusChips.map((chip) => {
            const ativo = filtros.status === chip.id;
            const Icon = chip.icon;
            return (
              <button
                key={chip.id}
                onClick={() => atualizarFiltro('status', chip.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  ativo
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {Icon && <Icon className={`w-3.5 h-3.5 ${ativo ? 'text-white' : chip.color || 'text-slate-500'}`} />}
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Exibindo <span className="font-bold text-slate-800">{totalFiltradas}</span> de <span className="font-bold text-slate-800">{totalQuestoes}</span> questões
        </div>
      </div>
    </div>
  );
}
