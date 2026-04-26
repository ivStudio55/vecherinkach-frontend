'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface PromoRow {
  id: string;
  code: string;
  discount_pct: number;
  discount_fixed: number;
  game: string | null;
  pack_id: string | null;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  created_at: string;
}

const GAME_LABELS: Record<string, string> = {
  vecherinkach: '🎉 Вечеринкач',
  jokester: '🤡 Пошутикач',
  creativach: '🎨 Креативач',
};

const EMPTY_FORM: Partial<PromoRow> = {
  code: '',
  discount_pct: 100,
  discount_fixed: 0,
  game: null,
  pack_id: null,
  expires_at: null,
  max_uses: null,
};

export default function PromoAdminPage() {
  const router = useRouter();
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editPromo, setEditPromo] = useState<Partial<PromoRow> | null>(null);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    try {
      const res = await fetch(url, opts);
      if (res.status === 401) { router.push('/ctrl-8f2q9z/login'); return null; }
      return await res.json();
    } catch { return null; }
  }, [router]);

  const loadPromos = useCallback(async () => {
    const data = await apiFetch('/api/panel/promo');
    if (Array.isArray(data)) setPromos(data);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { loadPromos(); }, [loadPromos]);

  const savePromo = async () => {
    if (!editPromo) return;
    setSaving(true);
    const isNew = !editPromo.id;
    const method = isNew ? 'POST' : 'PUT';
    const data = await apiFetch('/api/panel/promo', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editPromo),
    });
    setSaving(false);
    if (data?.ok) {
      showToast(isNew ? '✅ Промокод создан' : '✅ Промокод обновлён');
      setEditPromo(null);
      loadPromos();
    } else {
      showToast(`❌ ${data?.error || 'Ошибка сохранения'}`);
    }
  };

  const toggleActive = async (promo: PromoRow) => {
    const data = await apiFetch('/api/panel/promo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: promo.id, is_active: !promo.is_active }),
    });
    if (data?.ok) loadPromos();
    else showToast(`❌ ${data?.error}`);
  };

  const resetCount = async (promo: PromoRow) => {
    if (!confirm(`Сбросить счётчик использований для "${promo.code}"?`)) return;
    const data = await apiFetch('/api/panel/promo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: promo.id, reset_used_count: true }),
    });
    if (data?.ok) { showToast('✅ Счётчик сброшен'); loadPromos(); }
    else showToast(`❌ ${data?.error}`);
  };

  const deletePromo = async (promo: PromoRow) => {
    if (!confirm(`Удалить промокод "${promo.code}"? Это действие необратимо.`)) return;
    const data = await apiFetch(`/api/panel/promo?id=${promo.id}`, { method: 'DELETE' });
    if (data?.ok) { showToast('✅ Промокод удалён'); loadPromos(); }
    else showToast(`❌ ${data?.error}`);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('ru-RU'); } catch { return iso; }
  };

  const discountLabel = (p: PromoRow) => {
    if (p.discount_pct === 100) return '🎁 Бесплатно';
    const parts = [];
    if (p.discount_pct > 0) parts.push(`-${p.discount_pct}%`);
    if (p.discount_fixed > 0) parts.push(`-${p.discount_fixed} ₽`);
    return parts.join(' + ') || '—';
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
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/ctrl-8f2q9z')} className="text-gray-400 hover:text-white text-sm">← Панель</button>
            <h1 className="text-lg font-bold">🎟 Управление промокодами</h1>
          </div>
          <button
            onClick={() => setEditPromo({ ...EMPTY_FORM })}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-bold transition-colors"
          >
            + Новый промокод
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Legend */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-sm text-gray-300 space-y-1">
          <p className="font-bold text-white">📋 Как работают промокоды:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-400">
            <li><strong className="text-white">Бесплатно (100%)</strong> — пользователь получает пакет без оплаты, комната создаётся сразу</li>
            <li><strong className="text-white">Скидка (%)</strong> — уменьшает цену в ЮKassa на указанный процент</li>
            <li><strong className="text-white">Фиксированная скидка (₽)</strong> — вычитается из итоговой цены</li>
            <li><strong className="text-white">Игра</strong> — если указана, код работает только для этой игры</li>
            <li><strong className="text-white">Пакет</strong> — если указан ID, код работает только для этого пакета</li>
          </ul>
        </div>

        {/* Promo list */}
        {promos.length === 0 && (
          <div className="text-center py-12 text-gray-500">Промокодов пока нет. Создайте первый!</div>
        )}

        {promos.map(promo => (
          <div
            key={promo.id}
            className={`border rounded-xl p-4 space-y-2 ${promo.is_active ? 'border-gray-700 bg-gray-900/50' : 'border-gray-800 bg-gray-950/50 opacity-50'}`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xl font-black text-yellow-300">{promo.code}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${promo.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {promo.is_active ? '✅ Активен' : '⛔ Выключен'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300">
                    {discountLabel(promo)}
                  </span>
                  {promo.game && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-300">
                      {GAME_LABELS[promo.game] ?? promo.game}
                    </span>
                  )}
                  {!promo.game && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-500/20 text-gray-400">
                      🌐 Все игры
                    </span>
                  )}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-400 flex-wrap">
                  <span>
                    Использований: <strong className="text-white">{promo.used_count}</strong>
                    {promo.max_uses != null ? ` / ${promo.max_uses}` : ' / ∞'}
                  </span>
                  <span>Истекает: <strong className="text-white">{formatDate(promo.expires_at)}</strong></span>
                  {promo.pack_id && <span>Пакет: <code className="text-gray-300">{promo.pack_id}</code></span>}
                  <span className="text-gray-600">ID: {promo.id.slice(0, 8)}…</span>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap shrink-0">
                <button
                  onClick={() => setEditPromo({ ...promo })}
                  className="px-3 py-1 bg-blue-600/80 hover:bg-blue-500 rounded text-xs font-bold"
                >
                  ✏️ Ред.
                </button>
                <button
                  onClick={() => toggleActive(promo)}
                  className={`px-3 py-1 rounded text-xs font-bold ${promo.is_active ? 'bg-red-700/80 hover:bg-red-600' : 'bg-green-700/80 hover:bg-green-600'}`}
                >
                  {promo.is_active ? '⛔ Откл.' : '✅ Вкл.'}
                </button>
                <button
                  onClick={() => resetCount(promo)}
                  className="px-3 py-1 bg-gray-600/80 hover:bg-gray-500 rounded text-xs font-bold"
                >
                  🔄 Сброс
                </button>
                <button
                  onClick={() => deletePromo(promo)}
                  className="px-3 py-1 bg-red-900/80 hover:bg-red-700 rounded text-xs font-bold"
                >
                  🗑 Удалить
                </button>
              </div>
            </div>
          </div>
        ))}
      </main>

      {/* Edit modal */}
      {editPromo && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold">{editPromo.id ? `Редактирование: ${editPromo.code}` : 'Новый промокод'}</h2>

            {!editPromo.id && (
              <div>
                <label className="text-xs text-gray-400 block mb-1">Код * (A-Z, 0-9, _, -)</label>
                <input
                  type="text"
                  value={editPromo.code ?? ''}
                  onChange={e => setEditPromo(p => ({ ...p!, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }))}
                  placeholder="PROMO2026"
                  maxLength={32}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono uppercase"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Скидка % (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editPromo.discount_pct ?? 100}
                  onChange={e => setEditPromo(p => ({ ...p!, discount_pct: Number(e.target.value) }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">100% = бесплатно 🎁</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Скидка фикс. ₽</label>
                <input
                  type="number"
                  min={0}
                  value={editPromo.discount_fixed ?? 0}
                  onChange={e => setEditPromo(p => ({ ...p!, discount_fixed: Number(e.target.value) }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Игра (или оставьте пустым для всех)</label>
              <select
                value={editPromo.game ?? ''}
                onChange={e => setEditPromo(p => ({ ...p!, game: e.target.value || null }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">🌐 Все игры</option>
                <option value="vecherinkach">🎉 Вечеринкач</option>
                <option value="jokester">🤡 Пошутикач</option>
                <option value="creativach">🎨 Креативач</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">ID пакета (или оставьте пустым для всех пакетов)</label>
              <input
                type="text"
                value={editPromo.pack_id ?? ''}
                onChange={e => setEditPromo(p => ({ ...p!, pack_id: e.target.value || null }))}
                placeholder="например: 03012026"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Макс. использований (пусто = ∞)</label>
                <input
                  type="number"
                  min={1}
                  value={editPromo.max_uses ?? ''}
                  onChange={e => setEditPromo(p => ({ ...p!, max_uses: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="∞"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Истекает (пусто = бессрочно)</label>
                <input
                  type="date"
                  value={editPromo.expires_at ? editPromo.expires_at.slice(0, 10) : ''}
                  onChange={e => setEditPromo(p => ({ ...p!, expires_at: e.target.value ? `${e.target.value}T23:59:59Z` : null }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="bg-gray-800/60 rounded-lg p-3 text-xs text-gray-400 space-y-1">
              <p className="font-bold text-white">Предпросмотр:</p>
              {editPromo.discount_pct === 100 ? (
                <p className="text-green-400">🎁 Полностью бесплатно</p>
              ) : (
                <>
                  {(editPromo.discount_pct ?? 0) > 0 && <p>Скидка: -{editPromo.discount_pct}%</p>}
                  {(editPromo.discount_fixed ?? 0) > 0 && <p>Дополнительно: -{editPromo.discount_fixed} ₽</p>}
                </>
              )}
              <p>Игра: {editPromo.game ? (GAME_LABELS[editPromo.game] ?? editPromo.game) : '🌐 все'}</p>
              <p>Пакет: {editPromo.pack_id || 'любой'}</p>
              <p>Лимит: {editPromo.max_uses ?? '∞'} использований</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditPromo(null)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
              >
                Отмена
              </button>
              <button
                onClick={savePromo}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-bold disabled:opacity-50"
              >
                {saving ? 'Сохраняю...' : (editPromo.id ? 'Сохранить' : 'Создать')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
