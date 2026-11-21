import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabase.js';
import { User, Loader2 } from 'lucide-react';

export default function ChooseNickname() {
  const [apelido, setApelido] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login', { replace: true });
        return;
      }
      const { data } = await supabase.from('profiles').select('apelido').eq('id', user.id).single();
      if (data?.apelido) setApelido(data.apelido);
      setLoading(false);
    })();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão expirada. Faça login novamente.');
      const { error: err } = await supabase
        .from('profiles')
        .update({ apelido: apelido.trim() })
        .eq('id', user.id);
      if (err) throw err;
      navigate('/');
    } catch (err) {
      setError(err.message || 'Erro ao salvar apelido');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 w-full max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <div className="bg-sky-600 text-white p-2 rounded-xl">
            <User className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Escolha seu apelido</h2>
        </div>

        <p className="text-xs text-slate-500 mb-6">
          Este nome aparecerá no ranque de questões resolvidas para todos os usuários.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="apelido" className="block text-sm font-medium text-slate-700 mb-1">
              Apelido (3 a 24 caracteres)
            </label>
            <input
              id="apelido"
              type="text"
              minLength={3}
              maxLength={24}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              disabled={salvando}
              placeholder="Ex.: JoaoPC"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-sky-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            disabled={salvando}
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar apelido
          </button>
          <Link to="/" className="block text-center text-xs text-sky-600 hover:underline">
            Pular por agora
          </Link>
        </form>
      </div>
    </div>
  );
}