'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
const JOIN_SOUND_FILES = [
  'The_duck_quacked_fun_#1.mp3',
  'The_duck_quacked_fun_#2.mp3',
  'The_duck_quacked_fun_#3.mp3',
  'The_duck_quacked_fun_#4.mp3',
  'The_duk_quacked_funn_#1.mp3',
  'The_duk_quacked_funn_#2.mp3',
  'The_duk_quacked_funn_#3.mp3',
  'The_duk_quacked_funn_#4.mp3',
] as const;

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
  const [isLobbySoundOn, setIsLobbySoundOn] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [isJoinSoundEnabled, setIsJoinSoundEnabled] = useState(true);

  const lobbyAudioRef = useRef<HTMLAudioElement | null>(null);
  const startAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasUserInteractedRef = useRef(false);
  const lastJoinAudioRef = useRef<HTMLAudioElement | null>(null);
  const previousPlayerIdsRef = useRef<Set<string>>(new Set());
  const hasSnapshotRef = useRef(false);

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
      try {
        const effectiveOffset = typeof offsetOverride === 'number' ? offsetOverride : timeOffsetMs;
        const { data: room, error: roomError } = await supabase
          .from('rooms')
          .select(
            'code, current_question_index, question_started_at, status, all_players_answered, selected_question_ids'
          )
          .eq('id', roomId)
          .single();

        if (roomError || !room) {
          console.error('Room not found or error:', roomError);
          setError('Комната не найдена или недоступна');
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
      } catch (err) {
        console.error('Error loading room data:', err);
        setError('Ошибка загрузки данных комнаты');
      }
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

  const loadPlayersRef = useRef(loadPlayers);
  const loadAnswerCountRef = useRef(loadAnswerCount);
  const loadRoomDataRef = useRef(loadRoomData);
  const syncServerTimeRef = useRef(syncServerTime);
  const roomStatusRef = useRef(roomStatus);

  useEffect(() => {
    roomStatusRef.current = roomStatus;
  }, [roomStatus]);

  useEffect(() => {
    loadPlayersRef.current = loadPlayers;
  }, [loadPlayers]);

  useEffect(() => {
    loadAnswerCountRef.current = loadAnswerCount;
  }, [loadAnswerCount]);

  useEffect(() => {
    loadRoomDataRef.current = loadRoomData;
  }, [loadRoomData]);

  useEffect(() => {
    syncServerTimeRef.current = syncServerTime;
  }, [syncServerTime]);


  useEffect(() => {
    const lobbyAudio = new Audio('/audio/jingle-lobby.mp3');
    lobbyAudio.loop = true;
    lobbyAudio.volume = 0.45;
    lobbyAudioRef.current = lobbyAudio;

    const startAudio = new Audio('/audio/start.mp3');
    startAudio.loop = false;
    startAudio.volume = 0.9;
    startAudioRef.current = startAudio;

    return () => {
      lobbyAudio.pause();
      startAudio.pause();
      lobbyAudioRef.current = null;
      startAudioRef.current = null;
    };
  }, []);

  const tryPlayLobby = useCallback(async () => {
    const audio = lobbyAudioRef.current;
    if (!audio) return;
    setAudioError('');
    try {
      await audio.play();
      setIsLobbySoundOn(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Нужен жест пользователя, чтобы запустить аудио';
      setAudioError(message);
      setIsLobbySoundOn(false);
    }
  }, []);

  const stopLobby = useCallback(() => {
    const audio = lobbyAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsLobbySoundOn(false);
  }, []);

  const playStartSound = useCallback(async () => {
    const audio = startAudioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (err) {
      // если стартовый звук не проигрался — ничего страшного
      console.error('Не удалось проиграть стартовый звук', err);
    }
  }, []);

  const playJoinSound = useCallback(async () => {
    if (!hasUserInteractedRef.current || !isJoinSoundEnabled) {
      return;
    }
    const fileName = JOIN_SOUND_FILES[Math.floor(Math.random() * JOIN_SOUND_FILES.length)];
    const url = `/api/jingle/audio?file=${encodeURIComponent(fileName)}&t=${Date.now()}`;
    const audio = new Audio(url);
    audio.volume = 0.75;
    lastJoinAudioRef.current = audio;
    try {
      await audio.play();
    } catch (err) {
      console.error('Не удалось проиграть звук подключения', err);
    }
  }, [isJoinSoundEnabled]);

  useEffect(() => {
    const currentIds = new Set(players.map((player) => player.id));

    if (!hasSnapshotRef.current) {
      hasSnapshotRef.current = true;
      previousPlayerIdsRef.current = currentIds;
      return;
    }

    const previousIds = previousPlayerIdsRef.current;
    let hasNewPlayer = false;
    for (const id of currentIds) {
      if (!previousIds.has(id)) {
        hasNewPlayer = true;
        break;
      }
    }

    if (hasNewPlayer) {
      void playJoinSound();
    }

    previousPlayerIdsRef.current = currentIds;
  }, [players, playJoinSound]);

  const handleHostInteraction = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      hasUserInteractedRef.current = true;
      if (roomStatusRef.current === 'waiting') {
        void tryPlayLobby();
      }
    }
  }, [tryPlayLobby]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const hostRoomId = localStorage.getItem('hostRoomId');
      if (hostRoomId !== roomId) {
        router.push('/host');
        return;
      }

      const offset = await syncServerTimeRef.current?.();
      await loadRoomDataRef.current?.(offset);
      if (!cancelled) {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [roomId, router]);

  useEffect(() => {
    if (!roomId) return undefined;

    let mounted = true;
    const channelId = `${Date.now()}`;

    const invokeLoadRoomData = async () => {
      if (!mounted) return;
      await loadRoomDataRef.current?.();
    };

    const roomChannel = supabase
      .channel(`host-room-${roomId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        invokeLoadRoomData
      )
      .subscribe();

    const playersChannel = supabase
      .channel(`host-players-${roomId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          if (mounted) {
            loadPlayersRef.current?.();
          }
        }
      )
      .subscribe();

    const answersChannel = supabase
      .channel(`host-answers-${roomId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'answers',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload: AnswerInsertPayload) => {
          if (!mounted) return;
          const { data: room } = await supabase
            .from('rooms')
            .select('current_question_index')
            .eq('id', roomId)
            .single();

          if (mounted && room && payload.new.question_index === room.current_question_index) {
            await loadAnswerCountRef.current?.(room.current_question_index);
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      roomChannel.unsubscribe().then(() => {
        supabase.removeChannel(roomChannel);
      });
      playersChannel.unsubscribe().then(() => {
        supabase.removeChannel(playersChannel);
      });
      answersChannel.unsubscribe().then(() => {
        supabase.removeChannel(answersChannel);
      });
    };
  }, [roomId]);

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

    stopLobby();
    await playStartSound();

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
      <div
        className="min-h-screen flex items-center justify-center bg-[#fef4dc] text-[#142a45]"
        onClick={handleHostInteraction}
      >
        <div className="rounded-3xl border-[4px] border-[#142a45] bg-white px-6 py-4 text-xl font-black">
          Загрузка панели ведущего…
        </div>
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

  const statusLabel =
    roomStatus === 'waiting'
      ? 'Ожидание игроков'
      : roomStatus === 'running'
        ? 'Раунд в эфире'
        : 'Итоги раунда';
  const statusBadgeClass =
    roomStatus === 'running'
      ? 'bg-[#f1532f] text-[#ffeccd]'
      : roomStatus === 'waiting'
        ? 'bg-[#ffe184] text-[#142a45]'
        : 'bg-[#1f6ac6] text-white';

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-8" onClick={handleHostInteraction}>
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="retro-panel bg-[#142a45] text-[#ffeccd] px-6 py-5 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="retro-heading text-[11px] tracking-[0.5em] text-[#ffeccd]/70">Панель ведущего</p>
              <h1 className="text-3xl font-black leading-tight">Комната {roomCode || '----'}</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-4 py-2 rounded-full text-xs font-bold tracking-[0.3em] ${statusBadgeClass}`}>
                {statusLabel.toUpperCase()}
              </span>
              <button
                type="button"
                onClick={endGame}
                className="px-4 py-2 rounded-2xl border-[3px] border-[#ffeccd] text-[#ffeccd] font-semibold hover:bg-[#ffeccd]/10 transition"
              >
                Завершить игру
              </button>
            </div>
          </div>
          <p className="text-sm text-[#ffeccd]/80">
            Управляйте раундом, запускайте таймеры и следите за списком игроков. Все действия синхронизируются через Supabase в реальном времени.
          </p>
        </header>

        {error && (
          <div className="rounded-3xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.45fr,0.55fr]">
          <div className="space-y-6">
            {showResults ? (
              <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Итоги раунда</p>
                    <h2 className="text-3xl font-black">🏆 Результаты</h2>
                  </div>
                  <span className="text-sm font-semibold text-[#1f6ac6]">Очки уже начислены игрокам</span>
                </div>
                <div className="space-y-4">
                  {questionsForSummary.map((summaryQuestion: Question) => {
                    const answersForQuestion = roundAnswers.filter(
                      (answer) => answer.question_index === summaryQuestion.order - 1
                    );
                    const correctKey = getOptionKeyByIndex(summaryQuestion.correctIndex);
                    const correctText = getOptionText(summaryQuestion, summaryQuestion.correctIndex);

                    return (
                      <article
                        key={summaryQuestion.order}
                        className="rounded-2xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between text-xs text-[#142a45]/70">
                          <span className="font-semibold tracking-[0.3em]">Вопрос {summaryQuestion.order}</span>
                          <span className="font-black text-[#f1532f]">+{summaryQuestion.points}💎</span>
                        </div>
                        <p className="text-lg font-semibold">{summaryQuestion.text}</p>
                        <p className="text-sm text-[#1f6ac6] font-semibold">
                          Правильный ответ: {OPTION_LABELS[correctKey]} — {correctText}
                        </p>
                        <div className="space-y-2">
                          {answersForQuestion.length === 0 ? (
                            <p className="text-xs text-[#142a45]/70">Никто не ответил на этот вопрос</p>
                          ) : (
                            answersForQuestion.map((answer) => (
                              <div
                                key={`${answer.player_id}-${answer.question_index}`}
                                className={`rounded-2xl border-[3px] px-3 py-2 text-sm flex items-center justify-between ${
                                  answer.is_correct
                                    ? 'border-[#1f6ac6]/40 bg-white'
                                    : 'border-[#f1532f]/30 bg-white'
                                }`}
                              >
                                <div>
                                  <p className="font-semibold">{getPlayerName(answer.player_id)}</p>
                                  <p className="text-xs text-[#142a45]/70">
                                    {formatOptionLabel(answer.text)} — {getOptionText(summaryQuestion, answer.text)}
                                  </p>
                                </div>
                                <span className={`font-black ${answer.is_correct ? 'text-[#1f6ac6]' : 'text-[#f1532f]'}`}>
                                  {answer.is_correct ? `+${answer.points_earned}` : '+0'}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {!questionsForSummary.length && (
                    <p className="text-sm text-[#142a45]/70">Ответов пока нет — возможно, раунд завершили слишком рано.</p>
                  )}
                </div>
              </div>
            ) : isWaiting ? (
              <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-6">
                <div className="flex flex-col gap-2">
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Сцена перед стартом</p>
                  <h2 className="text-3xl font-black">⌛ Ждём подключений</h2>
                  <p className="text-sm text-[#142a45]/80">
                    Поделитесь кодом <span className="font-mono font-black text-lg">{roomCode}</span> и следите за списком игроков справа.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      hasUserInteractedRef.current = true;
                      void (isLobbySoundOn ? stopLobby() : tryPlayLobby());
                    }}
                    className={`px-4 py-2 rounded-2xl border-[3px] font-semibold ${
                      isLobbySoundOn ? 'border-[#1f6ac6] bg-[#1f6ac6] text-white' : 'border-[#142a45] bg-[#ffe184]'
                    }`}
                  >
                    {isLobbySoundOn ? '🔊 Джингл включён' : '🎵 Включить джингл'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      hasUserInteractedRef.current = true;
                      setIsJoinSoundEnabled((prev) => !prev);
                    }}
                    className={`px-4 py-2 rounded-2xl border-[3px] font-semibold ${
                      isJoinSoundEnabled ? 'border-[#1f6ac6] bg-white text-[#1f6ac6]' : 'border-dashed border-[#142a45] bg-white'
                    }`}
                  >
                    {isJoinSoundEnabled ? '🔔 Звук подключения' : '🔕 Включить звук подключения'}
                  </button>
                </div>
                {audioError && <p className="text-xs text-[#b23324] font-semibold">{audioError}</p>}

                <ol className="space-y-3 text-sm font-semibold text-[#142a45]/80">
                  <li className="flex gap-3">
                    <span className="w-8 h-8 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">1</span>
                    Игроки заходят на `/join` и вводят код комнаты.
                  </li>
                  <li className="flex gap-3">
                    <span className="w-8 h-8 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">2</span>
                    Их имена появляются в списке справа. Сразу видно статус подключения.
                  </li>
                  <li className="flex gap-3">
                    <span className="w-8 h-8 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black">3</span>
                    Когда готовы — стартуйте раунд. Таймер и вопросы синхронизируются автоматически.
                  </li>
                </ol>

                <button
                  onClick={startRound}
                  disabled={players.length === 0}
                  className="w-full py-4 rounded-2xl font-black text-xl tracking-[0.2em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Начать игру →
                </button>
                {players.length === 0 && <p className="text-xs text-[#142a45]/60">Нужно как минимум 1 игрок.</p>}
              </div>
            ) : question ? (
              <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="px-4 py-2 rounded-full border-[3px] border-[#142a45] text-sm font-black">
                    Вопрос {question.order} / {totalQuestions}
                  </span>
                  <span className="text-sm font-semibold text-[#142a45]/70">
                    Ответили: <span className="text-[#1f6ac6]">{answeredCount}/{totalPlayers}</span>
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-[#142a45]/70 mb-1">
                    <span>Таймер · 30 сек</span>
                    <span className="font-black text-[#142a45]">
                      {allPlayersAnswered ? 'Все ответили' : `${effectiveTimeLeft} c`}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-[#ffeccd] overflow-hidden">
                    <div
                      className={`h-full ${effectiveTimeLeft > 5 ? 'bg-[#1f6ac6]' : 'bg-[#f1532f]'}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  {allPlayersAnswered && (
                    <p className="text-xs text-[#1f6ac6] font-semibold mt-2">Все игроки уже ответили — можно переходить дальше.</p>
                  )}
                </div>

                <h2 className="text-3xl font-black leading-tight">{question.text}</h2>

                <button
                  onClick={isLastQuestion ? finishRound : nextQuestion}
                  disabled={!canAdvance || (isLastQuestion && isSummaryLoading)}
                  className="w-full py-4 rounded-2xl font-black text-xl tracking-[0.2em] bg-[#1f6ac6] text-white border-[3px] border-[#142a45] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLastQuestion ? 'Показать итоги' : 'Следующий вопрос'}
                </button>

                <p className="text-xs text-[#142a45]/70">
                  {canAdvance
                    ? isLastQuestion
                      ? allPlayersAnswered
                        ? 'Все ответили — показываем результаты и обсуждаем ответы.'
                        : 'Таймер завершён, можно завершать раунд.'
                      : allPlayersAnswered
                        ? 'Все ответили — запускайте следующий вопрос.'
                        : 'Таймер остановился, переходите к следующему вопросу.'
                    : 'Ответы игроков скрыты до окончания таймера.'}
                </p>
              </div>
            ) : (
              <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 text-center space-y-3">
                <h2 className="text-2xl font-black">🎉 Раунд завершён</h2>
                <p className="text-sm text-[#142a45]/70">Все вопросы уже прозвучали. Нажмите «Показать итоги», чтобы подвести результаты.</p>
              </div>
            )}

            <div className="rounded-3xl border-[4px] border-dashed border-[#142a45]/40 bg-[#fff6da] p-5 space-y-2">
              <p className="retro-heading text-[11px] tracking-[0.5em] text-[#142a45]/70">Монитор ответов</p>
              {showResults ? (
                <p className="text-sm text-[#142a45]/80">Все ответы расшифрованы выше. Используйте карточки, чтобы обсудить вопросы и напомнить правила.</p>
              ) : isWaiting ? (
                <p className="text-sm text-[#142a45]/80">Ответы появятся, когда стартует раунд. Пока наблюдайте за количеством игроков.</p>
              ) : (
                <p className="text-sm text-[#142a45]/80">
                  Ответы скрыты до окончания таймера. Уже ответили: <span className="font-black text-[#1f6ac6]">{answeredCount}/{totalPlayers}</span>
                </p>
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Игроки</p>
                  <h3 className="text-2xl font-black">{players.length || 0} подключено</h3>
                </div>
                <span className="text-sm font-semibold text-[#1f6ac6]">{roomStatus === 'running' ? 'Эфир' : 'Подготовка'}</span>
              </div>

              {players.length === 0 ? (
                <p className="text-sm text-[#142a45]/70 text-center py-6">Пока никто не присоединился</p>
              ) : (
                <div className="space-y-3">
                  {players.map((player, index) => {
                    const hasAnswered = answeredPlayerIds.includes(player.id);
                    return (
                      <div
                        key={player.id}
                        className={`rounded-2xl border-[3px] px-3 py-3 flex items-center justify-between ${
                          hasAnswered ? 'border-[#1f6ac6]/40 bg-[#e9f0ff]' : 'border-[#142a45]/15 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full border-[3px] border-[#142a45]/30 flex items-center justify-center font-black">
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-semibold">{player.name}</p>
                            {roomStatus === 'running' && question && (
                              <p className={`text-xs font-semibold ${hasAnswered ? 'text-[#1f6ac6]' : 'text-[#142a45]/50'}`}>
                                {hasAnswered ? 'Ответ получен' : 'Ждём ответ'}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-[#f1532f]">{player.total_points} 💎</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-5 space-y-3">
              <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Состояние раунда</p>
              <div className="grid grid-cols-2 gap-3 text-sm font-semibold">
                <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-[#fff6da] px-4 py-3">
                  <p className="text-[11px] text-[#142a45]/60">Вопрос</p>
                  <p className="text-2xl font-black">{question ? question.order : showResults ? totalQuestions : 0}</p>
                </div>
                <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-[#ffe184] px-4 py-3">
                  <p className="text-[11px] text-[#142a45]/60">Игроки</p>
                  <p className="text-2xl font-black">{players.length}</p>
                </div>
                <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-white px-4 py-3">
                  <p className="text-[11px] text-[#142a45]/60">Ответы</p>
                  <p className="text-2xl font-black text-[#1f6ac6]">{answeredCount}</p>
                </div>
                <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-white px-4 py-3">
                  <p className="text-[11px] text-[#142a45]/60">Статус</p>
                  <p className="text-base font-black">{statusLabel}</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
