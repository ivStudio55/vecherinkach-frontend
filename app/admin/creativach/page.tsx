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
  engagement: {
    totalAnswers: number; totalVotes: number; answerRate: number; voteParticipation: number;
    playerVotes: number; spectatorVotes: number;
  };
  playerLeaderboard: Array<{ id: string; name: string; roomId: string; totalPoints: number }>;
  charts: { roomsByTime: SeriesPoint[]; playersByTime: SeriesPoint[]; answersByTime: SeriesPoint[] };
};

type RoomListItem = {
  id: string; code: string; status: string | null; current_round: number | null;
  voting_phase: string | null; created_at: string | null; updated_at: string | null;
  playerCount: number; spectatorCount: number; answerCount: number;
};

type RoomListResponse = {
  items: RoomListItem[]; total: number; page: number; pageSize: number; totalPages: number;
};

/* ═══════════ Helpers ═══════════ */

const fmt = (v?: number | null) => (v ?? 0).toLocaleString('ru-RU');
const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString('ru-RU') : '—');

const STATUS_LABELS: Record<string, string> = {
  lobby: 'Лобби', round_rules: 'Правила', round_playing: 'Раунд',
  round_voting: 'Голосование', round_results: 'Результаты',
  final_rules: 'Финал-правила', final_playing: 'Финал',
  final_voting: 'Финал-голосование', final_results: 'Финал-результаты',
  finished: 'Завершена',
};

const statusBadgeVariant = (s: string | null): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  if (!s) return 'neutral';
  if (s === 'finished') return 'success';
  if (s === 'lobby') return 'neutral';
  if (s.includes('voting') || s.includes('results')) return 'info';
  return 'warning';
};

type Tab = 'overview' | 'rooms' | 'leaderboard';

/* ═══════════ Component ═══════════ */

