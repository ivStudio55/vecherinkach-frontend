"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createUnoRoom, joinUnoRoom } from '@/lib/uno/api';
import type { UnoMode } from '@/lib/uno/types';
import { GameConnectionGuide } from '@/components/GameConnectionGuide';

const modes = [
  {
    id: 'classic' as UnoMode,
    title: 'Классический',
    description: '108 карт, числа 0–9, Skip, Reverse, Draw Two, Wild, Wild +4.',
    bullets: ['Классические правила UNO', 'Мультиплеер Realtime', 'Определение победителя'],
    badge: 'играть',
    badgeColor: 'bg-[#f1362f]',
    borderColor: 'border-[#f1362f]',
    bgActive: 'bg-[#f1362f]/20',
    needsVerbs: false,
  },
  {
    id: 'classic-verbs' as UnoMode,
    title: 'Классика + Глаголы',
    description: 'Классические правила UNO, но на картах с числами дополнительно отображаются неправильные глаголы.',
    bullets: ['108 карт с классическими правилами', 'Неправильные глаголы на картах', 'Учись играя!'],
    badge: 'новинка',
    badgeColor: 'bg-[#10b981]',
    borderColor: 'border-[#10b981]',
    bgActive: 'bg-[#10b981]/20',
    needsVerbs: true,
  },
  {
    id: 'irregular-verbs' as UnoMode,
    title: 'Все формы',
    description: 'Вместо цифр — неправильные глаголы: на карте все 3 формы + перевод. Сопоставление по глаголу.',
    bullets: ['Случайная выборка 15–25 глаголов из 150+', 'На карте все формы сразу', 'Учи глаголы играя!'],
    badge: 'играть',
    badgeColor: 'bg-[#ffd92c]',
    borderColor: 'border-[#ffd92c]',
    bgActive: 'bg-[#ffd92c]/15',
    needsVerbs: true,
  },
  {
    id: 'verb-match' as UnoMode,
    title: 'Угадай глагол',
    description: 'На каждой карте только ОДНО слово: перевод или одна из форм глагола. Надо знать, какие карты одного глагола!',
    bullets: ['1 карта = 1 слово (RU или EN)', 'Совпадение по глаголу = один номинал', 'Самый сложный режим!'],
    badge: 'сложно',
    badgeColor: 'bg-[#a78bfa]',
    borderColor: 'border-[#a78bfa]',
    bgActive: 'bg-[#a78bfa]/15',
    needsVerbs: true,
  },
];

