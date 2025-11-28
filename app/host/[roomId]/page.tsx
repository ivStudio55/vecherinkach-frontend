'use client';

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
const COUNTDOWN_STEPS = ['на старт', 'внимание', '3', '2', '1', 'старт'] as const;
const AUTO_NEXT_DELAY_MS = 6000;
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

const QUESTION_JINGLE_FILE = '30_sec.mp3';
const MEET_AUDIO_FILES = [
  'meet/meetText1.wav',
  'meet/meetText2.wav',
  'meet/meetText3.wav',
  'meet/meetText4.wav',
  'meet/meetText5.wav',
  'meet/meetText6.wav',
  'meet/meetText7.wav',
  'meet/meetText8.wav',
] as const;
const CONNECT_AUDIO_CLIPS: Record<number, readonly string[]> = (() => {
  const base: Record<number, readonly string[]> = {
    1: ['connect/1/one_connected.wav', 'connect/1/one_connected2.wav', 'connect/1/one_connected3.wav'],
  };

  for (let count = 2; count <= 10; count += 1) {
    base[count] = Array.from({ length: 3 }, (_, variant) => `connect/${count}/${count}_connected${variant + 1}.wav`);
  }

  return base;
})();
const RULES_ROUND1_FILES = [
  'ruels/round1/ruelsround(1)2.wav',
  'ruels/round1/ruelsround(1)3.wav',
] as const;
const SKIP_AUDIO_FILES = [
  'skip/skip.wav',
  'skip/skip2.wav',
  'skip/skip3.wav',
  'skip/skip4.wav',
  'skip/skip5.wav',
  'skip/skip6.wav',
  'skip/skip7.wav',
  'skip/skip8.wav',
] as const;
const BETWEEN_AUDIO_VARIANTS = {
  zero: ['between/0%/1.wav', 'between/0%/2.wav', 'between/0%/3.wav'],
  low: ['between/1-49%/1.wav', 'between/1-49%/2.wav', 'between/1-49%/3.wav', 'between/1-49%/4.wav'],
  mid: ['between/50-99%/1.wav', 'between/50-99%/2.wav', 'between/50-99%/3.wav', 'between/50-99%/4.wav'],
  full: ['between/100%/1.wav', 'between/100%/2.wav', 'between/100%/3.wav', 'between/100%/4.wav'],
} as const;
const ROUND1_END_AUDIO_FILES = [
  'round1end/1.wav',
  'round1end/2.wav',
  'round1end/3.wav',
  'round1end/4.wav',
  'round1end/5.wav',
  'round1end/6.wav',
  'round1end/7.wav',
  'round1end/8.wav',
  'round1end/9.wav',
] as const;
const ROUND1_END_JINGLE_FILE = 'round1_end/jingle_(after_round1).mp3';

const buildAudioUrl = (relativePath: string) => `/api/audio?file=${encodeURIComponent(relativePath)}&t=${Date.now()}`;
const buildJingleUrl = (fileName: string) => `/api/jingle/audio?file=${encodeURIComponent(fileName)}&t=${Date.now()}`;
const pickRandomItem = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

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

type AnswerSummaryRow = {
  player_id: string;
  is_correct: boolean | null;
};

