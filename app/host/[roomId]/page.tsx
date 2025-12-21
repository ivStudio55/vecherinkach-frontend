'use client';

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { TrueFalseItem, ROUND2_POINTS } from '@/lib/round2';
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
  'meet/meetText1.mp3',
  'meet/meetText2.mp3',
  'meet/meetText3.mp3',
  'meet/meetText4.mp3',
  'meet/meetText5.mp3',
  'meet/meetText6.mp3',
  'meet/meetText7.mp3',
  'meet/meetText8.mp3',
] as const;
const CONNECT_AUDIO_CLIPS: Record<number, readonly string[]> = (() => {
  const base: Record<number, readonly string[]> = {
    1: ['connect/1/one_connected.mp3', 'connect/1/one_connected2.mp3', 'connect/1/one_connected3.mp3'],
  };

  for (let count = 2; count <= 10; count += 1) {
    base[count] = Array.from({ length: 3 }, (_, variant) => `connect/${count}/${count}_connected${variant + 1}.mp3`);
  }

  return base;
})();
const RULES_ROUND1_FILES = [
  'ruels/round1/ruelsround(1)2.mp3',
  'ruels/round1/ruelsround(1)3.mp3',
] as const;
const SKIP_AUDIO_FILES = [
  'skip/skip.mp3',
  'skip/skip2.mp3',
  'skip/skip4.mp3',
  'skip/skip5.mp3',
  'skip/skip6.mp3',
  'skip/skip7.mp3',
  'skip/skip8.mp3',
] as const;
const BETWEEN_AUDIO_VARIANTS = {
  zero: ['between/0%/1.mp3', 'between/0%/2.mp3', 'between/0%/3.mp3'],
  low: ['between/1-49%/1.mp3', 'between/1-49%/2.mp3', 'between/1-49%/3.mp3', 'between/1-49%/4.mp3'],
  mid: ['between/50-99%/1.mp3', 'between/50-99%/2.mp3', 'between/50-99%/3.mp3', 'between/50-99%/4.mp3'],
  full: ['between/100%/1.mp3', 'between/100%/2.mp3', 'between/100%/3.mp3', 'between/100%/4.mp3'],
} as const;
const ROUND1_END_AUDIO_FILES = [
  'round1end/1.mp3',
  'round1end/2.mp3',
  'round1end/3.mp3',
  'round1end/4.mp3',
  'round1end/5.mp3',
  'round1end/6.mp3',
  'round1end/7.mp3',
  'round1end/8.mp3',
  'round1end/9.mp3',
] as const;
const ROUND1_END_JINGLE_FILE = 'round1_end/jingle_(after_round1).mp3';
const ROUND2_RULES_JINGLE_FILE = 'round2/jingle (5).mp3';
const ROUND2_EXPLANATION_BG_FILE = 'round2/jingle (5).mp3';
const ROUND2_TOTAL_QUESTIONS = 6;
const ROUND2_EXPLANATION_FALLBACK = 'Озвучка рассказывает подробности — используйте текст, чтобы оттенить сюжет.';
const ROUND2_FAKE_LABEL = 'Это фейк';
const ROUND2_ANSWER_POLL_INTERVAL_MS = 5000;
const ROUND2_BETWEEN_AUDIO_VARIANTS = {
  zero: ['round2/between/0/1.mp3', 'round2/between/0/2.mp3', 'round2/between/0/3.mp3', 'round2/between/0/4.mp3'],
  low: ['round2/between/1-49%/1.mp3', 'round2/between/1-49%/2.mp3', 'round2/between/1-49%/3.mp3'],
  mid: ['round2/between/50-99%/1.mp3', 'round2/between/50-99%/2.mp3', 'round2/between/50-99%/3.mp3'],
  full: ['round2/between/100%/1.mp3', 'round2/between/100%/2.mp3', 'round2/between/100%/4.mp3', 'round2/between/100%/5.mp3'],
} as const;
const ROUND2_RULES_VOICE_FILES = ['round2/ruels/1.mp3', 'round2/ruels/2.mp3'] as const;
const ROUND2_RULES_SKIP_WINDOW_MS = 20000;

const ROUND3_RULES_VOICE_FILES = ['round3/ruels3/ruels1.mp3', 'round3/ruels3/ruels2.mp3', 'round3/ruels3/ruels3.mp3'] as const;

const ROUND3_RULES_TEXT = `Раунд «МозгоШтурм»
Перед вами появятся 6 интересных фактов с одним пропущенным словом.
Ваша задача:

Ввести в поле на телефоне то слово, которое идеально подходит (одно слово, без дефисов, пробелов и знаков).
После каждого тура на экране появятся ответы всех игроков.
Каждый выбирает понравившийся ответ (кроме своего).

Подсчёт очков:

Угадал точное слово — 200 очков.
За каждый голос за ваш ответ — +50 очков.
Не проголосовал — –50 очков.

Время на ввод ответа — 60 секунд.
Время на голосование — 30 секунд.
Синонимы могут засчитаться (на усмотрение ведущего).
Готовы угадывать и голосовать? Давайте устроим настоящий мозговой штурм!`;

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
type Round2Phase = 'idle' | 'fact' | 'explanation';

type AnswerInsertPayload = {
  new: {
    question_index: number;
  };
};

type Round2AnswerInsertPayload = {
  new: {
    item_index: number;
  };
};

interface Player {
  id: string;
  name: string;
  total_points: number;
}

type RoomStatus = 'waiting' | 'running' | 'finished' | 'round2-running';

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

type Round2AnswerRow = {
  player_id: string;
  answer_is_fact: boolean;
  is_correct: boolean;
  points_earned: number;
  submitted_at: string;
};

type Round2PlayerStats = {
  points: number;
  correct: number;
  attempts: number;
};

type Round2LeaderboardEntry = {
  playerId: string;
  name: string;
  points: number;
  correct: number;
  attempts: number;
};

