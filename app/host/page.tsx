'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function HostPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const generateRoomCode = (): string => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const createRoom = async () => {
    setError('');
    setIsCreating(true);

    try {
      let attempts = 0;
      let roomCreated = false;
      let roomCode = '';

      // Пытаемся создать комнату с уникальным кодом (максимум 10 попыток)
      while (!roomCreated && attempts < 10) {
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
          roomCreated = true;
          // Сохраняем ID комнаты
          localStorage.setItem('hostRoomId', data.id);
          localStorage.setItem('hostRoomCode', roomCode);
          
          // Переходим на экран управления
          router.push(`/host/${data.id}`);
          return;
        }

        attempts++;
      }

      if (!roomCreated) {
        setError('Не удалось создать комнату. Попробуйте ещё раз.');
        setIsCreating(false);
      }
    } catch (err: any) {
      setError(`Ошибка: ${err.message}`);
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-4xl font-bold mb-2 text-center text-gray-800">
          🎯 Панель ведущего
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Создайте комнату и управляйте игрой
        </p>

        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg">
            <h2 className="font-semibold text-gray-800 mb-3">Что будет дальше:</h2>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="mr-2">1️⃣</span>
                <span>Вы получите уникальный 4-значный код</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">2️⃣</span>
                <span>Игроки присоединятся по этому коду</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">3️⃣</span>
                <span>Вы будете управлять вопросами и видеть ответы</span>
              </li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            onClick={createRoom}
            disabled={isCreating}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {isCreating ? 'Создаём комнату...' : '🎮 Создать комнату'}
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-all"
          >
            ← Назад
          </button>
        </div>
      </div>
    </div>
  );
}
