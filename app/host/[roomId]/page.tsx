'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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

interface Player {
  id: string;
  name: string;
  total_points: number;
}

interface Answer {
  player_id: string;
  text: string;
  submitted_at: string;
  is_correct: boolean;
  points_earned: number;
}

export default function HostRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [roomCode, setRoomCode] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(0);

  useEffect(() => {
    const init = async () => {
      // Проверяем авторизацию ведущего
      const hostRoomId = localStorage.getItem('hostRoomId');
      if (hostRoomId !== roomId) {
        router.push('/host');
        return;
      }

      await loadRoomData();
      setIsLoading(false);

      // Подписка на новых игроков
      const playersChannel = supabase
        .channel(`players:${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'players',
            filter: `room_id=eq.${roomId}`,
          },
          () => {
            loadPlayers();
          }
        )
        .subscribe();

      // Подписка на новые ответы
      const answersChannel = supabase
        .channel(`answers:${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'answers',
            filter: `room_id=eq.${roomId}`,
          },
          async (payload: any) => {
            // Проверяем, что ответ относится к текущему вопросу
            const { data: room } = await supabase
              .from('rooms')
              .select('current_question_index')
              .eq('id', roomId)
              .single();

            if (room && payload.new.question_index === room.current_question_index) {
              await loadAnswers(room.current_question_index);
            }
          }
        )
        .subscribe();

      // Очистка подписок
      return () => {
        supabase.removeChannel(playersChannel);
        supabase.removeChannel(answersChannel);
      };
    };

    init();
  }, [roomId, router]);

  const loadRoomData = async () => {
    // Загружаем данные комнаты
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('code, current_question_index')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      setError('Комната не найдена');
      return;
    }

    setRoomCode(room.code);
    setCurrentQuestionIndex(room.current_question_index);

    // Загружаем вопрос
    await loadQuestion(room.current_question_index);

    // Загружаем игроков
    await loadPlayers();

    // Загружаем ответы на текущий вопрос
    await loadAnswers(room.current_question_index);

    // Получаем общее количество вопросов
    const { count } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true });

    setTotalQuestions(count || 0);
  };

  const loadQuestion = async (questionIndex: number) => {
    // questionIndex начинается с 0, order в БД начинается с 1
    const { data, error: questionError } = await supabase
      .from('questions')
      .select('text, order, difficulty, points, option_a, option_b, option_c, option_d, correct_answer')
      .eq('"order"', questionIndex + 1)
      .single();

    if (questionError || !data) {
      console.error('Не удалось загрузить вопрос (хост)', questionError);
      // Если вопрос не найден, игра завершена
      setQuestion(null);
      return;
    }

    setQuestion(data);
  };

  const loadPlayers = async () => {
    const { data, error: playersError } = await supabase
      .from('players')
      .select('id, name, total_points')
      .eq('room_id', roomId)
      .order('total_points', { ascending: false });

    if (playersError) return;
    setPlayers(data || []);
  };

  const loadAnswers = async (questionIndex: number) => {
    const { data, error: answersError } = await supabase
      .from('answers')
      .select('player_id, text, submitted_at, is_correct, points_earned')
      .eq('room_id', roomId)
      .eq('question_index', questionIndex)
      .order('submitted_at', { ascending: true });

    if (answersError) return;
    setAnswers(data || []);
  };

  const nextQuestion = async () => {
    const newIndex = currentQuestionIndex + 1;

    const { error: updateError } = await supabase
      .from('rooms')
      .update({ current_question_index: newIndex })
      .eq('id', roomId);

    if (updateError) {
      setError('Ошибка при переходе к следующему вопросу');
      return;
    }

    setCurrentQuestionIndex(newIndex);
    await loadQuestion(newIndex);
    await loadAnswers(newIndex);
  };

  const endGame = async () => {
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ is_active: false })
      .eq('id', roomId);

    if (updateError) {
      setError('Ошибка при завершении игры');
      return;
    }

    localStorage.removeItem('hostRoomId');
    localStorage.removeItem('hostRoomCode');
    router.push('/host');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
        <div className="text-white text-2xl font-bold">Загрузка...</div>
      </div>
    );
  }

  const answeredCount = answers.length;
  const totalPlayers = players.length;
  const isLastQuestion = currentQuestionIndex >= totalQuestions - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Хедер */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">🎯 Панель ведущего</h1>
              <p className="text-gray-600">Комната: <span className="font-mono font-bold text-2xl text-purple-600">{roomCode}</span></p>
            </div>
            <button
              onClick={endGame}
              className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Завершить игру
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Вопрос и управление */}
          <div className="lg:col-span-2 space-y-6">
            {/* Текущий вопрос */}
            {question ? (
              <div className="bg-white rounded-2xl shadow-2xl p-8">
                <div className="flex justify-between items-center mb-6">
                  <span className="bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold">
                    Вопрос {question.order} из {totalQuestions}
                  </span>
                  <span className="text-gray-600">
                    Ответили: <span className="font-bold text-purple-600">{answeredCount}/{totalPlayers}</span>
                  </span>
                </div>

                <h2 className="text-3xl font-bold text-gray-800 mb-8">
                  {question.text}
                </h2>

                <button
                  onClick={nextQuestion}
                  disabled={isLastQuestion}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  {isLastQuestion ? '✅ Это последний вопрос' : 'Следующий вопрос →'}
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  🎉 Игра завершена!
                </h2>
                <p className="text-gray-600">Все вопросы были показаны</p>
              </div>
            )}

            {/* Ответы */}
            <div className="bg-white rounded-2xl shadow-2xl p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">
                💬 Ответы игроков ({answers.length})
              </h3>

              {answers.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Пока никто не ответил на этот вопрос
                </p>
              ) : (
                <div className="space-y-4">
                  {answers.map((answer, index) => {
                    const player = players.find((p) => p.id === answer.player_id);
                    const optionLabels: { [key: string]: string } = {
                      a: 'А', b: 'Б', c: 'В', d: 'Г'
                    };
                    return (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border-l-4 ${
                          answer.is_correct
                            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-500'
                            : 'bg-gradient-to-r from-red-50 to-pink-50 border-red-500'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${answer.is_correct ? 'text-green-700' : 'text-red-700'}`}>
                              {player?.name || 'Неизвестный игрок'}
                            </span>
                            <span className={`text-lg ${answer.is_correct ? 'text-green-600' : 'text-red-600'}`}>
                              {answer.is_correct ? '✓' : '✗'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {answer.is_correct && (
                              <span className="font-bold text-green-600">
                                +{answer.points_earned} 💎
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              {new Date(answer.submitted_at).toLocaleTimeString('ru-RU')}
                            </span>
                          </div>
                        </div>
                        <p className="text-gray-700 font-medium">
                          Ответ: {optionLabels[answer.text] || answer.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Боковая панель - игроки */}
          <div className="bg-white rounded-2xl shadow-2xl p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              👥 Игроки ({players.length})
            </h3>

            {players.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Пока никто не присоединился
              </p>
            ) : (
              <div className="space-y-2">
                {players.map((player, index) => {
                  const hasAnswered = answers.some((a) => a.player_id === player.id);
                  const playerAnswer = answers.find((a) => a.player_id === player.id);
                  return (
                    <div
                      key={player.id}
                      className={`p-3 rounded-lg ${
                        hasAnswered
                          ? playerAnswer?.is_correct
                            ? 'bg-green-50 border-2 border-green-300'
                            : 'bg-red-50 border-2 border-red-300'
                          : 'bg-gray-50 border border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {index < 3 && (
                            <span className="text-lg">
                              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                            </span>
                          )}
                          <span className="font-medium text-gray-700">{player.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-purple-600 text-sm">
                            {player.total_points} 💎
                          </span>
                          {hasAnswered && (
                            <span className={playerAnswer?.is_correct ? 'text-green-600' : 'text-red-600'}>
                              {playerAnswer?.is_correct ? '✓' : '✗'}
                            </span>
                          )}
                        </div>
                      </div>
                      {hasAnswered && playerAnswer?.is_correct && (
                        <div className="text-xs text-green-600 font-semibold">
                          +{playerAnswer.points_earned} баллов
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
