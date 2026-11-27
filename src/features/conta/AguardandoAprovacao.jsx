import { useState } from 'react';
import { LogOut, Loader2, RefreshCw, Clock } from 'lucide-react';

export default function AguardandoAprovacao({ user, onLogout, onRecarregar, carregando }) {
  const [verificando, setVerificando] = useState(false);

  const handleVerificar = async () => {
    setVerificando(true);
    await onRecarregar();
    setVerificando(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 w-full max-w-md text-center">
        <div className="bg-amber-100 text-amber-700 p-3 rounded-full w-14 h-14 mx-auto mb-4 flex items-center justify-center">
          <Clock className="w-7 h-7" />
        </div>
        <h1 className="font-bold text-xl text-slate-900 mb-2">Cadastro em análise</h1>
        <p className="text-sm text-slate-600 mb-1">
          Sua conta foi criada e está <strong>aguardando aprovação</strong> do administrador.
        </p>
        <p className="text-xs text-slate-500 mb-6">
          Você receberá acesso assim que for aprovado. Conta: {user?.email}
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleVerificar}
            disabled={verificando || carregando}
            className="w-full bg-sky-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {(verificando || carregando) && <Loader2 className="w-4 h-4 animate-spin" />}
            Verificar novamente
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full bg-slate-100 text-slate-700 py-2 px-4 rounded-lg font-medium hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
