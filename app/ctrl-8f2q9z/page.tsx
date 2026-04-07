'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/* ===== Types ===== */
type GameKey = 'vecherinkach' | 'jokester' | 'creativach' | 'draw' | 'uno';

interface Totals {
  vecherinkach: { rooms: number; players: number; answers: number };
  jokester: { rooms: number; players: number; duels: number };
  creativach: { rooms: number; players: number; answers: number };
  draw: { rooms: number; players: number };
  uno: { rooms: number; players: number };
}

interface RoomRow {
  id: string;
  code: string;
  status: string;
  created_at: string;
  player_count: number;
  is_active?: boolean;
  current_round?: number;
  current_question_index?: number;
  mode?: string;
}

interface RoomDetail {
  room: Record<string, unknown>;
  players: Record<string, unknown>[];
  answers?: Record<string, unknown>[];
  duels?: Record<string, unknown>[];
  votes?: Record<string, unknown>[];
  chains?: Record<string, unknown>[];
}

interface StreamRow {
  id: string;
  title: string;
  url: string;
  scheduled_at: string;
  is_live: boolean;
  created_at: string;
  updated_at: string;
}

const GAME_LABELS: Record<GameKey, string> = {
  vecherinkach: '🎉 Вечеринкач',
  jokester: '🤡 Пошутикач',
  creativach: '🎨 Креативач',
  draw: '✏️ Рисункач',
  uno: '🃏 UNO',
};

const GAME_COLORS: Record<GameKey, string> = {
  vecherinkach: 'from-purple-600 to-pink-600',
  jokester: 'from-yellow-500 to-orange-600',
  creativach: 'from-green-500 to-teal-600',
  draw: 'from-blue-500 to-cyan-600',
  uno: 'from-red-500 to-rose-600',
};

