'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { logError, logEvent } from '@/shared/logic/logger';
import backTexture from '../img/back2.png';
import { HostRoleNoticeModal } from '@/shared/ui/HostRoleNoticeModal';
import { DEFAULT_PACK_ID, normalizePackId, QUESTION_PACKS, type PackId } from '@/lib/questionPacks';

export default function HostPage() {
  const router = useRouter();
  const [layoutMode, setLayoutMode] = useState<'default' | 'compact' | 'stacked' | 'mobile'>('default');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [isRoleNoticeOpen, setIsRoleNoticeOpen] = useState(true);
  const [packId, setPackId] = useState<PackId>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_PACK_ID;
    }

    const stored = localStorage.getItem('hostPackId');
    return normalizePackId(stored);
  });

  const generateRoomCode = (): string => Math.floor(1000 + Math.random() * 9000).toString();

  useEffect(() => {
    try {
      const storedMode = localStorage.getItem('hostLayoutMode') as 'default' | 'compact' | 'stacked' | 'mobile' | null;
      if (storedMode === 'default' || storedMode === 'compact' || storedMode === 'stacked' || storedMode === 'mobile') {
        setLayoutMode(storedMode);
      }
    } catch {
      // ignore
    }
  }, []);

  const cycleLayoutMode = () => {
    setLayoutMode((prev) => {
      const next = prev === 'default' ? 'compact' : prev === 'compact' ? 'stacked' : prev === 'stacked' ? 'mobile' : 'default';
      try {
        localStorage.setItem('hostLayoutMode', next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  const createRoom = async () => {
    setError('');
    setIsCreating(true);

    localStorage.setItem('hostPackId', packId);

    try {
      let attempts = 0;
      let roomCode = '';

      while (attempts < 10) {
        roomCode = generateRoomCode();

        const { data, error: insertError } = await supabase.rpc('create_room', {
          p_code: roomCode,
          p_pack_id: packId,
        });

        console.log('create_room attempt', { roomCode, packId, data, insertError });

        const created = Array.isArray(data) ? data[0] : data;
        if (!insertError && created?.id) {
          localStorage.setItem('hostRoomId', created.id as string);
          localStorage.setItem('hostRoomCode', roomCode);
          localStorage.setItem('hostPackId', packId);
          router.push(`/host/${created.id}`);
          return;
        }

        const errorMessage = insertError?.message?.toLowerCase() ?? '';
        const isLimitError = errorMessage.includes('limit');
        const isDuplicateError = errorMessage.includes('duplicate') || errorMessage.includes('unique');
        const isFatalError =
          !!insertError &&
          !isDuplicateError &&
          (errorMessage.includes('function') ||
            errorMessage.includes('permission') ||
            errorMessage.includes('rls') ||
            errorMessage.includes('column') ||
            errorMessage.includes('schema') ||
            errorMessage.includes('check constraint'));

        if (isLimitError) {
          logEvent('warn', 'rpc', 'create_room limit reached', {
            roomCode,
            packId,
            error: insertError,
            eventName: 'create_room_limit',
          });
          setError('Достигнут лимит активных комнат. Попробуйте позже.');
          return;
        }

        if (insertError) {
          logEvent('error', 'rpc', 'create_room failed', {
            roomCode,
            packId,
            error: insertError,
            eventName: 'create_room_error',
          });
        }

        if (isFatalError) {
          setError('Серверная ошибка при создании комнаты. Проверьте настройки базы данных.');
          return;
        }

        if (!insertError || isDuplicateError) {
          attempts += 1;
        } else {
          attempts += 1;
        }
      }

      setError('Не удалось создать комнату. Попробуйте ещё раз.');
    } catch (err) {
      console.error('createRoom error:', err);
      logError('rpc', 'create_room threw exception', err, {
        packId,
        eventName: 'create_room_exception',
      });
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Ошибка: ${message}`);
    } finally {
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



  const isMobileLayout = layoutMode === 'mobile';
  const isCompactLayout = layoutMode === 'compact';
  const layoutLabel = layoutMode === 'default' ? 'Desktop' : layoutMode === 'compact' ? 'Compact' : layoutMode === 'stacked' ? 'Stacked' : 'Mobile';

  return (
    <div
      className={`min-h-screen bg-[#fef4dc] text-[#142a45] ${isCompactLayout ? 'px-3 py-4' : 'px-4 py-6 lg:py-8'} ${
        isMobileLayout ? 'text-[calc(1rem*0.85)]' : ''
      }`}
      style={backgroundStyle}
    >
      <HostRoleNoticeModal
        isOpen={isRoleNoticeOpen}
        onContinue={() => setIsRoleNoticeOpen(false)}
        onPlayer={() => router.push('/join')}
      />
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-center">
        <div
          className="w-full rounded-[32px] border-[3px] border-[#142a45]/20 bg-[#fff6da]/80 px-4 py-4 shadow-[0_25px_80px_rgba(20,42,69,0.25)] backdrop-blur-sm sm:px-6 sm:py-6 lg:px-8"
          style={frameStyle}
        >
          <div className={`flex h-full flex-col ${isCompactLayout ? 'gap-4' : 'gap-6'} overflow-hidden`}>
            <header className={`retro-panel bg-[#142a45] text-[#ffeccd] ${isCompactLayout ? 'px-4 py-4' : 'px-6 py-5'} shrink-0`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/70">Ведущая станция</p>
                  <h1 className={`${isCompactLayout ? 'text-2xl' : 'text-3xl sm:text-4xl'} font-black leading-tight`}>
                    Создайте комнату и берите управление в свои руки
                  </h1>
                  <p className={`${isCompactLayout ? 'text-xs' : 'text-sm'} text-[#ffeccd]/70 mt-2`}>
                    После создания комнаты вы получите код из четырёх цифр. Им можно делиться на экране или голосом.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cycleLayoutMode}
                  className={`${isCompactLayout ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} rounded-xl border-2 border-[#ffeccd] text-[#ffeccd] font-bold hover:bg-[#ffeccd]/10 transition`}
                  title="Не нравится текущий вид? Нажмите, чтобы переключить отображение"
                >
                  Вид: {layoutLabel}
                </button>
              </div>
            </header>

            <section
              className={`min-h-0 flex-1 overflow-auto ${
                isMobileLayout ? 'flex flex-col gap-4' : 'grid gap-6 lg:grid-cols-[1.1fr,0.9fr]'
              }`}
            >
              <div
                className={`rounded-3xl border-[4px] border-[#142a45] bg-[#ffe184] ${
                  isCompactLayout ? 'p-4 space-y-4' : 'p-6 space-y-5'
                } animate-host-panel`}
                style={{ animationDelay: '60ms' }}
              >
                <div className="space-y-2">
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Создание комнаты</p>
                  <h2 className={`${isCompactLayout ? 'text-xl' : 'text-2xl'} font-black`}>Управление запуском</h2>
                  <p className={`${isCompactLayout ? 'text-xs' : 'text-sm'} text-[#142a45]/80`}>Одним нажатием вы запускаете новый сеанс игры и бронируете код за собой.</p>
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
                    className={`w-full rounded-2xl border-[3px] border-[#142a45] bg-white ${
                      isCompactLayout ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-base'
                    } font-semibold`}
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
                  className={`hover:scale-105 hover:shadow-lg transition-all duration-200 w-full ${
                    isCompactLayout ? 'py-3 text-base' : 'py-4 text-xl'
                  } rounded-2xl font-black tracking-[0.2em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45] disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {isCreating ? 'Создаём комнату…' : '🎮 Создать комнату'}
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className={`hover:scale-105 hover:shadow-lg transition-all duration-200 w-full ${
                    isCompactLayout ? 'py-2 text-sm' : 'py-3'
                  } rounded-2xl border-[3px] border-[#142a45] font-semibold bg-white hover:bg-[#fef4dc]`}
                >
                  ← На главную
                </button>
              </div>

              <div
                className={`rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl ${
                  isCompactLayout ? 'p-4 space-y-4' : 'p-6 space-y-5'
                } relative overflow-hidden animate-host-panel`}
                style={{ animationDelay: '180ms' }}
              >
                <div className="space-y-2">
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Инструкция по подключению</p>
                  <h2 className={`${isCompactLayout ? 'text-xl' : 'text-2xl'} font-black`}>Подключайтесь за минуту</h2>
                  <p className={`${isCompactLayout ? 'text-xs' : 'text-sm'} text-[#142a45]/80`}>
                    Экран ведущего обязательно открывайте на большом экране и в горизонтальной ориентации — на телефоне выглядит ужасно.
                  </p>
                </div>
                <div className={`grid ${isMobileLayout ? 'gap-4' : 'gap-6 lg:grid-cols-[1.2fr,0.8fr]'}`}>
                  <ol className={`${isCompactLayout ? 'text-xs' : 'text-sm'} space-y-3 font-semibold text-[#142a45]/80`}>
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
                  <div className={`grid gap-4 ${isMobileLayout ? 'grid-cols-1' : 'sm:grid-cols-3'}`}>
                    <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-white p-3 text-center">
                      <p className="text-xs font-semibold text-[#142a45]/70">Telegram</p>
                      <img
                        src="/qr-code_telegram.png"
                        alt="QR код Telegram"
                        className={`mx-auto mt-2 ${isMobileLayout ? 'h-28 w-28' : 'h-36 w-36'} rounded-xl border-[2px] border-[#142a45]/20 bg-white`}
                      />
                      <a
                        href="https://t.me/vecherinkach"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs font-semibold text-[#142a45] underline underline-offset-4"
                      >
                        t.me/vecherinkach
                      </a>
                    </div>
                    <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-white p-3 text-center">
                      <p className="text-xs font-semibold text-[#142a45]/70">Join</p>
                      <img
                        src="/qr-code.png"
                        alt="QR код для подключения"
                        className={`mx-auto mt-2 ${isMobileLayout ? 'h-28 w-28' : 'h-36 w-36'} rounded-xl border-[2px] border-[#142a45]/20 bg-white`}
                      />
                    </div>
                    <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-white p-3 text-center">
                      <p className="text-xs font-semibold text-[#142a45]/70">VK</p>
                      <img
                        src="/qr-code_VK.png"
                        alt="QR код VK"
                        className={`mx-auto mt-2 ${isMobileLayout ? 'h-28 w-28' : 'h-36 w-36'} rounded-xl border-[2px] border-[#142a45]/20 bg-white`}
                      />
                      <a
                        href="https://vk.com/vecherinkach"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs font-semibold text-[#142a45] underline underline-offset-4"
                      >
                        vk.com/vecherinkach
                      </a>
                    </div>
                  </div>
                </div>
                <div className={`relative rounded-2xl border-[3px] border-dashed border-[#142a45]/50 bg-[#fff6da] ${
                  isCompactLayout ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'
                }`}>
                  <p className="font-semibold">На связи</p>
                  <p className="text-[#142a45]/70">
                    Подписывайтесь на канал в Telegram и сообщество ВК — там новости, обновления пакетов и быстрые ответы на вопросы.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
