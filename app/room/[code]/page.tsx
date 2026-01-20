'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { TrueFalseItem, ROUND2_POINTS } from '@/lib/round2';
import { AnimatedText } from '@/components/AnimatedText';
import { submitRound1Answer } from '@/shared/logic/submitAnswer';
import { logEvent } from '@/shared/logic/logger';
import { isRealtimeEnabled } from '@/shared/logic/realtimeConfig';
import { PhaseStatusBanner } from '@/shared/ui/PhaseStatusBanner';
import { ScoreSummary } from '@/shared/ui/ScoreSummary';
import {
  ActiveRoundQuestion,
  OPTION_LABELS,
  getOptionKeyByIndex,
  createQuestionBank,
  DEFAULT_QUESTION_BANK,
  getQuestionForIndex,
  type QuestionBank,
} from '@/lib/questions';

import { DEFAULT_PACK_ID, getQuestionsBaseUrl, normalizePackId, type PackId } from '@/lib/questionPacks';

const QUESTION_DURATION_SECONDS = 30;
const ROUND3_TOTAL_QUESTIONS = 6;

const coerceToNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

type Round5Question = {
  question: string;
  answer: number;
  explanation: string;
};

type RoomStatus =
  | 'waiting'
  | 'running'
  | 'round2-ready'
  | 'round2-running'
  | 'round3-running'
  | 'round4-running'
  | 'round5-running'
  | 'round5-explanation'
  | 'final-results'
  | 'finished';

type Round2Phase = 'idle' | 'fact' | 'explanation';

