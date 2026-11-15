import React from 'react';
import { Search, X, CheckCircle, XCircle, HelpCircle, Star, AlertTriangle } from 'lucide-react';

const STATUS_CHIPS = [
  { id: 'TODAS', label: 'Todas', icon: null },
  { id: 'NAO_RESOLVIDAS', label: 'Não resolvidas', icon: HelpCircle },
  { id: 'ACERTOS', label: 'Acertos', icon: CheckCircle, color: 'text-emerald-600' },
  { id: 'ERROS', label: 'Erros', icon: XCircle, color: 'text-rose-600' },
  { id: 'FAVORITAS', label: 'Salvas', icon: Star, color: 'text-amber-500' },
  { id: 'ANULADAS', label: 'Anuladas', icon: AlertTriangle, color: 'text-amber-600' }
];

const SELECT_CLASS =
  'w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white';
const LABEL_CLASS = 'block text-xs font-semibold text-slate-600 mb-1';

export function Filtros({
  filtros,
  opcoesFiltro,
  atualizarFiltro,
  limparFiltros,
  totalQuestoes,
  totalFiltradas
}) {
  const filtrosAtivos =
    (filtros.busca.trim() ? 1 : 0) +
    (filtros.disciplina !== 'TODAS' ? 1 : 0) +
    (filtros.assunto !== 'TODOS' ? 1 : 0) +
    (filtros.banca !== 'TODAS' ? 1 : 0) +
    (filtros.orgao !== 'TODOS' ? 1 : 0) +
    (filtros.ano !== 'TODOS' ? 1 : 0) +
    (filtros.cargo !== 'TODOS' ? 1 : 0) +
    (filtros.nivel !== 'TODOS' ? 1 : 0) +
    (filtros.status !== 'TODAS' ? 1 : 0) +
    (filtros.ocultarAnuladas ? 1 : 0) +
    (filtros.somenteComGabarito ? 1 : 0);

  const bancas = opcoesFiltro.bancas || [];
  const disciplinas = opcoesFiltro.disciplinas || [];
  const assuntos = opcoesFiltro.assuntos || [];
  const cargos = opcoesFiltro.cargos || [];
  const orgaos = opcoesFiltro.orgaos || [];
  const anos = opcoesFiltro.anos || [];
  const niveis = opcoesFiltro.niveis || [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 mb-6">
      {/* Busca por palavra-chave */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Palavra-chave no enunciado, alternativa, cargo, órgão ou assunto..."
            value={filtros.busca}
            onChange={(e) => atualizarFiltro('busca', e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
          />
          {filtros.busca && (
            <button
              onClick={() => atualizarFiltro('busca', '')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {filtrosAtivos > 0 && (
          <button
            onClick={limparFiltros}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <X className="w-4 h-4" />
            Limpar filtros ({filtrosAtivos})
          </button>
        )}
      </div>

      {/* Linha 1: Disciplina, Assunto, Banca, Instituição */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <div>
          <label className={LABEL_CLASS}>Disciplina</label>
          <select
            value={filtros.disciplina}
            onChange={(e) => atualizarFiltro('disciplina', e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="TODAS">Todas as disciplinas</option>
            {disciplinas.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}>Assunto</label>
          <select
            value={filtros.assunto}
            onChange={(e) => atualizarFiltro('assunto', e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="TODOS">Todos os assuntos</option>
            {assuntos.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}>Banca</label>
          <select
            value={filtros.banca}
            onChange={(e) => atualizarFiltro('banca', e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="TODAS">Todas as bancas</option>
            {bancas.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}>Instituição / Órgão</label>
          <select
            value={filtros.orgao}
            onChange={(e) => atualizarFiltro('orgao', e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="TODOS">Todos os órgãos</option>
            {orgaos.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Linha 2: Ano, Cargo, Nível, Exclusões */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div>
          <label className={LABEL_CLASS}>Ano</label>
          <select
            value={filtros.ano}
            onChange={(e) => atualizarFiltro('ano', e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="TODOS">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}>Cargo</label>
          <select
            value={filtros.cargo}
            onChange={(e) => atualizarFiltro('cargo', e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="TODOS">Todos os cargos</option>
            {cargos.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}>Nível</label>
          <select
            value={filtros.nivel}
            onChange={(e) => atualizarFiltro('nivel', e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="TODOS">Todos os níveis</option>
            {niveis.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}>Excluir questões</label>
          <div className="flex flex-col gap-1.5 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={filtros.ocultarAnuladas}
                onChange={(e) => atualizarFiltro('ocultarAnuladas', e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Anuladas pela banca
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={filtros.somenteComGabarito}
                onChange={(e) => atualizarFiltro('somenteComGabarito', e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Sem gabarito oficial
            </label>
          </div>
        </div>
      </div>

      {/* Status chips & contador */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
        <div className="flex flex-wrap gap-2">
          {STATUS_CHIPS.map((chip) => {
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
          Exibindo <span className="font-bold text-slate-800">{totalFiltradas}</span> de{' '}
          <span className="font-bold text-slate-800">{totalQuestoes}</span> questões
        </div>
      </div>
    </div>
  );
}
