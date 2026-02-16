'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionCard, KpiCard, BarChart, MetricRow, StatusBadge } from '@/components/admin/AdminWidgets';
import type { SeriesPoint } from '@/components/admin/AdminWidgets';

/* ─── Types ─── */

type DrawRoomRow = {
  id: string;
  code: string;
  mode: string;
  status: string;
  current_round: number;
  current_step: number;
  total_steps: number;
  voting_chain_index: number;
  step_duration: number;
  created_at: string;
  updated_at?: string;
  player_count: number;
};

type Analytics = {
  kpis: {
    totalRooms: number;
    roomsInPeriod: number;
    finishedRooms: number;
    activeRooms: number;
    totalPlayers: number;
    playersInPeriod: number;
    avgPlayers: number;
    avgDurationMin: number;
    totalDrawings: number;
    totalVotes: number;
    correctGuesses: number;
    totalGuesses: number;
    guessAccuracy: number;
  };
  modeDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  timeline: SeriesPoint[];
  repeatPlayers: { total: number; repeat: number; percentage: number };
  roundsReached: Record<number, number>;
};

type RoomDetails = {
  room: Record<string, unknown>;
  players: Array<{ id: string; name: string; is_host: boolean; seat: number; score: number; joined_at: string }>;
  chains: Array<{ id: string; round: number; chain_index: number; original_word: string; created_at: string }>;
  steps: Array<{
    id: string;
    chain_id: string;
    step_number: number;
    player_id: string;
    target_word: string | null;
    guess: string | null;
    drawing_data: string | null;
    is_correct: boolean;
    submitted: boolean;
    created_at: string;
  }>;
  votes: Array<{
    id: string;
    round: number;
    chain_id: string;
    voter_id: string;
    voted_for_player_id: string;
    created_at: string;
  }>;
  playerNames: Record<string, string>;
};

const STATUS_LABELS: Record<string, string> = {
  lobby: '⏳ Лобби',
  playing: '🎮 Играет',
  voting: '🗳️ Голосование',
  results: '📊 Результаты',
  finished: '🏆 Завершена',
  closed: '🔒 Закрыта',
};

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  lobby: 'warning',
  playing: 'success',
  voting: 'info',
  results: 'info',
  finished: 'neutral',
  closed: 'error',
};

const MODE_LABELS: Record<string, string> = {
  russian: '🇷🇺 Русский',
  english: '🇬🇧 English',
  free: '✏️ Свободный',
};

const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleString('ru-RU') : '—');
const formatNum = (v: number) => v.toLocaleString('ru-RU');

/* ─── Tab type ─── */
type Tab = 'overview' | 'rooms' | 'gallery';

