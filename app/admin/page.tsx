'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, KpiCard, MetricRow, SectionCard, StatusBadge, type SeriesPoint } from '@/components/admin/AdminWidgets';

type LeaderboardRow = { playerId: string; name: string; points: number };

type AnalyticsResponse = {
  players?: { unique?: number; joined?: number };
  rounds?: { started?: number; finished?: number };
  exits?: { byStatus?: Record<string, number>; byReason?: Record<string, number> };
  realtime?: { latencyAvg?: number | null; latencyP95?: number | null; reconnects?: number; fallbackCount?: number };
  diagnostics?: { activeRooms?: number; activePlayers?: number };
  retention?: { join?: number; answer1?: number; round2?: number; finish?: number; notes?: string[] };
  charts?: {
    roomsByTime?: SeriesPoint[];
    playerJoinsByTime?: SeriesPoint[];
    playerExitsByTime?: SeriesPoint[];
    roundsFinishedByTime?: SeriesPoint[];
    realtimeErrorsByTime?: SeriesPoint[];
    realtimeLatencyByTime?: SeriesPoint[];
  };
};

type LogsResponse = {
  items: Array<{
    id: string;
    createdAt: string;
    level: string;
    channel: string;
    message: string;
    eventName: string | null;
    roomId: string | null;
    playerId: string | null;
    context?: Record<string, unknown> | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

type ActiveRoomRow = { id: string; code: string; status: string | null; createdAt: string | null };

type RoomDetails = {
  room: Record<string, unknown>;
  players: Array<{ id: string; name: string; total_points: number; joined_at: string | null }>;
  logs: Array<{ id: string; created_at: string; level: string; message: string; event_name: string | null }>
};

const formatIso = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—');
const formatNumber = (value?: number | null) => (value ?? 0).toLocaleString('ru-RU');

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [roomsTotal, setRoomsTotal] = useState<number | null>(null);
  const [playersTotal, setPlayersTotal] = useState<number | null>(null);
  const [roomsInRange, setRoomsInRange] = useState<number | null>(null);
  const [playersInRange, setPlayersInRange] = useState<number | null>(null);
  const [roomsActive, setRoomsActive] = useState<number | null>(null);
  const [roomsFinished, setRoomsFinished] = useState<number | null>(null);

  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [leaderboardTotal, setLeaderboardTotal] = useState<LeaderboardRow[]>([]);
  const [leaderboardRound2, setLeaderboardRound2] = useState<LeaderboardRow[]>([]);
  const [activeRooms, setActiveRooms] = useState<ActiveRoomRow[]>([]);

  const [logsData, setLogsData] = useState<LogsResponse | null>(null);
  const [logsPage, setLogsPage] = useState(1);
  const [logSearch, setLogSearch] = useState('');

  const [roomFilter, setRoomFilter] = useState('');
  const [playerFilter, setPlayerFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);

  const today = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [startDate, setStartDate] = useState<string>(() => today);
  const [endDate, setEndDate] = useState<string>(() => today);

  const range = useMemo(() => {
    const startMs = Date.parse(startDate);
    const endMs = Date.parse(endDate);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    const start = new Date(startMs);
    const endExclusive = new Date(endMs);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return { startIso: start.toISOString(), endIso: endExclusive.toISOString() };
  }, [endDate, startDate]);

  const quickRange = useCallback((kind: 'today' | '24h' | 'week' | 'month') => {
    const now = new Date();
    if (kind === 'today') {
      setStartDate(today);
      setEndDate(today);
      return;
    }
    const start = new Date(now);
    if (kind === '24h') start.setDate(start.getDate() - 1);
    if (kind === 'week') start.setDate(start.getDate() - 7);
    if (kind === 'month') start.setDate(start.getDate() - 30);
    const yyyy = start.getFullYear();
    const mm = String(start.getMonth() + 1).padStart(2, '0');
    const dd = String(start.getDate()).padStart(2, '0');
    setStartDate(`${yyyy}-${mm}-${dd}`);
    setEndDate(today);
  }, [today]);

  const buildQuery = useCallback(
    (extra?: Record<string, string | number | undefined>) => {
      if (!range) return null;
      const params = new URLSearchParams({
        start: range.startIso,
        end: range.endIso,
        ...(roomFilter ? { room_id: roomFilter } : {}),
        ...(playerFilter ? { player_id: playerFilter } : {}),
        ...(eventFilter && eventFilter !== 'error' ? { event_name: eventFilter } : {}),
        ...(extra ?? {}),
      } as Record<string, string>);
      return params;
    },
    [eventFilter, playerFilter, range, roomFilter]
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionMessage(null);

    try {
      const qs = buildQuery();
      if (!qs) {
        setError('Некорректный период');
        return;
      }
      const [statsRes, lbTotalRes, lbRound2Res, analyticsRes, roomsRes] = await Promise.all([
        fetch(`/api/admin/stats?${qs.toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/leaderboard?${new URLSearchParams({ ...Object.fromEntries(qs), type: 'total', limit: '10' }).toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/leaderboard?${new URLSearchParams({ ...Object.fromEntries(qs), type: 'round2', limit: '10' }).toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/analytics?${qs.toString()}`, { cache: 'no-store' }),
        fetch('/api/admin/rooms/active', { cache: 'no-store' }),
      ]);

      const statsPayload = await statsRes.json().catch(() => null);
      const lbTotalPayload = await lbTotalRes.json().catch(() => null);
      const lbRound2Payload = await lbRound2Res.json().catch(() => null);
      const analyticsPayload = await analyticsRes.json().catch(() => null);
      const roomsPayload = await roomsRes.json().catch(() => null);

      if (!statsRes.ok) throw new Error(statsPayload?.error ?? 'Не удалось загрузить статистику');
      if (!lbTotalRes.ok) throw new Error(lbTotalPayload?.error ?? 'Не удалось загрузить лидерборд');
      if (!lbRound2Res.ok) throw new Error(lbRound2Payload?.error ?? 'Не удалось загрузить лидерборд Раунда 2');
      if (!analyticsRes.ok) throw new Error(analyticsPayload?.error ?? 'Не удалось загрузить аналитику');
      if (!roomsRes.ok) throw new Error(roomsPayload?.error ?? 'Не удалось загрузить активные комнаты');

      setRoomsTotal(statsPayload?.rooms?.total ?? 0);
      setPlayersTotal(statsPayload?.players?.total ?? 0);
      setRoomsInRange(statsPayload?.rooms?.inRange ?? 0);
      setPlayersInRange(statsPayload?.players?.inRange ?? 0);
      setRoomsActive(statsPayload?.rooms?.active ?? 0);
      setRoomsFinished(statsPayload?.rooms?.finished ?? 0);

      setLeaderboardTotal((lbTotalPayload?.items ?? []).map((it: Record<string, unknown>) => ({
        playerId: String(it.playerId),
        name: String(it.name ?? ''),
        points: Number(it.points ?? 0),
      })));
      setLeaderboardRound2((lbRound2Payload?.items ?? []).map((it: Record<string, unknown>) => ({
        playerId: String(it.playerId),
        name: String(it.name ?? ''),
        points: Number(it.points ?? 0),
      })));

      setAnalytics(analyticsPayload ?? null);
      setActiveRooms((roomsPayload?.items ?? []).map((it: Record<string, unknown>) => ({
        id: String(it.id),
        code: String(it.code),
        status: it.status ? String(it.status) : null,
        createdAt: it.createdAt ? String(it.createdAt) : null,
      })));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Не удалось загрузить данные';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const loadLogs = useCallback(async () => {
    const qs = buildQuery({ page: logsPage, limit: 25, ...(logSearch ? { search: logSearch } : {}) });
    if (!qs) return;
    const res = await fetch(`/api/admin/logs?${qs.toString()}`, { cache: 'no-store' });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось загрузить логи');
      return;
    }
    setLogsData(payload as LogsResponse);
  }, [buildQuery, logSearch, logsPage]);

  const loadRoomDetails = useCallback(async (roomId: string) => {
    setSelectedRoomId(roomId);
    const res = await fetch(`/api/admin/room/details?roomId=${encodeURIComponent(roomId)}`, { cache: 'no-store' });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось загрузить комнату');
      return;
    }
    setRoomDetails(payload as RoomDetails);
  }, []);

  const closeRoomByCode = useCallback(async (code: string) => {
    setActionMessage(null);
    setError(null);
    if (!/^\d{4}$/.test(code)) {
      setError('Некорректный код комнаты');
      return;
    }
    if (!confirm(`Закрыть комнату ${code}?`)) return;
    const res = await fetch('/api/admin/room/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось закрыть комнату');
      return;
    }
    setActionMessage(`Комната ${code} закрыта`);
    void loadDashboard();
  }, [loadDashboard]);

  const forceEndRound = useCallback(async (roomId: string) => {
    if (!confirm('Принудительно завершить текущий раунд?')) return;
    const res = await fetch('/api/admin/room/force-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось завершить раунд');
      return;
    }
    setActionMessage('Раунд принудительно завершён');
    void loadRoomDetails(roomId);
  }, [loadRoomDetails]);

  const restartRoom = useCallback(async (roomId: string) => {
    if (!confirm('Перезапустить комнату?')) return;
    const res = await fetch('/api/admin/room/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось перезапустить комнату');
      return;
    }
    setActionMessage('Комната перезапущена');
    void loadRoomDetails(roomId);
  }, [loadRoomDetails]);

  const downloadCsv = useCallback(async (url: string, filename: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      setError('Не удалось выгрузить CSV');
      return;
    }
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const totalExits = useMemo(() => {
    const byStatus = analytics?.exits?.byStatus ?? {};
    return Object.values(byStatus).reduce((sum, count) => sum + count, 0);
  }, [analytics?.exits?.byStatus]);

  const realtimeStatus = useMemo(() => {
    const latency = analytics?.realtime?.latencyP95 ?? 0;
    const reconnects = analytics?.realtime?.reconnects ?? 0;
    if (reconnects > 5 || latency > 1200) return 'error' as const;
    if (reconnects > 0 || latency > 800) return 'warning' as const;
    return 'success' as const;
  }, [analytics?.realtime?.latencyP95, analytics?.realtime?.reconnects]);

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-6">
      <div className="max-w-[95vw] mx-auto space-y-6">
        <header className="retro-panel bg-[#142a45] text-[#ffeccd] px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/70">Админ</p>
              <h1 className="text-3xl sm:text-4xl font-black leading-tight">Аналитический центр</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadDashboard()}
                className="px-5 py-3 rounded-2xl border-[3px] border-[#ffeccd] text-[#ffeccd] font-black tracking-[0.2em] hover:bg-[#ffeccd]/10 transition"
              >
                Обновить
              </button>
              {range ? (
                <button
                  type="button"
                  onClick={() => void downloadCsv(`/api/admin/export/stats?start=${range.startIso}&end=${range.endIso}`, 'stats-export.csv')}
                  className="px-5 py-3 rounded-2xl border-[3px] border-[#ffeccd] text-[#ffeccd] font-black tracking-[0.2em] hover:bg-[#ffeccd]/10 transition"
                >
                  Экспорт KPI
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-3xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
            {error}
          </div>
        ) : null}

        {actionMessage ? (
          <div className="rounded-3xl border-[3px] border-[#2f7a3b] bg-[#dff7e3] px-4 py-3 text-sm font-semibold text-[#1b4d23]">
            {actionMessage}
          </div>
        ) : null}

        <SectionCard
          title="Фильтры"
          actions={
            <>
              <button
                type="button"
                onClick={() => quickRange('today')}
                className="px-4 py-2 rounded-2xl border-[2px] border-[#142a45] text-xs font-black"
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => quickRange('24h')}
                className="px-4 py-2 rounded-2xl border-[2px] border-[#142a45] text-xs font-black"
              >
                24 часа
              </button>
              <button
                type="button"
                onClick={() => quickRange('week')}
                className="px-4 py-2 rounded-2xl border-[2px] border-[#142a45] text-xs font-black"
              >
                Неделя
              </button>
              <button
                type="button"
                onClick={() => quickRange('month')}
                className="px-4 py-2 rounded-2xl border-[2px] border-[#142a45] text-xs font-black"
              >
                Месяц
              </button>
            </>
          }
        >
          <div className="grid gap-4 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">С</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-[#fff2c8] font-black"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">ПО</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-[#fff2c8] font-black"
              />
            </div>
            <div>
              <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">Room ID</label>
              <input
                type="text"
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                placeholder="uuid"
                className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
              />
            </div>
            <div>
              <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">Player ID</label>
              <input
                type="text"
                value={playerFilter}
                onChange={(e) => setPlayerFilter(e.target.value)}
                placeholder="uuid"
                className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
              />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-4 mt-4">
            <div>
              <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">Событие</label>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
              >
                <option value="">Все</option>
                <option value="player_join">join</option>
                <option value="player_exit">exit</option>
                <option value="round_start">round_start</option>
                <option value="error">error</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">Поиск</label>
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="message / event"
                className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setLogsPage(1);
                  void loadDashboard();
                  void loadLogs();
                }}
                className="w-full px-5 py-3 rounded-2xl border-[3px] border-[#142a45] text-[#142a45] font-black tracking-[0.2em] hover:bg-[#142a45]/5 transition"
              >
                Применить
              </button>
            </div>
            <div className="flex items-end gap-2">
              {range ? (
                <button
                  type="button"
                  onClick={() => void downloadCsv(`/api/admin/export/logs?start=${range.startIso}&end=${range.endIso}`, 'logs-export.csv')}
                  className="w-full px-5 py-3 rounded-2xl border-[3px] border-[#142a45] text-[#142a45] font-black tracking-[0.2em] hover:bg-[#142a45]/5 transition"
                >
                  Экспорт логов
                </button>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-5">
          <KpiCard label="Комнаты активные" value={formatNumber(roomsActive ?? 0)} status="success" />
          <KpiCard label="Игроки активные" value={formatNumber(analytics?.diagnostics?.activePlayers ?? 0)} status="info" />
          <KpiCard label="Уникальные игроки" value={formatNumber(analytics?.players?.unique ?? 0)} status="neutral" />
          <KpiCard label="Запуски раундов" value={formatNumber(analytics?.rounds?.started ?? 0)} status="neutral" />
          <KpiCard label="Ошибки realtime" value={formatNumber(analytics?.realtime?.reconnects ?? 0)} status={realtimeStatus} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Комнаты">
            <div className="grid gap-3 sm:grid-cols-2">
              <KpiCard label="Всего" value={formatNumber(roomsTotal ?? 0)} />
              <KpiCard label="За период" value={formatNumber(roomsInRange ?? 0)} status="info" />
              <KpiCard label="Активные" value={formatNumber(roomsActive ?? 0)} status="success" />
              <KpiCard label="Завершены" value={formatNumber(roomsFinished ?? 0)} status="neutral" />
            </div>
          </SectionCard>
          <SectionCard title="Игроки">
            <div className="grid gap-3 sm:grid-cols-2">
              <KpiCard label="Всего" value={formatNumber(playersTotal ?? 0)} />
              <KpiCard label="За период" value={formatNumber(playersInRange ?? 0)} status="info" />
              <KpiCard label="Входы" value={formatNumber(analytics?.players?.joined ?? 0)} status="success" />
              <KpiCard label="Выходы" value={formatNumber(totalExits)} status={totalExits > 0 ? 'warning' : 'neutral'} />
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Графики">
          <div className="grid gap-6 lg:grid-cols-2">
            <BarChart title="Активность комнат" series={analytics?.charts?.roomsByTime ?? []} />
            <BarChart title="Входы игроков" series={analytics?.charts?.playerJoinsByTime ?? []} />
            <BarChart title="Выходы игроков" series={analytics?.charts?.playerExitsByTime ?? []} />
            <BarChart title="Завершённые раунды" series={analytics?.charts?.roundsFinishedByTime ?? []} />
            <BarChart title="Realtime ошибки" series={analytics?.charts?.realtimeErrorsByTime ?? []} />
            <BarChart title="Realtime latency (avg)" series={analytics?.charts?.realtimeLatencyByTime ?? []} valueSuffix=" ms" />
          </div>
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Диагностика Realtime">
            <div className="space-y-3">
              <StatusBadge label={`Состояние: ${realtimeStatus}`} status={realtimeStatus} />
              <MetricRow label="Latency avg" value={`${analytics?.realtime?.latencyAvg ?? 0} ms`} />
              <MetricRow label="Latency p95" value={`${analytics?.realtime?.latencyP95 ?? 0} ms`} />
              <MetricRow label="Reconnects" value={formatNumber(analytics?.realtime?.reconnects ?? 0)} status={realtimeStatus} />
              <MetricRow label="Fallback usage" value={formatNumber(analytics?.realtime?.fallbackCount ?? 0)} status={analytics?.realtime?.fallbackCount ? 'warning' : 'success'} />
              <MetricRow label="Активные комнаты" value={formatNumber(analytics?.diagnostics?.activeRooms ?? 0)} />
              <MetricRow label="Активные игроки" value={formatNumber(analytics?.diagnostics?.activePlayers ?? 0)} />
            </div>
          </SectionCard>

          <SectionCard title="Retention-фонтанка">
            <div className="space-y-2">
              <MetricRow label="Join" value={formatNumber(analytics?.retention?.join ?? 0)} />
              <MetricRow label="Answer 1" value={formatNumber(analytics?.retention?.answer1 ?? 0)} />
              <MetricRow label="Round 2" value={formatNumber(analytics?.retention?.round2 ?? 0)} />
              <MetricRow label="Finish" value={formatNumber(analytics?.retention?.finish ?? 0)} />
              {analytics?.retention?.notes?.length ? (
                <p className="text-xs text-[#142a45]/60">{analytics.retention.notes.join(' · ')}</p>
              ) : null}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Логи">
          <div className="flex flex-wrap gap-2 mb-3">
            {range ? (
              <button
                type="button"
                onClick={() => void downloadCsv(`/api/admin/export/players?start=${range.startIso}&end=${range.endIso}`, 'players-export.csv')}
                className="px-4 py-2 rounded-2xl border-[2px] border-[#142a45] text-xs font-black"
              >
                Экспорт игроков
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-[#142a45]/60">
                  <th className="py-2">Время</th>
                  <th className="py-2">Уровень</th>
                  <th className="py-2">Событие</th>
                  <th className="py-2">Сообщение</th>
                  <th className="py-2">Room</th>
                  <th className="py-2">Player</th>
                </tr>
              </thead>
              <tbody>
                {(logsData?.items ?? []).map((log) => (
                  <tr key={log.id} className="border-t border-[#142a45]/10">
                    <td className="py-2 text-xs text-[#142a45]/70">{formatIso(log.createdAt)}</td>
                    <td className="py-2">
                      <StatusBadge
                        label={log.level}
                        status={log.level === 'error' ? 'error' : log.level === 'warn' ? 'warning' : 'neutral'}
                      />
                    </td>
                    <td className="py-2 text-xs font-semibold text-[#142a45]/70">{log.eventName ?? '—'}</td>
                    <td className="py-2 font-semibold text-[#142a45] max-w-xs truncate" title={log.message}>{log.message}</td>
                    <td className="py-2 text-xs text-[#142a45]/70">{log.roomId ?? '—'}</td>
                    <td className="py-2 text-xs text-[#142a45]/70">{log.playerId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-4 text-sm font-semibold">
            <span>Всего: {formatNumber(logsData?.total ?? 0)}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={logsPage <= 1}
                onClick={() => setLogsPage((prev) => Math.max(1, prev - 1))}
                className="px-4 py-2 rounded-2xl border-[2px] border-[#142a45] font-black disabled:opacity-40"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={(logsData?.pageSize ?? 0) * (logsPage ?? 1) >= (logsData?.total ?? 0)}
                onClick={() => setLogsPage((prev) => prev + 1)}
                className="px-4 py-2 rounded-2xl border-[2px] border-[#142a45] font-black disabled:opacity-40"
              >
                Вперёд
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Управление комнатами">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              {(activeRooms ?? []).map((room) => (
                <div key={room.id} className="rounded-2xl border-[2px] border-[#142a45]/20 bg-[#fffaf0] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-black">Код: {room.code}</div>
                      <div className="text-xs text-[#142a45]/60">{room.status ?? '—'} · {formatIso(room.createdAt)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadRoomDetails(room.id)}
                      className="px-4 py-2 rounded-2xl border-[2px] border-[#142a45] text-xs font-black"
                    >
                      Детали
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void closeRoomByCode(room.code)}
                      className="px-4 py-2 rounded-2xl border-[2px] border-[#142a45] text-xs font-black"
                    >
                      Закрыть комнату
                    </button>
                    <button
                      type="button"
                      onClick={() => void forceEndRound(room.id)}
                      className="px-4 py-2 rounded-2xl border-[2px] border-[#b68c1d] text-xs font-black text-[#6a4a06]"
                    >
                      Завершить раунд
                    </button>
                    <button
                      type="button"
                      onClick={() => void restartRoom(room.id)}
                      className="px-4 py-2 rounded-2xl border-[2px] border-[#1f6ac6] text-xs font-black text-[#1f3d6b]"
                    >
                      Перезапуск
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border-[3px] border-[#142a45] bg-white p-4 space-y-3">
              <p className="text-sm font-black">Детали комнаты</p>
              {selectedRoomId && roomDetails ? (
                <>
                  <div className="text-xs text-[#142a45]/70">Room ID: {selectedRoomId}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Статус: {String(roomDetails.room.status ?? '—')}</div>
                    <div>Активна: {String(roomDetails.room.is_active ?? '—')}</div>
                    <div>Вопрос: {String(roomDetails.room.current_question_index ?? '—')}</div>
                    <div>Старт: {formatIso((roomDetails.room.question_started_at as string | null) ?? null)}</div>
                  </div>
                  <div>
                    <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">Игроки</p>
                    <div className="space-y-1">
                      {(roomDetails.players ?? []).map((player) => (
                        <div key={player.id} className="flex items-center justify-between text-xs">
                          <span>{player.name}</span>
                          <span>{player.total_points}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">Логи комнаты</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {(roomDetails.logs ?? []).map((log) => (
                        <div key={log.id} className="text-[11px] text-[#142a45]/70">
                          {formatIso(log.created_at)} · {log.event_name ?? log.level}: {log.message}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-[#142a45]/60">Выберите комнату для деталей.</p>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Лидерборды">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border-[2px] border-[#142a45]/20 p-4">
              <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ТОП TOTAL</p>
              <div className="space-y-2 mt-3">
                {leaderboardTotal.map((row, idx) => (
                  <div key={row.playerId} className="flex items-center justify-between text-sm font-black">
                    <span>{idx + 1}. {row.name}</span>
                    <span>{row.points}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border-[2px] border-[#142a45]/20 p-4">
              <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ТОП ROUND2</p>
              <div className="space-y-2 mt-3">
                {leaderboardRound2.map((row, idx) => (
                  <div key={row.playerId} className="flex items-center justify-between text-sm font-black">
                    <span>{idx + 1}. {row.name}</span>
                    <span>{row.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <p className="text-xs font-semibold text-[#142a45]/60">
          Доступ защищён Basic Auth (ADMIN_USER/ADMIN_PASSWORD). Для API используется SUPABASE_SERVICE_ROLE_KEY.
        </p>
      </div>
    </div>
  );
}
