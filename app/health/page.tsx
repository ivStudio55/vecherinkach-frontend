'use client';

import { useEffect, useState } from 'react';

type HealthPayload = {
  ok: boolean;
  latencyMs: number;
  time: string;
  error?: string;
};

export default function HealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const res = await fetch('/api/health', { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as HealthPayload | null;
      if (mounted) {
        setData(payload);
        setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(load, 10000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="retro-panel bg-[#142a45] text-[#ffeccd] px-6 py-5">
          <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/70">HEALTH</p>
          <h1 className="text-3xl font-black">Состояние сервиса</h1>
          <p className="text-sm text-[#ffeccd]/70">Автообновление каждые 10 секунд.</p>
        </header>

        <div className="rounded-3xl border-[4px] border-[#142a45] bg-white p-6 space-y-3">
          {loading ? (
            <p className="font-semibold">Проверяем соединение…</p>
          ) : data ? (
            <>
              <p className={`text-lg font-black ${data.ok ? 'text-[#2f7a3b]' : 'text-[#b23324]'}`}>
                {data.ok ? 'OK' : 'Проблемы'}
              </p>
              <p className="text-sm text-[#142a45]/70">Latency: {data.latencyMs} ms</p>
              <p className="text-xs text-[#142a45]/60">Обновлено: {data.time}</p>
              {data.error ? <p className="text-sm text-[#b23324]">{data.error}</p> : null}
            </>
          ) : (
            <p className="text-sm text-[#b23324]">Нет ответа от сервера.</p>
          )}
        </div>
      </div>
    </div>
  );
}