export default function AdminDrawPage() {
  const [tab, setTab] = useState<Tab>('overview');

  // ─── Analytics state ───
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // ─── Rooms list state ───
  const [rooms, setRooms] = useState<DrawRoomRow[]>([]);
  const [roomsTotal, setRoomsTotal] = useState(0);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');

  // ─── Room details state ───
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [galleryRound, setGalleryRound] = useState<number>(0); // 0 = all

  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  /* ─── Load analytics ─── */
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/draw-analytics?days=${analyticsDays}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnalytics(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки аналитики');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsDays]);

  /* ─── Load rooms ─── */
  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      if (modeFilter) params.set('mode', modeFilter);
      const res = await fetch(`/api/admin/draw-rooms?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRooms(data.rooms || []);
      setRoomsTotal(data.total || 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки комнат');
    } finally {
      setRoomsLoading(false);
    }
  }, [statusFilter, modeFilter]);

  /* ─── Load room details ─── */
  const loadRoomDetails = useCallback(async (roomId: string) => {
    setDetailsLoading(true);
    setSelectedRoomId(roomId);
    setSelectedChainId(null);
    setGalleryRound(0);
    try {
      const res = await fetch(`/api/admin/draw-room-details?id=${roomId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRoomDetails(data);
      setTab('gallery');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки деталей');
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  /* ─── Room actions ─── */
  const handleClose = async (roomId: string) => {
    if (!confirm('Закрыть комнату?')) return;
    try {
      const res = await fetch('/api/admin/draw-rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: roomId, status: 'finished' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionMessage('Комната закрыта');
      loadRooms();
    } catch {
      setActionMessage('Ошибка закрытия');
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleDelete = async (roomId: string) => {
    if (!confirm('Удалить комнату и все данные? Это необратимо.')) return;
    try {
      const res = await fetch(`/api/admin/draw-rooms?id=${roomId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionMessage('Комната удалена');
      if (selectedRoomId === roomId) {
        setSelectedRoomId(null);
        setRoomDetails(null);
      }
      loadRooms();
    } catch {
      setActionMessage('Ошибка удаления');
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  /* ─── Effects ─── */
  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);
  useEffect(() => { loadRooms(); }, [loadRooms]);

  /* ─── Derived data for gallery ─── */
  const detailChains = useMemo(() => {
    if (!roomDetails) return [];
    let filtered = roomDetails.chains;
    if (galleryRound > 0) filtered = filtered.filter(c => c.round === galleryRound);
    return filtered;
  }, [roomDetails, galleryRound]);

  const selectedChainSteps = useMemo(() => {
    if (!roomDetails || !selectedChainId) return [];
    return roomDetails.steps
      .filter(s => s.chain_id === selectedChainId)
      .sort((a, b) => a.step_number - b.step_number);
  }, [roomDetails, selectedChainId]);

  const allDrawings = useMemo(() => {
    if (!roomDetails) return [];
    return roomDetails.steps
      .filter(s => s.drawing_data)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [roomDetails]);

  const gamePlayers = useMemo(() => {
    if (!roomDetails) return [];
    return roomDetails.players.filter(p => !p.is_host).sort((a, b) => b.score - a.score);
  }, [roomDetails]);

  const roundsInRoom = useMemo(() => {
    if (!roomDetails) return [];
    const rounds = new Set(roomDetails.chains.map(c => c.round));
    return Array.from(rounds).sort((a, b) => a - b);
  }, [roomDetails]);

  const k = analytics?.kpis;

  return (
    <div className="space-y-6">
      {/* ═══ Navigation tabs ═══ */}
      <div className="retro-panel bg-white px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-black mr-4">🎨 Рисункач</h2>
          {(['overview', 'rooms', 'gallery'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl font-black text-sm transition ${
                tab === t
                  ? 'bg-purple-600 text-white'
                  : 'border-2 border-[#142a45]/20 hover:bg-[#142a45]/5'
              }`}
            >
              {t === 'overview' ? '📊 Обзор' : t === 'rooms' ? '🏠 Комнаты' : '🖼️ Галерея'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="retro-panel bg-red-100 border-red-400 px-4 py-3 text-red-800 text-sm font-bold">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline">Закрыть</button>
        </div>
      )}
      {actionMessage && (
        <div className="retro-panel bg-green-100 border-green-400 px-4 py-3 text-green-800 text-sm font-bold">
          {actionMessage}
        </div>
      )}

      {/* ═══════════ TAB: OVERVIEW ═══════════ */}
      {tab === 'overview' && (
        <>
          {/* Period selector */}
          <SectionCard
            title="ПЕРИОД АНАЛИТИКИ"
            actions={
              <div className="flex gap-2 flex-wrap">
                {[7, 14, 30, 90].map(d => (
                  <button
                    key={d}
                    onClick={() => setAnalyticsDays(d)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      analyticsDays === d ? 'bg-purple-600 text-white' : 'border-2 border-[#142a45]/20'
                    }`}
                  >
                    {d} дней
                  </button>
                ))}
                <button
                  onClick={loadAnalytics}
                  className="px-3 py-1.5 rounded-xl text-xs font-black border-2 border-purple-400 text-purple-700 hover:bg-purple-50"
                >
                  🔄 Обновить
                </button>
              </div>
            }
          >
            <p className="text-xs text-[#142a45]/60">
              {analyticsLoading ? 'Загрузка…' : `Данные за последние ${analyticsDays} дней`}
            </p>
          </SectionCard>

          {k && (
            <>
              {/* KPI cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                <KpiCard label="Всего комнат" value={formatNum(k.totalRooms)} />
                <KpiCard label="За период" value={formatNum(k.roomsInPeriod)} status="info" />
                <KpiCard label="Завершённые" value={formatNum(k.finishedRooms)} status="success" />
                <KpiCard label="Активные сейчас" value={formatNum(k.activeRooms)} status={k.activeRooms > 0 ? 'success' : 'neutral'} />
                <KpiCard label="Игроки за период" value={formatNum(k.playersInPeriod)} status="info" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Ср. игроков/комнату" value={String(k.avgPlayers)} hint="только завершённые" />
                <KpiCard label="Ср. длительность" value={`${k.avgDurationMin} мин`} hint="от создания до finish" />
                <KpiCard label="Всего рисунков" value={formatNum(k.totalDrawings)} status="info" />
                <KpiCard label="Всего голосов" value={formatNum(k.totalVotes)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <KpiCard label="Всего подсказок" value={formatNum(k.totalGuesses)} />
                <KpiCard label="Правильных" value={formatNum(k.correctGuesses)} status="success" />
                <KpiCard
                  label="Точность угадывания"
                  value={`${k.guessAccuracy}%`}
                  status={k.guessAccuracy >= 50 ? 'success' : k.guessAccuracy >= 25 ? 'warning' : 'error'}
                />
              </div>

              {/* Activity chart */}
              <SectionCard title="АКТИВНОСТЬ">
                <BarChart title="Комнаты по дням" series={analytics?.timeline ?? []} />
              </SectionCard>

              {/* Mode & Status distribution */}
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="РЕЖИМЫ ИГР">
                  <div className="space-y-2">
                    {Object.entries(analytics?.modeDistribution ?? {}).map(([mode, count]) => (
                      <div key={mode} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{MODE_LABELS[mode] || mode}</span>
                          <div
                            className="h-3 rounded-full bg-purple-500/70"
                            style={{ width: `${Math.max(20, (count / Math.max(1, k.roomsInPeriod)) * 200)}px` }}
                          />
                        </div>
                        <span className="text-sm font-black">{count}</span>
                      </div>
                    ))}
                    {Object.keys(analytics?.modeDistribution ?? {}).length === 0 && (
                      <p className="text-xs text-[#142a45]/60">Нет данных</p>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="ПОВТОРНЫЕ ИГРОКИ">
                  <div className="space-y-3">
                    <MetricRow label="Уникальных имён" value={formatNum(analytics?.repeatPlayers.total ?? 0)} />
                    <MetricRow label="Играли 2+ раз" value={formatNum(analytics?.repeatPlayers.repeat ?? 0)} status="success" />
                    <MetricRow
                      label="% возвращения"
                      value={`${analytics?.repeatPlayers.percentage ?? 0}%`}
                      status={(analytics?.repeatPlayers.percentage ?? 0) >= 30 ? 'success' : 'warning'}
                    />
                    <p className="text-xs text-[#142a45]/50">
                      Считается по совпадению имени игрока в разных комнатах
                    </p>
                  </div>
                </SectionCard>
              </div>

              {/* Rounds reached */}
              <SectionCard title="РАУНДЫ (завершённые игры)">
                <div className="space-y-2">
                  {Object.entries(analytics?.roundsReached ?? {}).sort(([a], [b]) => Number(a) - Number(b)).map(([round, cnt]) => (
                    <div key={round} className="flex items-center justify-between">
                      <span className="text-sm font-bold">Раунд {round}</span>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 rounded-full bg-green-500/70"
                          style={{ width: `${Math.max(20, (cnt / Math.max(1, k.finishedRooms)) * 200)}px` }}
                        />
                        <span className="text-sm font-black">{cnt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </>
          )}
        </>
      )}

      {/* ═══════════ TAB: ROOMS ═══════════ */}
      {tab === 'rooms' && (
        <>
          <SectionCard
            title="КОМНАТЫ"
            actions={
              <div className="flex gap-2 flex-wrap">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="rounded-xl border-2 border-[#142a45]/20 px-3 py-2 text-sm font-bold bg-white"
                >
                  <option value="">Все статусы</option>
                  <option value="lobby">Лобби</option>
                  <option value="playing">Играет</option>
                  <option value="voting">Голосование</option>
                  <option value="results">Результаты</option>
                  <option value="finished">Завершена</option>
                </select>
                <select
                  value={modeFilter}
                  onChange={e => setModeFilter(e.target.value)}
                  className="rounded-xl border-2 border-[#142a45]/20 px-3 py-2 text-sm font-bold bg-white"
                >
                  <option value="">Все режимы</option>
                  <option value="russian">Русский</option>
                  <option value="english">English</option>
                  <option value="free">Свободный</option>
                </select>
                <button
                  onClick={loadRooms}
                  className="px-4 py-2 rounded-xl border-2 border-[#142a45]/20 text-sm font-bold hover:bg-[#142a45]/5"
                >
                  🔄 Обновить
                </button>
              </div>
            }
          >
            <p className="text-sm text-[#142a45]/60">Всего: {roomsTotal}</p>
          </SectionCard>

          {roomsLoading ? (
            <div className="retro-panel bg-white px-6 py-8 text-center text-[#142a45]/60">Загрузка…</div>
          ) : rooms.length === 0 ? (
            <div className="retro-panel bg-white px-6 py-8 text-center text-[#142a45]/60">Нет комнат</div>
          ) : (
            <div className="retro-panel bg-white px-2 py-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[#142a45]/10">
                    <th className="px-3 py-2 text-left font-black">Код</th>
                    <th className="px-3 py-2 text-left font-black">Режим</th>
                    <th className="px-3 py-2 text-left font-black">Статус</th>
                    <th className="px-3 py-2 text-center font-black">Раунд</th>
                    <th className="px-3 py-2 text-center font-black">Игроки</th>
                    <th className="px-3 py-2 text-left font-black">Создана</th>
                    <th className="px-3 py-2 text-left font-black">Длительность</th>
                    <th className="px-3 py-2 text-right font-black">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map(room => {
                    const duration = room.updated_at && room.created_at
                      ? Math.round((new Date(room.updated_at).getTime() - new Date(room.created_at).getTime()) / 60000)
                      : null;
                    return (
                      <tr
                        key={room.id}
                        className={`border-b border-[#142a45]/5 hover:bg-purple-50/50 cursor-pointer transition ${
                          selectedRoomId === room.id ? 'bg-purple-100/50' : ''
                        }`}
                        onClick={() => loadRoomDetails(room.id)}
                      >
                        <td className="px-3 py-2 font-mono font-bold text-purple-700">{room.code}</td>
                        <td className="px-3 py-2">{MODE_LABELS[room.mode] || room.mode}</td>
                        <td className="px-3 py-2">
                          <StatusBadge label={STATUS_LABELS[room.status] || room.status} status={STATUS_COLORS[room.status] || 'neutral'} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {room.status !== 'lobby' ? `${room.current_round} (${room.current_step}/${room.total_steps})` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center font-bold">{room.player_count}</td>
                        <td className="px-3 py-2 text-xs text-[#142a45]/60">{formatDate(room.created_at)}</td>
                        <td className="px-3 py-2 text-xs text-[#142a45]/60">
                          {duration != null && duration > 0 ? `${duration} мин` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => loadRoomDetails(room.id)}
                              className="px-2 py-1 rounded-lg border border-purple-400 text-purple-600 text-xs font-bold hover:bg-purple-50"
                            >
                              📖 Детали
                            </button>
                            {room.status !== 'finished' && (
                              <button
                                onClick={() => handleClose(room.id)}
                                className="px-2 py-1 rounded-lg border border-orange-400 text-orange-600 text-xs font-bold hover:bg-orange-50"
                              >
                                Закрыть
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(room.id)}
                              className="px-2 py-1 rounded-lg border border-red-400 text-red-600 text-xs font-bold hover:bg-red-50"
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══════════ TAB: GALLERY / Room Details ═══════════ */}
      {tab === 'gallery' && (
        <>
          {!selectedRoomId && (
            <SectionCard title="ГАЛЕРЕЯ РИСУНКОВ">
              <p className="text-sm text-[#142a45]/60">
                Выберите комнату на вкладке «Комнаты» для просмотра рисунков, или выберите из последних:
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mt-4">
                {rooms.filter(r => r.status === 'finished').slice(0, 8).map(r => (
                  <button
                    key={r.id}
                    onClick={() => loadRoomDetails(r.id)}
                    className="rounded-xl border-2 border-purple-300/50 bg-purple-50/50 p-3 text-left hover:bg-purple-100/50 transition"
                  >
                    <span className="font-mono font-bold text-purple-700">{r.code}</span>
                    <span className="text-xs text-[#142a45]/60 ml-2">{r.player_count} игр. · {formatDate(r.created_at)}</span>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {detailsLoading && (
            <div className="retro-panel bg-white px-6 py-8 text-center text-[#142a45]/60">Загрузка деталей…</div>
          )}

          {selectedRoomId && roomDetails && !detailsLoading && (
            <>
              {/* Room info header */}
              <SectionCard
                title={`КОМНАТА ${(roomDetails.room as Record<string, string>).code || ''}`}
                actions={
                  <button
                    onClick={() => { setSelectedRoomId(null); setRoomDetails(null); }}
                    className="px-3 py-1.5 rounded-xl text-xs font-black border-2 border-[#142a45]/20 hover:bg-[#142a45]/5"
                  >
                    ← Назад
                  </button>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-[#142a45]/60">Статус</p>
                    <StatusBadge
                      label={STATUS_LABELS[roomDetails.room.status as string] || String(roomDetails.room.status)}
                      status={STATUS_COLORS[roomDetails.room.status as string] || 'neutral'}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-[#142a45]/60">Режим</p>
                    <p className="font-bold">{MODE_LABELS[roomDetails.room.mode as string] || String(roomDetails.room.mode)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#142a45]/60">Создана</p>
                    <p className="font-bold text-sm">{formatDate(roomDetails.room.created_at as string)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#142a45]/60">Раундов / Цепочек</p>
                    <p className="font-bold">{roundsInRoom.length} / {roomDetails.chains.length}</p>
                  </div>
                </div>
              </SectionCard>

              {/* Players scoreboard */}
              <SectionCard title="ИГРОКИ И ОЧКИ">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {gamePlayers.map((p, i) => (
                    <div
                      key={p.id}
                      className={`rounded-xl border-2 px-4 py-3 flex items-center justify-between ${
                        i === 0 ? 'border-yellow-400 bg-yellow-50' :
                        i === 1 ? 'border-gray-400 bg-gray-50' :
                        i === 2 ? 'border-orange-400 bg-orange-50' :
                        'border-[#142a45]/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                        <span className="font-bold text-sm">{p.name}</span>
                      </div>
                      <span className="font-black text-purple-700">{p.score} pts</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Round filter */}
              <div className="flex gap-2 flex-wrap items-center">
                <span className="text-sm font-bold text-[#142a45]/60">Раунд:</span>
                <button
                  onClick={() => { setGalleryRound(0); setSelectedChainId(null); }}
                  className={`px-3 py-1 rounded-lg text-xs font-black ${galleryRound === 0 ? 'bg-purple-600 text-white' : 'border-2 border-[#142a45]/20'}`}
                >
                  Все
                </button>
                {roundsInRoom.map(r => (
                  <button
                    key={r}
                    onClick={() => { setGalleryRound(r); setSelectedChainId(null); }}
                    className={`px-3 py-1 rounded-lg text-xs font-black ${galleryRound === r ? 'bg-purple-600 text-white' : 'border-2 border-[#142a45]/20'}`}
                  >
                    Раунд {r}
                  </button>
                ))}
              </div>

              {/* Chains list */}
              <SectionCard title="ЦЕПОЧКИ">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {detailChains.map(chain => {
                    const chainSteps = roomDetails.steps.filter(s => s.chain_id === chain.id);
                    const drawingCount = chainSteps.filter(s => s.drawing_data).length;
                    const isSelected = selectedChainId === chain.id;
                    return (
                      <button
                        key={chain.id}
                        onClick={() => setSelectedChainId(isSelected ? null : chain.id)}
                        className={`rounded-xl border-2 p-3 text-left transition ${
                          isSelected ? 'border-purple-500 bg-purple-100/70' : 'border-[#142a45]/10 hover:bg-purple-50/50'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm">
                            Р{chain.round} · Цепочка {chain.chain_index + 1}
                          </span>
                          <span className="text-xs text-[#142a45]/60">{drawingCount} 🖼</span>
                        </div>
                        <p className="text-xs text-purple-700 font-bold mt-1">«{chain.original_word}»</p>
                        <p className="text-[10px] text-[#142a45]/50 mt-0.5">
                          {chainSteps.length} шагов · {chainSteps.filter(s => s.is_correct).length} правильных
                        </p>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Selected chain: step-by-step view */}
              {selectedChainId && selectedChainSteps.length > 0 && (
                <SectionCard title="ПРОСМОТР ЦЕПОЧКИ">
                  <div className="space-y-4">
                    {selectedChainSteps.map(step => {
                      const playerName = roomDetails.playerNames[step.player_id] || '???';
                      return (
                        <div key={step.id} className="rounded-2xl border-2 border-[#142a45]/10 overflow-hidden">
                          <div className="bg-[#142a45]/5 px-4 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="font-black text-purple-700">Шаг {step.step_number}</span>
                              <span className="text-sm font-bold">{playerName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {step.target_word && (
                                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                                  {step.target_word}
                                </span>
                              )}
                              {step.guess && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                  step.is_correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  Ответ: {step.guess} {step.is_correct ? '✓' : '✗'}
                                </span>
                              )}
                            </div>
                          </div>
                          {step.drawing_data ? (
                            <img
                              src={step.drawing_data}
                              alt={`Шаг ${step.step_number} — ${playerName}`}
                              className="w-full max-h-72 object-contain bg-white"
                            />
                          ) : (
                            <div className="w-full h-32 flex items-center justify-center bg-gray-50 text-[#142a45]/40 text-sm">
                              Нет рисунка
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              {/* Full gallery grid */}
              {!selectedChainId && allDrawings.length > 0 && (
                <SectionCard title={`ВСЕ РИСУНКИ (${allDrawings.length})`}>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {allDrawings.map(step => {
                      const playerName = roomDetails.playerNames[step.player_id] || '???';
                      const chain = roomDetails.chains.find(c => c.id === step.chain_id);
                      return (
                        <div
                          key={step.id}
                          className="rounded-xl border-2 border-[#142a45]/10 overflow-hidden hover:border-purple-400 transition cursor-pointer"
                          onClick={() => setSelectedChainId(step.chain_id)}
                        >
                          <img
                            src={step.drawing_data!}
                            alt={`${playerName}`}
                            className="w-full aspect-square object-contain bg-white"
                          />
                          <div className="px-2 py-1.5 bg-[#142a45]/5">
                            <p className="text-xs font-bold truncate">{playerName}</p>
                            <p className="text-[10px] text-[#142a45]/50">
                              {step.target_word && `«${step.target_word}» · `}Р{chain?.round} Ш{step.step_number}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              {/* Vote summary */}
              {roomDetails.votes.length > 0 && (
                <SectionCard title="ГОЛОСА">
                  <div className="space-y-2">
                    {(() => {
                      const voteMap: Record<string, number> = {};
                      for (const v of roomDetails.votes) {
                        const name = roomDetails.playerNames[v.voted_for_player_id] || v.voted_for_player_id;
                        voteMap[name] = (voteMap[name] || 0) + 1;
                      }
                      return Object.entries(voteMap)
                        .sort(([, a], [, b]) => b - a)
                        .map(([name, cnt]) => (
                          <MetricRow key={name} label={name} value={`${cnt} голос(ов)`} />
                        ));
                    })()}
                  </div>
                </SectionCard>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
