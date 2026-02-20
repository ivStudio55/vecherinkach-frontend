'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, KpiCard, MetricRow, SectionCard, StatusBadge } from '@/components/admin/AdminWidgets';
import type { SeriesPoint } from '@/components/admin/AdminWidgets';

/* ═══════════ Types ═══════════ */

type AnalyticsData = {
  range: { start: string; end: string };
  rooms: {
    total: number; completed: number; active: number; finishRate: number;
    statusDistribution: Record<string, number>;
    packDistribution: Record<string, number>;
    roundReached: Record<string, number>;
  };
  players: {
    total: number; uniqueNames: number; avgPlayersPerRoom: number; pointsTotal: number;
    topPlayers: Array<{ id: string; name: string; roomId: string; totalPoints: number }>;
  };
  retention: { started: number; round1: number; round2: number; round3: number; round4: number; round5: number; finished: number };
  engagement: {
    answersTotal: number; likesTotal: number; r1AnswerRate: number;
    r2CorrectRate: number; r4CorrectRate: number; r3VoteParticipation: number;
  };
  questionAnalytics: {
    r1Questions: Array<{ index: number; total: number; correct: number; correctRate: number }>;
    hardestR1: Array<{ index: number; total: number; correct: number; correctRate: number }>;
    easiestR1: Array<{ index: number; total: number; correct: number; correctRate: number }>;
    r4Stats: Array<{ puzzleId: number; total: number; correct: number; firstSolves: number; correctRate: number }>;
    r5Stats: Array<{ index: number; total: number; avgPoints: number; maxPoints: number }>;
    topLiked: Array<{ questionId: number; likes: number; round: number }>;
    likesByRound: Record<number, number>;
  };
  charts: {
    roomsByTime: SeriesPoint[]; playersByTime: SeriesPoint[];
    roundsStartedByTime: SeriesPoint[]; round2ByTime: SeriesPoint[];
  };
};

type RoomListItem = {
  id: string; code: string; status: string | null; is_active: boolean;
  created_at: string | null; pack_id: string | null;
  current_question_index: number | null; round2_item_index: number | null;
  playerCount: number; answerCount: number;
};

type RoomListResponse = { items: RoomListItem[]; total: number; page: number; pageSize: number; totalPages: number };

type RoomDetailsData = {
  room: Record<string, unknown>;
  players: Array<{ id: string; name: string; total_points: number; joined_at: string | null }>;
  stats: Record<string, number>;
  r1Questions: Array<{ index: number; total: number; correct: number; correctRate: number }>;
  r2Answers: Array<{ player_id: string; playerName: string; item_index: number; answer_is_fact: boolean; is_correct: boolean; points_earned: number }>;
  r3Answers: Array<{ id: string; player_id: string; playerName: string; question_index: number; text: string; voteCount: number }>;
  r4Summary: Array<{ player_id: string; playerName: string; puzzle_id: number; answer_text: string; is_correct: boolean; correct_rank: number | null; points_earned: number; elapsed_ms: number | null }>;
  r5Answers: Array<{ player_id: string; playerName: string; question_index: number; answer_value: number; points_earned: number }>;
  topLikes: Array<{ questionId: number; likes: number; round: number }>;
  likesByRound: Record<number, number>;
  recentLogs: Array<{ created_at: string; level: string; channel: string; message: string; event_name: string | null }>;
};

/* ═══════════ Helpers ═══════════ */

const fmt = (v?: number | null) => (v ?? 0).toLocaleString('ru-RU');
const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString('ru-RU') : '—');
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Ожидание', running: 'Раунд 1', 'round2-ready': 'R2 готов',
  'round2-running': 'Раунд 2', 'round3-running': 'Раунд 3',
  'round4-running': 'Раунд 4', 'round5-running': 'Раунд 5',
  'round5-explanation': 'R5 пояснение', 'final-results': 'Финал', finished: 'Завершена',
};

const statusVariant = (s: string | null): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  if (!s) return 'neutral';
  if (s === 'finished' || s === 'final-results') return 'success';
  if (s === 'waiting') return 'neutral';
  return 'info';
};

const correctRateVariant = (rate: number): 'success' | 'warning' | 'error' => {
  if (rate >= 65) return 'success';
  if (rate >= 40) return 'warning';
  return 'error';
};

