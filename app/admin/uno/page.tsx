'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, KpiCard, MetricRow, SectionCard, StatusBadge, type SeriesPoint } from '@/components/admin/AdminWidgets';

type UnoRoomRow = {
  id: string;
  code: string;
  mode: string;
  status: string;
  host_id: string | null;
  winner_id: string | null;
  verb_count: number;
  state_version: number;
  player_count: number;
  created_at: string | null;
  updated_at: string | null;
};

type UnoAnalyticsResponse = {
  range?: { startIso?: string; endIso?: string };
  rooms?: {
    totalAll?: number;
    totalInRange?: number;
    allByStatus?: { lobby?: number; playing?: number; finished?: number };
    rangeByStatus?: { lobby?: number; playing?: number; finished?: number };
    byMode?: Record<string, number>;
    startedInRange?: number;
    finishedInRange?: number;
    finishRateFromCreated?: number;
    avgFinishedMinutes?: number;
  };
  players?: {
    joinsInRange?: number;
    uniquePlayersInRange?: number;
    avgPlayersPerRoom?: number;
    returningPlayers?: number;
    returningRate?: number;
    consecutivePlayers?: number;
    consecutiveRate?: number;
  };
  activity?: {
    playCardEvents?: number;
    drawCardEvents?: number;
    cardKinds?: Record<string, number>;
    topVerbReactions?: Array<{ label: string; count: number }>;
    avgTurnsPerRoom?: number;
    avgTurnsPerPlayer?: number;
  };
  stability?: {
    total?: number;
    critical?: number;
    warnings?: number;
    recent?: Array<{
      id: string;
      createdAt: string;
      level: string;
      channel: string;
      message: string;
      eventName: string | null;
      roomId: string | null;
    }>;
    topByEvent?: Array<{ event: string; count: number }>;
  };
  charts?: {
    roomsByTime?: SeriesPoint[];
    joinsByTime?: SeriesPoint[];
    eventsByTime?: SeriesPoint[];
  };
};

const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleString('ru-RU') : '—');

const statusColors: Record<string, string> = {
  lobby: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  playing: 'bg-green-500/20 text-green-300 border-green-500/40',
  finished: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
};

const modeLabels: Record<string, string> = {
  classic: 'Классический',
  'irregular-verbs': 'Все формы',
  'verb-match': 'Угадай глагол',
};

