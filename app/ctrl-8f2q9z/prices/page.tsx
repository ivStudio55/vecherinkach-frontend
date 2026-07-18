'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface PriceRow {
  game: string;
  price: number;
}

const GAME_LABELS: Record<string, { label: string; emoji: string; desc: string }> = {
  vecherinkach: { label: 'Вечеринкач', emoji: '🎉', desc: 'Квиз-вечеринка с вопросами' },
  jokester: { label: 'Пошутикач', emoji: '🤡', desc: 'Игра в шутки и розыгрыши' },
  creativach: { label: 'Креативач', emoji: '🎨', desc: 'Творческая игра' },
  draw: { label: 'Рисункач', emoji: '✏️', desc: 'Игра в рисунки и угадывания' },
};

export default function PricesAdminPage() {
  const router = useRouter();
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Record<string, number>>({});
  const [activeEdit, setActiveEdit] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    try {
      const res = await fetch(url, opts);
      if (res.status === 401) { router.push('/ctrl-8f2q9z/login'); return null; }
      return await res.json();
    } catch { return null; }
  }, [router]);

  const loadPrices = useCallback(async () => {
    const data = await apiFetch('/api/panel/prices');
    if (data && !data.error) {
      setPrices(data as Record<string, number>);
      setEditing(data as Record<string, number>);
    }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { loadPrices(); }, [loadPrices]);

  const startEdit = (game: string) => {
    setActiveEdit(game);
    setEditing(prev => ({ ...prev, [game]: prices[game] }));
  };

  const cancelEdit = () => {
    setActiveEdit(null);
    setEditing({ ...prices });
  };

  const savePrice = async (game: string) => {
    const newPrice = editing[game];
    if (isNaN(newPrice) || newPrice < 0) {
      showToast('❌ Некорректная цена');
      return;
    }
    setSaving(game);
    const data = await apiFetch('/api/panel/prices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game, price: newPrice }),
    });
    setSaving(null);
    if (data?.ok) {
      setPrices(prev => ({ ...prev, [game]: newPrice }));
      setActiveEdit(null);
      showToast(`✅ Цена ${GAME_LABELS[game]?.label ?? game} обновлена`);
    } else {
      showToast(`❌ ${data?.error || 'Ошибка сохранения'}`);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400 animate-pulse">Загрузка...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}

      <header className="bg-gray-900/80 backdrop-blur border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/ctrl-8f2q9z')} className="text-gray-400 hover:text-white text-sm">← Панель</button>
          <h1 className="text-lg font-bold">💰 Цены на игры</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <p className="text-sm text-gray-400">
          Цены применяются при создании новых платёжных сессий. Изменение не влияет на уже созданные заказы.
          Кэш обновляется каждые 5 минут.
        </p>

        {Object.entries(GAME_LABELS).map(([game, info]) => {
          const current = prices[game] ?? 0;
          const isEditing = activeEdit === game;
          const isSaving = saving === game;

          return (
            <div
              key={game}
              className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xl font-black">{info.emoji} {info.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{info.desc}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isEditing ? (
                  <>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={editing[game] ?? current}
                        onChange={e => setEditing(prev => ({ ...prev, [game]: Number(e.target.value) }))}
                        autoFocus
                        className="w-28 bg-gray-800 border-2 border-blue-500 rounded-lg px-3 py-2 text-lg font-bold text-center pr-6"
                        onKeyDown={e => { if (e.key === 'Enter') savePrice(game); if (e.key === 'Escape') cancelEdit(); }}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₽</span>
                    </div>
                    <button
                      onClick={() => savePrice(game)}
                      disabled={isSaving}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-bold disabled:opacity-50"
                    >
                      {isSaving ? '...' : '✓'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-black text-yellow-300">{current} ₽</span>
                    <button
                      onClick={() => startEdit(game)}
                      className="px-4 py-2 bg-blue-600/80 hover:bg-blue-500 rounded-lg text-sm font-bold"
                    >
                      ✏️ Изменить
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 text-xs text-gray-500 space-y-1">
          <p className="text-gray-300 font-bold">ℹ️ Подсказки:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Введите <strong className="text-white">0 ₽</strong> чтобы сделать игру полностью бесплатной</li>
            <li>Промокоды применяются поверх базовой цены</li>
            <li>Минимальный платёж ЮKassa — 1 ₽ (при скидках цена округляется вниз)</li>
            <li>Enter — сохранить, Escape — отменить</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
