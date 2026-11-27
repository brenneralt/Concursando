import { LogOut } from 'lucide-react';

export default function ContaBloqueada({ user, onLogout }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-rose-200 p-8 w-full max-w-md text-center">
        <div className="bg-rose-100 text-rose-700 p-3 rounded-full w-14 h-14 mx-auto mb-4 flex items-center justify-center">
          <span className="text-2xl">⛔</span>
        </div>
        <h1 className="font-bold text-xl text-slate-900 mb-2">Acesso suspenso</h1>
        <p className="text-sm text-slate-600 mb-1">
          Sua conta foi bloqueada pelo administrador e não pode utilizar a plataforma.
        </p>
        <p className="text-xs text-slate-500 mb-6">
          Se acredita que houve um engano, entre em contato com o administrador. Conta: {user?.email}
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="w-full bg-rose-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-rose-700 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>
  );
}
