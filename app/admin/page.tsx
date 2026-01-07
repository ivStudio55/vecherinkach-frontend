'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
};

function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="rounded-3xl border-[3px] border-[#142a45] bg-white p-4 space-y-2">
      <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">{label}</p>
      <p className="text-3xl font-black text-[#142a45]">{value}</p>
      {hint ? <p className="text-xs font-semibold text-[#142a45]/60">{hint}</p> : null}
    </div>
  );
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roomsTotal, setRoomsTotal] = useState<number | null>(null);
  const [playersTotal, setPlayersTotal] = useState<number | null>(null);
  const [roomsInRange, setRoomsInRange] = useState<number | null>(null);
  const [playersInRange, setPlayersInRange] = useState<number | null>(null);
  const [roomsActive, setRoomsActive] = useState<number | null>(null);
  const [roomsFinished, setRoomsFinished] = useState<number | null>(null);

  const [leaderboardTotal, setLeaderboardTotal] = useState<Array<{ playerId: string; name: string; points: number }> | null>(null);
  const [leaderboardRound2, setLeaderboardRound2] = useState<Array<{ playerId: string; name: string; points: number }> | null>(null);

  const [roomCode, setRoomCode] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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
    // Date-only strings (YYYY-MM-DD) parse as UTC midnight in JS.
    const startMs = Date.parse(startDate);
    const endMs = Date.parse(endDate);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return null;
    }
    const start = new Date(startMs);
    const endExclusive = new Date(endMs);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return { startIso: start.toISOString(), endIso: endExclusive.toISOString() };
  }, [endDate, startDate]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionMessage(null);

    try {
      if (!range) {
        setError('Некорректный период');
        setLoading(false);
        return;
      }

      const qs = new URLSearchParams({ start: range.startIso, end: range.endIso });
      const [statsRes, lbTotalRes, lbRound2Res] = await Promise.all([
        fetch(`/api/admin/stats?${qs.toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/leaderboard?${new URLSearchParams({ ...Object.fromEntries(qs), type: 'total', limit: '10' }).toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/leaderboard?${new URLSearchParams({ ...Object.fromEntries(qs), type: 'round2', limit: '10' }).toString()}`, { cache: 'no-store' }),
      ]);

      const statsPayload = await statsRes.json().catch(() => null);
      const lbTotalPayload = await lbTotalRes.json().catch(() => null);
      const lbRound2Payload = await lbRound2Res.json().catch(() => null);

      if (!statsRes.ok) throw new Error(statsPayload?.error ?? 'Не удалось загрузить статистику');
      if (!lbTotalRes.ok) throw new Error(lbTotalPayload?.error ?? 'Не удалось загрузить лидерборд');
      if (!lbRound2Res.ok) throw new Error(lbRound2Payload?.error ?? 'Не удалось загрузить лидерборд Раунда 2');

      setRoomsTotal(statsPayload?.rooms?.total ?? 0);
      setPlayersTotal(statsPayload?.players?.total ?? 0);
      setRoomsInRange(statsPayload?.rooms?.inRange ?? 0);
      setPlayersInRange(statsPayload?.players?.inRange ?? 0);
      setRoomsActive(statsPayload?.rooms?.active ?? 0);
      setRoomsFinished(statsPayload?.rooms?.finished ?? 0);

      setLeaderboardTotal((lbTotalPayload?.items ?? []).map((it: any) => ({
        playerId: String(it.playerId),
        name: String(it.name ?? ''),
        points: Number(it.points ?? 0),
      })));
      setLeaderboardRound2((lbRound2Payload?.items ?? []).map((it: any) => ({
        playerId: String(it.playerId),
        name: String(it.name ?? ''),
        points: Number(it.points ?? 0),
      })));
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, [range]);

  const closeRoom = useCallback(async () => {
    setActionMessage(null);
    setError(null);
    const code = roomCode.trim();
    if (!/^\d{4}$/.test(code)) {
      setError('Код комнаты должен состоять из 4 цифр');
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
    void loadStats();
  }, [loadStats, roomCode]);

  const deleteRoom = useCallback(async () => {
    setActionMessage(null);
    setError(null);
    const code = roomCode.trim();
    if (!/^\d{4}$/.test(code)) {
      setError('Код комнаты должен состоять из 4 цифр');
      return;
    }
    if (!confirm(`Удалить комнату ${code} и все её данные? Это необратимо.`)) return;
    const res = await fetch('/api/admin/room/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error ?? 'Не удалось удалить комнату');
      return;
    }
    setActionMessage(`Комната ${code} удалена`);
    void loadStats();
  }, [loadStats, roomCode]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-6">
      <div className="max-w-[95vw] mx-auto space-y-6">
        <header className="retro-panel bg-[#142a45] text-[#ffeccd] px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/70">Админ</p>
              <h1 className="text-3xl sm:text-4xl font-black leading-tight">Статистика проекта</h1>
            </div>
            <button
              type="button"
              onClick={() => void loadStats()}
              className="px-5 py-3 rounded-2xl border-[3px] border-[#ffeccd] text-[#ffeccd] font-black tracking-[0.2em] hover:bg-[#ffeccd]/10 transition"
            >
              Обновить
            </button>
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

        <section className="retro-panel bg-white border-[4px] border-[#142a45] p-6 space-y-6">
          <div className="rounded-3xl border-[3px] border-[#142a45] bg-white p-4 space-y-4">
            <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Период</p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">С</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-[#fff2c8] font-black"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">ПО</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-[#fff2c8] font-black"
                />
              </div>
              <button
                type="button"
                onClick={() => void loadStats()}
                className="px-5 py-3 rounded-2xl border-[3px] border-[#142a45] text-[#142a45] font-black tracking-[0.2em] hover:bg-[#142a45]/5 transition"
              >
                Показать
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartDate(today);
                  setEndDate(today);
                  void loadStats();
                }}
                className="px-5 py-3 rounded-2xl border-[3px] border-[#142a45] text-[#142a45] font-black tracking-[0.2em] hover:bg-[#142a45]/5 transition"
              >
                Сегодня
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Комнаты (всего)" value={roomsTotal ?? (loading ? '…' : 0)} />
            <StatCard label="Игроки (всего)" value={playersTotal ?? (loading ? '…' : 0)} />
            <StatCard label="Комнаты (в периоде)" value={roomsInRange ?? (loading ? '…' : 0)} hint="по created_at" />
            <StatCard label="Игроки (в периоде)" value={playersInRange ?? (loading ? '…' : 0)} hint="по joined_at" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Комнаты активные" value={roomsActive ?? (loading ? '…' : 0)} hint="is_active=true" />
            <StatCard label="Комнаты завершённые" value={roomsFinished ?? (loading ? '…' : 0)} hint="status=finished" />
            <StatCard label="Лидерборд (игроки, очки)" value={leaderboardTotal ? leaderboardTotal.length : loading ? '…' : 0} hint="по players.total_points в периоде" />
            <StatCard label="Лидерборд (Раунд 2, очки)" value={leaderboardRound2 ? leaderboardRound2.length : loading ? '…' : 0} hint="по round2_answers в периоде" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border-[3px] border-[#142a45] bg-white p-4 space-y-3">
              <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Топ игроков (по total_points)</p>
              <div className="space-y-2">
                {(leaderboardTotal ?? []).map((row, idx) => (
                  <div key={row.playerId} className="flex items-center justify-between text-sm font-black">
                    <span className="text-[#142a45]/80">{idx + 1}. {row.name}</span>
                    <span className="text-[#142a45]">{row.points}</span>
                  </div>
                ))}
                {!loading && (leaderboardTotal?.length ?? 0) === 0 ? (
                  <div className="text-sm font-semibold text-[#142a45]/60">Нет данных за период</div>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border-[3px] border-[#142a45] bg-white p-4 space-y-3">
              <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Топ игроков (Раунд 2 — сумма points_earned)</p>
              <div className="space-y-2">
                {(leaderboardRound2 ?? []).map((row, idx) => (
                  <div key={row.playerId} className="flex items-center justify-between text-sm font-black">
                    <span className="text-[#142a45]/80">{idx + 1}. {row.name}</span>
                    <span className="text-[#142a45]">{row.points}</span>
                  </div>
                ))}
                {!loading && (leaderboardRound2?.length ?? 0) === 0 ? (
                  <div className="text-sm font-semibold text-[#142a45]/60">Нет данных за период</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border-[3px] border-[#142a45] bg-white p-4 space-y-4">
            <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Управление БД</p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label className="text-xs font-black tracking-[0.25em] text-[#142a45]/70">Код комнаты</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="1234"
                  className="w-full mt-2 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-[#fff2c8] font-black tracking-[0.35em] text-center"
                />
              </div>
              <button
                type="button"
                onClick={() => void closeRoom()}
                className="px-5 py-3 rounded-2xl border-[3px] border-[#142a45] text-[#142a45] font-black tracking-[0.2em] hover:bg-[#142a45]/5 transition"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={() => void deleteRoom()}
                className="px-5 py-3 rounded-2xl border-[3px] border-[#b23324] text-[#b23324] font-black tracking-[0.2em] hover:bg-[#b23324]/5 transition"
              >
                Удалить
              </button>
            </div>
            <div className="text-xs font-semibold text-[#142a45]/60">
              Удаление комнаты делает последовательные DELETE по таблицам: round2_answers, answers, round3_votes, round3_answers, round4_answers, round5_answers, players, rooms.
            </div>
          </div>

          <div className="text-sm font-semibold text-[#142a45]/70">
            Примечание: доступ защищён Basic Auth (см. переменные окружения `ADMIN_USER` и `ADMIN_PASSWORD`). Для API нужен `SUPABASE_SERVICE_ROLE_KEY`.
          </div>
        </section>
      </div>
    </div>
  );
}