const ROUND_COLORS: Record<number, string> = { 1: '#6366f1', 2: '#06b6d4', 3: '#10b981', 4: '#f59e0b', 5: '#ef4444' };

type Tab = 'overview' | 'rooms' | 'questions' | 'players';

/* ═══════════ Component ═══════════ */

export default function VecherinkachAdminPage() {
  const [tab, setTab] = useState<Tab>('overview');

  /* ── Date range ── */
  const today = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [packFilter, setPackFilter] = useState('');

  const range = useMemo(() => {
    const s = Date.parse(startDate);
    const e = Date.parse(endDate);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
    const end = new Date(e);
    end.setUTCDate(end.getUTCDate() + 1);
    return { startIso: new Date(s).toISOString(), endIso: end.toISOString() };
  }, [startDate, endDate]);

  const quickRange = useCallback((kind: 'today' | 'week' | 'month') => {
    const n = new Date();
    const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (kind === 'today') { setStartDate(today); setEndDate(today); return; }
    const d = new Date(n);
    if (kind === 'week') d.setDate(d.getDate() - 7);
    if (kind === 'month') d.setDate(d.getDate() - 30);
    setStartDate(f(d)); setEndDate(today);
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

  /* ── Room details ── */
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomDetails, setRoomDetails] = useState<RoomDetailsData | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'players' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'logs'>('players');

  const [actionMsg, setActionMsg] = useState<string | null>(null);

  /* ══ Fetchers ══ */

  const loadAnalytics = useCallback(async () => {
    if (!range) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    setActionMsg(null);
    try {
      const params = new URLSearchParams({ start: range.startIso, end: range.endIso });
      if (packFilter) params.set('pack_id', packFilter);
      const res = await fetch(`/api/admin/vecherinkach-analytics?${params}`, { cache: 'no-store', credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Ошибка аналитики');
      setAnalytics(data);
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [range, packFilter]);

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(roomsPage), limit: '20' });
      if (roomStatusFilter) params.set('status', roomStatusFilter);
      if (roomSearch) params.set('search', roomSearch);
      if (packFilter) params.set('pack_id', packFilter);
      const res = await fetch(`/api/admin/vecherinkach-rooms?${params}`, { cache: 'no-store', credentials: 'include' });
      const data = await res.json().catch(() => null);
      setRoomList(res.ok ? data : null);
    } finally {
      setRoomsLoading(false);
    }
  }, [roomsPage, roomStatusFilter, roomSearch, packFilter]);

  const loadRoomDetails = useCallback(async (id: string) => {
    setDetailsLoading(true);
    setDetailsTab('players');
    try {
      const res = await fetch(`/api/admin/vecherinkach-room-details?roomId=${encodeURIComponent(id)}`, { cache: 'no-store', credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Ошибка');
      setRoomDetails(data);
      setSelectedRoomId(id);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  /* ── Room actions ── */
  const patchRoom = useCallback(async (roomId: string, patch: Record<string, unknown>, msg: string) => {
    if (!confirm(msg)) return;
    setActionMsg(null);
    const res = await fetch('/api/admin/vecherinkach-rooms', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, patch }),
    });
    setActionMsg(res.ok ? `✔ Готово` : '✘ Ошибка');
    await loadRooms();
    if (selectedRoomId === roomId) await loadRoomDetails(roomId);
  }, [loadRooms, loadRoomDetails, selectedRoomId]);

  const deleteRoom = useCallback(async (roomId: string) => {
    if (!confirm('Удалить комнату со ВСЕМИ данными? Действие необратимо.')) return;
    setActionMsg(null);
    const res = await fetch('/api/admin/vecherinkach-rooms', {
      method: 'DELETE', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
    setActionMsg(res.ok ? '✔ Комната удалена' : '✘ Ошибка удаления');
    if (selectedRoomId === roomId) { setSelectedRoomId(null); setRoomDetails(null); }
    await loadRooms();
  }, [loadRooms, selectedRoomId]);

  /* ── Auto load ── */
  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);
  useEffect(() => { if (tab === 'rooms') loadRooms(); }, [tab, loadRooms]);

  const a = analytics;

  /* ════════ Retention funnel bar ════════ */
  const RetentionFunnel = () => {
    if (!a) return null;
    const steps = [
      { label: 'Комнат создано', value: a.retention.started },
      { label: 'Дошли до R1', value: a.retention.round1 },
      { label: 'Дошли до R2', value: a.retention.round2 },
      { label: 'Дошли до R3', value: a.retention.round3 },
      { label: 'Дошли до R4', value: a.retention.round4 },
      { label: 'Дошли до R5', value: a.retention.round5 },
      { label: 'Завершили', value: a.retention.finished },
    ];
    const max = steps[0]?.value || 1;
    return (
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs font-bold w-36 flex-shrink-0">{s.label}</span>
            <div className="flex-1 h-6 bg-[#142a45]/10 rounded-xl overflow-hidden">
              <div
                className="h-full rounded-xl transition-all"
                style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, background: `hsl(${220 - i * 18}, 70%, 50%)` }}
              />
            </div>
            <span className="text-sm font-black w-12 text-right">{s.value}</span>
            <span className="text-xs text-[#142a45]/50 w-12 text-right">{pct(s.value, max)}%</span>
          </div>
        ))}
      </div>
    );
  };

  /* ════════════════════════════════════ */
  /*                RENDER               */
  /* ════════════════════════════════════ */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="retro-panel bg-gradient-to-r from-[#142a45] to-[#1f6ac6] text-white px-6 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="retro-heading text-xs tracking-[0.5em] opacity-70">Аналитика</p>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight">🎉 Вечеринкач</h1>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={packFilter} onChange={e => setPackFilter(e.target.value)} className="px-3 py-2 rounded-xl border-2 border-white/40 bg-white/20 text-white font-bold text-sm">
              <option value="">Все паки</option>
              <option value="classic">Классический</option>
              <option value="03012026">Пак 16.01.2026</option>
            </select>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 rounded-xl border-2 border-white/40 bg-white/20 text-white font-bold text-sm" />
            <span className="text-white/70 font-bold">—</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 rounded-xl border-2 border-white/40 bg-white/20 text-white font-bold text-sm" />
            {(['today', 'week', 'month'] as const).map(k => (
              <button key={k} onClick={() => quickRange(k)} className="px-3 py-2 rounded-xl border-2 border-white/40 text-white font-bold text-xs hover:bg-white/20 transition">
                {k === 'today' ? 'Сегодня' : k === 'week' ? 'Неделя' : 'Месяц'}
              </button>
            ))}
            <button onClick={loadAnalytics} disabled={analyticsLoading} className="px-4 py-2 rounded-xl bg-white text-[#142a45] font-black text-sm hover:bg-white/90 transition disabled:opacity-50">
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
          ['players', '🏆 Игроки'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-3 rounded-2xl border-[3px] font-black tracking-wide text-sm transition ${tab === t ? 'border-[#1f6ac6] bg-[#1f6ac6] text-white' : 'border-[#142a45] bg-white text-[#142a45] hover:bg-[#142a45]/5'}`}>
            {label}
          </button>
        ))}
      </div>

      {actionMsg && <div className="px-4 py-2 rounded-xl bg-[#142a45] text-[#ffeccd] font-bold text-sm">{actionMsg}</div>}
      {analyticsError && <div className="px-4 py-2 rounded-xl bg-red-100 text-red-700 font-bold text-sm">{analyticsError}</div>}

      {/* ─────────── OVERVIEW ─────────── */}
      {tab === 'overview' && a && (
        <div className="space-y-6">
          {/* Top KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Комнат" value={fmt(a.rooms.total)} status="neutral" />
            <KpiCard label="Завершено" value={`${a.rooms.completed} (${a.rooms.finishRate}%)`} status={a.rooms.finishRate >= 50 ? 'success' : 'warning'} />
            <KpiCard label="Активные" value={fmt(a.rooms.active)} status={a.rooms.active > 0 ? 'info' : 'neutral'} />
            <KpiCard label="Игроков" value={fmt(a.players.total)} status="neutral" />
            <KpiCard label="Уникальных" value={fmt(a.players.uniqueNames)} status="neutral" />
            <KpiCard label="Ср. на комнату" value={a.players.avgPlayersPerRoom} status="neutral" />
          </div>

          {/* Engagement KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Всего ответов" value={fmt(a.engagement.answersTotal)} status="neutral" />
            <KpiCard label="Лайков" value={fmt(a.engagement.likesTotal)} status="info" />
            <KpiCard label="R2 угадал" value={`${a.engagement.r2CorrectRate}%`} status={a.engagement.r2CorrectRate >= 50 ? 'success' : 'warning'} />
            <KpiCard label="R4 верно" value={`${a.engagement.r4CorrectRate}%`} status={a.engagement.r4CorrectRate >= 50 ? 'success' : 'warning'} />
            <KpiCard label="R3 голоса" value={`${a.engagement.r3VoteParticipation}%`} status={a.engagement.r3VoteParticipation >= 60 ? 'success' : 'warning'} />
            <KpiCard label="Очков всего" value={fmt(a.players.pointsTotal)} status="neutral" />
          </div>

          {/* Retention funnel */}
          <SectionCard title="ВОРОНКА ПРОХОЖДЕНИЯ РАУНДОВ">
            <RetentionFunnel />
          </SectionCard>

          {/* Status & pack & round distribution */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SectionCard title="СТАТУСЫ КОМНАТ">
              {Object.entries(a.rooms.statusDistribution).sort(([, a], [, b]) => b - a).map(([st, cnt]) => (
                <MetricRow key={st} label={STATUS_LABELS[st] ?? st} value={cnt} status={statusVariant(st)} />
              ))}
            </SectionCard>
            <SectionCard title="ДОШЛИ ДО РАУНДА">
              {Object.entries(a.rooms.roundReached).sort(([, a], [, b]) => b - a).map(([label, cnt]) => (
                <MetricRow key={label} label={label} value={cnt} />
              ))}
            </SectionCard>
            <SectionCard title="ПАКИ">
              {Object.entries(a.rooms.packDistribution).sort(([, a], [, b]) => b - a).map(([pk, cnt]) => (
                <MetricRow key={pk} label={pk} value={cnt} />
              ))}
              <div className="pt-2 border-t border-[#142a45]/10">
                <p className="text-xs font-bold opacity-50">Лайки по раундам</p>
                {Object.entries(a.questionAnalytics.likesByRound).sort(([a], [b]) => Number(a) - Number(b)).map(([r, cnt]) => (
                  <MetricRow key={r} label={`Раунд ${r}`} value={cnt} />
                ))}
              </div>
            </SectionCard>
          </div>

          {/* Time charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="КОМНАТЫ ВО ВРЕМЕНИ">
              <BarChart title="" series={a.charts.roomsByTime} />
            </SectionCard>
            <SectionCard title="ИГРОКИ ВО ВРЕМЕНИ">
              <BarChart title="" series={a.charts.playersByTime} />
            </SectionCard>
            <SectionCard title="РАУНДЫ СТАРТОВАЛИ ВО ВРЕМЕНИ">
              <BarChart title="" series={a.charts.roundsStartedByTime} />
            </SectionCard>
            <SectionCard title="РАУНД 2 СТАРТОВАЛ">
              <BarChart title="" series={a.charts.round2ByTime} />
            </SectionCard>
          </div>
        </div>
      )}

      {/* ─────────── ROOMS ─────────── */}
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
              <div className="space-y-1">
                <label className="text-xs font-bold opacity-60">Пак</label>
                <select value={packFilter} onChange={e => { setPackFilter(e.target.value); setRoomsPage(1); }} className="px-3 py-2 rounded-xl border-2 border-[#142a45]/30 font-bold text-sm">
                  <option value="">Все</option>
                  <option value="classic">Классический</option>
                  <option value="03012026">Пак 16.01.2026</option>
                </select>
              </div>
              <button onClick={loadRooms} disabled={roomsLoading} className="px-4 py-2 rounded-xl bg-[#142a45] text-[#ffeccd] font-black text-sm hover:bg-[#142a45]/80 transition disabled:opacity-50">
                {roomsLoading ? '...' : 'Поиск'}
              </button>
            </div>
          </SectionCard>

          {/* Room list */}
          {roomList && (
            <SectionCard title={`КОМНАТЫ (${roomList.total})`} actions={<span className="text-xs font-bold opacity-60">Стр. {roomList.page} / {roomList.totalPages}</span>}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                      <th className="py-2 px-2">Код</th>
                      <th className="py-2 px-2">Статус</th>
                      <th className="py-2 px-2">Пак</th>
                      <th className="py-2 px-2">Игроки</th>
                      <th className="py-2 px-2">Ответы</th>
                      <th className="py-2 px-2">R1 вопрос</th>
                      <th className="py-2 px-2">Создана</th>
                      <th className="py-2 px-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomList.items.map(r => (
                      <tr key={r.id} className="border-b border-[#142a45]/10 hover:bg-[#142a45]/5 cursor-pointer transition" onClick={() => loadRoomDetails(r.id)}>
                        <td className="py-2 px-2 font-black">{r.code}</td>
                        <td className="py-2 px-2"><StatusBadge label={STATUS_LABELS[r.status ?? ''] ?? r.status ?? '—'} status={statusVariant(r.status)} /></td>
                        <td className="py-2 px-2 text-xs font-semibold">{r.pack_id ?? 'classic'}</td>
                        <td className="py-2 px-2">{r.playerCount}</td>
                        <td className="py-2 px-2">{r.answerCount}</td>
                        <td className="py-2 px-2">{r.current_question_index ?? 0}</td>
                        <td className="py-2 px-2 text-xs">{fmtDate(r.created_at)}</td>
                        <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <button onClick={() => patchRoom(r.id, { status: 'finished', is_active: false }, `Завершить комнату ${r.code}?`)} title="Завершить" className="px-2 py-1 rounded-lg bg-yellow-100 text-yellow-800 text-xs font-bold hover:bg-yellow-200">⏹</button>
                            <button onClick={() => patchRoom(r.id, { status: 'waiting', current_question_index: 0, is_active: true }, `Перезапустить комнату ${r.code}?`)} title="Перезапустить" className="px-2 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-bold hover:bg-blue-200">🔄</button>
                            <button onClick={() => deleteRoom(r.id)} title="Удалить" className="px-2 py-1 rounded-lg bg-red-100 text-red-800 text-xs font-bold hover:bg-red-200">🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
          {selectedRoomId && (
            <SectionCard title={`ДЕТАЛИ КОМНАТЫ ${(roomDetails?.room as { code?: string } | undefined)?.code ?? ''}`} actions={
              <button onClick={() => { setSelectedRoomId(null); setRoomDetails(null); }} className="px-3 py-1 rounded-lg border-2 border-[#142a45]/30 font-bold text-xs">✕</button>
            }>
              {detailsLoading ? <p className="text-center font-bold opacity-50 py-8">Загрузка...</p> : roomDetails && (
                <div className="space-y-4">
                  {/* Stats row */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <KpiCard label="Игроков" value={roomDetails.stats.playerCount} status="neutral" />
                    <KpiCard label="R1 ответы" value={roomDetails.stats.r1Answers} status="neutral" />
                    <KpiCard label="R2 ответы" value={roomDetails.stats.r2Answers} status="neutral" />
                    <KpiCard label="R3 ответы" value={roomDetails.stats.r3Answers} status="neutral" />
                    <KpiCard label="R4 ответы" value={roomDetails.stats.r4Answers} status="neutral" />
                    <KpiCard label="Лайков" value={roomDetails.stats.totalLikes} status="info" />
                  </div>

                  {/* Likes by round */}
                  {Object.keys(roomDetails.likesByRound).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(roomDetails.likesByRound).sort(([a], [b]) => Number(a) - Number(b)).map(([r, cnt]) => (
                        <StatusBadge key={r} label={`R${r}: ${cnt} ❤`} status="info" />
                      ))}
                    </div>
                  )}

                  {/* Detail tabs */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(['players', 'r1', 'r2', 'r3', 'r4', 'r5', 'logs'] as const).map(t => (
                      <button key={t} onClick={() => setDetailsTab(t)} className={`px-3 py-1 rounded-xl border-[2px] font-bold text-xs transition ${detailsTab === t ? 'border-[#1f6ac6] bg-[#1f6ac6] text-white' : 'border-[#142a45]/30 hover:bg-[#142a45]/5'}`}>
                        {t === 'players' ? '👤 Игроки' : t === 'r1' ? 'R1' : t === 'r2' ? 'R2' : t === 'r3' ? 'R3 МозгоШтурм' : t === 'r4' ? 'R4 Дэшифр.' : t === 'r5' ? 'R5 Цифры' : '📋 Логи'}
                      </button>
                    ))}
                  </div>

                  {/* Players */}
                  {detailsTab === 'players' && (
                    <table className="w-full text-sm">
                      <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                        <th className="py-1 px-2">#</th><th className="py-1 px-2">Имя</th>
                        <th className="py-1 px-2">Очки</th><th className="py-1 px-2">Вход</th>
                      </tr></thead>
                      <tbody>{roomDetails.players.map((p, i) => (
                        <tr key={p.id} className={`border-b border-[#142a45]/10 ${i < 3 ? 'bg-yellow-50' : ''}`}>
                          <td className="py-1 px-2 font-black">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                          <td className="py-1 px-2 font-bold">{p.name}</td>
                          <td className="py-1 px-2 font-black text-[#1f6ac6]">{fmt(p.total_points)}</td>
                          <td className="py-1 px-2 text-xs">{fmtDate(p.joined_at)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}

                  {/* R1 */}
                  {detailsTab === 'r1' && (
                    <div>
                      <p className="text-xs font-bold opacity-60 mb-2">Вопрос → кол-во ответов → % правильных</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                            <th className="py-1 px-2">Вопрос #</th><th className="py-1 px-2">Ответов</th>
                            <th className="py-1 px-2">Верных</th><th className="py-1 px-2">% верных</th>
                          </tr></thead>
                          <tbody>{roomDetails.r1Questions.map(q => (
                            <tr key={q.index} className="border-b border-[#142a45]/10">
                              <td className="py-1 px-2">{q.index + 1}</td>
                              <td className="py-1 px-2">{q.total}</td>
                              <td className="py-1 px-2">{q.correct}</td>
                              <td className="py-1 px-2"><StatusBadge label={`${q.correctRate}%`} status={correctRateVariant(q.correctRate)} /></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* R2 */}
                  {detailsTab === 'r2' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                          <th className="py-1 px-2">Игрок</th><th className="py-1 px-2">Факт #</th>
                          <th className="py-1 px-2">Выбрал</th><th className="py-1 px-2">Верно</th><th className="py-1 px-2">Очки</th>
                        </tr></thead>
                        <tbody>{roomDetails.r2Answers.map((a, i) => (
                          <tr key={i} className="border-b border-[#142a45]/10">
                            <td className="py-1 px-2 font-bold">{a.playerName}</td>
                            <td className="py-1 px-2">{a.item_index + 1}</td>
                            <td className="py-1 px-2">{a.answer_is_fact ? 'Факт' : 'Вымысел'}</td>
                            <td className="py-1 px-2"><StatusBadge label={a.is_correct ? '✔' : '✘'} status={a.is_correct ? 'success' : 'error'} /></td>
                            <td className="py-1 px-2 font-black">{a.points_earned}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}

                  {/* R3 */}
                  {detailsTab === 'r3' && (
                    <div className="space-y-3">
                      {roomDetails.r3Answers.sort((a, b) => b.voteCount - a.voteCount).map((a, i) => (
                        <div key={i} className="flex items-start gap-3 border-b border-[#142a45]/10 pb-2">
                          <span className="font-black text-[#142a45]/40 w-6">{i + 1}</span>
                          <div className="flex-1">
                            <p className="text-xs font-bold opacity-50">Вопрос #{a.question_index + 1} — {a.playerName}</p>
                            <p className="font-semibold">{a.text}</p>
                          </div>
                          <span className="font-black text-[#1f6ac6] flex-shrink-0">❤ {a.voteCount}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* R4 */}
                  {detailsTab === 'r4' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                          <th className="py-1 px-2">Игрок</th><th className="py-1 px-2">Загадка</th>
                          <th className="py-1 px-2">Ответ</th><th className="py-1 px-2">Верно</th>
                          <th className="py-1 px-2">Место</th><th className="py-1 px-2">Очки</th>
                          <th className="py-1 px-2">Время</th>
                        </tr></thead>
                        <tbody>{roomDetails.r4Summary.map((a, i) => (
                          <tr key={i} className="border-b border-[#142a45]/10">
                            <td className="py-1 px-2 font-bold">{a.playerName}</td>
                            <td className="py-1 px-2">#{a.puzzle_id}</td>
                            <td className="py-1 px-2 max-w-[120px] truncate" title={a.answer_text}>{a.answer_text}</td>
                            <td className="py-1 px-2"><StatusBadge label={a.is_correct ? '✔' : '✘'} status={a.is_correct ? 'success' : 'error'} /></td>
                            <td className="py-1 px-2">{a.correct_rank ?? '—'}</td>
                            <td className="py-1 px-2 font-black">{a.points_earned}</td>
                            <td className="py-1 px-2 text-xs">{a.elapsed_ms ? `${(a.elapsed_ms / 1000).toFixed(1)}с` : '—'}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}

                  {/* R5 */}
                  {detailsTab === 'r5' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                          <th className="py-1 px-2">Игрок</th><th className="py-1 px-2">Вопрос</th>
                          <th className="py-1 px-2">Ответ</th><th className="py-1 px-2">Очки</th>
                        </tr></thead>
                        <tbody>{roomDetails.r5Answers.map((a, i) => (
                          <tr key={i} className="border-b border-[#142a45]/10">
                            <td className="py-1 px-2 font-bold">{a.playerName}</td>
                            <td className="py-1 px-2">#{a.question_index + 1}</td>
                            <td className="py-1 px-2 font-mono">{a.answer_value.toLocaleString('ru-RU')}</td>
                            <td className="py-1 px-2 font-black text-[#1f6ac6]">{a.points_earned}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}

                  {/* Logs */}
                  {detailsTab === 'logs' && (
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {roomDetails.recentLogs.map((l, i) => (
                        <div key={i} className={`text-xs px-3 py-1 rounded-lg font-mono flex gap-2 ${l.level === 'error' ? 'bg-red-50 text-red-800' : l.level === 'warn' ? 'bg-yellow-50 text-yellow-800' : 'bg-[#142a45]/5'}`}>
                          <span className="opacity-50">{new Date(l.created_at).toLocaleTimeString('ru-RU')}</span>
                          <span className="font-black w-10 flex-shrink-0">{l.level}</span>
                          <span className="opacity-60">{l.channel}</span>
                          <span>{l.event_name ? `[${l.event_name}] ` : ''}{l.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      )}

      {/* ─────────── QUESTIONS ─────────── */}
      {tab === 'questions' && a && (
        <div className="space-y-6">
          {/* Top liked */}
          {a.questionAnalytics.topLiked.length > 0 && (
            <SectionCard title="ТОП LIKED ВОПРОСОВ">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                    <th className="py-2 px-2">#</th><th className="py-2 px-2">Раунд</th>
                    <th className="py-2 px-2">ID вопроса</th><th className="py-2 px-2">Лайков</th>
                  </tr></thead>
                  <tbody>{a.questionAnalytics.topLiked.map((q, i) => (
                    <tr key={i} className="border-b border-[#142a45]/10">
                      <td className="py-2 px-2 font-black opacity-50">{i + 1}</td>
                      <td className="py-2 px-2">
                        <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-black text-white" style={{ background: ROUND_COLORS[q.round] ?? '#666' }}>
                          Раунд {q.round}
                        </span>
                      </td>
                      <td className="py-2 px-2 font-mono">{q.questionId}</td>
                      <td className="py-2 px-2 font-black text-[#ef4444]">❤ {q.likes}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Likes by round chart */}
          {Object.keys(a.questionAnalytics.likesByRound).length > 0 && (
            <SectionCard title="ЛАЙКИ ПО РАУНДАМ">
              <BarChart title="" series={Object.entries(a.questionAnalytics.likesByRound).sort(([a], [b]) => Number(a) - Number(b)).map(([r, cnt]) => ({ label: `R${r}`, value: cnt }))} />
            </SectionCard>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Hardest R1 questions */}
            {a.questionAnalytics.hardestR1.length > 0 && (
              <SectionCard title="СЛОЖНЕЙШИЕ ВОПРОСЫ R1 (меньше всего правильных)">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                      <th className="py-1 px-2">Вопрос #</th><th className="py-1 px-2">Всего</th><th className="py-1 px-2">Верных</th><th className="py-1 px-2">% верных</th>
                    </tr></thead>
                    <tbody>{a.questionAnalytics.hardestR1.map(q => (
                      <tr key={q.index} className="border-b border-[#142a45]/10">
                        <td className="py-1 px-2">{q.index + 1}</td>
                        <td className="py-1 px-2">{q.total}</td>
                        <td className="py-1 px-2">{q.correct}</td>
                        <td className="py-1 px-2"><StatusBadge label={`${q.correctRate}%`} status={correctRateVariant(q.correctRate)} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* Easiest R1 questions */}
            {a.questionAnalytics.easiestR1.length > 0 && (
              <SectionCard title="ЛЁГКИЕ ВОПРОСЫ R1 (больше всего правильных)">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                      <th className="py-1 px-2">Вопрос #</th><th className="py-1 px-2">Всего</th><th className="py-1 px-2">Верных</th><th className="py-1 px-2">% верных</th>
                    </tr></thead>
                    <tbody>{a.questionAnalytics.easiestR1.map(q => (
                      <tr key={q.index} className="border-b border-[#142a45]/10">
                        <td className="py-1 px-2">{q.index + 1}</td>
                        <td className="py-1 px-2">{q.total}</td>
                        <td className="py-1 px-2">{q.correct}</td>
                        <td className="py-1 px-2"><StatusBadge label={`${q.correctRate}%`} status={correctRateVariant(q.correctRate)} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </SectionCard>
            )}
          </div>

          {/* R4 stats */}
          {a.questionAnalytics.r4Stats.length > 0 && (
            <SectionCard title="R4 ДЭШИФРОВЩИК — статистика по загадкам">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                    <th className="py-2 px-2">Загадка</th><th className="py-2 px-2">Попыток</th>
                    <th className="py-2 px-2">Верных</th><th className="py-2 px-2">% верных</th><th className="py-2 px-2">1-е решения</th>
                  </tr></thead>
                  <tbody>{a.questionAnalytics.r4Stats.map(q => (
                    <tr key={q.puzzleId} className="border-b border-[#142a45]/10">
                      <td className="py-2 px-2 font-bold">#{q.puzzleId}</td>
                      <td className="py-2 px-2">{q.total}</td>
                      <td className="py-2 px-2">{q.correct}</td>
                      <td className="py-2 px-2"><StatusBadge label={`${q.correctRate}%`} status={correctRateVariant(q.correctRate)} /></td>
                      <td className="py-2 px-2">{q.firstSolves}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* R5 stats */}
          {a.questionAnalytics.r5Stats.length > 0 && (
            <SectionCard title="R5 ЦИФРОВАЯ ИНТУИЦИЯ — точность угадывания">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                    <th className="py-2 px-2">Вопрос</th><th className="py-2 px-2">Ответов</th>
                    <th className="py-2 px-2">Ср. очки</th><th className="py-2 px-2">Макс. очки</th>
                  </tr></thead>
                  <tbody>{a.questionAnalytics.r5Stats.map(q => (
                    <tr key={q.index} className="border-b border-[#142a45]/10">
                      <td className="py-2 px-2">#{q.index + 1}</td>
                      <td className="py-2 px-2">{q.total}</td>
                      <td className="py-2 px-2 font-black">{q.avgPoints}</td>
                      <td className="py-2 px-2 font-black text-[#1f6ac6]">{q.maxPoints}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ─────────── PLAYERS ─────────── */}
      {tab === 'players' && a && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Всего игроков" value={fmt(a.players.total)} status="neutral" />
            <KpiCard label="Уникальных имён" value={fmt(a.players.uniqueNames)} status="neutral" />
            <KpiCard label="Ср. на комнату" value={a.players.avgPlayersPerRoom} status="neutral" />
            <KpiCard label="Очков суммарно" value={fmt(a.players.pointsTotal)} status="info" />
          </div>

          {a.players.topPlayers.length > 0 && (
            <SectionCard title="ТАБЛИЦА ЛИДЕРОВ (за период)">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left font-black text-[#142a45]/60 border-b-2 border-[#142a45]/20">
                    <th className="py-2 px-2">#</th><th className="py-2 px-2">Имя</th>
                    <th className="py-2 px-2">Очки</th><th className="py-2 px-2">Комната</th>
                  </tr></thead>
                  <tbody>{a.players.topPlayers.map((p, i) => (
                    <tr key={p.id} className={`border-b border-[#142a45]/10 ${i < 3 ? 'bg-yellow-50' : ''}`}>
                      <td className="py-2 px-2 font-black text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                      <td className="py-2 px-2 font-bold">{p.name}</td>
                      <td className="py-2 px-2 font-black text-[#1f6ac6]">{fmt(p.totalPoints)}</td>
                      <td className="py-2 px-2 text-xs font-mono opacity-60">{p.roomId.slice(0, 8)}…</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {!analyticsLoading && !a && !analyticsError && (
        <SectionCard title="НЕТ ДАННЫХ">
          <p className="text-center font-bold opacity-50 py-8">Нажмите «Обновить» для загрузки аналитики</p>
        </SectionCard>
      )}
    </div>
  );
}