export default function CreativachAdminPage() {
  const [tab, setTab] = useState<Tab>('overview');

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

  /* ── State ── */
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const [roomList, setRoomList] = useState<RoomListResponse | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsPage, setRoomsPage] = useState(1);
  const [roomStatusFilter, setRoomStatusFilter] = useState('');
  const [roomSearch, setRoomSearch] = useState('');

  const [actionMsg, setActionMsg] = useState<string | null>(null);

  /* ══════ Fetchers ══════ */

  const loadAnalytics = useCallback(async () => {
    if (!range) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch(`/api/admin/creativach-analytics?start=${encodeURIComponent(range.startIso)}&end=${encodeURIComponent(range.endIso)}`, { cache: 'no-store', credentials: 'include' });
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
      const res = await fetch(`/api/admin/creativach-rooms?${params.toString()}`, { cache: 'no-store', credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Ошибка');
      setRoomList(data);
    } catch {
      setRoomList(null);
    } finally {
      setRoomsLoading(false);
    }
  }, [roomsPage, roomStatusFilter, roomSearch]);

  /* ── Room actions ── */
  const closeRoom = useCallback(async (roomId: string) => {
    if (!confirm('Закрыть комнату (статус finished)?')) return;
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/creativach-rooms', {
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
      const res = await fetch('/api/admin/creativach-rooms', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) throw new Error('Ошибка');
      setActionMsg('Комната удалена');
      await loadRooms();
    } catch {
      setActionMsg('Не удалось удалить комнату');
    }
  }, [loadRooms]);

  const restartRoom = useCallback(async (roomId: string) => {
    if (!confirm('Перезапустить комнату (сброс в lobby)?')) return;
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/creativach-rooms', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          patch: { status: 'lobby', current_round: 0, voting_phase: 'idle', current_task: null, current_abbreviation: null },
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

  const a = analytics;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="retro-panel bg-gradient-to-r from-[#FF6B35] to-[#e84d0e] text-white px-6 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="retro-heading text-xs tracking-[0.5em] opacity-70">Аналитика</p>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight">✍️ Креативач</h1>
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
            <button onClick={loadAnalytics} disabled={analyticsLoading} className="px-4 py-2 rounded-xl bg-white text-[#FF6B35] font-black text-sm hover:bg-white/90 transition disabled:opacity-50">
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
          ['leaderboard', '🏆 Лидеры'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-3 rounded-2xl border-[3px] font-black tracking-wide text-sm transition ${tab === t ? 'border-[#FF6B35] bg-[#FF6B35] text-white' : 'border-[#142a45] bg-white text-[#142a45] hover:bg-[#142a45]/5'}`}>
            {label}
          </button>
        ))}
      </div>

      {actionMsg && <div className="px-4 py-2 rounded-xl bg-[#142a45] text-[#ffeccd] font-bold text-sm">{actionMsg}</div>}
      {analyticsError && <div className="px-4 py-2 rounded-xl bg-red-100 text-red-700 font-bold text-sm">{analyticsError}</div>}

      {/* ──────────── OVERVIEW TAB ──────────── */}
      {tab === 'overview' && a && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Комнат" value={fmt(a.rooms.total)} status="neutral" />
            <KpiCard label="Завершено" value={`${fmt(a.rooms.finished)} (${a.rooms.finishRate}%)`} status={a.rooms.finishRate >= 50 ? 'success' : 'warning'} />
            <KpiCard label="Активные" value={fmt(a.rooms.active)} status={a.rooms.active > 0 ? 'info' : 'neutral'} />
            <KpiCard label="Игроков" value={fmt(a.players.gamePlayers)} status="neutral" />
            <KpiCard label="Зрителей" value={fmt(a.players.spectators)} status="neutral" />
            <KpiCard label="Уникальных" value={fmt(a.players.uniqueNames)} status="info" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Ответов" value={fmt(a.engagement.totalAnswers)} hint={`Rate: ${a.engagement.answerRate}%`} status={a.engagement.answerRate >= 70 ? 'success' : 'warning'} />
            <KpiCard label="Голосов" value={fmt(a.engagement.totalVotes)} hint={`Участие: ${a.engagement.voteParticipation}%`} status={a.engagement.voteParticipation >= 50 ? 'success' : 'warning'} />
            <KpiCard label="Голоса игроков" value={fmt(a.engagement.playerVotes)} status="neutral" />
            <KpiCard label="Ср. длительность" value={`${a.rooms.avgDurationMin} мин`} hint={`Медиана: ${a.rooms.medianDurationMin} мин`} status="neutral" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SectionCard title="СРЕДНИЕ ПОКАЗАТЕЛИ">
              <MetricRow label="Игроков на комнату" value={a.players.avgPlayersPerRoom} />
              <MetricRow label="Зрителей на комнату" value={a.players.avgSpectatorsPerRoom} />
              <MetricRow label="Голоса зрителей" value={fmt(a.engagement.spectatorVotes)} />
              <MetricRow label="Брошено в лобби" value={fmt(a.rooms.lobbyAbandoned)} status={a.rooms.lobbyAbandoned > a.rooms.finished ? 'warning' : 'neutral'} />
            </SectionCard>
            <SectionCard title="РАСПРЕДЕЛЕНИЕ РАУНДОВ">
              {Object.entries(a.rooms.maxRoundReached).map(([label, count]) => (
                <MetricRow key={label} label={label} value={count} />
              ))}
            </SectionCard>
          </div>

          <SectionCard title="СТАТУСЫ КОМНАТ">
            <div className="flex flex-wrap gap-2">
              {Object.entries(a.rooms.statusDistribution).map(([st, count]) => (
                <StatusBadge key={st} label={`${STATUS_LABELS[st] ?? st}: ${count}`} status={statusBadgeVariant(st)} />
              ))}
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SectionCard title="КОМНАТЫ ВО ВРЕМЕНИ">
              <BarChart title="" series={a.charts.roomsByTime} />
            </SectionCard>
            <SectionCard title="ИГРОКИ ВО ВРЕМЕНИ">
              <BarChart title="" series={a.charts.playersByTime} />
            </SectionCard>
            <SectionCard title="ОТВЕТЫ ВО ВРЕМЕНИ">
              <BarChart title="" series={a.charts.answersByTime} />
            </SectionCard>
          </div>
        </div>
      )}

      {/* ──────────── ROOMS TAB ──────────── */}
      {tab === 'rooms' && (
        <div className="space-y-4">
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

          {roomList && (
            <>
              <div className="text-sm font-bold opacity-60">
                Показано {roomList.items.length} из {roomList.total} | Стр {roomList.page}/{roomList.totalPages}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-[#142a45]/20">
                      <th className="text-left p-2 font-black">Код</th>
                      <th className="text-left p-2 font-black">Статус</th>
                      <th className="text-center p-2 font-black">Раунд</th>
                      <th className="text-center p-2 font-black">Фаза</th>
                      <th className="text-center p-2 font-black">Игр.</th>
                      <th className="text-center p-2 font-black">Зрит.</th>
                      <th className="text-center p-2 font-black">Отв.</th>
                      <th className="text-left p-2 font-black">Создана</th>
                      <th className="text-center p-2 font-black">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomList.items.map(r => (
                      <tr key={r.id} className="border-b border-[#142a45]/10 hover:bg-[#142a45]/5">
                        <td className="p-2 font-mono font-bold">{r.code}</td>
                        <td className="p-2"><StatusBadge label={STATUS_LABELS[r.status ?? ''] ?? r.status ?? '?'} status={statusBadgeVariant(r.status)} /></td>
                        <td className="p-2 text-center">{r.current_round ?? 0}</td>
                        <td className="p-2 text-center text-xs">{r.voting_phase ?? '—'}</td>
                        <td className="p-2 text-center">{r.playerCount}</td>
                        <td className="p-2 text-center">{r.spectatorCount}</td>
                        <td className="p-2 text-center">{r.answerCount}</td>
                        <td className="p-2 text-xs">{fmtDate(r.created_at)}</td>
                        <td className="p-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => closeRoom(r.id)} title="Закрыть" className="px-2 py-1 rounded-lg bg-yellow-100 text-yellow-800 text-xs font-bold hover:bg-yellow-200">⏹</button>
                            <button onClick={() => restartRoom(r.id)} title="Рестарт" className="px-2 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-bold hover:bg-blue-200">🔄</button>
                            <button onClick={() => deleteRoom(r.id)} title="Удалить" className="px-2 py-1 rounded-lg bg-red-100 text-red-800 text-xs font-bold hover:bg-red-200">🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {roomList.totalPages > 1 && (
                <div className="flex gap-2 justify-center">
                  <button disabled={roomsPage <= 1} onClick={() => setRoomsPage(p => p - 1)} className="px-3 py-1 rounded-xl border-2 border-[#142a45]/30 font-bold text-sm disabled:opacity-30">←</button>
                  <span className="px-3 py-1 font-bold text-sm">{roomsPage} / {roomList.totalPages}</span>
                  <button disabled={roomsPage >= roomList.totalPages} onClick={() => setRoomsPage(p => p + 1)} className="px-3 py-1 rounded-xl border-2 border-[#142a45]/30 font-bold text-sm disabled:opacity-30">→</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ──────────── LEADERBOARD TAB ──────────── */}
      {tab === 'leaderboard' && a && (
        <SectionCard title="ТОП-20 ИГРОКОВ">
          {a.playerLeaderboard.length === 0 ? (
            <p className="text-sm opacity-60">Нет данных за выбранный период</p>
          ) : (
            <div className="space-y-1">
              {a.playerLeaderboard.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 py-1 border-b border-[#142a45]/5">
                  <span className="font-black w-8 text-right text-sm">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  <span className="font-bold flex-1 truncate">{p.name}</span>
                  <span className="font-black text-[#FF6B35]">{p.totalPoints} pts</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
