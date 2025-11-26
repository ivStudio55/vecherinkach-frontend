// app/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { generateRandomName } from '@/lib/nameGenerator';

export default function HomePage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [cardsVisible, setCardsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!/^\d{4}$/.test(roomCode)) {
        setError('Код должен состоять из 4 цифр');
        setIsLoading(false);
        return;
      }

      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id, is_active')
        .eq('code', roomCode)
        .single();

      if (roomError || !room) {
        setError('Комната с таким кодом не найдена');
        setIsLoading(false);
        return;
      }

      if (!room.is_active) {
        setError('Эта комната уже не активна');
        setIsLoading(false);
        return;
      }

      const finalName = playerName.trim() || generateRandomName();

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          name: finalName,
        })
        .select()
        .single();

      if (playerError || !player) {
        setError('Ошибка при присоединении к комнате');
        setIsLoading(false);
        return;
      }

      localStorage.setItem('playerId', player.id);
      localStorage.setItem('playerName', finalName);

      navigateWithExit(() => router.push(`/room/${roomCode}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Ошибка: ${message}`);
      setIsLoading(false);
    }
  };

  const handleGenerateName = () => {
    setPlayerName(generateRandomName());
  };

  const navigateWithExit = (callback: () => void) => {
    if (isExiting) {
      return;
    }
    setIsExiting(true);
    setCardsVisible(false);
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

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-40">
        <div className="absolute -top-32 -right-20 w-96 h-96 bg-pink-500 blur-3xl" />
        <div className="absolute top-24 -left-24 w-80 h-80 bg-purple-600 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-72 h-72 bg-sky-500 blur-3xl" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-16 flex flex-col gap-12">
        <header className="text-center space-y-6">
          <p className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/10 text-sm uppercase tracking-wide text-purple-100">
            <span className="w-2 h-2 rounded-full bg-lime-300 animate-pulse" />
            Party Platform 2.0
          </p>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight">
            Всё для стильной вечеринки в одном экране
          </h1>
          <p className="text-lg md:text-2xl text-slate-200 max-w-3xl mx-auto">
            Выбирайте формат, зовите друзей, запускайте игры. Первый раунд «Вечеринкача» уже готов, ещё три концепта на подлёте.
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm text-slate-200">
            <span className="px-3 py-1 rounded-full bg-white/10">Realtime · Supabase</span>
            <span className="px-3 py-1 rounded-full bg-white/10">Mobile friendly</span>
            <span className="px-3 py-1 rounded-full bg-white/10">Host &amp; Player UX</span>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {games.map((game, index) => {
            const animationState = isExiting
              ? 'translate-y-6 opacity-0 scale-95'
              : cardsVisible
                ? 'translate-y-0 opacity-100 scale-100'
                : 'translate-y-8 opacity-0 scale-95';

            return (
              <article
                key={game.id}
                className={`rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br ${game.accent} p-6 relative group shadow-2xl transform transition duration-500 ease-out will-change-transform will-change-opacity ${animationState}`}
                style={{ transitionDelay: `${index * 80}ms` }}
              >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/80">{game.status}</p>
                  <h2 className="text-2xl font-semibold mt-1">{game.title}</h2>
                </div>
                <span className="text-4xl">
                  {game.id === 'vecherinkach'
                    ? '🎉'
                    : game.id === 'music-battle'
                      ? '🎧'
                      : game.id === 'meme-bingo'
                        ? '🃏'
                        : '✨'}
                </span>
              </div>

              <p className="text-base text-white/90 leading-relaxed mb-6">{game.description}</p>

              {game.id === 'vecherinkach' ? (
                <div className="bg-white/15 backdrop-blur rounded-2xl p-5 space-y-5 border border-white/10">
                  <h3 className="text-lg font-semibold">Присоединяйтесь к комнате</h3>
                  <form onSubmit={handleJoinRoom} className="space-y-4">
                    <div>
                      <label htmlFor="roomCode" className="block text-xs uppercase tracking-wide text-white/70 mb-2">
                        Код комнаты
                      </label>
                      <input
                        id="roomCode"
                        type="text"
                        inputMode="numeric"
                        pattern="\d{4}"
                        maxLength={4}
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="1234"
                        className="w-full px-4 py-3 text-xl text-center font-bold rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-purple-200"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="playerName" className="block text-xs uppercase tracking-wide text-white/70 mb-2">
                        Ваш ник (опционально)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="playerName"
                          type="text"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          placeholder="Плюшевый Ёж"
                          maxLength={30}
                          className="flex-1 px-4 py-3 rounded-xl bg-white/90 text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-4 focus:ring-pink-200"
                        />
                        <button
                          type="button"
                          onClick={handleGenerateName}
                          className="px-4 py-3 rounded-xl bg-white/20 hover:bg-white/30 transition-colors text-lg"
                          title="Сгенерировать имя"
                        >
                          🎲
                        </button>
                      </div>
                      <p className="text-xs text-white/70 mt-1">Оставьте пустым — и мы подберём забавный ник автоматически.</p>
                    </div>

                    {error && (
                      <div className="bg-red-500/20 border border-red-300/60 text-white px-4 py-3 rounded-xl text-sm">
                        {error}
                      </div>
                    )}

                    <div className="flex flex-col gap-3">
                      <button
                        type="submit"
                        disabled={isLoading || roomCode.length !== 4}
                        className="w-full py-4 rounded-xl font-semibold text-lg bg-white text-slate-900 hover:bg-lime-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoading ? 'Подключаем...' : 'Войти в комнату'}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateWithExit(() => router.push('/host'))}
                        className="w-full py-3 rounded-xl bg-white/0 border border-white/40 text-white font-medium hover:bg-white/10 transition"
                      >
                        Стать ведущим
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="flex items-center justify-between text-white/80">
                  <div>
                    <p className="text-sm">Подпишитесь, чтобы узнать о запуске</p>
                    <p className="text-xs uppercase tracking-wider">Work in progress</p>
                  </div>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-full bg-white/20 text-sm font-medium cursor-not-allowed"
                    disabled
                  >
                    Скоро
                  </button>
                </div>
              )}
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}