export default function UnoPage() {
  const router = useRouter();
  const [createName, setCreateName] = useState('Ведущий');
  const [createMode, setCreateMode] = useState<UnoMode>('verb-match');
  const [verbCount, setVerbCount] = useState(20);
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('Игрок');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [isAnimationsDisabled, setIsAnimationsDisabled] = useState(false);

  useEffect(() => {
    setIsAnimationsDisabled(localStorage.getItem('vecherinkach_animations_disabled') === 'true');
  }, []);

  const toggleAnimations = () => {
    const next = !isAnimationsDisabled;
    setIsAnimationsDisabled(next);
    localStorage.setItem('vecherinkach_animations_disabled', String(next));
  };

  const selectedMode = modes.find(m => m.id === createMode)!;

  const handleCreate = async () => {
    setPending(true);
    setError('');
    try {
      const { room } = await createUnoRoom({ mode: createMode, verbCount, hostName: createName });
      router.push(`/uno/room/${room.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать комнату');
    } finally {
      setPending(false);
    }
  };

  const handleJoin = async () => {
    setPending(true);
    setError('');
    try {
      const code = joinCode.trim().toUpperCase();
      const { room } = await joinUnoRoom({ code, name: joinName });
      router.push(`/uno/room/${room.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось подключиться');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`min-h-screen comic-bg-dots-blue text-black overflow-hidden relative ${isAnimationsDisabled ? 'disable-animations' : ''}`}>
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] comic-bg-rays-yellow-red rounded-full opacity-30 blur-3xl mix-blend-overlay pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] comic-bg-rays-pink-purple rounded-full opacity-30 blur-3xl mix-blend-overlay pointer-events-none"></div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8 relative z-10">
        {/* Header */}
        <header className="comic-panel bg-white p-6 sm:p-8 relative">
          <div className="absolute -top-6 -right-6 rotate-12 comic-speech-bubble bg-yellow-400 text-black font-black text-xl px-4 py-2 z-20">
            BETA!
          </div>
          <div className="absolute top-4 right-4 z-30 flex">
            <button
              type="button"
              onClick={toggleAnimations}
              className={`comic-button px-4 py-2 text-sm bg-white text-black border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 transition ${isAnimationsDisabled ? 'bg-yellow-300' : ''}`}
            >
              {isAnimationsDisabled ? 'Анимации выкл' : 'Отключить анимации'}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <p className="comic-font-thin text-sm tracking-widest text-gray-500 font-bold">ПОЛНОЦЕННАЯ ИГРА</p>
            <h1 className="comic-font text-5xl sm:text-6xl text-red-500 drop-shadow-[3px_3px_0_#000]">UNO ДЛЯ ВЕЧЕРИНКИ</h1>
          </div>
          <p className="mt-4 text-lg comic-font-thin font-bold text-gray-800">
            Четыре режима: классический, классика+глаголы, «Все формы» и «Угадай глагол». Мультиплеер через Supabase Realtime.
          </p>
        </header>

        <GameConnectionGuide
          gameName="UNO"
          variant="comic"
          hostScreenText="Если играете компанией, откройте комнату на отдельном общем экране, чтобы всем было видно ход партии, очередность и текущую карту."
          playerText="Каждый игрок подключается со своего телефона, вводит код комнаты и играет своими картами на личном экране."
        />

        {/* Mode cards */}
        <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {modes.map((mode, i) => {
            const bgColors = ['bg-yellow-300', 'bg-green-400', 'bg-pink-400', 'bg-purple-400'];
            const cardBg = bgColors[i % bgColors.length];
            return (
              <article
                key={mode.id}
                className={`comic-panel ${cardBg} p-5 flex flex-col gap-4 relative overflow-hidden group hover:-translate-y-2 transition-transform`}
              >
                {/* Decorative halftone overlay */}
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#000_2px,transparent_2.5px)] [background-size:10px_10px] pointer-events-none"></div>
                
                <div className="flex items-start justify-between gap-2 relative z-10">
                  <div className="space-y-1">
                    <p className="comic-font-thin text-xs tracking-widest text-black/70 font-bold">РЕЖИМ</p>
                    <h2 className="comic-font text-3xl text-white drop-shadow-[2px_2px_0_#000]">{mode.title}</h2>
                    <p className="comic-font-thin text-sm text-black/90 font-bold leading-tight">{mode.description}</p>
                  </div>
                </div>
                <ul className="space-y-2 comic-font-thin text-sm text-black font-bold relative z-10 mt-auto">
                  {mode.bullets.map(item => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="text-red-500 drop-shadow-[1px_1px_0_#000]">★</span>
                      <span className="leading-tight">{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>

        {/* Create / Join */}
        <section className="comic-panel bg-white p-6 sm:p-8 space-y-6 relative">
          <div className="absolute -top-5 -left-5 -rotate-6 bg-blue-500 text-white comic-font text-2xl px-4 py-1 border-4 border-black shadow-[4px_4px_0_#000]">
            ИГРАТЬ!
          </div>
          
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div>
              <h3 className="comic-font text-4xl text-blue-600 drop-shadow-[2px_2px_0_#000]">СОЗДАТЬ ИЛИ ВОЙТИ</h3>
            </div>
            {error ? <span className="comic-font-thin text-lg text-red-500 font-bold bg-red-100 px-3 py-1 border-2 border-black">{error}</span> : null}
          </div>
          
          <div className="grid gap-8 md:grid-cols-2">
            {/* Create */}
            <div className="comic-panel bg-yellow-100 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="comic-font text-2xl text-red-500 drop-shadow-[1px_1px_0_#000]">СОЗДАТЬ</p>
                <span className="comic-font-thin text-xs uppercase tracking-widest text-black/50 font-bold">HOST</span>
              </div>
              <div className="space-y-4">
                <input
                  className="w-full comic-panel bg-white px-4 py-3 text-lg comic-font-thin font-bold focus:outline-none focus:ring-4 focus:ring-blue-400"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="ИМЯ ВЕДУЩЕГО"
                />

                {/* Mode selector — 4 options */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {modes.map(m => (
                    <label
                      key={m.id}
                      className={`flex flex-col items-center justify-center gap-1 comic-panel px-2 py-3 cursor-pointer transition-all text-center
                        ${createMode === m.id ? `bg-blue-400 text-white scale-105` : 'bg-white text-black hover:bg-gray-100'}`}
                    >
                      <input
                        type="radio"
                        name="uno-mode"
                        value={m.id}
                        checked={createMode === m.id}
                        onChange={() => setCreateMode(m.id)}
                        className="sr-only"
                      />
                      <span className="comic-font text-lg leading-none drop-shadow-[1px_1px_0_#000]">{m.title}</span>
                    </label>
                  ))}
                </div>

                {selectedMode.needsVerbs && (
                  <div className="flex items-center justify-between gap-3 comic-font-thin font-bold text-lg">
                    <label className="text-black">КОЛ-ВО ГЛАГОЛОВ</label>
                    <input
                      type="number"
                      min={15}
                      max={25}
                      value={verbCount}
                      onChange={e => setVerbCount(Number(e.target.value))}
                      className="w-24 comic-panel bg-white px-3 py-2 text-center"
                    />
                  </div>
                )}

                <button
                  type="button"
                  disabled={pending}
                  onClick={handleCreate}
                  className="w-full comic-button bg-red-500 text-white text-2xl py-4 mt-2"
                >
                  {pending ? 'СОЗДАЁМ...' : 'СОЗДАТЬ КОМНАТУ'}
                </button>
              </div>
            </div>

            {/* Join */}
            <div className="comic-panel bg-blue-100 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="comic-font text-2xl text-blue-600 drop-shadow-[1px_1px_0_#000]">ВОЙТИ ПО КОДУ</p>
                <span className="comic-font-thin text-xs uppercase tracking-widest text-black/50 font-bold">JOIN</span>
              </div>
              <div className="space-y-4">
                <input
                  className="w-full comic-panel bg-white px-4 py-3 text-lg comic-font-thin font-bold focus:outline-none focus:ring-4 focus:ring-yellow-400"
                  value={joinName}
                  onChange={e => setJoinName(e.target.value)}
                  placeholder="ИМЯ ИГРОКА"
                />
                <input
                  className="w-full comic-panel bg-white px-4 py-3 text-2xl comic-font uppercase tracking-widest text-center focus:outline-none focus:ring-4 focus:ring-yellow-400"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  placeholder="КОД КОМНАТЫ"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleJoin}
                  className="w-full comic-button bg-yellow-400 text-black text-2xl py-4 mt-2"
                >
                  {pending ? 'ПОДКЛЮЧАЕМ...' : 'ВОЙТИ В ИГРУ'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-4 justify-center pt-4">
          <Link
            href="/"
            className="comic-button bg-white text-black px-6 py-3 text-xl"
          >
            НА ГЛАВНУЮ
          </Link>
          <Link
            href="/host"
            className="comic-button bg-green-400 text-black px-6 py-3 text-xl"
          >
            К СОЗДАНИЮ КОМНАТЫ
          </Link>
        </div>
      </div>
    </div>
  );
}
