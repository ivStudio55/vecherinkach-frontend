'use client';

import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { trackGameEvent } from '@/lib/analytics';
import { logError, logEvent } from '@/shared/logic/logger';
import { ComicBackground } from '@/components/ComicBackground';
import { HostRoleNoticeModal } from '@/shared/ui/HostRoleNoticeModal';
import { DEFAULT_PACK_ID, normalizePackId, QUESTION_PACKS, setPacksCache, type PackId, type QuestionPack } from '@/lib/questionPacks';

export default function HostPage() {
  return (
    <Suspense>
      <HostPageInner />
    </Suspense>
  );
}

function HostPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [layoutMode, setLayoutMode] = useState<'default' | 'compact' | 'stacked' | 'mobile'>('default');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [showPromoSection, setShowPromoSection] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoEmail, setPromoEmail] = useState('');
  const [promoValidation, setPromoValidation] = useState<{label: string; isFree: boolean} | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [isRoleNoticeOpen, setIsRoleNoticeOpen] = useState(true);
  const [isAnimationsDisabled, setIsAnimationsDisabled] = useState(false);
  const [isConnectionGuideOpen, setIsConnectionGuideOpen] = useState(false);
  const [packOptions, setPackOptions] = useState(QUESTION_PACKS);
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
      setIsAnimationsDisabled(localStorage.getItem('vecherinkach_animations_disabled') === 'true');
    } catch {
      // ignore
    }

    // Handle ?pack= query param
    const packParam = searchParams.get('pack');
    if (packParam) {
      const pid = normalizePackId(packParam);
      setPackId(pid);
      localStorage.setItem('hostPackId', pid);
    }

    // Load packs from API (include private pack if selected via URL)
    const stored = localStorage.getItem('hostPackId');
    const includeId = packParam || stored || '';
    const packsUrl = includeId ? `/api/packs?include=${encodeURIComponent(includeId)}` : '/api/packs';
    fetch(packsUrl)
      .then(r => r.json())
      .then((data: QuestionPack[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        setPacksCache(data);
        setPackOptions(data.map(p => ({ id: p.id, label: p.label })));
      })
      .catch(() => {});
  }, [searchParams]);

  const toggleAnimations = () => {
    const next = !isAnimationsDisabled;
    setIsAnimationsDisabled(next);
    try {
      localStorage.setItem('vecherinkach_animations_disabled', String(next));
    } catch {
      // ignore
    }
  };

  const cycleLayoutMode = () => {
    setLayoutMode((prev) => {
      const next = prev === 'default' ? 'compact' : prev === 'compact' ? 'stacked' : prev === 'stacked' ? 'mobile' : 'default';
      trackGameEvent('host_layout_mode_change', { from: prev, to: next });
      try {
        localStorage.setItem('hostLayoutMode', next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  const validatePromo = async (code: string) => {
    if (!code.trim()) { setPromoValidation(null); setPromoError(''); return; }
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), game: 'vecherinkach', pack_id: packId }),
      });
      const data = await res.json();
      if (data.valid) {
        setPromoValidation({ label: data.label, isFree: data.final_price === 0 });
        setPromoError('');
      } else {
        setPromoValidation(null);
        setPromoError(data.error || 'Недействительный промокод');
      }
    } catch {
      setPromoError('Ошибка проверки промокода');
    }
  };

  const redeemPromo = async () => {
    if (!promoEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(promoEmail)) {
      setPromoError('Введите корректный email');
      return;
    }
    if (!promoValidation) return;
    setPromoError('');
    setIsRedeeming(true);
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: 'vecherinkach',
          email: promoEmail.trim(),
          pack_id: packId,
          promo_code: promoCode.trim(),
        }),
      });
      const data = await res.json();
      if (data.free && data.orderId) {
        router.push(`/payment/success?orderId=${data.orderId}`);
      } else if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl;
      } else {
        setPromoError(data.error || 'Ошибка при применении промокода');
      }
    } catch {
      setPromoError('Ошибка при применении промокода');
    } finally {
      setIsRedeeming(false);
    }
  };

  const createRoom = async () => {
    setError('');
    setIsCreating(true);
    trackGameEvent('host_create_room_click', { packId });

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
          trackGameEvent('host_create_room_success', {
            packId,
            roomCode,
          });
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
          trackGameEvent('host_create_room_failed', { reason: 'limit_reached', packId });
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
          trackGameEvent('host_create_room_failed', { reason: 'rpc_error', packId });
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
      trackGameEvent('host_create_room_failed', { reason: 'attempts_exceeded', packId });
    } catch (err) {
      console.error('createRoom error:', err);
      trackGameEvent('host_create_room_failed', { reason: 'exception', packId });
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

  const frameStyle: CSSProperties = {
    width: '100%',
    maxWidth: 'min(1400px, calc((100vh - 48px) * 16 / 9))',
  };



  const isMobileLayout = layoutMode === 'mobile';
  const isCompactLayout = layoutMode === 'compact';
  const layoutLabel = layoutMode === 'default' ? 'Desktop' : layoutMode === 'compact' ? 'Compact' : layoutMode === 'stacked' ? 'Stacked' : 'Mobile';

  return (
    <div
      className={`min-h-screen text-[#142a45] relative z-10 ${isCompactLayout ? 'px-3 py-4' : 'px-4 py-6 lg:py-8'} ${
        isMobileLayout ? 'text-[calc(1rem*0.85)]' : ''
      } ${isAnimationsDisabled ? 'disable-animations' : ''}`}
    >
      <ComicBackground />
      <HostRoleNoticeModal
        isOpen={isRoleNoticeOpen}
        onContinue={() => {
          trackGameEvent('host_role_notice_continue');
          setIsRoleNoticeOpen(false);
        }}
        onPlayer={() => {
          trackGameEvent('host_role_notice_player_mode');
          router.push('/join');
        }}
      />
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-center">
        <div
          className="w-full rounded-[32px] border-[3px] border-[#142a45]/20 bg-[#fff6da]/80 px-4 py-4 shadow-[0_25px_80px_rgba(20,42,69,0.25)] backdrop-blur-sm sm:px-6 sm:py-6 lg:px-8"
          style={frameStyle}
        >
          <div className={`flex h-full flex-col ${isCompactLayout ? 'gap-4' : 'gap-6'}`}>
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
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    onClick={toggleAnimations}
                    className={`${isCompactLayout ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} rounded-xl border-2 border-[#ffeccd] text-[#142a45] bg-[#ffeccd] font-bold hover:bg-[#ffeccd]/80 transition`}
                    title="Переключить анимации"
                  >
                    {isAnimationsDisabled ? 'Анимации выкл' : 'Отключить анимации'}
                  </button>
                  <button
                    type="button"
                    onClick={cycleLayoutMode}
                    className={`${isCompactLayout ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} rounded-xl border-2 border-[#ffeccd] text-[#ffeccd] font-bold hover:bg-[#ffeccd]/10 transition`}
                    title="Не нравится текущий вид? Нажмите, чтобы переключить отображение"
                  >
                    Вид: {layoutLabel}
                  </button>
                </div>
              </div>
            </header>

            <section
              className={`flex-1 ${
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
                      trackGameEvent('host_pack_change', { packId: next });
                    }}
                    className={`w-full rounded-2xl border-[3px] border-[#142a45] bg-white ${
                      isCompactLayout ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-base'
                    } font-semibold`}
                  >
                    {packOptions.map((pack) => (
                      <option key={pack.id} value={pack.id}>
                        {pack.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Promo code section */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => { setShowPromoSection(p => !p); setPromoError(''); setPromoValidation(null); setPromoCode(''); setPromoEmail(''); }}
                    className={`${isCompactLayout ? 'text-xs' : 'text-sm'} font-semibold text-[#142a45]/60 hover:text-[#142a45] transition underline underline-offset-4`}
                  >
                    {showPromoSection ? '✕ Скрыть промокод' : '🎟 Есть промокод?'}
                  </button>
                  {showPromoSection && (
                    <div className="rounded-2xl border-[2px] border-[#142a45]/30 bg-[#fff6da] p-4 space-y-3">
                      <p className={`${isCompactLayout ? 'text-xs' : 'text-sm'} font-semibold text-[#142a45]/80`}>
                        Введите промокод, чтобы получить скидку или бесплатный доступ
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="ПРОМОКОД"
                          value={promoCode}
                          onChange={e => {
                            const v = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                            setPromoCode(v);
                            setPromoValidation(null);
                            setPromoError('');
                          }}
                          onBlur={() => validatePromo(promoCode)}
                          maxLength={32}
                          className="flex-1 rounded-xl border-[2px] border-[#142a45] bg-white px-3 py-2 text-sm font-mono font-bold uppercase"
                        />
                        <button
                          type="button"
                          onClick={() => validatePromo(promoCode)}
                          className="px-3 py-2 rounded-xl border-[2px] border-[#142a45] bg-[#142a45] text-[#ffeccd] text-sm font-bold"
                        >
                          Проверить
                        </button>
                      </div>
                      {promoValidation && (
                        <p className={`text-sm font-bold ${promoValidation.isFree ? 'text-green-700' : 'text-blue-700'}`}>
                          ✅ {promoValidation.label}
                        </p>
                      )}
                      {promoError && (
                        <p className="text-sm font-semibold text-red-700">❌ {promoError}</p>
                      )}
                      {promoValidation && (
                        <div className="space-y-2 pt-1">
                          <p className={`${isCompactLayout ? 'text-xs' : 'text-sm'} font-semibold text-[#142a45]/80`}>
                            {promoValidation.isFree ? 'Укажите email — на него придёт ссылка на комнату:' : 'Укажите email для оплаты:'}
                          </p>
                          <input
                            type="email"
                            placeholder="your@email.com"
                            value={promoEmail}
                            onChange={e => setPromoEmail(e.target.value)}
                            className="w-full rounded-xl border-[2px] border-[#142a45] bg-white px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={redeemPromo}
                            disabled={isRedeeming}
                            className={`w-full rounded-xl border-[2px] font-black tracking-[0.1em] py-3 text-sm transition disabled:opacity-40 ${
                              promoValidation.isFree
                                ? 'bg-green-600 border-green-700 text-white hover:bg-green-500'
                                : 'bg-[#142a45] border-[#142a45] text-[#ffeccd]'
                            }`}
                          >
                            {isRedeeming ? 'Обрабатываем...' : promoValidation.isFree ? '🎁 Получить бесплатно →' : '💳 Оплатить со скидкой →'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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
                  onClick={() => {
                    trackGameEvent('host_nav_click', { destination: '/' });
                    router.push('/');
                  }}
                  className={`hover:scale-105 hover:shadow-lg transition-all duration-200 w-full ${
                    isCompactLayout ? 'py-2 text-sm' : 'py-3'
                  } rounded-2xl border-[3px] border-[#142a45] font-semibold bg-white hover:bg-[#fef4dc]`}
                >
                  ← На главную
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/pricing')}
                  className={`hover:scale-105 hover:shadow-lg transition-all duration-200 w-full ${
                    isCompactLayout ? 'py-2 text-sm' : 'py-3'
                  } rounded-2xl border-[3px] border-[#f59e0b] font-semibold bg-[#fffbeb] text-[#92400e] hover:bg-[#fef3c7]`}
                >
                  🛒 Магазин пакетов
                </button>
              </div>

              <div
                className={`rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl ${
                  isCompactLayout ? 'p-4 space-y-4' : 'p-6 space-y-5'
                } relative overflow-hidden animate-host-panel`}
                style={{ animationDelay: '180ms' }}
              >
                <button
                  type="button"
                  onClick={() => setIsConnectionGuideOpen(open => !open)}
                  aria-expanded={isConnectionGuideOpen}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Инструкция по подключению</p>
                    <h2 className={`${isCompactLayout ? 'text-xl' : 'text-2xl'} font-black`}>Ведущий отдельно, игроки с телефонов</h2>
                    <p className={`${isCompactLayout ? 'text-xs' : 'text-sm'} text-[#142a45]/70 line-clamp-1`}>
                      Нажмите, чтобы открыть короткую схему подключения.
                    </p>
                  </div>
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-[3px] border-[#142a45] bg-[#fff6da] font-black transition-transform ${isConnectionGuideOpen ? 'rotate-180' : ''}`}>
                    ↓
                  </span>
                </button>
                <div className={`grid transition-all duration-300 ease-out ${isConnectionGuideOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden space-y-4">
                <div className="space-y-2">
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Инструкция по подключению</p>
                  <h2 className={`${isCompactLayout ? 'text-xl' : 'text-2xl'} font-black`}>Подключайтесь за минуту</h2>
                  <p className={`${isCompactLayout ? 'text-xs' : 'text-sm'} text-[#142a45]/80`}>
                    Экран ведущего открывайте на отдельном устройстве: ноутбуке, телевизоре, проекторе или другом большом экране.
                    На нём будут вопросы, таймеры, результаты и комментарии ведущего; игроки отвечают со своих телефонов.
                  </p>
                </div>
                <div className={`grid ${isMobileLayout ? 'gap-4' : 'gap-6 lg:grid-cols-[1.2fr,0.8fr]'}`}>
                  <ol className={`${isCompactLayout ? 'text-xs' : 'text-sm'} space-y-3 font-semibold text-[#142a45]/80`}>
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">1</span>
                      Ведущий запускает игру на отдельном большом экране, выбирает пакет и создаёт комнату — появятся код и QR для входа.
                    </li>
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">2</span>
                      Игроки открывают vecherinkach.ru/join на своих телефонах, вводят код комнаты и своё имя.
                    </li>
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">3</span>
                      Когда все подключились, ведущий нажимает «Начать игру».
                    </li>
                    <li className="flex gap-3">
                      <span className="w-9 h-9 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">4</span>
                      Нужна помощь или хотите задать вопрос? Пишите в Telegram: @Al_ivStudio — отвечаем быстро.
                    </li>
                  </ol>
                </div>
                <div className={`relative rounded-2xl border-[3px] border-dashed border-[#142a45]/50 bg-[#fff6da] ${
                  isCompactLayout ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'
                }`}>
                  <p className="font-semibold">На связи</p>
                  <p className="text-[#142a45]/70">
                    Контакт для связи: Telegram @Al_ivStudio.
                  </p>
                </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
