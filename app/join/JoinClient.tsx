'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { trackGameEvent } from '@/lib/analytics';
import { logEvent } from '@/shared/logic/logger';
import { generateRandomName } from '@/lib/nameGenerator';
import { ComicBackground } from '@/components/ComicBackground';

export default function JoinClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRoomCode = useMemo(() => {
    const codeParam = searchParams?.get('code') ?? '';
    return codeParam.replace(/\D/g, '').slice(0, 4);
  }, [searchParams]);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    trackGameEvent('join_submit', {
      roomCodeLength: roomCode.length,
      hasName: Boolean(playerName.trim()),
    });

    try {
      if (!/^\d{4}$/.test(roomCode)) {
        trackGameEvent('join_validation_failed', { reason: 'invalid_room_code' });
        setError('Код должен состоять из 4 цифр');
        setIsLoading(false);
        return;
      }

      try {
        localStorage.setItem('roomCode', roomCode);
      } catch (storageError) {
        console.warn('Не удалось сохранить roomCode в localStorage', storageError);
      }

      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id, is_active, status')
        .eq('code', roomCode)
        .single();

      if (roomError || !room) {
        trackGameEvent('join_failed', { reason: 'room_not_found' });
        setError('Комната с таким кодом не найдена');
        setIsLoading(false);
        return;
      }

      const roomStatus = typeof (room as { status?: unknown }).status === 'string' ? (room as { status: string }).status : '';
      if (!room.is_active && roomStatus === 'finished') {
        trackGameEvent('join_failed', { reason: 'room_inactive' });
        setError('Эта комната уже не активна');
        setIsLoading(false);
        return;
      }

      const finalName = playerName.trim() || generateRandomName();

      // Check for duplicate name in this room
      const { data: existingPlayers } = await supabase
        .from('players')
        .select('id, name')
        .eq('room_id', room.id)
        .ilike('name', finalName)
        .limit(1);

      if (existingPlayers && existingPlayers.length > 0) {
        trackGameEvent('join_failed', { reason: 'duplicate_name' });
        setError('Игрок с таким именем уже есть в комнате. Выберите другое имя.');
        setIsLoading(false);
        return;
      }

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          name: finalName,
        })
        .select()
        .single();

      if (playerError || !player) {
        trackGameEvent('join_failed', { reason: 'player_insert_error' });
        setError('Ошибка при присоединении к комнате');
        setIsLoading(false);
        return;
      }

      try {
        const tokenResponse = await fetch('/api/room-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: room.id, roomCode, playerId: player.id }),
        });
        if (tokenResponse.ok) {
          const tokenPayload = (await tokenResponse.json()) as { token?: string };
          if (tokenPayload.token) {
            localStorage.setItem('roomAccessToken', tokenPayload.token);
            supabase.realtime.setAuth(tokenPayload.token);
          }
        }
      } catch (tokenError) {
        console.warn('Не удалось получить room token', tokenError);
      }

      logEvent('info', 'analytics', 'player join', {
        eventName: 'player_join',
        roomId: room.id,
        playerId: player.id,
      });
      trackGameEvent('join_success', {
        roomCode,
        playerId: player.id,
      });

      try {
        localStorage.setItem('roomId', room.id);
        localStorage.setItem('roomCode', roomCode);
        localStorage.setItem('playerId', player.id);
        localStorage.setItem('playerName', finalName);
      } catch (storageError) {
        console.warn('Не удалось сохранить данные игрока в localStorage', storageError);
      }

      const query = new URLSearchParams({ pid: player.id, name: finalName }).toString();
      router.push(`/room/${roomCode}?${query}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      trackGameEvent('join_failed', { reason: 'exception' });
      setError(`Ошибка: ${message}`);
      setIsLoading(false);
    }
  };

  const handleGenerateName = () => {
    trackGameEvent('join_random_name_click');
    setPlayerName(generateRandomName());
  };

  return (
    <div className="min-h-screen text-[#142a45] px-4 py-10 relative z-10">
      <ComicBackground />
      <div className="max-w-3xl mx-auto space-y-6 relative z-20">
        <header className="comic-panel bg-[#142a45] text-[#ffeccd] px-6 py-5">
          <p className="comic-font text-xs tracking-[0.5em] text-[#ffeccd]/80">Подключение игроков</p>
          <h1 className="text-3xl comic-font leading-tight">Введите код комнаты и присоединяйтесь</h1>
          <p className="text-sm text-[#ffeccd]/80 mt-2 font-bold">
            Этот экран можно отправить игрокам. Они самостоятельно введут код и свой ник.
          </p>
        </header>

        <section className="comic-panel bg-white p-6 space-y-5">
          <form onSubmit={handleJoinRoom} className="space-y-5">
            <div>
              <label htmlFor="roomCode" className="comic-font text-xs tracking-[0.4em] text-[#142a45]/70">Код комнаты</label>
              <input
                id="roomCode"
                type="text"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
                className="w-full mt-2 px-4 py-3 text-2xl text-center comic-font tracking-[0.5em] rounded-2xl border-[4px] border-[#000] bg-[#ffde00] focus:outline-none focus:ring-4 focus:ring-[#1f6ac6]/30"
                required
              />
              <p className="text-xs text-[#142a45]/70 mt-2 font-bold">Код выдаёт ведущий после создания комнаты.</p>
            </div>

            <div>
              <label htmlFor="playerName" className="comic-font text-xs tracking-[0.4em] text-[#142a45]/70">Ваш ник</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="playerName"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Плюшевый Ёж"
                  maxLength={30}
                  className="flex-1 px-4 py-3 rounded-2xl border-[4px] border-[#000] bg-white placeholder-[#142a45]/40 focus:outline-none focus:ring-4 focus:ring-[#f1532f]/20 font-bold"
                />
                <button
                  type="button"
                  onClick={handleGenerateName}
                  className="comic-button px-4 py-3 bg-[#00c3ff] text-2xl"
                  title="Сгенерировать имя"
                >
                  🎲
                </button>
              </div>
              <p className="text-xs text-[#142a45]/70 mt-1 font-bold">Можно оставить пустым — тогда мы выберем случайный ник.</p>
            </div>

            {error && (
              <div className="rounded-2xl border-[4px] border-[#000] bg-[#ff2a2a] px-4 py-3 text-sm font-bold text-white">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || roomCode.length !== 4}
              className="comic-button w-full py-4 text-xl bg-[#ff007f] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Подключаем...' : 'Присоединиться'}
            </button>
          </form>

          <div className="flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              onClick={() => {
                trackGameEvent('join_nav_click', { destination: '/' });
                router.push('/');
              }}
              className="comic-button px-4 py-2 bg-[#ffde00]"
            >
              Главная
            </button>
            <button
              type="button"
              onClick={() => {
                trackGameEvent('join_nav_click', { destination: '/host' });
                router.push('/host');
              }}
              className="comic-button px-4 py-2 bg-white"
            >
              Ведущий
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
