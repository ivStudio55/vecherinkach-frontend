'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type GameKey = 'vecherinkach' | 'jokester' | 'creativach' | 'draw';

const GAME_LABELS: Record<GameKey, string> = {
  vecherinkach: '🎉 Вечеринкач',
  jokester: '🤡 Пошутикач',
  creativach: '🎨 Креативач',
  draw: '✏️ Рисункач',
};

const GAME_COLORS: Record<GameKey, string> = {
  vecherinkach: 'from-purple-600 to-pink-600',
  jokester: 'from-yellow-500 to-orange-600',
  creativach: 'from-green-500 to-teal-600',
  draw: 'from-blue-500 to-cyan-600',
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

/* ===== Drawing Modal ===== */
function DrawingModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold flex items-center justify-center">✕</button>
        <img src={src} alt="Рисунок" className="max-w-full max-h-[85vh] object-contain rounded-xl bg-white shadow-2xl" />
      </div>
    </div>
  );
}

export default function AnswersPage() {
  const router = useRouter();
  const [activeGame, setActiveGame] = useState<GameKey>('vecherinkach');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomFilter, setRoomFilter] = useState('');
  const [expandedChain, setExpandedChain] = useState<string | null>(null);
  const [drawingPreview, setDrawingPreview] = useState<string | null>(null);

  // Vecherinkach sub-round tab
  const [activeRound, setActiveRound] = useState<string>('round1');

  const apiFetch = useCallback(async (url: string) => {
    try {
      const res = await fetch(url);
      if (res.status === 401) { router.push('/ctrl-8f2q9z/login'); return null; }
      return await res.json();
    } catch { return null; }
  }, [router]);

  const loadAnswers = useCallback(async () => {
    setLoading(true);
    setData(null);
    const params = new URLSearchParams({ game: activeGame, page: String(page) });
    if (roomFilter.trim()) params.set('roomId', roomFilter.trim());
    const result = await apiFetch(`/api/panel/answers?${params}`);
    if (result) setData(result);
    setLoading(false);
  }, [activeGame, page, roomFilter, apiFetch]);

  useEffect(() => { loadAnswers(); }, [loadAnswers]);

  // Reset page & round when switching games
  useEffect(() => {
    setPage(1);
    setActiveRound('round1');
    setRoomFilter('');
    setExpandedChain(null);
  }, [activeGame]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Drawing fullscreen preview */}
      {drawingPreview && <DrawingModal src={drawingPreview} onClose={() => setDrawingPreview(null)} />}

      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/ctrl-8f2q9z')} className="text-gray-400 hover:text-white text-sm">← Панель</button>
            <h1 className="text-lg font-bold">📋 Ответы игроков</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Game Tabs */}
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(GAME_LABELS) as GameKey[]).map(g => (
            <button
              key={g}
              onClick={() => setActiveGame(g)}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                activeGame === g
                  ? `bg-gradient-to-r ${GAME_COLORS[g]} text-white shadow-lg`
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {GAME_LABELS[g]}
            </button>
          ))}
        </div>

        {/* Room filter */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-400">Фильтр по Room ID:</label>
          <input
            type="text"
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
            placeholder="UUID комнаты (необязательно)"
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white w-80"
          />
          <button onClick={() => { setPage(1); loadAnswers(); }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold">
            🔍 Показать
          </button>
          {roomFilter && (
            <button onClick={() => { setRoomFilter(''); setPage(1); }} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
              ✕ Сброс
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-16 text-center text-gray-400 animate-pulse">Загрузка...</div>
        ) : !data ? (
          <div className="py-16 text-center text-gray-500">Ошибка загрузки</div>
        ) : (
          <>
            {activeGame === 'vecherinkach' && <VecherinkachView data={data} activeRound={activeRound} setActiveRound={setActiveRound} />}
            {activeGame === 'jokester' && <JokesterView data={data} />}
            {activeGame === 'creativach' && <CreativachView data={data} />}
            {activeGame === 'draw' && (
              <DrawView
                data={data}
                expandedChain={expandedChain}
                setExpandedChain={setExpandedChain}
                onPreviewDrawing={setDrawingPreview}
              />
            )}
          </>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg text-sm font-bold"
          >
            ← Назад
          </button>
          <span className="text-gray-400 text-sm">Стр. {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-bold"
          >
            Далее →
          </button>
        </div>
      </main>
    </div>
  );
}

/* ================ VECHERINKACH ================ */
function VecherinkachView({ data, activeRound, setActiveRound }: {
  data: Record<string, unknown>;
  activeRound: string;
  setActiveRound: (r: string) => void;
}) {
  const rounds = [
    { key: 'round1', label: 'Раунд 1 — Классика' },
    { key: 'round2', label: 'Раунд 2 — Факт/Фикция' },
    { key: 'round3', label: 'Раунд 3 — Открытый' },
    { key: 'round4', label: 'Раунд 4 — Дешифровщик' },
    { key: 'round5', label: 'Раунд 5 — Открытый' },
  ];

  const items = (data[activeRound] as Record<string, unknown>[] | undefined) ?? [];

  return (
    <div className="space-y-3">
      {/* Round sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {rounds.map(r => (
          <button
            key={r.key}
            onClick={() => setActiveRound(r.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeRound === r.key ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {r.label} ({((data[r.key] as unknown[]) ?? []).length})
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">Нет ответов</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-400 font-medium">Комната</th>
                  <th className="px-3 py-2 text-left text-gray-400 font-medium">Игрок</th>
                  {activeRound === 'round1' && <th className="px-3 py-2 text-left text-gray-400 font-medium">Вопрос №</th>}
                  {activeRound === 'round2' && <th className="px-3 py-2 text-left text-gray-400 font-medium">Пункт №</th>}
                  {activeRound === 'round2' && <th className="px-3 py-2 text-left text-gray-400 font-medium">Факт?</th>}
                  {(activeRound === 'round3' || activeRound === 'round5') && <th className="px-3 py-2 text-left text-gray-400 font-medium">Вопрос №</th>}
                  {activeRound === 'round4' && <th className="px-3 py-2 text-left text-gray-400 font-medium">Пазл</th>}
                  <th className="px-3 py-2 text-left text-gray-400 font-medium">Ответ</th>
                  <th className="px-3 py-2 text-center text-gray-400 font-medium">Верно</th>
                  <th className="px-3 py-2 text-center text-gray-400 font-medium">Очки</th>
                  <th className="px-3 py-2 text-left text-gray-400 font-medium">Время</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a: Record<string, unknown>, i: number) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-3 py-2 font-mono text-blue-400 text-xs">{String(a.room_code ?? '—')}</td>
                    <td className="px-3 py-2 font-bold text-white">{String(a.player_name ?? '—')}</td>
                    {activeRound === 'round1' && <td className="px-3 py-2 text-gray-300">Q{String(a.question_index ?? '')}</td>}
                    {activeRound === 'round2' && <td className="px-3 py-2 text-gray-300">#{String(a.round2_item_index ?? '')}</td>}
                    {activeRound === 'round2' && <td className="px-3 py-2">{a.showing_fact ? '✅ Факт' : '❌ Фикция'}</td>}
                    {(activeRound === 'round3' || activeRound === 'round5') && <td className="px-3 py-2 text-gray-300">Q{String(a.question_index ?? '')}</td>}
                    {activeRound === 'round4' && <td className="px-3 py-2 text-gray-300">#{String(a.puzzle_id ?? '')}</td>}
                    <td className="px-3 py-2 text-gray-300 break-all max-w-xs">
                      {String(a.text ?? a.answer_text ?? '—')}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {a.is_correct !== undefined && a.is_correct !== null ? (
                        <span className={a.is_correct ? 'text-green-400' : 'text-red-400'}>{a.is_correct ? '✅' : '❌'}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-yellow-400">
                      {a.points_earned !== undefined && a.points_earned !== null ? `+${a.points_earned}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(String(a.submitted_at ?? ''))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================ JOKESTER ================ */
function JokesterView({ data }: { data: Record<string, unknown> }) {
  const answers = (data.answers as Record<string, unknown>[]) ?? [];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="font-bold text-sm">Ответы в дуэлях ({answers.length})</h2>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {answers.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">Нет ответов</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Комната</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Раунд</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Игрок</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Вопрос</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Ответ</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Время</th>
              </tr>
            </thead>
            <tbody>
              {answers.map((a, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-3 py-2 font-mono text-blue-400 text-xs">{String(a.room_code ?? '—')}</td>
                  <td className="px-3 py-2 text-gray-300">R{String(a.round ?? '?')} D{String(a.duel_index ?? '?')}</td>
                  <td className="px-3 py-2 font-bold text-white">{String(a.player_name ?? '—')}</td>
                  <td className="px-3 py-2 text-gray-400 max-w-xs truncate" title={String(a.question_text ?? '')}>
                    {String(a.question_text ?? '—').slice(0, 60)}{String(a.question_text ?? '').length > 60 ? '…' : ''}
                  </td>
                  <td className="px-3 py-2 text-gray-300 break-all max-w-sm">{String(a.answer_text ?? '—')}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(String(a.submitted_at ?? ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ================ CREATIVACH ================ */
function CreativachView({ data }: { data: Record<string, unknown> }) {
  const answers = (data.answers as Record<string, unknown>[]) ?? [];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="font-bold text-sm">Ответы ({answers.length})</h2>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {answers.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">Нет ответов</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Комната</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Раунд</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Задание</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Игрок</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Ответ</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Время</th>
              </tr>
            </thead>
            <tbody>
              {answers.map((a, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-3 py-2 font-mono text-blue-400 text-xs">{String(a.room_code ?? '—')}</td>
                  <td className="px-3 py-2 text-gray-300">R{String(a.round ?? '?')}</td>
                  <td className="px-3 py-2 text-gray-400 max-w-xs truncate" title={String(a.round_task ?? '')}>
                    {String(a.round_task ?? '—').slice(0, 50)}
                  </td>
                  <td className="px-3 py-2 font-bold text-white">{String(a.player_name ?? '—')}</td>
                  <td className="px-3 py-2 text-gray-300 break-all max-w-sm">{String(a.answer_text ?? '—')}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(String(a.submitted_at ?? ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ================ DRAW (РИСУНКАЧ) ================ */
function DrawView({ data, expandedChain, setExpandedChain, onPreviewDrawing }: {
  data: Record<string, unknown>;
  expandedChain: string | null;
  setExpandedChain: (id: string | null) => void;
  onPreviewDrawing: (src: string) => void;
}) {
  const chains = (data.chains as Record<string, unknown>[]) ?? [];
  const steps = (data.steps as Record<string, unknown>[]) ?? [];

  const getStepsForChain = (chainId: string) =>
    steps.filter(s => s.chain_id === chainId).sort((a, b) => (a.step_number as number) - (b.step_number as number));

  return (
    <div className="space-y-3">
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="font-bold text-sm">🔗 Цепочки рисунков ({chains.length})</h2>
          <p className="text-xs text-gray-500 mt-1">Нажмите на цепочку, чтобы увидеть шаги и рисунки</p>
        </div>
        <div className="max-h-[700px] overflow-y-auto">
          {chains.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">Нет данных</div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {chains.map((c) => {
                const chainId = c.id as string;
                const isExpanded = expandedChain === chainId;
                const chainSteps = isExpanded ? getStepsForChain(chainId) : [];

                return (
                  <div key={chainId}>
                    {/* Chain header */}
                    <button
                      onClick={() => setExpandedChain(isExpanded ? null : chainId)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-800/30 transition-colors text-left"
                    >
                      <span className="text-gray-500 text-sm">{isExpanded ? '▼' : '▶'}</span>
                      <span className="font-mono text-blue-400 text-xs">{String(c.room_code ?? '—')}</span>
                      <span className="text-gray-400 text-xs">R{String(c.round ?? '?')} #{String(c.chain_index ?? '?')}</span>
                      <span className="font-bold text-white text-sm">«{String(c.original_word ?? '—')}»</span>
                      <span className="text-gray-500 text-xs ml-auto">{formatDate(String(c.created_at ?? ''))}</span>
                    </button>

                    {/* Expanded steps */}
                    {isExpanded && (
                      <div className="px-4 pb-4">
                        {chainSteps.length === 0 ? (
                          <div className="text-gray-500 text-xs py-2 pl-6">Нет шагов</div>
                        ) : (
                          <div className="grid gap-3 pl-6">
                            {chainSteps.map((s, idx) => {
                              const hasDrawing = !!s.drawing_data;
                              const hasGuess = !!s.guess;
                              const isFirstStep = idx === 0;

                              return (
                                <div key={s.id as string} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                                  <div className="flex items-start gap-3">
                                    {/* Step info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 font-bold">
                                          Шаг {String(s.step_number)}
                                        </span>
                                        <span className="font-bold text-white text-sm">{String(s.player_name ?? '—')}</span>
                                        {isFirstStep && s.target_word ? (
                                          <span className="text-xs text-purple-400">Слово: «{String(s.target_word)}»</span>
                                        ) : null}
                                      </div>

                                      {hasGuess && (
                                        <div className="mt-1">
                                          <span className="text-xs text-gray-500">Угадал: </span>
                                          <span className="text-sm text-yellow-300 font-medium">{String(s.guess)}</span>
                                          {s.is_correct !== undefined && s.is_correct !== null && (
                                            <span className={`ml-2 text-sm ${s.is_correct ? 'text-green-400' : 'text-red-400'}`}>
                                              {s.is_correct ? '✅' : '❌'}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {!hasDrawing && !hasGuess && s.submitted ? (
                                        <div className="text-xs text-gray-500 mt-1">Пустой ответ</div>
                                      ) : null}
                                      {!s.submitted && (
                                        <div className="text-xs text-orange-400 mt-1">Не отправлено</div>
                                      )}
                                    </div>

                                    {/* Drawing thumbnail */}
                                    {hasDrawing && (
                                      <button
                                        onClick={() => onPreviewDrawing(s.drawing_data as string)}
                                        className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-600 hover:border-blue-500 transition-colors cursor-pointer bg-white"
                                        title="Нажмите для увеличения"
                                      >
                                        <img
                                          src={s.drawing_data as string}
                                          alt="Рисунок"
                                          className="w-full h-full object-contain"
                                        />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
