import { useEffect, useState, useCallback } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabase.js';
import { estadoAdmin } from '../conta/permissoes.js';
import { useAcesso } from '../conta/useAcesso.js';
import { useProgress } from '../desempenho/useProgress.js';
import {
  ShieldCheck, Clock, CheckCircle2, Ban, RefreshCw, Loader2, Search,
  UserCog, ArrowLeft, AlertTriangle
} from 'lucide-react';

const STATUS_TABS = [
  { key: 'todos', label: 'Todos' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'approved', label: 'Aprovados' },
  { key: 'blocked', label: 'Bloqueados' },
];

function formatarData(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export default function Admin() {
  // useProgress inicia com user=null e recupera a sessão de forma assíncrona:
  // sem authLoading a decisão abaixo redirigiria um administrador legítimo.
  const { user, authLoading } = useProgress();
  const {
    acesso,
    erro: erroAcesso,
    carregando: carregandoAcesso,
    recarregar: recarregarAcesso,
  } = useAcesso(user);

  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState('pending');
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    const { data, error } = await supabase.rpc('listar_usuarios');
    if (error) {
      setErro(error.message || 'Falha ao listar usuários.');
      setUsuarios([]);
    } else {
      setUsuarios(data || []);
    }
    setCarregando(false);
  }, []);

  // Só decide quando sessão + registro de acesso já foram resolvidos.
  const estado = estadoAdmin({
    authLoading,
    user,
    acesso,
    erro: erroAcesso,
    carregando: carregandoAcesso,
  });

  useEffect(() => {
    if (estado === 'admin') carregar();
  }, [estado, carregar]);

  if (estado === 'aguardar') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
      </div>
    );
  }

  if (estado === 'login') {
    return <Navigate to="/login" replace />;
  }

  // Falha ao consultar permissões: fechado, sem redirecionar silenciosamente.
  if (estado === 'erro') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 w-full max-w-md text-center">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
          <h1 className="font-bold text-lg text-slate-900 mb-2">Não foi possível verificar suas permissões</h1>
          <p className="text-xs text-slate-500 mb-5">{erroAcesso}</p>
          <button
            type="button"
            onClick={() => recarregarAcesso()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (estado !== 'admin') {
    // Comum, pendente ou bloqueado: sem acesso ao painel.
    return <Navigate to="/" replace />;
  }

  const contadores = {
    todos: usuarios.length,
    pending: usuarios.filter((u) => u.status === 'pending').length,
    approved: usuarios.filter((u) => u.status === 'approved').length,
    blocked: usuarios.filter((u) => u.status === 'blocked').length,
  };

  const filtrados = usuarios.filter((u) => {
    if (aba !== 'todos' && u.status !== aba) return false;
    if (busca.trim()) {
      const termo = busca.trim().toLowerCase();
      return (
        (u.email || '').toLowerCase().includes(termo) ||
        (u.apelido || '').toLowerCase().includes(termo)
      );
    }
    return true;
  });

  const executar = async (fn, userId, novoStatus) => {
    setAcaoEmAndamento(userId);
    setErro('');
    try {
      const { error } = await fn(userId, novoStatus);
      if (error) throw error;
      await carregar();
    } catch (e) {
      setErro(e.message || 'Falha na ação.');
    } finally {
      setAcaoEmAndamento(null);
    }
  };

  const aprovar = (id) => executar((uid) => supabase.rpc('definir_acesso', { p_user_id: uid, p_status: 'approved' }), id, 'approved');
  const bloquear = (id) => executar((uid) => supabase.rpc('definir_acesso', { p_user_id: uid, p_status: 'blocked' }), id, 'blocked');
  const reativar = (id) => executar((uid) => supabase.rpc('definir_acesso', { p_user_id: uid, p_status: 'approved' }), id, 'approved');
  const promover = (id) => executar((uid) => supabase.rpc('definir_admin', { p_user_id: uid, p_is_admin: true }), id, 'admin');
  const rebaixar = (id) => executar((uid) => supabase.rpc('definir_admin', { p_user_id: uid, p_is_admin: false }), id, 'admin');

  return (
    <div className="min-h-screen bg-slate-100/60">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-bold text-lg text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-5 h-5 text-sky-600" />
                Painel administrativo
              </h1>
              <p className="text-xs text-slate-500">Gerenciar contas e aprovações</p>
            </div>
          </div>
          <button
            onClick={carregar}
            className="px-4 py-1.5 text-xs sm:text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Contadores */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setAba(t.key)}
              className={`bg-white border rounded-xl p-4 text-left transition-colors ${
                aba === t.key ? 'border-sky-500 ring-1 ring-sky-500' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-xs text-slate-500 font-medium">{t.label}</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{contadores[t.key]}</div>
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="mb-4 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por e-mail ou apelido..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
          />
        </div>

        {erro && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-3" />
            <p className="text-sm">Carregando usuários...</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Usuário</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Cadastro</th>
                    <th className="px-4 py-3 text-left font-semibold hidden lg:table-cell">Última decisão</th>
                    <th className="px-4 py-3 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtrados.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  )}
                  {filtrados.map((u) => {
                    const ocupado = acaoEmAndamento === u.user_id;
                    const ehVoce = u.user_id === user?.id;
                    return (
                      <tr key={u.user_id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{u.apelido || '—'}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                          {u.is_admin && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded mt-1">
                              <UserCog className="w-3 h-3" /> ADMIN
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${
                              u.status === 'approved'
                                ? 'text-emerald-700 bg-emerald-50'
                                : u.status === 'blocked'
                                ? 'text-rose-700 bg-rose-50'
                                : 'text-amber-700 bg-amber-50'
                            }`}
                          >
                            {u.status === 'approved' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : u.status === 'blocked' ? (
                              <Ban className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                          {formatarData(u.created_at)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell">
                          {u.status === 'approved'
                            ? formatarData(u.approved_at)
                            : u.status === 'blocked'
                            ? formatarData(u.blocked_at)
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {u.status !== 'approved' && (
                              <button
                                onClick={() => aprovar(u.user_id)}
                                disabled={ocupado}
                                className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg disabled:opacity-50"
                              >
                                {ocupado ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Aprovar'}
                              </button>
                            )}
                            {u.status === 'approved' && !ehVoce && (
                              <button
                                onClick={() => bloquear(u.user_id)}
                                disabled={ocupado}
                                className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg disabled:opacity-50"
                              >
                                {ocupado ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Bloquear'}
                              </button>
                            )}
                            {u.status === 'blocked' && (
                              <button
                                onClick={() => reativar(u.user_id)}
                                disabled={ocupado}
                                className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg disabled:opacity-50"
                              >
                                {ocupado ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Reativar'}
                              </button>
                            )}
                            {!u.is_admin && (
                              <button
                                onClick={() => promover(u.user_id)}
                                disabled={ocupado}
                                className="px-2.5 py-1 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg disabled:opacity-50"
                                title="Tornar administrador"
                              >
                                Promover
                              </button>
                            )}
                            {u.is_admin && !ehVoce && (
                              <button
                                onClick={() => rebaixar(u.user_id)}
                                disabled={ocupado}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg disabled:opacity-50"
                                title="Remover administrador"
                              >
                                Rebaixar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
