// app/survivach/page.tsx
// Страница создания комнаты «Выживач»
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GameConnectionGuide } from '@/components/GameConnectionGuide';
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
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-5 md:p-8 gap-8">
      <div className="text-center">
        <h1 className="text-5xl font-black mb-2">🧟 ВЫЖИВАЧ</h1>
        <p className="text-gray-400">Создание новой игры</p>
        <p className="text-gray-600 text-xs mt-1">0.1 (бета)</p>
      </div>

      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full flex flex-col gap-4 shadow-2xl">
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

        <GameConnectionGuide
          gameName="Выживач"
          variant="dark"
          hostScreenText="Экран ведущего лучше открыть на отдельном большом устройстве: ноутбуке, телевизоре или проекторе. Там будет игровое поле, ход игры, таймеры и комментарии ведущего."
          playerText="Игроки сканируют QR-код или вводят код комнаты и дальше отвечают каждый со своего телефона."
          spectatorText="Совет: не играйте все с одного устройства. Экран ведущего нужен для общей картины, а телефоны игроков - для личных ответов и действий."
        />
      </div>

      <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-300 text-sm">
        ← Вернуться на главную
      </button>
    </div>
  );
}