export default function AdminUnoPage() {
  const [rooms, setRooms] = useState<UnoRoomRow[]>([]);
  const [analytics, setAnalytics] = useState<UnoAnalyticsResponse | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterMode, setFilterMode] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 30;

  const today = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const sevenDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [startDate, setStartDate] = useState(sevenDaysAgo);
  const [endDate, setEndDate] = useState(today);

  const range = useMemo(() => {
    const startMs = Date.parse(startDate);
    const endMs = Date.parse(endDate);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    const start = new Date(startMs);
    const end = new Date(endMs);
    end.setUTCDate(end.getUTCDate() + 1);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }, [endDate, startDate]);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (filterStatus) params.set('status', filterStatus);
      if (filterMode) params.set('mode', filterMode);

      const res = await fetch(`/api/admin/uno-rooms?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRooms(data.rooms || []);
      setTotal(data.total || 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterMode]);

  const fetchAnalytics = useCallback(async () => {
    if (!range) {
      setError('Некорректный диапазон дат');
      return;
    }
    const params = new URLSearchParams({
      start: range.startIso,
      end: range.endIso,
      ...(filterStatus ? { status: filterStatus } : {}),
      ...(filterMode ? { mode: filterMode } : {}),
    });
    const res = await fetch(`/api/admin/uno-analytics?${params.toString()}`, { cache: 'no-store' });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload?.error ?? `HTTP ${res.status}`);
    }
    setAnalytics(payload as UnoAnalyticsResponse);
  }, [filterMode, filterStatus, range]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchRooms(), fetchAnalytics()]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Ошибка загрузки UNO аналитики';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fetchAnalytics, fetchRooms]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleClose = async (id: string) => {
    if (!confirm('Завершить эту комнату?')) return;
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/uno-rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'finished' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionMsg('Комната завершена');
      void refreshAll();
    } catch (e: unknown) {
      setActionMsg(`Ошибка: ${e instanceof Error ? e.message : 'неизвестная ошибка'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить комнату и все данные? Это действие нельзя отменить.')) return;
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/uno-rooms?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionMsg('Комната удалена');
      void refreshAll();
    } catch (e: unknown) {
      setActionMsg(`Ошибка: ${e instanceof Error ? e.message : 'неизвестная ошибка'}`);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const activeCount = rooms.filter(r => r.status === 'playing').length;
  const lobbyCount = rooms.filter(r => r.status === 'lobby').length;
  const totalPlayers = rooms.reduce((s, r) => s + r.player_count, 0);

  const stabilityStatus = useMemo(() => {
    const critical = analytics?.stability?.critical ?? 0;
    const warnings = analytics?.stability?.warnings ?? 0;
    if (critical > 0) return 'error' as const;
    if (warnings > 0) return 'warning' as const;
    return 'success' as const;
  }, [analytics?.stability?.critical, analytics?.stability?.warnings]);

  const modeSeries = useMemo(() => {
    const byMode = analytics?.rooms?.byMode ?? {};
    return [
      { label: 'Classic', value: Number(byMode.classic ?? 0) },
      { label: 'Irreg', value: Number(byMode['irregular-verbs'] ?? 0) },
      { label: 'Match', value: Number(byMode['verb-match'] ?? 0) },
    ];
  }, [analytics?.rooms?.byMode]);

  const cardKindsSeries = useMemo(() => {
    const kinds = analytics?.activity?.cardKinds ?? {};
    return [
      { label: 'Number', value: Number(kinds.number ?? 0) },
      { label: 'Verb', value: Number(kinds.verb ?? 0) + Number(kinds['verb-match'] ?? 0) },
      { label: 'Skip', value: Number(kinds.skip ?? 0) },
      { label: 'Reverse', value: Number(kinds.reverse ?? 0) },
      { label: 'Wild', value: Number(kinds.wild ?? 0) + Number(kinds.wild4 ?? 0) },
    ];
  }, [analytics?.activity?.cardKinds]);

  const applyFilters = async () => {
    setPage(1);
    await refreshAll();
  };

  return (
    <div className="space-y-6 text-[#142a45]">
      {error && (
        <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
          {error}
        </div>
      )}
      {actionMsg && (
        <div className="rounded-2xl border-[3px] border-[#2f7a3b] bg-[#dff7e3] px-4 py-3 text-sm font-semibold text-[#1b4d23]">
          {actionMsg}
        </div>
      )}
      {loading && (
        <div className="rounded-2xl border-[3px] border-[#1f6ac6] bg-[#e9f0ff] px-4 py-3 text-sm font-semibold text-[#1f3d6b]">
          Обновляем UNO аналитический центр…
        </div>
      )}

      <SectionCard
        title="Фильтры UNO аналитики"
        actions={
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="px-4 py-2 rounded-2xl border-[2px] border-[#142a45] text-xs font-black"
          >
            Обновить
          </button>
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
            <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">Статус</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
            >
              <option value="">Все статусы</option>
              <option value="lobby">Лобби</option>
              <option value="playing">Играют</option>
              <option value="finished">Завершены</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">Режим</label>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-semibold"
            >
              <option value="">Все режимы</option>
              <option value="classic">Классический</option>
              <option value="irregular-verbs">Все формы</option>
              <option value="verb-match">Угадай глагол</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => void applyFilters()}
            className="px-5 py-3 rounded-2xl border-[3px] border-[#142a45] text-[#142a45] font-black tracking-[0.2em] hover:bg-[#142a45]/5 transition"
          >
            Применить
          </button>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-5">
        <KpiCard label="Комнат (все)" value={analytics?.rooms?.totalAll ?? total} status="neutral" />
        <KpiCard label="Комнат за период" value={analytics?.rooms?.totalInRange ?? 0} status="info" />
        <KpiCard label="Игроков уникальных" value={analytics?.players?.uniquePlayersInRange ?? 0} status="success" />
        <KpiCard label="Играют подряд" value={`${analytics?.players?.consecutiveRate ?? 0}%`} hint={`${analytics?.players?.consecutivePlayers ?? 0} игроков`} status={(analytics?.players?.consecutiveRate ?? 0) >= 20 ? 'success' : 'warning'} />
        <KpiCard label="Возвращаются" value={`${analytics?.players?.returningRate ?? 0}%`} hint={`${analytics?.players?.returningPlayers ?? 0} игроков`} status={(analytics?.players?.returningRate ?? 0) >= 25 ? 'success' : 'warning'} />
      </div>

      <SectionCard title="Продуктовая аналитика UNO">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border-[2px] border-[#142a45]/15 bg-[#fffaf0] p-4 space-y-2">
            <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ВОРОНКА ИГРЫ</p>
            <MetricRow label="Создано комнат" value={analytics?.rooms?.totalInRange ?? 0} />
            <MetricRow label="Стартовали" value={analytics?.rooms?.startedInRange ?? 0} />
            <MetricRow label="Завершены" value={analytics?.rooms?.finishedInRange ?? 0} />
            <MetricRow label="Finish Rate" value={`${analytics?.rooms?.finishRateFromCreated ?? 0}%`} status={(analytics?.rooms?.finishRateFromCreated ?? 0) >= 45 ? 'success' : 'warning'} />
          </div>
          <div className="rounded-2xl border-[2px] border-[#142a45]/15 bg-[#fffaf0] p-4 space-y-2">
            <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ВОВЛЕЧЁННОСТЬ</p>
            <MetricRow label="Подключений игроков" value={analytics?.players?.joinsInRange ?? 0} />
            <MetricRow label="Ср. игроков/комнату" value={analytics?.players?.avgPlayersPerRoom ?? 0} />
            <MetricRow label="Ср. длительность" value={`${analytics?.rooms?.avgFinishedMinutes ?? 0} мин`} />
            <MetricRow label="Ходов на игрока" value={analytics?.activity?.avgTurnsPerPlayer ?? 0} />
          </div>
          <div className="rounded-2xl border-[2px] border-[#142a45]/15 bg-[#fffaf0] p-4 space-y-2">
            <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">АКТИВНОСТЬ КАРТ</p>
            <MetricRow label="Сыграно карт" value={analytics?.activity?.playCardEvents ?? 0} />
            <MetricRow label="Доборов" value={analytics?.activity?.drawCardEvents ?? 0} />
            <MetricRow label="Ходов на комнату" value={analytics?.activity?.avgTurnsPerRoom ?? 0} />
            <MetricRow label="Режимов (classic/verbs/match)" value={`${modeSeries[0].value}/${modeSeries[1].value}/${modeSeries[2].value}`} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Графики UNO">
        <div className="grid gap-6 lg:grid-cols-2">
          <BarChart title="Комнаты по времени" series={analytics?.charts?.roomsByTime ?? []} />
          <BarChart title="Подключения игроков" series={analytics?.charts?.joinsByTime ?? []} />
          <BarChart title="События в игре" series={analytics?.charts?.eventsByTime ?? []} />
          <BarChart title="Типы карт" series={cardKindsSeries} />
        </div>
      </SectionCard>

      <SectionCard title="Ошибки и стабильность UNO (отдельно)">
        <div className="grid gap-4 lg:grid-cols-3">
          <KpiCard label="Инциденты" value={analytics?.stability?.total ?? 0} status={(analytics?.stability?.total ?? 0) > 0 ? 'warning' : 'success'} />
          <KpiCard label="Критичные" value={analytics?.stability?.critical ?? 0} status={stabilityStatus} />
          <KpiCard label="Предупреждения" value={analytics?.stability?.warnings ?? 0} status={(analytics?.stability?.warnings ?? 0) > 0 ? 'warning' : 'success'} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2 mt-2">
          <div className="rounded-2xl border-[2px] border-[#142a45]/15 bg-white p-4 space-y-2">
            <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ТОП ИНЦИДЕНТОВ</p>
            {(analytics?.stability?.topByEvent ?? []).length === 0 ? (
              <p className="text-sm text-[#142a45]/60">Инциденты не найдены.</p>
            ) : (
              <div className="space-y-2">
                {(analytics?.stability?.topByEvent ?? []).map((row) => (
                  <div key={row.event} className="flex items-center justify-between rounded-xl border border-[#142a45]/10 px-3 py-2 text-sm">
                    <span className="font-semibold text-[#142a45]/80">{row.event}</span>
                    <StatusBadge label={String(row.count)} status={row.count > 5 ? 'error' : 'warning'} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border-[2px] border-[#142a45]/15 bg-white p-4 space-y-2">
            <p className="text-xs font-black tracking-[0.3em] text-[#142a45]/60">ПОСЛЕДНИЕ ОШИБКИ</p>
            {(analytics?.stability?.recent ?? []).length === 0 ? (
              <p className="text-sm text-[#142a45]/60">Логи ошибок отсутствуют за период.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {(analytics?.stability?.recent ?? []).map((item) => (
                  <div key={item.id} className="rounded-xl border border-[#b23324]/30 bg-[#fff3f0] p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge label={item.level} status={item.level === 'error' ? 'error' : 'warning'} />
                      <span className="text-[11px] font-semibold text-[#142a45]/60">{formatDate(item.createdAt)}</span>
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

      <SectionCard title="На что реагируют в UNO чаще всего">
        {(analytics?.activity?.topVerbReactions ?? []).length === 0 ? (
          <p className="text-sm text-[#142a45]/60">Пока нет данных по карточным реакциям в словарных режимах.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-[#142a45]/60">
                  <th className="py-2">Слово/карта</th>
                  <th className="py-2">Реакций</th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.activity?.topVerbReactions ?? []).map((row, idx) => (
                  <tr key={`${row.label}-${idx}`} className="border-t border-[#142a45]/10">
                    <td className="py-2 font-semibold text-[#142a45]">{row.label}</td>
                    <td className="py-2"><StatusBadge label={String(row.count)} status={row.count >= 8 ? 'success' : 'neutral'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Комнаты UNO">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Всего комнат (список)', value: total },
            { label: 'Активных (страница)', value: activeCount },
            { label: 'В лобби (страница)', value: lobbyCount },
            { label: 'Игроков (страница)', value: totalPlayers },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border-[2px] border-[#142a45]/15 bg-[#fffaf0] px-4 py-3">
              <p className="text-xs text-[#142a45]/60 uppercase tracking-widest">{s.label}</p>
              <p className="text-2xl font-black">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[#142a45]/10 text-left text-xs uppercase tracking-widest text-[#142a45]/60">
              <th className="px-4 py-3">Код</th>
              <th className="px-4 py-3">Режим</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Игроки</th>
              <th className="px-4 py-3">Глаголов</th>
              <th className="px-4 py-3">Создана</th>
              <th className="px-4 py-3">Обновлена</th>
              <th className="px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[#142a45]/40">Загрузка…</td>
              </tr>
            ) : rooms.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[#142a45]/40">Нет комнат</td>
              </tr>
            ) : rooms.map(room => (
              <tr key={room.id} className="border-b border-[#142a45]/5 hover:bg-[#142a45]/[0.02] transition">
                <td className="px-4 py-3">
                  <span className="font-mono font-bold tracking-widest">{room.code}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs">{modeLabels[room.mode] ?? room.mode}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusColors[room.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {room.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center font-bold">{room.player_count}</td>
                <td className="px-4 py-3 text-center">{room.mode !== 'classic' ? room.verb_count : '—'}</td>
                <td className="px-4 py-3 text-xs text-[#142a45]/60">{formatDate(room.created_at)}</td>
                <td className="px-4 py-3 text-xs text-[#142a45]/60">{formatDate(room.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {room.status !== 'finished' && (
                      <button
                        type="button"
                        onClick={() => handleClose(room.id)}
                        className="rounded-lg border-2 border-yellow-500 px-3 py-1 text-xs font-bold text-yellow-700 hover:bg-yellow-50 transition"
                        title="Завершить комнату"
                      >
                        Закрыть
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(room.id)}
                      className="rounded-lg border-2 border-red-400 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 transition"
                      title="Удалить комнату"
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </SectionCard>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="rounded-lg border-2 border-[#142a45]/20 px-3 py-1.5 text-sm font-bold disabled:opacity-30 hover:bg-[#142a45]/5 transition"
          >
            ←
          </button>
          <span className="text-sm">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="rounded-lg border-2 border-[#142a45]/20 px-3 py-1.5 text-sm font-bold disabled:opacity-30 hover:bg-[#142a45]/5 transition"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
