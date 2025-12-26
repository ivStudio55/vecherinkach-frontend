'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { TrueFalseItem, ROUND2_POINTS } from '@/lib/round2';
import {
  ActiveRoundQuestion,
  OPTION_LABELS,
  getOptionKeyByIndex,
  getQuestionForIndex,
} from '@/lib/questions';

const QUESTION_DURATION_SECONDS = 30;
const APP_VERSION = '1.0.9'; // Инкрементируйте при важных изменениях

const ROUND3_ANSWER_SECONDS = 30;
const ROUND3_VOTE_COUNTDOWN_SECONDS = 3;
const ROUND3_VOTE_SECONDS = 15;
const ROUND3_TOTAL_QUESTIONS = 6;

const ROUND3_QUESTIONS_AUDIO_DIR = 'round3/questions3';
const ROUND3_BG_JINGLE_FILE = 'round2/jingle (5).mp3';

const buildAudioUrl = (relativePath: string) => `/api/audio?file=${encodeURIComponent(relativePath)}&t=${Date.now()}`;

const coerceToNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

// Fisher-Yates shuffle algorithm
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

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

const getRemainingSecondsWithDuration = (startedAt: string | null, durationSeconds: number, offsetMs = 0) => {
  if (!startedAt) {
    return durationSeconds;
  }
  const startTime = new Date(startedAt).getTime();
  if (isNaN(startTime)) {
    return durationSeconds;
  }
  const now = Date.now() - offsetMs;
  const diffMs = now - startTime;
  const elapsedSeconds = Math.floor(diffMs / 1000);
  const remaining = durationSeconds - elapsedSeconds;
  return Math.max(0, Math.min(durationSeconds, remaining));
};

const addSecondsToIso = (iso: string, seconds: number) => {
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) {
    return iso;
  }
  return new Date(ms + seconds * 1000).toISOString();
};

type Question = ActiveRoundQuestion;

type RoomStatus = 'waiting' | 'running' | 'finished' | 'round2-running' | 'round3-running' | 'round4-running';

type Round2Phase = 'idle' | 'fact' | 'explanation';

type Round4Puzzle = {
  id: number;
  category: string;
  emoji: string;
  answer: string;
};

type Round3Question = {
  question: string;
  answer?: string;
  category?: string;
  acceptable?: string[];
  comment?: string;
  originalIndex: number;
};

type Round3QuestionsPayload = {
  name?: string;
  description?: string;
  questions?: Round3Question[];
};

type Round3AnswerRow = {
  id: string;
  player_id: string;
  room_id: string;
  question_index: number;
  text: string;
  submitted_at: string;
};

