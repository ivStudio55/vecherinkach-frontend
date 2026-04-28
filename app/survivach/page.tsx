// app/survivach/page.tsx
// Страница создания комнаты Выживач (только для админа)
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchPacks } from '@/lib/survivach/api';
import type { SurvivachPack } from '@/lib/survivach/types';

export default function SurvivachCreatePage() {
  const router = useRouter();
  const [packs, setPacks] = useState<SurvivachPack[]>([]);
  const [selectedPack, setSelectedPack] = useState('default');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPacks().then(setPacks);
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/survivach/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pack_id: selectedPack }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const { hostUrl } = await res.json();
      router.push(hostUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center">
        <h1 className="text-5xl font-black mb-2">🧟 ВЫЖИВАЧ</h1>
        <p className="text-gray-400">Создание новой игры</p>
        <p className="text-gray-600 text-xs mt-1">v1.3</p>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4">
        <div>
          <label className="block text-sm font-bold text-gray-400 mb-1">Пакет вопросов</label>
          <select
            value={selectedPack}
            onChange={e => setSelectedPack(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500"
          >
            {packs.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {packs.length === 0 && <option value="default">Базовый пакет</option>}
          </select>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-8 py-4 rounded-xl text-xl font-black bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          {creating ? '⏳ Создаётся...' : '☠️ Создать игру'}
        </button>
      </div>

      <button onClick={() => router.push('/ctrl-8f2q9z')} className="text-gray-500 hover:text-gray-300 text-sm">
        ← Панель управления
      </button>
    </div>
  );
}
