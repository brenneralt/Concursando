import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase.js';
import { Trophy, Medal, Users, ArrowLeft, Loader2 } from 'lucide-react';

export default function Ranking() {
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    carregarRanking();
  }, []);

  async function carregarRanking() {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase.from('ranque').select('*').order('posicao');
      if (err) throw err;
      setRanking(data || []);
    } catch (err) {
      setError(err.message || 'Erro ao carregar ranque');
    } finally {
      setLoading(false);
    }
  }

  const iconePosicao = (pos) => {
    if (pos === 1) return <Trophy className="text-yellow-500" size={22} />;
    if (pos === 2) return <Medal className="text-slate-400" size={22} />;
    if (pos === 3) return <Medal className="text-amber-700" size={22} />;
    return <span className="text-slate-400 font-semibold">{pos}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-100/60">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-bold text-lg text-slate-900 flex items-center gap-1.5">
                Concurso<span className="text-sky-600 font-extrabold">Questões</span>
              </h1>
              <p className="text-xs text-slate-500">Ranque de questões resolvidas</p>
            </div>
          </div>
          <button
            onClick={carregarRanking}
            className="px-4 py-1.5 text-xs sm:text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
          >
            Atualizar
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-3" />
              <p className="text-sm">Carregando ranque...</p>
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm mb-4">
                {error}
              </div>
              <button
                onClick={carregarRanking}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700"
              >
                Tentar novamente
              </button>
            </div>
          ) : ranking.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Users className="w-8 h-8 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">Nenhum usuário no ranque ainda.</p>
              <p className="text-xs text-slate-400 mt-1">
                Resolva questões para aparecer aqui!
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide w-16">Pos.</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide">Usuário</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide w-24">Resolvidas</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide w-20">Acertos</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide w-20">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 ${item.posicao <= 3 ? 'bg-yellow-50/60' : 'hover:bg-slate-50'}`}
                  >
                    <td className="py-3 px-4">{iconePosicao(item.posicao)}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{item.apelido}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{item.total_resolvidas}</td>
                    <td className="py-3 px-4 text-center text-emerald-700">{item.total_acertos}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{Number(item.pct_acerto).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">
          O ranque é atualizado a cada questão respondida.
        </p>
      </main>
    </div>
  );
}