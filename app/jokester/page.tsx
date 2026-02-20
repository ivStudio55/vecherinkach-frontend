// app/jokester/page.tsx
// Вход в «Пошути-кач»
'use client';

import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createJokesterRoom, joinJokesterRoom, fetchJokesterPlayers, fetchJokesterRoom, jokesterStorage } from '@/lib/jokester/api';
import type { JokesterRole } from '@/lib/jokester/types';

const AVATAR_COUNT = 14;
const AVATARS = Array.from({ length: AVATAR_COUNT }, (_, i) => `${i + 1}.png`);
const AVATAR_BASE = '/audio/sound/Jokester/ava/';

function normalizeAvatarFile(value: string): string {
  const match = value.match(/^ava(\d+)\.png$/i);
  if (match) return `${match[1]}.png`;
  return value;
}

const panelDelayStyle = (value: string): CSSProperties => ({ '--panel-delay': value } as CSSProperties);

export default function JokesterEntryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinRole, setJoinRole] = useState<JokesterRole>('player');
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
      const taken = players
        .filter(p => p.role === 'player' && !p.is_host)
        .map(p => normalizeAvatarFile(p.avatar));
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
    if (joinRole === 'player' && !joinName.trim()) { setError('Введите имя'); return; }
    if (!joinCode.trim()) { setError('Введите код комнаты'); return; }
    if (joinRole === 'player' && takenAvatars.includes(avatar)) { setError('Эта аватарка уже занята, выбери другую'); return; }
    setLoading(true); setError('');
    try {
      const { room } = await joinJokesterRoom(
        joinCode.trim(),
        joinRole === 'player' ? joinName.trim() : '',
        joinRole === 'player' ? avatar : '1.png',
        joinRole,
      );
      if (joinRole === 'spectator') {
        router.push(`/jokester/spectator/${room.code}`);
      } else {
        router.push(`/jokester/room/${room.code}`);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'MAX_PLAYERS') {
        setError('Набрано максимальное количество игроков (12). Войдите как зритель и голосуйте за лучших!');
        setJoinRole('spectator');
      } else if (e instanceof Error && e.message === 'GAME_RUNNING_SPECTATOR_SUGGEST') {
        setError('Игра уже идёт. Присоединяйтесь как зритель — сможете смотреть и голосовать.');
        setJoinRole('spectator');
      } else if (e instanceof Error && e.message === 'AVATAR_TAKEN') {
        setError('Эта аватарка уже занята, выбери другую');
      } else {
        setError(e instanceof Error ? e.message : 'Ошибка подключения');
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#0a1628] text-white overflow-hidden relative">
      {/* Фоновые анимированные слои */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="jokester-blob jokester-blob-1" />
        <div className="jokester-blob jokester-blob-2" />
        <div className="jokester-grid" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-10 space-y-8">
        {/* ─── Заголовок 3D CSS ─── */}
        <div className="text-center">
          <h1 className="text-5xl sm:text-7xl font-black tracking-tight select-none flex justify-center gap-1 flex-wrap">
            {'Пошути-кач'.split('').map((ch, i) => (
              <span
                key={`${ch}-${i}`}
                className="inline-block jokester-letter"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                {ch}
              </span>
            ))}
          </h1>
        </div>

        {/* ─── Tabs ─── */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => { setTab('create'); setError(''); }}
            className={`px-6 py-3 rounded-2xl font-bold text-sm tracking-wider border-2 transition-all duration-300 hover:scale-105 ${
              tab === 'create'
                ? 'bg-[#ffd700] text-[#0a1628] border-[#ffd700] shadow-lg shadow-[#ffd700]/20'
                : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'
            }`}
          >
            🎤 Создать комнату
          </button>
          <button
            onClick={() => { setTab('join'); setError(''); }}
            className={`px-6 py-3 rounded-2xl font-bold text-sm tracking-wider border-2 transition-all duration-300 hover:scale-105 ${
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
          <div
            className="bg-[#111d33]/80 border-2 border-[#ffd700]/30 rounded-3xl p-6 space-y-5 backdrop-blur-sm animate-[fadeIn_0.3s_ease] panel-pulse"
            style={panelDelayStyle('0.08s')}
          >
            <h2 className="text-xl font-black text-[#ffd700]">Создание комнаты</h2>
            <p className="text-sm text-gray-400">Вы станете ведущим этой весёлой битвы шуток! Имя ведущего не требуется.</p>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-4 rounded-xl font-black text-lg bg-[#ffd700] text-[#0a1628] hover:bg-[#ffe44d] active:scale-95 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? '⏳ Создаю...' : '🎤 Создать комнату'}
            </button>
          </div>
        )}

        {/* ─── Join ─── */}
        {tab === 'join' && (
          <div
            className="bg-[#111d33]/80 border-2 border-[#1f6ac6]/30 rounded-3xl p-6 space-y-5 backdrop-blur-sm animate-[fadeIn_0.3s_ease] panel-pulse"
            style={panelDelayStyle('0.12s')}
          >
            <h2 className="text-xl font-black text-[#1f6ac6]">Подключение</h2>

            <div className="flex gap-3">
              <button
                onClick={() => setJoinRole('player')}
                className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all hover:scale-105 ${
                  joinRole === 'player'
                    ? 'bg-[#1f6ac6] border-[#1f6ac6] text-white'
                    : 'bg-transparent border-gray-600 text-gray-400'
                }`}
              >
                🎮 Игрок
              </button>
              <button
                onClick={() => setJoinRole('spectator')}
                className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all hover:scale-105 ${
                  joinRole === 'spectator'
                    ? 'bg-purple-600 border-purple-600 text-white'
                    : 'bg-transparent border-gray-600 text-gray-400'
                }`}
              >
                👀 Зритель
              </button>
            </div>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Код комнаты"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              className="w-full px-4 py-3 rounded-xl bg-[#0d1a30] border-2 border-[#1f6ac6]/40 text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-gray-500 focus:border-[#1f6ac6] focus:outline-none transition"
            />
            {joinRole === 'player' && (
              <input
                type="text"
                placeholder="Твой никнейм"
                value={joinName}
                onChange={e => setJoinName(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 rounded-xl bg-[#0d1a30] border-2 border-[#1f6ac6]/40 text-white placeholder-gray-500 focus:border-[#1f6ac6] focus:outline-none transition"
              />
            )}

            {/* Аватарки */}
            {joinRole === 'player' && (
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
            )}

            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full py-4 rounded-xl font-black text-lg bg-[#1f6ac6] text-white hover:bg-[#2a7ad6] active:scale-95 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? '⏳ Подключаюсь...' : joinRole === 'spectator' ? '👀 Войти как зритель' : '🎮 Войти как игрок'}
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
      <style jsx>{`
        .jokester-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          opacity: 0.6;
          mix-blend-mode: screen;
          animation: jokester-blob-move 22s ease-in-out infinite alternate;
        }
        .jokester-blob-1 {
          width: 420px;
          height: 420px;
          background: radial-gradient(circle at 30% 30%, rgba(255,215,0,0.35), rgba(255,215,0,0));
          top: -120px;
          left: -80px;
          animation-delay: 0s;
        }
        .jokester-blob-2 {
          width: 520px;
          height: 520px;
          background: radial-gradient(circle at 70% 70%, rgba(31,106,198,0.35), rgba(31,106,198,0));
          bottom: -160px;
          right: -120px;
          animation-delay: 4s;
        }
        .jokester-grid {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(255,255,255,0.03), transparent 45%);
          mask-image: radial-gradient(circle at center, rgba(0,0,0,0.6), transparent 70%);
        }
        @keyframes jokester-blob-move {
          0% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(40px, -20px, 0) scale(1.05); }
          100% { transform: translate3d(-30px, 30px, 0) scale(0.95); }
        }
        .jokester-letter {
          color: #fff;
          text-shadow: 2px 2px 0 #c8a835, 4px 4px 0 #b89730, 6px 6px 12px rgba(0,0,0,0.35);
          animation: jokester-letter-bounce 1.4s ease-in-out infinite;
          transform-origin: center bottom;
        }
        @keyframes jokester-letter-bounce {
          0% { transform: translateY(0) scale(1); }
          30% { transform: translateY(-12px) scale(1.05, 0.95) rotate(-1deg); }
          55% { transform: translateY(4px) scale(0.96, 1.06) rotate(1deg); }
          70% { transform: translateY(0) scale(1.02, 0.98); }
          100% { transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
