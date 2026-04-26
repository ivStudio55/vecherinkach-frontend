'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

interface PackRow {
  id: string;
  label: string;
  description: string;
  is_public: boolean;
  is_active: boolean;
  json_base_url: string;
  audio_round2_start: number;
  audio_round2_end: number;
  audio_round3_start: number;
  audio_round5_start: number;
  price?: number | null;
  created_at: string;
  updated_at: string;
}

const REQUIRED_FILES = [
  'round1.json',
  'true_false_explanation_new.json',
  '3round_questions.json',
  '4round.json',
  '5round_question.json',
];

export default function PacksAdminPage() {
  const router = useRouter();
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editPack, setEditPack] = useState<Partial<PackRow> | null>(null);
  const [saving, setSaving] = useState(false);
  const [qrPackId, setQrPackId] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, Record<string, boolean>>>({});
  const [validating, setValidating] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    try {
      const res = await fetch(url, opts);
      if (res.status === 401) { router.push('/ctrl-8f2q9z/login'); return null; }
      return await res.json();
    } catch { return null; }
  }, [router]);

  const loadPacks = useCallback(async () => {
    const data = await apiFetch('/api/panel/packs');
    if (Array.isArray(data)) setPacks(data);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { loadPacks(); }, [loadPacks]);

  const savePack = async () => {
    if (!editPack) return;
    setSaving(true);
    const isNew = !packs.some(p => p.id === editPack.id);
    const method = isNew ? 'POST' : 'PUT';
    const data = await apiFetch('/api/panel/packs', {
      method,
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

  const togglePublic = async (pack: PackRow) => {
    await apiFetch('/api/panel/packs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pack.id, is_public: !pack.is_public }),
    });
    loadPacks();
  };

  const deactivatePack = async (id: string) => {
    if (!confirm(`Деактивировать пакет "${id}"?`)) return;
    await apiFetch(`/api/panel/packs?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('✅ Пакет деактивирован');
    loadPacks();
  };

  const validatePack = async (pack: PackRow) => {
    setValidating(pack.id);
    const results: Record<string, boolean> = {};
    for (const file of REQUIRED_FILES) {
      try {
        const res = await fetch(`${pack.json_base_url}/${file}`, { method: 'HEAD', mode: 'cors' });
        results[file] = res.ok;
      } catch {
        results[file] = false;
      }
    }
    setValidationResults(prev => ({ ...prev, [pack.id]: results }));
    setValidating(null);
  };

  const getPackUrl = (packId: string) => `https://vecherinkach.ru/?pack=${encodeURIComponent(packId)}`;

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
            <h1 className="text-lg font-bold">📦 Управление пакетами вопросов</h1>
          </div>
          <button
            onClick={() => setEditPack({
              id: '',
              label: '',
              description: '',
              is_public: false,
              json_base_url: '',
              audio_round2_start: 1,
              audio_round2_end: 81,
              audio_round3_start: 1,
              audio_round5_start: 1,
            })}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-bold transition-colors"
          >
            + Новый пакет
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Instructions */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-sm text-gray-300 space-y-2">
          <p className="font-bold text-white">📋 Как добавить новый пакет вопросов:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Загрузите JSON файлы вопросов в <code className="bg-gray-700 px-1 rounded">https://storage.yandexcloud.net/vecherinkach/json/packs/ID_ПАКЕТА/</code></li>
            <li>Загрузите аудио файлы с озвучкой в <code className="bg-gray-700 px-1 rounded">https://storage.yandexcloud.net/vecherinkach/audio/packs/ID_ПАКЕТА/</code></li>
            <li>Нажмите «+ Новый пакет», заполните форму, укажите смещения аудио нумерации</li>
            <li>Проверьте пакет кнопкой «Проверить» — все файлы должны быть зелёными</li>
            <li>Установите «Публичный» для отображения в общем списке, или используйте QR/ссылку для приватного доступа</li>
          </ol>
          <p className="text-gray-400 mt-2">Необходимые JSON файлы: {REQUIRED_FILES.join(', ')}</p>
        </div>

        {/* Pack list */}
        {packs.map(pack => (
          <div key={pack.id} className={`border rounded-xl p-4 space-y-3 ${pack.is_active ? 'border-gray-700 bg-gray-900/50' : 'border-red-900/50 bg-red-950/20 opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg">{pack.label}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pack.is_public ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {pack.is_public ? '🌍 Публичный' : '🔒 Приватный'}
                  </span>
                  {!pack.is_active && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400">Неактивен</span>}
                </div>
                <p className="text-sm text-gray-400 mt-1">{pack.description || '—'}</p>
                <p className="text-xs text-gray-500 mt-1 font-mono">ID: {pack.id}</p>
                <p className="text-xs text-gray-500 font-mono break-all">URL: {pack.json_base_url}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Аудио: R2 [{pack.audio_round2_start}–{pack.audio_round2_end}] R3 start={pack.audio_round3_start} R5 start={pack.audio_round5_start}
                </p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => setQrPackId(qrPackId === pack.id ? null : pack.id)}
                  className="px-3 py-1 bg-purple-600/80 hover:bg-purple-500 rounded text-xs font-bold transition-colors">
                  QR
                </button>
                <button onClick={() => setEditPack({ ...pack })}
                  className="px-3 py-1 bg-blue-600/80 hover:bg-blue-500 rounded text-xs font-bold transition-colors">
                  ✏️ Ред.
                </button>
                <button onClick={() => togglePublic(pack)}
                  className="px-3 py-1 bg-yellow-600/80 hover:bg-yellow-500 rounded text-xs font-bold transition-colors">
                  {pack.is_public ? '🔒' : '🌍'}
                </button>
                <button onClick={() => validatePack(pack)}
                  disabled={validating === pack.id}
                  className="px-3 py-1 bg-teal-600/80 hover:bg-teal-500 rounded text-xs font-bold transition-colors disabled:opacity-50">
                  {validating === pack.id ? '...' : '✓ Проверить'}
                </button>
                {pack.id !== 'classic' && (
                  <button onClick={() => deactivatePack(pack.id)}
                    className="px-3 py-1 bg-red-600/80 hover:bg-red-500 rounded text-xs font-bold transition-colors">
                    🗑 Удалить
                  </button>
                )}
              </div>
            </div>

            {/* QR Code */}
            {qrPackId === pack.id && (
              <div className="bg-white rounded-xl p-6 flex flex-col items-center gap-3 max-w-xs mx-auto">
                <QRCodeSVG value={getPackUrl(pack.id)} size={200} level="M" />
                <p className="text-black text-sm font-bold text-center">{pack.label}</p>
                <p className="text-gray-600 text-xs text-center break-all">{getPackUrl(pack.id)}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(getPackUrl(pack.id)).then(() => showToast('✅ Ссылка скопирована'))}
                  className="px-4 py-1.5 bg-purple-600 text-white rounded text-sm font-bold hover:bg-purple-500 transition-colors"
                >
                  📋 Копировать ссылку
                </button>
              </div>
            )}

            {/* Validation results */}
            {validationResults[pack.id] && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(validationResults[pack.id]).map(([file, ok]) => (
                  <span key={file} className={`px-2 py-1 rounded text-xs font-mono ${ok ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {ok ? '✅' : '❌'} {file}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {packs.length === 0 && (
          <div className="text-center text-gray-400 py-12">Нет пакетов</div>
        )}
      </main>

      {/* Edit/Create Modal */}
      {editPack && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setEditPack(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{packs.some(p => p.id === editPack.id) ? '✏️ Редактировать пакет' : '📦 Новый пакет'}</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">ID пакета (латиница, цифры, не менять после создания)</label>
                <input
                  value={editPack.id || ''}
                  onChange={e => setEditPack(prev => ({ ...prev, id: e.target.value }))}
                  disabled={packs.some(p => p.id === editPack.id)}
                  placeholder="например: pack_2026_02"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Название</label>
                <input
                  value={editPack.label || ''}
                  onChange={e => setEditPack(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="Название пакета"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Описание</label>
                <input
                  value={editPack.description || ''}
                  onChange={e => setEditPack(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Краткое описание"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">JSON Base URL</label>
                <input
                  value={editPack.json_base_url || ''}
                  onChange={e => setEditPack(prev => ({ ...prev, json_base_url: e.target.value }))}
                  placeholder="https://storage.yandexcloud.net/vecherinkach/json/packs/ID"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Цена (₽) — оставьте пустым для использования цены игры по умолчанию</label>
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
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPack.is_public || false}
                    onChange={e => setEditPack(prev => ({ ...prev, is_public: e.target.checked }))}
                    className="accent-green-500"
                  />
                  Публичный пакет (виден в списке выбора)
                </label>
              </div>

              <div className="border-t border-gray-700 pt-3">
                <p className="text-xs text-gray-400 mb-2 font-bold">🔊 Смещения аудио нумерации</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">R2 старт</label>
                    <input type="number" value={editPack.audio_round2_start || 1}
                      onChange={e => setEditPack(prev => ({ ...prev, audio_round2_start: +e.target.value }))}
                      className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">R2 конец</label>
                    <input type="number" value={editPack.audio_round2_end || 81}
                      onChange={e => setEditPack(prev => ({ ...prev, audio_round2_end: +e.target.value }))}
                      className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">R3 старт</label>
                    <input type="number" value={editPack.audio_round3_start || 1}
                      onChange={e => setEditPack(prev => ({ ...prev, audio_round3_start: +e.target.value }))}
                      className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">R5 старт</label>
                    <input type="number" value={editPack.audio_round5_start || 1}
                      onChange={e => setEditPack(prev => ({ ...prev, audio_round5_start: +e.target.value }))}
                      className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-white" />
                  </div>
                </div>
              </div>
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
