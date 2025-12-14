'use client';

import { useState, useEffect, useCallback, useRef, ChangeEvent, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  ActiveRoundQuestion,
  OPTION_LABELS,
  getOptionKeyByIndex,
  getQuestionForIndex,
} from '@/lib/questions';
import { TrueFalseItem, ROUND2_POINTS } from '@/lib/round2';
import { getRound3QuestionById, type Round3Question } from '@/lib/round3';

const QUESTION_DURATION_SECONDS = 30;
const ROUND3_VOTE_SECONDS = 15;
const APP_VERSION = '1.0.4'; // Инкрементируйте при важных изменениях

type Round3AnswerRow = {
  id: string;
  player_id: string;
  answer: string;
  question_index: number;
  submitted_at: string;
};

type Round3AnswersListProps = {
  answers: Round3AnswerRow[];
  playerId?: string;
  isSelfVisible?: boolean;
  roomStatus: RoomStatus;
  title?: string;
};

type Round3Phase = 'input' | 'vote' | 'reveal';

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

const getRound3InputRemainingSeconds = (startedAt: string | null, offsetMs = 0) => {
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

const getRound3VoteRemainingSeconds = (startedAt: string | null, offsetMs = 0) => {
  if (!startedAt) {
    return ROUND3_VOTE_SECONDS;
  }
  const startTime = new Date(startedAt).getTime();
  if (Number.isNaN(startTime)) {
    return ROUND3_VOTE_SECONDS;
  }
  const now = Date.now() - offsetMs;
  const diffMs = now - startTime;
  const elapsedSeconds = Math.floor(diffMs / 1000);
  const remaining = ROUND3_VOTE_SECONDS - elapsedSeconds;
  return Math.max(0, Math.min(ROUND3_VOTE_SECONDS, remaining));
};

type Question = ActiveRoundQuestion;

type Round2Phase = 'idle' | 'fact' | 'explanation';

type RoomStatus =
  | 'waiting'
  | 'running'
  | 'round2-running'
  | 'round2-ready'
  | 'round3-ready'
  | 'round3-running'
  | 'round3-voting'
  | 'round3-reveal'
  | 'finished';

type Round3AnswerChangePayload = {
  new: Round3AnswerRow;
  old: Round3AnswerRow;
};

type Round3VoteRow = {
  answer_id: string;
};

type RoomUpdatePayload = {
  new: {
    current_question_index: number;
    question_started_at: string | null;
    status: RoomStatus;
    is_active: boolean;
    all_players_answered: boolean;
    selected_question_ids: number[] | null;
    round2_item_index: number | null;
    round2_showing_fact: boolean | null;
    round2_phase: Round2Phase | null;
    round3_question_index: number | null;
    round3_question_id: number | null;
    round3_question_started_at: string | null;
    round3_vote_started_at: string | null;
    round3_phase: 'input' | 'vote' | 'reveal' | null;
  };
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomCode = params.code as string;
  const fallbackPlayerId = searchParams.get('pid');
  const fallbackPlayerName = searchParams.get('name');

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
  const [round2Items, setRound2Items] = useState<TrueFalseItem[]>([]);
  const [round2CurrentIndex, setRound2CurrentIndex] = useState<number | null>(null);
  const [round2ShowingFact, setRound2ShowingFact] = useState<boolean>(true);
  const [round2Phase, setRound2Phase] = useState<Round2Phase>('idle');
  const [round2AnsweredChoice, setRound2AnsweredChoice] = useState<boolean | null>(null);
  const [round2AnsweredCorrect, setRound2AnsweredCorrect] = useState<boolean | null>(null);
  const [round3AnswerDraft, setRound3AnswerDraft] = useState('');
  const [round3QuestionIndex, setRound3QuestionIndex] = useState<number | null>(null);
  const [round3QuestionId, setRound3QuestionId] = useState<number | null>(null);
  const [round3QuestionMeta, setRound3QuestionMeta] = useState<Round3Question | null>(null);
  const [round3Answers, setRound3Answers] = useState<Round3AnswerRow[]>([]);
  const [round3SubmittedAnswer, setRound3SubmittedAnswer] = useState<string | null>(null);
  const [isRound3Submitting, setIsRound3Submitting] = useState(false);
  const [round3Error, setRound3Error] = useState('');
  const [round3Phase, setRound3Phase] = useState<'input' | 'vote' | 'reveal' | null>(null);
  const [round3QuestionStartedAt, setRound3QuestionStartedAt] = useState<string | null>(null);
  const [round3VoteStartedAt, setRound3VoteStartedAt] = useState<string | null>(null);
  const [round3VoteTimeLeft, setRound3VoteTimeLeft] = useState(15);
  const [round3InputTimeLeft, setRound3InputTimeLeft] = useState(QUESTION_DURATION_SECONDS);
  const [round3VoteSelection, setRound3VoteSelection] = useState<string | null>(null);
  const [isRound3Voting, setIsRound3Voting] = useState(false);
  const [isRound3VoteSubmitting, setIsRound3VoteSubmitting] = useState(false);
  const roomIdRef = useRef('');
  const playerIdRef = useRef('');
  const roomStatusRef = useRef<RoomStatus>('waiting');
  const round3QuestionIndexRef = useRef<number | null>(null);
  const previousRound3QuestionIndexRef = useRef<number | null>(null);

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
    round3QuestionIndexRef.current = round3QuestionIndex;
  }, [round3QuestionIndex]);

  useEffect(() => {
    if (previousRound3QuestionIndexRef.current === round3QuestionIndex) {
      return;
    }
    previousRound3QuestionIndexRef.current = round3QuestionIndex;
    setRound3AnswerDraft('');
    setRound3SubmittedAnswer(null);
    setRound3Error('');
    setRound3Answers([]);
  }, [round3QuestionIndex]);

  useEffect(() => {
    roomStatusRef.current = roomStatus;
  }, [roomStatus]);

  useEffect(() => {
    if (round3QuestionId === null) {
      setRound3QuestionMeta(null);
      return;
    }
    setRound3QuestionMeta(getRound3QuestionById(round3QuestionId));
  }, [round3QuestionId]);

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

  const loadRound3Answers = useCallback(async (questionIndex: number | null) => {
    if (!roomIdRef.current || questionIndex === null) {
      setRound3Answers([]);
      setRound3SubmittedAnswer(null);
      return;
    }

    const { data, error } = await supabase
      .from('round3_answers')
      .select('id, player_id, answer, question_index, submitted_at')
      .eq('room_id', roomIdRef.current)
      .eq('question_index', questionIndex)
      .order('submitted_at', { ascending: true });

    if (error) {
      console.error('Не удалось загрузить ответы Раунда 3', error);
      return;
    }

    const rows = data || [];
    setRound3Answers(rows);
    const currentPlayerId = playerIdRef.current;
    if (currentPlayerId) {
      const ownAnswer = rows.find((row) => row.player_id === currentPlayerId);
      setRound3SubmittedAnswer(ownAnswer?.answer ?? null);
    } else {
      setRound3SubmittedAnswer(null);
    }
  }, []);
  
  const loadRound3Vote = useCallback(async (questionIndex: number | null) => {
    if (!roomIdRef.current || !playerIdRef.current || questionIndex === null) {
      setRound3VoteSelection(null);
      return;
    }

    const { data, error } = await supabase
      .from('round3_votes')
      .select('answer_id')
      .eq('room_id', roomIdRef.current)
      .eq('player_id', playerIdRef.current)
      .eq('question_index', questionIndex)
      .single();

    if (error) {
      console.error('Не удалось загрузить голос Раунда 3', error);
      setRound3VoteSelection(null);
      return;
    }

    setRound3VoteSelection((data as Round3VoteRow | null)?.answer_id ?? null);
  }, []);
  const loadQuestionFromSelectionRef = useRef(loadQuestionFromSelection);
  const loadRound3AnswersRef = useRef(loadRound3Answers);
  const loadRound3VoteRef = useRef(loadRound3Vote);
  const syncServerTimeRef = useRef(syncServerTime);

  useEffect(() => {
    const loadRound2Data = async () => {
      try {
        const res = await fetch('/round2/true_false_explanation.json', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as TrueFalseItem[];
        setRound2Items(json);
      } catch (e) {
        console.error('Не удалось загрузить данные Раунда 2', e);
      }
    };
    loadRound2Data();
  }, []);

  useEffect(() => {
    loadQuestionFromSelectionRef.current = loadQuestionFromSelection;
  }, [loadQuestionFromSelection]);

  useEffect(() => {
    loadRound3AnswersRef.current = loadRound3Answers;
  }, [loadRound3Answers]);

  useEffect(() => {
    loadRound3VoteRef.current = loadRound3Vote;
  }, [loadRound3Vote]);

  useEffect(() => {
    syncServerTimeRef.current = syncServerTime;
  }, [syncServerTime]);

  useEffect(() => {
    const init = async () => {
      try {
        try {
          const storedVersion = localStorage.getItem('appVersion');
          if (storedVersion !== APP_VERSION) {
            console.log('New version detected, clearing cache');
            localStorage.setItem('appVersion', APP_VERSION);
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (storageError) {
          console.warn('Не удалось обновить версию приложения', storageError);
        }

        let storedPlayerId = '';
        let storedName = '';
        try {
          storedPlayerId = localStorage.getItem('playerId') || '';
          storedName = localStorage.getItem('playerName') || '';
        } catch (storageError) {
          console.warn('Не удалось получить данные игрока из localStorage', storageError);
        }

        if (!storedPlayerId && fallbackPlayerId) {
          storedPlayerId = fallbackPlayerId;
          try {
            localStorage.setItem('playerId', fallbackPlayerId);
          } catch (storageError) {
            console.warn('Не удалось сохранить playerId в localStorage', storageError);
          }
        }

        if (!storedName && fallbackPlayerName) {
          storedName = fallbackPlayerName;
          try {
            localStorage.setItem('playerName', fallbackPlayerName);
          } catch (storageError) {
            console.warn('Не удалось сохранить playerName в localStorage', storageError);
          }
        }

        if (!storedPlayerId || !storedName) {
          setError('Не удалось найти данные игрока. Вернитесь на экран подключения и попробуйте ещё раз.');
          router.push('/');
          return;
        }

        setPlayerName(storedName);
        setPlayerId(storedPlayerId);
        playerIdRef.current = storedPlayerId;

        const offset = await syncServerTimeRef.current?.();

        const { data: room, error: roomError } = await supabase
          .from('rooms')
          .select(
            'id, current_question_index, is_active, status, question_started_at, all_players_answered, selected_question_ids, round2_item_index, round2_showing_fact, round2_phase, round3_question_index, round3_question_id, round3_question_started_at, round3_vote_started_at, round3_phase'
          )
          .eq('code', roomCode)
          .single();

        if (roomError || !room) {
          setError('Комната не найдена');
          return;
        }

        setRoomId(room.id);
        roomIdRef.current = room.id;
        const initialRound3Index = typeof room.round3_question_index === 'number' ? room.round3_question_index : null;
        const initialRound3Id = typeof room.round3_question_id === 'number' ? room.round3_question_id : null;
        const initialRound3Phase = (room.round3_phase as 'input' | 'vote' | 'reveal' | null) ?? null;
        const initialRound3QuestionStartedAt = (room.round3_question_started_at as string | null) ?? null;
        const initialRound3VoteStartedAt = (room.round3_vote_started_at as string | null) ?? null;
        const selection = (room.selected_question_ids as number[] | null) || [];
        setSelectedQuestionIds(selection);
        const detectedStatus = (room.status as RoomStatus) || (room.is_active ? 'waiting' : 'finished');
        const effectiveDetectedStatus =
          detectedStatus === 'round3-running'
            ? initialRound3Phase === 'vote'
              ? 'round3-voting'
              : initialRound3Phase === 'reveal'
                ? 'round3-reveal'
                : 'round3-running'
            : detectedStatus;
        setRoomStatus(effectiveDetectedStatus);
        const isLiveRound =
          effectiveDetectedStatus === 'running' ||
          effectiveDetectedStatus === 'round2-running' ||
          effectiveDetectedStatus === 'round3-running' ||
          effectiveDetectedStatus === 'round3-voting';
        setAllPlayersAnswered(isLiveRound ? !!room.all_players_answered : false);
        setRound3QuestionIndex(initialRound3Index);
        setRound3QuestionId(initialRound3Id);
        setRound3Phase(initialRound3Phase);
        setRound3QuestionStartedAt(initialRound3QuestionStartedAt);
        setRound3VoteStartedAt(initialRound3VoteStartedAt);

        if (effectiveDetectedStatus === 'waiting') {
          setShowResults(false);
          setHasAnswered(false);
          setQuestion(null);
          setQuestionStartedAt(null);
          setTimeLeft(QUESTION_DURATION_SECONDS);
          setRound3QuestionIndex(null);
          setRound3QuestionId(null);
          setRound3Answers([]);
          setRound3SubmittedAnswer(null);
          return;
        }

        if (effectiveDetectedStatus === 'round2-ready' || effectiveDetectedStatus === 'round3-ready') {
          setShowResults(true);
          setQuestion(null);
          setQuestionStartedAt(null);
          setRound2Phase('idle');
          setRound2CurrentIndex(null);
          setRound2AnsweredChoice(null);
          setRound2AnsweredCorrect(null);
          setRound3QuestionIndex(null);
          setRound3QuestionId(null);
          setRound3Answers([]);
          setRound3SubmittedAnswer(null);
          return;
        }

        if (!room.is_active || effectiveDetectedStatus === 'finished') {
          setShowResults(true);
          setQuestion(null);
          setQuestionStartedAt(null);
          setRound3QuestionIndex(null);
          setRound3QuestionId(null);
          setRound3Answers([]);
          setRound3SubmittedAnswer(null);
          return;
        }

        if (effectiveDetectedStatus === 'running') {
          const startTime = room.question_started_at;
          setQuestionStartedAt(startTime);
          const initialTime = getRemainingSeconds(startTime, offset);
          setTimeLeft(room.all_players_answered ? 0 : initialTime);

          loadQuestionFromSelectionRef.current?.(room.current_question_index, selection);

          const { data: existingAnswer } = await supabase
            .from('answers')
            .select('id')
            .eq('player_id', storedPlayerId)
            .eq('room_id', room.id)
            .eq('question_index', room.current_question_index)
            .single();

          if (existingAnswer) {
            setHasAnswered(true);
          } else {
            setHasAnswered(false);
          }
          return;
        }

        if (effectiveDetectedStatus === 'round2-running') {
          setRoomStatus('round2-running');
          setShowResults(false);
          setQuestion(null);
          const round2Index = (room.round2_item_index as number | null) ?? room.current_question_index ?? null;
          const showingFact = typeof room.round2_showing_fact === 'boolean' ? room.round2_showing_fact : true;
          const phase = (room.round2_phase as Round2Phase) || 'fact';
          setRound2CurrentIndex(round2Index);
          setRound2ShowingFact(showingFact);
          setRound2Phase(phase);
          setQuestionStartedAt(room.question_started_at);
          setTimeLeft(getRemainingSeconds(room.question_started_at, offset));
          setRound2AnsweredChoice(null);
          setRound2AnsweredCorrect(null);
          if (round2Index !== null) {
            const { data: existingRound2Answer } = await supabase
              .from('round2_answers')
              .select('answer_is_fact, is_correct')
              .eq('player_id', storedPlayerId)
              .eq('room_id', room.id)
              .eq('item_index', round2Index)
              .single();

            if (existingRound2Answer) {
              setHasAnswered(true);
              setRound2AnsweredChoice(existingRound2Answer.answer_is_fact);
              setRound2AnsweredCorrect(existingRound2Answer.is_correct);
            } else {
              setHasAnswered(false);
            }
          } else {
            setHasAnswered(false);
          }
          return;
        }

        if (effectiveDetectedStatus === 'round3-running') {
          setRoomStatus('round3-running');
          setShowResults(false);
          setQuestion(null);
          setRound2Phase('idle');
          setRound2CurrentIndex(null);
          setRound2AnsweredChoice(null);
          setRound2AnsweredCorrect(null);
          setIsRound3Voting(false);
          setRound3VoteSelection(null);
          setRound3Phase(initialRound3Phase || 'input');
          setRound3QuestionStartedAt(initialRound3QuestionStartedAt);
          setRound3VoteStartedAt(initialRound3VoteStartedAt);
          if (initialRound3Index !== null) {
            setRound3SubmittedAnswer(null);
            await loadRound3Answers(initialRound3Index);
            await loadRound3Vote(initialRound3Index);
          } else {
            setRound3Answers([]);
            setRound3SubmittedAnswer(null);
            setRound3VoteSelection(null);
          }
          return;
        }

        if (effectiveDetectedStatus === 'round3-voting' || effectiveDetectedStatus === 'round3-reveal') {
          setRoomStatus(effectiveDetectedStatus);
          setShowResults(false);
          setQuestion(null);
          setRound2Phase('idle');
          setRound2CurrentIndex(null);
          setRound2AnsweredChoice(null);
          setRound2AnsweredCorrect(null);
          setIsRound3Voting(effectiveDetectedStatus === 'round3-voting');
          setRound3Phase(initialRound3Phase || (effectiveDetectedStatus === 'round3-voting' ? 'vote' : 'reveal'));
          setRound3QuestionStartedAt(initialRound3QuestionStartedAt);
          setRound3VoteStartedAt(initialRound3VoteStartedAt);
          if (initialRound3Index !== null) {
            await loadRound3Answers(initialRound3Index);
            await loadRound3Vote(initialRound3Index);
          } else {
            setRound3Answers([]);
            setRound3VoteSelection(null);
          }
          return;
        }

        setHasAnswered(false);
      } catch (err) {
        console.error('Не удалось загрузить комнату игрока', err);
        setError('Не удалось подключиться к комнате. Попробуйте обновить страницу.');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [roomCode, router, fallbackPlayerId, fallbackPlayerName]);

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
          const nextRound3Phase = (payload.new.round3_phase as 'input' | 'vote' | 'reveal' | null) ?? null;
          const effectiveStatus =
            newStatus === 'round3-running'
              ? nextRound3Phase === 'vote'
                ? 'round3-voting'
                : nextRound3Phase === 'reveal'
                  ? 'round3-reveal'
                  : 'round3-running'
              : newStatus;
          const everyoneAnsweredFlag =
            effectiveStatus === 'running' ||
            effectiveStatus === 'round2-running' ||
            effectiveStatus === 'round3-running' ||
            effectiveStatus === 'round3-voting'
              ? !!payload.new.all_players_answered
              : false;
          setAllPlayersAnswered(everyoneAnsweredFlag);
          setRoomStatus(effectiveStatus);
          const selection = (payload.new.selected_question_ids as number[] | null) || [];
          setSelectedQuestionIds(selection);
          const nextRound2Index =
            (payload.new.round2_item_index as number | null) ?? (typeof newQuestionIndex === 'number' ? newQuestionIndex : null);
          const nextRound2Phase = (payload.new.round2_phase as Round2Phase) || 'idle';
          const nextRound2Showing =
            typeof payload.new.round2_showing_fact === 'boolean' ? payload.new.round2_showing_fact : true;
          const nextRound3Index = typeof payload.new.round3_question_index === 'number' ? payload.new.round3_question_index : null;
          const nextRound3Id = typeof payload.new.round3_question_id === 'number' ? payload.new.round3_question_id : null;
          const nextRound3QuestionStartedAt = (payload.new.round3_question_started_at as string | null) ?? null;
          const nextRound3VoteStartedAt = (payload.new.round3_vote_started_at as string | null) ?? null;
          setRound3QuestionIndex(nextRound3Index);
          setRound3QuestionId(nextRound3Id);
          setRound3Phase(nextRound3Phase);
          setRound3QuestionStartedAt(nextRound3QuestionStartedAt);
          setRound3VoteStartedAt(nextRound3VoteStartedAt);

          if (effectiveStatus === 'waiting') {
            setShowResults(false);
            setHasAnswered(false);
            setQuestion(null);
            setQuestionStartedAt(null);
            setTimeLeft(QUESTION_DURATION_SECONDS);
            setRound2Phase('idle');
            setRound2CurrentIndex(null);
            setRound2AnsweredChoice(null);
            setRound2AnsweredCorrect(null);
            setRound3QuestionIndex(null);
            setRound3QuestionId(null);
            setRound3Answers([]);
            setRound3SubmittedAnswer(null);
            return;
          }

          if (effectiveStatus === 'round2-ready' || effectiveStatus === 'round3-ready') {
            setShowResults(true);
            setQuestion(null);
            setQuestionStartedAt(null);
            setTimeLeft(QUESTION_DURATION_SECONDS);
            setRound2Phase('idle');
            setRound2CurrentIndex(null);
            setRound2AnsweredChoice(null);
            setRound2AnsweredCorrect(null);
            setRound3QuestionIndex(null);
            setRound3QuestionId(null);
            setRound3Answers([]);
            setRound3SubmittedAnswer(null);
            return;
          }

          if (effectiveStatus === 'finished' || !payload.new.is_active) {
            setShowResults(true);
            setQuestion(null);
            setQuestionStartedAt(null);
            setTimeLeft(QUESTION_DURATION_SECONDS);
            setRound2Phase('idle');
            setRound2CurrentIndex(null);
            setRound2AnsweredChoice(null);
            setRound2AnsweredCorrect(null);
            setRound3QuestionIndex(null);
            setRound3QuestionId(null);
            setRound3Answers([]);
            setRound3SubmittedAnswer(null);
            return;
          }

          const offset = await syncServerTimeRef.current?.();
          if (effectiveStatus === 'round2-running') {
            setShowResults(false);
            setQuestion(null);
            setQuestionStartedAt(startedAt);
            setTimeLeft(startedAt ? getRemainingSeconds(startedAt, offset || 0) : QUESTION_DURATION_SECONDS);
            setRound2CurrentIndex(nextRound2Index);
            setRound2Phase(nextRound2Phase === 'idle' ? 'fact' : nextRound2Phase);
            setRound2ShowingFact(nextRound2Showing);

            const currentPlayerId = playerIdRef.current;
            const currentRoomId = roomIdRef.current;

            if (currentPlayerId && currentRoomId && nextRound2Index !== null) {
              const { data: existingRound2Answer } = await supabase
                .from('round2_answers')
                .select('answer_is_fact, is_correct')
                .eq('player_id', currentPlayerId)
                .eq('room_id', currentRoomId)
                .eq('item_index', nextRound2Index)
                .single();

              if (existingRound2Answer) {
                setHasAnswered(true);
                setRound2AnsweredChoice(existingRound2Answer.answer_is_fact);
                setRound2AnsweredCorrect(existingRound2Answer.is_correct);
              } else {
                setHasAnswered(false);
                setRound2AnsweredChoice(null);
                setRound2AnsweredCorrect(null);
              }
            } else {
              setHasAnswered(false);
              setRound2AnsweredChoice(null);
              setRound2AnsweredCorrect(null);
            }
            return;
          }

          if (effectiveStatus === 'round3-running') {
            setShowResults(false);
            setQuestion(null);
            setRound2Phase('idle');
            setRound2CurrentIndex(null);
            setRound2AnsweredChoice(null);
            setRound2AnsweredCorrect(null);
            setIsRound3Voting(false);
            setRound3VoteSelection(null);
            setRound3AnswerDraft(''); // Сбрасываем черновик при новом факте
            if (nextRound3Index !== null) {
              await loadRound3AnswersRef.current?.(nextRound3Index);
              await loadRound3VoteRef.current?.(nextRound3Index);
            } else {
              setRound3Answers([]);
              setRound3SubmittedAnswer(null);
              setRound3VoteSelection(null);
            }
            return;
          }

          if (effectiveStatus === 'round3-voting' || effectiveStatus === 'round3-reveal') {
            setShowResults(false);
            setQuestion(null);
            setRound2Phase('idle');
            setRound2CurrentIndex(null);
            setRound2AnsweredChoice(null);
            setRound2AnsweredCorrect(null);
            setIsRound3Voting(effectiveStatus === 'round3-voting');
            if (nextRound3Index !== null) {
              await loadRound3AnswersRef.current?.(nextRound3Index);
              await loadRound3VoteRef.current?.(nextRound3Index);
            } else {
              setRound3Answers([]);
              setRound3VoteSelection(null);
            }
            return;
          }

          loadQuestionFromSelectionRef.current?.(newQuestionIndex, selection);
          setRound2Phase('idle');
          setRound2CurrentIndex(null);
          setRound2AnsweredChoice(null);
          setRound2AnsweredCorrect(null);
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

    const round3AnswersChannel = supabase
      .channel(`player-round3-answers-${roomId}-${channelId}`)
      .on(
        // @ts-ignore
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'round3_answers',
          filter: `room_id=eq.${roomId}`,
        },
        (payload: Round3AnswerChangePayload) => {
          if (!mounted) {
            return;
          }
          if (roomStatusRef.current !== 'round3-running') {
            return;
          }

          const currentIndex = round3QuestionIndexRef.current;
          if (currentIndex === null) {
            return;
          }

          const payloadIndex = payload.new.question_index;

          if (payloadIndex === null || payloadIndex !== currentIndex) {
            return;
          }

          loadRound3AnswersRef.current?.(currentIndex);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      roomChannel.unsubscribe().then(() => {
        supabase.removeChannel(roomChannel);
      });
      round3AnswersChannel.unsubscribe().then(() => {
        supabase.removeChannel(round3AnswersChannel);
      });
    };
  }, [roomId]);

  useEffect(() => {
    if (roomStatus !== 'round3-running') {
      return;
    }
    if (round3QuestionIndex === null) {
      setRound3Answers([]);
      setRound3SubmittedAnswer(null);
      return;
    }
    // Подстрахуемся: если таймстамп старта вопроса не пришёл, запросим его
    if (!round3QuestionStartedAt && roomIdRef.current) {
      void (async () => {
        const { data } = await supabase
          .from('rooms')
          .select('round3_question_started_at')
          .eq('id', roomIdRef.current)
          .single();
        if (data?.round3_question_started_at) {
          setRound3QuestionStartedAt(data.round3_question_started_at as string);
        }
      })();
    }

    // Синхронизируем время с сервером при смене факта, чтобы таймеры совпадали с ведущим
    void syncServerTime();

    loadRound3Answers(round3QuestionIndex);
  }, [roomStatus, round3QuestionIndex, round3QuestionStartedAt, loadRound3Answers, syncServerTime]);

  useEffect(() => {
    if (roomStatus === 'round3-running') {
      return;
    }
    setRound3Answers([]);
    setRound3SubmittedAnswer(null);
    setIsRound3Submitting(false);
    setRound3Error('');
  }, [roomStatus]);

  const effectiveTimeLeft = allPlayersAnswered ? 0 : timeLeft;
  const isRound2FactPhase = roomStatus === 'round2-running' && round2Phase === 'fact';
  const timerActive =
    !allPlayersAnswered &&
    !showResults &&
    (roomStatus === 'running' || isRound2FactPhase) &&
    Boolean(questionStartedAt);

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
    if (roomStatus !== 'round3-running' && round3AnswerDraft) {
      setRound3AnswerDraft('');
    }
  }, [roomStatus, round3AnswerDraft]);

  useEffect(() => {
    if (roomStatus !== 'round3-running' || !round3QuestionStartedAt) {
      setRound3InputTimeLeft(QUESTION_DURATION_SECONDS);
      return;
    }

    const tick = () => {
      const remaining = getRound3InputRemainingSeconds(round3QuestionStartedAt, timeOffsetMs);
      setRound3InputTimeLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 300);
    return () => clearInterval(interval);
  }, [roomStatus, round3QuestionStartedAt, timeOffsetMs]);

  useEffect(() => {
    if (roomStatus !== 'round3-voting' || !round3VoteStartedAt) {
      setRound3VoteTimeLeft(ROUND3_VOTE_SECONDS);
      return;
    }

    const tick = () => {
      const remaining = getRound3VoteRemainingSeconds(round3VoteStartedAt, timeOffsetMs);
      setRound3VoteTimeLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 300);
    return () => clearInterval(interval);
  }, [roomStatus, round3VoteStartedAt, timeOffsetMs]);

  // При входе в голосование подстрахуем стартовый таймстамп и подгрузку ответов
  useEffect(() => {
    if (roomStatus !== 'round3-voting') {
      return;
    }

    if (!round3VoteStartedAt && roomIdRef.current) {
      void (async () => {
        const { data } = await supabase
          .from('rooms')
          .select('round3_vote_started_at')
          .eq('id', roomIdRef.current)
          .single();
        if (data?.round3_vote_started_at) {
          setRound3VoteStartedAt(data.round3_vote_started_at as string);
        }
      })();
    }

    // Быстрое опросное окно, чтобы вытянуть ответы, если они не успели попасть в стейт
    let attempts = 0;
    const maxAttempts = 10;
    const poll = async () => {
      const currentIndex = round3QuestionIndexRef.current;
      if (currentIndex === null) return;
      await loadRound3Answers(currentIndex);
      attempts += 1;
      if (attempts >= maxAttempts || round3Answers.length > 0) {
        clearInterval(pollerId);
      }
    };

    void syncServerTime();
    poll();
    const pollerId = setInterval(poll, 800);
    return () => clearInterval(pollerId);
  }, [roomStatus, round3VoteStartedAt, loadRound3Answers, round3Answers.length, syncServerTime]);

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

  const submitRound2Answer = async (answerIsFact: boolean) => {
    setError('');
    if (roomStatus !== 'round2-running' || round2Phase !== 'fact') {
      setError('Подождите новое утверждение от ведущего');
      return;
    }
    if (hasAnswered) {
      setError('Вы уже сделали выбор');
      return;
    }
    if (effectiveTimeLeft <= 0) {
      setError('Время истекло');
      return;
    }
    if (!playerId || !roomId || round2CurrentIndex === null) {
      setError('Игра ещё загружается, попробуйте секунду спустя');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: existingAnswer } = await supabase
        .from('round2_answers')
        .select('answer_is_fact, is_correct')
        .eq('player_id', playerId)
        .eq('room_id', roomId)
        .eq('item_index', round2CurrentIndex)
        .single();

      if (existingAnswer) {
        setHasAnswered(true);
        setRound2AnsweredChoice(existingAnswer.answer_is_fact);
        setRound2AnsweredCorrect(existingAnswer.is_correct);
        setIsSubmitting(false);
        return;
      }

      const isCorrect = answerIsFact === round2ShowingFact;

      const { error: insertError } = await supabase
        .from('round2_answers')
        .insert({
          player_id: playerId,
          room_id: roomId,
          item_index: round2CurrentIndex,
          answer_is_fact: answerIsFact,
          is_correct: isCorrect,
          points_earned: isCorrect ? ROUND2_POINTS : 0,
        });

      if (insertError) {
        throw new Error('Не удалось отправить ответ');
      }

      if (isCorrect) {
        const { data: playerData } = await supabase
          .from('players')
          .select('total_points')
          .eq('id', playerId)
          .single();

        if (playerData) {
          await supabase
            .from('players')
            .update({ total_points: (playerData.total_points || 0) + ROUND2_POINTS })
            .eq('id', playerId);
        }
      }

      setHasAnswered(true);
      setRound2AnsweredChoice(answerIsFact);
      setRound2AnsweredCorrect(isCorrect);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRound3Answer = async () => {
    setRound3Error('');
    if (roomStatus !== 'round3-running') {
      setRound3Error('Ждём старт Раунда 3 от ведущего');
      return;
    }
    if (isRound3Submitting) {
      return;
    }
    if (!playerId || !roomId) {
      setRound3Error('Данные игрока ещё загружаются');
      return;
    }
    let questionIndex = round3QuestionIndex;
    if (questionIndex === null) {
      const { data } = await supabase
        .from('rooms')
        .select('round3_question_index')
        .eq('id', roomId)
        .single();

      const fetchedIndex = typeof data?.round3_question_index === 'number' ? data.round3_question_index : null;
      setRound3QuestionIndex(fetchedIndex);
      questionIndex = fetchedIndex;
      if (questionIndex === null) {
        setRound3Error('Новый вопрос ещё готовится');
        return;
      }
    }
    const normalized = round3AnswerDraft.trim().toUpperCase();
    if (!normalized) {
      setRound3Error('Введите слово без пробелов');
      return;
    }
    if (normalized.length < 2) {
      setRound3Error('Ответ должен быть длиннее одного символа');
      return;
    }

    setIsRound3Submitting(true);
    try {
      const payload = {
        room_id: roomId,
        player_id: playerId,
        question_index: questionIndex,
        answer: normalized,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from('round3_answers')
        .upsert(payload, { onConflict: 'room_id,player_id,question_index' });

      if (upsertError) {
        throw new Error('Не удалось отправить ответ Раунда 3');
      }

      setRound3SubmittedAnswer(normalized);
      await loadRound3Answers(questionIndex);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка при отправке Раунда 3';
      setRound3Error(message);
    } finally {
      setIsRound3Submitting(false);
    }
  };

  const submitRound3Vote = async (answerId: string) => {
    if (roomStatus !== 'round3-voting') {
      setRound3Error('Сейчас нельзя голосовать');
      return;
    }
    if (isRound3VoteSubmitting) {
      return;
    }
    if (!playerId || !roomId) {
      setRound3Error('Данные игрока ещё загружаются');
      return;
    }
    const currentIndex = round3QuestionIndexRef.current;
    if (currentIndex === null) {
      setRound3Error('Голосование ещё не готово');
      return;
    }
    const chosenAnswer = round3Answers.find((row) => row.id === answerId);
    if (!chosenAnswer) {
      setRound3Error('Ответ не найден');
      return;
    }
    if (chosenAnswer.player_id === playerId) {
      setRound3Error('Нельзя голосовать за свой ответ');
      return;
    }

    setIsRound3VoteSubmitting(true);
    setRound3Error('');
    try {
      const payload = {
        room_id: roomId,
        player_id: playerId,
        question_index: currentIndex,
        answer_id: answerId,
      };

      const { error: upsertError } = await supabase.from('round3_votes').upsert(payload, {
        onConflict: 'room_id,player_id,question_index',
      });

      if (upsertError) {
        throw upsertError;
      }

      setRound3VoteSelection(answerId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось отправить голос';
      setRound3Error(message);
    } finally {
      setIsRound3VoteSubmitting(false);
    }
  };

  const handleRound3AnswerChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    const sanitized = rawValue.replace(/[^0-9A-Za-zА-Яа-яЁё]/g, '').toUpperCase();
    setRound3AnswerDraft(sanitized.slice(0, 32));
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fef4dc] text-[#142a45] px-4">
        <div className="rounded-3xl border-[4px] border-[#142a45] bg-white px-6 py-4 text-xl font-black">
          Подключаемся к комнате…
        </div>
      </div>
    );
  }

  const progressPercent = Math.max(0, Math.min(100, (effectiveTimeLeft / QUESTION_DURATION_SECONDS) * 100));
  const timerLabel = allPlayersAnswered ? 'Все ответили' : `${effectiveTimeLeft} c`;
  const currentRound2Item = round2CurrentIndex !== null ? round2Items[round2CurrentIndex] : null;
  const round2Statement = currentRound2Item
    ? round2ShowingFact
      ? currentRound2Item.fact
      : currentRound2Item.fiction
    : 'Утверждение загружается…';
  const round2Explanation = currentRound2Item
    ? round2ShowingFact
      ? currentRound2Item.explanation
      : currentRound2Item.fictionExplanation
    : '';
  const round2ChoiceLabel = round2AnsweredChoice === null ? '' : round2AnsweredChoice ? 'Правда' : 'Вымысел';
  const round3QuestionNumber = round3QuestionIndex !== null ? round3QuestionIndex + 1 : null;
  const round3CategoryLabel = round3QuestionMeta?.category ?? null;
  const round3InputProgress = Math.max(0, Math.min(100, (round3InputTimeLeft / QUESTION_DURATION_SECONDS) * 100));
  const isRound3InputClosed = round3InputTimeLeft <= 0;
  const round3VoteProgress = Math.max(0, Math.min(100, (round3VoteTimeLeft / ROUND3_VOTE_SECONDS) * 100));
  const isRound3VoteClosed = round3VoteTimeLeft <= 0;

  const isResultsStatus =
    roomStatus === 'waiting' || roomStatus === 'round2-ready' || roomStatus === 'round3-ready' || roomStatus === 'finished';
  const shouldShowResultsScreen = showResults && isResultsStatus;

  if (shouldShowResultsScreen) {
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

  if (error && !question) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fef4dc] text-[#142a45] px-4 py-10">
        <div className="rounded-3xl border-[4px] border-[#b23324] bg-white shadow-xl max-w-md w-full p-8 text-center space-y-4">
          <p className="retro-heading text-xs tracking-[0.4em] text-[#b23324]/70">Ошибка</p>
          <h1 className="text-2xl font-black text-[#b23324]">❌ Что-то пошло не так</h1>
          <p className="text-sm text-[#142a45]/80">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-2xl border-[3px] border-[#142a45] bg-[#ffe184] font-black"
          >
            На главную
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

        {roomStatus === 'waiting' && (
          <section className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-8 text-center space-y-4">
            <div className="text-5xl">⏳</div>
            <h2 className="text-3xl font-black">Ждём старт от ведущего</h2>
            <p className="text-sm text-[#142a45]/80">
              Вы подключены. Ведущий начнёт раунд, когда все игроки войдут. Ничего нажимать не нужно — просто ждите звукового сигнала.
            </p>
          </section>
        )}

        {roomStatus === 'round2-running' && (
          <section className="rounded-3xl border-[4px] border-[#b4007f] bg-white shadow-xl p-6 space-y-6">
            <div className="flex flex-col gap-2 text-center">
              <span className="mx-auto px-4 py-2 rounded-full border-[3px] border-[#b4007f] text-sm font-black">
                Раунд 2 · «Фейколов»
              </span>
              <h2 className="text-3xl font-black leading-tight">{round2Statement}</h2>
            </div>

            {round2Phase === 'fact' && (
              <div>
                <div className="flex justify-between text-xs text-[#142a45]/70 mb-1">
                  <span>Осталось времени</span>
                  <span className={`font-black ${allPlayersAnswered ? 'text-[#b4007f]' : 'text-[#142a45]'}`}>
                    {allPlayersAnswered ? 'Все проголосовали' : `${effectiveTimeLeft} c`}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-[#ffe0f4] overflow-hidden">
                  <div
                    className={`h-full ${effectiveTimeLeft > 5 ? 'bg-[#b4007f]' : 'bg-[#f1532f]'}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {allPlayersAnswered && (
                  <p className="text-xs text-[#b4007f] font-semibold mt-2">Ждём, пока ведущий откроет ответ.</p>
                )}
              </div>
            )}

            {round2Phase === 'fact' ? (
              hasAnswered ? (
                <div className="rounded-3xl border-[3px] border-[#b4007f]/40 bg-[#fff0fa] p-6 text-center space-y-2">
                  <div className="text-5xl">✅</div>
                  <h3 className="text-2xl font-black text-[#b4007f]">Выбор сохранён</h3>
                  {round2ChoiceLabel && (
                    <p className="text-sm text-[#142a45]/70">Вы поставили на «{round2ChoiceLabel}»</p>
                  )}
                  <p className="text-xs text-[#142a45]/60">Не закрывайте вкладку — скоро расчехлим объяснение.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/60">Выберите вариант</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={() => submitRound2Answer(true)}
                      disabled={isSubmitting || effectiveTimeLeft <= 0}
                      className="w-full rounded-2xl border-[3px] border-[#142a45] px-4 py-4 text-center font-semibold bg-white hover:bg-[#fff6da] transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      👍 Это правда
                    </button>
                    <button
                      onClick={() => submitRound2Answer(false)}
                      disabled={isSubmitting || effectiveTimeLeft <= 0}
                      className="w-full rounded-2xl border-[3px] border-[#142a45] px-4 py-4 text-center font-semibold bg-white hover:bg-[#fff6da] transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      🤔 Это выдумка
                    </button>
                  </div>
                  <div className="rounded-2xl border-[3px] border-dashed border-[#142a45]/40 bg-[#fff6da] px-4 py-3 text-sm flex items-center justify-between">
                    <span className="font-semibold">Награда</span>
                    <span className="font-black text-[#b4007f]">+{ROUND2_POINTS} баллов</span>
                  </div>
                </div>
              )
            ) : (
              <div className="rounded-3xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-6 space-y-3 text-center">
                <div className="text-5xl">📣</div>
                <h3 className="text-2xl font-black">Правильный ответ</h3>
                <p className={`text-sm font-semibold ${round2ShowingFact ? 'text-[#1f6ac6]' : 'text-[#b4007f]'}`}>
                  {round2ShowingFact ? 'Это действительно правда' : 'Это была выдумка'}
                </p>
                <p className="text-sm text-[#142a45]/80">{round2Explanation || 'Ведущий уже озвучил пояснение.'}</p>
                {round2AnsweredCorrect !== null && (
                  <p className={`text-sm font-semibold ${round2AnsweredCorrect ? 'text-[#1f6ac6]' : 'text-[#f1532f]'}`}>
                    {round2AnsweredCorrect ? `Поздравляем! +${ROUND2_POINTS} к счёту.` : 'На этот раз без очков, но впереди новые вопросы.'}
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
                {error}
              </div>
            )}

            {effectiveTimeLeft <= 0 && round2Phase === 'fact' && !hasAnswered && (
              <p className="text-xs text-center text-[#142a45]/60">⏱ Время истекло. Ответ засчитать не получится.</p>
            )}
          </section>
        )}

        {roomStatus === 'round3-running' && (
          <section className="rounded-3xl border-[4px] border-[#1f6ac6] bg-white shadow-xl p-6 space-y-6">
            <div className="flex flex-col gap-2 text-center">
              <span className="mx-auto px-4 py-2 rounded-full border-[3px] border-[#1f6ac6] text-sm font-black">
                Раунд 3 · «МозгоШтурм»
              </span>
              <h2 className="text-3xl font-black leading-tight">Введите слово с пропуском</h2>
              <p className="text-sm text-[#142a45]/80">
                Ведущий озвучивает факт с пропущенным словом. Напишите свою версию без пробелов, дефисов и знаков препинания — одно слово целиком.
              </p>
            </div>

            <div className="rounded-3xl border-[3px] border-[#1f6ac6]/20 bg-[#e9f0ff] p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#142a45]/60">
                <span>Факт {round3QuestionNumber ?? '—'}</span>
                {round3CategoryLabel ? (
                  <span className="font-semibold text-[#1f6ac6]">{round3CategoryLabel}</span>
                ) : (
                  <span className="text-[#142a45]/40">Категория появится позже</span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-[#142a45]/60">
                <span>Таймер · 30 сек</span>
                <span className={`font-black ${isRound3InputClosed ? 'text-[#f1532f]' : 'text-[#1f6ac6]'}`}>
                  {isRound3InputClosed ? 'Время истекло' : `${round3InputTimeLeft} c`}
                </span>
              </div>
              <div className="h-3 rounded-full bg-[#ffeccd] overflow-hidden">
                <div
                  className={`h-full ${round3InputTimeLeft > 5 ? 'bg-[#1f6ac6]' : 'bg-[#f1532f]'}`}
                  style={{ width: `${round3InputProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-[#142a45]/60">Голосование откроется автоматически после окончания таймера.</p>
              <p className="text-lg font-semibold text-[#142a45] leading-snug">
                {round3QuestionMeta?.text || 'Слушайте ведущего — текст вопроса прозвучит в эфире.'}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/60 uppercase">Ваш ответ</p>
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={round3AnswerDraft}
                onChange={handleRound3AnswerChange}
                maxLength={32}
                placeholder="Например: метеорит"
                className="w-full rounded-2xl border-[3px] border-[#142a45] px-4 py-4 text-2xl font-black tracking-[0.2em] text-center uppercase bg-[#fff6da] focus:outline-none focus:ring-4 focus:ring-[#1f6ac6]/30"
              />
              <div className="flex items-center justify-between text-xs text-[#142a45]/60">
                <span>Только буквы и цифры</span>
                <span className="font-semibold text-[#1f6ac6]">{round3AnswerDraft.length}/32</span>
              </div>
              <p className="text-xs text-[#142a45]/60">
                Отправьте слово, когда водитель объявит старт. Ответ можно переписать, пока идёт таймер.
              </p>
              <button
                type="button"
                onClick={submitRound3Answer}
                disabled={isRound3Submitting || !round3AnswerDraft || isRound3InputClosed}
                className="w-full rounded-2xl border-[3px] border-[#1f6ac6] bg-[#1f6ac6] text-white font-black tracking-[0.2em] py-3 text-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {round3SubmittedAnswer ? 'Обновить ответ' : 'Отправить ответ'}
              </button>
              {round3SubmittedAnswer && (
                <p className="text-xs font-semibold text-[#1f6ac6]">
                  Ваш ответ: {round3SubmittedAnswer}
                </p>
              )}
              {isRound3InputClosed && (
                <p className="text-xs font-semibold text-[#f1532f]">Время на ввод вышло. Ждём голосование.</p>
              )}
              {round3Error && (
                <p className="text-xs font-semibold text-[#b23324]">{round3Error}</p>
              )}
            </div>

            <div className="rounded-3xl border-[3px] border-dashed border-[#142a45]/25 bg-white p-5 space-y-2 text-center">
              <p className="retro-heading text-[11px] tracking-[0.4em] text-[#142a45]/60">
                Ответы появятся позже
              </p>
              <p className="text-sm text-[#142a45]/70">
                Мы скрываем идеи других игроков, пока идёт таймер. Они раскроются автоматически на этапе голосования.
              </p>
            </div>
          </section>
        )}

        {roomStatus === 'round3-voting' && (
          <section className="rounded-3xl border-[4px] border-[#1f6ac6] bg-white shadow-xl p-6 space-y-6">
            <div className="flex flex-col gap-2 text-center">
              <span className="mx-auto px-4 py-2 rounded-full border-[3px] border-[#1f6ac6] text-sm font-black">
                Голосование · Раунд 3
              </span>
              <h2 className="text-3xl font-black leading-tight">Выберите лучший вариант</h2>
              <p className="text-sm text-[#142a45]/80">
                Выберите понравившийся ответ другого игрока. Свой вариант голосовать нельзя. Голос можно поменять, пока идёт таймер.
              </p>
            </div>

            <div className="rounded-3xl border-[3px] border-[#1f6ac6]/20 bg-[#e9f0ff] p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#142a45]/60">
                <span>Осталось времени</span>
                <span className={`font-black ${isRound3VoteClosed ? 'text-[#f1532f]' : 'text-[#1f6ac6]'}`}>
                  {isRound3VoteClosed ? 'Время истекло' : `${round3VoteTimeLeft} c`}
                </span>
              </div>
              <div className="h-3 rounded-full bg-[#ffeccd] overflow-hidden">
                <div
                  className={`h-full ${round3VoteTimeLeft > 5 ? 'bg-[#1f6ac6]' : 'bg-[#f1532f]'}`}
                  style={{ width: `${round3VoteProgress}%` }}
                />
              </div>
              <p className="text-xs text-[#142a45]/60">После окончания таймера голоса фиксируются автоматически.</p>
            </div>

            <div className="rounded-3xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#142a45]/60">
                <span>Факт {round3QuestionIndex !== null ? round3QuestionIndex + 1 : '—'}</span>
                {round3QuestionMeta?.category ? (
                  <span className="font-semibold text-[#1f6ac6]">{round3QuestionMeta.category}</span>
                ) : (
                  <span className="text-[#142a45]/40">Категория появится позже</span>
                )}
              </div>
              <p className="text-sm font-semibold text-[#142a45] leading-snug">
                {round3QuestionMeta?.text || 'Ведущий уже озвучил этот факт — если не слышно, спросите повтор.'}
              </p>
            </div>

            <div className="rounded-3xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="retro-heading text-[11px] tracking-[0.4em] text-[#142a45]/70">
                  Ответы игроков
                </p>
                <span className="text-xs font-semibold text-[#1f6ac6]">{round3Answers.length}</span>
              </div>

              {round3Answers.filter((answer) => answer.player_id !== playerId).length === 0 ? (
                <p className="text-sm text-[#142a45]/70">
                  Ждём ответы других игроков. Как только появятся варианты, сможете проголосовать.
                </p>
              ) : (
                <div className="space-y-3">
                  {round3Answers
                    .filter((answer) => answer.player_id !== playerId)
                    .map((answer) => {
                      const isSelected = round3VoteSelection === answer.id;
                      return (
                        <button
                          key={answer.id}
                          type="button"
                          disabled={isRound3VoteSubmitting || isRound3VoteClosed}
                          onClick={() => submitRound3Vote(answer.id)}
                          className={`w-full text-left rounded-2xl border-[3px] px-4 py-3 transition font-semibold tracking-[0.1em] uppercase ${
                            isSelected
                              ? 'border-[#1f6ac6] bg-[#e9f0ff] text-[#1f6ac6]'
                              : 'border-[#142a45]/20 bg-white text-[#142a45]'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {answer.answer}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {round3Error && (
              <div className="rounded-2xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
                {round3Error}
              </div>
            )}

            {isRound3VoteClosed && (
              <p className="text-xs text-center text-[#142a45]/60">Время вышло. Ведущий покажет результаты голосования.</p>
            )}
          </section>
        )}

        {roomStatus === 'round3-reveal' && (
          <section className="rounded-3xl border-[4px] border-[#1f6ac6] bg-white shadow-xl p-6 space-y-6">
            <div className="flex flex-col gap-2 text-center">
              <span className="mx-auto px-4 py-2 rounded-full border-[3px] border-[#1f6ac6] text-sm font-black">
                Разбор · Раунд 3
              </span>
              <h2 className="text-3xl font-black leading-tight">Правильный ответ</h2>
              <p className="text-sm text-[#142a45]/80">Запомните правильный вариант и готовьтесь к следующему факту.</p>
            </div>

            <div className="rounded-3xl border-[3px] border-[#1f6ac6]/20 bg-[#e9f0ff] p-5 space-y-2 text-center">
              <p className="text-xs font-semibold text-[#142a45]/60 tracking-[0.3em] uppercase">Искомое слово</p>
              <p className="text-4xl font-black text-[#1f6ac6] tracking-[0.25em]">
                {round3QuestionMeta?.answer || 'Скоро будет озвучено'}
              </p>
              {round3QuestionMeta?.comment && (
                <p className="text-sm text-[#142a45]/75 max-w-2xl mx-auto">{round3QuestionMeta.comment}</p>
              )}
            </div>

            <Round3AnswersList
              answers={round3Answers}
              playerId={playerId}
              isSelfVisible
              roomStatus={roomStatus}
              title={round3QuestionNumber ? `Все ответы · Факт ${round3QuestionNumber}` : undefined}
            />
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
      </div>
    </div>
  );
}

function Round3AnswersList({ answers, playerId, isSelfVisible = true, roomStatus, title = 'Ответы игроков' }: Round3AnswersListProps) {
  const visibleAnswers = useMemo(() => {
    if (!isSelfVisible && playerId) {
      return answers.filter((answer) => answer.player_id !== playerId);
    }
    return answers;
  }, [answers, isSelfVisible, playerId]);

  const infoText =
    roomStatus === 'round3-running'
      ? 'Тут появятся варианты других участников сразу после отправки.'
      : roomStatus === 'round3-voting'
        ? 'Выберите понравившийся ответ. Свой ответ скрыт.'
        : 'Ждём, пока ведущий снова запустит Раунд 3.';

  return (
    <div className="rounded-3xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="retro-heading text-[11px] tracking-[0.4em] text-[#142a45]/60">{title}</p>
        <span className="text-xs font-semibold text-[#1f6ac6]">{visibleAnswers.length}</span>
      </div>
      {visibleAnswers.length === 0 ? (
        <p className="text-sm text-[#142a45]/70">{infoText}</p>
      ) : (
        <ol className="space-y-2">
          {visibleAnswers.map((answer) => (
            <li
              key={answer.id}
              className="rounded-2xl border-[3px] border-[#142a45]/15 bg-white px-4 py-3 flex items-center justify-between"
            >
              <span className="font-black text-[#142a45] tracking-[0.2em] text-lg">{answer.answer}</span>
              <span className="text-xs text-[#142a45]/50">#{answer.question_index + 1}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
