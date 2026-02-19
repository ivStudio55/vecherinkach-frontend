'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, KpiCard, MetricRow, SectionCard, StatusBadge, type SeriesPoint } from '@/components/admin/AdminWidgets';
import { describeLikeQuestionId } from '@/shared/logic/questionLikes';

type LeaderboardRow = { playerId: string; name: string; points: number };

type AnalyticsResponse = {
  players?: { unique?: number; joined?: number };
  rounds?: { started?: number; finished?: number };
  exits?: { byStatus?: Record<string, number>; byReason?: Record<string, number> };
  realtime?: { latencyAvg?: number | null; latencyP95?: number | null; reconnects?: number; fallbackCount?: number };
  diagnostics?: { activeRooms?: number; activePlayers?: number };
  retention?: { join?: number; answer1?: number; round2?: number; finish?: number; notes?: string[] };
  engagement?: {
    sessions?: number;
    returningSessions?: number;
    marathonSessions?: number;
    consecutiveSessions?: number;
    avgSessionMinutes?: number;
    medianSessionMinutes?: number;
    avgGamesPerSession?: number;
    avgFinishedRoomDurationMinutes?: number;
  };
  questionReactions?: {
    totalLikes?: number;
    byRound?: Record<string, number>;
    topQuestions?: Array<{ questionId: number; likes: number; sharePct: number }>;
  };
  errors?: {
    total?: number;
    critical?: number;
    byEvent?: Record<string, number>;
    byChannel?: Record<string, number>;
    topEvents?: Array<{ event: string; count: number }>;
  };
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

type ErrorFeedItem = {
  id: string;
  createdAt: string;
  level: string;
  channel: string;
  message: string;
  eventName: string | null;
  roomId: string | null;
};

type ActiveRoomRow = { id: string; code: string; status: string | null; createdAt: string | null };
type TopLikedQuestionRow = { question_id: number; likes: number };

type RoomDetails = {
  room: Record<string, unknown>;
  players: Array<{ id: string; name: string; total_points: number; joined_at: string | null }>;
  logs: Array<{ id: string; created_at: string; level: string; message: string; event_name: string | null }>;
  bestQuestion?: { question_id: number; likes: number } | null;
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
  const [topLikedQuestions, setTopLikedQuestions] = useState<TopLikedQuestionRow[]>([]);

  const [logsData, setLogsData] = useState<LogsResponse | null>(null);
  const [errorFeed, setErrorFeed] = useState<ErrorFeedItem[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logSearch, setLogSearch] = useState('');

  // Панель управления отдельной комнатой
  const [controlRoomId, setControlRoomId] = useState('');
  const [controlLoading, setControlLoading] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlSummary, setControlSummary] = useState<null | {
    room?: Record<string, unknown> | null;
    counts?: { answers?: number; round2Answers?: number; round3Answers?: number; round3Votes?: number; round4Answers?: number; round5Answers?: number; likes?: number; logs?: number };
    topLikes?: Array<{ questionId: number; likes: number }>;
    errorLogs?: Array<{ id: string; created_at: string; level: string; message: string; event_name: string | null }>;
  }>(null);

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

  const loadControlSummary = useCallback(async () => {
    const roomId = controlRoomId.trim();
    if (!roomId) {
      setControlError('Введите roomId');
      return;
    }
    setControlLoading(true);
    setControlError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/room/summary?roomId=${encodeURIComponent(roomId)}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Не удалось загрузить комнату');
      setControlSummary(payload ?? null);
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'Ошибка загрузки комнаты');
      setControlSummary(null);
    } finally {
      setControlLoading(false);
    }
  }, [controlRoomId]);

  const controlCode = useMemo(() => {
    const code = (controlSummary?.room as { code?: unknown } | undefined)?.code;
    return typeof code === 'string' ? code : '';
  }, [controlSummary?.room]);

  const ensureControlCode = () => {
    if (!/^[0-9]{4}$/.test(controlCode)) {
      setControlError('В summary нет валидного кода комнаты');
      return null;
    }
    return controlCode;
  };

  const ensureRoomId = () => {
    const value = controlRoomId.trim();
    if (!value) {
      setControlError('Введите roomId');
      return null;
    }
    return value;
  };

  const controlCloseRoom = useCallback(async () => {
    const code = ensureControlCode();
    if (!code) return;
    if (!confirm(`Закрыть комнату ${code}?`)) return;
    setControlLoading(true);
    setControlError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/room/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Не удалось закрыть комнату');
      setActionMessage(`Комната ${code} закрыта`);
      await loadControlSummary();
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'Ошибка закрытия комнаты');
    } finally {
      setControlLoading(false);
    }
  }, [controlCode, loadControlSummary]);

  const controlDeleteRoom = useCallback(async () => {
    const code = ensureControlCode();
    if (!code) return;
    if (!confirm(`Удалить комнату ${code}? Это удалит игроков/ответы/логи.`)) return;
    setControlLoading(true);
    setControlError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/room/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Не удалось удалить комнату');
      setActionMessage(`Комната ${code} удалена`);
      setControlSummary(null);
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'Ошибка удаления комнаты');
    } finally {
      setControlLoading(false);
    }
  }, [controlCode]);

  const controlRestartRoom = useCallback(async () => {
    const roomId = ensureRoomId();
    if (!roomId) return;
    if (!confirm('Перезапустить комнату?')) return;
    setControlLoading(true);
    setControlError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/room/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Не удалось перезапустить комнату');
      setActionMessage('Комната перезапущена');
      await loadControlSummary();
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'Ошибка перезапуска комнаты');
    } finally {
      setControlLoading(false);
    }
  }, [controlRoomId, loadControlSummary]);

  const controlForceEnd = useCallback(async () => {
    const roomId = ensureRoomId();
    if (!roomId) return;
    if (!confirm('Принудительно завершить текущий раунд?')) return;
    setControlLoading(true);
    setControlError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/room/force-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Не удалось завершить раунд');
      setActionMessage('Раунд завершён принудительно');
      await loadControlSummary();
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'Ошибка завершения раунда');
    } finally {
      setControlLoading(false);
    }
  }, [controlRoomId, loadControlSummary]);

  const controlNextQuestion = useCallback(async () => {
    const roomId = ensureRoomId();
    if (!roomId) return;
    setControlLoading(true);
    setControlError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/room/next-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Не удалось переключить вопрос');
      setActionMessage('Следующий вопрос запущен');
      await loadControlSummary();
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'Ошибка переключения вопроса');
    } finally {
      setControlLoading(false);
    }
  }, [controlRoomId, loadControlSummary]);

  const controlStartRound3 = useCallback(async () => {
    const roomId = ensureRoomId();
    if (!roomId) return;
    if (!confirm('Запустить Round 3 через RPC?')) return;
    setControlLoading(true);
    setControlError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/room/start-round3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Не удалось запустить Round 3');
      setActionMessage('Round 3 запущен');
      await loadControlSummary();
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'Ошибка запуска Round 3');
    } finally {
      setControlLoading(false);
    }
  }, [controlRoomId, loadControlSummary]);

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
      const [statsRes, lbTotalRes, lbRound2Res, analyticsRes, roomsRes, likesRes] = await Promise.all([
        fetch(`/api/admin/stats?${qs.toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/leaderboard?${new URLSearchParams({ ...Object.fromEntries(qs), type: 'total', limit: '10' }).toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/leaderboard?${new URLSearchParams({ ...Object.fromEntries(qs), type: 'round2', limit: '10' }).toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/analytics?${qs.toString()}`, { cache: 'no-store' }),
        fetch('/api/admin/rooms/active', { cache: 'no-store' }),
        fetch('/api/admin/likes?limit=10', { cache: 'no-store' }),
      ]);

      const statsPayload = await statsRes.json().catch(() => null);
      const lbTotalPayload = await lbTotalRes.json().catch(() => null);
      const lbRound2Payload = await lbRound2Res.json().catch(() => null);
      const analyticsPayload = await analyticsRes.json().catch(() => null);
      const roomsPayload = await roomsRes.json().catch(() => null);
      const likesPayload = await likesRes.json().catch(() => null);

      if (!statsRes.ok) throw new Error(statsPayload?.error ?? 'Не удалось загрузить статистику');
      if (!lbTotalRes.ok) throw new Error(lbTotalPayload?.error ?? 'Не удалось загрузить лидерборд');
      if (!lbRound2Res.ok) throw new Error(lbRound2Payload?.error ?? 'Не удалось загрузить лидерборд Раунда 2');
      if (!analyticsRes.ok) throw new Error(analyticsPayload?.error ?? 'Не удалось загрузить аналитику');
      if (!roomsRes.ok) throw new Error(roomsPayload?.error ?? 'Не удалось загрузить активные комнаты');
      if (!likesRes.ok) throw new Error(likesPayload?.error ?? 'Не удалось загрузить лайки');

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
      setTopLikedQuestions((likesPayload?.items ?? []).map((it: Record<string, unknown>) => ({
        question_id: Number(it.question_id ?? 0),
        likes: Number(it.likes ?? 0),
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

  const loadErrorFeed = useCallback(async () => {
    const qs = buildQuery({ page: 1, limit: 8, level: 'error' });
    if (!qs) return;
    const res = await fetch(`/api/admin/logs?${qs.toString()}`, { cache: 'no-store' });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось загрузить блок ошибок');
      return;
    }
    const items = (payload?.items ?? []) as Array<Record<string, unknown>>;
    setErrorFeed(items.map((it) => ({
      id: String(it.id),
      createdAt: String(it.createdAt ?? ''),
      level: String(it.level ?? 'error'),
      channel: String(it.channel ?? 'unknown'),
      message: String(it.message ?? ''),
      eventName: typeof it.eventName === 'string' ? it.eventName : null,
      roomId: typeof it.roomId === 'string' ? it.roomId : null,
    })));
  }, [buildQuery]);

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

  const startRound3Rpc = useCallback(async (roomId: string) => {
    if (!confirm('Запустить Round 3 через RPC?')) return;
    const res = await fetch('/api/admin/room/start-round3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось запустить Round 3 через RPC');
      return;
    }
    setActionMessage('Round 3 запущен через RPC');
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

  useEffect(() => {
    void loadErrorFeed();
  }, [loadErrorFeed]);

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

  const engagement = analytics?.engagement;
  const retention = analytics?.retention;
  const returnRate = useMemo(() => {
    const sessions = engagement?.sessions ?? 0;
    const returning = engagement?.returningSessions ?? 0;
    if (sessions <= 0) return 0;
    return Math.round((returning / sessions) * 1000) / 10;
  }, [engagement?.returningSessions, engagement?.sessions]);

  const consecutiveRate = useMemo(() => {
    const sessions = engagement?.sessions ?? 0;
    const consecutive = engagement?.consecutiveSessions ?? 0;
    if (sessions <= 0) return 0;
    return Math.round((consecutive / sessions) * 1000) / 10;
  }, [engagement?.consecutiveSessions, engagement?.sessions]);

  const retentionToAnswer1 = useMemo(() => {
    const join = retention?.join ?? 0;
    const answer1 = retention?.answer1 ?? 0;
    if (join <= 0) return 0;
    return Math.round((answer1 / join) * 1000) / 10;
  }, [retention?.answer1, retention?.join]);

  const retentionToFinish = useMemo(() => {
    const join = retention?.join ?? 0;
    const finish = retention?.finish ?? 0;
    if (join <= 0) return 0;
    return Math.round((finish / join) * 1000) / 10;
  }, [retention?.finish, retention?.join]);

  const likesByRoundSeries = useMemo(() => {
    const byRound = analytics?.questionReactions?.byRound ?? {};
    return [
      { label: 'R1', value: Number(byRound.round1 ?? 0) },
      { label: 'R2', value: Number(byRound.round2 ?? 0) },
      { label: 'R3', value: Number(byRound.round3 ?? 0) },
      { label: 'R4', value: Number(byRound.round4 ?? 0) },
      { label: 'R5', value: Number(byRound.round5 ?? 0) },
    ];
  }, [analytics?.questionReactions?.byRound]);

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
                onClick={() => {
                  void loadDashboard();
                  void loadLogs();
                  void loadErrorFeed();
                }}
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

        {loading ? (
          <div className="rounded-3xl border-[3px] border-[#1f6ac6] bg-[#e9f0ff] px-4 py-3 text-sm font-semibold text-[#1f3d6b]">
            Обновляем данные аналитического центра…
          </div>
        ) : null}

        <SectionCard
          title="Панель управления комнатой"
          actions={
            <button
              type="button"
              onClick={() => void loadControlSummary()}
              className="px-4 py-2 rounded-2xl border-[3px] border-[#142a45] bg-white font-black tracking-[0.2em] hover:bg-[#142a45]/5 disabled:opacity-60"
              disabled={controlLoading}
            >
              {controlLoading ? 'Загружаю…' : 'Загрузить'}
            </button>
          }
        >
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-black tracking-[0.25em] text-[#142a45]/60">ROOM ID (UUID)</span>
              <input
                value={controlRoomId}
                onChange={(e) => setControlRoomId(e.target.value)}
                placeholder="uuid"
                className="w-full px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
              />
            </label>
            <div className="space-y-2">
              <p className="text-xs font-black tracking-[0.25em] text-[#142a45]/60">Действия</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void controlCloseRoom()} className="px-3 py-2 rounded-xl border-[2px] border-[#b68c1d] font-black hover:bg-[#fff2c8]" disabled={controlLoading}>Close</button>
                <button onClick={() => void controlDeleteRoom()} className="px-3 py-2 rounded-xl border-[2px] border-[#b23324] font-black hover:bg-[#ffd7d0]" disabled={controlLoading}>Delete</button>
                <button onClick={() => void controlRestartRoom()} className="px-3 py-2 rounded-xl border-[2px] border-[#142a45] font-black hover:bg-[#142a45]/5" disabled={controlLoading}>Restart</button>
                <button onClick={() => void controlForceEnd()} className="px-3 py-2 rounded-xl border-[2px] border-[#142a45] font-black hover:bg-[#142a45]/5" disabled={controlLoading}>Force end</button>
                <button onClick={() => void controlNextQuestion()} className="px-3 py-2 rounded-xl border-[2px] border-[#1f6ac6] font-black hover:bg-[#e9f0ff]" disabled={controlLoading}>Next question</button>
                <button onClick={() => void controlStartRound3()} className="px-3 py-2 rounded-xl border-[2px] border-[#142a45] font-black hover:bg-[#142a45]/5" disabled={controlLoading}>Start R3 RPC</button>
              </div>
            </div>
          </div>

          {controlError ? (
            <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] p-3 font-black mt-3">{controlError}</div>
          ) : null}

          {controlSummary ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border-[2px] border-[#142a45]/20 p-4 space-y-2">
                <p className="retro-heading text-xs tracking-[0.3em] text-[#142a45]/60">SNAPSHOT</p>
                <MetricRow label="code" value={String((controlSummary.room as { code?: unknown } | null)?.code ?? '—')} />
                <MetricRow label="status" value={String((controlSummary.room as { status?: unknown } | null)?.status ?? '—')} />
                <MetricRow label="active" value={String(Boolean((controlSummary.room as { is_active?: unknown } | null)?.is_active))} />
                <MetricRow label="stateVersion" value={String((controlSummary.room as { state_version?: unknown } | null)?.state_version ?? '—')} />
                <MetricRow label="currentQuestion" value={String((controlSummary.room as { current_question_index?: unknown } | null)?.current_question_index ?? '—')} />
                <MetricRow label="round2Phase" value={String((controlSummary.room as { round2_phase?: unknown } | null)?.round2_phase ?? '—')} />
                <MetricRow label="transitioning" value={String(Boolean((controlSummary.room as { transitioning_to_next?: unknown } | null)?.transitioning_to_next))} />
              </div>
              <div className="rounded-2xl border-[2px] border-[#142a45]/20 p-4 space-y-2">
                <p className="retro-heading text-xs tracking-[0.3em] text-[#142a45]/60">COUNTS</p>
                <MetricRow label="R1 answers" value={String(controlSummary.counts?.answers ?? 0)} />
                <MetricRow label="R2 answers" value={String(controlSummary.counts?.round2Answers ?? 0)} />
                <MetricRow label="R3 answers" value={String(controlSummary.counts?.round3Answers ?? 0)} />
                <MetricRow label="R3 votes" value={String(controlSummary.counts?.round3Votes ?? 0)} />
                <MetricRow label="R4 answers" value={String(controlSummary.counts?.round4Answers ?? 0)} />
                <MetricRow label="R5 answers" value={String(controlSummary.counts?.round5Answers ?? 0)} />
                <MetricRow label="Likes" value={String(controlSummary.counts?.likes ?? 0)} />
              </div>
              <div className="rounded-2xl border-[2px] border-[#142a45]/20 p-4 space-y-2">
                <p className="retro-heading text-xs tracking-[0.3em] text-[#142a45]/60">ERROR LOGS</p>
                <div className="space-y-1 max-h-56 overflow-auto text-xs text-[#142a45]/70">
                  {(controlSummary.errorLogs ?? []).length === 0 ? <p>Нет ошибок</p> : null}
                  {(controlSummary.errorLogs ?? []).map((log) => (
                    <div key={log.id}>
                      {new Date(log.created_at).toLocaleTimeString()} · {log.event_name ?? log.level}: {log.message}
                    </div>
                  ))}
                </div>
                {controlSummary.topLikes?.[0] ? (
                  <p className="text-xs text-[#142a45]/80">Топ лайков: {describeLikeQuestionId(controlSummary.topLikes[0].questionId)} ({controlSummary.topLikes[0].likes})</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#142a45]/60 mt-3">Введите roomId и нажмите «Загрузить», чтобы увидеть срез и управлять комнатой.</p>
          )}
        </SectionCard>

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
                  void loadErrorFeed();
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
          <KpiCard label="Сессии" value={formatNumber(analytics?.engagement?.sessions ?? 0)} status="neutral" />
          <KpiCard label="Критичные ошибки" value={formatNumber(analytics?.errors?.critical ?? 0)} status={(analytics?.errors?.critical ?? 0) > 0 ? 'error' : 'success'} />
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

        <SectionCard title="Продуктовая аналитика · 5 раундов">
          <div className="grid gap-4 lg:grid-cols-4">
            <KpiCard label="Сессии" value={formatNumber(engagement?.sessions ?? 0)} status="info" />
            <KpiCard label="Возвращение" value={`${returnRate}%`} hint={`${formatNumber(engagement?.returningSessions ?? 0)} из ${formatNumber(engagement?.sessions ?? 0)}`} status={returnRate >= 35 ? 'success' : returnRate >= 20 ? 'warning' : 'error'} />
            <KpiCard label="Играют подряд" value={`${consecutiveRate}%`} hint={formatNumber(engagement?.consecutiveSessions ?? 0)} status={consecutiveRate >= 30 ? 'success' : consecutiveRate >= 15 ? 'warning' : 'neutral'} />
            <KpiCard label="Средняя сессия" value={`${engagement?.avgSessionMinutes ?? 0} мин`} hint={`медиана ${engagement?.medianSessionMinutes ?? 0} мин`} status="neutral" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3 mt-2">
            <div className="rounded-2xl border-[2px] border-[#142a45]/15 bg-[#fffaf0] p-4 space-y-2">
              <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ВОРОНКА ВОВЛЕЧЁННОСТИ</p>
              <MetricRow label="Join" value={formatNumber(retention?.join ?? 0)} />
              <MetricRow label="Ответили в R1" value={`${formatNumber(retention?.answer1 ?? 0)} (${retentionToAnswer1}%)`} />
              <MetricRow label="Дошли до R2" value={formatNumber(retention?.round2 ?? 0)} />
              <MetricRow label="Финиш" value={`${formatNumber(retention?.finish ?? 0)} (${retentionToFinish}%)`} status={retentionToFinish >= 35 ? 'success' : retentionToFinish >= 20 ? 'warning' : 'error'} />
            </div>
            <div className="rounded-2xl border-[2px] border-[#142a45]/15 bg-[#fffaf0] p-4 space-y-2">
              <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ПОВЕДЕНИЕ СЕССИЙ</p>
              <MetricRow label="Среднее игр за сессию" value={engagement?.avgGamesPerSession ?? 0} />
              <MetricRow label="Марафон-сессии (3+ игр)" value={formatNumber(engagement?.marathonSessions ?? 0)} status={(engagement?.marathonSessions ?? 0) > 0 ? 'success' : 'neutral'} />
              <MetricRow label="Средняя длительность комнаты" value={`${engagement?.avgFinishedRoomDurationMinutes ?? 0} мин`} />
              {analytics?.retention?.notes?.length ? <p className="text-xs text-[#142a45]/60">{analytics.retention.notes.join(' · ')}</p> : null}
            </div>
            <div className="rounded-2xl border-[2px] border-[#142a45]/15 bg-[#fffaf0] p-4">
              <BarChart title="Лайки по раундам" series={likesByRoundSeries} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Ошибки и стабильность (отдельно от аналитики)">
          <div className="grid gap-4 lg:grid-cols-3">
            <KpiCard label="Ошибки+предупреждения" value={formatNumber(analytics?.errors?.total ?? 0)} status={(analytics?.errors?.total ?? 0) > 0 ? 'warning' : 'success'} />
            <KpiCard label="Критичные ошибки" value={formatNumber(analytics?.errors?.critical ?? 0)} status={(analytics?.errors?.critical ?? 0) > 0 ? 'error' : 'success'} />
            <KpiCard label="Realtime health" value={`${analytics?.realtime?.latencyP95 ?? 0} ms p95`} hint={`reconnect ${formatNumber(analytics?.realtime?.reconnects ?? 0)}`} status={realtimeStatus} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 mt-2">
            <div className="rounded-2xl border-[2px] border-[#142a45]/15 bg-white p-4 space-y-2">
              <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ГОРЯЧИЕ ПРОБЛЕМЫ</p>
              {(analytics?.errors?.topEvents ?? []).length === 0 ? (
                <p className="text-sm text-[#142a45]/60">Критичных событий за период не найдено.</p>
              ) : (
                <div className="space-y-2">
                  {(analytics?.errors?.topEvents ?? []).map((row) => (
                    <div key={row.event} className="flex items-center justify-between rounded-xl border border-[#142a45]/10 px-3 py-2 text-sm">
                      <span className="font-semibold text-[#142a45]/80">{row.event}</span>
                      <StatusBadge label={String(row.count)} status={row.count > 5 ? 'error' : 'warning'} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border-[2px] border-[#142a45]/15 bg-white p-4 space-y-2">
              <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ПОСЛЕДНИЕ ERROR-ЛОГИ</p>
              {errorFeed.length === 0 ? (
                <p className="text-sm text-[#142a45]/60">Нет ошибок за выбранный период.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {errorFeed.map((item) => (
                    <div key={item.id} className="rounded-xl border border-[#b23324]/30 bg-[#fff3f0] p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge label={item.level} status="error" />
                        <span className="text-[11px] font-semibold text-[#142a45]/60">{formatIso(item.createdAt)}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#7b1d16]">{item.message}</p>
                      <p className="text-[11px] text-[#7b1d16]/80">{item.channel} · {item.eventName ?? 'event:unknown'} · {item.roomId ?? 'room:—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="На какие вопросы реагируют больше всего">
          <div className="grid gap-4 lg:grid-cols-3">
            <KpiCard label="Лайки за период" value={formatNumber(analytics?.questionReactions?.totalLikes ?? 0)} status="info" />
            <KpiCard label="Топ-вопрос" value={analytics?.questionReactions?.topQuestions?.length ? describeLikeQuestionId(analytics.questionReactions.topQuestions[0].questionId) : '—'} hint={analytics?.questionReactions?.topQuestions?.length ? `${analytics.questionReactions.topQuestions[0].likes} лайков` : undefined} status="neutral" />
            <KpiCard label="Доля топ-1" value={`${analytics?.questionReactions?.topQuestions?.length ? analytics.questionReactions.topQuestions[0].sharePct : 0}%`} status="warning" />
          </div>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-[#142a45]/60">
                  <th className="py-2">Вопрос</th>
                  <th className="py-2">Лайки</th>
                  <th className="py-2">Доля</th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.questionReactions?.topQuestions ?? []).map((row, idx) => (
                  <tr key={`${row.questionId}-${idx}`} className="border-t border-[#142a45]/10">
                    <td className="py-2 font-semibold text-[#142a45]">{describeLikeQuestionId(row.questionId)}</td>
                    <td className="py-2"><StatusBadge label={String(row.likes)} status={row.likes >= 10 ? 'success' : 'neutral'} /></td>
                    <td className="py-2 text-[#142a45]/80 font-semibold">{row.sharePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

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
                    <button
                      type="button"
                      onClick={() => void startRound3Rpc(room.id)}
                      className="px-4 py-2 rounded-2xl border-[2px] border-[#f1532f] text-xs font-black text-[#922415]"
                    >
                      Round 3 (RPC)
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
                  <div className="text-xs">
                    <p className="text-[10px] font-black tracking-[0.3em] text-[#142a45]/60">ЛАЙКИ</p>
                    {roomDetails.bestQuestion ? (
                      <div className="mt-2 flex items-center justify-between rounded-2xl border-[2px] border-[#142a45]/15 bg-[#fff6da] px-3 py-2">
                        <span>Вопрос #{roomDetails.bestQuestion.question_id}</span>
                        <span className="font-black">{roomDetails.bestQuestion.likes}</span>
                      </div>
                    ) : (
                      <p className="mt-2 text-[#142a45]/60">Нет лайков</p>
                    )}
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
          <div className="grid gap-4 lg:grid-cols-3">
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
            <div className="rounded-2xl border-[2px] border-[#142a45]/20 p-4">
              <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ТОП ЛАЙКОВ</p>
              {topLikedQuestions.length === 0 ? (
                <p className="text-xs text-[#142a45]/60 mt-3">Пока нет лайков</p>
              ) : (
                <div className="space-y-2 mt-3">
                  {topLikedQuestions.map((row, idx) => (
                    <div key={`${row.question_id}-${idx}`} className="flex items-center justify-between text-sm font-black">
                      <span>{idx + 1}. {describeLikeQuestionId(row.question_id)}</span>
                      <span>{row.likes}</span>
                    </div>
                  ))}
                </div>
              )}
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
