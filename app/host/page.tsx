'use client';

import { useMemo, useState, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import backTexture from '../img/back2.png';
import { DuckSprite } from '@/components/DuckSprite';

export default function HostPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const generateRoomCode = (): string => Math.floor(1000 + Math.random() * 9000).toString();

  const createRoom = async () => {
    setError('');
    setIsCreating(true);

    try {
      let attempts = 0;
      let roomCode = '';

      while (attempts < 10) {
        roomCode = generateRoomCode();

        const { data, error: insertError } = await supabase
          .from('rooms')
          .insert({
            code: roomCode,
            current_question_index: 0,
            is_active: true,
            status: 'waiting',
            question_started_at: null,
          })
          .select()
          .single();

        if (!insertError && data) {
          localStorage.setItem('hostRoomId', data.id);
          localStorage.setItem('hostRoomCode', roomCode);
          router.push(`/host/${data.id}`);
          return;
        }

        attempts += 1;
      }

      setError('Не удалось создать комнату. Попробуйте ещё раз.');
      setIsCreating(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Ошибка: ${message}`);
      setIsCreating(false);
    }
  };

  const backgroundStyle: CSSProperties = {
    backgroundImage: `url(${backTexture.src})`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
  };

  const frameStyle: CSSProperties = {
    width: '100%',
    maxWidth: 'min(1400px, calc((100vh - 48px) * 16 / 9))',
    maxHeight: 'min(calc(100vh - 48px), calc(100vw * 9 / 16))',
  };

  const ducks = useMemo(
    () => [
      { variant: 1 as const, drift: 1 as const, size: 74, delayMs: 200, style: { left: '8%', top: '12%' } },
      { variant: 2 as const, drift: 2 as const, size: 68, delayMs: 1200, style: { right: '6%', top: '18%' } },
      { variant: 3 as const, drift: 3 as const, size: 80, delayMs: 2100, style: { left: '12%', bottom: '16%' } },
      { variant: 4 as const, drift: 4 as const, size: 72, delayMs: 3000, style: { right: '10%', bottom: '18%' } },
      { variant: 5 as const, drift: 5 as const, size: 64, delayMs: 3600, style: { left: '45%', top: '8%' } },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-6 lg:py-8" style={backgroundStyle}>
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-center">
        <div
          className="w-full rounded-[32px] border-[3px] border-[#142a45]/20 bg-[#fff6da]/80 px-4 py-4 shadow-[0_25px_80px_rgba(20,42,69,0.25)] backdrop-blur-sm sm:px-6 sm:py-6 lg:px-8"
          style={frameStyle}
        >
          <div className="flex h-full flex-col gap-6 overflow-hidden">
            <header className="retro-panel bg-[#142a45] text-[#ffeccd] px-6 py-5 shrink-0">
              <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/70">Ведущая станция</p>
              <h1 className="text-3xl sm:text-4xl font-black leading-tight">Создайте комнату и берите управление в свои руки</h1>
              <p className="text-sm text-[#ffeccd]/70 mt-2">
                После создания комнаты вы получите код из четырёх цифр. Им можно делиться на экране или голосом.
              </p>
            </header>

            <section className="grid min-h-0 flex-1 gap-6 overflow-auto lg:grid-cols-[1.1fr,0.9fr]">
              <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-5 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none select-none opacity-95">
                  {ducks.map((duck, idx) => (
                    <DuckSprite
                      key={idx}
                      variant={duck.variant}
                      drift={duck.drift}
                      size={duck.size}
                      delayMs={duck.delayMs}
                      className="absolute duck-pop"
                      style={duck.style}
                    />
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Шаги подключения</p>
                  <h2 className="text-2xl font-black">Как проходит запуск</h2>
                </div>
                <div className="flex gap-6">
                  <ol className="flex-1 space-y-3 text-sm font-semibold text-[#142a45]/80">
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">1</span>
                      Вы получаете код комнаты и выводите его на экран.
                    </li>
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">2</span>
                      Игроки переходят на экран подключения.
                    </li>
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">3</span>
                      Панель ведущего показывает таймеры, вопросы и очередь ответов.
                    </li>
                  </ol>
                  <div className="flex-shrink-0">
                    <img src="/qr-code.png" alt="QR код для подключения" className="w-32 h-32" />
                  </div>
                </div>
                <div className="rounded-2xl border-[3px] border-dashed border-[#142a45]/50 bg-[#fff6da] px-4 py-3 text-sm">
                  <p className="font-semibold">Подсказка</p>
                  <p className="text-[#142a45]/70">Комната активна, пока вы не завершите раунд на панели. Повторное использование кода невозможно.</p>
                </div>
              </div>

              <div className="rounded-3xl border-[4px] border-[#142a45] bg-[#ffe184] p-6 space-y-5">
                <div className="space-y-2">
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Создание комнаты</p>
                  <h2 className="text-2xl font-black">Управление запуском</h2>
                  <p className="text-sm text-[#142a45]/80">Одним нажатием вы запускаете новый сеанс игры и бронируете код за собой.</p>
                </div>

                {error && (
                  <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
                    {error}
                  </div>
                )}

                <button
                  onClick={createRoom}
                  disabled={isCreating}
                  className="hover:scale-105 hover:shadow-lg transition-all duration-200 w-full py-4 rounded-2xl font-black text-xl tracking-[0.2em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isCreating ? 'Создаём комнату…' : '🎮 Создать комнату'}
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="hover:scale-105 hover:shadow-lg transition-all duration-200 w-full py-3 rounded-2xl border-[3px] border-[#142a45] font-semibold bg-white hover:bg-[#fef4dc]"
                >
                  ← На главную
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
