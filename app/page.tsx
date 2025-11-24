// app/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { generateRandomName } from '@/lib/nameGenerator';

export default function HomePage() {
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
      // Проверяем код комнаты (должен быть 4 цифры)
      if (!/^\d{4}$/.test(roomCode)) {
        setError('Код должен состоять из 4 цифр');
        setIsLoading(false);
        return;
      }

      // Проверяем существование комнаты
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

      // Генерируем имя, если не указано
      const finalName = playerName.trim() || generateRandomName();

      // Создаём игрока
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

      // Сохраняем ID игрока в localStorage
      localStorage.setItem('playerId', player.id);
      localStorage.setItem('playerName', finalName);

      // Переходим в комнату
      router.push(`/room/${roomCode}`);
    } catch (err: any) {
      setError(`Ошибка: ${err.message}`);
      setIsLoading(false);
    }
  };

  const handleGenerateName = () => {
    setPlayerName(generateRandomName());
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-4xl font-bold mb-2 text-center text-gray-800">
          🎉 Вечеринкач
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Введите код комнаты, чтобы присоединиться
        </p>

        <form onSubmit={handleJoinRoom} className="space-y-6">
          <div>
            <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700 mb-2">
              Код комнаты (4 цифры)
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
              className="w-full px-4 py-3 text-2xl text-center font-bold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="playerName" className="block text-sm font-medium text-gray-700 mb-2">
              Ваше имя (необязательно)
            </label>
            <div className="flex gap-2">
              <input
                id="playerName"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Плюшевый Ёж"
                maxLength={30}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleGenerateName}
                className="px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                title="Сгенерировать случайное имя"
              >
                🎲
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Если не укажете, мы придумаем забавное имя за вас
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || roomCode.length !== 4}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Подключение...' : 'Присоединиться 🚀'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-600 mb-3">Хотите создать свою игру?</p>
          <button
            onClick={() => router.push('/host')}
            className="text-purple-600 hover:text-purple-700 font-semibold underline"
          >
            Стать ведущим →
          </button>
        </div>
      </div>
    </div>
  );
}