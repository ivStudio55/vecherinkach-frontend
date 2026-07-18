"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { joinDrawRoom } from '@/lib/draw/api';
import type { DrawGameMode } from '@/lib/draw/types';
import ComicBackground from '@/components/draw/ComicBackground';
import { GameConnectionGuide } from '@/components/GameConnectionGuide';

export default function DrawPage() {
  const router = useRouter();
  const [hostName, setHostName] = useState('Ведущий');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<DrawGameMode>('russian');
  const [isAnimationsDisabled, setIsAnimationsDisabled] = useState(false);

  useEffect(() => {
    setIsAnimationsDisabled(localStorage.getItem('vecherinkach_animations_disabled') === 'true');
  }, []);

  const toggleAnimations = () => {
    const next = !isAnimationsDisabled;
    setIsAnimationsDisabled(next);
    localStorage.setItem('vecherinkach_animations_disabled', String(next));
  };

  const handleCreate = async () => {
    router.push('/pricing');
  };

  const handleJoin = async () => {
    setPending(true);
    setError('');
    try {
      const code = joinCode.trim().toUpperCase();
      if (!code) throw new Error('Введите код комнаты');
      const { room } = await joinDrawRoom(code, joinName);
      router.push(`/draw/room/${room.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось подключиться');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`${isAnimationsDisabled ? 'disable-animations' : ''} relative`}>
      <ComicBackground>
        <div className="space-y-8 text-black relative">
          <div className="absolute top-4 right-4 z-50">
            <button
              type="button"
              onClick={toggleAnimations}
              className={`comic-button px-4 py-2 text-sm bg-white text-black border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 transition ${isAnimationsDisabled ? 'bg-yellow-300' : ''}`}
            >
              {isAnimationsDisabled ? 'Анимации выкл' : 'Отключить анимации'}
            </button>
          </div>
        {/* Header */}
        <header className="text-center">
          <div className="inline-block bg-[#FF69B4] border-[4px] border-black px-4 py-1 -rotate-2 mb-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p className="uppercase text-sm font-black tracking-widest text-white">коллекция игр</p>
          </div>
          <h1 className="text-5xl sm:text-7xl font-bangers tracking-wider text-white drop-shadow-[4px_4px_0_#000] mb-4" style={{ WebkitTextStroke: '2px black' }}>
            🎨 РИСУНКАЧ
          </h1>
          <p className="text-lg sm:text-xl font-bold bg-white border-[3px] border-black p-4 rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] inline-block rotate-1">
            Рисуй, угадывай и голосуй! Забавные цепочки превращений от слова к рисунку.
            <br/>3 раунда с возрастающей сложностью.
          </p>
        </header>

        {/* Rules */}
        <section className="bg-[#00BFFF] border-[6px] border-black p-6 sm:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] -rotate-1">
          <h2 className="text-3xl font-bangers tracking-wide text-white mb-6 drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>КАК ИГРАТЬ?</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-white border-[4px] border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-2 transition-transform">
              <div className="text-4xl mb-3">🖌️</div>
              <h3 className="font-black text-lg mb-2 uppercase">Раунд 1 — Свобода</h3>
              <p className="font-bold text-sm">Рисуй без ограничений. Получи слово → нарисуй его за 60 секунд.</p>
            </div>
            <div className="bg-white border-[4px] border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-2 transition-transform">
              <div className="text-4xl mb-3">✌️</div>
              <h3 className="font-black text-lg mb-2 uppercase">Раунд 2 — 3 касания</h3>
              <p className="font-bold text-sm">Всего 3 линии на холсте. Рисуй минимально, но понятно!</p>
            </div>
            <div className="bg-white border-[4px] border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-2 transition-transform">
              <div className="text-4xl mb-3">☝️</div>
              <h3 className="font-black text-lg mb-2 uppercase">Раунд 3 — 1 касание</h3>
              <p className="font-bold text-sm">Одна линия! Финальное испытание для настоящих художников.</p>
            </div>
          </div>
          <div className="mt-6 bg-[#FFD700] border-[4px] border-black p-4 font-bold text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rotate-1">
            <span className="text-xl">⭐ БАЛЛЫ:</span> +50 за правильную догадку, +50 если твой рисунок угадали, +25 за каждый голос.
          </div>
        </section>

        <GameConnectionGuide
          gameName="Рисункач"
          variant="comic"
          hostScreenText="Экран ведущего лучше открыть на отдельном большом устройстве. Там будут видны цепочки рисунков, переходы между раундами, голосование и итоги."
          playerText="Игроки подключаются со своих телефонов, получают слово, рисуют на экране телефона и угадывают рисунки других игроков."
        />

        {/* Create / Join */}
        <section className="bg-[#B266FF] border-[6px] border-black p-6 sm:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rotate-1">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <div className="inline-block bg-white border-[3px] border-black px-3 py-1 -rotate-2 mb-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <p className="uppercase text-xs font-black tracking-widest">онлайн</p>
              </div>
              <h3 className="text-3xl font-bangers tracking-wide text-white drop-shadow-[2px_2px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>СОЗДАТЬ ИЛИ ВОЙТИ</h3>
            </div>
            {error && (
              <div className="bg-white border-[3px] border-black px-4 py-2 rotate-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-red-600 font-black uppercase">{error}</span>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Create Room */}
            <div className="bg-white border-[4px] border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col">
              <h4 className="text-2xl font-bangers tracking-wide mb-4 text-[#FF69B4] drop-shadow-[1px_1px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>СОЗДАТЬ ИГРУ</h4>
              <div className="space-y-4 flex-1">
                <div>
                  <label className="block text-sm font-black uppercase mb-2">Имя ведущего</label>
                  <input
                    type="text"
                    value={hostName}
                    onChange={e => setHostName(e.target.value)}
                    className="w-full bg-gray-100 border-[3px] border-black px-4 py-3 font-bold focus:outline-none focus:bg-white focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
                    placeholder="Ведущий"
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className="block text-sm font-black uppercase mb-2">Режим игры</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'russian' as DrawGameMode, label: '🇷🇺 Русский', desc: 'Слова на русском' },
                      { value: 'english' as DrawGameMode, label: '🇬🇧 English', desc: 'Words in English' },
                      { value: 'free' as DrawGameMode, label: '✏️ Свободный', desc: 'Свои слова' },
                    ]).map(m => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setMode(m.value)}
                        className={`border-[3px] border-black px-2 py-2 text-center transition-all font-bold ${
                          mode === m.value
                            ? 'bg-[#FFD700] shadow-[inset_0px_-4px_0px_0px_rgba(0,0,0,0.2)]'
                            : 'bg-white hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)]'
                        }`}
                      >
                        <span className="text-xs block">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={pending || !hostName.trim()}
                className="mt-6 w-full bg-[#00BFFF] hover:bg-[#0099CC] text-white border-[4px] border-black py-4 text-2xl font-bangers tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTextStroke: '1px black' }}
              >
                {pending ? 'СОЗДАЕМ...' : 'КУПИТЬ ДОСТУП'}
              </button>
            </div>

            {/* Join Room */}
            <div className="bg-white border-[4px] border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col">
              <h4 className="text-2xl font-bangers tracking-wide mb-4 text-[#00BFFF] drop-shadow-[1px_1px_0_#000]" style={{ WebkitTextStroke: '1px black' }}>ПРИСОЕДИНИТЬСЯ</h4>
              <div className="space-y-4 flex-1">
                <div>
                  <label className="block text-sm font-black uppercase mb-2">Код комнаты</label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    className="w-full bg-gray-100 border-[3px] border-black px-4 py-3 font-bold text-center text-2xl tracking-widest uppercase focus:outline-none focus:bg-white focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
                    placeholder="XXXX"
                    maxLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-black uppercase mb-2">Твое имя</label>
                  <input
                    type="text"
                    value={joinName}
                    onChange={e => setJoinName(e.target.value)}
                    className="w-full bg-gray-100 border-[3px] border-black px-4 py-3 font-bold focus:outline-none focus:bg-white focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
                    placeholder="Игрок"
                    maxLength={20}
                  />
                </div>
              </div>
              <button
                onClick={handleJoin}
                disabled={pending || !joinCode.trim() || !joinName.trim()}
                className="mt-6 w-full bg-[#FF69B4] hover:bg-[#FF1493] text-white border-[4px] border-black py-4 text-2xl font-bangers tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTextStroke: '1px black' }}
              >
                {pending ? 'ВХОДИМ...' : 'ВОЙТИ В ИГРУ'}
              </button>
            </div>
          </div>
        </section>

        <div className="text-center pt-4">
          <Link 
            href="/" 
            className="inline-block bg-white border-[3px] border-black px-6 py-3 font-black uppercase hover:bg-gray-100 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
          >
            ← На главную
          </Link>
        </div>
        </div>
      </ComicBackground>
    </div>
  );
}
