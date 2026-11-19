import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Timer,
  Play,
  ChevronLeft,
  ChevronRight,
  Flag,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RotateCcw,
  Trophy,
  Loader2,
  AlertCircle,
  Clock,
  ArrowLeft
} from 'lucide-react';
import { useBanco } from '../hooks/useBanco';
import { useProgress } from '../hooks/useProgress';

const QUANTIDADES = [10, 20, 30, 50];
const DURACOES = [
  { id: 'livre', label: 'Sem limite', segundos: 0 },
  { id: '20', label: '20 min', segundos: 20 * 60 },
  { id: '40', label: '40 min', segundos: 40 * 60 },
  { id: '60', label: '60 min', segundos: 60 * 60 }
];

const SELECT_CLASS =
  'w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white';
const LABEL_CLASS = 'block text-xs font-semibold text-slate-600 mb-1';

function embaralhar(lista) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function formatarTempo(totalSegundos) {
  const seg = Math.max(0, Math.floor(totalSegundos));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const dois = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

export default function Simulado() {
  const { questoes, carregando, erro } = useBanco();
  const { registrarResposta } = useProgress();

  const [fase, setFase] = useState('config'); // config | prova | resultado
  const [config, setConfig] = useState({
    disciplina: 'TODAS',
    ano: 'TODOS',
    nivel: 'TODOS',
    quantidade: 10,
    duracao: 'livre'
  });
  const [prova, setProva] = useState([]);
  const [respostas, setRespostas] = useState({});
  const [indice, setIndice] = useState(0);
  const [decorridos, setDecorridos] = useState(0);
  const [resultado, setResultado] = useState(null);
  const finalizadoRef = useRef(false);

  // Opções dos filtros
  const opcoes = useMemo(() => {
    const disciplinas = new Set();
    const anos = new Set();
    const niveis = new Set();
    questoes.forEach((q) => {
      if (q.disciplina) disciplinas.add(q.disciplina);
      if (q.ano) anos.add(String(q.ano));
      if (q.nivel) niveis.add(q.nivel);
    });
    return {
      disciplinas: Array.from(disciplinas).sort(),
      anos: Array.from(anos).sort((a, b) => b - a),
      niveis: Array.from(niveis).sort()
    };
  }, [questoes]);

  const duracaoSeg = useMemo(
    () => DURACOES.find((d) => d.id === config.duracao)?.segundos ?? 0,
    [config.duracao]
  );

  const elegivel = useCallback(
    (q) =>
      !q.anulada &&
      q.gabarito !== null &&
      q.gabarito !== undefined &&
      q.alternativas &&
      Object.keys(q.alternativas).length >= 2,
    []
  );

  const disponiveis = useMemo(() => {
    return questoes.filter((q) => {
      if (!elegivel(q)) return false;
      if (config.disciplina !== 'TODAS' && q.disciplina !== config.disciplina) return false;
      if (config.ano !== 'TODOS' && String(q.ano) !== config.ano) return false;
      if (config.nivel !== 'TODOS' && q.nivel !== config.nivel) return false;
      return true;
    });
  }, [questoes, config.disciplina, config.ano, config.nivel, elegivel]);

  const iniciar = () => {
    const total = Math.min(config.quantidade, disponiveis.length);
    if (total === 0) return;
    const selecionadas = embaralhar(disponiveis).slice(0, total);
    finalizadoRef.current = false;
    setProva(selecionadas);
    setRespostas({});
    setIndice(0);
    setDecorridos(0);
    setResultado(null);
    setFase('prova');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finalizar = useCallback(() => {
    if (finalizadoRef.current || prova.length === 0) return;
    finalizadoRef.current = true;
    const detalhes = prova.map((q) => {
      const marcada = respostas[q.id] || null;
      return { questao: q, marcada, acertou: marcada !== null && marcada === q.gabarito };
    });
    detalhes.forEach((d) => {
      if (d.marcada) registrarResposta(d.questao.id, d.marcada, d.questao.gabarito);
    });
    setResultado({
      detalhes,
      acertos: detalhes.filter((d) => d.acertou).length,
      erros: detalhes.filter((d) => d.marcada && !d.acertou).length,
      emBranco: detalhes.filter((d) => !d.marcada).length,
      tempo: decorridos
    });
    setFase('resultado');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [prova, respostas, decorridos, registrarResposta]);

  const finalizarRef = useRef(finalizar);
  finalizarRef.current = finalizar;

  // Cronômetro
  useEffect(() => {
    if (fase !== 'prova') return undefined;
    const id = setInterval(() => setDecorridos((d) => d + 1), 1000);
    return () => clearInterval(id);
  }, [fase]);

  useEffect(() => {
    if (fase !== 'prova') return;
    if (duracaoSeg > 0 && decorridos >= duracaoSeg) finalizarRef.current();
  }, [fase, decorridos, duracaoSeg]);

  // Navegação por teclado durante a prova
  useEffect(() => {
    if (fase !== 'prova') return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(i + 1, prova.length - 1));
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fase, prova.length]);

  const responder = (questaoId, letra) => {
    setRespostas((prev) => ({ ...prev, [questaoId]: letra }));
  };

  const pedirFinalizar = () => {
    const emBranco = prova.filter((q) => !respostas[q.id]).length;
    if (emBranco > 0) {
      const ok = window.confirm(
        `Você deixou ${emBranco} questão(ões) em branco. Deseja finalizar mesmo assim?`
      );
      if (!ok) return;
    }
    finalizarRef.current();
  };

  const reiniciar = () => {
    setFase('config');
    setProva([]);
    setRespostas({});
    setIndice(0);
    setDecorridos(0);
    setResultado(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (carregando) {
    return (
      <TelaCentro>
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-600">Carregando banco de questões...</p>
      </TelaCentro>
    );
  }

  if (erro) {
    return (
      <TelaCentro>
        <AlertCircle className="w-8 h-8 text-rose-600 mb-3" />
        <p className="text-sm font-semibold text-rose-800">Erro ao carregar dados</p>
        <p className="text-xs text-rose-700 mt-1">{erro}</p>
        <Link to="/" className="mt-4 text-xs font-semibold text-sky-700 underline">
          Voltar ao treino
        </Link>
      </TelaCentro>
    );
  }

  const emProva = fase === 'prova';
  const restante = duracaoSeg > 0 ? Math.max(0, duracaoSeg - decorridos) : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/60 font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <div className="bg-sky-600 text-white p-2 rounded-xl shadow-sm shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base sm:text-lg text-slate-900 tracking-tight truncate">
                Concurso<span className="text-sky-600 font-extrabold">Questões</span>
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block">Modo Simulado com cronômetro</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {emProva && (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold bg-slate-100 rounded-full px-3 py-1.5">
                  <Flag className="w-3.5 h-3.5 text-sky-600" />
                  {Object.keys(respostas).length}/{prova.length} respondidas
                </div>
                <div
                  className={`flex items-center gap-1.5 text-xs sm:text-sm font-bold rounded-full px-3 py-1.5 tabular-nums ${
                    restante !== null && restante <= 60
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-sky-50 text-sky-700'
                  }`}
                  title={restante !== null ? 'Tempo restante' : 'Tempo decorrido'}
                >
                  <Timer className="w-4 h-4" />
                  {formatarTempo(restante !== null ? restante : decorridos)}
                </div>
              </div>
            )}
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Treino</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {fase === 'config' && (
          <Configuracao
            config={config}
            setConfig={setConfig}
            opcoes={opcoes}
            disponiveis={disponiveis.length}
            iniciar={iniciar}
          />
        )}

        {fase === 'prova' && prova.length > 0 && (
          <Prova
            prova={prova}
            indice={indice}
            setIndice={setIndice}
            respostas={respostas}
            responder={responder}
            finalizar={pedirFinalizar}
          />
        )}

        {fase === 'resultado' && resultado && (
          <Resultado resultado={resultado} reiniciar={reiniciar} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        ConcursoQuestões © 2024 — Modo Simulado
      </footer>
    </div>
  );
}

function TelaCentro({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center px-4 text-center">
      {children}
    </div>
  );
}

function Configuracao({ config, setConfig, opcoes, disponiveis, iniciar }) {
  const atualizar = (campo, valor) => setConfig((prev) => ({ ...prev, [campo]: valor }));
  const podeIniciar = disponiveis > 0;
  const efetivas = Math.min(config.quantidade, disponiveis);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Timer className="w-5 h-5 text-sky-600" />
            Monte seu simulado
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Escolha o recorte, a quantidade de questões e o tempo. As respostas contam no seu ranque
            ao finalizar.
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={LABEL_CLASS}>Disciplina</label>
              <select
                value={config.disciplina}
                onChange={(e) => atualizar('disciplina', e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="TODAS">Todas as disciplinas</option>
                {opcoes.disciplinas.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS}>Ano</label>
              <select
                value={config.ano}
                onChange={(e) => atualizar('ano', e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="TODOS">Todos os anos</option>
                {opcoes.anos.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS}>Nível</label>
              <select
                value={config.nivel}
                onChange={(e) => atualizar('nivel', e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="TODOS">Todos os níveis</option>
                {opcoes.niveis.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Quantidade de questões</label>
            <div className="flex flex-wrap gap-2">
              {QUANTIDADES.map((qtd) => (
                <button
                  key={qtd}
                  type="button"
                  onClick={() => atualizar('quantidade', qtd)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    config.quantidade === qtd
                      ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {qtd}
                </button>
              ))}
              <span className="self-center text-xs text-slate-500">
                {disponiveis} disponíveis
              </span>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Tempo de prova</label>
            <div className="flex flex-wrap gap-2">
              {DURACOES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => atualizar('duracao', d.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    config.duracao === d.id
                      ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {d.segundos === 0 ? <Clock className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
            {podeIniciar ? (
              <>
                Serão sorteadas <strong className="text-slate-900">{efetivas}</strong> questão(ões)
                {config.duracao === 'livre'
                  ? ' sem limite de tempo.'
                  : ` com ${DURACOES.find((d) => d.id === config.duracao)?.label} de tempo.`}
              </>
            ) : (
              <>Nenhuma questão encontrada com esse recorte. Ajuste os filtros.</>
            )}
          </div>

          <button
            type="button"
            onClick={iniciar}
            disabled={!podeIniciar}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-600 text-white font-bold text-sm hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-colors"
          >
            <Play className="w-4 h-4" />
            Iniciar simulado
          </button>
        </div>
      </div>
    </div>
  );
}

function Prova({ prova, indice, setIndice, respostas, responder, finalizar }) {
  const questao = prova[indice];
  const alternativas = Object.entries(questao.alternativas || {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const marcada = respostas[questao.id] || null;

  const separador = String(questao.enunciado || '').indexOf('\n\n');
  const textoApoio = separador > 0 ? questao.enunciado.slice(0, separador) : null;
  const comando = separador > 0 ? questao.enunciado.slice(separador + 2) : questao.enunciado;

  return (
    <div>
      {/* Navegador de questões */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 mb-5">
        <div className="flex flex-wrap gap-1.5">
          {prova.map((q, i) => {
            const respondida = !!respostas[q.id];
            const ativa = i === indice;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setIndice(i)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                  ativa
                    ? 'bg-sky-600 text-white ring-2 ring-sky-300'
                    : respondida
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title={`Questão ${i + 1}${respondida ? ' (respondida)' : ''}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <article className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50/90 px-4 sm:px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-mono font-bold text-slate-800 bg-slate-200/90 px-2 py-0.5 rounded">
              {indice + 1}/{prova.length}
            </span>
            <span className="font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded">
              {questao.disciplina}
            </span>
            <span className="font-medium text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
              {questao.assunto}
            </span>
            <span className="font-semibold text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded">
              {questao.banca} • {questao.ano}
            </span>
            <span className="text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded hidden sm:inline-block">
              {questao.cargo} ({questao.nivel})
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {textoApoio && (
            <details open className="mb-4 rounded-lg border border-slate-200 bg-slate-50/70">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800">
                Texto de apoio
              </summary>
              <div className="px-4 pb-3 pt-1 text-slate-800 whitespace-pre-line leading-relaxed text-sm sm:text-base">
                {textoApoio}
              </div>
            </details>
          )}

          <div className="text-slate-900 text-sm sm:text-base leading-relaxed mb-6 whitespace-pre-line">
            {comando}
          </div>

          <div className="space-y-2.5">
            {alternativas.map(([letra, textoAlt]) => {
              const selecionada = marcada === letra;
              return (
                <button
                  key={letra}
                  type="button"
                  onClick={() => responder(questao.id, letra)}
                  className={`w-full flex items-start gap-3 p-3 sm:p-3.5 rounded-lg border text-left text-xs sm:text-sm transition-all ${
                    selecionada
                      ? 'border-sky-500 bg-sky-50/70 text-sky-950 ring-1 ring-sky-500 font-medium'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center font-bold text-xs mt-0.5 ${
                      selecionada
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                  >
                    {letra}
                  </div>
                  <div className="flex-1 leading-relaxed pt-0.5">{textoAlt}</div>
                </button>
              );
            })}
          </div>
        </div>
      </article>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIndice(Math.max(indice - 1, 0))}
          disabled={indice === 0}
          className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Anterior
        </button>

        <button
          type="button"
          onClick={finalizar}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
        >
          <Flag className="w-4 h-4" />
          Finalizar
        </button>

        <button
          type="button"
          onClick={() => setIndice(Math.min(indice + 1, prova.length - 1))}
          disabled={indice === prova.length - 1}
          className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Próxima
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <p className="text-center text-[11px] text-slate-400 mt-3">
        Dica: use as setas ← → do teclado para navegar.
      </p>
    </div>
  );
}

function Resultado({ resultado, reiniciar }) {
  const { detalhes, acertos, erros, emBranco, tempo } = resultado;
  const total = detalhes.length;
  const percentual = total > 0 ? Math.round((acertos / total) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-6 text-center bg-gradient-to-br from-sky-50 to-white border-b border-slate-100">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-sky-100 text-sky-700 mb-3">
            <Trophy className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">Simulado concluído</h2>
          <p className="text-xs text-slate-500 mt-1">
            Tempo: <strong className="text-slate-700">{formatarTempo(tempo)}</strong> •{' '}
            {percentual}% de aproveitamento
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5">
          <Metrica icone={CheckCircle2} cor="emerald" rotulo="Acertos" valor={acertos} />
          <Metrica icone={XCircle} cor="rose" rotulo="Erros" valor={erros} />
          <Metrica icone={MinusCircle} cor="slate" rotulo="Em branco" valor={emBranco} />
          <Metrica icone={Timer} cor="sky" rotulo="Tempo" valor={formatarTempo(tempo)} texto />
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={reiniciar}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-600 text-white font-bold text-sm hover:bg-sky-700 shadow-sm transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Montar outro simulado
          </button>
          <Link
            to="/"
            className="mt-2 w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao treino
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
          Revisão das questões
        </h3>
        {detalhes.map((d, i) => {
          const q = d.questao;
          const alternativas = Object.entries(q.alternativas || {}).sort(([a], [b]) =>
            a.localeCompare(b)
          );
          const status = d.acertou ? 'acerto' : d.marcada ? 'erro' : 'branco';
          return (
            <details
              key={q.id}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                status === 'acerto'
                  ? 'border-emerald-200'
                  : status === 'erro'
                    ? 'border-rose-200'
                    : 'border-slate-200'
              }`}
            >
              <summary className="cursor-pointer select-none px-4 py-3 flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-slate-400">#{i + 1}</span>
                {status === 'acerto' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                {status === 'erro' && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                {status === 'branco' && <MinusCircle className="w-4 h-4 text-slate-400 shrink-0" />}
                <span className="font-medium text-slate-700 truncate flex-1">
                  {q.disciplina} • {q.assunto}
                </span>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  Gabarito: <strong className="text-slate-800">{q.gabarito}</strong>
                </span>
              </summary>
              <div className="px-4 pb-4 pt-1 border-t border-slate-100">
                <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-line mb-3 mt-3">
                  {q.enunciado}
                </div>
                <div className="space-y-1.5">
                  {alternativas.map(([letra, texto]) => {
                    const correta = letra === q.gabarito;
                    const escolhida = letra === d.marcada;
                    return (
                      <div
                        key={letra}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs sm:text-sm ${
                          correta
                            ? 'border-emerald-300 bg-emerald-50/60 text-emerald-900'
                            : escolhida
                              ? 'border-rose-300 bg-rose-50/60 text-rose-900'
                              : 'border-slate-100 text-slate-600'
                        }`}
                      >
                        <span className="font-bold w-4 shrink-0">{letra}</span>
                        <span className="flex-1 leading-relaxed">{texto}</span>
                        {correta && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                        {escolhida && !correta && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Sua resposta:{' '}
                  <strong className={d.acertou ? 'text-emerald-700' : d.marcada ? 'text-rose-700' : 'text-slate-500'}>
                    {d.marcada || 'em branco'}
                  </strong>{' '}
                  • Gabarito: <strong className="text-slate-800">{q.gabarito}</strong>
                </p>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

const CORES = {
  emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  rose: 'bg-rose-50 border-rose-100 text-rose-700',
  slate: 'bg-slate-50 border-slate-100 text-slate-600',
  sky: 'bg-sky-50 border-sky-100 text-sky-700'
};

function Metrica({ icone: Icone, cor, rotulo, valor }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${CORES[cor]}`}>
      <Icone className="w-4 h-4 mx-auto mb-1 opacity-80" />
      <span className="block text-[11px] font-medium opacity-80">{rotulo}</span>
      <span className="block text-lg font-extrabold mt-0.5">{valor}</span>
    </div>
  );
}
