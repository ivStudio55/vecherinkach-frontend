"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { createDrawRoom, joinDrawRoom } from '@/lib/draw/api';
import type { DrawGameMode } from '@/lib/draw/types';

export default function DrawPage() {
  const router = useRouter();
  const [hostName, setHostName] = useState('Ведущий');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<DrawGameMode>('russian');

  const handleCreate = async () => {
    setPending(true);
    setError('');
    try {
      const { room } = await createDrawRoom(hostName, mode);
      router.push(`/draw/host/${room.code}`);
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
    <div className="min-h-screen bg-gradient-to-b from-[#1a0a2e] via-[#16213e] to-[#0f3460] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Header */}
        <header className="rounded-3xl border-4 border-white/10 bg-white/5 backdrop-blur p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="uppercase text-xs tracking-[0.4em] text-white/70">мини-игра</p>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">🎨 Рисункач</h1>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold tracking-[0.24em] bg-purple-500/20 border border-purple-400/30 text-purple-300">
              новое
            </span>
          </div>
          <p className="mt-4 text-base text-white/80">
            Рисуй, угадывай и голосуй! Забавные цепочки превращений от слова к рисунку.
            3 раунда с возрастающей сложностью.
          </p>
        </header>

        {/* Rules */}
        <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-6 shadow-xl">
          <h2 className="text-xl font-black mb-4">Как играть?</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-3xl mb-2">🖌️</div>
              <h3 className="font-bold text-sm mb-1">Раунд 1 — Свобода</h3>
              <p className="text-xs text-white/70">Рисуй без ограничений. Получи слово → нарисуй его за 60 секунд.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-3xl mb-2">✌️</div>
              <h3 className="font-bold text-sm mb-1">Раунд 2 — 3 касания</h3>
              <p className="text-xs text-white/70">Всего 3 линии на холсте. Рисуй минимально, но понятно!</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-3xl mb-2">☝️</div>
              <h3 className="font-bold text-sm mb-1">Раунд 3 — 1 касание</h3>
              <p className="text-xs text-white/70">Одна линия! Финальное испытание для настоящих художников.</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-3 text-sm text-yellow-200/80">
            <strong>Баллы:</strong> +50 за правильную догадку, +50 если твой рисунок угадали, +25 за каждый голос.
          </div>
        </section>

        {/* Create / Join */}
        <section className="rounded-3xl border-4 border-white/10 bg-white/5 p-6 sm:p-7 space-y-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="uppercase text-[11px] tracking-[0.32em] text-white/60">онлайн</p>
              <h3 className="text-2xl font-black">Создать или войти в комнату</h3>
            </div>
            {error && <span className="text-sm text-red-300 font-semibold">{error}</span>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Create */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">Создать комнату</p>
                <span className="text-[11px] uppercase tracking-[0.24em] text-white/60">ведущий</span>
              </div>
              <p className="text-xs text-white/50">Запустите игру на большом экране (ТВ, ноутбук) — это экран ведущего.</p>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm focus:outline-none focus:border-purple-400 text-white"
                value={hostName}
                onChange={e => setHostName(e.target.value)}
                placeholder="Имя ведущего"
              />

              {/* Game mode selector */}
              <div className="space-y-2">
                <p className="text-xs text-white/60 font-bold">Режим игры</p>
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
                      className={`rounded-xl border px-2 py-2 text-center transition ${
                        mode === m.value
                          ? 'border-purple-400 bg-purple-400/20 text-purple-300'
                          : 'border-white/20 bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      <span className="text-xs font-bold block">{m.label}</span>
                      <span className="text-[10px] text-white/40">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={pending}
                onClick={handleCreate}
                className="w-full rounded-xl bg-purple-600 text-white font-bold px-4 py-3 text-sm tracking-[0.08em] hover:bg-purple-500 disabled:opacity-60 active:scale-95 transition"
              >
                {pending ? 'Создаём…' : '🎨 Создать комнату'}
              </button>
            </div>

            {/* Join */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">Войти по коду</p>
                <span className="text-[11px] uppercase tracking-[0.24em] text-white/60">игрок</span>
              </div>
              <p className="text-xs text-white/50">Откройте на телефоне — это экран игрока. Введите код с экрана ведущего.</p>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm focus:outline-none focus:border-purple-400 text-white"
                value={joinName}
                onChange={e => setJoinName(e.target.value)}
                placeholder="Ваше имя"
              />
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm uppercase tracking-[0.2em] focus:outline-none focus:border-purple-400 text-white text-center"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                placeholder="Код комнаты"
                maxLength={6}
              />
              <button
                type="button"
                disabled={pending}
                onClick={handleJoin}
                className="w-full rounded-xl bg-white/15 text-white font-bold px-4 py-3 text-sm tracking-[0.08em] border border-white/30 hover:bg-white/25 disabled:opacity-60 active:scale-95 transition"
              >
                {pending ? 'Подключаем…' : 'Войти'}
              </button>
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
        </div>
      </div>
    </div>
  );
}
