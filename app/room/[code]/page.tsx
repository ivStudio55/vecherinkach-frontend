'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  ActiveRoundQuestion,
  OPTION_LABELS,
  getOptionKeyByIndex,
  getQuestionForIndex,
} from '@/lib/questions';

const QUESTION_DURATION_SECONDS = 30;
const APP_VERSION = '1.0.4'; // Инкрементируйте при важных изменениях

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
  const remaining = QUESTION_DURATION_SECONDS - elapsedSeconds;
  return Math.max(0, Math.min(QUESTION_DURATION_SECONDS, remaining));
};

type Question = ActiveRoundQuestion;

type RoomStatus = 'waiting' | 'running' | 'finished';

type RoomUpdatePayload = {
  new: {
    current_question_index: number;
    question_started_at: string | null;
    status: RoomStatus;
    is_active: boolean;
    all_players_answered: boolean;
    selected_question_ids: number[] | null;
  };
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;

  const [question, setQuestion] = useState<Question | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [error, setError] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [roomId, setRoomId] = useState('');
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_DURATION_SECONDS);
  const [showResults, setShowResults] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('waiting');
  const [allPlayersAnswered, setAllPlayersAnswered] = useState(false);
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const roomIdRef = useRef('');
  const playerIdRef = useRef('');

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
      console.error('Не удалось синхронизировать время сервера', error);
    }
    return timeOffsetMs;
  }, [timeOffsetMs]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  const loadQuestionFromSelection = useCallback(
    (questionIndex: number, selectionOverride?: number[]) => {
      const selection = selectionOverride && selectionOverride.length ? selectionOverride : selectedQuestionIds;
      if (!selection.length) {
        setQuestion(null);
        return;
      }
      const nextQuestion = getQuestionForIndex(selection, questionIndex);
      if (!nextQuestion) {
        setQuestion(null);
        return;
      }
      setQuestion(nextQuestion);
    },
    [selectedQuestionIds]
  );
  const loadQuestionFromSelectionRef = useRef(loadQuestionFromSelection);
  const syncServerTimeRef = useRef(syncServerTime);

  useEffect(() => {
    loadQuestionFromSelectionRef.current = loadQuestionFromSelection;
  }, [loadQuestionFromSelection]);

  useEffect(() => {
    syncServerTimeRef.current = syncServerTime;
  }, [syncServerTime]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Проверка версии и принудительное обновление
      const storedVersion = localStorage.getItem('appVersion');
      if (storedVersion !== APP_VERSION) {
        console.log('New version detected, clearing cache');
        localStorage.setItem('appVersion', APP_VERSION);
        // Даём браузеру время обновить кеш
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const storedPlayerId = localStorage.getItem('playerId');
      const name = localStorage.getItem('playerName');

      if (!storedPlayerId || !name) {
        router.push('/');
        return;
      }

      setPlayerName(name);

      setPlayerId(storedPlayerId);
      playerIdRef.current = storedPlayerId;

      const offset = await syncServerTimeRef.current?.();

      // Получаем данные комнаты
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select(
          'id, current_question_index, is_active, status, question_started_at, all_players_answered, selected_question_ids'
        )
        .eq('code', roomCode)
        .single();

      if (roomError || !room) {
        setError('Комната не найдена');
        setIsLoading(false);
        return;
      }

  setRoomId(room.id);
  roomIdRef.current = room.id;
      const selection = (room.selected_question_ids as number[] | null) || [];
      setSelectedQuestionIds(selection);
      const detectedStatus = (room.status as RoomStatus) || (room.is_active ? 'waiting' : 'finished');
      setRoomStatus(detectedStatus);
      setAllPlayersAnswered(detectedStatus === 'running' ? !!room.all_players_answered : false);

      if (detectedStatus === 'waiting') {
        setShowResults(false);
        setHasAnswered(false);
        setQuestion(null);
        setQuestionStartedAt(null);
        setTimeLeft(QUESTION_DURATION_SECONDS);
        setIsLoading(false);
      } else if (!room.is_active || detectedStatus === 'finished') {
        setShowResults(true);
        setQuestion(null);
        setQuestionStartedAt(null);
        setIsLoading(false);
      } else {
        const startTime = room.question_started_at;
        setQuestionStartedAt(startTime);
        const initialTime = getRemainingSeconds(startTime, offset);
        setTimeLeft(room.all_players_answered ? 0 : initialTime);

        loadQuestionFromSelectionRef.current?.(room.current_question_index, selection);

        // Проверяем, ответил ли игрок на текущий вопрос
        const { data: existingAnswer } = await supabase
          .from('answers')
          .select('id')
          .eq('player_id', storedPlayerId)
          .eq('room_id', room.id)
          .eq('question_index', room.current_question_index)
          .single();

        if (existingAnswer) {
          setHasAnswered(true);
        }

        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [roomCode, router]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    let mounted = true;
    const channelId = `${roomId}-${Date.now()}`;

    const roomChannel = supabase
      .channel(`player-room-${roomId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        async (payload: RoomUpdatePayload) => {
          if (!mounted) {
            return;
          }

          const newQuestionIndex = payload.new.current_question_index;
          const startedAt = payload.new.question_started_at as string | null;
          const newStatus = (payload.new.status as RoomStatus) || (payload.new.is_active ? 'waiting' : 'finished');
          setRoomStatus(newStatus);
          const everyoneAnsweredFlag = newStatus === 'running' ? !!payload.new.all_players_answered : false;
          setAllPlayersAnswered(everyoneAnsweredFlag);
          const selection = (payload.new.selected_question_ids as number[] | null) || [];
          setSelectedQuestionIds(selection);

          if (newStatus === 'waiting') {
            setShowResults(false);
            setHasAnswered(false);
            setQuestion(null);
            setQuestionStartedAt(null);
            setTimeLeft(QUESTION_DURATION_SECONDS);
            return;
          }

          if (newStatus === 'finished' || !payload.new.is_active) {
            setShowResults(true);
            setQuestion(null);
            setQuestionStartedAt(null);
            setTimeLeft(QUESTION_DURATION_SECONDS);
            return;
          }

          const offset = await syncServerTimeRef.current?.();
          loadQuestionFromSelectionRef.current?.(newQuestionIndex, selection);
          setQuestionStartedAt(startedAt);
          if (everyoneAnsweredFlag) {
            setTimeLeft(0);
          } else {
            setTimeLeft(startedAt ? getRemainingSeconds(startedAt, offset || 0) : QUESTION_DURATION_SECONDS);
          }

          const currentPlayerId = playerIdRef.current;
          const currentRoomId = roomIdRef.current;

          if (currentPlayerId && currentRoomId) {
            const { data: newAnswer } = await supabase
              .from('answers')
              .select('id')
              .eq('player_id', currentPlayerId)
              .eq('room_id', currentRoomId)
              .eq('question_index', newQuestionIndex)
              .single();
            setHasAnswered(!!newAnswer);
          } else {
            setHasAnswered(false);
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      roomChannel.unsubscribe().then(() => {
        supabase.removeChannel(roomChannel);
      });
    };
  }, [roomId]);

  const effectiveTimeLeft = allPlayersAnswered ? 0 : timeLeft;
  const timerActive =
    !allPlayersAnswered && !showResults && roomStatus === 'running' && Boolean(questionStartedAt);

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

  const submitAnswer = async (optionKey: string) => {
    setError('');
    setIsSubmitting(true);

    try {
      if (roomStatus !== 'running') {
        setError('Дождитесь начала раунда, чтобы отвечать');
        setIsSubmitting(false);
        return;
      }

      if (allPlayersAnswered) {
        setError('Этот вопрос уже закрыт — ждём следующий.');
        setIsSubmitting(false);
        return;
      }

      if (effectiveTimeLeft <= 0) {
        setError('Время на ответ истекло');
        setIsSubmitting(false);
        return;
      }

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
      const correctAnswerKey = getOptionKeyByIndex(question.correctIndex);
      const isCorrect = optionKey === correctAnswerKey;
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Ошибка: ${message}`);
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

  const progressPercent = Math.max(0, Math.min(100, (effectiveTimeLeft / QUESTION_DURATION_SECONDS) * 100));
  const timerLabel = allPlayersAnswered ? 'Все ответили' : `${effectiveTimeLeft} c`;

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
                <span className={`font-semibold ${allPlayersAnswered ? 'text-green-700' : 'text-gray-800'}`}>
                  {timerLabel}
                </span>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${effectiveTimeLeft > 5 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              {allPlayersAnswered && (
                <p className="text-sm text-green-100 font-semibold mt-2">
                  Все уже ответили — ждём следующего вопроса.
                </p>
              )}
            </div>

            {!hasAnswered ? (
              <div className="space-y-6 mt-auto">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-4">
                    Выберите правильный ответ:
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {question.options.map((optionText, index) => {
                      const optionKey = getOptionKeyByIndex(index);
                      return (
                        <button
                          key={optionKey}
                          onClick={() => submitAnswer(optionKey)}
                          disabled={isSubmitting || effectiveTimeLeft <= 0 || roomStatus !== 'running'}
                          className="w-full text-left px-6 py-4 bg-white border-2 border-purple-300 hover:border-purple-500 hover:bg-purple-50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex-shrink-0 w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold group-hover:bg-purple-600">
                              {OPTION_LABELS[optionKey]}
                            </span>
                            <span className="text-gray-800 font-medium">{optionText}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 px-4 py-3 rounded-lg">
                  <span className="font-semibold">Награда за вопрос</span>
                  <span className="font-bold text-purple-600">
                    {question.points} баллов
                  </span>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                {effectiveTimeLeft <= 0 && (
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
