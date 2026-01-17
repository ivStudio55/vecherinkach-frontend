'use client';

import { useState, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import backTexture from '../img/back2.png';
import { PlayerPrinter } from '@/components/PlayerPrinter';
import { DEFAULT_PACK_ID, normalizePackId, QUESTION_PACKS, type PackId } from '@/lib/questionPacks';

export default function HostPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [packId, setPackId] = useState<PackId>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_PACK_ID;
    }

    const stored = localStorage.getItem('hostPackId');
    return normalizePackId(stored);
  });

  const generateRoomCode = (): string => Math.floor(1000 + Math.random() * 9000).toString();

  const createRoom = async () => {
    setError('');
    setIsCreating(true);

    localStorage.setItem('hostPackId', packId);

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
            pack_id: packId,
          })
          .select()
          .single();

        if (!insertError && data) {
          localStorage.setItem('hostRoomId', data.id);
          localStorage.setItem('hostRoomCode', roomCode);
          localStorage.setItem('hostPackId', packId);
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
              <div
                className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-5 relative overflow-hidden animate-host-panel"
                style={{ animationDelay: '60ms' }}
              >
                <div className="space-y-2">
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Инструкция по подключению</p>
                  <h2 className="text-2xl font-black">Подключайтесь за минуту</h2>
                  <p className="text-sm text-[#142a45]/80">
                    Экран ведущего обязательно открывайте на большом экране и в горизонтальной ориентации — на телефоне выглядит ужасно.
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
                  <ol className="space-y-3 text-sm font-semibold text-[#142a45]/80">
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">1</span>
                      Ведущий запускает игру на большом экране, выбирает пакет и создаёт комнату — появятся код и QR для входа.
                    </li>
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">2</span>
                      Игроки открывают vecherinkach.vercel.app/join на телефонах, вводят код комнаты и своё имя.
                    </li>
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">3</span>
                      Когда все подключились, ведущий нажимает «Начать игру».
                    </li>
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">4</span>
                      Нужна помощь? Пишите в наш Telegram: t.me/vecherinkach и в VK: vk.com/vecherinkach — отвечаем быстро.
                    </li>
                  </ol>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-white p-3 text-center">
                      <p className="text-xs font-semibold text-[#142a45]/70">Telegram</p>
                      <img
                        src="/qr-code_telegram.png"
                        alt="QR код Telegram"
                        className="mx-auto mt-2 h-36 w-36 rounded-xl border-[2px] border-[#142a45]/20 bg-white"
                      />
                    </div>
                    <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-white p-3 text-center">
                      <p className="text-xs font-semibold text-[#142a45]/70">VK</p>
                      <img
                        src="/qr-code_VK.png"
                        alt="QR код VK"
                        className="mx-auto mt-2 h-36 w-36 rounded-xl border-[2px] border-[#142a45]/20 bg-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="relative rounded-2xl border-[3px] border-dashed border-[#142a45]/50 bg-[#fff6da] px-4 py-3 text-sm">
                  <p className="font-semibold">На связи</p>
                  <p className="text-[#142a45]/70">
                    Подписывайтесь на канал в Telegram и сообщество ВК — там новости, обновления пакетов и быстрые ответы на вопросы.
                  </p>
                </div>
              </div>

              <div
                className="rounded-3xl border-[4px] border-[#142a45] bg-[#ffe184] p-6 space-y-5 animate-host-panel"
                style={{ animationDelay: '180ms' }}
              >
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

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#142a45]/80">Пакет вопросов</p>
                  <select
                    value={packId}
                    onChange={(e) => {
                      const next = normalizePackId(e.target.value);
                      setPackId(next);
                      localStorage.setItem('hostPackId', next);
                    }}
                    className="w-full rounded-2xl border-[3px] border-[#142a45] bg-white px-4 py-3 text-base font-semibold"
                  >
                    {QUESTION_PACKS.map((pack) => (
                      <option key={pack.id} value={pack.id}>
                        {pack.label}
                      </option>
                    ))}
                  </select>
                </div>

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
