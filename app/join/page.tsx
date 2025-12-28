// app/join/page.tsx
'use client';

import { useState, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { generateRandomName } from '@/lib/nameGenerator';
import backTexture from '../img/back2.png';

export default function JoinPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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

      try {
        localStorage.setItem('playerId', player.id);
        localStorage.setItem('playerName', finalName);
      } catch (storageError) {
        console.warn('Не удалось сохранить данные игрока в localStorage', storageError);
      }

      const query = new URLSearchParams({ pid: player.id, name: finalName }).toString();
      router.push(`/room/${roomCode}?${query}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Ошибка: ${message}`);
      setIsLoading(false);
    }
  };

  const handleGenerateName = () => {
    setPlayerName(generateRandomName());
  };

  const backgroundStyle: CSSProperties = {
    backgroundImage: `url(${backTexture.src})`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
  };

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-10 relative overflow-hidden" style={backgroundStyle}>
      <div className="max-w-3xl mx-auto space-y-6 relative z-20">
        <header className="retro-panel bg-[#142a45] text-[#ffeccd] px-6 py-5">
          <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/80">Подключение игроков</p>
          <h1 className="text-3xl font-black leading-tight">Введите код комнаты и присоединяйтесь</h1>
          <p className="text-sm text-[#ffeccd]/80 mt-2">
            Этот экран можно отправить игрокам. Они самостоятельно введут код и свой ник.
          </p>
        </header>

        <section className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-5">
          <form onSubmit={handleJoinRoom} className="space-y-5">
            <div>
              <label htmlFor="roomCode" className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Код комнаты</label>
              <input
                id="roomCode"
                type="text"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
                className="w-full mt-2 px-4 py-3 text-2xl text-center font-black tracking-[0.5em] rounded-2xl border-[3px] border-[#142a45] bg-[#fff2c8] focus:outline-none focus:ring-4 focus:ring-[#1f6ac6]/30"
                required
              />
              <p className="text-xs text-[#142a45]/70 mt-2">Код выдаёт ведущий после создания комнаты.</p>
            </div>

            <div>
              <label htmlFor="playerName" className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Ваш ник</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="playerName"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Плюшевый Ёж"
                  maxLength={30}
                  className="flex-1 px-4 py-3 rounded-2xl border-[3px] border-[#142a45] bg-white placeholder-[#142a45]/40 focus:outline-none focus:ring-4 focus:ring-[#f1532f]/20"
                />
                <button
                  type="button"
                  onClick={handleGenerateName}
                  className="px-4 py-3 rounded-2xl border-[3px] border-dashed border-[#142a45] bg-[#ffecc4] text-2xl"
                  title="Сгенерировать имя"
                >
                  🎲
                </button>
              </div>
              <p className="text-xs text-[#142a45]/70 mt-1">Можно оставить пустым — тогда мы выберем случайный ник.</p>
            </div>

            {error && (
              <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || roomCode.length !== 4}
              className="w-full py-4 rounded-2xl font-black text-xl tracking-[0.2em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Подключаем...' : 'Присоединиться'}
            </button>
          </form>

          <div className="flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="px-4 py-2 rounded-2xl border-[3px] border-[#142a45] font-semibold bg-[#ffe184] hover:bg-[#ffd463] transition"
            >
              ← На главную
            </button>
            <button
              type="button"
              onClick={() => router.push('/host')}
              className="px-4 py-2 rounded-2xl border-[3px] border-[#142a45] font-semibold bg-white hover:bg-[#fef4dc] transition"
            >
              Стать ведущим
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
