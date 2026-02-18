// app/page.tsx
'use client';

import { useEffect, useRef, useState, useCallback, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import backTexture from './img/back.png';
import { supabase } from '../src/lib/supabase';
import { normalizePackId, type PackId } from '@/lib/questionPacks';

export default function HomePage() {
  const router = useRouter();
  const [cardsVisible, setCardsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [panelStage, setPanelStage] = useState<0 | 1 | 2 | 3>(0);
  const panelTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayAttemptedRef = useRef(false);
  const [roomsToday, setRoomsToday] = useState(0);
  const [playersToday, setPlayersToday] = useState(0);

  const packCards: Array<{ id: PackId; title: string; description: string; badge?: string }> = [
    {
      id: 'classic',
      title: 'Классический',
      description: 'Оригинальный пакет вопросов.',
    },
    {
      id: '03012026',
      title: 'Пакет от 16.01.2026',
      description: 'Свежий пакет вопросов',
      badge: 'бесплатно',
    },
  ];

  const miniGames: Array<{
    id: 'uno' | 'risunkach' | 'jokester' | 'placeholder';
    title: string;
    subtitle: string;
    description: string;
    badge?: string;
    isSoon?: boolean;
  }> = [
    {
      id: 'uno',
      title: 'UNO',
      subtitle: 'Карточная мини-игра',
      description: 'Два режима: классический и неправильные глаголы (TTS позже).',
      badge: 'новое',
    },
    {
      id: 'risunkach',
      title: 'Рисункач',
      subtitle: 'Мини-игра на рисунки',
      description: 'Рисуй, угадывай, голосуй! 3 раунда цепочек превращений.',
      badge: 'новое',
    },
    {
      id: 'jokester',
      title: 'Пошути-кач',
      subtitle: 'Битва юмора',
      description: 'Дуэли шуток! Отвечай смешно на каверзные вопросы, голосуй и побеждай.',
      badge: 'тестирование',
    },
    {
      id: 'placeholder',
      title: '???',
      subtitle: 'Скоро',
      description: 'Разработчик думает, что бы сюда ещё влепить... 🤔',
      isSoon: true,
    },
  ];

  const choosePackAndGoHost = (nextPackId: PackId) => {
    localStorage.setItem('hostPackId', nextPackId);
    navigateWithExit(() => router.push('/host'));
  };

  const handleMiniGameClick = (gameId: 'uno' | 'risunkach' | 'jokester' | 'placeholder') => {
    if (gameId === 'uno') {
      navigateWithExit(() => router.push('/uno'));
    } else if (gameId === 'risunkach') {
      navigateWithExit(() => router.push('/draw'));
    } else if (gameId === 'jokester') {
      navigateWithExit(() => router.push('/jokester'));
    }
  };

  const handleUserInteraction = () => {
    if (!hasUserInteracted) {
      setHasUserInteracted(true);
    }
  };

  const [buttonAnimating, setButtonAnimating] = useState(false);
  const meetAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isMeetPlaying, setIsMeetPlaying] = useState(false);

  const fadeVolume = (audio: HTMLAudioElement, targetVolume: number, duration: number) => {
    const startVolume = audio.volume;
    const volumeDiff = targetVolume - startVolume;
    const steps = 50; // количество шагов для плавности
    const stepDuration = duration / steps;
    let currentStep = 0;

    const fadeStep = () => {
      currentStep++;
      const progress = currentStep / steps;
      audio.volume = startVolume + volumeDiff * progress;

      if (currentStep < steps) {
        setTimeout(fadeStep, stepDuration);
      }
    };

    fadeStep();
  };

  const playRandomMeet = () => {
    const meetFiles = ['1.mp3', '2.mp3', '3.mp3', '4.mp3'];
    const randomFile = meetFiles[Math.floor(Math.random() * meetFiles.length)];
    const audio = new Audio(`/audio/meet1/${randomFile}`);
    audio.volume = 0.6;
    meetAudioRef.current = audio;
    setIsMeetPlaying(true);

    // Приглушить основную музыку
    const jingleAudio = audioRef.current;
    if (jingleAudio) {
      const originalVolume = jingleAudio.volume;
      fadeVolume(jingleAudio, originalVolume * 0.4, 1000); // 60% тише за 1 секунду

      // Вернуть громкость когда meet закончится
      audio.onended = () => {
        fadeVolume(jingleAudio, originalVolume, 1000);
        setIsMeetPlaying(false);
      };
    } else {
      audio.onended = () => setIsMeetPlaying(false);
    }

    audio.play().catch(err => {
      console.error('Meet audio play error:', err);
      setIsMeetPlaying(false);
    });
  };

  const handleStart = () => {
    setButtonAnimating(true);
    setTimeout(() => {
      setHasStarted(true);
      setPanelStage(0);
      setCardsVisible(false);
      handleToggleSound();
      setButtonAnimating(false);
    }, 600); // Длительность анимации кнопки
  };

  const stopAudio = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    setIsSoundOn(false);
    setAudioError('');
  };

  const tryAutoPlay = useCallback(async (audio: HTMLAudioElement) => {
    if (autoPlayAttemptedRef.current) {
      return;
    }

    autoPlayAttemptedRef.current = true;
    audio.muted = true;
    const previousVolume = audio.volume;
    audio.volume = 0;

    try {
      await audio.play();
      audio.muted = false;
      audio.volume = previousVolume || 0.45;
      setIsSoundOn(true);
      setAudioError('');
    } catch (err) {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = previousVolume || 0.45;
      const message = err instanceof Error ? err.message : 'Нажмите кнопку, чтобы включить музыку';
      setAudioError(message);
    }
  }, []);

  const navigateWithExit = (callback: () => void) => {
    if (isExiting) {
      return;
    }
    setIsExiting(true);
    setCardsVisible(false);
    stopAudio();
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
    }
    exitTimeoutRef.current = setTimeout(() => {
      callback();
    }, 350);
  };

  useEffect(() => {
    panelTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    panelTimeoutsRef.current = [];

    if (!hasStarted) {
      setPanelStage(0);
      setCardsVisible(false);
      return;
    }

    setPanelStage(0);
    setCardsVisible(false);

    // Ступенчатое появление панелей после нажатия "НАЧАТЬ ВЕСЕЛУХУ"
    panelTimeoutsRef.current.push(
      setTimeout(() => setPanelStage(3), 30),
      setTimeout(() => setCardsVisible(true), 330),
    );

    return () => {
      panelTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      panelTimeoutsRef.current = [];
    };
  }, [hasStarted]);

  const panelEnterClass = (isVisible: boolean) =>
    `transition-all duration-700 ease-out transform ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'}`;

  const panelEnterStyle = (isVisible: boolean, delayMs: number): CSSProperties => ({
    transitionDelay: isVisible ? `${delayMs}ms` : '0ms',
  });

  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const audio = new Audio('/audio/sound/jingle-main.mp3');
    audio.loop = true;
    audio.volume = 0.45;
    audioRef.current = audio;

    if (hasUserInteracted) {
      const autoPlayTimer = window.setTimeout(() => {
        tryAutoPlay(audio);
      }, 0);
      return () => {
        clearTimeout(autoPlayTimer);
        audio.pause();
        audioRef.current = null;
      };
    }

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [tryAutoPlay, hasUserInteracted]);

  const handleToggleSound = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    setAudioError('');

    if (isSoundOn) {
      stopAudio();
      return;
    }

    try {
      await audio.play();
      setIsSoundOn(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Нужен жест пользователя, чтобы запустить аудио';
      setAudioError(message);
    }
  };

  const playersCountLabel = cardsVisible ? '4/8' : '0/8';
  const roomCodeDisplay = cardsVisible ? 'CTRL' : '____';

  const EMOTION_MAX_ROOMS = 20;
  const emotionPercent = Math.max(0, Math.min(100, (roomsToday / EMOTION_MAX_ROOMS) * 100));

  const emotionEmoji = (() => {
    if (emotionPercent < 20) return '😢';
    if (emotionPercent < 40) return '🙁';
    if (emotionPercent < 60) return '😐';
    if (emotionPercent < 80) return '🙂';
    return '😄';
  })();

  const backgroundStyle: CSSProperties = {
    backgroundImage: `url(${backTexture.src})`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
  };

  useEffect(() => {
    const loadStats = async () => {
      try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

        // Количество комнат созданных сегодня
        const { count: roomsCount } = await supabase
          .from('rooms')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startOfDay);

        // Количество игроков созданных сегодня
        const { count: playersCount } = await supabase
          .from('players')
          .select('*', { count: 'exact', head: true })
          .gte('joined_at', startOfDay);

        setRoomsToday(roomsCount || 0);
        setPlayersToday(playersCount || 0);
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    };

    loadStats();
  }, []);

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45]" style={backgroundStyle} onClick={handleUserInteraction}>
      {!hasStarted ? (
        <div className="min-h-screen flex items-center justify-center">
          <button
            onClick={handleStart}
            className={`px-8 py-4 rounded-2xl font-black text-xl tracking-[0.2em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45] hover:bg-[#1a3a5a] transition-all duration-500 ${buttonAnimating ? 'scale-110 bg-[#f1532f] shadow-2xl' : ''}`}
          >
            НАЧАТЬ ВЕСЕЛУХУ
          </button>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
          <div className={panelEnterClass(panelStage >= 1)} style={panelEnterStyle(panelStage >= 1, 0)}>
            <header className="retro-panel bg-[#f1532f] text-[#ffeccd] px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="retro-heading text-xs tracking-[0.5em]">Редактор квиза</p>
                <h1 className="text-3xl sm:text-4xl font-black leading-tight">Когнитивное программирование вечеринки</h1>
              </div>
              <div className="text-sm font-semibold uppercase tracking-[0.3em]">v 1.0.1</div>
            </header>
          </div>

          <div className={panelEnterClass(panelStage >= 2)} style={panelEnterStyle(panelStage >= 2, 140)}>
            <section className="retro-panel bg-[#ffe184] border-[4px] border-[#142a45] p-6 space-y-6">
            <div className="grid lg:grid-cols-[1.15fr,0.95fr] gap-6">
              <div className="space-y-5">
                <div className="rounded-3xl border-[3px] border-[#142a45] bg-[#fff2c8] p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">вечеринкач классический режим</p>
                      <p className="text-2xl font-black text-[#142a45]">Вечеринкач · Раунд 1</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold tracking-[0.3em] bg-[#142a45] text-[#ffeccd] animate-pulse">LIVE</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm font-semibold">
                    <button type="button" className="px-4 py-2 rounded-full border-2 border-[#142a45] bg-white">Общее</button>
                    <button
                      type="button"
                      onClick={playRandomMeet}
                      disabled={isMeetPlaying}
                      className={`px-4 py-2 rounded-full border-2 border-[#142a45] bg-white hover:bg-[#ffe184] transition-colors ${isMeetPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Учение
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open('https://donatty.com/aleksandri', '_blank')}
                      className="px-4 py-2 rounded-full border-2 border-[#142a45] bg-white hover:bg-[#ffe184] transition-colors"
                    >
                      Поддержка
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border-[3px] border-[#142a45] bg-[#fdd17a] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Эмоции</p>
                    <span className="text-lg" aria-label="Текущая эмоция">
                      {emotionEmoji}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-white/50 relative">
                    <div
                      className="absolute inset-y-0 left-0 bg-[#1f6ac6] rounded-full"
                      style={{ width: `${emotionPercent}%` }}
                    />
                    <div
                      className="absolute -top-2 h-7 w-7 rounded-full border-2 border-[#142a45] bg-white flex items-center justify-center"
                      style={{ left: `calc(${emotionPercent}% - 14px)` }}
                      aria-label="Индикатор эмоций"
                    >
                      {emotionEmoji}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border-[3px] border-[#142a45] bg-[#fff2c8] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Аудио канал</p>
                    <span className="text-sm font-semibold text-[#1f6ac6]">Lobby loop</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleToggleSound}
                      className={`hover:scale-105 hover:shadow-lg transition-all duration-200 inline-flex items-center justify-between rounded-2xl border-[3px] border-[#142a45] px-4 py-3 font-semibold ${isSoundOn ? 'bg-[#142a45] text-[#ffeccd]' : 'bg-white text-[#142a45]'}`}
                    >
                      {isSoundOn ? '🔊 Джингл включён' : '🎵 Включить джингл'}
                      <span className="text-xs tracking-[0.3em]">AUTO</span>
                    </button>
                    {audioError && <span className="text-xs text-[#b23324] font-semibold">{audioError}</span>}
                  </div>
                </div>
              </div>

            </div>
          </section>

          </div>

          {/* Отдельная панель выбора пакета вопросов */}
          <div className={panelEnterClass(panelStage >= 3)} style={panelEnterStyle(panelStage >= 3, 280)}>
            <div className="space-y-5">
              <section className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-5">
                <h2 className="text-2xl font-black text-[#142a45] text-center">перейти к созданию комнаты онлайн квиза Вечеринкач</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {packCards.map((pack, index) => (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => choosePackAndGoHost(normalizePackId(pack.id))}
                      className={`text-left rounded-3xl border-[3px] border-[#142a45] bg-white/90 p-4 flex flex-col gap-3 transition transform hover:scale-105 ${isExiting ? 'scale-95 opacity-70' : cardsVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0 translate-y-3'}`}
                      style={{ transitionDelay: `${index * 70}ms` }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Пакет</p>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-black text-[#142a45]">{pack.title}</h3>
                            {pack.badge ? (
                              <span className="rounded-full border-[2px] border-[#142a45] bg-[#ffe184] px-2 py-0.5 text-xs font-black tracking-[0.12em] text-[#142a45]">
                                {pack.badge}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span className="text-3xl">{pack.id === 'classic' ? '📘' : '📦'}</span>
                      </div>
                      <p className="text-sm text-[#142a45]/80 flex-1">{pack.description}</p>
                      <div className="text-xs font-semibold text-[#1f6ac6]">выбрать и перейти к созданию</div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-black text-[#142a45]">Мини-игры</h2>
                  <span className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/70">beta</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  {miniGames.map((game, index) => {
                    const isDisabled = Boolean(game.isSoon);
                    return (
                      <button
                        key={game.id}
                        type="button"
                        onClick={() => handleMiniGameClick(game.id)}
                        disabled={isDisabled}
                        className={`text-left rounded-3xl border-[3px] border-[#142a45] bg-white/95 p-4 flex flex-col gap-3 transition transform hover:scale-105 ${isDisabled ? 'opacity-70 cursor-not-allowed' : ''} ${isExiting ? 'scale-95 opacity-70' : cardsVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0 translate-y-3'}`}
                        style={{ transitionDelay: `${index * 70}ms` }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">{game.subtitle}</p>
                            <div className="flex items-center gap-2">
                              <h3 className="text-xl font-black text-[#142a45]">{game.title}</h3>
                              {game.badge ? (
                                <span className="rounded-full border-[2px] border-[#142a45] bg-[#ffe184] px-2 py-0.5 text-xs font-black tracking-[0.12em] text-[#142a45]">
                                  {game.badge}
                                </span>
                              ) : null}
                              {game.isSoon ? (
                                <span className="rounded-full border-[2px] border-[#142a45] bg-white px-2 py-0.5 text-xs font-black tracking-[0.12em] text-[#142a45]">
                                  скоро
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <span className="text-3xl" aria-hidden="true">{game.id === 'uno' ? '🃏' : '🎨'}</span>
                        </div>
                        <p className="text-sm text-[#142a45]/80 flex-1">{game.description}</p>
                        <div className="flex items-center justify-between text-xs font-semibold text-[#1f6ac6]">
                          <span>{game.id === 'uno' ? 'два режима: классический и irregular verbs' : 'готовим концепт'}</span>
                          <span>{game.isSoon ? '🔒' : '▶'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}