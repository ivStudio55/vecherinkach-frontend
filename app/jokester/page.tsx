// app/jokester/page.tsx
// Вход в «Пошути-кач»
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createJokesterRoom, joinJokesterRoom, fetchJokesterPlayers, fetchJokesterRoom, jokesterStorage } from '@/lib/jokester/api';
import type { JokesterRole } from '@/lib/jokester/types';

const AVATAR_COUNT = 12;
const AVATARS = Array.from({ length: AVATAR_COUNT }, (_, i) => `ava${i + 1}.png`);
const AVATAR_BASE = '/audio/sound/Jokester/ava/';

export default function JokesterEntryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [takenAvatars, setTakenAvatars] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch taken avatars when join code changes
  useEffect(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) { setTakenAvatars([]); return; }
    let cancelled = false;
    (async () => {
      const room = await fetchJokesterRoom(code);
      if (!room || cancelled) return;
      const players = await fetchJokesterPlayers(room.id);
      const taken = players.map(p => p.avatar);
      if (!cancelled) {
        setTakenAvatars(taken);
        // Auto-select first free avatar
        const free = AVATARS.find(a => !taken.includes(a));
        if (free) setAvatar(free);
      }
    })();
    return () => { cancelled = true; };
  }, [joinCode]);

  const handleCreate = async () => {
    setLoading(true); setError('');
    try {
      const { room } = await createJokesterRoom('Ведущий');
      router.push(`/jokester/host/${room.code}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка создания');
    } finally { setLoading(false); }
  };

  const handleJoin = async () => {
    if (!joinName.trim()) { setError('Введите имя'); return; }
    if (!joinCode.trim()) { setError('Введите код комнаты'); return; }
    if (takenAvatars.includes(avatar)) { setError('Эта аватарка уже занята, выбери другую'); return; }
    setLoading(true); setError('');
    try {
      const { room } = await joinJokesterRoom(joinCode.trim(), joinName.trim(), avatar, 'player');
      router.push(`/jokester/room/${room.code}`);
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'MAX_PLAYERS') {
        setError('Набрано максимальное количество игроков (12)!');
      } else {
        setError(e instanceof Error ? e.message : 'Ошибка подключения');
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#0a1628] text-white overflow-hidden relative">
      {/* Фоновые декоративные круги */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#ffd700]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-48 -right-48 w-[500px] h-[500px] bg-[#1f6ac6]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-10 space-y-8">
        {/* ─── Заголовок 3D CSS ─── */}
        <div className="text-center">
          <h1
            className="text-5xl sm:text-7xl font-black tracking-tight select-none"
            style={{
              color: '#ffffff',
              textShadow: `
                1px 1px 0 #c8a835,
                2px 2px 0 #b89730,
                3px 3px 0 #a8862a,
                4px 4px 0 #987525,
                5px 5px 0 #886420,
                6px 6px 12px rgba(0,0,0,0.4)
              `,
              letterSpacing: '-0.02em',
            }}
          >
            Пошути-кач
          </h1>
        </div>

        {/* ─── Tabs ─── */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => { setTab('create'); setError(''); }}
            className={`px-6 py-3 rounded-2xl font-bold text-sm tracking-wider border-2 transition-all duration-300 ${
              tab === 'create'
                ? 'bg-[#ffd700] text-[#0a1628] border-[#ffd700] shadow-lg shadow-[#ffd700]/20'
                : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'
            }`}
          >
            🎤 Создать комнату
          </button>
          <button
            onClick={() => { setTab('join'); setError(''); }}
            className={`px-6 py-3 rounded-2xl font-bold text-sm tracking-wider border-2 transition-all duration-300 ${
              tab === 'join'
                ? 'bg-[#1f6ac6] text-white border-[#1f6ac6] shadow-lg shadow-[#1f6ac6]/20'
                : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'
            }`}
          >
            🎮 Присоединиться
          </button>
        </div>

        {/* ─── Create ─── */}
        {tab === 'create' && (
          <div className="bg-[#111d33]/80 border-2 border-[#ffd700]/30 rounded-3xl p-6 space-y-5 backdrop-blur-sm animate-[fadeIn_0.3s_ease]">
            <h2 className="text-xl font-black text-[#ffd700]">Создание комнаты</h2>
            <p className="text-sm text-gray-400">Вы станете ведущим этой весёлой битвы шуток! Имя ведущего не требуется.</p>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-4 rounded-xl font-black text-lg bg-[#ffd700] text-[#0a1628] hover:bg-[#ffe44d] active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? '⏳ Создаю...' : '🎤 Создать комнату'}
            </button>
          </div>
        )}

        {/* ─── Join ─── */}
        {tab === 'join' && (
          <div className="bg-[#111d33]/80 border-2 border-[#1f6ac6]/30 rounded-3xl p-6 space-y-5 backdrop-blur-sm animate-[fadeIn_0.3s_ease]">
            <h2 className="text-xl font-black text-[#1f6ac6]">Подключение</h2>

            <input
              type="text"
              placeholder="Код комнаты"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              className="w-full px-4 py-3 rounded-xl bg-[#0d1a30] border-2 border-[#1f6ac6]/40 text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-gray-500 focus:border-[#1f6ac6] focus:outline-none transition"
            />
            <input
              type="text"
              placeholder="Твой никнейм"
              value={joinName}
              onChange={e => setJoinName(e.target.value)}
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl bg-[#0d1a30] border-2 border-[#1f6ac6]/40 text-white placeholder-gray-500 focus:border-[#1f6ac6] focus:outline-none transition"
            />

            {/* Аватарки */}
            <div>
              <p className="text-xs text-gray-400 mb-2 tracking-wider">ВЫБЕРИ АВАТАРКУ</p>
              <div className="grid grid-cols-6 gap-2">
                {AVATARS.map(a => {
                  const taken = takenAvatars.includes(a);
                  const selected = avatar === a;
                  return (
                    <button
                      key={a}
                      onClick={() => !taken && setAvatar(a)}
                      disabled={taken}
                      title={taken ? 'Занята' : a}
                      className={`aspect-square rounded-xl border-2 transition-all overflow-hidden relative ${
                        selected
                          ? 'border-[#ffd700] scale-110 shadow-lg shadow-[#ffd700]/30'
                          : taken
                          ? 'border-gray-700 opacity-40 cursor-not-allowed'
                          : 'border-gray-600 hover:border-gray-400'
                      }`}
                    >
                      <img
                        src={`${AVATAR_BASE}${a}`}
                        alt={a}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      {taken && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-lg">🔒</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full py-4 rounded-xl font-black text-lg bg-[#1f6ac6] text-white hover:bg-[#2a7ad6] active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? '⏳ Подключаюсь...' : '🎮 Войти как игрок'}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-900/40 border-2 border-red-500/50 rounded-2xl px-4 py-3 text-center text-red-300 font-semibold text-sm animate-[fadeIn_0.2s_ease]">
            {error}
          </div>
        )}

        {/* ─── Правила ─── */}
        <div className="bg-[#111d33]/60 border border-gray-700 rounded-3xl p-6 space-y-4 text-sm text-gray-400">
          <h3 className="text-lg font-black text-white">📋 Правила</h3>
          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <span className="bg-[#ffd700] text-[#0a1628] w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0">1</span>
              <p>Отвечай смешно на каверзные вопросы в дуэлях 1 на 1</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="bg-[#ffd700] text-[#0a1628] w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0">2</span>
              <p>Игроки и зрители голосуют за лучший ответ</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="bg-[#ffd700] text-[#0a1628] w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0">3</span>
              <p>3 раунда + финал! Очки удваиваются и утраиваются с каждым раундом</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="bg-[#ffd700] text-[#0a1628] w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0">4</span>
              <p>В финале — два лучших игрока. Побеждает победитель финала!</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
