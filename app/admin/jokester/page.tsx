'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, KpiCard, MetricRow, SectionCard, StatusBadge } from '@/components/admin/AdminWidgets';
import type { SeriesPoint } from '@/components/admin/AdminWidgets';

/* ═══════════ Types ═══════════ */

type AnalyticsData = {
  range: { start: string; end: string };
  rooms: {
    total: number; finished: number; active: number; lobbyAbandoned: number;
    finishRate: number; avgDurationMin: number; medianDurationMin: number;
    statusDistribution: Record<string, number>; maxRoundReached: Record<string, number>;
  };
  players: {
    total: number; gamePlayers: number; spectators: number; uniqueNames: number;
    avgPlayersPerRoom: number; avgSpectatorsPerRoom: number;
  };
  duels: { total: number; completed: number };
  engagement: {
    totalAnswers: number; totalVotes: number; answerRate: number; voteParticipation: number;
    playerVotes: number; spectatorVotes: number;
  };
  categories: { topCategories: Array<{ category: string; votes: number }>; totalCategoryVotes: number };
  topQuestions: Array<{ question: string; category: string; answers: number; votes: number; duels: number }>;
  bestAnswers: Array<{ answerText: string; questionText: string; playerName: string; votesReceived: number; duelId: string }>;
  playerLeaderboard: Array<{ id: string; name: string; roomId: string; totalPoints: number; playerVotes: number; spectatorVotes: number }>;
  charts: { roomsByTime: SeriesPoint[]; playersByTime: SeriesPoint[]; duelsByTime: SeriesPoint[] };
};

type RoomListItem = {
  id: string; code: string; status: string | null; current_round: number | null;
  current_duel_index: number | null; created_at: string | null; updated_at: string | null;
  playerCount: number; spectatorCount: number; duelCount: number;
};

type RoomListResponse = {
  items: RoomListItem[]; total: number; page: number; pageSize: number; totalPages: number;
};

type DuelQuestion = {
  index: number; text: string | null; category: string | null;
  answers: Array<{ playerName: string; text: string | null; votesReceived: number }>;
  totalVotes: number;
};

type DuelDetail = {
  id: string; round: number; duel_index: number; player1Name: string; player2Name: string;
  winnerName: string | null; status: string;
  questions: DuelQuestion[];
};

type RoomDetailsData = {
  room: Record<string, unknown>;
  players: Array<{ id: string; name: string; role: string; is_host: boolean; total_points: number; player_votes: number; spectator_votes: number; avatar: string | null; seat: number | null; joined_at: string | null }>;
  duels: DuelDetail[];
  categoryVotes: Array<{ id: string; round: number; voter_id: string; category: string }>;
  stats: { totalPlayers: number; totalSpectators: number; totalDuels: number; completedDuels: number; totalAnswers: number; totalVotes: number; durationMin: number | null };
};

/* ═══════════ Helpers ═══════════ */

const fmt = (v?: number | null) => (v ?? 0).toLocaleString('ru-RU');
const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString('ru-RU') : '—');

const STATUS_LABELS: Record<string, string> = {
  lobby: 'Лобби', starting: 'Запуск', category_vote: 'Выбор категории',
  round_rules: 'Правила', round_playing: 'Игра', round_voting: 'Голосование',
  round_results: 'Результаты', final_rules: 'Финал-правила', final_playing: 'Финал',
  final_voting: 'Финал-голосование', final_results: 'Финал-результаты',
  credits: 'Титры', finished: 'Завершена',
};

const statusBadgeVariant = (s: string | null): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  if (!s) return 'neutral';
  if (s === 'finished' || s === 'credits') return 'success';
  if (s === 'lobby') return 'neutral';
  if (s.includes('voting') || s.includes('results')) return 'info';
  return 'warning';
};

type Tab = 'overview' | 'rooms' | 'questions' | 'leaderboard';

/* ═══════════ Component ═══════════ */

