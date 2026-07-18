'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface DrawPackRow {
  id: string;
  label: string;
  description: string;
  is_public: boolean;
  is_active: boolean;
  price?: number | null;
  created_at: string;
  updated_at: string;
}

export default function DrawPacksAdminPage() {
  const router = useRouter();
  const [packs, setPacks] = useState<DrawPackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editPack, setEditPack] = useState<Partial<DrawPackRow> | null>(null);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    try {
      const res = await fetch(url, opts);
      if (res.status === 401) { router.push('/ctrl-8f2q9z/login'); return null; }
      return await res.json();
    } catch { return null; }
  }, [router]);

  const loadPacks = useCallback(async () => {
    const data = await apiFetch('/api/panel/draw-packs');
    if (Array.isArray(data)) setPacks(data);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { loadPacks(); }, [loadPacks]);

  const savePack = async () => {
    if (!editPack) return;
    setSaving(true);
    const isNew = !packs.some(p => p.id === editPack.id);
    const data = await apiFetch('/api/panel/draw-packs', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editPack),
    });
    setSaving(false);
    if (data?.ok) {
      showToast(isNew ? '✅ Пакет создан' : '✅ Пакет обновлён');
      setEditPack(null);
      loadPacks();
    } else {
      showToast(`❌ ${data?.error || 'Ошибка сохранения'}`);
    }
  };

  const togglePublic = async (pack: DrawPackRow) => {
    await apiFetch('/api/panel/draw-packs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pack.id, is_public: !pack.is_public }),
    });
    loadPacks();
  };

  const deactivatePack = async (id: string) => {
    if (!confirm(`Деактивировать пакет "${id}"?`)) return;
    await apiFetch(`/api/panel/draw-packs?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('✅ Пакет деактивирован');
    loadPacks();
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
            <h1 className="text-lg font-bold">🎨 Пакеты Рисункач</h1>
          </div>
          <button
            onClick={() => setEditPack({ id: '', label: '', description: '', is_public: false })}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-bold transition-colors"
          >
            + Новый пакет
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-sm text-gray-300 space-y-2">
          <p className="font-bold text-white">Как это работает</p>
          <p>Пакет «Рисункач» — это товар доступа к игре. Если пакет активен и не публичный, он появится в магазине как платный.</p>
          <p className="text-gray-400">Цена в карточке имеет приоритет. Если оставить пустой, возьмётся базовая цена игры из раздела «Цены».</p>
        </div>

        {packs.map(pack => (
          <div key={pack.id} className={`border rounded-xl p-4 space-y-3 ${pack.is_active ? 'border-gray-700 bg-gray-900/50' : 'border-red-900/50 bg-red-950/20 opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg">{pack.label}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pack.is_public ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {pack.is_public ? '🌍 Публичный' : '🔒 Платный'}
                  </span>
                  {!pack.is_active && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400">Неактивен</span>}
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300">
                    {pack.price == null ? 'цена игры' : `${pack.price} ₽`}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{pack.description || '—'}</p>
                <p className="text-xs text-gray-500 mt-1 font-mono">ID: {pack.id}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => setEditPack({ ...pack })}
                  className="px-3 py-1 bg-blue-600/80 hover:bg-blue-500 rounded text-xs font-bold transition-colors">
                  ✏️ Ред.
                </button>
                <button onClick={() => togglePublic(pack)}
                  className="px-3 py-1 bg-yellow-600/80 hover:bg-yellow-500 rounded text-xs font-bold transition-colors">
                  {pack.is_public ? 'Сделать платным' : 'Сделать публичным'}
                </button>
                <button onClick={() => deactivatePack(pack.id)}
                  className="px-3 py-1 bg-red-600/80 hover:bg-red-500 rounded text-xs font-bold transition-colors">
                  Удалить
                </button>
              </div>
            </div>
          </div>
        ))}

        {packs.length === 0 && (
          <div className="text-center text-gray-400 py-12">Нет пакетов</div>
        )}
      </main>

      {editPack && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setEditPack(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{packs.some(p => p.id === editPack.id) ? 'Редактировать пакет' : 'Новый пакет Рисункач'}</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">ID пакета</label>
                <input
                  value={editPack.id || ''}
                  onChange={e => setEditPack(prev => ({ ...prev, id: e.target.value }))}
                  disabled={packs.some(p => p.id === editPack.id)}
                  placeholder="classic"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Название</label>
                <input
                  value={editPack.label || ''}
                  onChange={e => setEditPack(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="Рисункач"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Описание</label>
                <input
                  value={editPack.description || ''}
                  onChange={e => setEditPack(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Доступ к игре Рисункач"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Цена (₽), пусто = базовая цена игры</label>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={editPack.price ?? ''}
                  onChange={e => setEditPack(prev => ({ ...prev, price: e.target.value === '' ? null : Number(e.target.value) }))}
                  placeholder="Цена игры по умолчанию"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPack.is_public || false}
                  onChange={e => setEditPack(prev => ({ ...prev, is_public: e.target.checked }))}
                  className="accent-green-500"
                />
                Публичный пакет (бесплатная кнопка «Играть» в магазине)
              </label>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setEditPack(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">Отмена</button>
              <button onClick={savePack} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-bold disabled:opacity-50">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
