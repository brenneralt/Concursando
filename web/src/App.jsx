import React, { useState } from 'react';
// HashRouter: GitHub Pages não faz fallback de SPA, então rotas com BrowserRouter
// quebram fora da raiz (ex.: /Concursando/simulado → 404). Com HashRouter,
// /Concursando/#/simulado funciona em qualquer host estático.
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Filtros } from './components/Filtros';
import { CardQuestao } from './components/CardQuestao';
import { Estatisticas } from './components/Estatisticas';
import Login from './components/Login';
import ChooseNickname from './components/ChooseNickname';
import Ranking from './components/Ranking';
import Simulado from './components/Simulado';
import RotaProtegida from './components/RotaProtegida';
import { useProgress } from './hooks/useProgress';
import { useQuestao } from './hooks/useQuestao';
import { AlertCircle, Loader2, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';

const ITENS_POR_PAGINA = 5;

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* A conta é obrigatória: estas rotas só abrem com sessão ativa. */}
        <Route element={<RotaProtegida />}>
          <Route path="/escolher-apelido" element={<ChooseNickname />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/simulado" element={<Simulado />} />
          <Route path="/*" element={<Main />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

function LoginPage() {
  const { login, cadastrar, user, authLoading } = useProgress();
  const location = useLocation();
  const parametro = location.state?.de;
  const destino =
    typeof parametro === 'string' && parametro && !parametro.startsWith('/login')
      ? parametro
      : '/';

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
      </div>
    );
  }
  if (user) return <Navigate to={destino} replace />;
  return (
    <Login
      destino={destino}
      onLogin={(email, senha, apelido) =>
        apelido ? cadastrar(email, senha, apelido) : login(email, senha)
      }
    />
  );
}

function Main() {
  const {
    progresso,
    user,
    logout,
    registrarResposta,
    limparResposta,
    alternarFavorito,
    resetarProgresso,
    stats
  } = useProgress();

  const {
    questoes,
    totalOriginal,
    carregando,
    erro,
    filtros,
    opcoesFiltro,
    atualizarFiltro,
    limparFiltros
  } = useQuestao(progresso);

  const [modalStatsAberto, setModalStatsAberto] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState(1);

  // Paginação
  const totalPaginas = Math.ceil(questoes.length / ITENS_POR_PAGINA) || 1;
  const paginaValida = Math.min(Math.max(paginaAtual, 1), totalPaginas);
  const inicio = (paginaValida - 1) * ITENS_POR_PAGINA;
  const questoesPagina = questoes.slice(inicio, inicio + ITENS_POR_PAGINA);

  const mudarPagina = (novaPagina) => {
    setPaginaAtual(novaPagina);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/60 font-sans text-slate-800">
      {/* Navbar Superior */}
      <Navbar
        stats={stats}
        onOpenStats={() => setModalStatsAberto(true)}
        onReset={resetarProgresso}
        user={user}
        onLogout={logout}
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Painel de Filtros e Busca */}
        <Filtros
          filtros={filtros}
          opcoesFiltro={opcoesFiltro}
          atualizarFiltro={(campo, val) => {
            atualizarFiltro(campo, val);
            setPaginaAtual(1); // Volta para a primeira página ao alterar filtros
          }}
          limparFiltros={() => {
            limparFiltros();
            setPaginaAtual(1);
          }}
          totalQuestoes={totalOriginal}
          totalFiltradas={questoes.length}
        />

        {/* Loading State */}
        {carregando && (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200">
            <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-600">Carregando catálogo de questões...</p>
          </div>
        )}

        {/* Error State */}
        {erro && (
          <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-600" />
            <div>
              <h3 className="font-bold text-sm">Erro ao carregar dados</h3>
              <p className="text-xs mt-1 text-rose-700">{erro}</p>
            </div>
          </div>
        )}

        {/* Lista de Questões */}
        {!carregando && !erro && (
          <div>
            {questoes.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Sparkles className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                <h3 className="font-bold text-slate-800 text-base mb-1">Nenhuma questão encontrada</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                  Não encontramos questões com os filtros selecionados. Tente ajustar a busca ou limpar os filtros.
                </p>
                <button
                  onClick={limparFiltros}
                  className="px-4 py-2 text-xs font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                >
                  Limpar todos os filtros
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {questoesPagina.map((q, idx) => (
                    <CardQuestao
                      key={q.id}
                      questao={q}
                      indice={inicio + idx + 1}
                      respostaUsuario={progresso.respostas[q.id]}
                      ehFavorito={progresso.favoritos.includes(q.id)}
                      onResponder={registrarResposta}
                      onLimparResposta={limparResposta}
                      onAlternarFavorito={alternarFavorito}
                    />
                  ))}
                </div>

                {/* Paginação */}
                {totalPaginas > 1 && (
                  <div className="mt-8 flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <button
                      onClick={() => mudarPagina(paginaValida - 1)}
                      disabled={paginaValida === 1}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Anterior
                    </button>

                    <span className="text-xs text-slate-500 font-medium">
                      Página <strong className="text-slate-800">{paginaValida}</strong> de <strong className="text-slate-800">{totalPaginas}</strong>
                    </span>

                    <button
                      onClick={() => mudarPagina(paginaValida + 1)}
                      disabled={paginaValida === totalPaginas}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Próxima
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Modal de Estatísticas */}
      <Estatisticas
        aberto={modalStatsAberto}
        aoFechar={() => setModalStatsAberto(false)}
        stats={stats}
        questoes={questoes}
        progresso={progresso}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>ConcursoQuestões © 2026 — Treino direcionado para concursos públicos</span>
          <span>Uma conta, todo o seu progresso.</span>
        </div>
      </footer>
    </div>
  );
}