export default function JokesterAdminPage() {
  const [tab, setTab] = useState<Tab>('overview');

  /* ── Date range ── */
  const today = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const range = useMemo(() => {
    const s = Date.parse(startDate);
    const e = Date.parse(endDate);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
    const end = new Date(e);
    end.setUTCDate(end.getUTCDate() + 1);
    return { startIso: new Date(s).toISOString(), endIso: end.toISOString() };
  }, [startDate, endDate]);

  const quickRange = useCallback((kind: 'today' | 'week' | 'month') => {
    const now = new Date();
    if (kind === 'today') { setStartDate(today); setEndDate(today); return; }
    const d = new Date(now);
    if (kind === 'week') d.setDate(d.getDate() - 7);
    if (kind === 'month') d.setDate(d.getDate() - 30);
    const f = (n: Date) => `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    setStartDate(f(d));
    setEndDate(today);
  }, [today]);

  /* ── Analytics state ── */
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  /* ── Rooms state ── */
  const [roomList, setRoomList] = useState<RoomListResponse | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsPage, setRoomsPage] = useState(1);
  const [roomStatusFilter, setRoomStatusFilter] = useState('');
  const [roomSearch, setRoomSearch] = useState('');

  /* ── Room details state ── */
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomDetails, setRoomDetails] = useState<RoomDetailsData | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [expandedDuels, setExpandedDuels] = useState<Set<string>>(new Set());

  /* ── Action message ── */
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  /* ══════ Fetchers ══════ */

  const loadAnalytics = useCallback(async () => {
    if (!range) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch(`/api/admin/jokester-analytics?start=${encodeURIComponent(range.startIso)}&end=${encodeURIComponent(range.endIso)}`, { cache: 'no-store', credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Ошибка загрузки аналитики');
      setAnalytics(data);
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [range]);

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(roomsPage), limit: '20' });
      if (roomStatusFilter) params.set('status', roomStatusFilter);
      if (roomSearch) params.set('search', roomSearch);
      const res = await fetch(`/api/admin/jokester-rooms?${params.toString()}`, { cache: 'no-store', credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Ошибка');
      setRoomList(data);
    } catch {
      setRoomList(null);
    } finally {
      setRoomsLoading(false);
    }
  }, [roomsPage, roomStatusFilter, roomSearch]);

  const loadRoomDetails = useCallback(async (roomId: string) => {
    setDetailsLoading(true);
    setExpandedDuels(new Set());
    try {
      const res = await fetch(`/api/admin/jokester-room-details?roomId=${encodeURIComponent(roomId)}`, { cache: 'no-store', credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Ошибка');
      setRoomDetails(data);
      setSelectedRoomId(roomId);
    } catch {
      setRoomDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  /* ── Room actions ── */
  const closeRoom = useCallback(async (roomId: string) => {
    if (!confirm('Закрыть комнату (статус finished)?')) return;
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/jokester-rooms', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, patch: { status: 'finished' } }),
      });
      if (!res.ok) throw new Error('Ошибка');
      setActionMsg('Комната закрыта');
      await loadRooms();
    } catch {
      setActionMsg('Не удалось закрыть комнату');
    }
  }, [loadRooms]);

  const deleteRoom = useCallback(async (roomId: string) => {
    if (!confirm('Удалить комнату со всеми данными?')) return;
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/jokester-rooms', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) throw new Error('Ошибка');
      setActionMsg('Комната удалена');
      if (selectedRoomId === roomId) { setSelectedRoomId(null); setRoomDetails(null); }
      await loadRooms();
    } catch {
      setActionMsg('Не удалось удалить комнату');
    }
  }, [loadRooms, selectedRoomId]);

  const restartRoom = useCallback(async (roomId: string) => {
    if (!confirm('Перезапустить комнату (сброс в lobby)?')) return;
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/jokester-rooms', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          patch: { status: 'lobby', current_round: 1, current_duel_index: 0, voting_phase: 'idle', current_question: null },
        }),
      });
      if (!res.ok) throw new Error('Ошибка');
      setActionMsg('Комната перезапущена');
      await loadRooms();
    } catch {
      setActionMsg('Не удалось перезапустить комнату');
    }
  }, [loadRooms]);

  /* ── Auto load ── */
  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);
  useEffect(() => { if (tab === 'rooms') loadRooms(); }, [tab, loadRooms]);

  /* ══════════════════════════════════════════ */
  /*                  RENDER                    */
  /* ══════════════════════════════════════════ */

  const a = analytics;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="retro-panel bg-gradient-to-r from-[#f59e0b] to-[#ef4444] text-white px-6 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="retro-heading text-xs tracking-[0.5em] opacity-70">Аналитика</p>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight">🎤 Пошутикач</h1>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 rounded-xl border-2 border-white/40 bg-white/20 text-white font-bold text-sm" />
            <span className="text-white/70 font-bold">—</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 rounded-xl border-2 border-white/40 bg-white/20 text-white font-bold text-sm" />
            {(['today', 'week', 'month'] as const).map(k => (
              <button key={k} onClick={() => quickRange(k)} className="px-3 py-2 rounded-xl border-2 border-white/40 text-white font-bold text-xs hover:bg-white/20 transition">
                {k === 'today' ? 'Сегодня' : k === 'week' ? 'Неделя' : 'Месяц'}
              </button>
            ))}
            <button onClick={loadAnalytics} disabled={analyticsLoading} className="px-4 py-2 rounded-xl bg-white text-[#ef4444] font-black text-sm hover:bg-white/90 transition disabled:opacity-50">
              {analyticsLoading ? '...' : '🔄 Обновить'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {([
          ['overview', '📊 Обзор'],
          ['rooms', '🏠 Комнаты'],
          ['questions', '❓ Вопросы'],
          ['leaderboard', '🏆 Лидеры'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-3 rounded-2xl border-[3px] font-black tracking-wide text-sm transition ${tab === t ? 'border-[#ef4444] bg-[#ef4444] text-white' : 'border-[#142a45] bg-white text-[#142a45] hover:bg-[#142a45]/5'}`}>
            {label}
          </button>
        ))}
      </div>

      {actionMsg && <div className="px-4 py-2 rounded-xl bg-[#142a45] text-[#ffeccd] font-bold text-sm">{actionMsg}</div>}
      {analyticsError && <div className="px-4 py-2 rounded-xl bg-red-100 text-red-700 font-bold text-sm">{analyticsError}</div>}

      {/* ──────────── OVERVIEW TAB ──────────── */}
      {tab === 'overview' && a && (
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Комнат" value={fmt(a.rooms.total)} status="neutral" />
            <KpiCard label="Завершено" value={`${fmt(a.rooms.finished)} (${a.rooms.finishRate}%)`} status={a.rooms.finishRate >= 50 ? 'success' : 'warning'} />
            <KpiCard label="Активные" value={fmt(a.rooms.active)} status={a.rooms.active > 0 ? 'info' : 'neutral'} />
            <KpiCard label="Игроков" value={fmt(a.players.gamePlayers)} status="neutral" />
            <KpiCard label="Зрителей" value={fmt(a.players.spectators)} status="neutral" />
            <KpiCard label="Уникальных" value={fmt(a.players.uniqueNames)} status="info" />
          </div>

          {/* Engagement KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Ответов" value={fmt(a.engagement.totalAnswers)} hint={`Rate: ${a.engagement.answerRate}%`} status={a.engagement.answerRate >= 70 ? 'success' : 'warning'} />
            <KpiCard label="Голосов" value={fmt(a.engagement.totalVotes)} hint={`Участие: ${a.engagement.voteParticipation}%`} status={a.engagement.voteParticipation >= 50 ? 'success' : 'warning'} />
            <KpiCard label="Дуэлей" value={`${fmt(a.duels.completed)} / ${fmt(a.duels.total)}`} status="neutral" />
            <KpiCard label="Ср. длительность" value={`${a.rooms.avgDurationMin} мин`} hint={`Медиана: ${a.rooms.medianDurationMin} мин`} status="neutral" />
          </div>

          {/* Room & player averages */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SectionCard title="СРЕДНИЕ ПОКАЗАТЕЛИ">
              <MetricRow label="Игроков на комнату" value={a.players.avgPlayersPerRoom} />
              <MetricRow label="Зрителей на комнату" value={a.players.avgSpectatorsPerRoom} />
              <MetricRow label="Голоса игроков" value={fmt(a.engagement.playerVotes)} />
              <MetricRow label="Голоса зрителей" value={fmt(a.engagement.spectatorVotes)} />
              <MetricRow label="Брошено в лобби" value={fmt(a.rooms.lobbyAbandoned)} status={a.rooms.lobbyAbandoned > a.rooms.finished ? 'warning' : 'neutral'} />
            </SectionCard>
            <SectionCard title="РАСПРЕДЕЛЕНИЕ РАУНДОВ">
              {Object.entries(a.rooms.maxRoundReached).map(([label, count]) => (
                <MetricRow key={label} label={label} value={count} />
              ))}
            </SectionCard>
          </div>

          {/* Status distribution */}
          <SectionCard title="СТАТУСЫ КОМНАТ">
            <div className="flex flex-wrap gap-2">
              {Object.entries(a.rooms.statusDistribution).map(([st, count]) => (
                <StatusBadge key={st} label={`${STATUS_LABELS[st] ?? st}: ${count}`} status={statusBadgeVariant(st)} />
              ))}
            </div>
          </SectionCard>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SectionCard title="КОМНАТЫ ВО ВРЕМЕНИ">
              <BarChart title="" series={a.charts.roomsByTime} />
            </SectionCard>
            <SectionCard title="ИГРОКИ ВО ВРЕМЕНИ">
              <BarChart title="" series={a.charts.playersByTime} />
            </SectionCard>
            <SectionCard title="ДУЭЛИ ВО ВРЕМЕНИ">
              <BarChart title="" series={a.charts.duelsByTime} />
            </SectionCard>
          </div>

          {/* Category popularity */}
          {a.categories.topCategories.length > 0 && (
            <SectionCard title="ПОПУЛЯРНЫЕ КАТЕГОРИИ" actions={<span className="text-xs font-bold opacity-60">Всего голосов: {fmt(a.categories.totalCategoryVotes)}</span>}>
              <div className="space-y-1">
                {a.categories.topCategories.map((c, i) => {
                  const maxV = a.categories.topCategories[0]?.votes ?? 1;
                  return (
                    <div key={c.category} className="flex items-center gap-3">
                      <span className="text-sm font-bold w-6 text-right opacity-50">{i + 1}</span>
                      <span className="text-sm font-bold flex-shrink-0 w-32">{c.category}</span>
                      <div className="flex-1 h-5 bg-[#142a45]/10 rounded-xl overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#f59e0b] to-[#ef4444] rounded-xl" style={{ width: `${Math.max(4, (c.votes / maxV) * 100)}%` }} />
                      </div>
                      <span className="text-sm font-black w-12 text-right">{c.votes}</span>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ──────────── ROOMS TAB ──────────── */}
      {tab === 'rooms' && (
        <div className="space-y-4">
          {/* Filters */}
          <SectionCard title="ФИЛЬТРЫ">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs font-bold opacity-60">Статус</label>
                <select value={roomStatusFilter} onChange={e => { setRoomStatusFilter(e.target.value); setRoomsPage(1); }} className="px-3 py-2 rounded-xl border-2 border-[#142a45]/30 font-bold text-sm">
                  <option value="">Все</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold opacity-60">Код</label>
                <input value={roomSearch} onChange={e => { setRoomSearch(e.target.value); setRoomsPage(1); }} placeholder="1234" className="px-3 py-2 rounded-xl border-2 border-[#142a45]/30 font-bold text-sm w-24" />
              </div>
              <button onClick={loadRooms} disabled={roomsLoading} className="px-4 py-2 rounded-xl bg-[#142a45] text-[#ffeccd] font-black text-sm hover:bg-[#142a45]/80 transition disabled:opacity-50">
                {roomsLoading ? '...' : 'Поиск'}
              </button>
            </div>
          </SectionCard>

          {/* Room list */}
          {roomList && (
            <SectionCard title={`КОМНАТЫ (${roomList.total})`} actions={
              <span className="text-xs font-bold opacity-60">Стр. {roomList.page} из {roomList.totalPages}</span>
            }>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                      <th className="py-2 px-2">Код</th>
                      <th className="py-2 px-2">Статус</th>
                      <th className="py-2 px-2">Раунд</th>
                      <th className="py-2 px-2">Игроки</th>
                      <th className="py-2 px-2">Зрители</th>
                      <th className="py-2 px-2">Дуэли</th>
                      <th className="py-2 px-2">Создана</th>
                      <th className="py-2 px-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomList.items.map(r => (
                      <tr key={r.id} className="border-b border-[#142a45]/10 hover:bg-[#142a45]/5 transition cursor-pointer" onClick={() => loadRoomDetails(r.id)}>
                        <td className="py-2 px-2 font-black">{r.code}</td>
                        <td className="py-2 px-2"><StatusBadge label={STATUS_LABELS[r.status ?? ''] ?? r.status ?? '—'} status={statusBadgeVariant(r.status)} /></td>
                        <td className="py-2 px-2">{r.current_round ?? 1}</td>
                        <td className="py-2 px-2">{r.playerCount}</td>
                        <td className="py-2 px-2">{r.spectatorCount}</td>
                        <td className="py-2 px-2">{r.duelCount}</td>
                        <td className="py-2 px-2 text-xs">{fmtDate(r.created_at)}</td>
                        <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <button onClick={() => closeRoom(r.id)} title="Закрыть" className="px-2 py-1 rounded-lg bg-yellow-100 text-yellow-800 text-xs font-bold hover:bg-yellow-200">⏹</button>
                            <button onClick={() => restartRoom(r.id)} title="Перезапустить" className="px-2 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-bold hover:bg-blue-200">🔄</button>
                            <button onClick={() => deleteRoom(r.id)} title="Удалить" className="px-2 py-1 rounded-lg bg-red-100 text-red-800 text-xs font-bold hover:bg-red-200">🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {roomList.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-3">
                  <button onClick={() => setRoomsPage(p => Math.max(1, p - 1))} disabled={roomList.page <= 1} className="px-3 py-1 rounded-lg border-2 border-[#142a45]/30 font-bold text-sm disabled:opacity-30">←</button>
                  <span className="font-bold text-sm">{roomList.page} / {roomList.totalPages}</span>
                  <button onClick={() => setRoomsPage(p => Math.min(roomList.totalPages, p + 1))} disabled={roomList.page >= roomList.totalPages} className="px-3 py-1 rounded-lg border-2 border-[#142a45]/30 font-bold text-sm disabled:opacity-30">→</button>
                </div>
              )}
            </SectionCard>
          )}

          {/* Room detail panel */}
          {selectedRoomId && roomDetails && (
            <SectionCard title={`ДЕТАЛИ КОМНАТЫ ${(roomDetails.room as { code?: string }).code ?? ''}`} actions={
              <button onClick={() => { setSelectedRoomId(null); setRoomDetails(null); }} className="px-3 py-1 rounded-lg border-2 border-[#142a45]/30 font-bold text-xs">✕ Закрыть</button>
            }>
              {detailsLoading ? <p className="text-center font-bold opacity-50">Загрузка...</p> : (
                <div className="space-y-4">
                  {/* Room stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <KpiCard label="Игроков" value={roomDetails.stats.totalPlayers} status="neutral" />
                    <KpiCard label="Зрителей" value={roomDetails.stats.totalSpectators} status="neutral" />
                    <KpiCard label="Дуэлей" value={`${roomDetails.stats.completedDuels}/${roomDetails.stats.totalDuels}`} status="neutral" />
                    <KpiCard label="Длительность" value={roomDetails.stats.durationMin ? `${roomDetails.stats.durationMin} мин` : '—'} status="neutral" />
                  </div>

                  {/* Players */}
                  <div>
                    <p className="retro-heading text-[10px] tracking-[0.3em] opacity-60 mb-2">ИГРОКИ</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                            <th className="py-1 px-2">Имя</th>
                            <th className="py-1 px-2">Роль</th>
                            <th className="py-1 px-2">Очки</th>
                            <th className="py-1 px-2">Голоса игроков</th>
                            <th className="py-1 px-2">Голоса зрителей</th>
                            <th className="py-1 px-2">Вход</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roomDetails.players.filter(p => !p.is_host).map(p => (
                            <tr key={p.id} className="border-b border-[#142a45]/10">
                              <td className="py-1 px-2 font-bold">{p.name}</td>
                              <td className="py-1 px-2"><StatusBadge label={p.role === 'player' ? 'Игрок' : 'Зритель'} status={p.role === 'player' ? 'info' : 'neutral'} /></td>
                              <td className="py-1 px-2 font-black">{p.total_points}</td>
                              <td className="py-1 px-2">{p.player_votes}</td>
                              <td className="py-1 px-2">{p.spectator_votes}</td>
                              <td className="py-1 px-2 text-xs">{fmtDate(p.joined_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Duels */}
                  <div>
                    <p className="retro-heading text-[10px] tracking-[0.3em] opacity-60 mb-2">ДУЭЛИ</p>
                    <div className="space-y-2">
                      {roomDetails.duels.map(d => {
                        const expanded = expandedDuels.has(d.id);
                        return (
                          <div key={d.id} className="border-2 border-[#142a45]/20 rounded-2xl overflow-hidden">
                            <button
                              onClick={() => setExpandedDuels(prev => {
                                const next = new Set(prev);
                                if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                                return next;
                              })}
                              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#142a45]/5 transition"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-black opacity-50">R{d.round} D{d.duel_index + 1}</span>
                                <span className="font-bold">{d.player1Name} ⚔️ {d.player2Name}</span>
                                <StatusBadge label={d.status} status={d.status === 'done' ? 'success' : d.status === 'voting' ? 'info' : 'neutral'} />
                              </div>
                              <div className="flex items-center gap-2">
                                {d.winnerName && <span className="text-xs font-black text-green-700">🏆 {d.winnerName}</span>}
                                <span className="text-lg">{expanded ? '▾' : '▸'}</span>
                              </div>
                            </button>
                            {expanded && (
                              <div className="px-4 pb-4 space-y-3 border-t border-[#142a45]/10">
                                {d.questions.map(q => (
                                  <div key={q.index} className="space-y-1 pt-2">
                                    <p className="text-sm font-black text-[#142a45]/80">
                                      {q.category ? `[${q.category}] ` : ''}{q.text ?? '—'}
                                    </p>
                                    {q.answers.map((ans, ai) => (
                                      <div key={ai} className="flex items-center gap-2 pl-4">
                                        <span className="text-xs font-bold text-[#142a45]/60">{ans.playerName}:</span>
                                        <span className="text-sm">{ans.text ?? '(нет ответа)'}</span>
                                        {ans.votesReceived > 0 && (
                                          <span className="text-xs font-black text-[#ef4444]">❤ {ans.votesReceived}</span>
                                        )}
                                      </div>
                                    ))}
                                    <p className="text-xs opacity-50 pl-4">Голосов: {q.totalVotes}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category votes */}
                  {roomDetails.categoryVotes.length > 0 && (
                    <div>
                      <p className="retro-heading text-[10px] tracking-[0.3em] opacity-60 mb-2">ГОЛОСА ЗА КАТЕГОРИИ</p>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const counts: Record<string, number> = {};
                          for (const cv of roomDetails.categoryVotes) counts[cv.category] = (counts[cv.category] ?? 0) + 1;
                          return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([cat, cnt]) => (
                            <StatusBadge key={cat} label={`${cat}: ${cnt}`} status="info" />
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      )}

      {/* ──────────── QUESTIONS TAB ──────────── */}
      {tab === 'questions' && a && (
        <div className="space-y-6">
          {/* Top questions */}
          {a.topQuestions.length > 0 && (
            <SectionCard title="ТОП ВОПРОСОВ (по вовлечённости)">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                      <th className="py-2 px-2">#</th>
                      <th className="py-2 px-2">Категория</th>
                      <th className="py-2 px-2">Вопрос</th>
                      <th className="py-2 px-2">Дуэлей</th>
                      <th className="py-2 px-2">Ответов</th>
                      <th className="py-2 px-2">Голосов</th>
                      <th className="py-2 px-2">Engagement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.topQuestions.map((q, i) => (
                      <tr key={i} className="border-b border-[#142a45]/10">
                        <td className="py-2 px-2 font-black opacity-50">{i + 1}</td>
                        <td className="py-2 px-2"><StatusBadge label={q.category || '—'} status="info" /></td>
                        <td className="py-2 px-2 max-w-md">{q.question}</td>
                        <td className="py-2 px-2">{q.duels}</td>
                        <td className="py-2 px-2">{q.answers}</td>
                        <td className="py-2 px-2">{q.votes}</td>
                        <td className="py-2 px-2 font-black">{q.answers + q.votes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Best answers */}
          {a.bestAnswers.length > 0 && (
            <SectionCard title="ЛУЧШИЕ ОТВЕТЫ (больше всего голосов)">
              <div className="space-y-3">
                {a.bestAnswers.map((ans, i) => (
                  <div key={i} className="flex gap-3 items-start border-b border-[#142a45]/10 pb-3">
                    <span className="text-2xl font-black text-[#ef4444]/60 w-8 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-bold text-[#142a45]/60">{ans.questionText}</p>
                      <p className="text-base font-black">&ldquo;{ans.answerText}&rdquo;</p>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-[#142a45]/50">— {ans.playerName}</span>
                        <span className="text-xs font-black text-[#ef4444]">❤ {ans.votesReceived} голосов</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ──────────── LEADERBOARD TAB ──────────── */}
      {tab === 'leaderboard' && a && (
        <div className="space-y-6">
          {a.playerLeaderboard.length > 0 ? (
            <SectionCard title="ТАБЛИЦА ЛИДЕРОВ">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                      <th className="py-2 px-2">#</th>
                      <th className="py-2 px-2">Имя</th>
                      <th className="py-2 px-2">Очки</th>
                      <th className="py-2 px-2">Голоса игроков</th>
                      <th className="py-2 px-2">Голоса зрителей</th>
                      <th className="py-2 px-2">Всего голосов</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.playerLeaderboard.map((p, i) => (
                      <tr key={p.id} className={`border-b border-[#142a45]/10 ${i < 3 ? 'bg-gradient-to-r from-yellow-50 to-transparent' : ''}`}>
                        <td className="py-2 px-2 font-black text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                        <td className="py-2 px-2 font-black">{p.name}</td>
                        <td className="py-2 px-2 font-black text-[#ef4444]">{fmt(p.totalPoints)}</td>
                        <td className="py-2 px-2">{p.playerVotes}</td>
                        <td className="py-2 px-2">{p.spectatorVotes}</td>
                        <td className="py-2 px-2 font-bold">{p.playerVotes + p.spectatorVotes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="ТАБЛИЦА ЛИДЕРОВ">
              <p className="text-center font-bold opacity-50 py-8">Нет данных за выбранный период</p>
            </SectionCard>
          )}

          {/* Vote split chart */}
          {a && a.engagement.totalVotes > 0 && (
            <SectionCard title="РАСПРЕДЕЛЕНИЕ ГОЛОСОВ">
              <div className="grid grid-cols-2 gap-4">
                <KpiCard label="Голоса игроков" value={fmt(a.engagement.playerVotes)} hint={`${a.engagement.totalVotes > 0 ? Math.round((a.engagement.playerVotes / a.engagement.totalVotes) * 100) : 0}%`} status="info" />
                <KpiCard label="Голоса зрителей" value={fmt(a.engagement.spectatorVotes)} hint={`${a.engagement.totalVotes > 0 ? Math.round((a.engagement.spectatorVotes / a.engagement.totalVotes) * 100) : 0}%`} status="info" />
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* No data */}
      {!analyticsLoading && !a && !analyticsError && (
        <SectionCard title="НЕТ ДАННЫХ">
          <p className="text-center font-bold opacity-50 py-8">Нажмите «Обновить» для загрузки аналитики</p>
        </SectionCard>
      )}
    </div>
  );
}
