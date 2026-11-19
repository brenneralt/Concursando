import React from 'react';
import { BookOpen, BarChart2, Star, CheckCircle, RotateCcw, Users, LogOut, Timer } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export function Navbar({ stats, onOpenStats, onReset, user, onLogout }) {
  const navigate = useNavigate();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center space-x-3">
          <div className="bg-sky-600 text-white p-2 rounded-xl shadow-sm">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg sm:text-xl text-slate-900 tracking-tight flex items-center gap-1.5">
              Concurso<span className="text-sky-600 font-extrabold">Questões</span>
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">Plataforma focada em concurso público</p>
          </div>
        </div>

        {/* Quick Stats & Actions */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="hidden md:flex items-center bg-slate-100 rounded-full px-4 py-1.5 text-xs font-medium text-slate-700 space-x-3">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              {stats.totalResolvidas} resolvidas
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1">
              Taxa: <strong className={stats.taxaAcerto >= 70 ? 'text-emerald-600' : stats.taxaAcerto >= 50 ? 'text-amber-600' : 'text-slate-600'}>
                {stats.taxaAcerto}%
              </strong>
            </span>
          </div>

          <Link
            to="/simulado"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors shadow-sm"
            title="Montar um simulado cronometrado"
          >
            <Timer className="w-4 h-4" />
            <span className="hidden sm:inline">Simulado</span>
          </Link>

          <button
            onClick={() => navigate('/ranking')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            title="Ver ranque de questões resolvidas"
          >
            <Users className="w-4 h-4 text-sky-600" />
            <span className="hidden sm:inline">Ranque</span>
          </button>

          <button
            onClick={onOpenStats}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            title="Ver estatísticas detalhadas"
          >
            <BarChart2 className="w-4 h-4 text-sky-600" />
            <span>Desempenho</span>
          </button>

          {stats.totalResolvidas > 0 && (
            <button
              onClick={onReset}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Zerar progresso"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {user && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
              title={`Sair (${user.email})`}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}