type Round4Puzzle = {
  id: number;
  category: string;
  emoji: string;
  answers: string[];
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

  const [question, setQuestion] = useState<ActiveRoundQuestion | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [error, setError] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [roomId, setRoomId] = useState('');
  const [packId, setPackId] = useState<PackId>(DEFAULT_PACK_ID);
  const [isPackReady, setIsPackReady] = useState(true);
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_DURATION_SECONDS);
  const [showResults, setShowResults] = useState(false);
  const [playerTotalPoints, setPlayerTotalPoints] = useState<number | null>(null);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [playersCount, setPlayersCount] = useState<number | null>(null);
  const [isStandingLoading, setIsStandingLoading] = useState(false);
  const [standingError, setStandingError] = useState('');
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('waiting');
  const [round4Puzzles, setRound4Puzzles] = useState<Round4Puzzle[]>([]);
  const [round4Puzzle, setRound4Puzzle] = useState<Round4Puzzle | null>(null);
  const [round4PuzzleId, setRound4PuzzleId] = useState<number | null>(null);
  const [round4AnswerText, setRound4AnswerText] = useState('');
  const [round5Questions, setRound5Questions] = useState<Round5Question[]>([]);
  const [round5CurrentBankIndex, setRound5CurrentBankIndex] = useState<number | null>(null);
  const [round5CurrentQuestion, setRound5CurrentQuestion] = useState<Round5Question | null>(null);
  const [round5AnswerValue, setRound5AnswerValue] = useState('');
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
  const realtimeEnabled = isRealtimeEnabled();
  const roomIdRef = useRef('');
  const playerIdRef = useRef('');
  const roomStatusRef = useRef(roomStatus);
  const exitLoggedRef = useRef(false);
  const packIdRef = useRef<PackId>(DEFAULT_PACK_ID);
  const round1BankRef = useRef<QuestionBank>(DEFAULT_QUESTION_BANK);
  const round3VoiceRef = useRef<HTMLAudioElement | null>(null);
  const round3BgRef = useRef<HTMLAudioElement | null>(null);
  const lastRound3PlaybackKeyRef = useRef<string | null>(null);
  const round4LoadAttemptRef = useRef(0);
  const round5QuestionsRef = useRef<Round5Question[]>([]);

  useEffect(() => {
    round5QuestionsRef.current = round5Questions;
  }, [round5Questions]);

  useEffect(() => {
    roomStatusRef.current = roomStatus;
  }, [roomStatus]);

  useEffect(() => {
    if (!roomId || !playerId) {
      return;
    }

    const logExit = (reason: string) => {
      if (exitLoggedRef.current) return;
      exitLoggedRef.current = true;
      logEvent('info', 'analytics', 'player exit', {
        eventName: 'player_exit',
        roomId,
        playerId,
        reason,
        status: roomStatusRef.current,
      });
    };

    const handleBeforeUnload = () => logExit('unload');
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        logExit('background');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      logExit('unmount');
    };
  }, [playerId, roomId]);

  useEffect(() => {
    const loadRound2Data = async () => {
      try {
          const res = await fetch(`${getQuestionsBaseUrl(packId)}/true_false_explanation.json?t=${Date.now()}`, { cache: 'no-store' });
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
  }, [packId]);

  const loadRound4Data = useCallback(async () => {
    try {
      const res = await fetch(`${getQuestionsBaseUrl(packId)}/4round.json`, { cache: 'no-store' });
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
  }, [packId]);

  const loadRound5Data = useCallback(async () => {
    try {
      const res = await fetch(`${getQuestionsBaseUrl(packId)}/5round_question.json`, { cache: 'no-store' });
      if (!res.ok) {
        console.warn('Round5 questions fetch failed', res.status, res.statusText);
        return;
      }
      const payload = await res.json();
      const questions = Array.isArray(payload) ? (payload as Round5Question[]) : [];
      setRound5Questions(questions);
    } catch (e) {
      console.error('Failed to load round5 data', e);
    }
  }, [packId]);

  useEffect(() => {
    void loadRound4Data();
  }, [loadRound4Data]);

  useEffect(() => {
    void loadRound5Data();
  }, [loadRound5Data]);

  const loadPlayerStanding = useCallback(async () => {
    if (!roomId || !playerId) {
      return;
    }

    setStandingError('');
    setIsStandingLoading(true);
    try {
      const { data, error } = await supabase
        .from('players')
        .select('id, total_points')
        .eq('room_id', roomId);

      if (error || !Array.isArray(data)) {
        setStandingError('Не удалось загрузить рейтинг.');
        return;
      }

      const normalized = data
        .map((row) => ({
          id: String((row as { id?: unknown }).id ?? ''),
          totalPoints: coerceToNumber((row as { total_points?: unknown }).total_points) ?? 0,
        }))
        .filter((row) => row.id);

      const me = normalized.find((row) => row.id === playerId);
      const myPoints = me?.totalPoints ?? 0;

      // Competition ranking: rank = 1 + number of players strictly above you.
      const aboveCount = normalized.reduce((acc, row) => (row.totalPoints > myPoints ? acc + 1 : acc), 0);
      const rank = normalized.length ? aboveCount + 1 : null;

      setPlayersCount(normalized.length);
      setPlayerTotalPoints(myPoints);
      setPlayerRank(rank);
    } catch (e) {
      console.error('Failed to load player standing', e);
      setStandingError('Не удалось загрузить рейтинг.');
    } finally {
      setIsStandingLoading(false);
    }
  }, [playerId, roomId]);

  useEffect(() => {
    if (!showResults) {
      return;
    }
    if (roomStatus !== 'finished' && roomStatus !== 'final-results') {
      return;
    }
    void loadPlayerStanding();
  }, [loadPlayerStanding, roomStatus, showResults]);

  const isIntermission = roomStatus === 'waiting' && selectedQuestionIds.length > 0 && Boolean(roomId) && Boolean(playerId);

  useEffect(() => {
    if (!isIntermission) {
      return;
    }

    void loadPlayerStanding();
    const intervalId = window.setInterval(() => {
      void loadPlayerStanding();
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [isIntermission, loadPlayerStanding]);

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
        const url = `/api/round3/questions?roomId=${encodeURIComponent(roomId)}&count=${ROUND3_TOTAL_QUESTIONS}&packId=${encodeURIComponent(packId)}`;
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
  }, [packId, roomId]);

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

  useEffect(() => {
    packIdRef.current = packId;
  }, [packId]);

  const loadQuestionFromSelection = useCallback(
    (questionIndex: number, selectionOverride?: number[]) => {
      const selection = selectionOverride && selectionOverride.length ? selectionOverride : selectedQuestionIds;
      if (!selection.length) {
        setQuestion(null);
        return;
      }
      const nextQuestion = getQuestionForIndex(selection, questionIndex, round1BankRef.current);
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
          'id, pack_id, current_question_index, is_active, status, question_started_at, all_players_answered, selected_question_ids, round2_item_index, round2_showing_fact, round2_phase'
        )
        .eq('code', roomCode)
        .single();

      if (roomError || !room) {
        router.push('/join');
        return;
      }

      // Комната закрыта ведущим (endGame): is_active=false + status=finished + question_started_at=null.
      if ((room.status as RoomStatus) === 'finished' && room.question_started_at === null && room.is_active === false) {
        router.push('/join');
        return;
      }

      const nextPack = normalizePackId((room as { pack_id?: unknown }).pack_id);
      setPackId(nextPack);
      packIdRef.current = nextPack;

      if (nextPack === 'classic') {
        round1BankRef.current = DEFAULT_QUESTION_BANK;
        setIsPackReady(true);
      } else {
        setIsPackReady(false);
        try {
          const res = await fetch(`${getQuestionsBaseUrl(nextPack)}/round1.json?t=${Date.now()}`, { cache: 'no-store' });
          if (!res.ok) {
            throw new Error(`round1.json fetch failed: ${res.status}`);
          }
          const payload = (await res.json()) as unknown;
          round1BankRef.current = createQuestionBank(payload);
          setIsPackReady(true);
        } catch (e) {
          console.error('Failed to load round1 question bank', e);
          setError('Не удалось загрузить пакет вопросов. Попробуйте зайти ещё раз.');
          router.push('/join');
          return;
        }
      }

  setRoomId(room.id);
  roomIdRef.current = room.id;
      const selection = (room.selected_question_ids as number[] | null) || [];
      setSelectedQuestionIds(selection);
      const detectedStatus = (room.status as RoomStatus) || (room.is_active ? 'waiting' : 'finished');
      setRoomStatus(detectedStatus);
      setAllPlayersAnswered(
        detectedStatus === 'running' ||
          detectedStatus === 'round2-running' ||
          detectedStatus === 'round3-running' ||
          detectedStatus === 'round4-running' ||
          detectedStatus === 'round5-running'
          ? !!room.all_players_answered
          : detectedStatus === 'round5-explanation'
            ? true
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
      } else if (!room.is_active || detectedStatus === 'finished' || detectedStatus === 'final-results') {
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
      } else if (detectedStatus === 'round5-running' || detectedStatus === 'round5-explanation') {
        setShowResults(false);
        setQuestion(null);
        setRound2ItemIndex(null);
        setRound2Phase('idle');
        setRound3QuestionIndex(null);
        setRound4Puzzle(null);
        setRound4PuzzleId(null);
        setRound4AnswerText('');

        const tourIndex = coerceToNumber(room.current_question_index) ?? 0;
        const bankIndex = typeof selection[tourIndex] === 'number' ? selection[tourIndex] : null;
        setRound5CurrentBankIndex(bankIndex);
        const bank = round5QuestionsRef.current;
        setRound5CurrentQuestion(bankIndex !== null ? bank[bankIndex] ?? null : null);
        setRound5AnswerValue('');
        setHasAnswered(false);
        setError('');

        setQuestionStartedAt(room.question_started_at);
        if (detectedStatus === 'round5-running') {
          const initialTime = getRemainingSeconds(room.question_started_at, offset);
          setTimeLeft(room.all_players_answered ? 0 : initialTime);
        } else {
          setTimeLeft(0);
        }

        if (bankIndex !== null) {
          const { data: existingRound5Answer } = await supabase
            .from('round5_answers')
            .select('answer_value')
            .eq('player_id', storedPlayerId)
            .eq('room_id', room.id)
            .eq('question_index', bankIndex)
            .maybeSingle();

          if (existingRound5Answer) {
            setHasAnswered(true);
            const existingValue = coerceToNumber(
              typeof existingRound5Answer === 'object' && existingRound5Answer !== null && 'answer_value' in existingRound5Answer
                ? (existingRound5Answer as { answer_value?: unknown }).answer_value
                : null
            );
            if (existingValue !== null) {
              setRound5AnswerValue(String(existingValue));
            }
          } else {
            setHasAnswered(false);
          }
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
    const applyRoomUpdate = async (nextRoom: RoomUpdatePayload['new']) => {
      await handleRoomUpdate({ new: nextRoom } as RoomUpdatePayload);
    };

    if (!realtimeEnabled) {
      const poll = async () => {
        const { data } = await supabase
          .from('rooms')
          .select(
            'id, pack_id, current_question_index, is_active, status, question_started_at, all_players_answered, selected_question_ids, round2_item_index, round2_showing_fact, round2_phase, round3_question_index, round4_puzzle_id, round5_question_index'
          )
          .eq('id', roomId)
          .single();
        if (mounted && data) {
          await applyRoomUpdate(data as RoomUpdatePayload['new']);
        }
      };
      void poll();
      const intervalId = setInterval(poll, 2000);
      return () => {
        mounted = false;
        clearInterval(intervalId);
      };
    }

    const handleRoomUpdate = async (payload: RoomUpdatePayload) => {
      // Debug: log every Realtime event
      const newStatus = (payload.new.status as RoomStatus) || (payload.new.is_active ? 'waiting' : 'finished');
      const startedAt = payload.new.question_started_at as string | null;
      const newQuestionIndex = coerceToNumber(payload.new.current_question_index);

      // Если ведущий закрыл комнату полностью — возвращаем на экран подключения.
      // Важно: не редиректим во время переходов между раундами, когда ведущий может временно сбросить таймер.
      if (newStatus === 'finished' && startedAt === null && payload.new.is_active === false) {
        router.push('/join');
        return;
      }

      setRoomStatus(newStatus);
      const everyoneAnsweredFlag =
        newStatus === 'running' ||
          newStatus === 'round2-running' ||
          newStatus === 'round3-running' ||
          newStatus === 'round4-running' ||
          newStatus === 'round5-running'
          ? !!payload.new.all_players_answered
          : newStatus === 'round5-explanation'
            ? true
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

      // Only treat as finished if status is 'finished', not just is_active=false
      // (round4-running may have is_active=false during answer reveal)
      if (newStatus === 'finished' || newStatus === 'final-results') {
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
        setRound4Puzzle(effectivePuzzleId ? round4Puzzles.find((p) => p.id === effectivePuzzleId) ?? null : null);

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

      if (newStatus === 'round5-running' || newStatus === 'round5-explanation') {
        setShowResults(false);
        setQuestion(null);
        setRound2ItemIndex(null);
        setRound2Phase('idle');
        setRound3QuestionIndex(null);
        setRound4Puzzle(null);
        setRound4PuzzleId(null);
        setRound4AnswerText('');

        const tourIndex = newQuestionIndex ?? 0;
        const bankIndex = typeof selection[tourIndex] === 'number' ? selection[tourIndex] : null;
        setRound5CurrentBankIndex(bankIndex);
        const bank = round5QuestionsRef.current;
        setRound5CurrentQuestion(bankIndex !== null ? bank[bankIndex] ?? null : null);
        setRound5AnswerValue('');
        setHasAnswered(false);
        setError('');

        setQuestionStartedAt(startedAt);
        const offset = await syncServerTimeRef.current?.();
        if (newStatus === 'round5-running') {
          if (everyoneAnsweredFlag) {
            setTimeLeft(0);
          } else {
            setTimeLeft(startedAt ? getRemainingSeconds(startedAt, offset || 0) : QUESTION_DURATION_SECONDS);
          }
        } else {
          setTimeLeft(0);
        }

        const currentPlayerId = playerIdRef.current;
        const currentRoomId = roomIdRef.current;
        if (currentPlayerId && currentRoomId && bankIndex !== null) {
          const { data: newAnswer } = await supabase
            .from('round5_answers')
            .select('answer_value')
            .eq('player_id', currentPlayerId)
            .eq('room_id', currentRoomId)
            .eq('question_index', bankIndex)
            .maybeSingle();
          if (newAnswer) {
            setHasAnswered(true);
            const existingValue = coerceToNumber(
              typeof newAnswer === 'object' && newAnswer !== null && 'answer_value' in newAnswer
                ? (newAnswer as { answer_value?: unknown }).answer_value
                : null
            );
            if (existingValue !== null) {
              setRound5AnswerValue(String(existingValue));
            }
          } else {
            setHasAnswered(false);
          }
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
    };

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
          await handleRoomUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      roomChannel.unsubscribe().then(() => {
        supabase.removeChannel(roomChannel);
      });
    };
  }, [realtimeEnabled, roomId, round2ShowingFact, round4Puzzles, router, timeOffsetMs]);

  const effectiveTimeLeft = allPlayersAnswered ? 0 : timeLeft;
  // Round4 should keep timer ticking even when allPlayersAnswered (until explanation phase)
  const timerActive =
    !showResults &&
    ((roomStatus === 'round3-running' && Boolean(questionStartedAt)) ||
      (roomStatus === 'round4-running' && Boolean(questionStartedAt)) ||
      (roomStatus === 'round5-running' && Boolean(questionStartedAt)) ||
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

  const submitRound5Answer = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
    if (roomStatus !== 'round5-running') {
      setError('Дождитесь начала финала');
      return;
    }
    if (!roomId || !playerId) {
      return;
    }
    if (round5CurrentBankIndex === null) {
      setError('Вопрос финала ещё не выбран');
      return;
    }
    if (allPlayersAnswered || timeLeft <= 0) {
      setError('Время на ответ истекло');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const normalized = (round5AnswerValue ?? '').trim().replace(',', '.');
      const numeric = Number(normalized);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        setError('Введите число больше 0');
        return;
      }

      const { error: upsertError } = await supabase
        .from('round5_answers')
        .upsert(
          {
            room_id: roomId,
            player_id: playerId,
            question_index: round5CurrentBankIndex,
            answer_value: numeric,
            submitted_at: new Date().toISOString(),
          },
          { onConflict: 'room_id,player_id,question_index' }
        );

      if (upsertError) {
        console.error('Round5 answer submit failed', upsertError);
        setError('Не удалось отправить ответ. Проверьте SQL финала и попробуйте ещё раз.');
        return;
      }

      setHasAnswered(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Ошибка: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [allPlayersAnswered, isSubmitting, playerId, roomId, roomStatus, round5AnswerValue, round5CurrentBankIndex, timeLeft]);

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

  useEffect(() => {
    if (roomStatus !== 'round3-running') {
      return;
    }
    if (round3Phase !== 'vote' && round3Phase !== 'vote-countdown') {
      return;
    }

    const refresh = () => {
      void loadRound3VoteOptions();
      void loadRound3VoteState();
    };

    // Realtime is not subscribed to round3_answers/round3_votes on the player,
    // so poll during voting to avoid “empty list” races.
    refresh();
    const intervalId = setInterval(refresh, 1000);
    return () => clearInterval(intervalId);
  }, [loadRound3VoteOptions, loadRound3VoteState, roomStatus, round3Phase]);

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
      if (round3Phase !== 'vote' && round3Phase !== 'vote-countdown') {
        return;
      }

      setError('');
      setIsSubmitting(true);
      try {
        const { error } = await supabase
          .from('round3_votes')
          .upsert(
            {
              room_id: roomId,
              voter_player_id: playerId,
              question_index: round3QuestionIndex,
              answer_id: answerId,
            },
            { onConflict: 'room_id,voter_player_id,question_index' }
          );
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

      // Проверяем правильность ответа
      const correctAnswerKey = getOptionKeyByIndex(question.correctIndex);
      const isCorrect = optionKey === correctAnswerKey;
      const pointsEarned = isCorrect ? question.points : 0;

      const questionIndex = Math.max(0, (question.order || 1) - 1);
      const { data, error: submitError } = await submitRound1Answer({
        roomId,
        playerId,
        questionIndex,
        answer: optionKey,
        isCorrect,
        points: pointsEarned,
      });

      if (submitError) {
        setError('Ошибка при отправке ответа');
        setIsSubmitting(false);
        return;
      }

      if (data?.total_points !== null && data?.total_points !== undefined) {
        setPlayerTotalPoints(data.total_points);
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
  const phaseBannerLabel =
    roomStatus === 'waiting'
      ? 'Ожидание игроков'
      : allPlayersAnswered
        ? 'Переходим к следующему вопросу'
        : '';

  if (showResults && (roomStatus === 'finished' || roomStatus === 'final-results')) {
    const isFinal = roomStatus === 'final-results';
    const isWinner = isFinal && playerRank === 1;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fef4dc] text-[#142a45] px-4 py-10">
        <div
          className={`rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl max-w-lg w-full p-8 text-center space-y-4 ${
            isFinal ? 'animate-final-panel' : ''
          }`}
        >
          <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">
            {isFinal ? 'Игра завершена' : 'Раунд завершён'}
          </p>
          <h2 className="text-3xl font-black">{isFinal ? 'Финальные результаты' : 'Текущие результаты'}</h2>

          <div
            className={`rounded-3xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-5 space-y-3 ${
              isFinal ? 'animate-final-panel' : ''
            }`}
            style={isFinal ? { animationDelay: '120ms' } : undefined}
          >
            <p className="retro-heading text-[11px] tracking-[0.4em] text-[#142a45]/60">ВАШ ПРОГРЕСС</p>

            {standingError ? (
              <p className="text-sm font-semibold text-[#b23324]">{standingError}</p>
            ) : (
              <ScoreSummary
                points={playerTotalPoints}
                rank={playerRank}
                totalPlayers={playersCount}
                isLoading={isStandingLoading}
                className="phase-transition"
              />
            )}

            <button
              onClick={() => {
                void loadPlayerStanding();
              }}
              className="w-full py-3 rounded-2xl border-[3px] border-[#142a45] bg-white font-black"
              disabled={isStandingLoading}
            >
              {isStandingLoading ? 'Обновляем…' : 'Обновить данные'}
            </button>
          </div>

          {isFinal && (
            <div
              className={`rounded-3xl border-[4px] ${
                isWinner ? 'border-[#1f6ac6] bg-[#e9f0ff]' : 'border-[#142a45]/15 bg-[#f7f7f7]'
              } p-6 space-y-2 animate-final-panel`}
              style={{ animationDelay: '240ms' }}
            >
              <div className="text-5xl">{isWinner ? '🏆' : '🎊'}</div>
              <p className={`text-2xl font-black ${isWinner ? 'text-[#1f6ac6]' : 'text-[#142a45]'}`}>
                {isWinner ? 'Поздравляем! Ты победил!' : 'Спасибо за игру!'}
              </p>
              <p className="text-sm text-[#142a45]/70">
                {isWinner
                  ? 'Ведущий сейчас объявит результаты — наслаждайся победой.'
                  : 'Ведущий сейчас объявит результаты и победителя.'}
              </p>
            </div>
          )}

          {isFinal && (
            <a
              href="https://donatty.com/aleksandri"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center py-4 rounded-2xl border-[3px] border-[#142a45] bg-[#ffe184] font-black tracking-[0.08em] hover:scale-[1.02] hover:shadow-lg transition-all duration-200"
            >
              Поддержать разработчика
            </a>
          )}

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

        <PhaseStatusBanner phaseLabel={phaseBannerLabel} className="mt-4" />

        {roomStatus === 'waiting' && (
          <section className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-8 text-center space-y-4">
            {isIntermission ? (
              <>
                <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">ПЕРЕРЫВ МЕЖДУ РАУНДАМИ</p>
                <h2 className="text-3xl font-black">🏁 Текущие результаты</h2>

                <div className="rounded-3xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-5 space-y-3 animate-final-panel">
                  <p className="retro-heading text-[11px] tracking-[0.4em] text-[#142a45]/60">ВАШ ПРОГРЕСС</p>

                  {standingError ? (
                    <p className="text-sm font-semibold text-[#b23324]">{standingError}</p>
                  ) : (
                    <ScoreSummary
                      points={playerTotalPoints}
                      rank={playerRank}
                      totalPlayers={playersCount}
                      isLoading={isStandingLoading}
                      className="animate-final-panel"
                    />
                  )}
                </div>

                <p className="text-sm text-[#142a45]/80">
                  Ждём следующий раунд от ведущего. Ничего нажимать не нужно.
                </p>
              </>
            ) : (
              <>
                <div className="text-5xl">⏳</div>
                <h2 className="text-3xl font-black">Ждём старт от ведущего</h2>
                <p className="text-sm text-[#142a45]/80">
                  Вы подключены. Ведущий начнёт раунд, когда все игроки войдут. Ничего нажимать не нужно — просто ждите звукового сигнала.
                </p>
              </>
            )}
          </section>
        )}

        {roomStatus === 'round4-running' && (
          <section
            key={`round4-player-${round4PuzzleId ?? 'none'}-${allPlayersAnswered ? 'answered' : 'run'}`}
            className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-6 animate-round4-panel"
          >
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

        {(roomStatus === 'round5-running' || roomStatus === 'round5-explanation') && (
          <section className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-6">
            <div className="flex flex-col gap-3 text-center">
              <span className="mx-auto px-4 py-2 rounded-full border-[3px] border-[#142a45] text-sm font-black">
                Финал · Цифровая интуиция
              </span>
              <h2 className="text-3xl font-black leading-tight">
                {round5CurrentQuestion?.question ? (
                  <AnimatedText
                    key={`r5-q-${round5CurrentBankIndex ?? 'x'}`}
                    text={round5CurrentQuestion.question}
                  />
                ) : (
                  '⏳'
                )}
              </h2>
            </div>

            <div>
              <div className="flex justify-between text-xs text-[#142a45]/70 mb-1">
                <span>Таймер · 30 сек</span>
                <span className={`font-black ${allPlayersAnswered ? 'text-[#1f6ac6]' : 'text-[#142a45]'}`}>{timerLabel}</span>
              </div>
              <div className="h-3 rounded-full bg-[#ffeccd] overflow-hidden">
                <div
                  className={`h-full ${effectiveTimeLeft > 5 ? 'bg-[#1f6ac6]' : 'bg-[#f1532f]'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {roomStatus === 'round5-explanation' && (
                <p className="text-xs text-[#1f6ac6] font-semibold mt-2">Слушаем объяснение ведущего.</p>
              )}
              {roomStatus === 'round5-running' && effectiveTimeLeft <= 0 && (
                <p className="text-xs text-center text-[#142a45]/60">⏱ Время истекло. Ждём ответ ведущего.</p>
              )}
            </div>

            {roomStatus !== 'round5-running' || hasAnswered || allPlayersAnswered ? (
              <div className="rounded-3xl border-[3px] border-[#1f6ac6] bg-[#e9f0ff] p-6 text-center space-y-2">
                <div className="text-5xl">✅</div>
                <h3 className="text-2xl font-black text-[#1f6ac6]">
                  {roomStatus === 'round5-explanation' ? 'Ответ открыт!' : 'Ответ отправлен!'}
                </h3>
                <p className="text-sm text-[#142a45]/70">
                  {roomStatus === 'round5-explanation'
                    ? 'Слушаем объяснение и ждём следующий тур.'
                    : 'Ждём окончания таймера и подсчёта очков.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/60 text-center">ВВЕДИ ЧИСЛО</p>
                <input
                  value={round5AnswerValue}
                  onChange={(e) => setRound5AnswerValue(e.target.value)}
                  placeholder="Например: 42"
                  className="w-full rounded-2xl border-[3px] border-[#142a45] bg-white px-4 py-3 text-sm font-semibold outline-none"
                  autoComplete="off"
                  inputMode="decimal"
                  disabled={
                    isSubmitting ||
                    effectiveTimeLeft <= 0 ||
                    allPlayersAnswered ||
                    roomStatus !== 'round5-running' ||
                    round5CurrentBankIndex === null
                  }
                />
                <button
                  onClick={() => void submitRound5Answer()}
                  disabled={
                    isSubmitting ||
                    effectiveTimeLeft <= 0 ||
                    allPlayersAnswered ||
                    roomStatus !== 'round5-running' ||
                    round5CurrentBankIndex === null
                  }
                  className="w-full py-3 rounded-2xl font-black text-lg tracking-[0.18em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Отправить
                </button>

                {error && (
                  <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
                    {error}
                  </div>
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
              <h2 className="text-3xl font-black leading-tight">
                <AnimatedText key={`r1-q-${typeof question.id === 'number' ? question.id : question.order}`} text={question.text} />
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
                <AnimatedText
                  key={`r2-q-${round2ItemIndex ?? 'x'}-${round2ShowingFact ? 't' : 'f'}`}
                  text={
                    round2ItemIndex !== null && round2Items[round2ItemIndex]
                      ? round2ShowingFact
                        ? round2Items[round2ItemIndex].fact
                        : round2Items[round2ItemIndex].fiction
                      : 'Подождите, факт загружается…'
                  }
                />
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
                    ? 'Введи свой вариант и жди голосования.'
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
                {currentRound3Question?.question ? (
                  <AnimatedText key={`r3-q-${round3QuestionIndex ?? 'x'}`} text={currentRound3Question.question} />
                ) : (
                  'Вопрос загружается…'
                )}
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
                    ? `Голосование · ${ROUND3_VOTE_SECONDS} сек`
                    : round3Phase === 'vote-countdown'
                      ? 'Голосуем через…'
                      : `Таймер · ${ROUND3_ANSWER_SECONDS} сек`}
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
                  placeholder="слова или фраза"
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
