'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  ActiveRoundQuestion,
  OptionKey,
  OPTION_LABELS,
  ROUND_QUESTION_COUNT,
  buildQuestionsFromSelection,
  getOptionIndexFromKey,
  getOptionKeyByIndex,
  getQuestionForIndex,
  hasEnoughQuestions,
  pickRandomQuestionIds,
} from '@/lib/questions';

const QUESTION_DURATION_SECONDS = 30;

const getRemainingSeconds = (startedAt: string | null, offsetMs = 0) => {
  if (!startedAt) {
    return QUESTION_DURATION_SECONDS;
  }
  const startTime = new Date(startedAt).getTime();
  if (isNaN(startTime)) {
    return QUESTION_DURATION_SECONDS;
  }
  const now = Date.now() - offsetMs;
  const diffMs = now - startTime;
  const elapsedSeconds = Math.floor(diffMs / 1000);
  return Math.max(0, QUESTION_DURATION_SECONDS - elapsedSeconds);
};

type Question = ActiveRoundQuestion;

type AnswerInsertPayload = {
  new: {
    question_index: number;
  };
};

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
  const [answeredPlayerIds, setAnsweredPlayerIds] = useState<string[]>([]);
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_DURATION_SECONDS);
  const [showResults, setShowResults] = useState(false);
  const [roundAnswers, setRoundAnswers] = useState<RoundAnswer[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('waiting');
  const [serverAllPlayersAnswered, setServerAllPlayersAnswered] = useState(false);
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);

  const syncServerTime = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('get_server_time');
      if (data) {
        const serverNow = new Date(data as string).getTime();
        const offset = Date.now() - serverNow;
        setTimeOffsetMs(offset);
        return offset;
      }
    } catch (error) {
      console.error('Не удалось синхронизировать время сервера (host)', error);
    }
    return timeOffsetMs;
  }, [timeOffsetMs]);

  const getServerIsoTimestamp = async () => {
    const offset = await syncServerTime();
    const serverNow = new Date(Date.now() - offset).toISOString();
    return { iso: serverNow, offset };
  };

  const syncTimerWithStart = useCallback(
    (startedAt: string | null, offsetOverride?: number) => {
      const effectiveOffset = typeof offsetOverride === 'number' ? offsetOverride : timeOffsetMs;
      setQuestionStartedAt(startedAt);
      setTimeLeft(getRemainingSeconds(startedAt, effectiveOffset));
    },
    [timeOffsetMs]
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const summaryQuestions = useMemo<Question[]>(() => {
    if (!selectedQuestionIds.length) {
      return [];
    }
    return buildQuestionsFromSelection(selectedQuestionIds);
  }, [selectedQuestionIds]);

  const loadQuestionFromSelection = useCallback(
    (questionIndex: number, selectionOverride?: number[]) => {
      const sourceSelection = selectionOverride && selectionOverride.length ? selectionOverride : selectedQuestionIds;
      if (!sourceSelection.length) {
        setQuestion(null);
        return;
      }
      const nextQuestion = getQuestionForIndex(sourceSelection, questionIndex);
      if (!nextQuestion) {
        setQuestion(null);
        return;
      }
      setQuestion(nextQuestion);
    },
    [selectedQuestionIds]
  );

  const loadPlayers = useCallback(async () => {
    const { data, error: playersError } = await supabase
      .from('players')
      .select('id, name, total_points')
      .eq('room_id', roomId)
      .order('total_points', { ascending: false });

    if (playersError) return;
    setPlayers(data || []);
  }, [roomId]);

  const loadAnswerCount = useCallback(
    async (questionIndex: number) => {
      const { data, count, error: answersError } = await supabase
        .from('answers')
        .select('player_id', { count: 'exact' })
        .eq('room_id', roomId)
        .eq('question_index', questionIndex);

      if (answersError) {
        setAnsweredPlayerIds([]);
        return;
      }
      setAnswerCount(count || 0);
      const answeredIds = Array.from(new Set((data || []).map((answer) => answer.player_id)));
      setAnsweredPlayerIds(answeredIds);
    },
    [roomId]
  );

  const fetchSummaryData = useCallback(async () => {
    const { data, error: answersError } = await supabase
      .from('answers')
      .select('player_id, text, submitted_at, is_correct, points_earned, question_index')
      .eq('room_id', roomId)
      .order('question_index', { ascending: true });

    if (!answersError) {
      setRoundAnswers(data || []);
    }
  }, [roomId]);

  const loadRoomData = useCallback(
    async (offsetOverride?: number) => {
      const effectiveOffset = typeof offsetOverride === 'number' ? offsetOverride : timeOffsetMs;
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select(
          'code, current_question_index, question_started_at, status, all_players_answered, selected_question_ids'
        )
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        setError('Комната не найдена');
        return;
      }

      const selection = (room.selected_question_ids as number[] | null) || [];
      setSelectedQuestionIds(selection);
      setRoomCode(room.code);
      setCurrentQuestionIndex(room.current_question_index);
      const detectedStatus = (room.status as RoomStatus) || 'waiting';
      setRoomStatus(detectedStatus);
      setServerAllPlayersAnswered(detectedStatus === 'running' ? !!room.all_players_answered : false);

      if (detectedStatus === 'running') {
        syncTimerWithStart(room.question_started_at, effectiveOffset);
        if (room.all_players_answered) {
          setTimeLeft(0);
        }
        loadQuestionFromSelection(room.current_question_index, selection);
        await loadAnswerCount(room.current_question_index);
      } else if (detectedStatus === 'finished') {
        setShowResults(true);
        setAnswerCount(0);
        setAnsweredPlayerIds([]);
        setServerAllPlayersAnswered(false);
        await fetchSummaryData();
      } else {
        setQuestion(null);
        setAnswerCount(0);
        setAnsweredPlayerIds([]);
        setQuestionStartedAt(null);
        setTimeLeft(QUESTION_DURATION_SECONDS);
        setServerAllPlayersAnswered(false);
      }

      await loadPlayers();
    },
    [
      timeOffsetMs,
      roomId,
      loadQuestionFromSelection,
      loadAnswerCount,
      fetchSummaryData,
      loadPlayers,
      syncTimerWithStart,
    ]
  );

  useEffect(() => {
    const init = async () => {
      // Проверяем авторизацию ведущего
      const hostRoomId = localStorage.getItem('hostRoomId');
      if (hostRoomId !== roomId) {
        router.push('/host');
        return;
      }

      const offset = await syncServerTime();
      await loadRoomData(offset);
      setIsLoading(false);
    };

    init();
  }, [roomId, router, loadRoomData, syncServerTime]);

  useEffect(() => {
    if (!roomId) return;

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
        async (payload: AnswerInsertPayload) => {
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
  }, [roomId, loadPlayers, loadAnswerCount]);

  const everyoneAnswered = players.length > 0 && answerCount >= players.length;
  const shouldForceZero = serverAllPlayersAnswered || everyoneAnswered;
  const timerActive =
    !showResults && roomStatus === 'running' && Boolean(questionStartedAt) && !shouldForceZero;

  useEffect(() => {
    if (!timerActive || !questionStartedAt) {
      return;
    }

    const tick = () => {
      const remaining = getRemainingSeconds(questionStartedAt, timeOffsetMs);
      setTimeLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [timerActive, questionStartedAt, timeOffsetMs]);

  useEffect(() => {
    if (!roomId || roomStatus !== 'running') {
      return;
    }

    const totalPlayers = players.length;
    if (totalPlayers === 0) {
      return;
    }

    const everyoneAnswered = answerCount >= totalPlayers;
    if (everyoneAnswered === serverAllPlayersAnswered) {
      return;
    }

    const updateFlag = async () => {
      const { error } = await supabase
        .from('rooms')
        .update({ all_players_answered: everyoneAnswered })
        .eq('id', roomId);

      if (error) {
        console.error('Не удалось обновить статус ответов игроков', error);
        return;
      }
      setServerAllPlayersAnswered(everyoneAnswered);
    };

    updateFlag();
  }, [answerCount, players.length, roomId, roomStatus, serverAllPlayersAnswered]);


  const finishRound = async () => {
    if (isSummaryLoading) return;
    setIsSummaryLoading(true);
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ is_active: false, status: 'finished', all_players_answered: false })
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
    setAnsweredPlayerIds([]);
    setIsSummaryLoading(false);
  };

  const startRound = async () => {
    if (!hasEnoughQuestions(ROUND_QUESTION_COUNT)) {
      setError('Недостаточно вопросов для начала игры. Пополните список раунда.');
      return;
    }

    const questionIds = pickRandomQuestionIds(ROUND_QUESTION_COUNT);
    const { iso: startedAt, offset } = await getServerIsoTimestamp();
    const { error: updateError } = await supabase
      .from('rooms')
      .update({
        status: 'running',
        question_started_at: startedAt,
        current_question_index: 0,
        all_players_answered: false,
        selected_question_ids: questionIds,
      })
      .eq('id', roomId);

    if (updateError) {
      setError('Не удалось начать раунд, попробуйте ещё раз');
      return;
    }

    setRoomStatus('running');
    setShowResults(false);
    setServerAllPlayersAnswered(false);
    setSelectedQuestionIds(questionIds);
    syncTimerWithStart(startedAt, offset);
    setAnswerCount(0);
    setAnsweredPlayerIds([]);
    loadQuestionFromSelection(0, questionIds);
    await loadAnswerCount(0);
  };

  const nextQuestion = async () => {
    const newIndex = currentQuestionIndex + 1;
    const { iso: questionStartedAt, offset } = await getServerIsoTimestamp();

    const { error: updateError } = await supabase
      .from('rooms')
      .update({ current_question_index: newIndex, question_started_at: questionStartedAt, all_players_answered: false })
      .eq('id', roomId);

    if (updateError) {
      setError('Ошибка при переходе к следующему вопросу');
      return;
    }

    setCurrentQuestionIndex(newIndex);
    setServerAllPlayersAnswered(false);
    syncTimerWithStart(questionStartedAt, offset);
    setAnswerCount(0);
    setAnsweredPlayerIds([]);
    loadQuestionFromSelection(newIndex);
    await loadAnswerCount(newIndex);
  };

  const endGame = async () => {
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ is_active: false, status: 'finished', all_players_answered: false })
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

  const effectiveTimeLeft = shouldForceZero ? 0 : timeLeft;
  const answeredCount = answerCount;
  const totalPlayers = players.length;
  const totalQuestions = selectedQuestionIds.length || ROUND_QUESTION_COUNT;
  const allPlayersAnswered = serverAllPlayersAnswered || (totalPlayers > 0 && answeredCount >= totalPlayers);
  const isLastQuestion = totalQuestions > 0 ? currentQuestionIndex >= totalQuestions - 1 : false;
  const canAdvance = roomStatus === 'running' && (effectiveTimeLeft === 0 || allPlayersAnswered);
  const progressPercent = Math.max(0, Math.min(100, (effectiveTimeLeft / QUESTION_DURATION_SECONDS) * 100));
  const questionsForSummary = summaryQuestions.length ? summaryQuestions : question ? [question] : [];
  const isWaiting = roomStatus === 'waiting' && !showResults;

  const getOptionText = (q: Question, keyOrIndex: string | number) => {
    const index = typeof keyOrIndex === 'number' ? keyOrIndex : getOptionIndexFromKey(keyOrIndex);
    return q.options[index] || '';
  };

  const formatOptionLabel = (key: string) => {
    const normalizedKey = key as OptionKey;
    return OPTION_LABELS[normalizedKey] || key;
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
                  {questionsForSummary.map((summaryQuestion: Question) => {
                    const answersForQuestion = roundAnswers.filter(
                      (answer) => answer.question_index === summaryQuestion.order - 1
                    );
                    const correctKey = getOptionKeyByIndex(summaryQuestion.correctIndex);
                    const correctText = getOptionText(summaryQuestion, summaryQuestion.correctIndex);

                    return (
                      <div key={summaryQuestion.order} className="border border-gray-200 rounded-xl p-6">
                        <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
                          <span>Вопрос {summaryQuestion.order}</span>
                          <span className="font-semibold text-purple-600">{summaryQuestion.points} 💎</span>
                        </div>
                        <p className="text-xl font-semibold text-gray-900 mb-3">{summaryQuestion.text}</p>
                        <p className="text-green-700 font-medium mb-4">
                          Правильный ответ: {OPTION_LABELS[correctKey]} — {correctText}
                        </p>
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
                                  Ответ: {formatOptionLabel(answer.text)} — {getOptionText(summaryQuestion, answer.text)}
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
                    <span className="font-semibold text-gray-800">
                      {allPlayersAnswered ? 'Все ответили' : `${effectiveTimeLeft} c`}
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${effectiveTimeLeft > 5 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>
                  {allPlayersAnswered && (
                    <p className="text-sm text-green-700 font-semibold mt-2">
                      Все игроки ответили — можно двигаться дальше.
                    </p>
                  )}
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
                      ? (allPlayersAnswered ? 'Все игроки ответили — можно завершать раунд и показывать ответы.' : 'Можно завершать раунд и показывать ответы.')
                      : (allPlayersAnswered ? 'Все игроки ответили — переходите к следующему вопросу.' : 'Таймер завершён, можно перейти к следующему вопросу.')
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
                {players.map((player, index) => {
                  const hasAnswered = answeredPlayerIds.includes(player.id);
                  return (
                    <div
                      key={player.id}
                      className={`p-3 rounded-lg border flex items-center justify-between ${
                        hasAnswered ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {index < 3 && (
                          <span className="text-lg">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                          </span>
                        )}
                        <span
                          className={`w-2 h-2 rounded-full ${hasAnswered ? 'bg-green-500' : 'bg-gray-300'}`}
                          aria-hidden="true"
                        ></span>
                        <div>
                          <span className="font-medium text-gray-700 block">{player.name}</span>
                          {roomStatus === 'running' && question && (
                            <span
                              className={`text-xs font-semibold ${
                                hasAnswered ? 'text-green-700' : 'text-gray-500'
                              }`}
                            >
                              {hasAnswered ? '✅ Ответ получен' : '⌛ Ждём ответ'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-purple-600 text-sm block">
                          {player.total_points} 💎
                        </span>
                      </div>
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
