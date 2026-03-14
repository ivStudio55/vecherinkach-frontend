'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface CategoryRow {
  id: string;
  name: string;
  folder_key: string;
  audio_variants: number;
  is_active: boolean;
  created_at: string;
}

const AUDIO_BASE = 'https://storage.yandexcloud.net/vecherinkach/audio/category_of_round4';

export default function CategoriesAdminPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editCat, setEditCat] = useState<Partial<CategoryRow> | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<Record<string, Record<string, boolean>>>({});

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    try {
      const res = await fetch(url, opts);
      if (res.status === 401) { router.push('/ctrl-8f2q9z/login'); return null; }
      return await res.json();
    } catch { return null; }
  }, [router]);

  const loadCategories = useCallback(async () => {
    const data = await apiFetch('/api/panel/round4-categories');
    if (Array.isArray(data)) setCategories(data);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const saveCategory = async () => {
    if (!editCat) return;
    setSaving(true);
    const isNew = !categories.some(c => c.id === editCat.id);
    const method = isNew ? 'POST' : 'PUT';
    const data = await apiFetch('/api/panel/round4-categories', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editCat),
    });
    setSaving(false);
    if (data?.ok) {
      showToast(isNew ? '✅ Категория создана' : '✅ Категория обновлена');
      setEditCat(null);
      loadCategories();
    } else {
      showToast(`❌ ${data?.error || 'Ошибка сохранения'}`);
    }
  };

  const deleteCategory = async (cat: CategoryRow) => {
    if (!confirm(`Удалить категорию «${cat.name}»?`)) return;
    const data = await apiFetch(`/api/panel/round4-categories?id=${encodeURIComponent(cat.id)}`, { method: 'DELETE' });
    if (data?.ok) {
      showToast('✅ Категория удалена');
      loadCategories();
    } else {
      showToast(`❌ ${data?.error || 'Ошибка'}`);
    }
  };

  const toggleActive = async (cat: CategoryRow) => {
    await apiFetch('/api/panel/round4-categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cat.id, is_active: !cat.is_active }),
    });
    loadCategories();
  };

  const checkAudio = async (cat: CategoryRow) => {
    setChecking(cat.id);
    const results: Record<string, boolean> = {};
    for (let i = 1; i <= cat.audio_variants; i++) {
      const url = `${AUDIO_BASE}/${encodeURIComponent(cat.folder_key)}/${i}.mp3`;
      try {
        const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
        results[`${i}.mp3`] = res.ok;
      } catch {
        results[`${i}.mp3`] = false;
      }
    }
    setAudioStatus(prev => ({ ...prev, [cat.id]: results }));
    setChecking(null);
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
            <h1 className="text-lg font-bold">🎭 Категории Раунда 4 (Дешифровщик)</h1>
          </div>
          <button
            onClick={() => setEditCat({ name: '', folder_key: '', audio_variants: 3, is_active: true })}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-bold transition-colors"
          >
            + Новая категория
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Instructions */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-sm text-gray-300 space-y-2">
          <p className="font-bold text-white">📋 Как добавить категорию:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Загрузите mp3 файлы озвучки в <code className="bg-gray-700 px-1 rounded">audio/category_of_round4/ИМЯ_ПАПКИ/</code> на Yandex Cloud Storage</li>
            <li>Файлы озвучки называются <code className="bg-gray-700 px-1 rounded">1.mp3</code>, <code className="bg-gray-700 px-1 rounded">2.mp3</code>, <code className="bg-gray-700 px-1 rounded">3.mp3</code> и т.д.</li>
            <li>Нажмите «+ Новая категория», введите название на кириллице и ключ папки (латиницей)</li>
            <li>Проверьте доступность аудио кнопкой «🔊 Проверить»</li>
          </ol>
          <p className="text-gray-400 mt-2">Путь к озвучке: <code className="bg-gray-700 px-1 rounded">{AUDIO_BASE}/КЛЮЧ_ПАПКИ/N.mp3</code></p>
        </div>

        {/* Category list */}
        {categories.map(cat => (
          <div key={cat.id} className={`border rounded-xl p-4 space-y-3 ${cat.is_active ? 'border-gray-700 bg-gray-900/50' : 'border-red-900/50 bg-red-950/20 opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg">{cat.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cat.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {cat.is_active ? '✅ Активна' : '❌ Неактивна'}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1 font-mono">📁 {cat.folder_key}/</p>
                <p className="text-xs text-gray-500 mt-1">🔊 Вариантов озвучки: {cat.audio_variants}</p>
                <p className="text-xs text-gray-500 break-all">{AUDIO_BASE}/{cat.folder_key}/</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => setEditCat({ ...cat })}
                  className="px-3 py-1 bg-blue-600/80 hover:bg-blue-500 rounded text-xs font-bold transition-colors">
                  ✏️ Ред.
                </button>
                <button onClick={() => toggleActive(cat)}
                  className="px-3 py-1 bg-yellow-600/80 hover:bg-yellow-500 rounded text-xs font-bold transition-colors">
                  {cat.is_active ? '🚫 Выкл' : '✅ Вкл'}
                </button>
                <button onClick={() => checkAudio(cat)}
                  disabled={checking === cat.id}
                  className="px-3 py-1 bg-teal-600/80 hover:bg-teal-500 rounded text-xs font-bold transition-colors disabled:opacity-50">
                  {checking === cat.id ? '...' : '🔊 Проверить'}
                </button>
                <button onClick={() => deleteCategory(cat)}
                  className="px-3 py-1 bg-red-600/80 hover:bg-red-500 rounded text-xs font-bold transition-colors">
                  🗑 Удалить
                </button>
              </div>
            </div>

            {/* Audio check results */}
            {audioStatus[cat.id] && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(audioStatus[cat.id]).map(([file, ok]) => (
                  <span key={file} className={`px-2 py-1 rounded text-xs font-mono ${ok ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {ok ? '✅' : '❌'} {file}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {categories.length === 0 && (
          <div className="text-center text-gray-400 py-12">Нет категорий</div>
        )}
      </main>

      {/* Edit/Create Modal */}
      {editCat && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setEditCat(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{categories.some(c => c.id === editCat.id) ? '✏️ Редактировать категорию' : '🎭 Новая категория'}</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Название категории (кириллица)</label>
                <input
                  value={editCat.name || ''}
                  onChange={e => setEditCat(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="например: Американский кинематограф"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Ключ папки (латиница, будет подпапкой в category_of_round4/)</label>
                <input
                  value={editCat.folder_key || ''}
                  onChange={e => setEditCat(prev => ({ ...prev, folder_key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
                  placeholder="например: american_cinema"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white font-mono"
                />
                {editCat.folder_key && (
                  <p className="text-xs text-gray-500 mt-1">
                    Полный путь: {AUDIO_BASE}/{editCat.folder_key}/
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Количество вариантов озвучки (файлов: 1.mp3, 2.mp3, ...)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={editCat.audio_variants || 3}
                  onChange={e => setEditCat(prev => ({ ...prev, audio_variants: +e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editCat.is_active !== false}
                  onChange={e => setEditCat(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="accent-green-500"
                />
                Активна (используется в игре)
              </label>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setEditCat(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">Отмена</button>
              <button onClick={saveCategory} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-bold disabled:opacity-50">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