type RoomUpdatePayload = {
  new: {
    current_question_index: number | string | null;
    question_started_at: string | null;
    status: RoomStatus;
    is_active: boolean;
    all_players_answered: boolean;
    selected_question_ids: number[] | null;
    round2_item_index?: number | null;
    round2_showing_fact?: boolean | null;
    round2_phase?: Round2Phase | string | null;
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
  const [round4Puzzles, setRound4Puzzles] = useState<Round4Puzzle[]>([]);
  const [round4Puzzle, setRound4Puzzle] = useState<Round4Puzzle | null>(null);
  const [round4PuzzleId, setRound4PuzzleId] = useState<number | null>(null);
  const [round4AnswerText, setRound4AnswerText] = useState('');
  const [allPlayersAnswered, setAllPlayersAnswered] = useState(false);
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [round2Items, setRound2Items] = useState<TrueFalseItem[]>([]);
  const [round2ItemIndex, setRound2ItemIndex] = useState<number | null>(null);
  const [round2ShowingFact, setRound2ShowingFact] = useState(true);
  const [round2Phase, setRound2Phase] = useState<Round2Phase>('idle');
  const [round3Questions, setRound3Questions] = useState<Round3Question[]>([]);
  const [round3QuestionIndex, setRound3QuestionIndex] = useState<number | null>(null);
  const [round3AnswerText, setRound3AnswerText] = useState('');
  const [round3AnswerOptions, setRound3AnswerOptions] = useState<Round3AnswerRow[]>([]);
  const [round3HasVoted, setRound3HasVoted] = useState(false);
  const roomIdRef = useRef('');
  const playerIdRef = useRef('');
  const round3VoiceRef = useRef<HTMLAudioElement | null>(null);
  const round3BgRef = useRef<HTMLAudioElement | null>(null);
  const lastRound3PlaybackKeyRef = useRef<string | null>(null);
  const round4LoadAttemptRef = useRef(0);

  useEffect(() => {
    const loadRound2Data = async () => {
      try {
        const res = await fetch('/round2/true_false_explanation.json', { cache: 'no-store' });
        if (!res.ok) {
          return;
        }
        const json = (await res.json()) as TrueFalseItem[];
        setRound2Items(json);
      } catch (e) {
        console.error('Failed to load round2 data', e);
      }
    };
    void loadRound2Data();
  }, []);

  const loadRound4Data = useCallback(async () => {
    try {
      const res = await fetch('/questions/4round.json', { cache: 'no-store' });
      if (!res.ok) {
        console.warn('Round4 puzzles fetch failed', res.status, res.statusText);
        return;
      }
      const payload = await res.json();
      const puzzles = Array.isArray(payload?.puzzles) ? (payload.puzzles as Round4Puzzle[]) : [];
      setRound4Puzzles(puzzles);
    } catch (e) {
      console.error('Failed to load round4 data', e);
    }
  }, []);

  useEffect(() => {
    void loadRound4Data();
  }, [loadRound4Data]);

  useEffect(() => {
    // If we are already in round4-running but puzzles didn't load (or loaded empty), retry a couple times.
    if (roomStatus !== 'round4-running') {
      round4LoadAttemptRef.current = 0;
      return;
    }
    if (round4PuzzleId === null) {
      return;
    }
    if (round4Puzzles.length) {
      return;
    }

    if (round4LoadAttemptRef.current >= 3) {
      return;
    }

    round4LoadAttemptRef.current += 1;
    const timeoutId = window.setTimeout(() => {
      void loadRound4Data();
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [loadRound4Data, roomStatus, round4PuzzleId, round4Puzzles.length]);

  useEffect(() => {
    if (round4PuzzleId === null || !round4Puzzles.length) {
      setRound4Puzzle(null);
      return;
    }
    const next = round4Puzzles.find((p) => p.id === round4PuzzleId) ?? null;
    setRound4Puzzle(next);
  }, [round4PuzzleId, round4Puzzles]);

  useEffect(() => {
    if (!roomId) return;

    const loadRound3Data = async () => {
      try {
        const url = `/api/round3/questions?roomId=${encodeURIComponent(roomId)}&count=${ROUND3_TOTAL_QUESTIONS}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          return;
        }
        const payload = (await res.json()) as Round3QuestionsPayload;
        const questions = Array.isArray(payload?.questions) ? payload.questions : [];
        const withIndex = questions.map((q, i) => ({
          ...q,
          originalIndex: typeof q.originalIndex === 'number' ? q.originalIndex : i,
        }));
        // Используем порядок из API, чтобы совпадал у всех игроков и ведущего.
        setRound3Questions(withIndex);
      } catch (e) {
        console.error('Failed to load round3 data', e);
      }
    };

    void loadRound3Data();
  }, [roomId]);

  const stopRound3Audio = useCallback(() => {
    const voice = round3VoiceRef.current;
    const bg = round3BgRef.current;

    if (voice) {
      voice.onended = null;
      voice.onerror = null;
      voice.pause();
      voice.currentTime = 0;
      round3VoiceRef.current = null;
    }

    if (bg) {
      bg.pause();
      bg.currentTime = 0;
      round3BgRef.current = null;
    }
  }, []);

  const submitRound2Answer = useCallback(
    async (answerIsFact: boolean) => {
      if (isSubmitting || round2ItemIndex === null) {
        return;
      }
      if (roomStatus !== 'round2-running') {
        setError('Дождитесь начала раунда, чтобы отвечать');
        return;
      }
      if (allPlayersAnswered) {
        setError('Этот вопрос уже закрыт — ждём следующий.');
        return;
      }
      const currentTimeLeft = allPlayersAnswered ? 0 : timeLeft;
      if (currentTimeLeft <= 0) {
        setError('Время на ответ истекло');
        return;
      }
      if (!playerIdRef.current || !roomIdRef.current) {
        setError('Ошибка: данные игрока не найдены');
        return;
      }

      setError('');
      setIsSubmitting(true);

      try {
        const isCorrect = answerIsFact === !!round2ShowingFact;
        const pointsEarned = isCorrect ? ROUND2_POINTS : 0;

        const { error: insertError } = await supabase.from('round2_answers').insert({
          player_id: playerIdRef.current,
          room_id: roomIdRef.current,
          item_index: round2ItemIndex,
          answer_is_fact: answerIsFact,
          is_correct: isCorrect,
          points_earned: pointsEarned,
        });

        if (insertError) {
          const message = (insertError as { message?: string } | null)?.message ?? '';
          const isDuplicate = message.toLowerCase().includes('duplicate');
          if (!isDuplicate) {
            setError('Ошибка при отправке ответа');
            setIsSubmitting(false);
            return;
          }
        }

        setHasAnswered(true);
        setIsSubmitting(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
        setError(`Ошибка: ${message}`);
        setIsSubmitting(false);
      }
    },
    [
      allPlayersAnswered,
      isSubmitting,
      roomStatus,
      round2ItemIndex,
      round2ShowingFact,
      timeLeft,
    ]
  );

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
        router.push('/join');
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
          'id, current_question_index, is_active, status, question_started_at, all_players_answered, selected_question_ids, round2_item_index, round2_showing_fact, round2_phase'
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
      setAllPlayersAnswered(
        detectedStatus === 'running' || detectedStatus === 'round2-running' || detectedStatus === 'round3-running' || detectedStatus === 'round4-running'
          ? !!room.all_players_answered
          : false
      );

      const dbRound2ItemIndex = (room.round2_item_index as number | null) ?? null;
      const dbRound2ShowingFact = typeof room.round2_showing_fact === 'boolean' ? (room.round2_showing_fact as boolean) : true;
      const dbRound2Phase = (room.round2_phase as Round2Phase) || 'idle';

      if (detectedStatus === 'waiting') {
        setShowResults(false);
        setHasAnswered(false);
        setQuestion(null);
        setRound2ItemIndex(null);
        setRound2Phase('idle');
        setRound3QuestionIndex(null);
        setRound4Puzzle(null);
        setRound4PuzzleId(null);
        setRound4AnswerText('');
        setQuestionStartedAt(null);
        setTimeLeft(QUESTION_DURATION_SECONDS);
        setIsLoading(false);
      } else if (!room.is_active || detectedStatus === 'finished') {
        setShowResults(true);
        setQuestion(null);
        setRound2ItemIndex(null);
        setRound2Phase('idle');
        setRound3QuestionIndex(null);
        setRound4Puzzle(null);
        setRound4PuzzleId(null);
        setRound4AnswerText('');
        setQuestionStartedAt(null);
        setIsLoading(false);
      } else if (detectedStatus === 'round2-running') {
        setShowResults(false);
        setQuestion(null);
        setRound2ItemIndex(dbRound2ItemIndex);
        setRound2ShowingFact(dbRound2ShowingFact);
        setRound2Phase(dbRound2Phase);
        setRound3QuestionIndex(null);

        const startTime = room.question_started_at;
        setQuestionStartedAt(startTime);
        const initialTime = getRemainingSeconds(startTime, offset);
        setTimeLeft(room.all_players_answered ? 0 : initialTime);

        if (dbRound2ItemIndex !== null) {
          const { data: existingRound2Answer } = await supabase
            .from('round2_answers')
            .select('id')
            .eq('player_id', storedPlayerId)
            .eq('room_id', room.id)
            .eq('item_index', dbRound2ItemIndex)
            .maybeSingle();

          setHasAnswered(!!existingRound2Answer);
        } else {
          setHasAnswered(false);
        }

        if (!cancelled) {
          setIsLoading(false);
        }
      } else if (detectedStatus === 'round3-running') {
        setShowResults(false);
        setQuestion(null);
        setRound2ItemIndex(null);
        setRound2Phase('idle');
        setRound3QuestionIndex(room.current_question_index);

        const startTime = room.question_started_at;
        setQuestionStartedAt(startTime);
        const initialTime = getRemainingSeconds(startTime, offset);
        setTimeLeft(room.all_players_answered ? 0 : initialTime);

        if (room.current_question_index !== null && room.current_question_index !== undefined) {
          try {
            const { data: existingRound3Answer, error: existingRound3Error } = await supabase
              .from('round3_answers')
              .select('text')
              .eq('player_id', storedPlayerId)
              .eq('room_id', room.id)
              .eq('question_index', room.current_question_index)
              .maybeSingle();

            if (!existingRound3Error && existingRound3Answer) {
              setHasAnswered(true);
              setRound3AnswerText((existingRound3Answer.text ?? '').toString());
            } else {
              setHasAnswered(false);
            }
          } catch (e) {
            console.warn('Round3 answer lookup failed (SQL might be missing)', e);
            setHasAnswered(false);
          }
        } else {
          setHasAnswered(false);
        }

        if (!cancelled) {
          setIsLoading(false);
        }
      } else if (detectedStatus === 'round4-running') {
        setShowResults(false);
        setQuestion(null);
        setRound2ItemIndex(null);
        setRound2Phase('idle');
        setRound3QuestionIndex(null);

        const startTime = room.question_started_at;
        setQuestionStartedAt(startTime);
        const initialTime = getRemainingSeconds(startTime, offset);
        setTimeLeft(room.all_players_answered ? 0 : initialTime);

        const puzzleId = coerceToNumber(room.current_question_index);
        setRound4PuzzleId(puzzleId);
        setRound4Puzzle(puzzleId ? round4Puzzles.find((p) => p.id === puzzleId) ?? null : null);

        // Immediately reset per-puzzle UI state; then restore from DB if needed.
        setHasAnswered(false);
        setRound4AnswerText('');
        setError('');

        if (puzzleId) {
          const { data: existingRound4Answer } = await supabase
            .from('round4_answers')
            .select('id')
            .eq('player_id', storedPlayerId)
            .eq('room_id', room.id)
            .eq('puzzle_id', puzzleId)
            .maybeSingle();

          setHasAnswered(!!existingRound4Answer);
        } else {
          setHasAnswered(false);
        }

        if (!cancelled) {
          setIsLoading(false);
        }
      } else {
        const startTime = room.question_started_at;
        setQuestionStartedAt(startTime);
        const initialTime = getRemainingSeconds(startTime, offset);
        setTimeLeft(room.all_players_answered ? 0 : initialTime);

        const questionIndex = coerceToNumber(room.current_question_index);
        if (questionIndex !== null) {
          loadQuestionFromSelectionRef.current?.(questionIndex, selection);
        } else {
          setQuestion(null);
        }

        setRound2ItemIndex(null);
        setRound2Phase('idle');
        setRound3QuestionIndex(null);

        // Проверяем, ответил ли игрок на текущий вопрос
        const { data: existingAnswer } = await supabase
          .from('answers')
          .select('id')
          .eq('player_id', storedPlayerId)
          .eq('room_id', room.id)
          .eq('question_index', room.current_question_index)
          .maybeSingle();

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

          const newQuestionIndex = coerceToNumber(payload.new.current_question_index);
          const startedAt = payload.new.question_started_at as string | null;
          const newStatus = (payload.new.status as RoomStatus) || (payload.new.is_active ? 'waiting' : 'finished');
          setRoomStatus(newStatus);
          const everyoneAnsweredFlag =
            newStatus === 'running' || newStatus === 'round2-running' || newStatus === 'round3-running' || newStatus === 'round4-running'
              ? !!payload.new.all_players_answered
              : false;
          setAllPlayersAnswered(everyoneAnsweredFlag);
          const selection = (payload.new.selected_question_ids as number[] | null) || [];
          setSelectedQuestionIds(selection);

          const nextRound2ItemIndex = (payload.new.round2_item_index as number | null | undefined) ?? null;
          const nextRound2ShowingFact =
            typeof payload.new.round2_showing_fact === 'boolean' ? !!payload.new.round2_showing_fact : round2ShowingFact;
          const nextRound2Phase = ((payload.new.round2_phase as Round2Phase) || 'idle') as Round2Phase;

          if (newStatus === 'waiting') {
            setShowResults(false);
            setHasAnswered(false);
            setQuestion(null);
            setRound2ItemIndex(null);
            setRound2Phase('idle');
            setRound3QuestionIndex(null);
            setRound4Puzzle(null);
            setRound4PuzzleId(null);
            setRound4AnswerText('');
            setQuestionStartedAt(null);
            setTimeLeft(QUESTION_DURATION_SECONDS);
            return;
          }

          if (newStatus === 'finished' || !payload.new.is_active) {
            setShowResults(true);
            setQuestion(null);
            setRound2ItemIndex(null);
            setRound2Phase('idle');
            setRound3QuestionIndex(null);
            setRound4Puzzle(null);
            setRound4PuzzleId(null);
            setRound4AnswerText('');
            setQuestionStartedAt(null);
            setTimeLeft(QUESTION_DURATION_SECONDS);
            return;
          }

          if (newStatus === 'round2-running') {
            setShowResults(false);
            setQuestion(null);
            setRound2ItemIndex(nextRound2ItemIndex);
            setRound2ShowingFact(nextRound2ShowingFact);
            setRound2Phase(nextRound2Phase);
            setRound3QuestionIndex(null);
            setQuestionStartedAt(startedAt);

            const offset = await syncServerTimeRef.current?.();
            if (everyoneAnsweredFlag) {
              setTimeLeft(0);
            } else {
              setTimeLeft(startedAt ? getRemainingSeconds(startedAt, offset || 0) : QUESTION_DURATION_SECONDS);
            }

            const currentPlayerId = playerIdRef.current;
            const currentRoomId = roomIdRef.current;
            if (currentPlayerId && currentRoomId && nextRound2ItemIndex !== null) {
              const { data: newAnswer } = await supabase
                .from('round2_answers')
                .select('id')
                .eq('player_id', currentPlayerId)
                .eq('room_id', currentRoomId)
                .eq('item_index', nextRound2ItemIndex)
                .maybeSingle();
              setHasAnswered(!!newAnswer);
            } else {
              setHasAnswered(false);
            }
            return;
          }

          if (newStatus === 'round3-running') {
            setShowResults(false);
            setQuestion(null);
            setRound2ItemIndex(null);
            setRound2Phase('idle');
            setRound3QuestionIndex(newQuestionIndex);
            setQuestionStartedAt(startedAt);

            const offset = await syncServerTimeRef.current?.();
            if (everyoneAnsweredFlag) {
              setTimeLeft(0);
            } else {
              setTimeLeft(startedAt ? getRemainingSeconds(startedAt, offset || 0) : QUESTION_DURATION_SECONDS);
            }

            const currentPlayerId = playerIdRef.current;
            const currentRoomId = roomIdRef.current;
            if (currentPlayerId && currentRoomId && newQuestionIndex !== null) {
              try {
                const { data: existingRound3Answer, error: existingRound3Error } = await supabase
                  .from('round3_answers')
                  .select('text')
                  .eq('player_id', currentPlayerId)
                  .eq('room_id', currentRoomId)
                  .eq('question_index', newQuestionIndex)
                  .maybeSingle();

                if (!existingRound3Error && existingRound3Answer) {
                  setHasAnswered(true);
                  setRound3AnswerText((existingRound3Answer.text ?? '').toString());
                } else {
                  setHasAnswered(false);
                }
              } catch (e) {
                console.warn('Round3 answer lookup failed (SQL might be missing)', e);
                setHasAnswered(false);
              }
            } else {
              setHasAnswered(false);
            }
            return;
          }

          if (newStatus === 'round4-running') {
            setShowResults(false);
            setQuestion(null);
            setRound2ItemIndex(null);
            setRound2Phase('idle');
            setRound3QuestionIndex(null);

            // Force fetch latest state if payload seems incomplete
            let effectiveStartedAt = startedAt;
            let effectivePuzzleId = newQuestionIndex;

            if (!effectiveStartedAt || effectivePuzzleId === null) {
              const { data: freshRoom } = await supabase
                .from('rooms')
                .select('question_started_at, current_question_index')
                .eq('id', roomId)
                .single();
              
              if (freshRoom) {
                effectiveStartedAt = freshRoom.question_started_at;
                effectivePuzzleId = coerceToNumber(freshRoom.current_question_index);
              }
            }

            setQuestionStartedAt(effectiveStartedAt);

            const offset = await syncServerTimeRef.current?.();
            if (everyoneAnsweredFlag) {
              setTimeLeft(0);
            } else {
              setTimeLeft(effectiveStartedAt ? getRemainingSeconds(effectiveStartedAt, offset || 0) : QUESTION_DURATION_SECONDS);
            }

            setRound4PuzzleId(effectivePuzzleId);
            // Use functional update or ref to avoid stale closure issues with round4Puzzles
            setRound4Puzzle(effectivePuzzleId ? round4Puzzles.find((p) => p.id === effectivePuzzleId) ?? null : null);

            // Immediately reset per-puzzle UI state; then restore from DB if needed.
            setHasAnswered(false);
            setRound4AnswerText('');
            setError('');

            const currentPlayerId = playerIdRef.current;
            const currentRoomId = roomIdRef.current;
            if (currentPlayerId && currentRoomId && effectivePuzzleId) {
              const { data: newAnswer } = await supabase
                .from('round4_answers')
                .select('id')
                .eq('player_id', currentPlayerId)
                .eq('room_id', currentRoomId)
                .eq('puzzle_id', effectivePuzzleId)
                .maybeSingle();
              setHasAnswered(!!newAnswer);
            } else {
              setHasAnswered(false);
            }
            return;
          }

          const offset = await syncServerTimeRef.current?.();
          if (newQuestionIndex !== null) {
            loadQuestionFromSelectionRef.current?.(newQuestionIndex, selection);
          } else {
            setQuestion(null);
          }
          setRound2ItemIndex(null);
          setRound2Phase('idle');
          setRound3QuestionIndex(null);
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
              .maybeSingle();
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
  }, [roomId, round4Puzzles]);

  const effectiveTimeLeft = allPlayersAnswered ? 0 : timeLeft;
  // Round4 should keep timer ticking even when allPlayersAnswered (until explanation phase)
  const timerActive =
    !showResults &&
    ((roomStatus === 'round3-running' && Boolean(questionStartedAt)) ||
      (roomStatus === 'round4-running' && Boolean(questionStartedAt)) ||
      (!allPlayersAnswered &&
        (roomStatus === 'running' || roomStatus === 'round2-running') &&
        Boolean(questionStartedAt)));

  useEffect(() => {
    // На экранах игроков Раунд 3 не воспроизводит аудио — всё звучит у ведущего.
    stopRound3Audio();
    lastRound3PlaybackKeyRef.current = null;
  }, [roomStatus, stopRound3Audio]);

  useEffect(() => {
    if (roomStatus !== 'round3-running') {
      setRound3AnswerText('');
      setRound3AnswerOptions([]);
      setRound3HasVoted(false);
      return;
    }
    setRound3AnswerText('');
    setRound3AnswerOptions([]);
    setRound3HasVoted(false);
  }, [roomStatus, round3QuestionIndex]);

  const getRound3Phase = useCallback(() => {
    if (roomStatus !== 'round3-running') {
      return 'none' as const;
    }
    if (!questionStartedAt) {
      return 'fact' as const;
    }
    const startMs = new Date(questionStartedAt).getTime();
    if (isNaN(startMs)) {
      return 'fact' as const;
    }
    const now = Date.now() - timeOffsetMs;
    const elapsed = Math.floor((now - startMs) / 1000);
    if (elapsed < ROUND3_ANSWER_SECONDS) {
      return 'answer' as const;
    }
    if (elapsed < ROUND3_ANSWER_SECONDS + ROUND3_VOTE_COUNTDOWN_SECONDS) {
      return 'vote-countdown' as const;
    }
    if (elapsed < ROUND3_ANSWER_SECONDS + ROUND3_VOTE_COUNTDOWN_SECONDS + ROUND3_VOTE_SECONDS) {
      return 'vote' as const;
    }
    return 'post' as const;
  }, [questionStartedAt, roomStatus, timeOffsetMs]);

  const round3Phase = getRound3Phase();

  useEffect(() => {
    if (!timerActive || !questionStartedAt) {
      return;
    }

    const tick = () => {
      if (roomStatus === 'round3-running') {
        const startMs = new Date(questionStartedAt).getTime();
        if (isNaN(startMs)) {
          setTimeLeft(QUESTION_DURATION_SECONDS);
          return;
        }
        const now = Date.now() - timeOffsetMs;
        const elapsed = Math.floor((now - startMs) / 1000);

        const totalRound3Seconds = ROUND3_ANSWER_SECONDS + ROUND3_VOTE_COUNTDOWN_SECONDS + ROUND3_VOTE_SECONDS;
        const remainingTotal = Math.max(0, totalRound3Seconds - elapsed);

        // timeLeft is used as a heartbeat for re-renders; keep it decreasing across all phases.
        setTimeLeft(remainingTotal);
        return;
      }

      const remaining = getRemainingSeconds(questionStartedAt, timeOffsetMs);
      setTimeLeft(remaining);
    };
    
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [roomStatus, timerActive, questionStartedAt, timeOffsetMs]);

  const submitRound3Answer = useCallback(
    async (text: string) => {
      if (isSubmitting) {
        return;
      }
      if (!roomId || !playerId) {
        return;
      }
      if (roomStatus !== 'round3-running') {
        return;
      }
      if (round3QuestionIndex === null) {
        return;
      }

      setError('');
      setIsSubmitting(true);
      try {
        const trimmed = (text ?? '').trim();
        const { error: upsertError } = await supabase
          .from('round3_answers')
          .upsert(
            {
              room_id: roomId,
              player_id: playerId,
              question_index: round3QuestionIndex,
              text: trimmed,
            },
            { onConflict: 'room_id,player_id,question_index' }
          );

        if (upsertError) {
          console.error('Round3 answer submit failed', upsertError);
          setError('Не удалось сохранить ответ (проверьте, что применён SQL для Раунда 3).');
          return;
        }
        setHasAnswered(true);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, playerId, roomId, roomStatus, round3QuestionIndex]
  );

  const submitRound4Answer = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
    if (roomStatus !== 'round4-running') {
      setError('Дождитесь начала раунда');
      return;
    }
    if (round4PuzzleId === null) {
      return;
    }
    if (allPlayersAnswered || timeLeft <= 0) {
      setError('Время на ответ истекло');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const trimmed = (round4AnswerText ?? '').trim();
      if (!trimmed) {
        setError('Введите ответ');
        setIsSubmitting(false);
        return;
      }

      const { error: upsertError } = await supabase
        .from('round4_answers')
        .upsert(
          {
            room_id: roomId,
            player_id: playerId,
            puzzle_id: round4PuzzleId,
            answer_text: trimmed,
            submitted_at: new Date().toISOString(),
          },
          { onConflict: 'room_id,player_id,puzzle_id' }
        );

      if (upsertError) {
        console.error('Round4 answer submit failed', upsertError);
        setError('Не удалось отправить ответ. Попробуйте ещё раз.');
        setIsSubmitting(false);
        return;
      }

      setHasAnswered(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Ошибка: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [allPlayersAnswered, isSubmitting, playerId, roomId, round4AnswerText, round4PuzzleId, roomStatus, timeLeft]);

  useEffect(() => {
    if (roomStatus !== 'round3-running') {
      return;
    }
    if (round3Phase !== 'vote' && round3Phase !== 'vote-countdown') {
      return;
    }
    if (hasAnswered) {
      return;
    }

    // Авто-фиксация ответа на границе перехода к голосованию.
    void submitRound3Answer(round3AnswerText);
  }, [hasAnswered, roomStatus, round3AnswerText, round3Phase, submitRound3Answer]);

  const loadRound3VoteOptions = useCallback(async () => {
    if (!roomId || roomStatus !== 'round3-running') {
      return;
    }
    if (round3QuestionIndex === null) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('round3_answers')
        .select('id, player_id, room_id, question_index, text, submitted_at')
        .eq('room_id', roomId)
        .eq('question_index', round3QuestionIndex)
        .order('submitted_at', { ascending: true });

      if (error) {
        console.error('Failed to load round3 answers', error);
        setRound3AnswerOptions([]);
        return;
      }
      const rows = (data || []) as Round3AnswerRow[];
      setRound3AnswerOptions(rows);
    } catch (e) {
      console.error('Failed to load round3 answers', e);
      setRound3AnswerOptions([]);
    }
  }, [roomId, roomStatus, round3QuestionIndex]);

  useEffect(() => {
    if (round3Phase !== 'vote' && round3Phase !== 'vote-countdown') {
      return;
    }
    void loadRound3VoteOptions();
  }, [loadRound3VoteOptions, round3Phase]);

  const loadRound3VoteState = useCallback(async () => {
    if (!roomId || !playerId || roomStatus !== 'round3-running') {
      return;
    }
    if (round3QuestionIndex === null) {
      return;
    }
    try {
      const { data, error } = await supabase
        .from('round3_votes')
        .select('id')
        .eq('room_id', roomId)
        .eq('voter_player_id', playerId)
        .eq('question_index', round3QuestionIndex)
        .single();

      if (error) {
        setRound3HasVoted(false);
        return;
      }
      setRound3HasVoted(!!data);
    } catch {
      setRound3HasVoted(false);
    }
  }, [playerId, roomId, roomStatus, round3QuestionIndex]);

  useEffect(() => {
    if (round3Phase !== 'vote' && round3Phase !== 'vote-countdown') {
      return;
    }
    void loadRound3VoteState();
  }, [loadRound3VoteState, round3Phase]);

  const submitRound3Vote = useCallback(
    async (answerId: string) => {
      if (isSubmitting || round3HasVoted) {
        return;
      }
      if (!roomId || !playerId) {
        return;
      }
      if (roomStatus !== 'round3-running') {
        return;
      }
      if (round3QuestionIndex === null) {
        return;
      }
      if (round3Phase !== 'vote') {
        return;
      }

      setError('');
      setIsSubmitting(true);
      try {
        const { error } = await supabase.from('round3_votes').insert({
          room_id: roomId,
          voter_player_id: playerId,
          question_index: round3QuestionIndex,
          answer_id: answerId,
        });
        if (error) {
          console.error('Failed to submit round3 vote', error);
          setError('Не удалось отправить голос (проверьте, что применён SQL для Раунда 3).');
          return;
        }
        setRound3HasVoted(true);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, playerId, roomId, roomStatus, round3HasVoted, round3Phase, round3QuestionIndex]
  );

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
      <div className="min-h-screen flex items-center justify-center bg-[#fef4dc] text-[#142a45] px-4">
        <div className="rounded-3xl border-[4px] border-[#142a45] bg-white px-6 py-4 text-xl font-black">
          Подключаемся к комнате…
        </div>
      </div>
    );
  }

  const round3VoteStartedAt =
    roomStatus === 'round3-running' && questionStartedAt
      ? addSecondsToIso(questionStartedAt, ROUND3_ANSWER_SECONDS + ROUND3_VOTE_COUNTDOWN_SECONDS)
      : null;

  const currentRound3Question =
    roomStatus === 'round3-running' && round3QuestionIndex !== null
      ? round3Questions[round3QuestionIndex] ?? null
      : null;

  const round3VoteCountdownStartedAt =
    roomStatus === 'round3-running' && questionStartedAt ? addSecondsToIso(questionStartedAt, ROUND3_ANSWER_SECONDS) : null;

  const round3AnswerTimeLeft =
    roomStatus === 'round3-running' && questionStartedAt
      ? getRemainingSecondsWithDuration(questionStartedAt, ROUND3_ANSWER_SECONDS, timeOffsetMs)
      : effectiveTimeLeft;

  const round3VoteTimeLeft =
    roomStatus === 'round3-running' && round3VoteStartedAt
      ? getRemainingSecondsWithDuration(round3VoteStartedAt, ROUND3_VOTE_SECONDS, timeOffsetMs)
      : ROUND3_VOTE_SECONDS;

  const round3VoteCountdownTimeLeft =
    roomStatus === 'round3-running' && round3VoteCountdownStartedAt
      ? getRemainingSecondsWithDuration(round3VoteCountdownStartedAt, ROUND3_VOTE_COUNTDOWN_SECONDS, timeOffsetMs)
      : ROUND3_VOTE_COUNTDOWN_SECONDS;

  const activeTimerSeconds =
    roomStatus === 'round3-running' && round3Phase === 'vote'
      ? round3VoteTimeLeft
      : roomStatus === 'round3-running' && round3Phase === 'vote-countdown'
        ? round3VoteCountdownTimeLeft
        : effectiveTimeLeft;
  const activeTimerDuration =
    roomStatus === 'round3-running' && round3Phase === 'vote'
      ? ROUND3_VOTE_SECONDS
      : roomStatus === 'round3-running' && round3Phase === 'vote-countdown'
        ? ROUND3_VOTE_COUNTDOWN_SECONDS
        : QUESTION_DURATION_SECONDS;
  const progressPercent = Math.max(0, Math.min(100, (activeTimerSeconds / activeTimerDuration) * 100));
  const timerLabel = allPlayersAnswered ? 'Все ответили' : `${activeTimerSeconds} c`;

  if (showResults && roomStatus === 'finished') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fef4dc] text-[#142a45] px-4 py-10">
        <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl max-w-lg w-full p-8 text-center space-y-4">
          <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Раунд завершён</p>
          <h2 className="text-3xl font-black">🎉 Ждём объявления результатов</h2>
          <p className="text-sm text-[#142a45]/80">
            Ведущий сейчас озвучит правильные ответы и начисленные баллы. Не закрывайте вкладку, чтобы не потерять прогресс.
          </p>
          <button
            onClick={() => router.push('/join')}
            className="w-full py-3 rounded-2xl border-[3px] border-[#142a45] bg-[#ffe184] font-black"
          >
            Вернуться на экран подключения
          </button>
        </div>
      </div>
    );
  }

  if (error && roomStatus === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fef4dc] text-[#142a45] px-4 py-10">
        <div className="rounded-3xl border-[4px] border-[#b23324] bg-white shadow-xl max-w-md w-full p-8 text-center space-y-4">
          <p className="retro-heading text-xs tracking-[0.4em] text-[#b23324]/70">Ошибка</p>
          <h1 className="text-2xl font-black text-[#b23324]">❌ Что-то пошло не так</h1>
          <p className="text-sm text-[#142a45]/80">{error}</p>
          <button
            onClick={() => router.push('/join')}
            className="w-full py-3 rounded-2xl border-[3px] border-[#142a45] bg-[#ffe184] font-black"
          >
            На экран подключения
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="retro-panel rounded-3xl bg-[#142a45] text-[#ffeccd] px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="retro-heading text-xs tracking-[0.5em] text-[#ffeccd]/80">Комната</p>
              <h1 className="text-3xl font-black leading-tight">Код {roomCode}</h1>
            </div>
            <div className="text-right">
              <p className="retro-heading text-[10px] tracking-[0.5em] text-[#ffeccd]/60">Ваш ник</p>
              <p className="text-2xl font-black">{playerName}</p>
            </div>
          </div>
          <p className="text-xs text-[#ffeccd]/70 mt-2">
            Держите вкладку открытой: ответы и таймеры синхронизируются автоматически через Supabase.
          </p>
        </header>

        {/* Debug Info - Remove in production */}
        <div className="fixed bottom-0 left-0 bg-black/80 text-white text-[10px] p-2 max-w-full overflow-auto z-50 opacity-50 hover:opacity-100 flex gap-4 items-center">
          <div>
            Status: {roomStatus} | StartedAt: {questionStartedAt ? questionStartedAt.substring(11, 19) : 'null'} | TimerActive: {String(timerActive)} | TimeLeft: {timeLeft} | EffectiveTime: {effectiveTimeLeft} | AllAnswered: {String(allPlayersAnswered)} | PuzzleId: {round4PuzzleId ?? 'null'} | PuzzlesLoaded: {round4Puzzles.length} | RoomId: {roomId?.substring(0, 8) ?? 'null'}
          </div>
          <button 
            className="bg-white text-black px-2 py-1 rounded"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>

        {roomStatus === 'waiting' && (
          <section className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-8 text-center space-y-4">
            <div className="text-5xl">⏳</div>
            <h2 className="text-3xl font-black">Ждём старт от ведущего</h2>
            <p className="text-sm text-[#142a45]/80">
              Вы подключены. Ведущий начнёт раунд, когда все игроки войдут. Ничего нажимать не нужно — просто ждите звукового сигнала.
            </p>
          </section>
        )}

        {roomStatus === 'round4-running' && (
          <section className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-6">
            <div className="flex flex-col gap-3 text-center">
              <span className="mx-auto px-4 py-2 rounded-full border-[3px] border-[#142a45] text-sm font-black">
                Раунд 4 · Дэшифровщик
              </span>
              <div className="text-5xl sm:text-6xl leading-none">{round4Puzzle?.emoji ?? '⏳'}</div>
              <p className="text-sm text-[#142a45]/70">
                {round4Puzzle ? `Категория: ${round4Puzzle.category}` : 'Ждём загадку от ведущего'}
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs text-[#142a45]/70 mb-1">
                <span>Таймер · 30 сек</span>
                <span className={`font-black ${allPlayersAnswered ? 'text-[#1f6ac6]' : 'text-[#142a45]'}`}>{timerLabel}</span>
              </div>
              <div className="h-3 rounded-full bg-[#ffeccd] overflow-hidden">
                <div
                  className={`h-full ${activeTimerSeconds > 5 ? 'bg-[#1f6ac6]' : 'bg-[#f1532f]'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {allPlayersAnswered && (
                <p className="text-xs text-[#1f6ac6] font-semibold mt-2">Время истекло — слушаем ответ ведущего.</p>
              )}
            </div>

            {(hasAnswered || allPlayersAnswered) && round4Puzzle ? (
              <div className="rounded-3xl border-[3px] border-[#1f6ac6] bg-[#e9f0ff] p-6 text-center space-y-2">
                <div className="text-5xl">✅</div>
                <h3 className="text-2xl font-black text-[#1f6ac6]">Ответ отправлен!</h3>
                <p className="text-sm text-[#142a45]/70">Ждём, пока ведущий озвучит правильный вариант.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/60 text-center">ВВЕДИ СВОЙ ОТВЕТ</p>
                <input
                  value={round4AnswerText}
                  onChange={(e) => setRound4AnswerText(e.target.value)}
                  placeholder={round4Puzzle ? 'Например: Матрица' : 'Ждём загадку…'}
                  className="w-full rounded-2xl border-[3px] border-[#142a45] bg-white px-4 py-3 text-sm font-semibold outline-none"
                  autoComplete="off"
                  inputMode="text"
                  maxLength={80}
                  disabled={
                    isSubmitting ||
                    activeTimerSeconds <= 0 ||
                    allPlayersAnswered ||
                    roomStatus !== 'round4-running' ||
                    round4PuzzleId === null ||
                    !round4Puzzle
                  }
                />
                <button
                  onClick={() => void submitRound4Answer()}
                  disabled={
                    isSubmitting ||
                    activeTimerSeconds <= 0 ||
                    allPlayersAnswered ||
                    roomStatus !== 'round4-running' ||
                    round4PuzzleId === null ||
                    !round4Puzzle
                  }
                  className="w-full py-3 rounded-2xl font-black text-lg tracking-[0.18em] bg-[#1f6ac6] text-white border-[3px] border-[#142a45] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Отправить
                </button>

                {error && (
                  <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
                    {error}
                  </div>
                )}

                {activeTimerSeconds <= 0 && (
                  <p className="text-xs text-center text-[#142a45]/60">⏱ Время истекло. Ответы больше не принимаются.</p>
                )}
              </div>
            )}
          </section>
        )}

        {question && roomStatus === 'running' && (
          <section className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-6">
            <div className="flex flex-col gap-3 text-center">
              <span className="mx-auto px-4 py-2 rounded-full border-[3px] border-[#142a45] text-sm font-black">
                Вопрос #{question.order}
              </span>
              <h2 className="text-3xl font-black leading-tight">{question.text}</h2>
            </div>

            <div>
              <div className="flex justify-between text-xs text-[#142a45]/70 mb-1">
                <span>Осталось времени</span>
                <span className={`font-black ${allPlayersAnswered ? 'text-[#1f6ac6]' : 'text-[#142a45]'}`}>
                  {timerLabel}
                </span>
              </div>
              <div className="h-3 rounded-full bg-[#ffeccd] overflow-hidden">
                <div
                  className={`h-full ${effectiveTimeLeft > 5 ? 'bg-[#1f6ac6]' : 'bg-[#f1532f]'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {allPlayersAnswered && (
                <p className="text-xs text-[#1f6ac6] font-semibold mt-2">Все уже ответили — ждём следующий вопрос.</p>
              )}
            </div>

            {!hasAnswered ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/60">Выберите ответ</p>
                <div className="space-y-3">
                  {question.options.map((optionText, index) => {
                    const optionKey = getOptionKeyByIndex(index);
                    return (
                      <button
                        key={optionKey}
                        onClick={() => submitAnswer(optionKey)}
                        disabled={isSubmitting || effectiveTimeLeft <= 0 || roomStatus !== 'running'}
                        className="w-full flex items-center gap-3 rounded-2xl border-[3px] border-[#142a45] px-4 py-4 text-left font-semibold bg-white hover:bg-[#fff6da] transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className="w-10 h-10 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black bg-[#ffeccd]">
                          {OPTION_LABELS[optionKey]}
                        </span>
                        <span className="flex-1 text-sm">{optionText}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border-[3px] border-dashed border-[#142a45]/40 bg-[#fff6da] px-4 py-3 text-sm flex items-center justify-between">
                  <span className="font-semibold">Награда за точный ответ</span>
                  <span className="font-black text-[#f1532f]">+{question.points} баллов</span>
                </div>

                {error && (
                  <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
                    {error}
                  </div>
                )}

                {effectiveTimeLeft <= 0 && (
                  <p className="text-xs text-center text-[#142a45]/60">⏱ Время истекло. Следующий вопрос появится автоматически.</p>
                )}
              </div>
            ) : (
              <div className="rounded-3xl border-[3px] border-[#1f6ac6] bg-[#e9f0ff] p-6 text-center space-y-2">
                <div className="text-5xl">✅</div>
                <h3 className="text-2xl font-black text-[#1f6ac6]">Ответ отправлен!</h3>
                <p className="text-sm text-[#142a45]/70">Ждём, пока ведущий запустит следующий вопрос.</p>
              </div>
            )}
          </section>
        )}

        {roomStatus === 'round2-running' && (
          <section className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-6">
            <div className="flex flex-col gap-3 text-center">
              <span className="mx-auto px-4 py-2 rounded-full border-[3px] border-[#142a45] text-sm font-black">
                Раунд 2 · Фейколов
              </span>
              <h2 className="text-3xl font-black leading-tight">
                {round2ItemIndex !== null && round2Items[round2ItemIndex]
                  ? round2ShowingFact
                    ? round2Items[round2ItemIndex].fact
                    : round2Items[round2ItemIndex].fiction
                  : 'Подождите, факт загружается…'}
              </h2>
            </div>

            <div>
              <div className="flex justify-between text-xs text-[#142a45]/70 mb-1">
                <span>Осталось времени</span>
                <span className={`font-black ${allPlayersAnswered ? 'text-[#1f6ac6]' : 'text-[#142a45]'}`}>
                  {timerLabel}
                </span>
              </div>
              <div className="h-3 rounded-full bg-[#ffeccd] overflow-hidden">
                <div
                  className={`h-full ${effectiveTimeLeft > 5 ? 'bg-[#1f6ac6]' : 'bg-[#f1532f]'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {allPlayersAnswered && (
                <p className="text-xs text-[#1f6ac6] font-semibold mt-2">Все уже ответили — ждём следующий факт.</p>
              )}
            </div>

            {round2Phase !== 'fact' ? (
              <div className="rounded-3xl border-[3px] border-[#142a45]/20 bg-[#fff6da] p-6 text-center space-y-2">
                <div className="text-5xl">🎙️</div>
                <h3 className="text-2xl font-black">Ждём объяснение ведущего</h3>
                <p className="text-sm text-[#142a45]/70">Голосование закрыто — скоро начнётся следующий факт.</p>
              </div>
            ) : hasAnswered ? (
              <div className="rounded-3xl border-[3px] border-[#1f6ac6] bg-[#e9f0ff] p-6 text-center space-y-2">
                <div className="text-5xl">✅</div>
                <h3 className="text-2xl font-black text-[#1f6ac6]">Ответ отправлен!</h3>
                <p className="text-sm text-[#142a45]/70">Ждём следующий факт.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/60">Это правда или вымысел?</p>
                <div className="space-y-3">
                  <button
                    onClick={() => void submitRound2Answer(true)}
                    disabled={isSubmitting || effectiveTimeLeft <= 0 || roomStatus !== 'round2-running'}
                    className="w-full flex items-center gap-3 rounded-2xl border-[3px] border-[#142a45] px-4 py-4 text-left font-semibold bg-white hover:bg-[#fff6da] transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="w-10 h-10 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black bg-[#ffeccd]">
                      ✅
                    </span>
                    <span className="flex-1 text-sm">Правда</span>
                  </button>
                  <button
                    onClick={() => void submitRound2Answer(false)}
                    disabled={isSubmitting || effectiveTimeLeft <= 0 || roomStatus !== 'round2-running'}
                    className="w-full flex items-center gap-3 rounded-2xl border-[3px] border-[#142a45] px-4 py-4 text-left font-semibold bg-white hover:bg-[#fff6da] transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="w-10 h-10 rounded-full border-[3px] border-[#142a45] flex items-center justify-center font-black bg-[#ffeccd]">
                      ❌
                    </span>
                    <span className="flex-1 text-sm">Вымысел</span>
                  </button>
                </div>

                <div className="rounded-2xl border-[3px] border-dashed border-[#142a45]/40 bg-[#fff6da] px-4 py-3 text-sm flex items-center justify-between">
                  <span className="font-semibold">Награда за точный ответ</span>
                  <span className="font-black text-[#f1532f]">+{ROUND2_POINTS} баллов</span>
                </div>

                {error && (
                  <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
                    {error}
                  </div>
                )}

                {effectiveTimeLeft <= 0 && (
                  <p className="text-xs text-center text-[#142a45]/60">⏱ Время истекло. Следующий факт появится автоматически.</p>
                )}
              </div>
            )}
          </section>
        )}

        {roomStatus === 'round3-running' && (
          <section className="rounded-3xl border-[4px] border-[#f1532f] bg-white shadow-xl p-6 space-y-6">
            <div className="flex flex-col gap-3 text-center">
              <span className="mx-auto px-4 py-2 rounded-full border-[3px] border-[#142a45] text-sm font-black">
                Раунд 3 · МозгоШтурм
              </span>
              <div className="mx-auto w-16 h-16 rounded-full border-[4px] border-[#142a45] bg-[#ffeccd] flex items-center justify-center text-3xl">
                🔊
              </div>
              <h2 className="text-2xl font-black leading-tight">Внимательно слушай ведущего!</h2>
              <p className="text-sm text-[#142a45]/70">
                {round3Phase === 'fact'
                  ? 'Сейчас идёт озвучка факта. Поле для ответа появится во время таймера.'
                  : round3Phase === 'answer'
                    ? 'Во время таймера введи свой вариант ответа.'
                    : round3Phase === 'vote-countdown'
                      ? 'Сейчас начнётся голосование: приготовься выбрать лучший ответ.'
                      : round3Phase === 'vote'
                        ? 'Идёт голосование — выбери лучший ответ.'
                        : 'Голосование завершено — ждём ведущего.'}
              </p>
            </div>

            <div className="rounded-2xl border-[3px] border-[#142a45]/15 bg-[#fff6da] px-4 py-3 text-center space-y-2">
              <p className="text-[10px] font-black tracking-[0.35em] text-[#142a45]/60">ВОПРОС</p>
              <p className="text-xl sm:text-2xl font-black leading-tight">
                {currentRound3Question?.question ?? 'Вопрос загружается…'}
              </p>
            </div>

            <div className="rounded-2xl border-[3px] border-[#142a45]/15 bg-[#fff6da] px-4 py-3 text-sm font-semibold flex items-center justify-between">
              <span>Сейчас идёт озвучка у ведущего</span>
              <span className="font-black text-[#f1532f]">#{(round3QuestionIndex ?? 0) + 1}</span>
            </div>

            <div>
              <div className="flex justify-between text-xs text-[#142a45]/70 mb-1">
                <span>
                  {round3Phase === 'vote'
                    ? 'Голосование · 15 сек'
                    : round3Phase === 'vote-countdown'
                      ? 'Голосуем через…'
                      : 'Таймер · 30 сек'}
                </span>
                <span className={`font-black ${allPlayersAnswered ? 'text-[#1f6ac6]' : 'text-[#142a45]'}`}>{timerLabel}</span>
              </div>
              <div className="h-3 rounded-full bg-[#ffeccd] overflow-hidden">
                <div
                  className={`h-full ${activeTimerSeconds > 5 ? 'bg-[#1f6ac6]' : 'bg-[#f1532f]'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {round3Phase === 'vote-countdown' && (
              <div className="rounded-3xl border-[4px] border-[#142a45] bg-[#ffe184] px-6 py-6 text-center space-y-2">
                <p className="text-xs tracking-[0.4em] text-[#142a45]/70 font-black">ГОЛОСОВАНИЕ</p>
                <div className="text-6xl font-black leading-none text-[#142a45]">
                  {Math.max(1, round3VoteCountdownTimeLeft)}
                </div>
                <p className="text-sm font-semibold text-[#142a45]/80">Приготовься выбирать лучший ответ</p>
              </div>
            )}

            {round3Phase === 'answer' && timerActive && round3AnswerTimeLeft > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/60 text-center">ВВЕДИ ВАРИАНТ ОТВЕТА</p>
                <input
                  value={round3AnswerText}
                  onChange={(e) => setRound3AnswerText(e.target.value)}
                  placeholder="Напиши одно слово"
                  className="w-full rounded-2xl border-[3px] border-[#142a45] bg-white px-4 py-3 text-sm font-semibold outline-none"
                  autoComplete="off"
                  inputMode="text"
                  maxLength={60}
                />
                <p className="text-xs text-center text-[#142a45]/60">Поле доступно только пока идёт таймер.</p>
              </div>
            )}

            {round3Phase === 'vote' && round3VoteTimeLeft > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/60 text-center">ГОЛОСОВАНИЕ</p>
                {round3AnswerOptions.filter((row) => row.player_id !== playerId && (row.text ?? '').trim().length > 0).length === 0 ? (
                  <div className="rounded-2xl border-[3px] border-[#142a45]/20 bg-[#fff6da] px-4 py-3 text-sm font-semibold text-center">
                    Нет вариантов для голосования.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {round3AnswerOptions
                      .filter((row) => row.player_id !== playerId && (row.text ?? '').trim().length > 0)
                      .map((row) => (
                        <button
                          key={row.id}
                          onClick={() => void submitRound3Vote(row.id)}
                          disabled={isSubmitting || round3HasVoted}
                          className="w-full rounded-2xl border-[3px] border-[#142a45] bg-white px-4 py-3 text-left text-sm font-semibold hover:bg-[#fff6da] transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {row.text}
                        </button>
                      ))}
                  </div>
                )}

                {round3HasVoted && (
                  <div className="rounded-2xl border-[3px] border-[#1f6ac6] bg-[#e9f0ff] px-4 py-3 text-sm font-semibold text-center">
                    Голос принят!
                  </div>
                )}

                {error && (
                  <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
                    {error}
                  </div>
                )}
              </div>
            )}

            <p className="text-sm text-[#142a45]/70 text-center">
              Слушайте ведущего: озвучка факта и фоновая музыка звучат у него.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
