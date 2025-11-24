'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Question {
  text: string;
  order: number;
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;

  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [error, setError] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [roomId, setRoomId] = useState('');

  useEffect(() => {
    const init = async () => {
      const playerId = localStorage.getItem('playerId');
      const name = localStorage.getItem('playerName');

      if (!playerId || !name) {
        router.push('/');
        return;
      }

      setPlayerName(name);

      // Получаем данные комнаты
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id, current_question_index, is_active')
        .eq('code', roomCode)
        .single();

      if (roomError || !room) {
        setError('Комната не найдена');
        setIsLoading(false);
        return;
      }

      if (!room.is_active) {
        setError('Комната неактивна');
        setIsLoading(false);
        return;
      }

      setRoomId(room.id);

      // Загружаем текущий вопрос
      await loadQuestion(room.current_question_index);

      // Проверяем, ответил ли игрок на текущий вопрос
      const { data: existingAnswer } = await supabase
        .from('answers')
        .select('id')
        .eq('player_id', playerId)
        .eq('room_id', room.id)
        .eq('question_index', room.current_question_index)
        .single();

      if (existingAnswer) {
        setHasAnswered(true);
      }

      setIsLoading(false);

      // Подписка на изменения комнаты (когда ведущий переключает вопросы)
      const roomChannel = supabase
        .channel(`room:${room.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${room.id}`,
          },
          async (payload: any) => {
            const newQuestionIndex = payload.new.current_question_index;
            
            // Загружаем новый вопрос
            await loadQuestion(newQuestionIndex);
            
            // Проверяем, ответил ли игрок на новый вопрос
            const { data: newAnswer } = await supabase
              .from('answers')
              .select('id')
              .eq('player_id', playerId)
              .eq('room_id', room.id)
              .eq('question_index', newQuestionIndex)
              .single();

            setHasAnswered(!!newAnswer);
            setAnswer('');
            
            // Если комната стала неактивной
            if (payload.new.is_active === false) {
              setError('Игра завершена ведущим');
            }
          }
        )
        .subscribe();

      // Очистка подписки при размонтировании
      return () => {
        supabase.removeChannel(roomChannel);
      };
    };

    init();
  }, [roomCode, router]);

  const loadQuestion = async (questionIndex: number) => {
    const { data, error: questionError } = await supabase
      .from('questions')
      .select('text, order')
      .eq('order', questionIndex + 1)
      .single();

    if (questionError || !data) {
      setError('Вопрос не найден');
      return;
    }

    setQuestion(data);
  };

  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const playerId = localStorage.getItem('playerId');

      if (!playerId || !roomId) {
        setError('Ошибка: данные игрока не найдены');
        setIsSubmitting(false);
        return;
      }

      const { data: room } = await supabase
        .from('rooms')
        .select('current_question_index')
        .eq('id', roomId)
        .single();

      if (!room) {
        setError('Комната не найдена');
        setIsSubmitting(false);
        return;
      }

      const { error: insertError } = await supabase
        .from('answers')
        .insert({
          player_id: playerId,
          room_id: roomId,
          question_index: room.current_question_index,
          text: answer.trim(),
        });

      if (insertError) {
        setError('Ошибка при отправке ответа');
        setIsSubmitting(false);
        return;
      }

      setHasAnswered(true);
      setAnswer('');
      setIsSubmitting(false);
    } catch (err: any) {
      setError(`Ошибка: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-red-500">
        <div className="text-white text-2xl font-bold">Загрузка...</div>
      </div>
    );
  }

  if (error && !question) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">❌ Ошибка</h1>
          <p className="text-gray-700 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 p-6">
      <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
        {/* Хедер */}
        <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 mb-6 text-white">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm opacity-80">Комната</p>
              <p className="text-2xl font-bold">{roomCode}</p>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-80">Игрок</p>
              <p className="text-lg font-semibold">{playerName}</p>
            </div>
          </div>
        </div>

        {/* Вопрос */}
        {question && (
          <div className="bg-white rounded-2xl shadow-2xl p-8 mb-6 flex-1 flex flex-col">
            <div className="text-center mb-8">
              <span className="inline-block bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                Вопрос #{question.order}
              </span>
              <h2 className="text-3xl font-bold text-gray-800">
                {question.text}
              </h2>
            </div>

            {!hasAnswered ? (
              <form onSubmit={submitAnswer} className="space-y-6 mt-auto">
                <div>
                  <label htmlFor="answer" className="block text-sm font-medium text-gray-700 mb-2">
                    Ваш ответ
                  </label>
                  <textarea
                    id="answer"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Введите ответ..."
                    rows={4}
                    maxLength={200}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {answer.length}/200 символов
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !answer.trim()}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  {isSubmitting ? 'Отправка...' : 'Отправить ответ 📤'}
                </button>
              </form>
            ) : (
              <div className="text-center mt-auto">
                <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-8">
                  <div className="text-6xl mb-4">✅</div>
                  <h3 className="text-2xl font-bold text-green-700 mb-2">
                    Ответ отправлен!
                  </h3>
                  <p className="text-gray-600">
                    Ожидайте следующий вопрос от ведущего
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
