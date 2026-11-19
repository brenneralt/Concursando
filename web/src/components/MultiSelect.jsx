import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

const NORMALIZAR = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const BOTAO_CLASS =
  'w-full flex items-center justify-between gap-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-left text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all';

/**
 * Dropdown de múltipla seleção com busca (estilo Qconcursos/QConcursos):
 * - Lista as opções com checkbox; lista vazia = "todas".
 * - Busca por subcadeia ignorando acento.
 * - "Selecionar todos (visíveis)" e "Limpar" como ações rápidas.
 * - Fecha com clique fora ou Esc.
 */
export function MultiSelect({ placeholder, opcoes, selecionados, onChange }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) setBusca('');
  }, [aberto]);

  const filtradas = useMemo(() => {
    const termo = NORMALIZAR(busca.trim());
    if (!termo) return opcoes;
    return opcoes.filter((o) => NORMALIZAR(o).includes(termo));
  }, [busca, opcoes]);

  const alternar = (valor) => {
    onChange(
      selecionados.includes(valor)
        ? selecionados.filter((v) => v !== valor)
        : [...selecionados, valor]
    );
  };

  const selecionarVisiveis = () => {
    onChange(Array.from(new Set([...selecionados, ...filtradas])));
  };

  const limparSelecao = () => onChange([]);

  const textoBotao =
    selecionados.length === 0
      ? placeholder
      : selecionados.length === 1
        ? selecionados[0]
        : `${selecionados.length} selecionados`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={BOTAO_CLASS}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        title={selecionados.length > 1 ? selecionados.join(', ') : undefined}
      >
        <span className="truncate">{textoBotao}</span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <div
          className="absolute z-20 mt-1 w-full min-w-[15rem] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
          role="listbox"
          aria-multiselectable="true"
        >
          {/* Busca */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar..."
              className="w-full text-xs bg-transparent focus:outline-none text-slate-700 placeholder-slate-400"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Ações rápidas */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 text-[11px]">
            <button
              onClick={selecionarVisiveis}
              className="font-semibold text-sky-700 hover:text-sky-800 hover:underline"
            >
              Selecionar {busca ? 'visíveis' : 'todos'} ({filtradas.length})
            </button>
            <button
              onClick={limparSelecao}
              className="text-slate-500 hover:text-slate-700 hover:underline"
            >
              Limpar
            </button>
          </div>

          {/* Opções */}
          <div className="max-h-64 overflow-y-auto p-1.5">
            {filtradas.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                Nenhuma opção encontrada
              </div>
            ) : (
              filtradas.map((opcao) => {
                const marcado = selecionados.includes(opcao);
                return (
                  <label
                    key={opcao}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(opcao)}
                      className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="flex-1 leading-snug">{opcao}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
