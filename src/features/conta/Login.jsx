import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Loader2, MailCheck } from 'lucide-react';
import { proximoPassoCadastro } from './permissoes.js';

export default function Login({ onLogin, destino = '/' }) {
  const [modo, setModo] = useState('cadastro'); // 'cadastro' | 'entrar'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [apelido, setApelido] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Cadastro feito sem sessão: Supabase exige confirmação do e-mail.
  const [cadastroEnviado, setCadastroEnviado] = useState(false);
  const navigate = useNavigate();

  const trocarModo = (novoModo) => {
    setModo(novoModo);
    setError('');
    setCadastroEnviado(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (modo === 'cadastro') {
        if (!apelido.trim() || apelido.trim().length < 3) {
          setError('Escolha um apelido com pelo menos 3 caracteres.');
          setLoading(false);
          return;
        }
        const { data, error: err } = await onLogin(email, senha, apelido.trim());
        if (err) throw err;

        const sessaoAtiva = Boolean(data?.session);
        if (proximoPassoCadastro(sessaoAtiva) === '/aguardando-aprovacao') {
          navigate('/aguardando-aprovacao', { replace: true });
        } else {
          // Confirmação de e-mail ativa: sem sessão até clicar no link.
          setCadastroEnviado(true);
        }
      } else {
        const { error: err } = await onLogin(email, senha);
        if (err) throw err;
        navigate(destino, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Falha na autenticação. Verifique email e senha.');
    } finally {
      setLoading(false);
    }
  };

  if (cadastroEnviado) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 w-full max-w-md text-center">
          <div className="bg-emerald-100 text-emerald-700 p-3 rounded-full w-14 h-14 mx-auto mb-4 flex items-center justify-center">
            <MailCheck className="w-7 h-7" />
          </div>
          <h1 className="font-bold text-xl text-slate-900 mb-2">Cadastro realizado</h1>
          <p className="text-sm text-slate-600 mb-2">
            Enviamos um link de confirmação para <strong>{email}</strong>.
          </p>
          <p className="text-xs text-slate-500 mb-6">
            Confirme o e-mail para ativar a conta. Depois da confirmação, o acesso fica
            aguardando a aprovação do administrador.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => trocarModo('entrar')}
              className="w-full bg-sky-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-sky-700 transition-colors"
            >
              Já confirmei, entrar
            </button>
            <button
              type="button"
              onClick={() => trocarModo('cadastro')}
              className="text-xs text-sky-600 hover:underline"
            >
              Voltar ao cadastro
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 w-full max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <div className="bg-sky-600 text-white p-2 rounded-xl">
            <BookOpen className="w-5 h-5" />
          </div>
          <h1 className="font-bold text-xl text-slate-900">
            Concurso<span className="text-sky-600">Questões</span>
          </h1>
        </div>
        <p className="text-xs text-slate-500 mb-6">
          A conta é obrigatória para usar a plataforma e precisa ser aprovada pelo
          administrador. Seu progresso fica salvo na nuvem e você aparece no ranque.
        </p>

        {/* Abas */}
        <div className="flex mb-6 bg-slate-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => trocarModo('cadastro')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              modo === 'cadastro' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            Criar conta
          </button>
          <button
            type="button"
            onClick={() => trocarModo('entrar')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              modo === 'entrar' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            Entrar
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {modo === 'cadastro' && (
            <div>
              <label htmlFor="apelido" className="block text-sm font-medium text-slate-700 mb-1">
                Apelido (aparece no ranque)
              </label>
              <input
                id="apelido"
                type="text"
                maxLength={24}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                value={apelido}
                onChange={(e) => setApelido(e.target.value)}
                disabled={loading}
                placeholder="Ex.: JoaoPC"
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <label htmlFor="senha" className="block text-sm font-medium text-slate-700 mb-1">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              required
              minLength={6}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              disabled={loading}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-sky-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {modo === 'cadastro' ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}