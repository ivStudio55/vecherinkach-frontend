"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { createUnoRoom, joinUnoRoom } from '@/lib/uno/api';
import type { UnoMode } from '@/lib/uno/types';

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
    badge: 'новинка',
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
    <div className="min-h-screen bg-gradient-to-b from-[#0d1117] via-[#0b1224] to-[#0d1117] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Header */}
        <header className="rounded-3xl border-4 border-white/10 bg-[#141a2b]/80 backdrop-blur p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="uppercase text-xs tracking-[0.4em] text-white/70">мини-игра</p>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">UNO для вечеринки</h1>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold tracking-[0.24em] bg-white/10 border border-white/20">beta</span>
          </div>
          <p className="mt-4 text-base text-white/80">
            Три режима: классический, «Все формы» и «Угадай глагол». Мультиплеер через Supabase Realtime.
          </p>
        </header>

        {/* Mode cards */}
        <section className="grid gap-4 md:grid-cols-3">
          {modes.map(mode => (
            <article
              key={mode.id}
              className={`rounded-3xl border-4 border-white/10 bg-white/5 p-5 shadow-xl flex flex-col gap-3`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="uppercase text-[11px] tracking-[0.32em] text-white/60">режим</p>
                  <h2 className="text-xl font-black">{mode.title}</h2>
                  <p className="text-xs text-white/70 leading-relaxed">{mode.description}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.18em] ${mode.badgeColor} text-black border border-white/30`}>{mode.badge}</span>
              </div>
              <ul className="space-y-1.5 text-xs text-white/75">
                {mode.bullets.map(item => (
                  <li key={item} className="flex items-start gap-1.5">
                    <span aria-hidden="true">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        {/* Create / Join */}
        <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-6 sm:p-7 space-y-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="uppercase text-[11px] tracking-[0.32em] text-white/60">онлайн</p>
              <h3 className="text-2xl font-black">Создать или войти в комнату</h3>
            </div>
            {error ? <span className="text-sm text-[#ffb4b4] font-semibold">{error}</span> : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Create */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">Создать</p>
                <span className="text-[11px] uppercase tracking-[0.24em] text-white/60">host</span>
              </div>
              <div className="space-y-3">
                <input
                  className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm focus:outline-none focus:border-white"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="Имя ведущего"
                />

                {/* Mode selector — 3 options */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {modes.map(m => (
                    <label
                      key={m.id}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 cursor-pointer transition-all text-center
                        ${createMode === m.id ? `${m.borderColor} ${m.bgActive}` : 'border-white/20 bg-white/5'}`}
                    >
                      <input
                        type="radio"
                        name="uno-mode"
                        value={m.id}
                        checked={createMode === m.id}
                        onChange={() => setCreateMode(m.id)}
                        className="sr-only"
                      />
                      <span className="font-bold leading-tight">{m.title}</span>
                    </label>
                  ))}
                </div>

                {selectedMode.needsVerbs && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <label className="text-white/80">Кол-во глаголов</label>
                    <input
                      type="number"
                      min={15}
                      max={25}
                      value={verbCount}
                      onChange={e => setVerbCount(Number(e.target.value))}
                      className="w-24 rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-right"
                    />
                  </div>
                )}

                <button
                  type="button"
                  disabled={pending}
                  onClick={handleCreate}
                  className="w-full rounded-xl bg-[#f1362f] text-black font-bold px-4 py-3 text-sm tracking-[0.08em] hover:brightness-95 disabled:opacity-60"
                >
                  {pending ? 'Создаём…' : 'Создать комнату UNO'}
                </button>
              </div>
            </div>

            {/* Join */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">Войти по коду</p>
                <span className="text-[11px] uppercase tracking-[0.24em] text-white/60">join</span>
              </div>
              <div className="space-y-3">
                <input
                  className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm focus:outline-none focus:border-white"
                  value={joinName}
                  onChange={e => setJoinName(e.target.value)}
                  placeholder="Имя игрока"
                />
                <input
                  className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm uppercase tracking-[0.2em] focus:outline-none focus:border-white"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  placeholder="Код комнаты"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleJoin}
                  className="w-full rounded-xl bg-white/15 text-white font-bold px-4 py-3 text-sm tracking-[0.08em] border border-white/30 hover:bg-white/25 disabled:opacity-60"
                >
                  {pending ? 'Подключаем…' : 'Войти'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link
            href="/"
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 hover:bg-white/20 transition-colors"
          >
            ← Вернуться на главную
          </Link>
          <Link
            href="/host"
            className="rounded-2xl border border-[#f1362f] bg-[#f1362f] px-4 py-2 text-black hover:brightness-95 transition-colors"
          >
            Перейти к созданию комнаты
          </Link>
        </div>
      </div>
    </div>
  );
}
  );
}
