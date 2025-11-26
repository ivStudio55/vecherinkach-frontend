// app/page.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [cardsVisible, setCardsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayAttemptedRef = useRef(false);

  const games = [
    {
      id: 'vecherinkach',
      title: 'Вечеринкач · Раунд 1',
      description:
        'Игра, где ведущий зачитывает каверзные вопросы, а игроки отвечают с мобильных. Уже готов первый раунд!',
      accent: 'from-purple-500 via-pink-500 to-red-500',
      status: 'Доступна',
    },
    {
      id: 'music-battle',
      title: 'Battle Хитов',
      description:
        'Музыкальная дуэль на скорость звучания. Выбираем плейлист, угадываем треки, зарабатываем баллы.',
      accent: 'from-orange-400 via-amber-500 to-rose-500',
      status: 'Скоро',
    },
    {
      id: 'meme-bingo',
      title: 'Meme Bingo',
      description:
        'Листайте карточки, закрывайте мемы, собирайте смешные комбинации и делитесь результатами.',
      accent: 'from-blue-500 via-sky-500 to-cyan-400',
      status: 'Скоро',
    },
    {
      id: 'mystery',
      title: '???',
      description:
        'Экспериментальная вечеринка, где правила меняются на лету. Подпишитесь, чтобы узнать первыми.',
      accent: 'from-emerald-500 via-teal-500 to-slate-500',
      status: 'Скоро',
    },
  ];

  const handleUserInteraction = () => {
    if (!hasUserInteracted) {
      setHasUserInteracted(true);
    }
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
    appearTimeoutRef.current = setTimeout(() => {
      setCardsVisible(true);
    }, 50);

    return () => {
      if (appearTimeoutRef.current) {
        clearTimeout(appearTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const audio = new Audio('/audio/jingle-main.mp3');
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

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45]" onClick={handleUserInteraction}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <header className="retro-panel bg-[#f1532f] text-[#ffeccd] px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="retro-heading text-xs tracking-[0.5em]">Редактор квиза</p>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight">Когнитивное программирование вечеринки</h1>
          </div>
          <div className="text-sm font-semibold uppercase tracking-[0.3em]">Reality template v3.6</div>
        </header>

        <section className="retro-panel bg-[#ffe184] border-[4px] border-[#142a45] p-6 space-y-6">
          <div className="grid lg:grid-cols-[1.15fr,0.95fr] gap-6">
            <div className="space-y-5">
              <div className="rounded-3xl border-[3px] border-[#142a45] bg-[#fff2c8] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Режим игры</p>
                    <p className="text-2xl font-black text-[#142a45]">Вечеринкач · Раунд 1</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold tracking-[0.3em] bg-[#142a45] text-[#ffeccd]">LIVE</span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm font-semibold">
                  <button type="button" className="px-4 py-2 rounded-full border-2 border-[#142a45] bg-white">Общее</button>
                  <button type="button" className="px-4 py-2 rounded-full border-2 border-dashed border-[#142a45] text-[#142a45]/60" disabled>
                    Учение
                  </button>
                  <button type="button" className="px-4 py-2 rounded-full border-2 border-dashed border-[#142a45] text-[#142a45]/60" disabled>
                    Ритуал
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border-[3px] border-[#142a45] bg-[#fdd17a] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Эмоции</p>
                  <span className="text-lg">🙂</span>
                </div>
                <div className="h-3 rounded-full bg-white/50 relative">
                  <div className="absolute inset-y-0 left-0 bg-[#1f6ac6] rounded-full" style={{ width: '68%' }} />
                  <div className="absolute -top-1 left-[68%] h-5 w-5 rounded-full border-2 border-[#142a45] bg-white" />
                </div>
                <p className="text-sm font-semibold">Уровень азарта группы стабилен. Держим темп.</p>
              </div>

              <div className="rounded-3xl border-[3px] border-[#142a45] bg-[#fff6da] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Память</p>
                  <span className="text-xs font-semibold px-2 py-1 rounded bg-[#142a45]/10">Supabase synced</span>
                </div>
                <div className="space-y-2 text-sm font-mono">
                  <div className="flex justify-between border-2 border-[#142a45] rounded-xl px-3 py-2 bg-white/70">
                    <span>Комнаты</span>
                    <span className="font-bold text-[#1f6ac6]">{roomCodeDisplay}</span>
                  </div>
                  <div className="flex justify-between border-2 border-[#142a45] rounded-xl px-3 py-2 bg-white/70">
                    <span>Игроки</span>
                    <span className="font-bold text-[#f1532f]">{playersCountLabel}</span>
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
                    className={`inline-flex items-center justify-between rounded-2xl border-[3px] border-[#142a45] px-4 py-3 font-semibold ${isSoundOn ? 'bg-[#142a45] text-[#ffeccd]' : 'bg-white text-[#142a45]'}`}
                  >
                    {isSoundOn ? '🔊 Джингл включён' : '🎵 Включить джингл'}
                    <span className="text-xs tracking-[0.3em]">AUTO</span>
                  </button>
                  {audioError && <span className="text-xs text-[#b23324] font-semibold">{audioError}</span>}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-5">
              <div className="space-y-2">
                <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Подключение игроков</p>
                <h2 className="text-2xl font-black text-[#142a45]">Пульт подключения вынесен отдельно</h2>
                <p className="text-sm text-[#142a45]/80">
                  Перейдите на новый экран, чтобы вводить коды комнат, подключать игроков и управлять своим ником.
                </p>
              </div>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => navigateWithExit(() => router.push('/join'))}
                  className="w-full py-4 rounded-2xl font-black text-lg tracking-[0.2em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45]"
                >
                  Открыть экран подключения
                </button>
                <button
                  type="button"
                  onClick={() => navigateWithExit(() => router.push('/host'))}
                  className="w-full py-3 rounded-2xl border-[3px] border-[#142a45] font-semibold bg-[#ffe184] hover:bg-[#ffd463] transition"
                >
                  Стать ведущим
                </button>
              </div>
              <p className="text-xs text-[#142a45]/60">
                Этот раздел по‑прежнему доступен с мобильных устройств — просто поделитесь ссылкой /join с игроками.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {games.map((game, index) => (
              <article
                key={game.id}
                className={`rounded-3xl border-[3px] border-[#142a45] bg-white/90 p-4 flex flex-col gap-3 transition transform ${isExiting ? 'scale-95 opacity-70' : cardsVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0 translate-y-3'}`}
                style={{ transitionDelay: `${index * 70}ms` }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">{game.status}</p>
                    <h3 className="text-xl font-black text-[#142a45]">{game.title}</h3>
                  </div>
                  <span className="text-3xl">{game.id === 'vecherinkach' ? '🎉' : game.id === 'music-battle' ? '🎧' : game.id === 'meme-bingo' ? '🃏' : '✨'}</span>
                </div>
                <p className="text-sm text-[#142a45]/80 flex-1">{game.description}</p>
                {game.id === 'vecherinkach' ? (
                  <div className="text-xs font-semibold text-[#1f6ac6]">Первый раунд доступен прямо сейчас.</div>
                ) : (
                  <div className="text-xs font-semibold text-[#f1532f]">Скоро в эфире</div>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}