/* ===== Helpers ===== */
function StatusBadge({ status, isActive }: { status: string; isActive?: boolean }) {
  const isLive = isActive !== false && !['finished', 'closed'].includes(status);
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isLive ? 'bg-green-500/20 text-green-400' : 'bg-gray-600/30 text-gray-400'}`}>
      {status}
    </span>
  );
}

function KpiCard({ label, value, sub, gradient }: { label: string; value: number | string; sub?: string; gradient?: string }) {
  return (
    <div className={`rounded-xl p-4 bg-gradient-to-br ${gradient || 'from-gray-700 to-gray-800'} border border-gray-600/50`}>
      <div className="text-3xl font-black text-white">{value}</div>
      <div className="text-sm text-gray-300 font-medium">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

/* ===== Main Dashboard ===== */
export default function PanelDashboard() {
  const router = useRouter();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [activeGame, setActiveGame] = useState<GameKey>('vecherinkach');
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [roomDetail, setRoomDetail] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [streamsList, setStreamsList] = useState<StreamRow[]>([]);
  const [streamEdit, setStreamEdit] = useState<Partial<StreamRow> | null>(null);
  const [streamSaving, setStreamSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const dateQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set('from', dateFrom);
    if (dateTo) p.set('to', dateTo);
    return p.toString() ? `&${p.toString()}` : '';
  }, [dateFrom, dateTo]);

  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    try {
      const res = await fetch(url, opts);
      if (res.status === 401) { router.push('/ctrl-8f2q9z/login'); return null; }
      return await res.json();
    } catch {
      return null;
    }
  }, [router]);

  // Load totals
  const loadStats = useCallback(() => {
    const dq = dateQuery();
    apiFetch(`/api/panel/stats?_=1${dq}`).then(data => {
      if (data) setTotals(data.totals);
      setLoading(false);
    });
  }, [apiFetch, dateQuery]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Load rooms when game tab or date changes
  const loadRooms = useCallback(() => {
    setRooms([]);
    setSelectedRoom(null);
    setRoomDetail(null);
    const dq = dateQuery();
    apiFetch(`/api/panel/rooms?game=${activeGame}${dq}`).then(data => {
      if (data) setRooms(data.rooms ?? []);
    });
  }, [activeGame, apiFetch, dateQuery]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // Load room detail
  const openRoom = useCallback(async (roomId: string) => {
    setSelectedRoom(roomId);
    setRoomDetail(null);
    const data = await apiFetch(`/api/panel/room-detail?game=${activeGame}&roomId=${roomId}`);
    if (data) setRoomDetail(data);
  }, [activeGame, apiFetch]);

  // Room actions
  const doAction = useCallback(async (roomId: string, action: string) => {
    const confirmMsg: Record<string, string> = {
      delete: 'Удалить комнату? Это действие необратимо!',
      close: 'Закрыть комнату?',
      reopen: 'Переоткрыть комнату?',
      next_question: 'Перейти к следующему вопросу?',
    };
    if (confirmMsg[action] && !confirm(confirmMsg[action])) return;

    setActionLoading(action);
    try {
      const data = await apiFetch('/api/panel/room-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: activeGame, roomId, action }),
      });
      if (data?.ok) {
        showToast(`✅ ${action} выполнено`);
        loadRooms();
        if (action === 'delete') { setSelectedRoom(null); setRoomDetail(null); }
        else if (selectedRoom === roomId) openRoom(roomId);
      } else {
        showToast(`❌ Ошибка: ${data?.error || 'unknown'}`);
      }
    } finally {
      setActionLoading(null);
    }
  }, [activeGame, apiFetch, loadRooms, openRoom, selectedRoom]);

  const handleLogout = async () => {
    await fetch('/api/panel/logout', { method: 'POST' });
    router.push('/ctrl-8f2q9z/login');
  };

  // --- Streams management ---
  const loadStreams = useCallback(async () => {
    const data = await apiFetch('/api/panel/streams');
    if (data) setStreamsList(data);
  }, [apiFetch]);

  useEffect(() => { loadStreams(); }, [loadStreams]);

  const saveStream = async () => {
    if (!streamEdit) return;
    const { id, title, url, scheduled_at, is_live } = streamEdit;
    if (!title || !url || !scheduled_at) {
      showToast('❗ Заполните название, ссылку и дату');
      return;
    }
    setStreamSaving(true);
    try {
      const method = id ? 'PUT' : 'POST';
      // Convert datetime-local value to ISO string for the API
      const isoDate = scheduled_at && !scheduled_at.includes('T') ? new Date(scheduled_at).toISOString() : scheduled_at;
      const data = await apiFetch('/api/panel/streams', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title, url, scheduled_at: isoDate, is_live: is_live ?? false }),
      });
      if (data && !data.error) {
        showToast(id ? '✅ Трансляция обновлена' : '✅ Трансляция добавлена');
        setStreamEdit(null);
        loadStreams();
      } else {
        showToast(`❌ ${data?.error || 'Ошибка'}`);
      }
    } finally {
      setStreamSaving(false);
    }
  };

  const deleteStream = async (streamId: string) => {
    if (!confirm('Удалить трансляцию?')) return;
    const data = await apiFetch(`/api/panel/streams?id=${streamId}`, { method: 'DELETE' });
    if (data?.ok) {
      showToast('✅ Удалено');
      loadStreams();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-lg animate-pulse">Загрузка...</div>
      </div>
    );
  }

  const totalRooms = totals ? Object.values(totals).reduce((s, g) => s + (g.rooms ?? 0), 0) : 0;
  const totalPlayers = totals ? Object.values(totals).reduce((s, g) => s + (g.players ?? 0), 0) : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <h1 className="text-lg font-bold whitespace-nowrap">⚙️ Панель управления</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-gray-400">От:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-white [color-scheme:dark]"
            />
            <label className="text-xs text-gray-400">До:</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-white [color-scheme:dark]"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300"
              >
                ✕ Сброс
              </button>
            )}
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-400 transition-colors whitespace-nowrap">
            Выйти
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Quick links */}
        <div className="flex gap-2">
          <button onClick={() => router.push('/ctrl-8f2q9z/packs')} className="px-4 py-2 bg-purple-600/80 hover:bg-purple-500 rounded-lg text-sm font-bold transition-colors">
            📦 Пакеты вопросов
          </button>
          <button onClick={() => router.push('/ctrl-8f2q9z/jokester-packs')} className="px-4 py-2 bg-amber-600/80 hover:bg-amber-500 rounded-lg text-sm font-bold transition-colors">
            🤡 Пакеты Пошутикач
          </button>
          <button onClick={() => router.push('/ctrl-8f2q9z/categories')} className="px-4 py-2 bg-orange-600/80 hover:bg-orange-500 rounded-lg text-sm font-bold transition-colors">
            🎭 Категории Р4
          </button>
          <button onClick={() => router.push('/ctrl-8f2q9z/answers')} className="px-4 py-2 bg-cyan-600/80 hover:bg-cyan-500 rounded-lg text-sm font-bold transition-colors">
            📋 Ответы игроков
          </button>
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Всего комнат" value={totalRooms} gradient="from-indigo-600 to-purple-700" />
          <KpiCard label="Всего игроков" value={totalPlayers} gradient="from-emerald-600 to-green-700" />
          {totals && <KpiCard label="Ответов (Вечеринкач)" value={totals.vecherinkach.answers} gradient="from-pink-600 to-rose-700" />}
          {totals && <KpiCard label="Дуэлей (Пошутикач)" value={totals.jokester.duels} gradient="from-amber-600 to-orange-700" />}
        </div>

        {/* Per-game KPIs */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(Object.keys(GAME_LABELS) as GameKey[]).map(g => (
              <KpiCard
                key={g}
                label={GAME_LABELS[g]}
                value={totals[g].rooms}
                sub={`${totals[g].players} игроков`}
                gradient={GAME_COLORS[g]}
              />
            ))}
          </div>
        )}

        {/* Game Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
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

        {/* Rooms List + Detail */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Rooms table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-bold text-sm">Комнаты — {GAME_LABELS[activeGame]}</h2>
              <span className="text-xs text-gray-500">{rooms.length} шт.</span>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {rooms.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">Нет данных</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Код</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Статус</th>
                      <th className="px-3 py-2 text-center text-gray-400 font-medium">👥</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map(r => (
                      <tr
                        key={r.id}
                        onClick={() => openRoom(r.id)}
                        className={`border-b border-gray-800/50 cursor-pointer transition-colors ${
                          selectedRoom === r.id ? 'bg-blue-900/20' : 'hover:bg-gray-800/50'
                        }`}
                      >
                        <td className="px-3 py-2 font-mono font-bold text-blue-400">{r.code}</td>
                        <td className="px-3 py-2"><StatusBadge status={r.status} isActive={r.is_active} /></td>
                        <td className="px-3 py-2 text-center text-gray-300">{r.player_count}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Room Detail */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {!selectedRoom ? (
              <div className="p-8 text-center text-gray-500 text-sm">← Выберите комнату для просмотра</div>
            ) : !roomDetail ? (
              <div className="p-8 text-center text-gray-400 animate-pulse">Загрузка...</div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                  <h2 className="font-bold text-sm">
                    Комната #{(roomDetail.room as Record<string, string>).code}
                  </h2>
                  <div className="flex gap-2">
                    {activeGame === 'vecherinkach' && (
                      <button
                        onClick={() => doAction(selectedRoom, 'next_question')}
                        disabled={actionLoading === 'next_question'}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs font-bold"
                      >
                        ⏭ Сл. вопрос
                      </button>
                    )}
                    <button
                      onClick={() => doAction(selectedRoom, 'close')}
                      disabled={!!actionLoading}
                      className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 rounded text-xs font-bold"
                    >
                      🔒 Закрыть
                    </button>
                    <button
                      onClick={() => doAction(selectedRoom, 'reopen')}
                      disabled={!!actionLoading}
                      className="px-2 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-xs font-bold"
                    >
                      🔓 Открыть
                    </button>
                    <button
                      onClick={() => doAction(selectedRoom, 'delete')}
                      disabled={!!actionLoading}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-xs font-bold"
                    >
                      🗑 Удалить
                    </button>
                  </div>
                </div>

                {/* Room info */}
                <div className="px-4 py-3 border-b border-gray-800">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(roomDetail.room).filter(([k]) => !['id', 'host_id', 'selected_question_ids', 'draw_pile', 'discard_pile', 'hands'].includes(k)).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-gray-500 font-medium">{k}:</span>
                        <span className="text-gray-300 break-all">{
                          v === null ? '—' : typeof v === 'boolean' ? (v ? '✅' : '❌') : String(v)
                        }</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Players */}
                <div className="px-4 py-3 border-b border-gray-800">
                  <h3 className="text-sm font-bold text-gray-300 mb-2">👥 Игроки ({roomDetail.players.length})</h3>
                  {roomDetail.players.length === 0 ? (
                    <p className="text-gray-500 text-xs">Нет</p>
                  ) : (
                    <div className="space-y-1">
                      {roomDetail.players.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs bg-gray-800/50 px-2 py-1 rounded">
                          <span className="font-bold text-white">{(p.name as string) || '—'}</span>
                          {p.total_points !== undefined && <span className="text-yellow-400">{String(p.total_points)} pts</span>}
                          {p.role ? <span className="text-gray-500">{String(p.role)}</span> : null}
                          {p.is_host ? <span className="text-blue-400">🎙 host</span> : null}
                          {p.score !== undefined && <span className="text-green-400">{String(p.score)} score</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Answers (vecherinkach / creativach) */}
                {roomDetail.answers && roomDetail.answers.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-800">
                    <h3 className="text-sm font-bold text-gray-300 mb-2">📝 Ответы ({roomDetail.answers.length})</h3>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {roomDetail.answers.map((a, i) => (
                        <div key={i} className="text-xs bg-gray-800/50 px-2 py-1 rounded flex gap-2">
                          {a.question_index !== undefined && <span className="text-gray-500">Q{String(a.question_index)}</span>}
                          {a.round !== undefined && <span className="text-gray-500">R{String(a.round)}</span>}
                          <span className="text-gray-300 break-all">{(a.text as string) || (a.answer_text as string) || '—'}</span>
                          {a.is_correct !== undefined && (
                            <span className={a.is_correct ? 'text-green-400' : 'text-red-400'}>{a.is_correct ? '✅' : '❌'}</span>
                          )}
                          {a.points_earned !== undefined && <span className="text-yellow-400">+{String(a.points_earned)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Duels (jokester) */}
                {roomDetail.duels && roomDetail.duels.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-800">
                    <h3 className="text-sm font-bold text-gray-300 mb-2">⚔️ Дуэли ({roomDetail.duels.length})</h3>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {roomDetail.duels.map((d, i) => (
                        <div key={i} className="text-xs bg-gray-800/50 px-2 py-1 rounded flex gap-2">
                          <span className="text-gray-500">R{String(d.round)} D{String(d.duel_index)}</span>
                          <span className="text-gray-300">{String(d.question1_text || '—').slice(0, 50)}</span>
                          <StatusBadge status={String(d.status)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Votes (creativach) */}
                {roomDetail.votes && roomDetail.votes.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-800">
                    <h3 className="text-sm font-bold text-gray-300 mb-2">🗳 Голоса ({roomDetail.votes.length})</h3>
                    <div className="text-xs text-gray-400">
                      {Array.from(new Set(roomDetail.votes.map(v => v.round))).map(round => {
                        const roundVotes = roomDetail.votes!.filter(v => v.round === round);
                        return <div key={String(round)}>Раунд {String(round)}: {roundVotes.length} голосов</div>;
                      })}
                    </div>
                  </div>
                )}

                {/* Chains (draw) */}
                {roomDetail.chains && roomDetail.chains.length > 0 && (
                  <div className="px-4 py-3">
                    <h3 className="text-sm font-bold text-gray-300 mb-2">🔗 Цепочки ({roomDetail.chains.length})</h3>
                    <div className="space-y-1">
                      {roomDetail.chains.map((c, i) => (
                        <div key={i} className="text-xs bg-gray-800/50 px-2 py-1 rounded flex gap-2">
                          <span className="text-gray-500">R{String(c.round)} #{String(c.chain_index)}</span>
                          <span className="text-gray-300">«{String(c.original_word)}»</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Streams management section */}
      <section className="max-w-7xl mx-auto px-4 pb-8 space-y-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-bold text-sm">📺 Трансляции ({streamsList.length})</h2>
            <button
              onClick={() => setStreamEdit({ title: '', url: '', scheduled_at: '', is_live: false })}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-bold"
            >
              + Добавить
            </button>
          </div>

          {/* Edit/Create form */}
          {streamEdit && (
            <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/50 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Название</label>
                  <input
                    type="text"
                    value={streamEdit.title || ''}
                    onChange={e => setStreamEdit({ ...streamEdit, title: e.target.value })}
                    placeholder="Название трансляции"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Ссылка</label>
                  <input
                    type="url"
                    value={streamEdit.url || ''}
                    onChange={e => setStreamEdit({ ...streamEdit, url: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Дата и время</label>
                  <input
                    type="datetime-local"
                    value={streamEdit.scheduled_at || ''}
                    onChange={e => setStreamEdit({ ...streamEdit, scheduled_at: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white [color-scheme:dark]"
                  />
                </div>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={streamEdit.is_live || false}
                      onChange={e => setStreamEdit({ ...streamEdit, is_live: e.target.checked })}
                      className="w-4 h-4"
                    />
                    LIVE сейчас
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveStream}
                  disabled={streamSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs font-bold"
                >
                  {streamSaving ? 'Сохранение...' : streamEdit.id ? 'Сохранить' : 'Добавить'}
                </button>
                <button
                  onClick={() => setStreamEdit(null)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Streams list */}
          <div className="max-h-[400px] overflow-y-auto">
            {streamsList.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">Нет трансляций</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-400 font-medium">Название</th>
                    <th className="px-3 py-2 text-left text-gray-400 font-medium">Дата/время</th>
                    <th className="px-3 py-2 text-center text-gray-400 font-medium">Live</th>
                    <th className="px-3 py-2 text-right text-gray-400 font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {streamsList.map(s => (
                    <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                      <td className="px-3 py-2">
                        <div className="font-bold text-white">{s.title}</div>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs break-all">{s.url}</a>
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{formatDate(s.scheduled_at)}</td>
                      <td className="px-3 py-2 text-center">
                        {s.is_live ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 animate-pulse">LIVE</span> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => {
                              // Convert ISO date back to datetime-local format for editing
                              const localDt = s.scheduled_at ? s.scheduled_at.slice(0, 16) : '';
                              setStreamEdit({ ...s, scheduled_at: localDt });
                            }}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteStream(s.id)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
