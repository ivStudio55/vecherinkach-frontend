'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const QUESTION_DURATION_SECONDS = 30;

const getRemainingSeconds = (startedAt: string | null) => {
  if (!startedAt) {
    return QUESTION_DURATION_SECONDS;
  }
  const diffMs = Date.now() - new Date(startedAt).getTime();
  const elapsedSeconds = Math.floor(diffMs / 1000);
  return Math.max(0, QUESTION_DURATION_SECONDS - elapsedSeconds);
};

interface Question {
  text: string;
  order: number;
  difficulty: string;
  points: number;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
}

type RoomStatus = 'waiting' | 'running' | 'finished';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;

  const [question, setQuestion] = useState<Question | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [error, setError] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [roomId, setRoomId] = useState('');
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_DURATION_SECONDS);
  const [showResults, setShowResults] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('waiting');

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
        .select('id, current_question_index, is_active, status, question_started_at')
        .eq('code', roomCode)
        .single();

      if (roomError || !room) {
        setError('Комната не найдена');
        setIsLoading(false);
        return;
      }

      setRoomId(room.id);
      setRoomStatus((room.status as RoomStatus) || (room.is_active ? 'waiting' : 'finished'));

      if (room.status === 'waiting') {
        setShowResults(false);
        setHasAnswered(false);
        setQuestion(null);
        setQuestionStartedAt(null);
        setTimeLeft(QUESTION_DURATION_SECONDS);
        setIsLoading(false);
      } else if (!room.is_active || room.status === 'finished') {
        setShowResults(true);
        setQuestion(null);
        setQuestionStartedAt(null);
        setIsLoading(false);
      } else {
        setQuestionStartedAt(room.question_started_at);
        setTimeLeft(getRemainingSeconds(room.question_started_at));

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
      }

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
            const startedAt = payload.new.question_started_at as string | null;
            const newStatus = (payload.new.status as RoomStatus) || (payload.new.is_active ? 'waiting' : 'finished');
            setRoomStatus(newStatus);

            if (newStatus === 'waiting') {
              setShowResults(false);
              setHasAnswered(false);
              setQuestion(null);
              setQuestionStartedAt(null);
              setTimeLeft(QUESTION_DURATION_SECONDS);
              return;
            }

            if (newStatus === 'finished' || payload.new.is_active === false) {
              setShowResults(true);
              setQuestion(null);
              setQuestionStartedAt(null);
              return;
            }

            // Загружаем новый вопрос
            await loadQuestion(newQuestionIndex);
            setQuestionStartedAt(startedAt);
            setTimeLeft(getRemainingSeconds(startedAt));
            
            // Проверяем, ответил ли игрок на новый вопрос
            const { data: newAnswer } = await supabase
              .from('answers')
              .select('id')
              .eq('player_id', playerId)
              .eq('room_id', room.id)
              .eq('question_index', newQuestionIndex)
              .single();

            setHasAnswered(!!newAnswer);
            
            // Если комната стала неактивной
            if (payload.new.is_active === false) {
              setShowResults(true);
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

  useEffect(() => {
    if (showResults || roomStatus !== 'running') {
      return;
    }

    const tick = () => setTimeLeft(getRemainingSeconds(questionStartedAt));
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [questionStartedAt, showResults, roomStatus]);

  const loadQuestion = async (questionIndex: number) => {
    // questionIndex начинается с 0, order в БД начинается с 1
    const { data, error: questionError } = await supabase
      .from('questions')
      .select('text, order, difficulty, points, option_a, option_b, option_c, option_d, correct_answer')
      .eq('"order"', questionIndex + 1)
      .single();

    if (questionError || !data) {
      console.error('Не удалось загрузить вопрос (игрок)', questionError);
      // Если вопрос не найден, возможно вопросы закончились
      setQuestion(null);
      return;
    }

    setQuestion(data);
  };

  const submitAnswer = async (optionKey: string) => {
    setError('');
    setIsSubmitting(true);

    try {
      if (roomStatus !== 'running') {
        setError('Дождитесь начала раунда, чтобы отвечать');
        setIsSubmitting(false);
        return;
      }

      if (timeLeft <= 0) {
        setError('Время на ответ истекло');
        setIsSubmitting(false);
        return;
      }

      const playerId = localStorage.getItem('playerId');

      if (!playerId || !roomId || !question) {
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

      // Проверяем правильность ответа
      const isCorrect = optionKey === question.correct_answer;
      const pointsEarned = isCorrect ? question.points : 0;

      // Сохраняем ответ
      const { error: insertError } = await supabase
        .from('answers')
        .insert({
          player_id: playerId,
          room_id: roomId,
          question_index: room.current_question_index,
          text: optionKey,
          is_correct: isCorrect,
          points_earned: pointsEarned,
        });

      if (insertError) {
        setError('Ошибка при отправке ответа');
        setIsSubmitting(false);
        return;
      }

      // Обновляем общий счёт игрока
      if (isCorrect) {
        const { data: playerData } = await supabase
          .from('players')
          .select('total_points')
          .eq('id', playerId)
          .single();

        if (playerData) {
          await supabase
            .from('players')
            .update({ total_points: (playerData.total_points || 0) + pointsEarned })
            .eq('id', playerId);
        }
      }

      setHasAnswered(true);
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

  const progressPercent = Math.max(0, Math.min(100, (timeLeft / QUESTION_DURATION_SECONDS) * 100));

  if (showResults) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-4">🎉 Раунд завершён</h2>
          <p className="text-gray-600 mb-6">
            Ведущий объявит правильные ответы и очки после завершения таймера. Оставайтесь на связи!
          </p>
          <button
            onClick={() => router.push('/')}
            className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg"
          >
            Выйти в лобби
          </button>
        </div>
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

        {roomStatus === 'waiting' && (
          <div className="bg-white rounded-2xl shadow-2xl p-8 mb-6 flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Ждём ведущего</h2>
            <p className="text-gray-600 max-w-md">
              Игра начнётся, когда ведущий подтвердит подключение всех игроков. Оставайтесь на этой странице.
            </p>
          </div>
        )}

        {/* Вопрос */}
        {question && roomStatus === 'running' && (
          <div className="bg-white rounded-2xl shadow-2xl p-8 mb-6 flex-1 flex flex-col">
            <div className="text-center mb-8">
              <span className="inline-block bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                Вопрос #{question.order}
              </span>
              <h2 className="text-3xl font-bold text-gray-800">
                {question.text}
              </h2>
            </div>

            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Осталось времени</span>
                <span className="font-semibold text-gray-800">{timeLeft} c</span>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${timeLeft > 5 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            {!hasAnswered ? (
              <div className="space-y-6 mt-auto">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-4">
                    Выберите правильный ответ:
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { key: 'a', label: 'А', text: question.option_a },
                      { key: 'b', label: 'Б', text: question.option_b },
                      { key: 'c', label: 'В', text: question.option_c },
                      { key: 'd', label: 'Г', text: question.option_d },
                    ].map((option) => (
                      <button
                        key={option.key}
                        onClick={() => submitAnswer(option.key)}
                        disabled={isSubmitting || timeLeft <= 0 || roomStatus !== 'running'}
                        className="w-full text-left px-6 py-4 bg-white border-2 border-purple-300 hover:border-purple-500 hover:bg-purple-50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex-shrink-0 w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold group-hover:bg-purple-600">
                            {option.label}
                          </span>
                          <span className="text-gray-800 font-medium">{option.text}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 px-4 py-3 rounded-lg">
                  <span className="font-semibold">
                    Сложность: {question.difficulty === 'easy' ? '🟢 Лёгкий' : question.difficulty === 'medium' ? '🟡 Средний' : '🔴 Сложный'}
                  </span>
                  <span className="font-bold text-purple-600">
                    {question.points} баллов
                  </span>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                {timeLeft <= 0 && (
                  <p className="text-center text-sm text-gray-500">
                    ⏱ Время на ответ истекло. Дождитесь следующего вопроса.
                  </p>
                )}
              </div>
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