export default function HostRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [roomCode, setRoomCode] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answerCount, setAnswerCount] = useState(0);
  const [correctAnswerCount, setCorrectAnswerCount] = useState(0);
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
  const [isPrestartVisible, setIsPrestartVisible] = useState(false);
  const [isRulesVisible, setIsRulesVisible] = useState(false);
  const [isCountdownVisible, setIsCountdownVisible] = useState(false);
  const [countdownValue, setCountdownValue] = useState<string>(COUNTDOWN_STEPS[0]);
  const [isRoomOpened, setIsRoomOpened] = useState(false);
  const [isPrestartNextEnabled, setIsPrestartNextEnabled] = useState(true);
  const [isPlayerLimitReached, setIsPlayerLimitReached] = useState(false);
  const [isRoundEndButtonLocked, setIsRoundEndButtonLocked] = useState(false);

  const meetAudioRef = useRef<HTMLAudioElement | null>(null);
  const connectAudioRef = useRef<HTMLAudioElement | null>(null);
  const rulesAudioRef = useRef<HTMLAudioElement | null>(null);
  const skipAudioRef = useRef<HTMLAudioElement | null>(null);
  const questionJingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const questionVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const betweenAudioRef = useRef<HTMLAudioElement | null>(null);
  const roundEndAudioRef = useRef<HTMLAudioElement | null>(null);
  const roundEndJingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasUserInteractedRef = useRef(false);
  const lastJoinAudioRef = useRef<HTMLAudioElement | null>(null);
  const previousPlayerIdsRef = useRef<Set<string>>(new Set());
  const hasSnapshotRef = useRef(false);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prestartEnableTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundEndUnlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundEndDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rulesAudioCompletedRef = useRef(true);
  const isLobbySoundOnRef = useRef(isLobbySoundOn);
  const countdownReadyAtRef = useRef<number | null>(null);
  const lastSpokenQuestionRef = useRef<number | null>(null);
  const betweenCueQuestionRef = useRef<number | null>(null);
  const roundEndLockQuestionRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const autoNextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCountdownTimeout = useCallback(() => {
    if (countdownTimeoutRef.current) {
      clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
  }, []);

  const clearPrestartEnableTimeout = useCallback(() => {
    if (prestartEnableTimeoutRef.current) {
      clearTimeout(prestartEnableTimeoutRef.current);
      prestartEnableTimeoutRef.current = null;
    }
  }, []);

  const clearRoundEndUnlockTimeout = useCallback(() => {
    if (roundEndUnlockTimeoutRef.current) {
      clearTimeout(roundEndUnlockTimeoutRef.current);
      roundEndUnlockTimeoutRef.current = null;
    }
  }, []);
  
  const clearRoundEndDelayTimeout = useCallback(() => {
    if (roundEndDelayTimeoutRef.current) {
      clearTimeout(roundEndDelayTimeoutRef.current);
      roundEndDelayTimeoutRef.current = null;
    }
  }, []);

  const clearAutoNextTimeout = useCallback(() => {
    if (autoNextTimeoutRef.current) {
      clearTimeout(autoNextTimeoutRef.current);
      autoNextTimeoutRef.current = null;
    }
  }, []);

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

  const getServerIsoTimestamp = useCallback(async () => {
    const offset = await syncServerTime();
    const serverNow = new Date(Date.now() - offset).toISOString();
    return { iso: serverNow, offset };
  }, [syncServerTime]);

  const updateRoomStatus = useCallback(
    (nextStatus: RoomStatus) => {
      setRoomStatus(nextStatus);
      if (nextStatus !== 'waiting') {
        setIsPrestartVisible(false);
        setIsRulesVisible(false);
        setIsCountdownVisible(false);
        clearCountdownTimeout();
        countdownReadyAtRef.current = null;
      }
    },
    [clearCountdownTimeout]
  );

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

    if (playersError) {
      setIsPlayerLimitReached(false);
      return;
    }

    const list = data || [];
    const limited = list.slice(0, 10);
    setPlayers(limited);
    setIsPlayerLimitReached(list.length > 10);
  }, [roomId]);

  const loadAnswerCount = useCallback(
    async (questionIndex: number) => {
      const { data, count, error: answersError } = await supabase
        .from('answers')
        .select('player_id, is_correct', { count: 'exact' })
        .eq('room_id', roomId)
        .eq('question_index', questionIndex);

      if (answersError) {
        setAnsweredPlayerIds([]);
        setCorrectAnswerCount(0);
        return;
      }
      setAnswerCount(count || 0);
      const rows = (data || []) as AnswerSummaryRow[];
      const answeredIds = Array.from(new Set(rows.map((answer) => answer.player_id)));
      const correctIds = new Set<string>();
      for (const answer of rows) {
        if (answer.is_correct) {
          correctIds.add(answer.player_id);
        }
      }
      setCorrectAnswerCount(correctIds.size);
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
        updateRoomStatus(detectedStatus);
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
      updateRoomStatus,
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
    isLobbySoundOnRef.current = isLobbySoundOn;
  }, [isLobbySoundOn]);

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

  const stopLobby = useCallback(() => {
    const audio = meetAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      meetAudioRef.current = null;
    }
    setIsLobbySoundOn(false);
    isLobbySoundOnRef.current = false;
  }, []);

  const playWelcomeSpeech = useCallback(async () => {
    const file = pickRandomItem(MEET_AUDIO_FILES);
    const audio = new Audio(buildAudioUrl(file));
    audio.volume = 0.9;
    try {
      await audio.play();
    } catch (err) {
      console.error('Не удалось проиграть приветственную речь', err);
    }
  }, []);

  const playLobbyJingle = useCallback(async () => {
    const previous = meetAudioRef.current;
    if (previous) {
      previous.pause();
      previous.onended = null;
    }

    const nextAudio = new Audio('/audio/jingle-lobby.mp3');
    nextAudio.loop = true;
    nextAudio.volume = 0.3;
    meetAudioRef.current = nextAudio;

    isLobbySoundOnRef.current = true;
    await nextAudio.play();
    setIsLobbySoundOn(true);
  }, [setIsLobbySoundOn]);

  const tryPlayLobby = useCallback(async () => {
    if (!hasUserInteractedRef.current) {
      setAudioError('Нужен клик пользователя, чтобы запустить аудио');
      return;
    }
    setAudioError('');
    try {
      await playWelcomeSpeech();
      await playLobbyJingle();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось включить звук ожидания';
      setAudioError(message);
      setIsLobbySoundOn(false);
    }
  }, [playWelcomeSpeech, playLobbyJingle]);

  const playJoinSound = useCallback(async () => {
    if (!hasUserInteractedRef.current || !isJoinSoundEnabled) {
      return;
    }
    const fileName = JOIN_SOUND_FILES[Math.floor(Math.random() * JOIN_SOUND_FILES.length)];
    const audio = new Audio(buildJingleUrl(fileName));
    audio.volume = 0.9;
    lastJoinAudioRef.current = audio;
    try {
      await audio.play();
    } catch (err) {
      console.error('Не удалось проиграть звук подключения', err);
    }
  }, [isJoinSoundEnabled]);

  const stopConnectAudio = useCallback(() => {
    const audio = connectAudioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    connectAudioRef.current = null;
  }, []);

  const playConnectAudio = useCallback(
    async (connectedPlayers: number) => {
      if (!hasUserInteractedRef.current || connectedPlayers <= 0) {
        return;
      }

        const cappedCount = Math.max(1, Math.min(connectedPlayers, 10));
        const variants = CONNECT_AUDIO_CLIPS[cappedCount];
      if (!variants || !variants.length) {
        return;
      }

      stopConnectAudio();
      const file = pickRandomItem(variants);
      const audio = new Audio(buildAudioUrl(file));
      audio.volume = 0.9;
      connectAudioRef.current = audio;

      try {
        await audio.play();
      } catch (error) {
        console.error('Не удалось проиграть озвучку подключений', error);
      }
    },
    [stopConnectAudio]
  );

  const stopRulesAudio = useCallback(() => {
    const audio = rulesAudioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    rulesAudioRef.current = null;
    rulesAudioCompletedRef.current = true;
  }, []);

  const playRulesAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopRulesAudio();
    rulesAudioCompletedRef.current = false;
    const file = pickRandomItem(RULES_ROUND1_FILES);
    const audio = new Audio(buildAudioUrl(file));
    audio.volume = 0.95;
    rulesAudioRef.current = audio;

    audio.onended = () => {
      rulesAudioCompletedRef.current = true;
    };

    audio.play().catch((error) => {
      rulesAudioCompletedRef.current = true;
      console.error('Не удалось проиграть правила раунда', error);
    });
  }, [stopRulesAudio]);

  const stopSkipAudio = useCallback(() => {
    const audio = skipAudioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    skipAudioRef.current = null;
  }, []);

  const playSkipAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopSkipAudio();
    const file = pickRandomItem(SKIP_AUDIO_FILES);
    const audio = new Audio(buildAudioUrl(file));
    audio.volume = 0.95;
    skipAudioRef.current = audio;
    audio.play().catch((error) => {
      console.error('Не удалось проиграть skip-озвучку', error);
    });
  }, [stopSkipAudio]);

  const stopBetweenAudio = useCallback(() => {
    const audio = betweenAudioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    betweenAudioRef.current = null;
  }, []);

  const playBetweenAudioForPercent = useCallback(
    async (percent: number) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      const normalized = Math.max(0, Math.min(100, Math.round(percent)));
      const variants =
        normalized === 100
          ? BETWEEN_AUDIO_VARIANTS.full
          : normalized >= 50
            ? BETWEEN_AUDIO_VARIANTS.mid
            : normalized >= 1
              ? BETWEEN_AUDIO_VARIANTS.low
              : BETWEEN_AUDIO_VARIANTS.zero;

      if (!variants.length) {
        return;
      }

      stopBetweenAudio();
      const file = pickRandomItem(variants);
      const audio = new Audio(buildAudioUrl(file));
      audio.volume = 0.95;
      betweenAudioRef.current = audio;

      try {
        await audio.play();
      } catch (error) {
        console.error('Не удалось проиграть озвучку между вопросами', error);
      }
    },
    [stopBetweenAudio]
  );

  const stopRoundEndAudio = useCallback(() => {
    const mainCue = roundEndAudioRef.current;
    if (mainCue) {
      mainCue.pause();
      mainCue.currentTime = 0;
      mainCue.onended = null;
      roundEndAudioRef.current = null;
    }

    const jingleCue = roundEndJingleAudioRef.current;
    if (jingleCue) {
      jingleCue.pause();
      jingleCue.currentTime = 0;
      jingleCue.onended = null;
      roundEndJingleAudioRef.current = null;
    }
  }, []);

  const playRoundEndAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopRoundEndAudio();
    const file = pickRandomItem(ROUND1_END_AUDIO_FILES);
    const audio = new Audio(buildAudioUrl(file));
    audio.volume = 0.95;
    roundEndAudioRef.current = audio;

    const jingle = new Audio(buildAudioUrl(ROUND1_END_JINGLE_FILE));
    jingle.volume = 0.95;
    roundEndJingleAudioRef.current = jingle;

    audio.play().catch((error) => {
      console.error('Не удалось проиграть финальный сигнал раунда', error);
    });
    jingle.play().catch((error) => {
      console.error('Не удалось проиграть джингл завершения раунда', error);
    });
  }, [stopRoundEndAudio]);

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

  useEffect(() => {
    stopBetweenAudio();
    betweenCueQuestionRef.current = null;
  }, [question?.id, stopBetweenAudio]);

  useEffect(() => {
    stopRoundEndAudio();
    clearRoundEndUnlockTimeout();
      clearRoundEndDelayTimeout();
    roundEndLockQuestionRef.current = null;
    setIsRoundEndButtonLocked(false);
  }, [question?.id, stopRoundEndAudio, clearRoundEndUnlockTimeout]);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === 'undefined') {
      return null;
    }

    let context = audioContextRef.current;
    const AudioContextCtor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!context) {
      if (!AudioContextCtor) {
        return null;
      }
      context = new AudioContextCtor();
      audioContextRef.current = context;
    }

    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch (error) {
        console.error('Не удалось активировать аудиоконтекст', error);
        return null;
      }
    }

    return context;
  }, []);

  const playBeep = useCallback(
    async (frequency = 880) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      const context = await ensureAudioContext();
      if (!context) {
        return;
      }

      const duration = 0.12;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);

      gain.gain.setValueAtTime(0.15, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + duration);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start();
      oscillator.stop(context.currentTime + duration);

      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    },
    [ensureAudioContext]
  );

  const stopQuestionAudio = useCallback(() => {
    const jingle = questionJingleAudioRef.current;
    if (jingle) {
      jingle.pause();
      jingle.currentTime = 0;
      questionJingleAudioRef.current = null;
    }

    const voice = questionVoiceAudioRef.current;
    if (voice) {
      voice.pause();
      voice.currentTime = 0;
      questionVoiceAudioRef.current = null;
    }
  }, []);

  const playQuestionAudio = useCallback(
    async (questionId: number) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      stopQuestionAudio();

      const jingle = new Audio(buildJingleUrl(QUESTION_JINGLE_FILE));
      jingle.loop = false;
      jingle.volume = 0.45;
      questionJingleAudioRef.current = jingle;

      const voice = new Audio(buildAudioUrl(`questions/${questionId}.wav`));
      voice.loop = false;
      voice.volume = 0.95;
      questionVoiceAudioRef.current = voice;

      try {
        await jingle.play();
      } catch (error) {
        console.error('Не удалось запустить 30-секундный джингл', error);
      }

      voice.play().catch((error) => {
        console.error(`Не удалось озвучить вопрос с идентификатором ${questionId}`, error);
      });
    },
    [stopQuestionAudio]
  );

  useEffect(() => {
    if (roomStatus !== 'running') {
      lastSpokenQuestionRef.current = null;
      return;
    }

    if (!question) {
      return;
    }

    const questionId = typeof question.id === 'number' ? question.id : null;
    if (!questionId) {
      return;
    }

    if (lastSpokenQuestionRef.current === questionId) {
      return;
    }

    lastSpokenQuestionRef.current = questionId;
    void playQuestionAudio(questionId);
  }, [question, roomStatus, playQuestionAudio]);

  useEffect(() => {
    return () => {
      stopQuestionAudio();
      stopLobby();
      stopConnectAudio();
      stopRulesAudio();
      stopSkipAudio();
      stopBetweenAudio();
      stopRoundEndAudio();
      clearCountdownTimeout();
      clearPrestartEnableTimeout();
      clearRoundEndUnlockTimeout();
      clearRoundEndDelayTimeout();
      clearAutoNextTimeout();
      const context = audioContextRef.current;
      if (context && context.state !== 'closed') {
        context.close().catch(() => undefined);
      }
      audioContextRef.current = null;
    };
  }, [
    stopQuestionAudio,
    stopLobby,
    stopConnectAudio,
    stopRulesAudio,
    stopSkipAudio,
    stopBetweenAudio,
    stopRoundEndAudio,
    clearCountdownTimeout,
    clearPrestartEnableTimeout,
    clearRoundEndUnlockTimeout,
    clearRoundEndDelayTimeout,
    clearAutoNextTimeout,
  ]);

  const handleHostInteraction = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      hasUserInteractedRef.current = true;
      setIsRoomOpened(true);
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
    if (roomStatus !== 'running') {
      stopQuestionAudio();
    }
  }, [roomStatus, stopQuestionAudio]);

  useEffect(() => {
    if (roomStatus === 'running' && (serverAllPlayersAnswered || everyoneAnswered)) {
      stopQuestionAudio();
    }
  }, [roomStatus, serverAllPlayersAnswered, everyoneAnswered, stopQuestionAudio]);

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

  useEffect(() => {
    if (roomStatus !== 'waiting') {
      stopLobby();
      stopRulesAudio();
      stopConnectAudio();
    }
  }, [roomStatus, stopLobby, stopRulesAudio, stopConnectAudio]);

  useEffect(() => {
    if (roomStatus !== 'running') {
      stopBetweenAudio();
      stopRoundEndAudio();
      clearRoundEndUnlockTimeout();
      clearRoundEndDelayTimeout();
      roundEndLockQuestionRef.current = null;
      setIsRoundEndButtonLocked(false);
    }
  }, [roomStatus, stopBetweenAudio, stopRoundEndAudio, clearRoundEndUnlockTimeout, clearRoundEndDelayTimeout]);

  useEffect(() => {
    const shouldPlayRulesAudio = roomStatus === 'waiting' && !showResults && isRulesVisible;
    if (shouldPlayRulesAudio) {
      playRulesAudio();
    } else if (!isPrestartVisible) {
      stopRulesAudio();
    }
  }, [roomStatus, showResults, isRulesVisible, isPrestartVisible, playRulesAudio, stopRulesAudio]);


  const finishRound = async () => {
    if (isSummaryLoading) return;
    setIsSummaryLoading(true);
    stopQuestionAudio();
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
    updateRoomStatus('finished');
    setShowResults(true);
    setAnsweredPlayerIds([]);
    setIsSummaryLoading(false);
  };

  const startRound = async () => {
    if (!hasEnoughQuestions(ROUND_QUESTION_COUNT)) {
      setError('Недостаточно вопросов для начала игры. Пополните список раунда.');
      return;
    }

    stopQuestionAudio();
    stopLobby();
    stopSkipAudio();

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

    updateRoomStatus('running');
    setShowResults(false);
    setServerAllPlayersAnswered(false);
    setSelectedQuestionIds(questionIds);
    syncTimerWithStart(startedAt, offset);
    setAnswerCount(0);
    setCorrectAnswerCount(0);
    setAnsweredPlayerIds([]);
    loadQuestionFromSelection(0, questionIds);
    await loadAnswerCount(0);
  };

  const nextQuestion = useCallback(async () => {
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
    setCorrectAnswerCount(0);
    setAnsweredPlayerIds([]);
    loadQuestionFromSelection(newIndex);
    await loadAnswerCount(newIndex);
  }, [currentQuestionIndex, getServerIsoTimestamp, roomId, syncTimerWithStart, loadQuestionFromSelection, loadAnswerCount]);

  const runCountdownSequence = (stepIndex: number) => {
    const clampedIndex = Math.min(stepIndex, COUNTDOWN_STEPS.length - 1);
    const value = COUNTDOWN_STEPS[clampedIndex];
    const isFinal = clampedIndex === COUNTDOWN_STEPS.length - 1;
    setCountdownValue(value);
    void playBeep(isFinal ? 1200 : 880);
    if (!isFinal) {
      countdownTimeoutRef.current = setTimeout(() => runCountdownSequence(clampedIndex + 1), 1000);
      return;
    }

    countdownTimeoutRef.current = setTimeout(() => {
      setIsCountdownVisible(false);
      void startRound();
    }, 400);
  };

  const handleCountdownStart = () => {
    if (roomStatus !== 'waiting' || players.length === 0 || isCountdownVisible) {
      return;
    }
    stopLobby();
    stopRulesAudio();
    stopConnectAudio();
    const readyAt = countdownReadyAtRef.current;
    if (!readyAt || Date.now() - readyAt <= 18000) {
      // Skip cue should only fire when the host launches within the early 18-second window.
      playSkipAudio();
    }
    countdownReadyAtRef.current = null;
    hasUserInteractedRef.current = true;
    setIsRulesVisible(false);
    setIsCountdownVisible(true);
    clearCountdownTimeout();
    runCountdownSequence(0);
  };

  const handlePrepareRound = () => {
    if (roomStatus !== 'waiting' || players.length === 0) {
      return;
    }
    hasUserInteractedRef.current = true;
    stopLobby();
    void playConnectAudio(players.length);
    setIsPrestartVisible(true);
    setIsRulesVisible(false);
    setIsPrestartNextEnabled(false);
    clearPrestartEnableTimeout();
    countdownReadyAtRef.current = null;
    prestartEnableTimeoutRef.current = setTimeout(() => {
      setIsPrestartNextEnabled(true);
      prestartEnableTimeoutRef.current = null;
    }, 5000);
  };

  const handlePrestartCancel = () => {
    setIsPrestartVisible(false);
    stopConnectAudio();
    clearPrestartEnableTimeout();
    setIsPrestartNextEnabled(true);
    countdownReadyAtRef.current = null;
  };

  const handlePrestartNext = () => {
    if (!isPrestartNextEnabled) {
      return;
    }
    setIsPrestartVisible(false);
    stopConnectAudio();
    clearPrestartEnableTimeout();
    setIsPrestartNextEnabled(true);
    setIsRulesVisible(true);
    playRulesAudio();
    countdownReadyAtRef.current = Date.now();
  };

  const handleRulesCancel = () => {
    setIsRulesVisible(false);
    countdownReadyAtRef.current = null;
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

  const effectiveTimeLeft = shouldForceZero ? 0 : timeLeft;
  const answeredCount = answerCount;
  const totalPlayers = players.length;
  const correctAnswerPercentage = totalPlayers > 0 ? (correctAnswerCount / totalPlayers) * 100 : 0;
  const totalQuestions = selectedQuestionIds.length || ROUND_QUESTION_COUNT;
  const allPlayersAnswered = serverAllPlayersAnswered || (totalPlayers > 0 && answeredCount >= totalPlayers);
  const isLastQuestion = totalQuestions > 0 ? currentQuestionIndex >= totalQuestions - 1 : false;
  const canAdvance = roomStatus === 'running' && (effectiveTimeLeft === 0 || allPlayersAnswered);
  const nextButtonDisabled = !canAdvance || (isLastQuestion && (isSummaryLoading || isRoundEndButtonLocked));
  const progressPercent = Math.max(0, Math.min(100, (effectiveTimeLeft / QUESTION_DURATION_SECONDS) * 100));
  const questionsForSummary = summaryQuestions.length ? summaryQuestions : question ? [question] : [];
  const isWaiting = roomStatus === 'waiting' && !showResults;
  const shouldShowRulesModal = isWaiting && isRulesVisible;
  const shouldShowCountdownOverlay = isWaiting && isCountdownVisible;

  useEffect(() => {
    if (!question || roomStatus !== 'running' || !canAdvance || totalPlayers === 0) {
      return;
    }

    const questionKey = typeof question.id === 'number' ? question.id : question.order;
    if (betweenCueQuestionRef.current === questionKey) {
      return;
    }

    betweenCueQuestionRef.current = questionKey;
    void playBetweenAudioForPercent(correctAnswerPercentage);
  }, [question, roomStatus, canAdvance, totalPlayers, correctAnswerPercentage, playBetweenAudioForPercent]);

  useEffect(() => {
    if (!question || roomStatus !== 'running' || !isLastQuestion || !canAdvance) {
      return;
    }

    const questionKey = typeof question.id === 'number' ? question.id : question.order;
    if (roundEndLockQuestionRef.current === questionKey) {
      return;
    }

    roundEndLockQuestionRef.current = questionKey;
    setIsRoundEndButtonLocked(true);
    void playBetweenAudioForPercent(correctAnswerPercentage);
    clearRoundEndDelayTimeout();
    clearRoundEndUnlockTimeout();
    roundEndDelayTimeoutRef.current = setTimeout(() => {
      playRoundEndAudio();
      roundEndUnlockTimeoutRef.current = setTimeout(() => {
        setIsRoundEndButtonLocked(false);
        roundEndUnlockTimeoutRef.current = null;
      }, 5000);
    }, 7000);
  }, [
    question,
    roomStatus,
    isLastQuestion,
    canAdvance,
    playRoundEndAudio,
    clearRoundEndUnlockTimeout,
    playBetweenAudioForPercent,
    correctAnswerPercentage,
    clearRoundEndDelayTimeout,
  ]);

  useEffect(() => {
    if (roomStatus !== 'running' || showResults) {
      clearAutoNextTimeout();
      return;
    }

    if (!canAdvance || isLastQuestion) {
      clearAutoNextTimeout();
      return;
    }

    if (autoNextTimeoutRef.current) {
      return;
    }

    autoNextTimeoutRef.current = setTimeout(() => {
      autoNextTimeoutRef.current = null;
      void nextQuestion();
    }, AUTO_NEXT_DELAY_MS);

    return () => {
      clearAutoNextTimeout();
    };
  }, [roomStatus, showResults, canAdvance, isLastQuestion, nextQuestion, clearAutoNextTimeout]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fef4dc] text-[#142a45]">
        <div className="rounded-3xl border-[4px] border-[#142a45] bg-white px-6 py-4 text-xl font-black">
          Загрузка панели ведущего…
        </div>
      </div>
    );
  }

  if (!isRoomOpened) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fef4dc] text-[#142a45]">
        <button
          onClick={handleHostInteraction}
          className="px-8 py-4 rounded-3xl border-[4px] border-[#142a45] bg-[#ffe184] text-[#142a45] font-black text-2xl tracking-[0.2em] hover:bg-[#142a45] hover:text-[#ffeccd] transition-colors"
        >
          ОТКРЫТЬ КОМНАТУ
        </button>
      </div>
    );
  }

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
    <Fragment>
      <div className="min-h-screen bg-[#fef4dc] text-[#142a45] px-4 py-8 transition-opacity duration-1000 opacity-100">
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
                  onClick={handlePrepareRound}
                  disabled={players.length === 0}
                  className="w-full py-4 rounded-2xl font-black text-xl tracking-[0.2em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Начать игру →
                </button>
                {players.length === 0 ? (
                  <p className="text-xs text-[#142a45]/60">Нужно как минимум 1 игрок.</p>
                ) : (
                  <p className="text-xs text-[#142a45]/60">После клика появится окно с правилами и обратный отсчёт.</p>
                )}
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
                  disabled={nextButtonDisabled}
                  className="w-full py-4 rounded-2xl font-black text-xl tracking-[0.2em] bg-[#1f6ac6] text-white border-[3px] border-[#142a45] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLastQuestion ? 'Следующий раунд' : 'Следующий вопрос'}
                </button>

                <p className="text-xs text-[#142a45]/70">
                  {isRoundEndButtonLocked
                    ? 'Подождите несколько секунд — звучит финальный джингл перед стартом следующего раунда.'
                    : canAdvance
                      ? isLastQuestion
                        ? allPlayersAnswered
                          ? 'Все ответили — готовимся перейти к следующему раунду.'
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

      {isWaiting && isPrestartVisible && (
        <div className="fixed inset-0 z-40 bg-[#142a45]/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="max-w-lg w-full rounded-3xl border-[4px] border-[#142a45] bg-[#fff6da] p-6 space-y-4 shadow-2xl">
            <div>
              <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Подключённые игроки</p>
              <h3 className="text-2xl font-black text-[#142a45]">Перед стартом игры</h3>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {players.length === 0 ? (
                <p className="text-sm text-[#142a45]/60">Игроки ещё не подключились.</p>
              ) : (
                players.map((player, index) => (
                  <div key={player.id} className="flex items-center justify-between rounded-2xl border-[3px] border-[#142a45]/15 bg-white px-3 py-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full border-[3px] border-[#142a45]/30 flex items-center justify-center font-black">
                        {index + 1}
                      </span>
                      <span className="font-semibold text-[#142a45]">{player.name}</span>
                    </div>
                    <span className="text-xs text-[#142a45]/60">{player.total_points} 💎</span>
                  </div>
                ))
              )}
            </div>
            {isPlayerLimitReached && (
              <p className="text-xs font-semibold text-[#b23324]">Предел — 10 игроков. Лишние участники не смогут войти.</p>
            )}
            <p className="text-xs text-[#142a45]/70">Убедитесь, что все готовы. После продолжения прозвучат правила раунда.</p>
            <div className="flex gap-3 flex-col sm:flex-row">
              <button
                type="button"
                onClick={handlePrestartNext}
                disabled={!isPrestartNextEnabled}
                className="flex-1 py-3 rounded-2xl font-black text-lg tracking-[0.25em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Далее →
              </button>
              <button
                type="button"
                onClick={handlePrestartCancel}
                className="flex-1 py-3 rounded-2xl border-[3px] border-dashed border-[#142a45] bg-white font-semibold text-[#142a45]"
              >
                Отмена
              </button>
            </div>
            {!isPrestartNextEnabled && (
              <p className="text-xs text-[#142a45]/60">Кнопка активируется через несколько секунд после сигнала подключения.</p>
            )}
          </div>
        </div>
      )}

      {shouldShowRulesModal && (
        <div className="fixed inset-0 z-40 bg-[#142a45]/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="max-w-md w-full rounded-3xl border-[4px] border-[#142a45] bg-[#fff6da] p-6 space-y-4 shadow-2xl">
            <div>
              <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Правила раунда</p>
              <h3 className="text-2xl font-black text-[#142a45]">Перед стартом</h3>
            </div>
            <ul className="text-sm text-[#142a45]/80 space-y-2">
              <li>• 30 секунд на ответ — мелодия звучит столько же.</li>
              <li>• Ответы блокируются после сигнала или досрочного завершения.</li>
              <li>• Объявляйте очки только после авто-подсчёта.</li>
            </ul>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleCountdownStart}
                className="w-full py-3 rounded-2xl font-black text-lg tracking-[0.3em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45]"
              >
                Старт
              </button>
              <button
                type="button"
                onClick={handleRulesCancel}
                className="w-full py-3 rounded-2xl border-[3px] border-dashed border-[#142a45] bg-white font-semibold text-[#142a45]"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {shouldShowCountdownOverlay && (
        <div className="fixed inset-0 z-50 bg-[#142a45]/90 flex flex-col items-center justify-center text-center text-[#ffeccd] px-4">
          <p className="text-sm uppercase tracking-[0.5em] text-[#ffeccd]/70 mb-4">Запуск раунда</p>
          <div className="text-7xl sm:text-8xl font-black drop-shadow-lg">
            {countdownValue.toUpperCase()}
          </div>
          <p className="mt-6 text-sm text-[#ffeccd]/80">Звук уже пошёл — готовим вопросы на экране игроков.</p>
        </div>
      )}
    </Fragment>
  );
}
