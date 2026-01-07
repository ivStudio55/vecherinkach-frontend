'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

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
  const [roomsToday, setRoomsToday] = useState<number | null>(null);
  const [playersToday, setPlayersToday] = useState<number | null>(null);

  const todayRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [{ count: roomsCount, error: roomsError }, { count: playersCount, error: playersError }] = await Promise.all([
        supabase.from('rooms').select('id', { count: 'exact', head: true }),
        supabase.from('players').select('id', { count: 'exact', head: true }),
      ]);

      if (roomsError) throw roomsError;
      if (playersError) throw playersError;

      const [{ count: roomsTodayCount, error: roomsTodayError }, { count: playersTodayCount, error: playersTodayError }] = await Promise.all([
        supabase
          .from('rooms')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', todayRange.startIso)
          .lt('created_at', todayRange.endIso),
        supabase
          .from('players')
          .select('id', { count: 'exact', head: true })
          .gte('joined_at', todayRange.startIso)
          .lt('joined_at', todayRange.endIso),
      ]);

      if (roomsTodayError) throw roomsTodayError;
      if (playersTodayError) throw playersTodayError;

      setRoomsTotal(roomsCount ?? 0);
      setPlayersTotal(playersCount ?? 0);
      setRoomsToday(roomsTodayCount ?? 0);
      setPlayersToday(playersTodayCount ?? 0);
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, [todayRange.endIso, todayRange.startIso]);

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

        <section className="retro-panel bg-white border-[4px] border-[#142a45] p-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Комнаты (всего)" value={roomsTotal ?? (loading ? '…' : 0)} />
            <StatCard label="Игроки (всего)" value={playersTotal ?? (loading ? '…' : 0)} />
            <StatCard label="Комнаты (сегодня)" value={roomsToday ?? (loading ? '…' : 0)} hint="по created_at" />
            <StatCard label="Игроки (сегодня)" value={playersToday ?? (loading ? '…' : 0)} hint="по joined_at" />
          </div>

          <div className="text-sm font-semibold text-[#142a45]/70">
            Примечание: страница не защищена (пока). Если нужно — добавим авторизацию/пароль или доступ только для admin в Supabase.
          </div>
        </section>
      </div>
    </div>
  );
}
