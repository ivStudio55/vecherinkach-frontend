// app/creativach/page.tsx
// Вход в «Креативач»
'use client';

import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  createCreativachRoom,
  joinCreativachRoom,
  fetchCreativachPlayers,
  fetchCreativachRoom,
} from '@/lib/creativach/api';
import type { CreativachRole } from '@/lib/creativach/types';

const AVATAR_COUNT = 14;
const AVATARS = Array.from({ length: AVATAR_COUNT }, (_, i) => `${i + 1}.png`);
const YANDEX_AUDIO_BASE = process.env.NEXT_PUBLIC_AUDIO_BASE ?? 'https://storage.yandexcloud.net/vecherinkach/audio';
const AVATAR_BASE = `${YANDEX_AUDIO_BASE}/sound/Jokester/ava/`;

function normalizeAvatarFile(value: string): string {
  const match = value.match(/^ava(\d+)\.png$/i);
  if (match) return `${match[1]}.png`;
  return value;
}

const panelDelayStyle = (value: string): CSSProperties =>
  ({ '--panel-delay': value } as CSSProperties);

export default function CreativachEntryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinRole, setJoinRole] = useState<CreativachRole>('player');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [takenAvatars, setTakenAvatars] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [isBgmMuted, setIsBgmMuted] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isAnimationsDisabled, setIsAnimationsDisabled] = useState(false);

  useEffect(() => {
    setIsBgmMuted(localStorage.getItem('creativach_bgm_muted') === 'true');
    setIsVoiceMuted(localStorage.getItem('creativach_voice_muted') === 'true');
    setIsAnimationsDisabled(localStorage.getItem('creativach_animations_disabled') === 'true');
  }, []);

  useEffect(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) { setTakenAvatars([]); return; }
    let cancelled = false;
    (async () => {
      const room = await fetchCreativachRoom(code);
      if (!room || cancelled) return;
      const players = await fetchCreativachPlayers(room.id);
      const taken = players
        .filter(p => p.role === 'player' && !p.is_host)
        .map(p => normalizeAvatarFile(p.avatar));
      if (!cancelled) {
        setTakenAvatars(taken);
        const free = AVATARS.find(a => !taken.includes(a));
        if (free) setAvatar(free);
      }
    })();
    return () => { cancelled = true; };
  }, [joinCode]);

  const handleCreate = async () => {
    setLoading(true); setError('');
    try {
      const { room } = await createCreativachRoom('Ведущий');
      router.push(`/creativach/host/${room.code}`);
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
      const { room } = await joinCreativachRoom(
        joinCode.trim(),
        joinRole === 'player' ? joinName.trim() : '',
        joinRole === 'player' ? avatar : '1.png',
        joinRole,
      );
      if (joinRole === 'spectator') {
        router.push(`/creativach/spectator/${room.code}`);
      } else {
        router.push(`/creativach/room/${room.code}`);
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
    <div className={`min-h-screen bg-[#FF6B35] text-white overflow-hidden relative ${isAnimationsDisabled ? 'disable-animations' : ''}`}>
      {/* Фоновые анимированные слои */}
      {!isAnimationsDisabled && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="creativach-sunrays" />
        </div>
      )}

      {/* Кнопки управления */}
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => {
            const next = !isBgmMuted;
            setIsBgmMuted(next);
            localStorage.setItem('creativach_bgm_muted', String(next));
          }}
          className={`px-3 py-1 rounded-xl text-xs border-2 transition-transform transition hover:scale-110 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
            isBgmMuted ? 'bg-yellow-400 text-black border-black' : 'bg-white border-black hover:bg-gray-100 text-black'
          }`}
          title="Музыка"
        >🎵</button>
        <button
          onClick={() => {
            const next = !isVoiceMuted;
            setIsVoiceMuted(next);
            localStorage.setItem('creativach_voice_muted', String(next));
          }}
          className={`px-3 py-1 rounded-xl text-xs border-2 transition-transform transition hover:scale-110 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
            isVoiceMuted ? 'bg-yellow-400 text-black border-black' : 'bg-white border-black hover:bg-gray-100 text-black'
          }`}
          title="Голос ведущего"
        >🎤</button>
        <button
          onClick={() => {
            const next = !isAnimationsDisabled;
            setIsAnimationsDisabled(next);
            localStorage.setItem('creativach_animations_disabled', String(next));
          }}
          className={`px-3 py-1 rounded-xl text-xs border-2 transition-transform transition hover:scale-110 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
            isAnimationsDisabled ? 'bg-yellow-400 text-black border-black' : 'bg-white border-black hover:bg-gray-100 text-black'
          }`}
          title="Анимации"
        >✨</button>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-10 space-y-8">
        {/* ─── Заголовок ─── */}
        <div className="text-center">
          <h1 className="text-5xl sm:text-7xl font-black tracking-tight select-none flex justify-center gap-1 flex-wrap drop-shadow-[2px_2px_0_#fff]">
            {'Креативач'.split('').map((ch, i) => (
              <span
                key={`${ch}-${i}`}
                className="inline-block creativach-letter text-black"
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
            className={`px-6 py-3 text-sm tracking-wider ${
              tab === 'create' ? 'cartoon-button' : 'cartoon-panel opacity-70 hover:opacity-100'
            }`}
          >🎤 Создать комнату</button>
          <button
            onClick={() => { setTab('join'); setError(''); }}
            className={`px-6 py-3 text-sm tracking-wider ${
              tab === 'join' ? 'cartoon-button-blue' : 'cartoon-panel opacity-70 hover:opacity-100'
            }`}
          >🎮 Присоединиться</button>
        </div>

        {/* ─── Create ─── */}
        {tab === 'create' && (
          <div className="cartoon-panel p-6 space-y-5 animate-[fadeIn_0.3s_ease] panel-pulse" style={panelDelayStyle('0.08s')}>
            <h2 className="text-2xl font-black text-black">Создание комнаты</h2>
            <p className="text-sm text-gray-700 font-medium">Вы станете ведущим креативной битвы! Создайте хаб для игроков и зрителей!</p>
            <button onClick={handleCreate} disabled={loading} className="w-full py-4 text-lg cartoon-button">
              {loading ? '⏳ Создаю...' : '🎤 Создать комнату'}
            </button>
          </div>
        )}

        {/* ─── Join ─── */}
        {tab === 'join' && (
          <div className="cartoon-panel p-6 space-y-5 animate-[fadeIn_0.3s_ease] panel-pulse" style={panelDelayStyle('0.12s')}>
            <h2 className="text-2xl font-black text-black">Подключение</h2>

            <div className="flex gap-3">
              <button
                onClick={() => setJoinRole('player')}
                className={`flex-1 py-3 ${joinRole === 'player' ? 'cartoon-button-blue' : 'cartoon-panel opacity-70 hover:opacity-100'}`}
              >🎮 Игрок</button>
              <button
                onClick={() => setJoinRole('spectator')}
                className={`flex-1 py-3 ${joinRole === 'spectator' ? 'cartoon-button-purple' : 'cartoon-panel opacity-70 hover:opacity-100'}`}
              >👀 Зритель</button>
            </div>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Код комнаты"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] cartoon-input"
            />

            {joinRole === 'player' && (
              <input
                type="text"
                placeholder="Твой никнейм"
                value={joinName}
                onChange={e => setJoinName(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 text-center text-lg cartoon-input"
              />
            )}

            {joinRole === 'player' && (
              <div>
                <p className="text-xs text-gray-700 font-bold mb-2 tracking-wider text-center">ВЫБЕРИ АВАТАРКУ</p>
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
                        className={`aspect-square rounded-xl border-4 transition-all overflow-hidden relative ${
                          selected
                            ? 'border-black scale-110 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-10'
                            : taken
                            ? 'border-transparent opacity-40 cursor-not-allowed'
                            : 'border-transparent hover:border-black hover:scale-105'
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
              className={`w-full py-4 text-lg ${joinRole === 'spectator' ? 'cartoon-button-purple' : 'cartoon-button-blue'}`}
            >
              {loading ? '⏳ Подключаюсь...' : joinRole === 'spectator' ? '👀 Войти как зритель' : '🎮 Войти как игрок'}
            </button>
          </div>
        )}

        {error && (
          <div className="cartoon-panel !bg-red-100 !border-red-500 px-4 py-3 text-center text-red-600 font-bold text-sm animate-[fadeIn_0.2s_ease]">
            {error}
          </div>
        )}

        {/* ─── На главную ─── */}
        <div className="text-center">
          <a href="/" className="inline-block cartoon-panel px-6 py-3 font-black text-black hover:scale-105 transition-transform">← На главную</a>
        </div>

        {/* ─── Правила ─── */}
        <div className="cartoon-panel p-6 space-y-4 text-sm text-gray-800 font-medium">
          <h3 className="text-xl font-black text-black">📋 Правила</h3>
          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <span className="bg-[#ffd700] text-black border-2 border-black w-8 h-8 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">1</span>
              <p className="mt-1">Креативно выполняй шуточные задания — аббревиатуры, оправдания, анти-рекламу и комплименты</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="bg-[#ffd700] text-black border-2 border-black w-8 h-8 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">2</span>
              <p className="mt-1">Игроки и зрители голосуют за лучший ответ</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="bg-[#ffd700] text-black border-2 border-black w-8 h-8 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">3</span>
              <p className="mt-1">5 раундов! В финале очки удваиваются</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="bg-[#ffd700] text-black border-2 border-black w-8 h-8 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">4</span>
              <p className="mt-1">Побеждает самый креативный! От 4 до 12 игроков</p>
            </div>
          </div>
        </div>

      </div>
      <style jsx>{`
        .creativach-sunrays {
          position: absolute;
          inset: -100%;
          background: repeating-conic-gradient(
            from 0deg,
            #FF6B35 0deg 15deg,
            #E85D2C 15deg 30deg
          );
          animation: spin 120s linear infinite;
          z-index: 0;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .creativach-letter {
          color: #fff;
          text-shadow: 4px 4px 0 #000, 6px 6px 0 #000;
          -webkit-text-stroke: 2px #000;
          animation: creativach-letter-bounce 1.4s ease-in-out infinite;
          transform-origin: center bottom;
        }
        @keyframes creativach-letter-bounce {
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