export default function HostRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [roomCode, setRoomCode] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [question, setQuestionState] = useState<Question | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [totalPlayerCount, setTotalPlayerCount] = useState(0);
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
  const [countdownContext, setCountdownContext] = useState<'round1' | 'round2' | 'round3'>('round1');
  const [countdownValue, setCountdownValue] = useState<string>(COUNTDOWN_STEPS[0]);
  const [isRoomOpened, setIsRoomOpened] = useState(false);
  const [isPrestartNextEnabled, setIsPrestartNextEnabled] = useState(true);
  const [isPlayerLimitReached, setIsPlayerLimitReached] = useState(false);
  const [isRoundEndButtonLocked, setIsRoundEndButtonLocked] = useState(false);
  const [round2Items, setRound2Items] = useState<TrueFalseItem[]>([]);
  const [round2CurrentIndex, setRound2CurrentIndexState] = useState<number | null>(null);
  const [round2ShowingFact, setRound2ShowingFact] = useState<boolean>(true);
  const [round2PhaseState, setRound2PhaseState] = useState<Round2Phase>('idle');
  const round2Phase = round2PhaseState;
  const [isRound2RulesVisible, setIsRound2RulesVisible] = useState(false);
  const [isRound3RulesVisible, setIsRound3RulesVisible] = useState(false);
  const [round2Answers, setRound2Answers] = useState<Round2AnswerRow[]>([]);
  const [round2AskedIndices, setRound2AskedIndices] = useState<number[]>([]);
  const [round2QuestionCounter, setRound2QuestionCounter] = useState(0);
  const [round2Leaderboard, setRound2Leaderboard] = useState<Round2LeaderboardEntry[]>([]);
  const [round2LastAccuracy, setRound2LastAccuracy] = useState(0);
  const [isRatingVisible, setIsRatingVisible] = useState(false);

  const meetAudioRef = useRef<HTMLAudioElement | null>(null);
  const connectAudioRef = useRef<HTMLAudioElement | null>(null);
  const rulesAudioRef = useRef<HTMLAudioElement | null>(null);
  const skipAudioRef = useRef<HTMLAudioElement | null>(null);
  const questionJingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const questionVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const betweenAudioRef = useRef<HTMLAudioElement | null>(null);
  const roundEndAudioRef = useRef<HTMLAudioElement | null>(null);
  const roundEndJingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2FactAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2TimerJingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2ExplanationAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2ExplanationBgAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2BetweenAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2RulesMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2RulesVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const round3RulesVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2AnswersRef = useRef<Round2AnswerRow[]>([]);
  const round2StatsRef = useRef<Map<string, Round2PlayerStats>>(new Map());
  const round2CorrectTotalRef = useRef(0);
  const round2PossibleTotalRef = useRef(0);
  const round2LastAccuracyRef = useRef(0);
  const isLastRound2QuestionRef = useRef(false);
  const round3RulesAudioCompletedRef = useRef(true);
  const round3StartLockRef = useRef(false);
  const playersRef = useRef<Player[]>(players);
  const hasUserInteractedRef = useRef(false);
  const lastJoinAudioRef = useRef<HTMLAudioElement | null>(null);
  const lobbySoundSetterRef = useRef(setIsLobbySoundOn);
  const roundEndButtonSetterRef = useRef(setIsRoundEndButtonLocked);
  const round2AskedIndicesRef = useRef<number[]>([]);
  const round2QuestionCounterRef = useRef(0);
  const handleRound2NextQuestionRef = useRef<(() => void) | null>(null);
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
  const round2TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTransitioningRound2Ref = useRef(false);
  const round2CurrentIndexRef = useRef<number | null>(round2CurrentIndex);
  const countdownCompleteActionRef = useRef<(() => Promise<void> | void) | null>(null);
  const round2RulesReadyAtRef = useRef<number | null>(null);
  const round2ShowingFactRef = useRef(round2ShowingFact);
  const round2PhaseRef = useRef<Round2Phase>(round2PhaseState);

  const setRound2Phase = useCallback(
    (nextPhase: Round2Phase) => {
      round2PhaseRef.current = nextPhase;
      setRound2PhaseState(nextPhase);
    },
    [setRound2PhaseState]
  );

  const setRound2CurrentIndex = useCallback(
    (value: number | null) => {
      round2CurrentIndexRef.current = value;
      setRound2CurrentIndexState(value);
    },
    [setRound2CurrentIndexState]
  );

  const setQuestion = useCallback(
    (nextQuestion: Question | null) => {
      setQuestionState(nextQuestion);
      roundEndButtonSetterRef.current(false);
    },
    []
  );
  useEffect(() => {
    lobbySoundSetterRef.current = setIsLobbySoundOn;
  }, [setIsLobbySoundOn]);

  useEffect(() => {
    roundEndButtonSetterRef.current = setIsRoundEndButtonLocked;
  }, [setIsRoundEndButtonLocked]);

  useEffect(() => {
    round2AskedIndicesRef.current = round2AskedIndices;
  }, [round2AskedIndices]);

  useEffect(() => {
    round2QuestionCounterRef.current = round2QuestionCounter;
  }, [round2QuestionCounter]);

  useEffect(() => {
    round2ShowingFactRef.current = round2ShowingFact;
  }, [round2ShowingFact]);

  useEffect(() => {
    round2AnswersRef.current = round2Answers;
  }, [round2Answers]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const clearCountdownTimeout = useCallback(() => {
    if (countdownTimeoutRef.current) {
      clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
    countdownCompleteActionRef.current = null;
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

  const clearRound2Timer = useCallback(() => {
    if (round2TimerRef.current) {
      clearTimeout(round2TimerRef.current);
      round2TimerRef.current = null;
    }
  }, []);

  const stopRound2Audio = useCallback(() => {
    if (round2FactAudioRef.current) {
      try {
        round2FactAudioRef.current.pause();
        round2FactAudioRef.current.currentTime = 0;
      } catch (e) {
        console.error('Ошибка остановки факта Раунда 2', e);
      }
      round2FactAudioRef.current = null;
    }
    if (round2TimerJingleAudioRef.current) {
      try {
        round2TimerJingleAudioRef.current.pause();
        round2TimerJingleAudioRef.current.currentTime = 0;
      } catch (e) {
        console.error('Ошибка остановки джингла Раунда 2', e);
      }
      round2TimerJingleAudioRef.current = null;
    }
    if (round2ExplanationAudioRef.current) {
      try {
        round2ExplanationAudioRef.current.pause();
        round2ExplanationAudioRef.current.currentTime = 0;
      } catch (e) {
        console.error('Ошибка остановки объяснения Раунда 2', e);
      }
      round2ExplanationAudioRef.current = null;
    }
    if (round2ExplanationBgAudioRef.current) {
      try {
        round2ExplanationBgAudioRef.current.pause();
        round2ExplanationBgAudioRef.current.currentTime = 0;
      } catch (e) {
        console.error('Ошибка остановки фона объяснения Раунда 2', e);
      }
      round2ExplanationBgAudioRef.current = null;
    }
    if (round2BetweenAudioRef.current) {
      try {
        round2BetweenAudioRef.current.pause();
        round2BetweenAudioRef.current.currentTime = 0;
      } catch (e) {
        console.error('Ошибка остановки между-аудио Раунда 2', e);
      }
      round2BetweenAudioRef.current = null;
    }
  }, []);

  const stopRound2RulesAudio = useCallback(() => {
    if (round2RulesMusicAudioRef.current) {
      round2RulesMusicAudioRef.current.pause();
      round2RulesMusicAudioRef.current.currentTime = 0;
      round2RulesMusicAudioRef.current = null;
    }
    if (round2RulesVoiceAudioRef.current) {
      round2RulesVoiceAudioRef.current.pause();
      round2RulesVoiceAudioRef.current.currentTime = 0;
      round2RulesVoiceAudioRef.current = null;
    }
  }, []);

  const stopRound3RulesAudio = useCallback(() => {
    const voiceCue = round3RulesVoiceAudioRef.current;
    if (voiceCue) {
      voiceCue.pause();
      voiceCue.currentTime = 0;
      voiceCue.onended = null;
      round3RulesVoiceAudioRef.current = null;
    }
    round3RulesAudioCompletedRef.current = true;
  }, []);

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

  const playRound2RulesAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }
    stopRound2RulesAudio();
    const jingle = new Audio(buildAudioUrl(ROUND2_RULES_JINGLE_FILE));
    jingle.volume = 0.5;
    jingle.loop = true;
    round2RulesMusicAudioRef.current = jingle;

    const voiceSource = ROUND2_RULES_VOICE_FILES.length ? pickRandomItem(ROUND2_RULES_VOICE_FILES) : ROUND2_RULES_JINGLE_FILE;
    const voice = new Audio(buildAudioUrl(voiceSource));
    voice.volume = 0.95;
    round2RulesVoiceAudioRef.current = voice;

    jingle.play().catch((err) => {
      console.error('Не удалось воспроизвести джингл правил Раунда 2', err);
    });
    voice.play().catch((err) => {
      console.error('Не удалось воспроизвести озвучку правил Раунда 2', err);
    });
  }, [stopRound2RulesAudio]);

  const playRound3RulesAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopRound3RulesAudio();
    round3RulesAudioCompletedRef.current = false;

    const voiceSource = pickRandomItem(ROUND3_RULES_VOICE_FILES);
    const voice = new Audio(buildAudioUrl(voiceSource));
    voice.volume = 0.95;
    round3RulesVoiceAudioRef.current = voice;

    voice.onended = () => {
      round3RulesAudioCompletedRef.current = true;
    };

    voice.play().catch((err) => {
      round3RulesAudioCompletedRef.current = true;
      console.error('Не удалось воспроизвести озвучку правил Раунда 3', err);
    });
  }, [stopRound3RulesAudio]);

  useEffect(() => {
    const loadRound2Data = async () => {
      try {
        const res = await fetch('/round2/true_false_explanation.json', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as TrueFalseItem[];
        setRound2Items(json);
      } catch (e) {
        console.error('Failed to load round2 data', e);
      }
    };
    loadRound2Data();
  }, []);

  useEffect(() => {
    if (isRound2RulesVisible) {
      stopRoundEndAudio();
      playRound2RulesAudio();
    } else {
      stopRound2RulesAudio();
    }
  }, [isRound2RulesVisible, playRound2RulesAudio, stopRound2RulesAudio, stopRoundEndAudio]);

  useEffect(() => {
    if (isRound3RulesVisible) {
      stopRoundEndAudio();
      stopRound2RulesAudio();
      playRound3RulesAudio();
    } else {
      stopRound3RulesAudio();
    }
  }, [isRound3RulesVisible, playRound3RulesAudio, stopRound2RulesAudio, stopRound3RulesAudio, stopRoundEndAudio]);

  useEffect(() => {
    round2RulesReadyAtRef.current = isRound2RulesVisible ? Date.now() : null;
  }, [isRound2RulesVisible]);

  const resetRound2Stats = useCallback(() => {
    round2StatsRef.current = new Map();
    round2CorrectTotalRef.current = 0;
    round2PossibleTotalRef.current = 0;
    round2LastAccuracyRef.current = 0;
    setRound2Leaderboard([]);
    setRound2LastAccuracy(0);
  }, []);

  const updateRound2Leaderboard = useCallback(() => {
    const statsMap = round2StatsRef.current;
    const snapshot = playersRef.current;
    if (!snapshot.length) {
      setRound2Leaderboard([]);
      return;
    }

    const leaderboard = snapshot
      .map((player) => {
        const stats = statsMap.get(player.id);
        return {
          playerId: player.id,
          name: player.name,
          points: stats?.points ?? 0,
          correct: stats?.correct ?? 0,
          attempts: stats?.attempts ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.correct !== a.correct) return b.correct - a.correct;
        return a.name.localeCompare(b.name);
      });

    setRound2Leaderboard(leaderboard);
  }, []);

  const recordRound2QuestionStats = useCallback(() => {
    const snapshot = round2AnswersRef.current;
    const uniqueMap = new Map<string, Round2AnswerRow>();
    for (const answer of snapshot) {
      uniqueMap.set(answer.player_id, answer);
    }
    const uniqueAnswers = Array.from(uniqueMap.values());
    const statsMap = round2StatsRef.current;

    uniqueAnswers.forEach((answer) => {
      const existing = statsMap.get(answer.player_id) ?? { points: 0, correct: 0, attempts: 0 };
      existing.attempts += 1;
      if (answer.is_correct) {
        existing.correct += 1;
        existing.points += answer.points_earned;
      }
      statsMap.set(answer.player_id, existing);
    });

    const participants = playersRef.current.length || uniqueAnswers.length;
    if (participants > 0) {
      const correctCount = uniqueAnswers.filter((answer) => answer.is_correct).length;
      round2CorrectTotalRef.current += correctCount;
      round2PossibleTotalRef.current += participants;
      round2LastAccuracyRef.current = (correctCount / participants) * 100;
    } else {
      round2LastAccuracyRef.current = 0;
    }

    setRound2LastAccuracy(round2LastAccuracyRef.current);

    updateRound2Leaderboard();
  }, [updateRound2Leaderboard]);

  const playRound2FactAudio = useCallback(
    (index: number, isFact: boolean) => {
      if (!hasUserInteractedRef.current) return;
      stopRound2Audio();

      const folder = isFact ? 'round2/true' : 'round2/false';
      const ordinal = index + 1;
      const prefix = isFact ? 'true' : 'false';
      const filePath = `${folder}/${prefix}${ordinal}.mp3`;
      const audio = new Audio(buildAudioUrl(filePath));
      audio.volume = 0.95;
      round2FactAudioRef.current = audio;

      const jingle = new Audio(buildJingleUrl(QUESTION_JINGLE_FILE));
      jingle.volume = 0.45;
      round2TimerJingleAudioRef.current = jingle;

      jingle.play().catch((e) => {
        console.error('Не удалось запустить джингл Раунда 2', e);
      });

      audio.play().catch((e) => {
        console.error('Не удалось проиграть аудио факта Раунда 2', e);
      });
    },
    [stopRound2Audio]
  );

  const playRound2BetweenAudio = useCallback(
    (percent: number) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      stopRound2Audio();

      const normalized = Math.max(0, Math.min(100, Math.round(percent)));
      const variants =
        normalized === 100
          ? ROUND2_BETWEEN_AUDIO_VARIANTS.full
          : normalized >= 50
            ? ROUND2_BETWEEN_AUDIO_VARIANTS.mid
            : normalized >= 1
              ? ROUND2_BETWEEN_AUDIO_VARIANTS.low
              : ROUND2_BETWEEN_AUDIO_VARIANTS.zero;

      const cueFile = pickRandomItem(variants);
      const cue = new Audio(buildAudioUrl(cueFile));
      cue.volume = 0.95;
      round2BetweenAudioRef.current = cue;

      cue.addEventListener(
        'ended',
        () => {
          stopRound2Audio();
          if (isLastRound2QuestionRef.current) {
            void completeRound2();
          } else {
            handleRound2NextQuestionRef.current?.();
          }
        },
        { once: true }
      );

      cue.play().catch((error) => {
        console.error('Не удалось проиграть пост-раундовый сигнал Раунда 2', error);
        if (isLastRound2QuestionRef.current) {
          void completeRound2();
        } else {
          handleRound2NextQuestionRef.current?.();
        }
      });
    },
    [stopRound2Audio]
  );

  const playRound2ExplanationAudio = useCallback(
    async (index: number) => {
      if (!hasUserInteractedRef.current) return;
      stopRound2Audio();

      const bg = new Audio(buildAudioUrl(ROUND2_EXPLANATION_BG_FILE));
      bg.volume = 0.3;
      bg.loop = true;
      round2ExplanationBgAudioRef.current = bg;

      const ordinal = index + 1;
      const voice = new Audio(buildAudioUrl(`round2/explanation/${ordinal}.mp3`));
      voice.volume = 0.95;

      round2ExplanationAudioRef.current = voice;

      try {
        await bg.play();
      } catch (e) {
        console.error('Не удалось запустить фон объяснения Раунда 2', e);
      }

      voice.addEventListener(
        'ended',
        () => {
          stopRound2Audio();
          if (isLastRound2QuestionRef.current) {
            const lastPercent = Number.isFinite(round2LastAccuracyRef.current) ? round2LastAccuracyRef.current : 0;
            playRound2BetweenAudio(lastPercent);
          } else {
            handleRound2NextQuestionRef.current?.();
          }
        },
        { once: true }
      );

      voice.play().catch((e) => {
        console.error('Не удалось проиграть озвучку объяснения Раунда 2', e);
      });
    },
    [playRound2BetweenAudio, stopRound2Audio]
  );

  const playRound2FictionExplanationAudio = useCallback(
    async (index: number) => {
      if (!hasUserInteractedRef.current) return;
      stopRound2Audio();

      const bg = new Audio(buildAudioUrl(ROUND2_EXPLANATION_BG_FILE));
      bg.volume = 0.3;
      bg.loop = true;
      round2ExplanationBgAudioRef.current = bg;

      const ordinal = index + 1;
      const voice = new Audio(buildAudioUrl(`round2/fictionExplanation/${ordinal}.mp3`));
      voice.volume = 0.95;

      round2ExplanationAudioRef.current = voice;

      try {
        await bg.play();
      } catch (e) {
        console.error('Не удалось запустить фон объяснения фейка Раунда 2', e);
      }

      voice.addEventListener(
        'ended',
        () => {
          stopRound2Audio();
          if (isLastRound2QuestionRef.current) {
            const lastPercent = Number.isFinite(round2LastAccuracyRef.current) ? round2LastAccuracyRef.current : 0;
            playRound2BetweenAudio(lastPercent);
          } else {
            handleRound2NextQuestionRef.current?.();
          }
        },
        { once: true }
      );

      voice.play().catch((e) => {
        console.error('Не удалось проиграть озвучку объяснения фейка Раунда 2', e);
      });
    },
    [playRound2BetweenAudio, stopRound2Audio]
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
      if (nextStatus !== 'round2-running') {
        setRound2Phase('idle');
        setRound2CurrentIndex(null);
        setRound2ShowingFact(true);
        setIsRound2RulesVisible(false);
        clearRound2Timer();
        stopRound2Audio();
        stopRound2RulesAudio();
      }
    },
    [
      clearCountdownTimeout,
      clearRound2Timer,
      setRound2CurrentIndex,
      setRound2Phase,
      stopRound2Audio,
      stopRound2RulesAudio,
    ]
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

  const playerRatings = useMemo(() => {
    return [...players].sort((a, b) => b.total_points - a.total_points);
  }, [players]);

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
    [selectedQuestionIds, setQuestion]
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
    setTotalPlayerCount(list.length);
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

  const loadRound2AnswerStats = useCallback(
    async (itemIndex: number | null, options?: { preserveRound1Counters?: boolean }) => {
      const preserveRound1Counters = options?.preserveRound1Counters ?? false;
      if (!itemIndex && itemIndex !== 0) {
        setRound2Answers([]);
        if (!preserveRound1Counters) {
          setAnswerCount(0);
          setCorrectAnswerCount(0);
          setAnsweredPlayerIds([]);
          if (serverAllPlayersAnswered) {
            setServerAllPlayersAnswered(false);
          }
        }
        return;
      }

      const { data, error } = await supabase
        .from('round2_answers')
        .select('player_id, answer_is_fact, is_correct, points_earned, submitted_at', { count: 'exact' })
        .eq('room_id', roomId)
        .eq('item_index', itemIndex)
        .order('submitted_at', { ascending: true });

      if (error) {
        console.error('Не удалось загрузить ответы Раунда 2', error);
        return;
      }

      const rows = data || [];
      setRound2Answers(rows);

      const latestAnswers = new Map<string, Round2AnswerRow>();
      for (const row of rows) {
        latestAnswers.set(row.player_id, row);
      }

      const uniqueAnswers = Array.from(latestAnswers.values());
      const uniqueIds = uniqueAnswers.map((row) => row.player_id);
      setAnsweredPlayerIds(uniqueIds);

      const totalUniqueAnswers = uniqueAnswers.length;
      setAnswerCount(totalUniqueAnswers);
      const correct = uniqueAnswers.filter((row) => row.is_correct).length;
      setCorrectAnswerCount(correct);

      const everyoneHandled = totalPlayerCount > 0 && totalUniqueAnswers >= totalPlayerCount;
      if (everyoneHandled !== serverAllPlayersAnswered) {
        setServerAllPlayersAnswered(everyoneHandled);
      }
    },
    [totalPlayerCount, roomId, serverAllPlayersAnswered]
  );

  const loadRound2AnswerStatsRef = useRef(loadRound2AnswerStats);

  useEffect(() => {
    loadRound2AnswerStatsRef.current = loadRound2AnswerStats;
  }, [loadRound2AnswerStats]);

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
            'code, current_question_index, question_started_at, status, all_players_answered, selected_question_ids, is_active, round2_item_index, round2_showing_fact, round2_phase'
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
        const isLiveRound = detectedStatus === 'running' || detectedStatus === 'round2-running';
        setServerAllPlayersAnswered(isLiveRound ? !!room.all_players_answered : false);
        const nextRound2Index = (room.round2_item_index as number | null) ?? room.current_question_index ?? null;
        if (nextRound2Index !== null) {
          setRound2CurrentIndex(nextRound2Index);
        }
        if (typeof room.round2_showing_fact === 'boolean') {
          setRound2ShowingFact(room.round2_showing_fact);
        }
        const dbRound2Phase = (room.round2_phase as Round2Phase) || 'idle';
        setRound2Phase(detectedStatus === 'round2-running' ? dbRound2Phase : 'idle');

      if (detectedStatus === 'running') {
        syncTimerWithStart(room.question_started_at, effectiveOffset);
        if (room.all_players_answered) {
          setTimeLeft(0);
        }
        loadQuestionFromSelection(room.current_question_index, selection);
        await loadAnswerCount(room.current_question_index);
        await loadRound2AnswerStats(null, { preserveRound1Counters: true });
      } else if (detectedStatus === 'round2-running') {
        if (nextRound2Index !== round2CurrentIndexRef.current) {
          setShowResults(false);
          setQuestion(null);
          setAnswerCount(0);
          setCorrectAnswerCount(0);
          setAnsweredPlayerIds([]);
        }
        syncTimerWithStart(room.question_started_at, effectiveOffset);
        if (room.all_players_answered) {
          setTimeLeft(0);
        }
        await loadRound2AnswerStats(nextRound2Index);
      } else if (detectedStatus === 'finished') {
        setShowResults(true);
        setAnswerCount(0);
        setAnsweredPlayerIds([]);
        setServerAllPlayersAnswered(false);
        await fetchSummaryData();
        await loadRound2AnswerStats(null);
      } else {
        setQuestion(null);
        setAnswerCount(0);
        setAnsweredPlayerIds([]);
        setQuestionStartedAt(null);
        setTimeLeft(QUESTION_DURATION_SECONDS);
        setServerAllPlayersAnswered(false);
        await loadRound2AnswerStats(null);
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
      loadRound2AnswerStats,
      loadPlayers,
      syncTimerWithStart,
      updateRoomStatus,
      setQuestion,
      setRound2CurrentIndex,
      setRound2Phase,
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
    round2CurrentIndexRef.current = round2CurrentIndex;
  }, [round2CurrentIndex]);

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
    lobbySoundSetterRef.current(false);
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

  const playSkipAudioAndWait = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return Promise.resolve();
    }

    stopSkipAudio();
    const file = pickRandomItem(SKIP_AUDIO_FILES);
    const audio = new Audio(buildAudioUrl(file));
    audio.volume = 0.95;
    skipAudioRef.current = audio;

    return new Promise<void>((resolve) => {
      audio.onended = () => {
        resolve();
      };
      audio.play().catch((error) => {
        console.error('Не удалось проиграть skip-озвучку', error);
        resolve();
      });
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
  }, [question?.id, stopRoundEndAudio, clearRoundEndUnlockTimeout, clearRoundEndDelayTimeout]);

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

      const voice = new Audio(buildAudioUrl(`questions/${questionId}.mp3`));
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
      stopRound2Audio();
      stopRound2RulesAudio();
      clearCountdownTimeout();
      clearPrestartEnableTimeout();
      clearRoundEndUnlockTimeout();
      clearRoundEndDelayTimeout();
      clearAutoNextTimeout();
      clearRound2Timer();
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
    stopRound2Audio,
    stopRound2RulesAudio,
    clearCountdownTimeout,
    clearPrestartEnableTimeout,
    clearRoundEndUnlockTimeout,
    clearRoundEndDelayTimeout,
    clearAutoNextTimeout,
    clearRound2Timer,
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

    const round2AnswersChannel = supabase
      .channel(`host-round2-answers-${roomId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'round2_answers',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload: Round2AnswerInsertPayload) => {
          if (!mounted) return;
          const currentIndex = round2CurrentIndexRef.current;
          if (currentIndex === null) {
            return;
          }
          if (payload.new.item_index === currentIndex) {
            await loadRound2AnswerStatsRef.current?.(currentIndex);
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
      round2AnswersChannel.unsubscribe().then(() => {
        supabase.removeChannel(round2AnswersChannel);
      });
    };
  }, [roomId]);

  const everyoneAnswered = players.length > 0 && answerCount >= players.length;
  const shouldForceZero = serverAllPlayersAnswered || everyoneAnswered;
  const isRound2FactPhase = roomStatus === 'round2-running' && round2Phase === 'fact';
  const isTimerRoundActive = roomStatus === 'running' || isRound2FactPhase;
  const timerActive = !showResults && isTimerRoundActive && Boolean(questionStartedAt) && !shouldForceZero;

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
    if (!roomId || roomStatus !== 'round2-running') {
      return;
    }

    if (totalPlayerCount === 0) {
      return;
    }

    const everyoneAnswered = answerCount >= totalPlayerCount;
    if (everyoneAnswered === serverAllPlayersAnswered) {
      return;
    }

    const updateFlag = async () => {
      const { error } = await supabase
        .from('rooms')
        .update({ all_players_answered: everyoneAnswered })
        .eq('id', roomId);

      if (error) {
        console.error('Не удалось обновить статус ответов Раунда 2', error);
        return;
      }
      setServerAllPlayersAnswered(everyoneAnswered);
    };

    updateFlag();
  }, [answerCount, totalPlayerCount, roomId, roomStatus, serverAllPlayersAnswered]);

  useEffect(() => {
    // Poll answers during the fact phase so the host still sees fresh counts if realtime misses events.
    // Disabled for Round 2 to avoid conflicts with realtime updates
    if (roomStatus !== 'round2-running' && (roomStatus !== 'running' || round2Phase !== 'fact' || serverAllPlayersAnswered)) {
      return;
    }

    const fetchLatestAnswers = () => {
      const activeIndex = round2CurrentIndexRef.current ?? round2CurrentIndex;
      if (activeIndex === null) {
        return;
      }
      loadRound2AnswerStatsRef.current?.(activeIndex);
    };

    fetchLatestAnswers();
    const intervalId = setInterval(fetchLatestAnswers, ROUND2_ANSWER_POLL_INTERVAL_MS);
    return () => {
      clearInterval(intervalId);
    };
  }, [roomStatus, round2Phase, serverAllPlayersAnswered, round2CurrentIndex]);

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
      if (!showResults) {
        stopRoundEndAudio();
      }
      clearRoundEndUnlockTimeout();
      clearRoundEndDelayTimeout();
      roundEndLockQuestionRef.current = null;
      roundEndButtonSetterRef.current(false);
    }
  }, [roomStatus, showResults, stopBetweenAudio, stopRoundEndAudio, clearRoundEndUnlockTimeout, clearRoundEndDelayTimeout]);

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
    setIsRatingVisible(false);
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
    setIsRatingVisible(false);
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

  const runCountdownSequence = useCallback(
    function runCountdownSequence(stepIndex: number) {
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
        const action = countdownCompleteActionRef.current;
        countdownCompleteActionRef.current = null;
        if (action) {
          Promise.resolve(action()).catch((err) => {
            console.error('Не удалось выполнить действие после обратного отсчёта', err);
          });
        }
      }, 400);
    },
    [playBeep]
  );

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
    clearCountdownTimeout();
    setCountdownContext('round1');
    countdownCompleteActionRef.current = () => startRound();
    setIsCountdownVisible(true);
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
      .update({
        is_active: false,
        status: 'finished',
        all_players_answered: false,
        question_started_at: null,
        round2_phase: 'idle',
      })
      .eq('id', roomId);

    if (updateError) {
      setError('Ошибка при завершении игры');
      return;
    }

    localStorage.removeItem('hostRoomId');
    localStorage.removeItem('hostRoomCode');
    router.push('/host');
  };

  const moveRound2ToExplanation = useCallback(
    async (index: number) => {
      if (round2PhaseRef.current !== 'fact' || isTransitioningRound2Ref.current) {
        return;
      }
      isTransitioningRound2Ref.current = true;
      clearRound2Timer();
      stopRound2Audio();
      setRound2Phase('explanation');
      setServerAllPlayersAnswered(true);
      const { error } = await supabase
        .from('rooms')
        .update({
          round2_phase: 'explanation',
          question_started_at: null,
          all_players_answered: true,
        })
        .eq('id', roomId);

      if (error) {
        console.error('Не удалось переключить Раунд 2 в режим объяснения', error);
        isTransitioningRound2Ref.current = false;
        return;
      }

      recordRound2QuestionStats();

      const showingFact = round2ShowingFactRef.current;

      if (showingFact) {
        await playRound2ExplanationAudio(index);
      } else {
        await playRound2FictionExplanationAudio(index);
      }
      isTransitioningRound2Ref.current = false;
    },
    [
      clearRound2Timer,
      stopRound2Audio,
      playRound2ExplanationAudio,
      playRound2FictionExplanationAudio,
      roomId,
      recordRound2QuestionStats,
      setRound2Phase,
    ]
  );

  useEffect(() => {
    if (roomStatus !== 'round2-running' || round2Phase !== 'fact' || !serverAllPlayersAnswered || isTransitioningRound2Ref.current) {
      return;
    }
    const currentIndex = round2CurrentIndexRef.current ?? round2CurrentIndex;
    if (currentIndex === null) {
      return;
    }
    clearRound2Timer();
    // Small delay to ensure UI has updated
    setTimeout(() => void moveRound2ToExplanation(currentIndex), 500);
  }, [roomStatus, round2Phase, serverAllPlayersAnswered, moveRound2ToExplanation, round2CurrentIndex, clearRound2Timer]);

  const launchRound2Question = useCallback(
    async (index: number, showingFact: boolean, questionNumber: number, options?: { resetTrackers?: boolean }) => {
      hasUserInteractedRef.current = true;
      clearRound2Timer();
      stopRound2Audio();
      stopBetweenAudio();
      stopQuestionAudio();
      stopRoundEndAudio();
      stopRound2RulesAudio();
      setIsRound2RulesVisible(false);
      if (options?.resetTrackers) {
        round2AskedIndicesRef.current = [index];
        setRound2AskedIndices([index]);
      } else {
        const nextUsed = [...round2AskedIndicesRef.current, index];
        round2AskedIndicesRef.current = nextUsed;
        setRound2AskedIndices(nextUsed);
      }

      round2QuestionCounterRef.current = questionNumber;
      setRound2QuestionCounter(questionNumber);
      isLastRound2QuestionRef.current = questionNumber >= ROUND2_TOTAL_QUESTIONS;

      const { iso: startedAt } = await getServerIsoTimestamp();

      const { error: updateError } = await supabase
        .from('rooms')
        .update({
          status: 'round2-running',
          is_active: true,
          question_started_at: startedAt,
          current_question_index: index,
          round2_item_index: index,
          round2_showing_fact: showingFact,
          round2_phase: 'fact',
          all_players_answered: false,
        })
        .eq('id', roomId);

      if (updateError) {
        setError('Не удалось запустить Раунд 2');
        return;
      }

      setShowResults(false);
      setIsRatingVisible(false);
      setRoomStatus('round2-running');
      setRound2CurrentIndex(index);
      setRound2ShowingFact(showingFact);
      setRound2Phase('fact');
      setServerAllPlayersAnswered(false);
      setAnswerCount(0);
      setCorrectAnswerCount(0);
      setAnsweredPlayerIds([]);
      setRound2Answers([]);
      setQuestionStartedAt(startedAt);
      setTimeLeft(QUESTION_DURATION_SECONDS);
      round2LastAccuracyRef.current = 0;
      setRound2LastAccuracy(0);

      playRound2FactAudio(index, showingFact);

      round2TimerRef.current = setTimeout(() => {
        void moveRound2ToExplanation(index);
      }, QUESTION_DURATION_SECONDS * 1000);
    },
    [
      clearRound2Timer,
      stopRoundEndAudio,
      stopBetweenAudio,
      stopQuestionAudio,
      stopRound2Audio,
      stopRound2RulesAudio,
      setIsRound2RulesVisible,
      getServerIsoTimestamp,
      roomId,
      setError,
      setShowResults,
      setIsRatingVisible,
      playRound2FactAudio,
      moveRound2ToExplanation,
      setRound2CurrentIndex,
      setRound2Phase,
    ]
  );

  const pickNextRound2Index = useCallback(() => {
    if (!round2Items.length) {
      return null;
    }
    const used = new Set(round2AskedIndicesRef.current);
    const allIndices = round2Items.map((_, idx) => idx);
    const available = allIndices.filter((idx) => !used.has(idx));
    const pool = available.length ? available : allIndices;
    if (!pool.length) {
      return null;
    }
    return pickRandomItem(pool);
  }, [round2Items]);


  const performRound2Start = useCallback(async () => {
    resetRound2Stats();
    if (!round2Items.length) {
      setError('Вопросы для Раунда 2 ещё не загружены');
      return;
    }

    const index = pickNextRound2Index();
    if (index === null) {
      setError('Не удалось выбрать факт для Раунда 2');
      return;
    }

    const showingFact = Math.random() < 0.5;
    await launchRound2Question(index, showingFact, 1, { resetTrackers: true });
  }, [launchRound2Question, pickNextRound2Index, resetRound2Stats, round2Items.length, setError]);

  const startRound2 = useCallback(() => {
    if (!round2Items.length) {
      setError('Вопросы для Раунда 2 ещё не загружены');
      return;
    }

    hasUserInteractedRef.current = true;
    const readyAt = round2RulesReadyAtRef.current;
    round2RulesReadyAtRef.current = null;
    const now = Date.now();
    const shouldPlaySkip = !readyAt || now - readyAt <= ROUND2_RULES_SKIP_WINDOW_MS;

    setIsRound2RulesVisible(false);
    stopRound2RulesAudio();

    if (shouldPlaySkip) {
      playSkipAudio();
    }

    clearCountdownTimeout();
    setCountdownContext('round2');
    countdownCompleteActionRef.current = () => performRound2Start();
    setIsCountdownVisible(true);
    runCountdownSequence(0);
  }, [
    clearCountdownTimeout,
    performRound2Start,
    playSkipAudio,
    round2Items.length,
    runCountdownSequence,
    setCountdownContext,
    setIsCountdownVisible,
    setIsRound2RulesVisible,
    stopRound2RulesAudio,
  ]);

  const startRound3Countdown = useCallback(async () => {
    if (round3StartLockRef.current || isCountdownVisible) {
      return;
    }
    round3StartLockRef.current = true;
    hasUserInteractedRef.current = true;

    const shouldPlaySkip = !round3RulesAudioCompletedRef.current;

    setIsRound3RulesVisible(false);
    stopRound3RulesAudio();

    if (shouldPlaySkip) {
      await playSkipAudioAndWait();
    }

    clearCountdownTimeout();
    setCountdownContext('round3');
    countdownCompleteActionRef.current = () => {
      // Round 3 gameplay will be implemented step-by-step later.
      round3StartLockRef.current = false;
    };
    setIsCountdownVisible(true);
    runCountdownSequence(0);
  }, [
    clearCountdownTimeout,
    isCountdownVisible,
    playSkipAudioAndWait,
    runCountdownSequence,
    setCountdownContext,
    setIsCountdownVisible,
    setIsRound3RulesVisible,
    stopRound3RulesAudio,
  ]);

  const completeRound2 = useCallback(async () => {
    handleRound2NextQuestionRef.current = null;
    clearRound2Timer();
    stopRound2Audio();
    stopRound2RulesAudio();
    const { error } = await supabase
      .from('rooms')
      .update({
        status: 'finished',
        is_active: false,
        all_players_answered: true,
        question_started_at: null,
        round2_phase: 'idle',
      })
      .eq('id', roomId);

    if (error) {
      setError('Не удалось завершить Раунд 2');
      return;
    }

    updateRound2Leaderboard();
    setRoomStatus('finished');
    setShowResults(true);
    setRound2Phase('idle');
    setRound2CurrentIndex(null);
    setRound2QuestionCounter(0);
    setRound2AskedIndices([]);
    round2QuestionCounterRef.current = 0;
    round2AskedIndicesRef.current = [];
    setServerAllPlayersAnswered(true);
    setQuestionStartedAt(null);
  }, [clearRound2Timer, roomId, setRound2CurrentIndex, setRound2Phase, stopRound2Audio, stopRound2RulesAudio, updateRound2Leaderboard]);

  const handleRound2NextQuestion = useCallback(async () => {
    if (roomStatus !== 'round2-running') {
      return;
    }

    const currentStep = round2QuestionCounterRef.current;
    if (currentStep >= ROUND2_TOTAL_QUESTIONS) {
      await completeRound2();
      return;
    }

    const nextIndex = pickNextRound2Index();
    if (nextIndex === null) {
      await completeRound2();
      return;
    }

    const showingFact = Math.random() < 0.5;
    await launchRound2Question(nextIndex, showingFact, currentStep + 1);
  }, [completeRound2, launchRound2Question, pickNextRound2Index, roomStatus]);

  useEffect(() => {
    handleRound2NextQuestionRef.current = handleRound2NextQuestion;
  }, [handleRound2NextQuestion]);

  const handleRound2Reveal = useCallback(() => {
    if (round2CurrentIndex === null) {
      return;
    }
    void moveRound2ToExplanation(round2CurrentIndex);
  }, [moveRound2ToExplanation, round2CurrentIndex]);

  const handleReplayRound2Audio = useCallback(() => {
    if (round2CurrentIndex === null) {
      return;
    }
    if (round2Phase === 'fact') {
      void playRound2FactAudio(round2CurrentIndex, round2ShowingFact);
      return;
    }
    void playRound2ExplanationAudio(round2CurrentIndex);
  }, [playRound2ExplanationAudio, playRound2FactAudio, round2CurrentIndex, round2Phase, round2ShowingFact]);

  const effectiveTimeLeft = shouldForceZero ? 0 : timeLeft;
  const answeredCount = answerCount;
  const totalPlayers = players.length;
  const correctAnswerPercentage = totalPlayers > 0 ? (correctAnswerCount / totalPlayers) * 100 : 0;
  const totalQuestions = selectedQuestionIds.length || ROUND_QUESTION_COUNT;
  const allPlayersAnswered = serverAllPlayersAnswered || (totalPlayers > 0 && answeredCount >= totalPlayers);
  const isLastQuestion = totalQuestions > 0 ? currentQuestionIndex >= totalQuestions - 1 : false;
  const isRound1Active = roomStatus === 'running';
  const isRound2Running = roomStatus === 'round2-running';
  const canAdvance = isRound1Active && (effectiveTimeLeft === 0 || allPlayersAnswered);
  const nextButtonDisabled = !canAdvance || (isLastQuestion && (isSummaryLoading || isRoundEndButtonLocked));
  const progressPercent = Math.max(0, Math.min(100, (effectiveTimeLeft / QUESTION_DURATION_SECONDS) * 100));
  const questionsForSummary = summaryQuestions.length ? summaryQuestions : question ? [question] : [];
  const isWaiting = roomStatus === 'waiting' && !showResults;
  const shouldShowRulesModal = isWaiting && isRulesVisible;
  const shouldShowCountdownOverlay = isCountdownVisible;
  const currentRound2Item = round2CurrentIndex !== null ? round2Items[round2CurrentIndex] : null;
  const round2Statement = currentRound2Item
    ? round2ShowingFact
      ? currentRound2Item.fact
      : currentRound2Item.fiction
    : 'Подождите, факт загружается…';
  const round2Explanation = currentRound2Item?.explanation ?? '';
  const round2FictionExplanation = currentRound2Item?.fictionExplanation ?? '';
  const round2ExplanationText = round2ShowingFact ? round2Explanation || ROUND2_EXPLANATION_FALLBACK : round2FictionExplanation || ROUND2_FAKE_LABEL;
  const dedupedRound2Answers = useMemo(() => {
    const unique = new Map<string, Round2AnswerRow>();
    for (const answer of round2Answers) {
      unique.set(answer.player_id, answer);
    }
    return Array.from(unique.values());
  }, [round2Answers]);
  const headerActionLabel = roomStatus === 'finished' && showResults ? 'Раунд 2' : 'Завершить игру';
  const round2QuestionNumber = round2QuestionCounter > 0 ? round2QuestionCounter : 1;
  const clampedRound2QuestionNumber = Math.min(round2QuestionNumber, ROUND2_TOTAL_QUESTIONS);
  const round2TruthLabel =
    round2Phase === 'fact'
      ? 'Правда откроется во время объяснения'
      : round2ShowingFact
        ? 'Ответ: правда'
        : 'Ответ: вымысел';
  const round2TruthClass =
    round2Phase === 'fact'
      ? 'text-[#142a45]/60'
      : round2ShowingFact
        ? 'text-[#1f6ac6]'
        : 'text-[#b4007f]';
  const round2AccuracyPercent = Math.max(0, Math.min(100, Math.round(round2LastAccuracy)));
  const round2AccuracyLabel =
    round2Leaderboard.length > 0 ? `${round2AccuracyPercent}% попали в точку` : 'Ждём первую статистику';

  const handlePrimaryHeaderAction = () => {
    if (roomStatus === 'finished' && showResults) {
      hasUserInteractedRef.current = true;
      setIsRound2RulesVisible(true);
      return;
    }
    void endGame();
  };

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
    roundEndButtonSetterRef.current(true);
    void playBetweenAudioForPercent(correctAnswerPercentage);
    clearRoundEndDelayTimeout();
    clearRoundEndUnlockTimeout();
    roundEndDelayTimeoutRef.current = setTimeout(() => {
      playRoundEndAudio();
      roundEndUnlockTimeoutRef.current = setTimeout(() => {
        roundEndButtonSetterRef.current(false);
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
        ? 'Раунд 1 в эфире'
        : roomStatus === 'round2-running'
          ? 'Раунд 2 в эфире'
          : 'Итоги раунда';
  const statusBadgeClass =
    roomStatus === 'running'
      ? 'bg-[#f1532f] text-[#ffeccd]'
      : roomStatus === 'round2-running'
        ? 'bg-[#b4007f] text-white'
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
                onClick={handlePrimaryHeaderAction}
                className="px-4 py-2 rounded-2xl border-[3px] border-[#ffeccd] text-[#ffeccd] font-semibold hover:bg-[#ffeccd]/10 transition"
              >
                {headerActionLabel}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-3xl border-[3px] border-[#b23324] bg-[#ffd7d0] px-4 py-3 text-sm font-semibold text-[#7b1d16]">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.45fr,0.55fr]">
          <div className="space-y-6">
            {showResults ? (
              roomStatus === 'finished' ? (
                <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Финальные результаты</p>
                      <h2 className="text-3xl font-black">🏆 Рейтинг Раунда 2</h2>
                    </div>
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <span className="text-sm font-semibold text-[#1f6ac6]">Очки уже начислены игрокам</span>
                        {round2Leaderboard.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              hasUserInteractedRef.current = true;
                              setIsRound3RulesVisible(true);
                            }}
                            className="px-4 py-2 rounded-2xl border-[3px] border-[#142a45] bg-[#ffe184] text-[#142a45] font-black tracking-[0.2em] hover:bg-[#142a45] hover:text-[#ffeccd] transition-colors"
                          >
                            Раунд 3
                          </button>
                        )}
                      </div>
                  </div>
                  <div className="space-y-4">
                    {round2Leaderboard.length === 0 ? (
                      <p className="text-sm text-[#142a45]/70">Рейтинг появится после завершения раунда.</p>
                    ) : (
                      <ol className="space-y-3">
                        {round2Leaderboard.map((entry, index) => (
                          <li
                            key={entry.playerId}
                            className="flex items-center justify-between rounded-2xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-4"
                          >
                            <div className="flex items-center gap-4">
                              <span className={`w-10 h-10 rounded-full border-[3px] flex items-center justify-center font-black text-lg ${
                                index === 0 ? 'border-[#f1532f] bg-[#f1532f] text-white' :
                                index === 1 ? 'border-[#b4007f] bg-[#b4007f] text-white' :
                                index === 2 ? 'border-[#1f6ac6] bg-[#1f6ac6] text-white' :
                                'border-[#142a45]/30 bg-white text-[#142a45]'
                              }`}>
                                {index + 1}
                              </span>
                              <div>
                                <p className="font-black text-[#142a45]">{entry.name}</p>
                                <p className="text-xs text-[#142a45]/70">
                                  {entry.correct}/{entry.attempts} правильных • {Math.round((entry.correct / Math.max(entry.attempts, 1)) * 100)}% точность
                                </p>
                              </div>
                            </div>
                            <span className="font-black text-2xl text-[#f1532f]">{entry.points} 💎</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border-[4px] border-[#142a45] bg-white shadow-xl p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/60">Итоги раунда</p>
                    <h2 className="text-3xl font-black">🏆 Результаты</h2>
                  </div>
                  <span className="text-sm font-semibold text-[#1f6ac6]">Очки уже начислены игрокам</span>
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRatingVisible((prev) => !prev)}
                    className={`px-4 py-2 rounded-2xl border-[3px] font-semibold transition ${
                      isRatingVisible
                        ? 'border-[#1f6ac6] bg-[#1f6ac6] text-white'
                        : 'border-[#142a45]/40 bg-white text-[#142a45]'
                    }`}
                  >
                    {isRatingVisible ? 'Скрыть рейтинг' : 'Рейтинг'}
                  </button>
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
                {isRatingVisible && (
                  <div className="rounded-2xl border-[3px] border-[#142a45]/15 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Рейтинг игроков</p>
                      <span className="text-xs font-semibold text-[#1f6ac6]">По итогам раунда</span>
                    </div>
                    {playerRatings.length === 0 ? (
                      <p className="text-sm text-[#142a45]/70">Рейтинг появится после завершения первого раунда.</p>
                    ) : (
                      <ol className="space-y-2">
                        {playerRatings.map((player, index) => (
                          <li
                            key={player.id}
                            className="flex items-center justify-between rounded-2xl border-[3px] border-[#142a45]/10 bg-[#fff6da] px-3 py-2"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-full border-[3px] border-[#142a45]/30 flex items-center justify-center font-black">
                                {index + 1}
                              </span>
                              <span className="font-semibold text-[#142a45]">{player.name}</span>
                            </div>
                            <span className="font-black text-[#f1532f]">{player.total_points} 💎</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
              )
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
            ) : isRound2Running ? (
              <div className="rounded-3xl border-[4px] border-[#b4007f] bg-white shadow-xl p-6 space-y-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="retro-heading text-xs tracking-[0.4em] text-[#b4007f]/70">Раунд 2 · «Фейколов»</p>
                    <h2 className="text-3xl font-black">⚡ Охота на фейк</h2>
                  </div>
                  <div className="flex flex-col items-start sm:items-end text-sm font-semibold text-[#b4007f]">
                    <span>
                      Факт <span className="font-black">{clampedRound2QuestionNumber}</span>/{ROUND2_TOTAL_QUESTIONS}
                    </span>
                    <span className="text-xs text-[#142a45]/70">
                      Ответили: <span className="font-black text-[#b4007f]">{answeredCount}/{totalPlayers}</span>
                    </span>
                  </div>
                </div>

                <div className="rounded-3xl border-[3px] border-[#b4007f]/20 bg-[#fff0fa] p-5 space-y-2">
                  <p className="text-[11px] tracking-[0.4em] text-[#b4007f]/60">Сейчас в эфире</p>
                  <p className="text-2xl font-black leading-snug">{round2Statement}</p>
                  <p className={`text-xs font-semibold ${round2TruthClass}`}>
                    {round2TruthLabel}
                  </p>
                </div>

                <div className="rounded-2xl border-[3px] border-[#b4007f]/25 bg-white px-4 py-3 text-sm font-semibold flex items-center justify-between">
                  <span>Награда за правильный ответ</span>
                  <span className="text-[#b4007f] font-black">+{ROUND2_POINTS} 💎</span>
                </div>

                {round2Phase === 'fact' ? (
                  <div>
                    <div className="flex justify-between text-xs text-[#142a45]/70 mb-1">
                      <span>Таймер · 30 сек</span>
                      <span className={`font-black ${serverAllPlayersAnswered ? 'text-[#b4007f]' : 'text-[#142a45]'}`}>
                        {serverAllPlayersAnswered ? 'Все проголосовали' : `${effectiveTimeLeft} c`}
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-[#ffe0f4] overflow-hidden">
                      <div
                        className={`h-full ${effectiveTimeLeft > 5 ? 'bg-[#b4007f]' : 'bg-[#f1532f]'}`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    {serverAllPlayersAnswered && (
                      <p className="text-xs text-[#b4007f] font-semibold mt-2">Можно открывать правду прямо сейчас.</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-3xl border-[3px] border-[#142a45]/15 bg-[#fff6da] p-4 space-y-2">
                    <p className="text-[11px] tracking-[0.3em] text-[#142a45]/60">Объяснение</p>
                    <p className="text-base font-semibold text-[#142a45]">
                      {round2ExplanationText}
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  {round2Phase === 'explanation' && (
                    <button
                      type="button"
                      onClick={handleRound2NextQuestion}
                      className="flex-1 py-4 rounded-2xl font-black text-lg tracking-[0.2em] bg-[#1f6ac6] text-white border-[3px] border-[#142a45]"
                    >
                      Следующий факт
                    </button>
                  )}
                </div>

                <div className="rounded-3xl border-[3px] border-dashed border-[#142a45]/30 bg-[#fff6da] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="retro-heading text-[11px] tracking-[0.4em] text-[#142a45]/70">Ответы игроков</p>
                    <span className="text-xs font-semibold text-[#b4007f]">{dedupedRound2Answers.length || 0}/{totalPlayers}</span>
                  </div>
                  {dedupedRound2Answers.length === 0 ? (
                    <p className="text-sm text-[#142a45]/70">Пока никто не сделал выбор — ждём реакции игроков.</p>
                  ) : (
                    <div className="space-y-2">
                      {dedupedRound2Answers.map((answer) => (
                        <div
                          key={answer.player_id}
                          className={`rounded-2xl border-[3px] px-3 py-2 flex items-center justify-between ${
                            answer.is_correct ? 'border-[#b4007f]/30 bg-white' : 'border-[#f1532f]/30 bg-white'
                          }`}
                        >
                          <div>
                            <p className="font-semibold">{getPlayerName(answer.player_id)}</p>
                          </div>
                          <span className={`font-black ${answer.is_correct ? 'text-[#b4007f]' : 'text-[#f1532f]'}`}>
                            {answer.is_correct ? `+${answer.points_earned}` : '+0'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {round2Phase !== 'fact' && (
                    <div className="rounded-3xl border-[3px] border-[#142a45]/15 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="retro-heading text-[11px] tracking-[0.4em] text-[#142a45]/70">Рейтинг Раунда 2</p>
                        <span className="text-xs font-semibold text-[#1f6ac6]">{round2AccuracyLabel}</span>
                      </div>
                      {round2Leaderboard.length === 0 ? (
                        <p className="text-sm text-[#142a45]/70">Как только завершится первый факт, здесь появятся очки за «Фейколов».</p>
                      ) : (
                        <ol className="space-y-2">
                          {round2Leaderboard.map((entry, index) => (
                            <li
                              key={entry.playerId}
                              className="flex items-center justify-between rounded-2xl border-[3px] border-[#142a45]/10 bg-[#fff6da] px-3 py-2"
                            >
                              <div className="flex items-center gap-3">
                                <span className="w-8 h-8 rounded-full border-[3px] border-[#142a45]/30 flex items-center justify-center font-black">
                                  {index + 1}
                                </span>
                                <div>
                                  <p className="font-semibold text-[#142a45]">{entry.name}</p>
                                  <p className="text-xs text-[#142a45]/70">
                                    {entry.correct}/{entry.attempts} верно
                                  </p>
                                </div>
                              </div>
                              <span className="font-black text-[#b4007f]">
                                {entry.points > 0 ? `+${entry.points}` : '+0'} 💎
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
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
                  {isLastQuestion ? 'Итоги' : 'Следующий вопрос'}
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
                <p className="text-sm text-[#142a45]/70">Все вопросы уже прозвучали. Нажмите «Итоги», чтобы подвести результаты.</p>
              </div>
            )}

            <div className="rounded-3xl border-[4px] border-dashed border-[#142a45]/40 bg-[#fff6da] p-5 space-y-2">
              <p className="retro-heading text-[11px] tracking-[0.5em] text-[#142a45]/70">Монитор ответов</p>
              {showResults ? (
                <p className="text-sm text-[#142a45]/80">Все ответы расшифрованы выше. Используйте карточки, чтобы обсудить вопросы и напомнить правила.</p>
              ) : isWaiting ? (
                <p className="text-sm text-[#142a45]/80">Ответы появятся, когда стартует раунд. Пока наблюдайте за количеством игроков.</p>
              ) : isRound2Running ? (
                <p className="text-sm text-[#142a45]/80">
                  Игроки ловят фейк: {answeredCount}/{totalPlayers} уже ответили. Ниже показаны их выборы и кто попал в цель.
                </p>
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
                <span className="text-sm font-semibold text-[#1f6ac6]">
                  {roomStatus === 'running' ? 'Раунд 1'
                    : roomStatus === 'round2-running' ? 'Раунд 2'
                      : 'Подготовка'}
                </span>
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
                            {roomStatus === 'running' && question ? (
                              <p className={`text-xs font-semibold ${hasAnswered ? 'text-[#1f6ac6]' : 'text-[#142a45]/50'}`}>
                                {hasAnswered ? 'Ответ получен' : 'Ждём ответ'}
                              </p>
                            ) : roomStatus === 'round2-running' ? (
                              <p className={`text-xs font-semibold ${hasAnswered ? 'text-[#b4007f]' : 'text-[#142a45]/50'}`}>
                                {hasAnswered ? 'Выбор сделан' : 'Ждём выбор'}
                              </p>
                            ) : null}
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
          <p className="text-sm uppercase tracking-[0.5em] text-[#ffeccd]/70 mb-4">
            {countdownContext === 'round2' ? 'Запуск Раунда 2' : countdownContext === 'round3' ? 'Запуск Раунда 3' : 'Запуск раунда'}
          </p>
          <div className="text-7xl sm:text-8xl font-black drop-shadow-lg">
            {countdownValue.toUpperCase()}
          </div>
          <p className="mt-6 text-sm text-[#ffeccd]/80">
            {countdownContext === 'round2'
              ? 'Фейколов уже на подходе — готовим новое утверждение для игроков.'
              : countdownContext === 'round3'
                ? 'Готовимся к мозговому штурму — скоро включим следующий этап.'
              : 'Звук уже пошёл — готовим вопросы на экране игроков.'}
          </p>
        </div>
      )}

      {isRound3RulesVisible && (
        <div className="fixed inset-0 z-50 bg-[#142a45]/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="max-w-lg w-full rounded-3xl border-[4px] border-[#142a45] bg-[#fff6da] p-6 space-y-4 shadow-2xl">
            <div>
              <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Раунд 3 · «МозгоШтурм»</p>
              <h3 className="text-2xl font-black text-[#142a45]">Правила</h3>
            </div>
            <div className="text-sm text-[#142a45]/80 whitespace-pre-line leading-relaxed">{ROUND3_RULES_TEXT}</div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => void startRound3Countdown()}
                className="w-full py-3 rounded-2xl font-black text-lg tracking-[0.3em] bg-[#142a45] text-[#ffeccd] border-[3px] border-[#142a45]"
              >
                Старт
              </button>
              <button
                type="button"
                onClick={() => setIsRound3RulesVisible(false)}
                className="w-full py-3 rounded-2xl border-[3px] border-dashed border-[#142a45] bg-white font-semibold text-[#142a45]"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {isRound2RulesVisible && (
        <div className="fixed inset-0 z-50 bg-[#142a45]/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="max-w-lg w-full rounded-3xl border-[4px] border-[#142a45] bg-[#fff6da] p-6 space-y-4 shadow-2xl">
            <div>
              <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">Раунд 2 · «Фейколов»</p>
              <h3 className="text-2xl font-black text-[#142a45]">Правда или выдумка</h3>
            </div>
            <ul className="text-sm text-[#142a45]/80 space-y-2">
              <li>• На экранах игроков появляется утверждение. Нужно выбрать «Правда» или «Вымысел».</li>
              <li>• На каждое утверждение даём 30 секунд. После сигнала открываем объяснение.</li>
              <li>• Точное попадание приносит <span className="font-black text-[#b4007f]">+{ROUND2_POINTS}💎</span>. Неверный ответ — 0.</li>
            </ul>
            <div className="space-y-3">
              <button
                type="button"
                onClick={startRound2}
                disabled={round2Items.length === 0}
                className="w-full py-3 rounded-2xl font-black text-lg tracking-[0.3em] bg-[#b4007f] text-white border-[3px] border-[#142a45] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Запустить Раунд 2
              </button>
              <button
                type="button"
                onClick={() => setIsRound2RulesVisible(false)}
                className="w-full py-3 rounded-2xl border-[3px] border-dashed border-[#142a45] bg-white font-semibold text-[#142a45]"
              >
                Отмена
              </button>
            </div>
            {round2Items.length === 0 && (
              <p className="text-xs text-[#b23324] font-semibold">Факты ещё загружаются — подождите пару секунд.</p>
            )}
          </div>
        </div>
      )}
    </Fragment>
  );
}
