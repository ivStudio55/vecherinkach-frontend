'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const QUESTION_DURATION_SECONDS = 30;

const OPTION_LABELS: Record<string, string> = {
  a: 'А',
  b: 'Б',
  c: 'В',
  d: 'Г',
};

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
  explanation?: string;
}

interface Player {
  id: string;
  name: string;
  total_points: number;
}

type RoomStatus = 'waiting' | 'running' | 'finished';

interface RoundAnswer {
  player_id: string;
  text: string;
  submitted_at: string;
  is_correct: boolean;
  points_earned: number;
  question_index: number;
}

export default function HostRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [roomCode, setRoomCode] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answerCount, setAnswerCount] = useState(0);
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_DURATION_SECONDS);
  const [showResults, setShowResults] = useState(false);
  const [roundAnswers, setRoundAnswers] = useState<RoundAnswer[]>([]);
  const [summaryQuestions, setSummaryQuestions] = useState<Question[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('waiting');

  const syncTimerWithStart = (startedAt: string | null) => {
    setQuestionStartedAt(startedAt);
    setTimeLeft(getRemainingSeconds(startedAt));
  };
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
              await loadAnswerCount(room.current_question_index);
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

  useEffect(() => {
    if (showResults || roomStatus !== 'running' || !questionStartedAt) {
      return;
    }

    const tick = () => {
      const remaining = getRemainingSeconds(questionStartedAt);
      setTimeLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [questionStartedAt, showResults, roomStatus]);

  const loadRoomData = async () => {
    // Загружаем данные комнаты
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('code, current_question_index, question_started_at, status')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      setError('Комната не найдена');
      return;
    }

    setRoomCode(room.code);
    setCurrentQuestionIndex(room.current_question_index);
    const detectedStatus = (room.status as RoomStatus) || 'waiting';
    setRoomStatus(detectedStatus);

    if (detectedStatus === 'running') {
      syncTimerWithStart(room.question_started_at);
      await loadQuestion(room.current_question_index);
      await loadAnswerCount(room.current_question_index);
    } else if (detectedStatus === 'finished') {
      setShowResults(true);
      await fetchSummaryData();
    } else {
      setQuestion(null);
      setAnswerCount(0);
      setQuestionStartedAt(null);
      setTimeLeft(QUESTION_DURATION_SECONDS);
    }

    // Загружаем игроков
    await loadPlayers();

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
      .select('text, order, difficulty, points, option_a, option_b, option_c, option_d, correct_answer, explanation')
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

  const loadAnswerCount = async (questionIndex: number) => {
    const { count, error: answersError } = await supabase
      .from('answers')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('question_index', questionIndex);

    if (answersError) return;
    setAnswerCount(count || 0);
  };

  const fetchSummaryData = async () => {
    const [questionsResult, answersResult] = await Promise.all([
      supabase
        .from('questions')
        .select('text, order, difficulty, points, option_a, option_b, option_c, option_d, correct_answer, explanation')
        .order('order', { ascending: true }),
      supabase
        .from('answers')
        .select('player_id, text, submitted_at, is_correct, points_earned, question_index')
        .eq('room_id', roomId)
        .order('question_index', { ascending: true }),
    ]);

    if (!questionsResult.error) {
      setSummaryQuestions(questionsResult.data || []);
    }

    if (!answersResult.error) {
      setRoundAnswers(answersResult.data || []);
    }
  };

  const finishRound = async () => {
    if (isSummaryLoading) return;
    setIsSummaryLoading(true);
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ is_active: false, status: 'finished' })
      .eq('id', roomId);

    if (updateError) {
      setError('Не удалось завершить раунд, попробуйте ещё раз');
      setIsSummaryLoading(false);
      return;
    }
    await fetchSummaryData();
    await loadPlayers();
    setRoomStatus('finished');
    setShowResults(true);
    setIsSummaryLoading(false);
  };

  const startRound = async () => {
    const startedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ status: 'running', question_started_at: startedAt, current_question_index: 0 })
      .eq('id', roomId);

    if (updateError) {
      setError('Не удалось начать раунд, попробуйте ещё раз');
      return;
    }

    setRoomStatus('running');
    setShowResults(false);
    syncTimerWithStart(startedAt);
    setAnswerCount(0);
    await loadQuestion(0);
    await loadAnswerCount(0);
  };

  const nextQuestion = async () => {
    const newIndex = currentQuestionIndex + 1;
    const questionStartedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('rooms')
      .update({ current_question_index: newIndex, question_started_at: questionStartedAt })
      .eq('id', roomId);

    if (updateError) {
      setError('Ошибка при переходе к следующему вопросу');
      return;
    }

    setCurrentQuestionIndex(newIndex);
    syncTimerWithStart(questionStartedAt);
    setAnswerCount(0);
    await loadQuestion(newIndex);
    await loadAnswerCount(newIndex);
  };

  const endGame = async () => {
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ is_active: false, status: 'finished' })
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

  const answeredCount = answerCount;
  const totalPlayers = players.length;
  const isLastQuestion = currentQuestionIndex >= totalQuestions - 1;
  const canAdvance = roomStatus === 'running' && timeLeft === 0;
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / QUESTION_DURATION_SECONDS) * 100));
  const questionsForSummary = summaryQuestions.length ? summaryQuestions : question ? [question] : [];
  const isWaiting = roomStatus === 'waiting' && !showResults;

  const getOptionText = (q: Question, key: string) => {
    const options: Record<string, string> = {
      a: q.option_a,
      b: q.option_b,
      c: q.option_c,
      d: q.option_d,
    };
    return options[key] || '';
  };

  const getPlayerName = (playerId: string) =>
    players.find((player) => player.id === playerId)?.name || 'Неизвестный игрок';

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
            {/* Текущий вопрос или сводка */}
            {showResults ? (
              <div className="bg-white rounded-2xl shadow-2xl p-8">
                <h2 className="text-3xl font-bold text-gray-800 mb-4">🏆 Результаты разминочного раунда</h2>
                <p className="text-gray-600 mb-8">
                  Ведущий видит все ответы только после завершения таймера. Очки уже начислены игрокам автоматически.
                </p>
                <div className="space-y-6">
                  {questionsForSummary.map((summaryQuestion) => {
                    const answersForQuestion = roundAnswers.filter(
                      (answer) => answer.question_index === summaryQuestion.order - 1
                    );

                    return (
                      <div key={summaryQuestion.order} className="border border-gray-200 rounded-xl p-6">
                        <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
                          <span>Вопрос {summaryQuestion.order} · {summaryQuestion.difficulty}</span>
                          <span className="font-semibold text-purple-600">{summaryQuestion.points} 💎</span>
                        </div>
                        <p className="text-xl font-semibold text-gray-900 mb-3">{summaryQuestion.text}</p>
                        <p className="text-green-700 font-medium mb-2">
                          Правильный ответ: {OPTION_LABELS[summaryQuestion.correct_answer]} — {getOptionText(summaryQuestion, summaryQuestion.correct_answer)}
                        </p>
                        {summaryQuestion.explanation && (
                          <p className="text-gray-600 text-sm mb-4">💡 {summaryQuestion.explanation}</p>
                        )}
                        <div className="space-y-3">
                          {answersForQuestion.length === 0 ? (
                            <p className="text-gray-500 text-sm">Никто не ответил на этот вопрос.</p>
                          ) : (
                            answersForQuestion.map((answer) => (
                              <div
                                key={`${answer.player_id}-${answer.question_index}`}
                                className={`p-3 rounded-lg border ${
                                  answer.is_correct ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold text-gray-800">{getPlayerName(answer.player_id)}</span>
                                  <span className={`text-sm font-bold ${answer.is_correct ? 'text-green-700' : 'text-red-700'}`}>
                                    {answer.is_correct ? `+${answer.points_earned} 💎` : '0 💎'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">
                                  Ответ: {OPTION_LABELS[answer.text] || answer.text}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : isWaiting ? (
              <div className="bg-white rounded-2xl shadow-2xl p-8">
                <h2 className="text-3xl font-bold text-gray-800 mb-4">⌛ Ожидание игроков</h2>
                <p className="text-gray-600 mb-6">
                  Комната открыта. Поделитесь кодом <span className="font-mono font-semibold text-purple-600 text-lg">{roomCode}</span> и дождитесь, пока все подключатся.
                </p>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-3 text-gray-700">
                    <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-semibold flex items-center justify-center">1</span>
                    Игроки вводят код комнаты на своих устройствах.
                  </li>
                  <li className="flex items-center gap-3 text-gray-700">
                    <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-semibold flex items-center justify-center">2</span>
                    Вы видите всех подключившихся справа в списке игроков.
                  </li>
                  <li className="flex items-center gap-3 text-gray-700">
                    <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-semibold flex items-center justify-center">3</span>
                    Как только все готовы, нажмите кнопку ниже, чтобы запустить таймер и показать первый вопрос.
                  </li>
                </ul>

                <button
                  onClick={startRound}
                  disabled={players.length === 0}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  Начать игру →
                </button>
                {players.length === 0 && (
                  <p className="text-sm text-gray-500 text-center mt-3">Нужно как минимум 1 игрок, чтобы начать.</p>
                )}
              </div>
            ) : question ? (
              <div className="bg-white rounded-2xl shadow-2xl p-8">
                <div className="flex justify-between items-center mb-4">
                  <span className="bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold">
                    Вопрос {question.order} из {totalQuestions}
                  </span>
                  <span className="text-gray-600">
                    Ответили: <span className="font-bold text-purple-600">{answeredCount}/{totalPlayers}</span>
                  </span>
                </div>

                <div className="mb-6">
                  <div className="flex justify-between text-sm text-gray-500 mb-2">
                    <span>Таймер · 30 секунд</span>
                    <span className="font-semibold text-gray-800">{timeLeft} c</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${timeLeft > 5 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>
                </div>

                <h2 className="text-3xl font-bold text-gray-800 mb-8">
                  {question.text}
                </h2>

                <button
                  onClick={isLastQuestion ? finishRound : nextQuestion}
                  disabled={!canAdvance || (isLastQuestion && isSummaryLoading)}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  {isLastQuestion ? 'Показать результаты' : 'Следующий вопрос →'}
                </button>

                <p className="text-center text-sm text-gray-500 mt-3">
                  {canAdvance
                    ? isLastQuestion
                      ? 'Можно завершать раунд и показывать ответы.'
                      : 'Таймер завершён, можно перейти к следующему вопросу.'
                    : 'Ответы будут скрыты до окончания таймера.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  🎉 Раунд завершён
                </h2>
                <p className="text-gray-600">Все вопросы были показаны.</p>
              </div>
            )}

            {/* Блок ответов */}
            {showResults ? (
              <div className="bg-white rounded-2xl shadow-2xl p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4">💬 Итоги по ответам</h3>
                {roundAnswers.length === 0 ? (
                  <p className="text-gray-500">Пока нет данных по ответам.</p>
                ) : (
                  <p className="text-gray-600">Каждый ответ отображён в карточках выше — объявите очки и объяснения игрокам.</p>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-2xl p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-2">💬 Ответы игроков</h3>
                {isWaiting ? (
                  <p className="text-gray-600">Ответы появятся, когда вы запустите игру. Пока можно следить за списком подключившихся.</p>
                ) : (
                  <>
                    <p className="text-gray-600">
                      Ответы скрыты до окончания раунда. Ведущий увидит их автоматически после таймера.
                    </p>
                    <p className="text-sm text-gray-500 mt-4">
                      Успели ответить: <span className="font-semibold text-purple-600">{answeredCount}/{totalPlayers}</span>
                    </p>
                  </>
                )}
              </div>
            )}
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
                {players.map((player, index) => (
                  <div
                    key={player.id}
                    className="p-3 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {index < 3 && (
                        <span className="text-lg">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                        </span>
                      )}
                      <span className="font-medium text-gray-700">{player.name}</span>
                    </div>
                    <span className="font-bold text-purple-600 text-sm">
                      {player.total_points} 💎
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
