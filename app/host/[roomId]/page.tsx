'use client';

import { Fragment, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, useReducer, type CSSProperties, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { logError, logEvent } from '@/shared/logic/logger';
import {
  TrueFalseItem,
  ROUND2_POINTS,
  normalizeTrueFalseItems,
  filterTrueFalseItemsForPack,
  resolveRound2AudioOrdinal,
} from '@/lib/round2';
import { Round1VariantsPanel, Round1VariantsPanelHandle } from '@/components/Round1VariantsPanel';
import { AnimatedText } from '@/components/AnimatedText';
import { useRoomSync } from '@/lib/useRoomSync';
import { roundStateReducer } from '@/lib/roundStateMachine';
import { WinnerBanner } from '@/shared/ui/WinnerBanner';
import { BestQuestionCard } from '@/shared/ui/BestQuestionCard';
import { JoinQrBlock } from '@/shared/ui/JoinQrBlock';
import { QRCodeCanvas } from 'qrcode.react';
import { isRealtimeEnabled } from '@/shared/logic/realtimeConfig';
import { ROUND3_ANSWER_SECONDS, ROUND3_VOTE_COUNTDOWN_SECONDS, ROUND3_VOTE_SECONDS } from '@/shared/logic/roundConstants';
import {
  buildRound2LikeId,
  buildRound3LikeId,
  buildRound4LikeId,
  buildRound5LikeId,
  describeLikeQuestionId,
  parseLikeQuestionId,
} from '@/shared/logic/questionLikes';
import {
  ActiveRoundQuestion,
  OptionKey,
  OPTION_LABELS,
  ROUND_QUESTION_COUNT,
  createQuestionBank,
  DEFAULT_QUESTION_BANK,
  type QuestionBank,
  buildQuestionsFromSelection,
  getQuestionById,
  getOptionIndexFromKey,
  getOptionKeyByIndex,
  getQuestionForIndex,
  hasEnoughQuestions,
  pickRandomQuestionIds,
} from '@/lib/questions';
import {
  DEFAULT_PACK_ID,
  getQuestionsBaseUrl,
  getRound2QuestionUrls,
  normalizePackId,
  type PackId,
  withAudioPackPrefixIfNeeded,
} from '@/lib/questionPacks';

const QUESTION_DURATION_SECONDS = 30;
const ROUND1_TOTAL_QUESTIONS = 6;
const COUNTDOWN_STEPS = ['На старт', 'Внимание', '3', '2', '1', 'Старт'] as const;
const AUTO_NEXT_DELAY_MS = 6000;
const ROUND1_VARIANTS_OUTRO_MS = 950;

type PillAnimationStyle = CSSProperties & {
  ['--pill-left']?: string;
  ['--pill-top']?: string;
  ['--pill-duration']?: string;
};

type LocalRoundPhase = 'loading' | 'waiting' | 'question' | 'transition' | 'calculating' | 'results';
type ConnectionMode = 'realtime' | 'polling';
const JOIN_SOUND_FILES = [
  'sound/The_duck_quacked_fun_#1.mp3',
  'sound/The_duck_quacked_fun_#2.mp3',
  'sound/The_duck_quacked_fun_#3.mp3',
  'sound/The_duck_quacked_fun_#4.mp3',
  'sound/The_duk_quacked_funn_#1.mp3',
  'sound/The_duk_quacked_funn_#2.mp3',
  'sound/The_duk_quacked_funn_#3.mp3',
  'sound/The_duk_quacked_funn_#4.mp3',
] as const;

const ANSWER_DUCK_AUDIO_FILES: readonly string[] = Array.from({ length: 7 }, (_, i) => `duck/${i + 1}.mp3`);
const QUESTION_JINGLE_FILE = 'sound/30_sec.mp3';
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
const RULES_ROUND1_FILES = ['round1/rules/ruelsround(1)2.mp3', 'round1/rules/ruelsround(1)3.mp3'] as const;
const SKIP_AUDIO_FILES = [
  'skip/skip.mp3',
  'skip/skip2.mp3',
  'skip/skip4.mp3',
  'skip/skip5.mp3',
  'skip/skip6.mp3',
  'skip/skip7.mp3',
  'skip/skip8.mp3',
] as const;
const ROUND1_END_AUDIO_FILES: readonly string[] = Array.from({ length: 9 }, (_, i) => `round1end/${i + 1}.mp3`);
const ROUND1_END_JINGLE_FILE = 'round1_end/jingle_(after_round1).mp3';
const ROUND2_END_AUDIO_FILES: readonly string[] = Array.from({ length: 3 }, (_, i) => `round2end/${i + 1}.mp3`);
const ROUND2_RULES_JINGLE_FILE = 'round2/explanation.mp3';
const ROUND2_RULES_VOICE_FILES = ['round2/ruels/1.mp3', 'round2/ruels/2.mp3'] as const;
const ROUND2_BETWEEN_AUDIO_VARIANTS = {
  full: ['round1/between/100%/1.mp3', 'round1/between/100%/2.mp3', 'round1/between/100%/3.mp3', 'round1/between/100%/4.mp3'],
  mid: ['round1/between/50-99%/1.mp3', 'round1/between/50-99%/2.mp3', 'round1/between/50-99%/3.mp3', 'round1/between/50-99%/4.mp3'],
  low: ['round1/between/1-49%/1.mp3', 'round1/between/1-49%/2.mp3', 'round1/between/1-49%/3.mp3', 'round1/between/1-49%/4.mp3'],
  none: ['round1/between/0%/1.mp3', 'round1/between/0%/2.mp3', 'round1/between/0%/3.mp3'],
  zero: ['round1/between/0%/1.mp3', 'round1/between/0%/2.mp3', 'round1/between/0%/3.mp3'],
} as const;
const BETWEEN_AUDIO_VARIANTS = ROUND2_BETWEEN_AUDIO_VARIANTS;
const ROUND2_EXPLANATION_BG_FILE = 'round2/explanation.mp3';
const ROUND2_ANSWER_POLL_INTERVAL_MS = 1000;
const ROUND2_TOTAL_QUESTIONS = ROUND_QUESTION_COUNT;
const ROUND2_EXPLANATION_FALLBACK = 'Без объяснения';

const ROUND3_TOTAL_QUESTIONS = 6;
const ROUND3_POINTS = 200;
const ROUND3_QUESTIONS_AUDIO_DIR = 'round3/questions3';
const ROUND3_BG_JINGLE_FILE = 'round2/jingle (5).mp3';
const ROUND3_ANSWER_TIMER_JINGLE_FILE = 'round3/60_sec.mp3';
const ROUND3_VOTE_TIMER_JINGLE_FILE = 'sound/30_sec.mp3';
const ROUND3_TIMER_JINGLE_FILE = ROUND3_ANSWER_TIMER_JINGLE_FILE;
const ROUND3_VOTE_AUDIO_DIR = 'round3/vote';
const ROUND3_COMMENTS_AUDIO_DIR = 'round3/comments';
const ROUND3_RESULTS_BG_FILE = 'round2/explanation.mp3';
const ROUND3_BG_VOLUME = 0.25;
const ROUND3_TIMER_VOLUME = 0.6;
const ROUND3_VOTE_LIKE_POINTS = 50;
const ROUND3_VOTE_SKIP_PENALTY = 50;
const ROUND3_END_AFTER_AUDIO_DIR = 'round3end/after';
const ROUND3_RULES_VOICE_FILES = ['round3/ruels3/ruels1.mp3', 'round3/ruels3/ruels2.mp3', 'round3/ruels3/ruels3.mp3'] as const;
const ROUND5_RULES_VOICE_FILES: readonly string[] = Array.from({ length: 5 }, (_, i) => `round5/ruels/${i + 1}.mp3`);
const ROUND3_RULES_TEXT =
  'Раунд «МозгоШтурм»\n\n' +
  'Перед вами появятся 6 интересных фактов с одним пропущенным словом.\n\n' +
  'Ваша задача:\n\n' +
  'Ввести в поле на телефоне то слово, которое идеально подходит (одно слово, без дефисов, пробелов и знаков).\n' +
  'После каждого тура на экране появятся ответы всех игроков.\n' +
  'Каждый выбирает понравившийся ответ (кроме своего).\n\n' +
  'Подсчёт очков:\n\n' +
  'Угадал точное слово — 200 очков.\n' +
  'За каждый голос за ваш ответ — +50 очков.\n' +
  'Не проголосовал — −50 очков.\n\n' +
  `Время на ввод ответа — ${ROUND3_ANSWER_SECONDS} секунд.\n` +
  `Время на голосование — ${ROUND3_VOTE_SECONDS} секунд.\n` +
  'Синонимы могут засчитаться (на усмотрение ведущего).\n\n' +
  'Готовы угадывать и голосовать? Давайте устроим настоящий мозговой штурм!';
const ROUND4_RULES_VOICE_FILES = ['round4/rules/1.mp3', 'round4/rules/2.mp3', 'round4/rules/3.mp3'] as const;
const ROUND4_RULES_TEXT =
  'Раунд «Дэшифровщик»\n\n' +
  'На экране появляется комбинация из эмодзи, в которых зашифровано название известного фильма, мультфильма, сериала, песни или чего-то очень знаменитого.\n' +
  'Задача игроков: как можно быстрее вписать правильное название в поле ввода.\n\n' +
  'Начисление баллов:\n' +
  '• Первый ответивший правильно получает 100 баллов.\n' +
  '• Последующие правильные ответы получают 50 баллов.\n' +
  '• Таймер — 30 секунд.';

const ROUND5_RULES_TEXT =
  'Вам будут даны 6 фактов с числовыми значениями (например, "Высота Эйфелевой башни — [число] метров").\n\n' +
  'Ваша задача — ввести точное число в поле на телефоне.\n\n' +
  'Точное совпадение: 400 очков.\n' +
  'Неточное: баллы = 400 * (100 - отклонение%) / 100, где отклонение% = |правильное - ваш ответ| / правильное * 100% (округление до целого).\n\n' +
  'Если отклонение >= 100% (ответ <= 0 или >= 2*правильное) — 0 очков.\n\n' +
  'Время на вопрос: 30 секунд.\n\n' +
  'Готовы к цифровой интуиции?';

const ROUND4_TOTAL_TOURS = 6;

const ROUND5_TOTAL_TOURS = 6;
const ROUND5_MAX_POINTS = 400;
const ROUND5_QUESTION_AUDIO_DIR = 'round5/questions';
const ROUND5_EXPLANATION_AUDIO_DIR = 'round5/explanation';
const ROUND5_FINAL_NARRATOR_AUDIO_DIR = 'round5/final';
const ROUND5_FINAL_NARRATOR_VARIANTS = 7;

const PACK_03012026_ROUND2_AUDIO_START = 82;
const PACK_03012026_ROUND3_AUDIO_START = 67;
const PACK_03012026_ROUND5_AUDIO_START = 68;

const ROUND4_CATEGORY_AUDIO_MAP: Record<string, string> = {
  'новый год': 'new_year',
  дисней: 'disney',
  'американский кинематограф': 'american_cinema',
  'американские мультфильмы': 'american_cartoons',
  сериалы: 'series',
  'зарубежная эстрада': 'foreign_bandstand',
  'русский рок': 'russian_rock',
  'советская эстрада': 'soviet_bandstand',
  'советский мультфильм': 'soviet_cartoon',
  'советский кинематограф': 'soviet_cinema',
  классика: 'classic',
  сказка: 'fairy_tale',
  'современная отечественная эстрада': 'modern_russian_bandstand',
  'русская литература': 'russian_literature',
};

const ROUND4_CATEGORY_VARIANTS: Record<string, number> = {
  soviet_cinema: 1,
};

const buildAudioUrl = (relativePath: string) => `/api/audio?file=${encodeURIComponent(relativePath)}&t=${Date.now()}`;

const buildJingleUrl = buildAudioUrl;

const getRemainingSeconds = (startedAt: string | null, durationSeconds: number, offsetMs = 0): number => {
  if (!startedAt) {
    return durationSeconds;
  }
  const startTime = new Date(startedAt).getTime();
  if (Number.isNaN(startTime)) {
    return durationSeconds;
  }
  const now = Date.now() - offsetMs;
  const diffMs = now - startTime;
  const elapsedSeconds = Math.floor(diffMs / 1000);
  return Math.max(0, durationSeconds - elapsedSeconds);
};

const pickRandomItem = <T,>(items: readonly T[]): T => {
  return items[Math.floor(Math.random() * items.length)];
};

const shuffleArray = <T,>(arr: T[]): T[] => {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const renderRound3CorrectAnswerExcerpt = (_question: string, answer: string): string => answer;

const renderRound3WrongAnswerExcerpt = (_question: string, wrongAnswer: string): string => wrongAnswer;

const normalizeRound3FreeText = (value: string) =>
  value
    .toLowerCase()
    .replace('ё', 'е')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeRound4Answer = (value: string) => normalizeRound3FreeText(value);

type AnswerInsertPayload = {
  new: {
    player_id: string;
    room_id: string;
    question_index: number;
    answer_key: string | null;
    is_correct: boolean | null;
    points_earned: number | null;
    submitted_at: string;
  };
};

type Round2AnswerInsertPayload = {
  new: {
    player_id: string;
    room_id: string;
    item_index: number;
    answer_is_fact: boolean;
    is_correct: boolean;
    points_earned: number;
    submitted_at: string;
  };
};

type Round4AnswerInsertPayload = {
  new: {
    player_id: string;
    room_id: string;
    puzzle_id: number;
    answer_text: string;
    is_correct: boolean;
    points_earned: number;
    submitted_at: string;
  };
};

type TweenedIntegerProps = {
  from: number;
  to: number;
  durationMs: number;
  delayMs?: number;
};

const TweenedInteger = ({ from, to, durationMs, delayMs = 0 }: TweenedIntegerProps) => {
  const [value, setValue] = useState(from);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const current = Math.round(from + (to - from) * progress);
        setValue(current);
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }, delayMs);
    return () => clearTimeout(timeout);
  }, [from, to, durationMs, delayMs]);

  return <>{value}</>;
};

type RoundPointsLeaderboardEntry = {
  playerId: string;
  name: string;
  points: number;
};

type Round3ScoredAnswer = {
  playerId: string;
  text: string;
  isCorrect: boolean;
  basePoints: number;
  votePoints: number;
  votes: number;
  pointsEarned: number;
};

type Round5Question = {
  question: string;
  answer: number;
  explanation: string;
};

type Round5AnswerRow = {
  id: string;
  player_id: string;
  answer_value: number;
  points_earned: number;
  submitted_at: string;
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

type Question = ActiveRoundQuestion;

type Player = {
  id: string;
  name: string;
  total_points: number;
};

type Round4Puzzle = {
  id: number;
  category: string;
  emoji: string;
  answers: string[];
};

type Round4AnswerRow = {
  id: string;
  player_id: string;
  puzzle_id: number;
  answer_text: string;
  is_correct: boolean;
  points_earned: number;
  submitted_at: string;
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

type Round3AnswerRowWithIndex = Round3AnswerRow & { question_index: number };

type Round3VoteRow = {
  voter_player_id: string;
  answer_id: string;
};

type Round3VoteRowWithIndex = Round3VoteRow & { question_index: number };

type Round2Phase = 'idle' | 'fact' | 'explanation';

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

type HostLayoutMode = 'default' | 'compact' | 'stacked' | 'mobile';

const HostControls = ({
  primaryLabel,
  onPrimaryAction,
  onOpenQr,
  onToggleLayout,
  layoutLabel,
  compact,
  showDonate = true,
  isAnimationsDisabled,
  onToggleAnimations,
  isMusicMuted,
  onToggleMusicMute,
  isVoiceMuted,
  onToggleVoiceMute,
}: {
  primaryLabel: string;
  onPrimaryAction: () => void;
  onOpenQr?: () => void;
  onToggleLayout: () => void;
  layoutLabel: string;
  compact?: boolean;
  showDonate?: boolean;
  isAnimationsDisabled?: boolean;
  onToggleAnimations?: () => void;
  isMusicMuted?: boolean;
  onToggleMusicMute?: () => void;
  isVoiceMuted?: boolean;
  onToggleVoiceMute?: () => void;
}) => (
  <div className="flex flex-wrap gap-3">
    <button
      type="button"
      onClick={onPrimaryAction}
      className={`${
        compact
          ? 'px-3 py-2 comic-panel border-[4px] text-xs tracking-[0.14em]'
          : 'px-5 py-3 comic-panel text-base tracking-[0.2em]'
      } border-[#000] text-white comic-font hover:bg-[#ffde00]/10 transition`}
    >
      {primaryLabel}
    </button>
    {onOpenQr ? (
      <button
        type="button"
        onClick={onOpenQr}
        className={`${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} comic-panel border-[4px] border-[#000] text-white comic-font hover:bg-[#ffde00]/10 transition`}
        title="Открыть QR для подключения"
      >
        QR
      </button>
    ) : null}
    <button
      type="button"
      onClick={onToggleLayout}
      className={`${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} comic-panel border-[4px] border-[#000] text-white comic-font hover:bg-[#ffde00]/10 transition`}
      title="Не нравится текущий вид? Нажмите, чтобы переключить отображение"
    >
      Вид: {layoutLabel}
    </button>
    {onToggleMusicMute && (
      <button
        type="button"
        onClick={onToggleMusicMute}
        className={`${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} comic-panel border-[4px] border-[#000] transition ${isMusicMuted ? 'bg-red-500 text-white' : 'text-white hover:bg-[#ffde00]/10'}`}
        title={isMusicMuted ? 'Включить музыку' : 'Выключить музыку'}
      >
        🎵
      </button>
    )}
    {onToggleVoiceMute && (
      <button
        type="button"
        onClick={onToggleVoiceMute}
        className={`${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} comic-panel border-[4px] border-[#000] transition ${isVoiceMuted ? 'bg-red-500 text-white' : 'text-white hover:bg-[#ffde00]/10'}`}
        title={isVoiceMuted ? 'Включить озвучку' : 'Выключить озвучку'}
      >
        🎤
      </button>
    )}
    {onToggleAnimations && (
      <button
        type="button"
        onClick={onToggleAnimations}
        className={`${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} comic-panel border-[4px] border-[#000] transition ${isAnimationsDisabled ? 'bg-yellow-400 text-black' : 'text-white hover:bg-[#ffde00]/10'}`}
        title={isAnimationsDisabled ? 'Включить анимации' : 'Выключить анимации'}
      >
        ✨
      </button>
    )}
    {showDonate ? (
      <a
        href="https://donatty.com/aleksandri"
        target="_blank"
        rel="noopener noreferrer"
        className={`${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'
        } comic-panel bg-[#ff2a2a] text-white comic-font border-[4px] border-[#000] hover:scale-105 transition-all duration-200 text-center`}
      >
        Поддержать
      </a>
    ) : null}
  </div>
);

const MirrorControls = ({
  compact,
  isAnimationsDisabled,
  onToggleAnimations,
  isMusicMuted,
  onToggleMusicMute,
  isVoiceMuted,
  onToggleVoiceMute,
}: {
  compact?: boolean;
  isAnimationsDisabled?: boolean;
  onToggleAnimations?: () => void;
  isMusicMuted?: boolean;
  onToggleMusicMute?: () => void;
  isVoiceMuted?: boolean;
  onToggleVoiceMute?: () => void;
}) => (
  <div className="flex flex-wrap gap-3 items-center">
    <span className={`${compact ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm'} comic-panel border-[4px] border-[#000] bg-purple-600 text-white comic-font tracking-[0.2em] animate-pulse`}>📡 ЗЕРКАЛО</span>
    {onToggleMusicMute && (
      <button
        type="button"
        onClick={onToggleMusicMute}
        className={`${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} comic-panel border-[4px] border-[#000] transition ${isMusicMuted ? 'bg-red-500 text-white' : 'text-white hover:bg-[#ffde00]/10'}`}
        title={isMusicMuted ? 'Включить музыку' : 'Выключить музыку'}
      >
        🎵
      </button>
    )}
    {onToggleVoiceMute && (
      <button
        type="button"
        onClick={onToggleVoiceMute}
        className={`${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} comic-panel border-[4px] border-[#000] transition ${isVoiceMuted ? 'bg-red-500 text-white' : 'text-white hover:bg-[#ffde00]/10'}`}
        title={isVoiceMuted ? 'Включить озвучку' : 'Выключить озвучку'}
      >
        🎤
      </button>
    )}
    {onToggleAnimations && (
      <button
        type="button"
        onClick={onToggleAnimations}
        className={`${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} comic-panel border-[4px] border-[#000] transition ${isAnimationsDisabled ? 'bg-yellow-400 text-black' : 'text-white hover:bg-[#ffde00]/10'}`}
        title={isAnimationsDisabled ? 'Включить анимации' : 'Выключить анимации'}
      >
        ✨
      </button>
    )}
    <a
      href="https://donatty.com/aleksandri"
      target="_blank"
      rel="noopener noreferrer"
      className={`${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} comic-panel bg-[#ff2a2a] text-white comic-font border-[4px] border-[#000] hover:scale-105 transition-all duration-200 text-center`}
    >
      Поддержать
    </a>
  </div>
);

const PlayersAccordion = ({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) => (
  <details className="comic-panel border-[#000] bg-white ">
    <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between">
      <span className="comic-font text-xs tracking-[0.35em] text-black/60">{title}</span>
      <span className="text-sm comic-font">{count}</span>
    </summary>
    <div className="px-4 pb-4 pt-1">{children}</div>
  </details>
);

const QuestionView = ({ children }: { children: ReactNode }) => (
  <section className="comic-panel border-[#000] bg-white  p-4 space-y-3">
    {children}
  </section>
);

const AnswersView = ({ children }: { children: ReactNode }) => (
  <section className="comic-panel border-[#000]/20 bg-white p-4 space-y-2">
    <p className="comic-font text-[10px] tracking-[0.35em] text-black/60">ОТВЕТЫ</p>
    {children}
  </section>
);

const LikesView = ({ children }: { children: ReactNode }) => (
  <section className="comic-panel border-[#000]/20 bg-white p-4 space-y-2">
    <p className="comic-font text-[10px] tracking-[0.35em] text-black/60">ЛАЙКИ</p>
    {children}
  </section>
);

const HostMobileLayout = ({
  questionView,
  answersView,
  likesView,
  extraView,
  playersView,
  controlsView,
}: {
  questionView: ReactNode;
  answersView: ReactNode;
  likesView: ReactNode;
  extraView?: ReactNode;
  playersView: ReactNode;
  controlsView: ReactNode;
}) => (
  <div className="flex flex-col gap-3">
    <div className="comic-panel border-[#000] bg-[#ff2a2a] text-white p-3">
      {controlsView}
    </div>
    {questionView}
    {answersView}
    {likesView}
    {extraView}
    {playersView}
  </div>
);

const HostStackedLayout = ({
  controlsView,
  questionView,
  stateView,
  answersView,
  likesView,
  extraView,
  playersView,
}: {
  controlsView: ReactNode;
  questionView: ReactNode;
  stateView: ReactNode;
  answersView: ReactNode;
  likesView: ReactNode;
  extraView?: ReactNode;
  playersView: ReactNode;
}) => (
  <div className="flex flex-col gap-4">
    <div className="comic-panel border-[#000] bg-[#ff2a2a] text-white p-4 ">
      {controlsView}
    </div>
    {questionView}
    {stateView}
    {answersView}
    {likesView}
    {extraView}
    {playersView}
  </div>
);

export function HostRoomContent({ isMirror = false }: { isMirror?: boolean }) {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [layoutMode, setLayoutMode] = useState<HostLayoutMode>('default');
  const [forcedLayoutScale, setForcedLayoutScale] = useState(1);
  const [showMobilePrompt, setShowMobilePrompt] = useState(false);
  const [isJoinQrModalOpen, setIsJoinQrModalOpen] = useState(false);

  useEffect(() => {
    try {
      const storedMode = localStorage.getItem('hostLayoutMode') as HostLayoutMode | null;
      if (storedMode === 'default' || storedMode === 'compact' || storedMode === 'stacked' || storedMode === 'mobile') {
        setLayoutMode(storedMode);
        return;
      }
      const legacyCompact = localStorage.getItem('forceDesktopLayout') === '1';
      if (legacyCompact) {
        setLayoutMode('compact');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const computeScale = () => {
      if (layoutMode !== 'compact') {
        setForcedLayoutScale(1);
        return;
      }

      // Compact mode for SmartTV/tablets that show desktop grid but keep large fonts.
      // zoom is widely supported in Chromium-based browsers and many WebViews.
      const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const height = typeof window !== 'undefined' ? window.innerHeight : 800;
      const minSide = Math.min(width, height);
      const maxSide = Math.max(width, height);

      // Heuristic: smaller screens need more compact UI.
      // Also keep it slightly compact even on large TVs where fonts can render huge.
      const nextRaw =
        minSide < 650
          ? 0.74
          : minSide < 800
            ? 0.78
            : minSide < 1000
              ? 0.84
              : maxSide < 1400
                ? 0.88
                : 0.92;
      const next = Math.min(1, Math.max(0.7, Math.round(nextRaw * 100) / 100));
      setForcedLayoutScale(next);
    };

    computeScale();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', computeScale);
      window.addEventListener('orientationchange', computeScale);
      return () => {
        window.removeEventListener('resize', computeScale);
        window.removeEventListener('orientationchange', computeScale);
      };
    }

    return;
  }, [layoutMode]);

  useEffect(() => {
    if (layoutMode === 'mobile') {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    if (window.innerWidth >= 768) {
      return;
    }
    try {
      if (localStorage.getItem('hostMobilePrompted') === '1') {
        return;
      }
    } catch {
      // ignore
    }
    setShowMobilePrompt(true);
  }, [layoutMode]);

  const setNextLayoutMode = () => {
    setLayoutMode((prev) => {
      const next: HostLayoutMode =
        prev === 'default' ? 'compact' : prev === 'compact' ? 'stacked' : prev === 'stacked' ? 'mobile' : 'default';
      try {
        localStorage.setItem('hostLayoutMode', next);
        localStorage.setItem('forceDesktopLayout', next === 'compact' ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  const switchToMobileLayout = () => {
    setLayoutMode('mobile');
    setShowMobilePrompt(false);
    try {
      localStorage.setItem('hostLayoutMode', 'mobile');
      localStorage.setItem('hostMobilePrompted', '1');
    } catch {
      // ignore
    }
  };

  const dismissMobilePrompt = () => {
    setShowMobilePrompt(false);
    try {
      localStorage.setItem('hostMobilePrompted', '1');
    } catch {
      // ignore
    }
  };

  const [packId, setPackId] = useState<PackId>(DEFAULT_PACK_ID);
  const packIdRef = useRef<PackId>(DEFAULT_PACK_ID);
  const [isPackReady, setIsPackReady] = useState(true);
  const round1BankRef = useRef<QuestionBank>(DEFAULT_QUESTION_BANK);

  const buildAudioUrl = useCallback((relativePath: string) => {
    const resolved = withAudioPackPrefixIfNeeded(packIdRef.current, relativePath);
    return `/api/audio?file=${encodeURIComponent(resolved)}&t=${Date.now()}`;
  }, []);

  useEffect(() => {
    packIdRef.current = packId;
  }, [packId]);

  const getRound1AudioPath = (questionId: number) =>
    packIdRef.current === '03012026'
      ? `packs/03012026/round1/${questionId}.mp3`
      : `round1/questions/${questionId}.mp3`;

  const getRound2AudioOrdinal = (index: number, isFact: boolean) => {
    const item = round2ItemsRef.current[index];
    return resolveRound2AudioOrdinal(item, index, packIdRef.current, isFact);
  };

  const getRound3AudioOrdinal = (index: number) =>
    packIdRef.current === '03012026' ? PACK_03012026_ROUND3_AUDIO_START + index : index + 1;

  const getRound5AudioOrdinal = (index: number) =>
    packIdRef.current === '03012026' ? PACK_03012026_ROUND5_AUDIO_START + index : index + 1;

  useEffect(() => {
    let cancelled = false;

    const loadPackQuestions = async () => {
      if (packId === 'classic') {
        round1BankRef.current = DEFAULT_QUESTION_BANK;
        setIsPackReady(true);
        return;
      }

      setIsPackReady(false);
      try {
        const url = `${getQuestionsBaseUrl(packId)}/round1.json?t=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Round1 questions fetch failed (${res.status} ${res.statusText})`);
        }
        const payload = (await res.json()) as unknown;
        const bank = createQuestionBank(payload);
        round1BankRef.current = bank;
        if (!cancelled) {
          setIsPackReady(true);
        }
      } catch (err) {
        console.error('Failed to load question pack round1 bank', err);
        if (!cancelled) {
          setIsPackReady(false);
        }
      }
    };

    void loadPackQuestions();

    return () => {
      cancelled = true;
    };
  }, [packId]);

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
  const [currentQuestionLikes, setCurrentQuestionLikes] = useState<number | null>(null);
  const [bestQuestion, setBestQuestion] = useState<{ id: number; likes: number; text: string } | null>(null);
  const [round4Puzzles, setRound4Puzzles] = useState<Round4Puzzle[]>([]);
  const [round4CurrentPuzzle, setRound4CurrentPuzzle] = useState<Round4Puzzle | null>(null);
  const [round4AskedIds, setRound4AskedIds] = useState<number[]>([]);
  const [round4AnswerRows, setRound4AnswerRows] = useState<Round4AnswerRow[]>([]);
  const [isRound4Scoring, setIsRound4Scoring] = useState(false);
  const [round5Questions, setRound5Questions] = useState<Round5Question[]>([]);
  const [round5CurrentQuestion, setRound5CurrentQuestion] = useState<Round5Question | null>(null);
  const [round5CurrentBankIndex, setRound5CurrentBankIndex] = useState<number | null>(null);
  const [isRound5Scoring, setIsRound5Scoring] = useState(false);
  const [round5AnswerRows, setRound5AnswerRows] = useState<Round5AnswerRow[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('waiting');
  const [lastActiveRound, setLastActiveRound] = useState<RoomStatus>('waiting');
  const [serverAllPlayersAnswered, setServerAllPlayersAnswered] = useState(false);
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [isLobbySoundOn, setIsLobbySoundOn] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [isJoinSoundEnabled, setIsJoinSoundEnabled] = useState(true);
  const [isPrestartVisible, setIsPrestartVisible] = useState(false);
  const [isRulesVisible, setIsRulesVisible] = useState(false);
  const [isCountdownVisible, setIsCountdownVisible] = useState(false);
  const [countdownContext, setCountdownContext] = useState<'round1' | 'round2' | 'round3' | 'round4' | 'round5'>('round1');
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
  const [isRound4RulesVisible, setIsRound4RulesVisible] = useState(false);
  const [isRound5RulesVisible, setIsRound5RulesVisible] = useState(false);
  const [isRound5RulesAudioPlaying, setIsRound5RulesAudioPlaying] = useState(false);
  const [isFinalRoundAvailable, setIsFinalRoundAvailable] = useState(false);
  const [round3Questions, setRound3Questions] = useState<Round3Question[]>([]);
  const [round2Answers, setRound2Answers] = useState<Round2AnswerRow[]>([]);
  const [round2AskedIndices, setRound2AskedIndices] = useState<number[]>([]);
  const [round2QuestionCounter, setRound2QuestionCounter] = useState(0);
  const [round2Leaderboard, setRound2Leaderboard] = useState<Round2LeaderboardEntry[]>([]);
  const [round2LastAccuracy, setRound2LastAccuracy] = useState(0);
  const [isRatingVisible, setIsRatingVisible] = useState(false);
  const [round3AudioBlocked, setRound3AudioBlocked] = useState(false);
  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isAnimationsDisabled, setIsAnimationsDisabled] = useState(false);

  useEffect(() => {
    setIsMusicMuted(localStorage.getItem('host_bgm_muted') === 'true');
    setIsVoiceMuted(localStorage.getItem('host_voice_muted') === 'true');
    setIsAnimationsDisabled(localStorage.getItem('host_animations_disabled') === 'true');
  }, []);
  const [round3VoteAnswers, setRound3VoteAnswers] = useState<Round3AnswerRow[]>([]);
  const [isRound3VoteAnswersLoading, setIsRound3VoteAnswersLoading] = useState(false);
  const [round3ScoredAnswers, setRound3ScoredAnswers] = useState<Round3ScoredAnswer[]>([]);
  const [round3RoundLeaderboard, setRound3RoundLeaderboard] = useState<RoundPointsLeaderboardEntry[]>([]);
  const [round4RoundLeaderboard, setRound4RoundLeaderboard] = useState<RoundPointsLeaderboardEntry[]>([]);
  const [round5RoundLeaderboard, setRound5RoundLeaderboard] = useState<RoundPointsLeaderboardEntry[]>([]);
  const [round3SkippedVoterIds, setRound3SkippedVoterIds] = useState<string[]>([]);
  const [round3VotersCount, setRound3VotersCount] = useState(0);
  const [isTournamentVisible, setIsTournamentVisible] = useState(false);
  const [roundState, dispatchRoundEvent] = useReducer(roundStateReducer, 'idle');

  const realtimeEnabled = isRealtimeEnabled();
  const { room: syncedRoom, connectionStatus } = useRoomSync(roomId, { enableRealtime: realtimeEnabled });

  const ensureRealtimeAuth = useCallback(async (currentRoomId: string) => {
    if (!currentRoomId) {
      return false;
    }
    // Always fetch a fresh token to ensure correct role claim
    const roomCode = localStorage.getItem('hostRoomCode') ?? undefined;
    try {
      const response = await fetch('/api/room-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: currentRoomId, roomCode }),
      });
      if (!response.ok) {
        console.warn('Failed to get host room token, status:', response.status);
        return false;
      }
      const payload = (await response.json()) as { token?: string };
      if (!payload.token) {
        console.warn('No token in host response');
        return false;
      }
      const storageKey = `hostRoomAccessToken:${currentRoomId}`;
      localStorage.setItem(storageKey, payload.token);
      supabase.realtime.setAuth(payload.token);
      return true;
    } catch (err) {
      console.warn('Failed to get host room token', err);
      return false;
    }
  }, []);

  const isMusicMutedRef = useRef(isMusicMuted);
  const isVoiceMutedRef = useRef(isVoiceMuted);
  
  useEffect(() => {
    isMusicMutedRef.current = isMusicMuted;
  }, [isMusicMuted]);

  useEffect(() => {
    isVoiceMutedRef.current = isVoiceMuted;
  }, [isVoiceMuted]);

  useEffect(() => {
    round5QuestionsRef.current = round5Questions;
  }, [round5Questions]);

  useEffect(() => {
    if (!roomId) {
      return;
    }
    try {
      const stored = localStorage.getItem(`hostLastActiveRound:${roomId}`);
      if (
        stored === 'running' ||
        stored === 'round2-running' ||
        stored === 'round3-running' ||
        stored === 'round4-running' ||
        stored === 'round5-running' ||
        stored === 'round5-explanation'
      ) {
        setLastActiveRound(stored);
      }
    } catch {
      // ignore
    }
  }, [roomId]);

  useEffect(() => {
    if (
      roomStatus === 'waiting' ||
      roomStatus === 'final-results' ||
      roomStatus === 'finished'
    ) {
      return;
    }
    setLastActiveRound(roomStatus);
    try {
      localStorage.setItem(`hostLastActiveRound:${roomId}`, roomStatus);
    } catch {
      // ignore
    }
  }, [roomId, roomStatus]);

  useEffect(() => {
    if (serverAllPlayersAnswered) {
      dispatchRoundEvent({ type: 'ALL_ANSWERED' });
    }
  }, [serverAllPlayersAnswered]);

  useEffect(() => {
    if (questionStartedAt && timeLeft <= 0) {
      dispatchRoundEvent({ type: 'TIMEOUT' });
    }
  }, [questionStartedAt, timeLeft]);

  useEffect(() => {
    round5CurrentBankIndexRef.current = round5CurrentBankIndex;
  }, [round5CurrentBankIndex]);

  useEffect(() => {
    round4AskedIdsRef.current = round4AskedIds;
  }, [round4AskedIds]);

  const meetAudioRef = useRef<HTMLAudioElement | null>(null);
  const connectAudioRef = useRef<HTMLAudioElement | null>(null);
  const rulesAudioRef = useRef<HTMLAudioElement | null>(null);
  const rulesBgAudioRef = useRef<HTMLAudioElement | null>(null);
  const skipAudioRef = useRef<HTMLAudioElement | null>(null);
  const questionJingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const questionVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const betweenAudioRef = useRef<HTMLAudioElement | null>(null);
  const round5TimerAudioRef = useRef<HTMLAudioElement | null>(null);
  const round5QuestionVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const round5ExplanationBgAudioRef = useRef<HTMLAudioElement | null>(null);
  const round5ExplanationVoiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const round5QuestionsRef = useRef<Round5Question[]>([]);
  const round5CurrentBankIndexRef = useRef<number | null>(null);
  const round5ScoredQuestionIndicesRef = useRef<Set<number>>(new Set());
  const round5StartLockRef = useRef(false);
  const round5AdvanceLockRef = useRef(false);
  const roundEndAudioRef = useRef<HTMLAudioElement | null>(null);
  const roundEndJingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2EndJingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2EndVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastRound2EndCeremonyKeyRef = useRef<string | null>(null);
  const round2FactAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2TimerJingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2ExplanationAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2ExplanationBgAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2BetweenAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2RulesMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  const round2RulesVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const round3RulesMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  const round3RulesVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const round4RulesMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  const round4RulesVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const round5RulesMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  const round5RulesVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const round4CategoryAudioRef = useRef<HTMLAudioElement | null>(null);
  const round4TimerAudioRef = useRef<HTMLAudioElement | null>(null);
  const round4AnswerBgAudioRef = useRef<HTMLAudioElement | null>(null);
  const round4AnswerAudioRef = useRef<HTMLAudioElement | null>(null);
  const round4EndAudioRef = useRef<HTMLAudioElement | null>(null);
  const round3BgAudioRef = useRef<HTMLAudioElement | null>(null);
  const round3VoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const round3BgBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const round3VoiceBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const round3AnswerTimerBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const round3VoteTimerBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const round3BgGainNodeRef = useRef<GainNode | null>(null);
  const round3VoiceGainNodeRef = useRef<GainNode | null>(null);
  const round3AnswerTimerGainNodeRef = useRef<GainNode | null>(null);
  const round3VoteTimerGainNodeRef = useRef<GainNode | null>(null);
  const round3CommentAudioRef = useRef<HTMLAudioElement | null>(null);
  const round3CommentBgAudioRef = useRef<HTMLAudioElement | null>(null);
  const tournamentJingleAudioRef = useRef<HTMLAudioElement | null>(null);
  const finalNarratorAudioRef = useRef<HTMLAudioElement | null>(null);
  const finalResultsStatusRef = useRef<RoomStatus | null>(null);
  const lastRound3ResultsAudioKeyRef = useRef<string | null>(null);
  const lastRound3ResultsScoringKeyRef = useRef<string | null>(null);
  const round3PlaybackTokenRef = useRef(0);
  // Vote timer and vote voice use independent playback tokens so the 15s timer start
  // cannot cancel/cut the voice clip (vote/*.mp3).
  const round3VoteTimerPlaybackTokenRef = useRef(0);
  const round3VoteVoicePlaybackTokenRef = useRef(0);
  const currentRound3QuestionIndexRef = useRef(currentQuestionIndex);
  const round3AnswerTimerVoteVoiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const round4ScoredPuzzleIdsRef = useRef<Set<number>>(new Set());
  const round2AnswersRef = useRef<Round2AnswerRow[]>([]);
  const lastRound3RoundLeaderboardKeyRef = useRef<string | null>(null);
  const lastRound4RoundLeaderboardKeyRef = useRef<string | null>(null);
  const lastRound5RoundLeaderboardKeyRef = useRef<string | null>(null);
  const lastRound3PlaybackKeyRef = useRef<string | null>(null);
  const lastRound3VoteKeyRef = useRef<string | null>(null);
  const lastRound3VoteAnswersKeyRef = useRef<string | null>(null);
  const round2StatsRef = useRef<Map<string, Round2PlayerStats>>(new Map());
  const round2CorrectTotalRef = useRef(0);
  const round2PossibleTotalRef = useRef(0);
  const round2LastAccuracyRef = useRef(0);
  const isLastRound2QuestionRef = useRef(false);
  const round3RulesAudioCompletedRef = useRef(true);
  const round3StartLockRef = useRef(false);
  const round4RulesAudioCompletedRef = useRef(true);
  const round4StartLockRef = useRef(false);
  const round2RulesAudioCompletedRef = useRef(true);
  const isRound2RulesVisibleRef = useRef(isRound2RulesVisible);
  const isRound3RulesVisibleRef = useRef(isRound3RulesVisible);
  const isRound4RulesVisibleRef = useRef(isRound4RulesVisible);
  const isRound5RulesVisibleRef = useRef(isRound5RulesVisible);
  const startRound2Ref = useRef<(() => void) | null>(null);
  const startRound3CountdownRef = useRef<(() => void) | null>(null);
  const startRound4CountdownRef = useRef<(() => void) | null>(null);
  const startRound5CountdownRef = useRef<(() => void) | null>(null);
  const isRulesVisibleRef = useRef(isRulesVisible);
  const isCountdownVisibleRef = useRef(isCountdownVisible);
  const isPrestartVisibleRef = useRef(isPrestartVisible);
  const countdownValueRef = useRef(countdownValue);
  const countdownContextRef = useRef(countdownContext);
  const round4AskedIdsRef = useRef<number[]>([]);
  const round4CurrentPuzzleIdRef = useRef<number | null>(null);
  const isMirrorRef = useRef(isMirror);
  const playersRef = useRef<Player[]>(players);
  const hasUserInteractedRef = useRef(false);
  const lastJoinAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAnswerDuckAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAnsweredIdsRef = useRef<Set<string>>(new Set());
  const lastAnsweredContextRef = useRef<string>('');
  const lobbySoundSetterRef = useRef(setIsLobbySoundOn);
  const roundEndButtonSetterRef = useRef(setIsRoundEndButtonLocked);
  const handleCountdownStartRef = useRef<((options?: { playSkip?: boolean }) => void) | null>(null);
  const round2AskedIndicesRef = useRef<number[]>([]);
  const round2QuestionCounterRef = useRef(0);
  const handleRound2NextQuestionRef = useRef<(() => void) | null>(null);
  const round1VariantsPanelRef = useRef<Round1VariantsPanelHandle | null>(null);
  const previousPlayerIdsRef = useRef<Set<string>>(new Set());
  const hasSnapshotRef = useRef(false);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMirroredCountdownValueRef = useRef<string | null>(null);
  const prestartEnableTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundEndUnlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundEndDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rulesAudioCompletedRef = useRef(true);
  const isLobbySoundOnRef = useRef(isLobbySoundOn);
  const lastSpokenQuestionRef = useRef<number | null>(null);
  const lastRound5QuestionPlaybackKeyRef = useRef<string | null>(null);
  const lastRound5ExplanationPlaybackKeyRef = useRef<string | null>(null);
  const betweenCueQuestionRef = useRef<number | null>(null);
  const roundEndLockQuestionRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const round3VoteVoiceBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const round3VoteVoiceGainNodeRef = useRef<GainNode | null>(null);
  const lastRound3VoteAudioKeyRef = useRef<string | null>(null);
  const lastRound2FactPlaybackKeyRef = useRef<string | null>(null);
  const lastRound2ExplanationPlaybackKeyRef = useRef<string | null>(null);
  const lastRound4CuePlaybackKeyRef = useRef<string | null>(null);
  const lastRound4AnswerPlaybackKeyRef = useRef<string | null>(null);
  const handleRound3NextQuestionRef = useRef<(() => void) | null>(null);
  const autoNextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const round1VariantsOutroTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFinishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const round2TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTransitioningRound2Ref = useRef(false);
  const lastRound2AwardKeyRef = useRef<string | null>(null);
  const round2CurrentIndexRef = useRef<number | null>(round2CurrentIndex);
  const round2ItemsRef = useRef<TrueFalseItem[]>([]);
  const countdownCompleteActionRef = useRef<(() => Promise<void> | void) | null>(null);
  const round2ShowingFactRef = useRef(round2ShowingFact);
  const round2PhaseRef = useRef<Round2Phase>(round2PhaseState);
  const handleRound3CompleteRef = useRef<(() => Promise<void> | void) | null>(null);
  const round3QuestionCount = Math.min(ROUND3_TOTAL_QUESTIONS, round3Questions.length);
  const currentRound3Question =
    roomStatus === 'round3-running' ? round3Questions[currentQuestionIndex] ?? null : null;

  useEffect(() => {
    // Mirror не получает пользовательских кликов, поэтому сразу разрешаем авто-воспроизведение.
    if (isMirror) {
      hasUserInteractedRef.current = true;
    }
  }, [isMirror]);

  const currentLikeQuestionId = (() => {
    if (roomStatus === 'running' && question?.id) {
      return question.id;
    }
    if (roomStatus === 'round2-running' && round2CurrentIndex !== null) {
      return buildRound2LikeId(round2CurrentIndex, round2ShowingFact);
    }
    if (roomStatus === 'round3-running' && (currentRound3Question || typeof currentQuestionIndex === 'number')) {
      const index = currentRound3Question?.originalIndex ?? currentQuestionIndex;
      return buildRound3LikeId(index);
    }
    if (roomStatus === 'round4-running' && round4CurrentPuzzle?.id) {
      return buildRound4LikeId(round4CurrentPuzzle.id);
    }
    if ((roomStatus === 'round5-running' || roomStatus === 'round5-explanation') && round5CurrentBankIndex !== null) {
      return buildRound5LikeId(round5CurrentBankIndex);
    }
    return null;
  })();

  const getRound3ElapsedSeconds = useCallback(
    (startedAt: string | null) => {
      if (!startedAt) {
        return null;
      }
      const startMs = new Date(startedAt).getTime();
      if (isNaN(startMs)) {
        return null;
      }
      const now = Date.now() - timeOffsetMs;
      return Math.max(0, Math.floor((now - startMs) / 1000));
    },
    [timeOffsetMs]
  );

  const round3Phase = useMemo(() => {
    if (roomStatus !== 'round3-running') {
      return 'none' as const;
    }
    if (!questionStartedAt) {
      return 'fact' as const;
    }
    const elapsed = getRound3ElapsedSeconds(questionStartedAt);
    if (elapsed === null) {
      return 'fact' as const;
    }
    if (elapsed < ROUND3_ANSWER_SECONDS) {
      return 'answer' as const;
    }
    if (elapsed < ROUND3_ANSWER_SECONDS + ROUND3_VOTE_COUNTDOWN_SECONDS) {
      return 'vote-countdown' as const;
    }
    if (elapsed < ROUND3_ANSWER_SECONDS + ROUND3_VOTE_COUNTDOWN_SECONDS + ROUND3_VOTE_SECONDS) {
      return 'vote' as const;
    }
    return 'results' as const;
    // timeLeft is included to force re-evaluation as the timer ticks down.
  }, [getRound3ElapsedSeconds, questionStartedAt, roomStatus, timeLeft]);

  const isRound3ResultsPhase = round3Phase === 'results';

  const bestRound3WrongAnswerText = useMemo(() => {
    if (!isRound3ResultsPhase) {
      return null;
    }

    const wrongAnswers = round3ScoredAnswers
      .filter((row) => !row.isCorrect)
      .map((row) => ({ ...row, text: row.text.trim() }))
      .filter((row) => row.text.length > 0);

    if (wrongAnswers.length === 0) {
      return null;
    }

    const maxVotes = wrongAnswers.reduce((acc, row) => Math.max(acc, row.votes), 0);
    if (maxVotes <= 0) {
      return null;
    }

    let candidates = wrongAnswers.filter((row) => row.votes === maxVotes);
    if (candidates.length === 1) {
      return candidates[0].text;
    }

    const pointsByPlayerId = new Map(players.map((player) => [player.id, player.total_points] as const));
    const maxPlayerPoints = candidates.reduce(
      (acc, row) => Math.max(acc, pointsByPlayerId.get(row.playerId) ?? 0),
      0
    );
    candidates = candidates.filter((row) => (pointsByPlayerId.get(row.playerId) ?? 0) === maxPlayerPoints);
    if (candidates.length === 1) {
      return candidates[0].text;
    }

    return null;
  }, [isRound3ResultsPhase, players, round3ScoredAnswers]);

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
    currentRound3QuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  useEffect(() => {
    round2ShowingFactRef.current = round2ShowingFact;
  }, [round2ShowingFact]);

  useEffect(() => {
    round2AnswersRef.current = round2Answers;
  }, [round2Answers]);

  useEffect(() => {
    round2ItemsRef.current = round2Items;
  }, [round2Items]);

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

    if (round1VariantsOutroTimeoutRef.current) {
      clearTimeout(round1VariantsOutroTimeoutRef.current);
      round1VariantsOutroTimeoutRef.current = null;
    }
  }, []);

  const clearAutoFinishTimeout = useCallback(() => {
    if (autoFinishTimeoutRef.current) {
      clearTimeout(autoFinishTimeoutRef.current);
      autoFinishTimeoutRef.current = null;
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
      round2RulesVoiceAudioRef.current.onended = null;
      round2RulesVoiceAudioRef.current.pause();
      round2RulesVoiceAudioRef.current.currentTime = 0;
      round2RulesVoiceAudioRef.current = null;
    }
  }, []);

  const stopRound3RulesAudio = useCallback(() => {
    const musicCue = round3RulesMusicAudioRef.current;
    if (musicCue) {
      musicCue.pause();
      musicCue.currentTime = 0;
      round3RulesMusicAudioRef.current = null;
    }
    const voiceCue = round3RulesVoiceAudioRef.current;
    if (voiceCue) {
      voiceCue.pause();
      voiceCue.currentTime = 0;
      voiceCue.onended = null;
      round3RulesVoiceAudioRef.current = null;
    }
    round3RulesAudioCompletedRef.current = true;
  }, []);

  const stopRound4RulesAudio = useCallback(() => {
    const musicCue = round4RulesMusicAudioRef.current;
    if (musicCue) {
      musicCue.pause();
      musicCue.currentTime = 0;
      round4RulesMusicAudioRef.current = null;
    }
    const voiceCue = round4RulesVoiceAudioRef.current;
    if (voiceCue) {
      voiceCue.pause();
      voiceCue.currentTime = 0;
      voiceCue.onended = null;
      round4RulesVoiceAudioRef.current = null;
    }
  }, []);

  const stopRound5RulesAudio = useCallback(() => {
    const musicCue = round5RulesMusicAudioRef.current;
    if (musicCue) {
      try {
        musicCue.pause();
        musicCue.currentTime = 0;
      } catch {
        // ignore
      }
      round5RulesMusicAudioRef.current = null;
    }
    const voiceCue = round5RulesVoiceAudioRef.current;
    if (voiceCue) {
      try {
        voiceCue.pause();
        voiceCue.currentTime = 0;
      } catch {
        // ignore
      }
      voiceCue.onended = null;
      round5RulesVoiceAudioRef.current = null;
    }
    setIsRound5RulesAudioPlaying(false);
  }, []);

  const stopRound5Audio = useCallback(() => {
    const stopCue = (ref: React.MutableRefObject<HTMLAudioElement | null>) => {
      const cue = ref.current;
      if (!cue) {
        return;
      }
      try {
        cue.pause();
        cue.currentTime = 0;
      } catch {
        // ignore
      }
      cue.onended = null;
      cue.onerror = null;
      ref.current = null;
    };

    stopCue(round5TimerAudioRef);
    stopCue(round5QuestionVoiceAudioRef);
    stopCue(round5ExplanationBgAudioRef);
    stopCue(round5ExplanationVoiceAudioRef);
  }, []);

  const stopRound4AnswerBgAudio = useCallback(() => {
    const bgCue = round4AnswerBgAudioRef.current;
    if (bgCue) {
      try {
        bgCue.pause();
        bgCue.currentTime = 0;
      } catch {
        // ignore
      }
      round4AnswerBgAudioRef.current = null;
    }
  }, []);

  const stopRound4AnswerAudio = useCallback(() => {
    const answerCue = round4AnswerAudioRef.current;
    if (answerCue) {
      try {
        answerCue.pause();
        answerCue.currentTime = 0;
      } catch {
        // ignore
      }
      answerCue.onended = null;
      answerCue.onerror = null;
      round4AnswerAudioRef.current = null;
    }
    stopRound4AnswerBgAudio();
  }, [stopRound4AnswerBgAudio]);

  const stopRound4Audio = useCallback(() => {
    const stopCue = (ref: React.MutableRefObject<HTMLAudioElement | null>) => {
      const cue = ref.current;
      if (!cue) return;
      try {
        cue.pause();
        cue.currentTime = 0;
      } catch {
        // ignore
      }
      cue.onended = null;
      ref.current = null;
    };

    stopCue(round4CategoryAudioRef);
    stopCue(round4TimerAudioRef);
    stopRound4AnswerAudio();
    stopCue(round4EndAudioRef);
  }, [stopRound4AnswerAudio]);

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

  const stopRound2EndCeremonyAudio = useCallback(() => {
    const jingle = round2EndJingleAudioRef.current;
    if (jingle) {
      try {
        jingle.pause();
        jingle.currentTime = 0;
      } catch {
        // ignore
      }
      jingle.onended = null;
      jingle.onerror = null;
      round2EndJingleAudioRef.current = null;
    }

    const voice = round2EndVoiceAudioRef.current;
    if (voice) {
      try {
        voice.pause();
        voice.currentTime = 0;
      } catch {
        // ignore
      }
      voice.onended = null;
      voice.onerror = null;
      round2EndVoiceAudioRef.current = null;
    }
  }, []);

  const playRound2EndCeremony = useCallback(
    (_percent: number, key: string) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      if (lastRound2EndCeremonyKeyRef.current === key) {
        return;
      }
      lastRound2EndCeremonyKeyRef.current = key;

      stopRound2EndCeremonyAudio();
      stopRound2Audio();

      const voice = new Audio(buildAudioUrl(pickRandomItem(ROUND2_END_AUDIO_FILES)));
      voice.volume = isVoiceMutedRef.current ? 0 : 0.95;
      voice.loop = false;
      round2EndVoiceAudioRef.current = voice;

      const jingle = new Audio(buildAudioUrl(ROUND1_END_JINGLE_FILE));
      jingle.volume = 0.95;
      jingle.loop = false;
      round2EndJingleAudioRef.current = jingle;

      jingle.onended = () => {
        if (round2EndJingleAudioRef.current === jingle) {
          round2EndJingleAudioRef.current = null;
        }
      };
      jingle.onerror = () => {
        if (round2EndJingleAudioRef.current === jingle) {
          round2EndJingleAudioRef.current = null;
        }
      };

      voice.onended = () => {
        if (round2EndVoiceAudioRef.current === voice) {
          round2EndVoiceAudioRef.current = null;
        }
      };
      voice.onerror = () => {
        if (round2EndVoiceAudioRef.current === voice) {
          round2EndVoiceAudioRef.current = null;
        }
      };

      jingle.play().catch((err) => {
        console.error('Не удалось проиграть джингл окончания Раунда 2', err);
      });

      voice.play().catch((err) => {
        console.error('Не удалось проиграть озвучку окончания Раунда 2', err);
      });
    },
    [stopRound2Audio, stopRound2EndCeremonyAudio]
  );

  const stopTournamentJingle = useCallback(() => {
    const audio = tournamentJingleAudioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // ignore
      }
      tournamentJingleAudioRef.current = null;
    }
  }, []);

  const stopFinalNarratorAudio = useCallback(() => {
    const audio = finalNarratorAudioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // ignore
      }
      audio.onended = null;
      audio.onerror = null;
      finalNarratorAudioRef.current = null;
    }
  }, []);


  const playTournamentJingle = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopTournamentJingle();
    const audio = new Audio(buildAudioUrl(ROUND1_END_JINGLE_FILE));
    audio.loop = true;
    audio.volume = isMusicMutedRef.current ? 0 : 0.6;
    tournamentJingleAudioRef.current = audio;

    audio.play().catch((error) => {
      console.error('Не удалось проиграть финальный джингл турнира', error);
    });
  }, [stopTournamentJingle]);

  const playFinalNarratorAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopFinalNarratorAudio();
    const variant = Math.floor(Math.random() * ROUND5_FINAL_NARRATOR_VARIANTS) + 1;
    const file = `${ROUND5_FINAL_NARRATOR_AUDIO_DIR}/${variant}.mp3`;
    const audio = new Audio(buildAudioUrl(file));
    audio.volume = 0.95;
    finalNarratorAudioRef.current = audio;

    audio.play().catch((error) => {
      console.error('Не удалось проиграть финальную озвучку диктора', error);
    });
  }, [stopFinalNarratorAudio]);

  const playRound3EndAfterAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    const randomIndex = Math.floor(Math.random() * 4) + 1; // 1 to 4
    const audioFile = `${ROUND3_END_AFTER_AUDIO_DIR}/${randomIndex}.mp3`;
    const audio = new Audio(buildAudioUrl(audioFile));
    audio.volume = 0.6;

    audio.play().catch((error) => {
      console.error('Не удалось проиграть звук окончания раунда 3', error);
    });
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

  const playRound1EndCeremonyAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopRoundEndAudio();
    playTournamentJingle();

    const file = pickRandomItem(ROUND1_END_AUDIO_FILES);
    const voice = new Audio(buildAudioUrl(file));
    voice.volume = isVoiceMutedRef.current ? 0 : 0.95;
    voice.loop = false;
    roundEndAudioRef.current = voice;
    voice.play().catch((error) => {
      console.error('Не удалось проиграть озвучку завершения Раунда 1', error);
    });
  }, [playTournamentJingle, stopRoundEndAudio]);

  const playRound4CategoryAudio = useCallback(
    (category: string) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      const previous = round4CategoryAudioRef.current;
      if (previous) {
        try {
          previous.pause();
          previous.currentTime = 0;
        } catch {
          // ignore
        }
        previous.onended = null;
        previous.onerror = null;
        round4CategoryAudioRef.current = null;
      }

      const normalized = normalizeRound4Answer(category);
      const key = ROUND4_CATEGORY_AUDIO_MAP[normalized];
      if (!key) {
        return;
      }
      const maxVariants = ROUND4_CATEGORY_VARIANTS[key] ?? 3;
      const variant = Math.floor(Math.random() * maxVariants) + 1;
      const cue = new Audio(buildAudioUrl(`round4/category/${key}/${variant}.mp3`));
      cue.volume = 0.95;
      round4CategoryAudioRef.current = cue;
      cue.play().catch((err) => {
        console.error('Не удалось проиграть озвучку категории Раунда 4', err);
      });
    },
    []
  );

  const playRound4TimerAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    const previous = round4TimerAudioRef.current;
    if (previous) {
      try {
        previous.pause();
        previous.currentTime = 0;
      } catch {
        // ignore
      }
      previous.onended = null;
      previous.onerror = null;
      round4TimerAudioRef.current = null;
    }

    const timer = new Audio(buildAudioUrl(QUESTION_JINGLE_FILE));
    timer.volume = 0.55;
    round4TimerAudioRef.current = timer;
    timer.play().catch((err) => {
      console.error('Не удалось запустить таймер Раунда 4', err);
    });
  }, []);

  const playRound4AnswerAudio = useCallback(
    (puzzleId: number, options?: { onEnded?: () => void }) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      const category = round4CategoryAudioRef.current;
      if (category) {
        try {
          category.pause();
          category.currentTime = 0;
        } catch {
          // ignore
        }
        category.onended = null;
        category.onerror = null;
        round4CategoryAudioRef.current = null;
      }

      const timer = round4TimerAudioRef.current;
      if (timer) {
        try {
          timer.pause();
          timer.currentTime = 0;
        } catch {
          // ignore
        }
        timer.onended = null;
        timer.onerror = null;
        round4TimerAudioRef.current = null;
      }

      stopRound4AnswerAudio();

      const bg = new Audio(buildAudioUrl(ROUND2_EXPLANATION_BG_FILE));
      bg.loop = true;
      bg.volume = 0.35;
      round4AnswerBgAudioRef.current = bg;

      const cue = new Audio(buildAudioUrl(`round4/questions/${puzzleId}.mp3`));
      cue.volume = 0.95;
      round4AnswerAudioRef.current = cue;

      const finish = () => {
        stopRound4AnswerAudio();
        options?.onEnded?.();
      };

      cue.onended = finish;
      cue.onerror = finish;

      bg.play().catch((err) => {
        console.error('Не удалось воспроизвести фон ответа Раунда 4', err);
      });

      cue.play().catch((err) => {
        console.error('Не удалось проиграть ответ Раунда 4', err);
        finish();
      });
    },
    [stopRound4AnswerAudio]
  );

  const playRound4EndAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }
    const variant = Math.floor(Math.random() * 5) + 1;
    const cue = new Audio(buildAudioUrl(`round4/end4/${variant}.mp3`));
    cue.volume = 0.9;
    round4EndAudioRef.current = cue;
    cue.play().catch((err) => {
      console.error('Не удалось проиграть завершение Раунда 4', err);
    });
  }, []);

  const playRound2RulesAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }
    stopRound2RulesAudio();
    round2RulesAudioCompletedRef.current = false;
    const jingle = new Audio(buildAudioUrl(ROUND2_RULES_JINGLE_FILE));
    jingle.volume = 0.5;
    jingle.loop = true;
    round2RulesMusicAudioRef.current = jingle;

    const voiceSource = ROUND2_RULES_VOICE_FILES.length ? pickRandomItem(ROUND2_RULES_VOICE_FILES) : ROUND2_RULES_JINGLE_FILE;
    const voice = new Audio(buildAudioUrl(voiceSource));
    voice.volume = isVoiceMutedRef.current ? 0 : 0.95;
    round2RulesVoiceAudioRef.current = voice;

    const stopJingle = () => {
      const current = round2RulesMusicAudioRef.current;
      if (current) {
        current.pause();
        current.currentTime = 0;
        round2RulesMusicAudioRef.current = null;
      }
    };

    voice.onended = () => {
      round2RulesAudioCompletedRef.current = true;
      stopJingle();
      if (isRound2RulesVisibleRef.current) {
        startRound2Ref.current?.();
      }
    };

    jingle.play().catch((err) => {
      console.error('Не удалось воспроизвести джингл правил Раунда 2', err);
    });
    voice.play().catch((err) => {
      round2RulesAudioCompletedRef.current = true;
      stopJingle();
      console.error('Не удалось воспроизвести озвучку правил Раунда 2', err);
    });
  }, [stopRound2RulesAudio]);

  const playRound3RulesAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopRound3RulesAudio();
    round3RulesAudioCompletedRef.current = false;

    const jingle = new Audio(buildAudioUrl(ROUND2_RULES_JINGLE_FILE));
    jingle.volume = 0.5;
    jingle.loop = true;
    round3RulesMusicAudioRef.current = jingle;

    const voiceSource = pickRandomItem(ROUND3_RULES_VOICE_FILES);
    const voice = new Audio(buildAudioUrl(voiceSource));
    voice.volume = isVoiceMutedRef.current ? 0 : 0.95;
    round3RulesVoiceAudioRef.current = voice;

    const stopJingle = () => {
      const current = round3RulesMusicAudioRef.current;
      if (current) {
        current.pause();
        current.currentTime = 0;
        round3RulesMusicAudioRef.current = null;
      }
    };

    voice.onended = () => {
      round3RulesAudioCompletedRef.current = true;
      stopJingle();
      if (isRound3RulesVisibleRef.current) {
        startRound3CountdownRef.current?.();
      }
    };

    jingle.play().catch((err) => {
      console.error('Не удалось воспроизвести джингл правил Раунда 3', err);
    });

    voice.play().catch((err) => {
      round3RulesAudioCompletedRef.current = true;
      stopJingle();
      console.error('Не удалось воспроизвести озвучку правил Раунда 3', err);
    });
  }, [stopRound3RulesAudio]);

  const playRound4RulesAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopRound4RulesAudio();
    round4RulesAudioCompletedRef.current = false;

    const jingle = new Audio(buildAudioUrl(ROUND2_RULES_JINGLE_FILE));
    jingle.volume = 0.5;
    jingle.loop = true;
    round4RulesMusicAudioRef.current = jingle;

    const voiceSource = pickRandomItem(ROUND4_RULES_VOICE_FILES);
    const voice = new Audio(buildAudioUrl(voiceSource));
    voice.volume = isVoiceMutedRef.current ? 0 : 0.95;
    round4RulesVoiceAudioRef.current = voice;

    const stopJingle = () => {
      const current = round4RulesMusicAudioRef.current;
      if (current) {
        current.pause();
        current.currentTime = 0;
        round4RulesMusicAudioRef.current = null;
      }
    };

    voice.onended = () => {
      round4RulesAudioCompletedRef.current = true;
      round4RulesVoiceAudioRef.current = null;
      stopJingle();
      if (isRound4RulesVisibleRef.current) {
        startRound4CountdownRef.current?.();
      }
    };

    jingle.play().catch((err) => {
      console.error('Не удалось воспроизвести джингл правил Раунда 4', err);
    });

    voice.play().catch((err) => {
      round4RulesAudioCompletedRef.current = true;
      stopJingle();
      console.error('Не удалось воспроизвести озвучку правил Раунда 4', err);
    });
  }, [stopRound4RulesAudio]);

  const playRound5RulesAudio = useCallback((options?: { onEnded?: () => void }) => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopRound5RulesAudio();
    setIsRound5RulesAudioPlaying(true);

    const jingle = new Audio(buildAudioUrl(ROUND2_RULES_JINGLE_FILE));
    jingle.volume = 0.5;
    jingle.loop = true;
    round5RulesMusicAudioRef.current = jingle;

    const voiceSource = ROUND5_RULES_VOICE_FILES.length ? pickRandomItem(ROUND5_RULES_VOICE_FILES) : 'round5/ruels/1.mp3';
    const voice = new Audio(buildAudioUrl(voiceSource));
    voice.volume = isVoiceMutedRef.current ? 0 : 0.95;
    round5RulesVoiceAudioRef.current = voice;

    const finish = () => {
      setIsRound5RulesAudioPlaying(false);
      round5RulesVoiceAudioRef.current = null;
      const currentJingle = round5RulesMusicAudioRef.current;
      if (currentJingle) {
        currentJingle.pause();
        currentJingle.currentTime = 0;
        round5RulesMusicAudioRef.current = null;
      }
      options?.onEnded?.();
    };

    voice.onended = finish;

    jingle.play().catch((err) => {
      console.error('Не удалось воспроизвести джингл правил Раунда 5', err);
    });

    voice.play().catch((err) => {
      console.error('Не удалось воспроизвести озвучку правил финального раунда', err);
      finish();
    });
  }, [stopRound5RulesAudio]);

  const playRound5QuestionAudio = useCallback(
    async (bankIndex: number) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      stopRound5Audio();

      const timer = new Audio(buildAudioUrl(QUESTION_JINGLE_FILE));
      timer.loop = false;
      timer.volume = isMusicMutedRef.current ? 0 : 0.6;
      round5TimerAudioRef.current = timer;

      const voiceFile = `${ROUND5_QUESTION_AUDIO_DIR}/${getRound5AudioOrdinal(bankIndex)}.mp3`;
      const voice = new Audio(buildAudioUrl(voiceFile));
      voice.loop = false;
      voice.volume = isVoiceMutedRef.current ? 0 : 0.95;
      round5QuestionVoiceAudioRef.current = voice;

      try {
        await timer.play();
      } catch (error) {
        console.error('Не удалось запустить таймер финального раунда', error);
      }

      voice.play().catch((error) => {
        console.error('Не удалось воспроизвести вопрос финального раунда', error);
      });
    },
    [stopRound5Audio]
  );

  const playRound5ExplanationAudio = useCallback(
    (bankIndex: number, options?: { onEnded?: () => void }) => {
      if (!hasUserInteractedRef.current) {
        options?.onEnded?.();
        return;
      }

      stopRound5Audio();

      const bg = new Audio(buildAudioUrl(ROUND2_EXPLANATION_BG_FILE));
      bg.loop = true;
      bg.volume = isMusicMutedRef.current ? 0 : 0.35;
      round5ExplanationBgAudioRef.current = bg;

      const voiceFile = `${ROUND5_EXPLANATION_AUDIO_DIR}/${getRound5AudioOrdinal(bankIndex)}.mp3`;
      const voice = new Audio(buildAudioUrl(voiceFile));
      voice.loop = false;
      voice.volume = isVoiceMutedRef.current ? 0 : 0.95;
      round5ExplanationVoiceAudioRef.current = voice;

      const finish = () => {
        stopRound5Audio();
        options?.onEnded?.();
      };

      voice.onended = finish;
      voice.onerror = finish;

      bg.play().catch((err) => {
        console.error('Не удалось воспроизвести фон объяснения финального раунда', err);
      });

      voice.play().catch((err) => {
        console.error('Не удалось воспроизвести объяснение финального раунда', err);
        finish();
      });
    },
    [stopRound5Audio]
  );

  const stopRound3Audio = useCallback(() => {
    round3PlaybackTokenRef.current += 1;

    const voiceSource = round3VoiceBufferSourceRef.current;
    if (voiceSource) {
      try {
        voiceSource.onended = null;
        voiceSource.stop(0);
      } catch {
        // ignore
      }
      try {
        voiceSource.disconnect();
      } catch {
        // ignore
      }
      round3VoiceBufferSourceRef.current = null;
    }

    const bgSource = round3BgBufferSourceRef.current;
    if (bgSource) {
      try {
        bgSource.stop(0);
      } catch {
        // ignore
      }
      try {
        bgSource.disconnect();
      } catch {
        // ignore
      }
      round3BgBufferSourceRef.current = null;
    }

    const timerSource = round3AnswerTimerBufferSourceRef.current;
    if (timerSource) {
      try {
        timerSource.onended = null;
        timerSource.stop(0);
      } catch {
        // ignore
      }
      try {
        timerSource.disconnect();
      } catch {
        // ignore
      }
      round3AnswerTimerBufferSourceRef.current = null;
    }

    const voiceGain = round3VoiceGainNodeRef.current;
    if (voiceGain) {
      try {
        voiceGain.disconnect();
      } catch {
        // ignore
      }
      round3VoiceGainNodeRef.current = null;
    }

    const bgGain = round3BgGainNodeRef.current;
    if (bgGain) {
      try {
        bgGain.disconnect();
      } catch {
        // ignore
      }
      round3BgGainNodeRef.current = null;
    }

    const timerGain = round3AnswerTimerGainNodeRef.current;
    if (timerGain) {
      try {
        timerGain.disconnect();
      } catch {
        // ignore
      }
      round3AnswerTimerGainNodeRef.current = null;
    }

    if (round3AnswerTimerVoteVoiceTimeoutRef.current) {
      clearTimeout(round3AnswerTimerVoteVoiceTimeoutRef.current);
      round3AnswerTimerVoteVoiceTimeoutRef.current = null;
    }

    const voice = round3VoiceAudioRef.current;
    const bg = round3BgAudioRef.current;

    if (voice) {
      try {
        voice.pause();
        voice.currentTime = 0;
      } catch (e) {
        console.error('Ошибка остановки озвучки Раунда 3', e);
      }
      voice.onended = null;
      voice.onerror = null;
      round3VoiceAudioRef.current = null;
    }

    if (bg) {
      try {
        bg.pause();
        bg.currentTime = 0;
      } catch (e) {
        console.error('Ошибка остановки фона Раунда 3', e);
      }
      bg.onended = null;
      round3BgAudioRef.current = null;
    }

    setRound3AudioBlocked(false);
  }, []);


  const stopAllAudio = useCallback(() => {
    stopRound2Audio();
    stopRound2RulesAudio();
    stopRound3RulesAudio();
    stopRound3Audio();
    stopRound4RulesAudio();
    stopRound5RulesAudio();
    stopRound5Audio();
    stopRound4Audio();
    stopRoundEndAudio();
    stopTournamentJingle();

    const narrator = finalNarratorAudioRef.current;
    if (narrator) {
      try {
        narrator.pause();
        narrator.currentTime = 0;
      } catch {
        // ignore
      }
      narrator.onended = null;
      narrator.onerror = null;
      finalNarratorAudioRef.current = null;
    }

    // stopBetweenAudio вызываем через ref, так как он определён позже
    const audio = betweenAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      betweenAudioRef.current = null;
    }
  }, [stopRound2Audio, stopRound2RulesAudio, stopRound3Audio, stopRound3RulesAudio, stopRound4Audio, stopRound4RulesAudio, stopRound5Audio, stopRound5RulesAudio, stopRoundEndAudio, stopTournamentJingle]);

  const toggleMusicMute = useCallback(() => {
    const newMuted = !isMusicMuted;
    setIsMusicMuted(newMuted);
    isMusicMutedRef.current = newMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('host_bgm_muted', String(newMuted));
    }

    // Mute/unmute the looping tournament jingle if playing
    const jingle = tournamentJingleAudioRef.current;
    if (jingle) {
      jingle.volume = newMuted ? 0 : 0.95;
    }

    const rulesBg = rulesBgAudioRef.current;
    if (rulesBg) {
      rulesBg.volume = newMuted ? 0 : 0.35;
    }

    const bgGain = round3BgGainNodeRef.current;
    if (bgGain) {
      bgGain.gain.value = newMuted ? 0 : ROUND3_BG_VOLUME;
    }

    const answerTimerGain = round3AnswerTimerGainNodeRef.current;
    if (answerTimerGain) {
      answerTimerGain.gain.value = newMuted ? 0 : ROUND3_TIMER_VOLUME;
    }

    const voteTimerGain = round3VoteTimerGainNodeRef.current;
    if (voteTimerGain) {
      voteTimerGain.gain.value = newMuted ? 0 : ROUND3_TIMER_VOLUME;
    }
  }, [isMusicMuted]);

  const toggleVoiceMute = useCallback(() => {
    const newMuted = !isVoiceMuted;
    setIsVoiceMuted(newMuted);
    isVoiceMutedRef.current = newMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('host_voice_muted', String(newMuted));
    }

    // Mute/unmute the round-end voice if playing
    const roundEndVoice = roundEndAudioRef.current;
    if (roundEndVoice) {
      roundEndVoice.volume = newMuted ? 0 : 0.95;
    }

    const voiceGain = round3VoiceGainNodeRef.current;
    if (voiceGain) {
      voiceGain.gain.value = newMuted ? 0 : 1;
    }

    const voteVoiceGain = round3VoteVoiceGainNodeRef.current;
    if (voteVoiceGain) {
      voteVoiceGain.gain.value = newMuted ? 0 : 0.95;
    }
  }, [isVoiceMuted]);

  const playRound3VoteVoiceAudio = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const token = round3VoteVoicePlaybackTokenRef.current + 1;
    round3VoteVoicePlaybackTokenRef.current = token;

    const voteVariant = Math.floor(Math.random() * 9) + 1;
    const voteUrl = buildAudioUrl(`${ROUND3_VOTE_AUDIO_DIR}/${voteVariant}.mp3`);

    void (async () => {
      const AudioContextCtor =
        window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        setRound3AudioBlocked(true);
        return;
      }

      let context = audioContextRef.current;
      if (!context) {
        context = new AudioContextCtor();
        audioContextRef.current = context;
      }

      if (context.state === 'suspended') {
        try {
          await context.resume();
        } catch {
          setRound3AudioBlocked(true);
          return;
        }
      }

      if (round3VoteVoicePlaybackTokenRef.current !== token) {
        return;
      }

      const decodeFromUrl = async (url: string) => {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} for ${url}`);
        }
        const bytes = await res.arrayBuffer();
        return await context.decodeAudioData(bytes.slice(0));
      };

      try {
        const voteBuffer = await decodeFromUrl(voteUrl);
        if (round3VoteVoicePlaybackTokenRef.current !== token) {
          return;
        }

        // Stop previous vote voice (but keep vote timer jingle if it is playing).
        const prevVote = round3VoteVoiceBufferSourceRef.current;
        if (prevVote) {
          try {
            prevVote.onended = null;
            prevVote.stop(0);
          } catch {
            // ignore
          }
          try {
            prevVote.disconnect();
          } catch {
            // ignore
          }
          round3VoteVoiceBufferSourceRef.current = null;
        }
        const prevVoteGain = round3VoteVoiceGainNodeRef.current;
        if (prevVoteGain) {
          try {
            prevVoteGain.disconnect();
          } catch {
            // ignore
          }
          round3VoteVoiceGainNodeRef.current = null;
        }

        const voteSource = context.createBufferSource();
        voteSource.buffer = voteBuffer;
        voteSource.loop = false;

        const voteGain = context.createGain();
        voteGain.gain.value = isVoiceMutedRef.current ? 0 : 0.95;

        voteSource.connect(voteGain);
        voteGain.connect(context.destination);

        round3VoteVoiceBufferSourceRef.current = voteSource;
        round3VoteVoiceGainNodeRef.current = voteGain;

        const startAt = context.currentTime + 0.01;
        try {
          voteSource.start(startAt);
        } catch {
          // ignore
        }

        // Play full clip duration (vote phase timers can be disabled).
        const stopAt = startAt + Math.max(0.05, (voteBuffer?.duration ?? 0) + 0.05);
        try {
          voteSource.stop(stopAt);
        } catch {
          // ignore
        }

        voteSource.onended = () => {
          try {
            voteSource.disconnect();
          } catch {
            // ignore
          }
          try {
            voteGain.disconnect();
          } catch {
            // ignore
          }
          if (round3VoteVoiceBufferSourceRef.current === voteSource) {
            round3VoteVoiceBufferSourceRef.current = null;
          }
          if (round3VoteVoiceGainNodeRef.current === voteGain) {
            round3VoteVoiceGainNodeRef.current = null;
          }
        };
      } catch (err) {
        console.error('Не удалось воспроизвести голос для голосования Раунда 3', err);
      }
    })();
  }, []);

  const stopRound3VoteTimerAudio = useCallback(() => {
    round3VoteTimerPlaybackTokenRef.current += 1;

    const timerSource = round3VoteTimerBufferSourceRef.current;
    if (timerSource) {
      try {
        timerSource.onended = null;
        timerSource.stop(0);
      } catch {
        // ignore
      }
      try {
        timerSource.disconnect();
      } catch {
        // ignore
      }
      round3VoteTimerBufferSourceRef.current = null;
    }

    const timerGain = round3VoteTimerGainNodeRef.current;
    if (timerGain) {
      try {
        timerGain.disconnect();
      } catch {
        // ignore
      }
      round3VoteTimerGainNodeRef.current = null;
    }
  }, []);

  const playRound3Audio = useCallback(
    (index: number) => {
      stopRound3Audio();
      setRound3AudioBlocked(false);

      const token = round3PlaybackTokenRef.current + 1;
      round3PlaybackTokenRef.current = token;

      const bgUrl = buildAudioUrl(ROUND3_BG_JINGLE_FILE);
      const currentQ = round3Questions[index];
      const voiceFileNumber = getRound3AudioOrdinal(currentQ?.originalIndex ?? index);
      const round3Dir = packIdRef.current === '03012026' ? 'round3/questions' : ROUND3_QUESTIONS_AUDIO_DIR;
      const voiceUrl = buildAudioUrl(`${round3Dir}/${voiceFileNumber}.mp3`);
      const timerUrl = buildAudioUrl(ROUND3_ANSWER_TIMER_JINGLE_FILE);

      void (async () => {
        if (typeof window === 'undefined') {
          setRound3AudioBlocked(true);
          return;
        }

        const AudioContextCtor =
          window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

        if (!AudioContextCtor) {
          setRound3AudioBlocked(true);
          return;
        }

        let context = audioContextRef.current;
        if (!context) {
          context = new AudioContextCtor();
          audioContextRef.current = context;
        }

        if (context.state === 'suspended') {
          try {
            await context.resume();
          } catch (error) {
            console.error('Не удалось активировать аудиоконтекст для Раунда 3', error);
            setRound3AudioBlocked(true);
            return;
          }
        }

        if (round3PlaybackTokenRef.current !== token) {
          return;
        }

        const decodeFromUrl = async (url: string) => {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} for ${url}`);
          }
          const bytes = await res.arrayBuffer();
          return await context.decodeAudioData(bytes.slice(0));
        };

        try {
          const [bgBuffer, voiceBuffer, timerBuffer] = await Promise.all([
            decodeFromUrl(bgUrl),
            decodeFromUrl(voiceUrl),
            decodeFromUrl(timerUrl),
          ]);

          if (round3PlaybackTokenRef.current !== token) {
            return;
          }

          const bgSource = context.createBufferSource();
          bgSource.buffer = bgBuffer;
          bgSource.loop = true;

          const bgGain = context.createGain();
          bgGain.gain.value = isMusicMutedRef.current ? 0 : ROUND3_BG_VOLUME;

          const voiceSource = context.createBufferSource();
          voiceSource.buffer = voiceBuffer;
          voiceSource.loop = false;

          const voiceGain = context.createGain();
          voiceGain.gain.value = isVoiceMutedRef.current ? 0 : 1;

          const timerSource = context.createBufferSource();
          timerSource.buffer = timerBuffer;
          timerSource.loop = false;
          // Во время ответа таймерный джингл играет в обычной скорости.
          try {
            timerSource.playbackRate.value = 1;
          } catch {
            // ignore
          }

          const timerGain = context.createGain();
          timerGain.gain.value = isMusicMutedRef.current ? 0 : ROUND3_TIMER_VOLUME;

          bgSource.connect(bgGain);
          bgGain.connect(context.destination);

          voiceSource.connect(voiceGain);
          voiceGain.connect(context.destination);

          timerSource.connect(timerGain);
          timerGain.connect(context.destination);

          round3BgBufferSourceRef.current = bgSource;
          round3VoiceBufferSourceRef.current = voiceSource;
          round3AnswerTimerBufferSourceRef.current = timerSource;
          round3BgGainNodeRef.current = bgGain;
          round3VoiceGainNodeRef.current = voiceGain;
          round3AnswerTimerGainNodeRef.current = timerGain;

          const stopBg = () => {
            const currentBg = round3BgBufferSourceRef.current;
            if (currentBg) {
              try {
                currentBg.stop(0);
              } catch {
                // ignore
              }
              try {
                currentBg.disconnect();
              } catch {
                // ignore
              }
              round3BgBufferSourceRef.current = null;
            }

            const currentBgGain = round3BgGainNodeRef.current;
            if (currentBgGain) {
              try {
                currentBgGain.disconnect();
              } catch {
                // ignore
              }
              round3BgGainNodeRef.current = null;
            }
          };

          voiceSource.onended = () => {
            stopBg();

            void (async () => {
              if (round3PlaybackTokenRef.current !== token) {
                return;
              }
              if (roomStatusRef.current !== 'round3-running') {
                return;
              }

              // Таймер должен стартовать только после окончания озвучки.
              let offset = timeOffsetMs;
              try {
                const { data } = await supabase.rpc('get_server_time');
                if (data) {
                  const serverNow = new Date(data as string).getTime();
                  const nextOffset = Date.now() - serverNow;
                  offset = nextOffset;
                  setTimeOffsetMs(nextOffset);
                }
              } catch (error) {
                console.error('Не удалось синхронизировать время сервера (round3 timer start)', error);
              }

              const startedAt = new Date(Date.now() - offset).toISOString();

              if (round3PlaybackTokenRef.current !== token) {
                return;
              }

              const { error: updateError } = await supabase
                .from('rooms')
                .update({
                  question_started_at: startedAt,
                  all_players_answered: false,
                })
                .eq('id', roomId);

              if (updateError) {
                console.error('Не удалось установить question_started_at для таймера Раунда 3', updateError);
                return;
              }

              setQuestionStartedAt(startedAt);
              const totalRound3Seconds =
                ROUND3_ANSWER_SECONDS + ROUND3_VOTE_COUNTDOWN_SECONDS + ROUND3_VOTE_SECONDS;
              setTimeLeft(getRemainingSeconds(startedAt, totalRound3Seconds, offset));

              if (round3AnswerTimerVoteVoiceTimeoutRef.current) {
                clearTimeout(round3AnswerTimerVoteVoiceTimeoutRef.current);
                round3AnswerTimerVoteVoiceTimeoutRef.current = null;
              }

              // В конце фазы ответа запускаем рандомный голос vote/*.mp3 (подводка к голосованию).
              round3AnswerTimerVoteVoiceTimeoutRef.current = setTimeout(() => {
                if (round3PlaybackTokenRef.current !== token) {
                  return;
                }
                if (roomStatusRef.current !== 'round3-running') {
                  return;
                }
                playRound3VoteVoiceAudio();
              }, Math.max(0, ROUND3_ANSWER_SECONDS * 1000));

              if (round3PlaybackTokenRef.current !== token) {
                return;
              }

              try {
                const startTimerAt = context.currentTime + 0.01;
                timerSource.start(startTimerAt);
                timerSource.stop(startTimerAt + totalRound3Seconds);
              } catch (err) {
                console.error('Не удалось запустить таймерный джингл Раунда 3', err);
              }
            })();
          };

          timerSource.onended = () => {
            const currentTimer = round3AnswerTimerBufferSourceRef.current;
            if (currentTimer) {
              try {
                currentTimer.disconnect();
              } catch {
                // ignore
              }
              round3AnswerTimerBufferSourceRef.current = null;
            }

            const currentTimerGain = round3AnswerTimerGainNodeRef.current;
            if (currentTimerGain) {
              try {
                currentTimerGain.disconnect();
              } catch {
                // ignore
              }
              round3AnswerTimerGainNodeRef.current = null;
            }
          };

          const startAt = context.currentTime + 0.01;
          bgSource.start(startAt);
          voiceSource.start(startAt);
        } catch (err) {
          console.error('Не удалось воспроизвести аудио Раунда 3 через AudioContext', err);
          setRound3AudioBlocked(true);
        }
      })();
    },
    [playRound3VoteVoiceAudio, roomId, round3Questions, stopRound3Audio, timeOffsetMs]
  );

  const stopRound3VoteAudio = useCallback(() => {
    // Full stop: cancel both timer + voice and release nodes.
    round3VoteTimerPlaybackTokenRef.current += 1;
    round3VoteVoicePlaybackTokenRef.current += 1;

    stopRound3VoteTimerAudio();

    const voteSource = round3VoteVoiceBufferSourceRef.current;
    if (voteSource) {
      try {
        voteSource.onended = null;
        voteSource.stop(0);
      } catch {
        // ignore
      }
      try {
        voteSource.disconnect();
      } catch {
        // ignore
      }
      round3VoteVoiceBufferSourceRef.current = null;
    }

    const voteGain = round3VoteVoiceGainNodeRef.current;
    if (voteGain) {
      try {
        voteGain.disconnect();
      } catch {
        // ignore
      }
      round3VoteVoiceGainNodeRef.current = null;
    }
  }, [stopRound3VoteTimerAudio]);


  const playRound3VoteAudio = useCallback(
    (questionIndex: number) => {
      if (typeof window === 'undefined') {
        return;
      }
      // Important: do NOT stop/cancel vote voice here.
      // The vote voice clip starts at the end of the answer phase and must play fully.
      stopRound3VoteTimerAudio();

      const token = round3VoteTimerPlaybackTokenRef.current + 1;
      round3VoteTimerPlaybackTokenRef.current = token;

      const timerUrl = buildAudioUrl(ROUND3_VOTE_TIMER_JINGLE_FILE);
      // Голос диктора (vote/*.mp3) стартует на фазе обратного отсчёта,
      // чтобы игроки слышали подготовку к голосованию.

      void (async () => {
        const AudioContextCtor =
          window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) {
          return;
        }

        let context = audioContextRef.current;
        if (!context) {
          context = new AudioContextCtor();
          audioContextRef.current = context;
        }

        if (context.state === 'suspended') {
          try {
            await context.resume();
          } catch {
            return;
          }
        }

        if (round3VoteTimerPlaybackTokenRef.current !== token) {
          return;
        }

        const decodeFromUrl = async (url: string) => {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} for ${url}`);
          }
          const bytes = await res.arrayBuffer();
          return await context.decodeAudioData(bytes.slice(0));
        };

        try {
          const timerBuffer = await decodeFromUrl(timerUrl);

          if (round3VoteTimerPlaybackTokenRef.current !== token) {
            return;
          }

          const timerSource = context.createBufferSource();
          timerSource.buffer = timerBuffer;
          timerSource.loop = false;
          // Во время голосования хотим уложить 30-сек джингл ровно в 15 секунд.
          // AudioBufferSourceNode поддерживает playbackRate: 2x ≈ вдвое быстрее.
          try {
            timerSource.playbackRate.value = 2;
          } catch {
            // ignore
          }

          const timerGain = context.createGain();
          timerGain.gain.value = isMusicMutedRef.current ? 0 : ROUND3_TIMER_VOLUME;

          timerSource.connect(timerGain);
          timerGain.connect(context.destination);

          round3VoteTimerBufferSourceRef.current = timerSource;
          round3VoteTimerGainNodeRef.current = timerGain;

          const startAt = context.currentTime + 0.01;
          try {
            timerSource.start(startAt);
            timerSource.stop(startAt + ROUND3_VOTE_SECONDS);
          } catch {
            // ignore
          }

          timerSource.onended = () => {
            try {
              timerSource.disconnect();
            } catch {
              // ignore
            }
            try {
              timerGain.disconnect();
            } catch {
              // ignore
            }
            if (round3VoteTimerBufferSourceRef.current === timerSource) {
              round3VoteTimerBufferSourceRef.current = null;
            }
            if (round3VoteTimerGainNodeRef.current === timerGain) {
              round3VoteTimerGainNodeRef.current = null;
            }
          };
        } catch (err) {
          console.error('Не удалось воспроизвести аудио голосования Раунда 3', err);
        }
      })();
    },
    [stopRound3VoteTimerAudio]
  );

  const loadRound3VoteAnswers = useCallback(async () => {
    if (roomStatus !== 'round3-running') {
      return;
    }
    try {
      setIsRound3VoteAnswersLoading(true);
      const { data, error } = await supabase
        .from('round3_answers')
        .select('id, player_id, text, submitted_at')
        .eq('room_id', roomId)
        .eq('question_index', currentQuestionIndex)
        .order('submitted_at', { ascending: true });

      if (error) {
        console.error('Не удалось загрузить ответы Раунда 3', error);
        setRound3VoteAnswers([]);
        return;
      }

      setRound3VoteAnswers((data || []) as Round3AnswerRow[]);
    } catch (err) {
      console.error('Не удалось загрузить ответы Раунда 3', err);
      setRound3VoteAnswers([]);
    } finally {
      setIsRound3VoteAnswersLoading(false);
    }
  }, [currentQuestionIndex, roomId, roomStatus]);

  useEffect(() => {
    if (!isRound3ResultsPhase) {
      return;
    }
    if (!questionStartedAt) {
      return;
    }
    if (isMirrorRef.current) return;
    const currentQ = currentRound3Question;
    if (!currentQ) {
      return;
    }

    const resultsKey = `${currentQuestionIndex}-${questionStartedAt}-scoring`;
    if (lastRound3ResultsScoringKeyRef.current === resultsKey) {
      return;
    }

    // Mark as handled early to avoid double scoring during re-renders.
    lastRound3ResultsScoringKeyRef.current = resultsKey;

    const score = async () => {
      try {
        const { data, error } = await supabase
          .from('round3_answers')
          .select('id, player_id, text, submitted_at')
          .eq('room_id', roomId)
          .eq('question_index', currentQuestionIndex)
          .order('submitted_at', { ascending: false });

        if (error) {
          console.error('Не удалось загрузить ответы Раунда 3 для начисления', error);
          setRound3ScoredAnswers([]);
          setRound3VotersCount(0);
          setRound3SkippedVoterIds([]);
          return;
        }
        const { data: votesData, error: votesError } = await supabase
          .from('round3_votes')
          .select('voter_player_id, answer_id')
          .eq('room_id', roomId)
          .eq('question_index', currentQuestionIndex);

        if (votesError) {
          console.error('Не удалось загрузить голоса Раунда 3', votesError);
        }

        const acceptableRaw = [currentQ.answer ?? '', ...(currentQ.acceptable ?? [])].filter(Boolean);
        const acceptable = new Set(acceptableRaw.map(normalizeRound3FreeText));
        const deduped = new Map<string, Round3AnswerRow>();

        for (const row of (data || []) as Round3AnswerRow[]) {
          if (!deduped.has(row.player_id)) {
            deduped.set(row.player_id, row);
          }
        }

        const votesByAnswer = new Map<string, number>();
        const voters = new Set<string>();

        for (const vote of (votesData || []) as Round3VoteRow[]) {
          voters.add(vote.voter_player_id);
          votesByAnswer.set(vote.answer_id, (votesByAnswer.get(vote.answer_id) ?? 0) + 1);
        }

        const snapshotPlayers = playersRef.current;
        const skippedVoters = snapshotPlayers.map((p) => p.id).filter((playerId) => !voters.has(playerId));

        const skippedSet = new Set(skippedVoters);
        const answeredSet = new Set<string>();

        const scoredWithPenalty: Round3ScoredAnswer[] = Array.from(deduped.values()).map((row) => {
          answeredSet.add(row.player_id);

          const normalized = normalizeRound3FreeText(row.text ?? '');
          const isCorrect = normalized.length > 0 && acceptable.has(normalized);
          const basePoints = isCorrect ? ROUND3_POINTS : 0;
          const votes = votesByAnswer.get(row.id) ?? 0;
          const votePointsRaw = votes * ROUND3_VOTE_LIKE_POINTS;
          const penalty = skippedSet.has(row.player_id) ? ROUND3_VOTE_SKIP_PENALTY : 0;
          const votePoints = votePointsRaw - penalty;
          return {
            playerId: row.player_id,
            text: row.text,
            isCorrect,
            basePoints,
            votePoints,
            votes,
            pointsEarned: basePoints + votePoints,
          };
        });

        for (const playerId of skippedVoters) {
          if (answeredSet.has(playerId)) {
            continue;
          }
          scoredWithPenalty.push({
            playerId,
            text: 'Не голосовал',
            isCorrect: false,
            basePoints: 0,
            votePoints: -ROUND3_VOTE_SKIP_PENALTY,
            votes: 0,
            pointsEarned: -ROUND3_VOTE_SKIP_PENALTY,
          });
        }

        setRound3ScoredAnswers(scoredWithPenalty);
        setRound3VotersCount(voters.size);
        setRound3SkippedVoterIds(skippedVoters);

        const updates = new Map<string, number>();

        for (const entry of scoredWithPenalty) {
          if (entry.pointsEarned !== 0) {
            updates.set(entry.playerId, (updates.get(entry.playerId) ?? 0) + entry.pointsEarned);
          }
        }

        if (updates.size === 0) {
          return;
        }

        const totalMap = new Map<string, number>();
        snapshotPlayers.forEach((player) => {
          totalMap.set(player.id, player.total_points ?? 0);
        });

        await Promise.all(
          Array.from(updates.entries()).map(async ([playerId, delta]) => {
            const currentTotal = totalMap.get(playerId) ?? 0;
            const nextTotal = currentTotal + delta;
            const { error: updateError } = await supabase.from('players').update({ total_points: nextTotal }).eq('id', playerId);
            if (updateError) {
              console.error('Не удалось обновить очки игрока (round3)', updateError);
            }
          })
        );

        loadPlayersRef.current?.();
      } catch (err) {
        console.error('Не удалось начислить очки в Раунде 3', err);
        setRound3ScoredAnswers([]);
        setRound3VotersCount(0);
        setRound3SkippedVoterIds([]);
      }
    };

    void score();
  }, [currentQuestionIndex, currentRound3Question, isRound3ResultsPhase, questionStartedAt, roomId]);

  const stopRound3ResultsAudio = useCallback(() => {
    const comment = round3CommentAudioRef.current;
    if (comment) {
      try {
        comment.onended = null;
        comment.pause();
      } catch {
        // ignore
      }
      round3CommentAudioRef.current = null;
    }

    const bg = round3CommentBgAudioRef.current;
    if (bg) {
      try {
        bg.pause();
      } catch {
        // ignore
      }
      round3CommentBgAudioRef.current = null;
    }
  }, []);

  const playRound3ResultsAudio = useCallback(
    (index: number) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      stopRound3ResultsAudio();

      const currentQ = round3Questions[index];
      const voiceFileNumber = getRound3AudioOrdinal(currentQ?.originalIndex ?? index);
      const commentUrl = buildAudioUrl(`${ROUND3_COMMENTS_AUDIO_DIR}/${voiceFileNumber}.mp3`);
      const bgUrl = buildAudioUrl(ROUND3_RESULTS_BG_FILE);

      const bg = new Audio(bgUrl);
      bg.loop = true;
      bg.volume = 0.25;
      round3CommentBgAudioRef.current = bg;

      const comment = new Audio(commentUrl);
      comment.volume = 0.95;
      round3CommentAudioRef.current = comment;

      bg.play().catch((err) => {
        console.error('Не удалось воспроизвести фон объяснения Раунда 3', err);
      });

      comment.onended = () => {
        stopRound3ResultsAudio();
        const isSameQuestion = currentRound3QuestionIndexRef.current === index && roomStatusRef.current === 'round3-running';
        const hasNext = index + 1 < round3QuestionCount;
        if (isSameQuestion) {
          if (hasNext) {
            const next = handleRound3NextQuestionRef.current;
            if (next) {
              void next();
            }
          } else {
            const finish = handleRound3CompleteRef.current;
            if (finish) {
              void finish();
            }
          }
        }
      };
      comment.play().catch((err) => {
        console.error('Не удалось воспроизвести комментарий Раунда 3', err);
        stopRound3ResultsAudio();
      });
    },
    [round3QuestionCount, round3Questions, stopRound3ResultsAudio]
  );

  useEffect(() => {
    if (roomStatus !== 'round3-running' || !questionStartedAt) {
      setRound3VoteAnswers([]);
      setIsRound3VoteAnswersLoading(false);
      setRound3ScoredAnswers([]);
      setRound3SkippedVoterIds([]);
      setRound3VotersCount(0);
      lastRound3VoteKeyRef.current = null;
      lastRound3VoteAnswersKeyRef.current = null;
      lastRound3VoteAudioKeyRef.current = null;
      lastRound3ResultsAudioKeyRef.current = null;
      lastRound3ResultsScoringKeyRef.current = null;
      stopRound3VoteAudio();
      stopRound3ResultsAudio();
      return;
    }

    const baseKey = `${currentQuestionIndex}-${questionStartedAt}`;

    if (round3Phase === 'vote' || round3Phase === 'vote-countdown') {
      if (lastRound3VoteAnswersKeyRef.current !== baseKey) {
        lastRound3VoteAnswersKeyRef.current = baseKey;
        void loadRound3VoteAnswers();
      }

      // Play vote timer once per question.
      if (round3Phase === 'vote') {
        const voteKey = `${baseKey}-vote`;
        if (lastRound3VoteAudioKeyRef.current !== voteKey) {
          lastRound3VoteAudioKeyRef.current = voteKey;
          playRound3VoteAudio(currentQuestionIndex);
        }
      }
    }

    // During results phase, load answers (for scoring) and play the comment audio once.
    if (isRound3ResultsPhase) {
      const resultsKey = `${baseKey}-results`;

      if (lastRound3VoteAnswersKeyRef.current !== baseKey) {
        lastRound3VoteAnswersKeyRef.current = baseKey;
        void loadRound3VoteAnswers();
      }

      if (lastRound3ResultsAudioKeyRef.current !== resultsKey) {
        lastRound3ResultsAudioKeyRef.current = resultsKey;
        playRound3ResultsAudio(currentQuestionIndex);
      }

      return;
    }

    // We intentionally do NOT stop/cancel the vote voice here.
    // It is scheduled to play at +30s (end of answer phase) and must not be cancelled
    // by re-renders during the answer phase.
    stopRound3VoteTimerAudio();
    stopRound3ResultsAudio();
    lastRound3VoteKeyRef.current = null;
    lastRound3ResultsAudioKeyRef.current = null;
    lastRound3ResultsScoringKeyRef.current = null;
  }, [currentQuestionIndex, isRound3ResultsPhase, loadRound3VoteAnswers, playRound3ResultsAudio, playRound3VoteAudio, questionStartedAt, roomStatus, round3Phase, stopRound3ResultsAudio, stopRound3VoteAudio, stopRound3VoteTimerAudio]);

  useEffect(() => {
    if (roomStatus !== 'round3-running') {
      stopRound3Audio();
      lastRound3PlaybackKeyRef.current = null;
    }
  }, [roomStatus, stopRound3Audio]);

  useEffect(() => {
    if (roomStatus !== 'round3-running') {
      return;
    }
    if (!currentRound3Question) {
      return;
    }

    const key = `${currentQuestionIndex}`;
    if (lastRound3PlaybackKeyRef.current === key) {
      return;
    }
    lastRound3PlaybackKeyRef.current = key;
    playRound3Audio(currentQuestionIndex);
  }, [currentQuestionIndex, currentRound3Question, playRound3Audio, roomStatus]);

  useEffect(() => {
    const loadRound2Data = async () => {
      const urls = getRound2QuestionUrls(packId);
      for (const url of urls) {
        try {
          const bust = url.includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`;
          const res = await fetch(`${url}${bust}`, { cache: 'no-store' });
          if (!res.ok) continue;
          const json = await res.json();
          const normalized = normalizeTrueFalseItems(json);
          const filtered = filterTrueFalseItemsForPack(normalized, packId);
          if (filtered.length === 0) continue;
          setRound2Items(filtered);
          return;
        } catch (e) {
          console.error('Failed to load round2 data from', url, e);
        }
      }
    };
    loadRound2Data();
  }, [packId]);

  useEffect(() => {
    const loadRound3Data = async () => {
      try {
        const url = `/api/round3/questions?roomId=${encodeURIComponent(roomId)}&count=${ROUND3_TOTAL_QUESTIONS}&packId=${encodeURIComponent(packId)}&t=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const payload = (await res.json()) as Round3QuestionsPayload;
        const questions = Array.isArray(payload?.questions) ? payload.questions : [];
        const withIndex = questions.map((q, i) => ({
          ...q,
          originalIndex: typeof q.originalIndex === 'number' ? q.originalIndex : i,
        }));
        // Используем порядок из API, чтобы он совпадал с экранами игроков.
        setRound3Questions(withIndex);
      } catch (e) {
        console.error('Failed to load round3 questions', e);
      }
    };

    if (roomId) {
      void loadRound3Data();
    }
  }, [packId, roomId]);

  useEffect(() => {
    const loadRound4Data = async () => {
      try {
        const res = await fetch(`${getQuestionsBaseUrl(packId)}/4round.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const payload = await res.json();
        const puzzles = Array.isArray(payload?.puzzles) ? (payload.puzzles as Round4Puzzle[]) : [];
        setRound4Puzzles(puzzles);
      } catch (e) {
        console.error('Failed to load round4 data', e);
      }
    };

    void loadRound4Data();
  }, [packId]);

  useEffect(() => {
    const loadRound5Data = async () => {
      try {
        const res = await fetch(`${getQuestionsBaseUrl(packId)}/5round_question.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) {
          return;
        }
        const payload = (await res.json()) as unknown;
        const questions = Array.isArray(payload) ? (payload as Round5Question[]) : [];
        setRound5Questions(questions);
      } catch (e) {
        console.error('Failed to load round5 questions', e);
      }
    };

    void loadRound5Data();
  }, [packId]);

  useEffect(() => {
    if (isRound2RulesVisible) {
      stopRoundEndAudio();
      stopTournamentJingle();
      playRound2RulesAudio();
    } else {
      stopRound2RulesAudio();
    }
  }, [isRound2RulesVisible, playRound2RulesAudio, stopRound2RulesAudio, stopRoundEndAudio, stopTournamentJingle]);

  useEffect(() => {
    if (isRound3RulesVisible) {
      stopRoundEndAudio();
      stopTournamentJingle();
      stopRound2RulesAudio();
      playRound3RulesAudio();
    } else {
      stopRound3RulesAudio();
    }
  }, [isRound3RulesVisible, playRound3RulesAudio, stopRound2RulesAudio, stopRound3RulesAudio, stopRoundEndAudio, stopTournamentJingle]);

  useEffect(() => {
    if (isRound4RulesVisible) {
      stopAllAudio();
      playRound4RulesAudio();
    } else {
      stopRound4RulesAudio();
    }
  }, [isRound4RulesVisible, playRound4RulesAudio, stopAllAudio, stopRound4RulesAudio]);

  useEffect(() => {
    if (!isRound5RulesVisible) {
      stopRound5RulesAudio();
      return;
    }

    if (isCountdownVisible || isRound5RulesAudioPlaying) {
      return;
    }

    hasUserInteractedRef.current = true;
    stopAllAudio();
    playRound5RulesAudio({
      onEnded: () => {
        if (!isRound5RulesVisibleRef.current) {
          return;
        }
        setIsRound5RulesVisible(false);
        startRound5CountdownRef.current?.();
      },
    });
  }, [isCountdownVisible, isRound5RulesAudioPlaying, isRound5RulesVisible, playRound5RulesAudio, stopAllAudio, stopRound5RulesAudio]);

  useEffect(() => {
    isRound2RulesVisibleRef.current = isRound2RulesVisible;
  }, [isRound2RulesVisible]);

  useEffect(() => {
    isRound3RulesVisibleRef.current = isRound3RulesVisible;
  }, [isRound3RulesVisible]);

  useEffect(() => {
    isRound4RulesVisibleRef.current = isRound4RulesVisible;
  }, [isRound4RulesVisible]);

  useEffect(() => {
    isRound5RulesVisibleRef.current = isRound5RulesVisible;
  }, [isRound5RulesVisible]);

  useEffect(() => {
    isRulesVisibleRef.current = isRulesVisible;
  }, [isRulesVisible]);

  useEffect(() => {
    isPrestartVisibleRef.current = isPrestartVisible;
  }, [isPrestartVisible]);

  useEffect(() => {
    isCountdownVisibleRef.current = isCountdownVisible;
  }, [isCountdownVisible]);

  useEffect(() => {
    countdownValueRef.current = countdownValue;
  }, [countdownValue]);

  useEffect(() => {
    countdownContextRef.current = countdownContext;
  }, [countdownContext]);

  // ─── Mirror broadcast channel: sync rules visibility between host & mirror ───
  const mirrorChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase.channel(`mirror-sync-${roomId}`);

    if (isMirror) {
      channel.on('broadcast', { event: 'rules-sync' }, ({ payload }: { payload: Record<string, boolean> }) => {
        if (payload.isPrestartVisible !== undefined) setIsPrestartVisible(payload.isPrestartVisible);
        if (payload.isRulesVisible !== undefined) setIsRulesVisible(payload.isRulesVisible);
        if (payload.isRound2RulesVisible !== undefined) setIsRound2RulesVisible(payload.isRound2RulesVisible);
        if (payload.isRound3RulesVisible !== undefined) setIsRound3RulesVisible(payload.isRound3RulesVisible);
        if (payload.isRound4RulesVisible !== undefined) setIsRound4RulesVisible(payload.isRound4RulesVisible);
        if (payload.isRound5RulesVisible !== undefined) setIsRound5RulesVisible(payload.isRound5RulesVisible);
      });
      channel.on('broadcast', { event: 'countdown-sync' }, ({ payload }: { payload: { visible: boolean; value?: string; context?: string } }) => {
        setIsCountdownVisible(payload.visible);
        if (payload.value !== undefined) setCountdownValue(payload.value);
        if (payload.context !== undefined) setCountdownContext(payload.context as 'round1' | 'round2' | 'round3' | 'round4' | 'round5');
      });
    } else {
      channel.on('broadcast', { event: 'mirror-sync-request' }, () => {
        void channel.send({
          type: 'broadcast',
          event: 'rules-sync',
          payload: {
            isPrestartVisible: isPrestartVisibleRef.current,
            isRulesVisible: isRulesVisibleRef.current,
            isRound2RulesVisible: isRound2RulesVisibleRef.current,
            isRound3RulesVisible: isRound3RulesVisibleRef.current,
            isRound4RulesVisible: isRound4RulesVisibleRef.current,
            isRound5RulesVisible: isRound5RulesVisibleRef.current,
          },
        });
        void channel.send({
          type: 'broadcast',
          event: 'countdown-sync',
          payload: {
            visible: isCountdownVisibleRef.current,
            value: countdownValueRef.current,
            context: countdownContextRef.current,
          },
        });
      });
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && isMirror) {
        void channel.send({
          type: 'broadcast',
          event: 'mirror-sync-request',
          payload: { requestedAt: Date.now() },
        });
      }
    });
    mirrorChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      mirrorChannelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Host: broadcast rules state changes to mirror
  useEffect(() => {
    if (isMirror || !mirrorChannelRef.current) return;
    void mirrorChannelRef.current.send({
      type: 'broadcast',
      event: 'rules-sync',
      payload: {
        isPrestartVisible,
        isRulesVisible,
        isRound2RulesVisible,
        isRound3RulesVisible,
        isRound4RulesVisible,
        isRound5RulesVisible,
      },
    });
  }, [isMirror, isPrestartVisible, isRulesVisible, isRound2RulesVisible, isRound3RulesVisible, isRound4RulesVisible, isRound5RulesVisible]);

  // Host: broadcast countdown state to mirror
  useEffect(() => {
    if (isMirror || !mirrorChannelRef.current) return;
    void mirrorChannelRef.current.send({
      type: 'broadcast',
      event: 'countdown-sync',
      payload: {
        visible: isCountdownVisible,
        value: countdownValue,
        context: countdownContext,
      },
    });
  }, [isMirror, isCountdownVisible, countdownValue, countdownContext]);

  const round2AwardedPointsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (roomStatus !== 'round4-running' || !questionStartedAt) {
      return;
    }

    const tick = () => {
      setTimeLeft(getRemainingSeconds(questionStartedAt, QUESTION_DURATION_SECONDS, timeOffsetMs));
    };

    tick();
    const intervalId = setInterval(tick, 250);
    return () => clearInterval(intervalId);
  }, [questionStartedAt, roomStatus, timeOffsetMs]);

  const resetRound2Stats = useCallback(() => {
    round2AwardedPointsRef.current.clear();
    round2StatsRef.current = new Map();
    round2CorrectTotalRef.current = 0;
    round2PossibleTotalRef.current = 0;
    round2LastAccuracyRef.current = 0;
    setRound2Leaderboard([]);
    setRound2LastAccuracy(0);
  }, []);

  const loadRound2Points = useCallback(async (): Promise<Map<string, number>> => {
    const pointsMap = new Map<string, number>();

    if (!roomId) {
      return pointsMap;
    }

    try {
      const { data, error } = await supabase
        .from('round2_answers')
        .select('player_id, points_earned')
        .eq('room_id', roomId);

      if (error) {
        console.error('Не удалось загрузить очки Раунда 2', error);
        return pointsMap;
      }

      for (const row of (data ?? []) as Array<{ player_id: string; points_earned: number }>) {
        const earned = Number.isFinite(row.points_earned) ? row.points_earned : 0;
        pointsMap.set(row.player_id, (pointsMap.get(row.player_id) ?? 0) + earned);
      }
    } catch (err) {
      console.error('Не удалось загрузить очки Раунда 2', err);
    }

    return pointsMap;
  }, [roomId]);

  const updateRound2Leaderboard = useCallback(async () => {
    const snapshot = playersRef.current;
    if (!snapshot.length) {
      setRound2Leaderboard([]);
      return;
    }

    const pointsMap = await loadRound2Points();

    const leaderboard = snapshot
      .map((player) => {
        const points = pointsMap.get(player.id) ?? 0;
        return {
          playerId: player.id,
          name: player.name,
          points,
          correct: 0, // Not used in this leaderboard
          attempts: 0, // Not used in this leaderboard
        };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.name.localeCompare(b.name);
      });

    setRound2Leaderboard(leaderboard);
  }, [loadRound2Points]);

  const recordRound2QuestionStats = useCallback(async () => {
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

    await updateRound2Leaderboard();
  }, [updateRound2Leaderboard]);

  const loadUsedRound2ItemIndices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('round2_answers')
        .select('item_index')
        .eq('room_id', roomId);

      if (error) {
        console.error('Не удалось загрузить использованные вопросы Раунда 2', error);
        return [] as number[];
      }

      const used = new Set<number>();
      for (const row of (data ?? []) as Array<{ item_index: number | null }>) {
        const idx = row.item_index;
        if (typeof idx === 'number' && Number.isFinite(idx)) {
          used.add(idx);
        }
      }

      return Array.from(used);
    } catch (err) {
      console.error('Не удалось загрузить использованные вопросы Раунда 2', err);
      return [] as number[];
    }
  }, [realtimeEnabled, roomId]);

  const loadUsedRound4PuzzleIds = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('round4_answers')
        .select('puzzle_id')
        .eq('room_id', roomId);

      if (error) {
        console.error('Не удалось загрузить использованные вопросы Раунда 4', error);
        return [] as number[];
      }

      const used = new Set<number>();
      for (const row of (data ?? []) as Array<{ puzzle_id: number | null }>) {
        const id = row.puzzle_id;
        if (typeof id === 'number' && Number.isFinite(id)) {
          used.add(id);
        }
      }

      return Array.from(used);
    } catch (err) {
      console.error('Не удалось загрузить использованные вопросы Раунда 4', err);
      return [] as number[];
    }
  }, [roomId]);

  const loadRound4RoundLeaderboard = useCallback(async () => {
    const key = `${roomId}-round4`;
    if (lastRound4RoundLeaderboardKeyRef.current === key) {
      return;
    }
    lastRound4RoundLeaderboardKeyRef.current = key;

    try {
      const { data, error } = await supabase
        .from('round4_answers')
        .select('player_id, points_earned')
        .eq('room_id', roomId);

      if (error) {
        console.error('Не удалось загрузить очки Раунда 4', error);
        setRound4RoundLeaderboard([]);
        return;
      }

      const pointsMap = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ player_id: string; points_earned: number }>) {
        pointsMap.set(row.player_id, (pointsMap.get(row.player_id) ?? 0) + (row.points_earned ?? 0));
      }

      const snapshot = playersRef.current;
      const leaderboard = snapshot
        .map((player) => ({
          playerId: player.id,
          name: player.name,
          points: pointsMap.get(player.id) ?? 0,
        }))
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return a.name.localeCompare(b.name);
        });

      setRound4RoundLeaderboard(leaderboard);
    } catch (err) {
      console.error('Не удалось загрузить очки Раунда 4', err);
      setRound4RoundLeaderboard([]);
    }
  }, [roomId]);

  const loadRound5RoundLeaderboard = useCallback(async () => {
    const key = `${roomId}-round5`;
    if (lastRound5RoundLeaderboardKeyRef.current === key) {
      return;
    }
    lastRound5RoundLeaderboardKeyRef.current = key;

    try {
      const { data, error } = await supabase
        .from('round5_answers')
        .select('player_id, points_earned')
        .eq('room_id', roomId);

      if (error) {
        console.error('Не удалось загрузить очки Раунда 5', error);
        setRound5RoundLeaderboard([]);
        return;
      }

      const pointsMap = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ player_id: string; points_earned: number }>) {
        pointsMap.set(row.player_id, (pointsMap.get(row.player_id) ?? 0) + (row.points_earned ?? 0));
      }

      const snapshot = playersRef.current;
      const leaderboard = snapshot
        .map((player) => ({
          playerId: player.id,
          name: player.name,
          points: pointsMap.get(player.id) ?? 0,
        }))
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return a.name.localeCompare(b.name);
        });

      setRound5RoundLeaderboard(leaderboard);
    } catch (err) {
      console.error('Не удалось загрузить очки Раунда 5', err);
      setRound5RoundLeaderboard([]);
    }
  }, [roomId]);

  const loadRound3RoundLeaderboard = useCallback(async () => {
    const key = `${roomId}-round3-${round3Questions.length}`;
    if (lastRound3RoundLeaderboardKeyRef.current === key) {
      return;
    }
    lastRound3RoundLeaderboardKeyRef.current = key;

    try {
      const snapshotPlayers = playersRef.current;
      if (!snapshotPlayers.length) {
        setRound3RoundLeaderboard([]);
        return;
      }

      const { data: answersData, error: answersError } = await supabase
        .from('round3_answers')
        .select('id, player_id, text, submitted_at, question_index')
        .eq('room_id', roomId)
        .order('submitted_at', { ascending: false });

      if (answersError) {
        console.error('Не удалось загрузить ответы Раунда 3', answersError);
        setRound3RoundLeaderboard([]);
        return;
      }

      const { data: votesData, error: votesError } = await supabase
        .from('round3_votes')
        .select('voter_player_id, answer_id, question_index')
        .eq('room_id', roomId);

      if (votesError) {
        console.error('Не удалось загрузить голоса Раунда 3', votesError);
      }

      const pointsMap = new Map<string, number>();
      snapshotPlayers.forEach((p) => pointsMap.set(p.id, 0));

      const answersByQuestion = new Map<number, Round3AnswerRowWithIndex[]>();
      for (const row of (answersData ?? []) as Round3AnswerRowWithIndex[]) {
        const idx = row.question_index;
        const bucket = answersByQuestion.get(idx) ?? [];
        bucket.push(row);
        answersByQuestion.set(idx, bucket);
      }

      const votesByQuestion = new Map<number, Round3VoteRowWithIndex[]>();
      for (const vote of (votesData ?? []) as Round3VoteRowWithIndex[]) {
        const idx = vote.question_index;
        const bucket = votesByQuestion.get(idx) ?? [];
        bucket.push(vote);
        votesByQuestion.set(idx, bucket);
      }

      for (let questionIndex = 0; questionIndex < ROUND3_TOTAL_QUESTIONS; questionIndex += 1) {
        const currentQ = round3Questions[questionIndex];
        const acceptableRaw = currentQ ? [currentQ.answer ?? '', ...(currentQ.acceptable ?? [])].filter(Boolean) : [];
        const acceptable = new Set(acceptableRaw.map(normalizeRound3FreeText));

        const rows = answersByQuestion.get(questionIndex) ?? [];
        const deduped = new Map<string, Round3AnswerRowWithIndex>();
        for (const row of rows) {
          if (!deduped.has(row.player_id)) {
            deduped.set(row.player_id, row);
          }
        }

        const votes = votesByQuestion.get(questionIndex) ?? [];
        const votesByAnswer = new Map<string, number>();
        const voters = new Set<string>();
        for (const vote of votes) {
          voters.add(vote.voter_player_id);
          votesByAnswer.set(vote.answer_id, (votesByAnswer.get(vote.answer_id) ?? 0) + 1);
        }

        const skippedSet = new Set(snapshotPlayers.map((p) => p.id).filter((id) => !voters.has(id)));
        const answeredSet = new Set<string>();

        for (const row of deduped.values()) {
          answeredSet.add(row.player_id);
          const normalized = normalizeRound3FreeText(row.text ?? '');
          const isCorrect = normalized.length > 0 && acceptable.has(normalized);
          const basePoints = isCorrect ? ROUND3_POINTS : 0;
          const likeVotes = votesByAnswer.get(row.id) ?? 0;
          const votePointsRaw = likeVotes * ROUND3_VOTE_LIKE_POINTS;
          const penalty = skippedSet.has(row.player_id) ? ROUND3_VOTE_SKIP_PENALTY : 0;
          const pointsEarned = basePoints + votePointsRaw - penalty;
          if (pointsEarned !== 0) {
            pointsMap.set(row.player_id, (pointsMap.get(row.player_id) ?? 0) + pointsEarned);
          }
        }

        for (const playerId of skippedSet) {
          if (answeredSet.has(playerId)) {
            continue;
          }
          pointsMap.set(playerId, (pointsMap.get(playerId) ?? 0) - ROUND3_VOTE_SKIP_PENALTY);
        }
      }

      const leaderboard = snapshotPlayers
        .map((player) => ({
          playerId: player.id,
          name: player.name,
          points: pointsMap.get(player.id) ?? 0,
        }))
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return a.name.localeCompare(b.name);
        });

      setRound3RoundLeaderboard(leaderboard);
    } catch (err) {
      console.error('Не удалось загрузить очки Раунда 3', err);
      setRound3RoundLeaderboard([]);
    }
  }, [roomId, round3Questions]);

  useEffect(() => {
    if (!isTournamentVisible) {
      return;
    }
    if (roomStatus === 'final-results') {
      void loadRound5RoundLeaderboard();
      return;
    }
    if (isFinalRoundAvailable) {
      void loadRound4RoundLeaderboard();
      return;
    }
    void loadRound3RoundLeaderboard();
  }, [
    isTournamentVisible,
    roomStatus,
    isFinalRoundAvailable,
    loadRound3RoundLeaderboard,
    loadRound4RoundLeaderboard,
    loadRound5RoundLeaderboard,
  ]);

  const playRound2FactAudio = useCallback(
    (index: number, isFact: boolean) => {
      if (!hasUserInteractedRef.current) return;
      stopRound2Audio();

      const folder = isFact ? 'round2/true' : 'round2/false';
      const ordinal = getRound2AudioOrdinal(index, isFact);
      const prefix = isFact ? 'true' : 'false';
      const filePath = `${folder}/${prefix}${ordinal}.mp3`;
      const audio = new Audio(buildAudioUrl(filePath));
      audio.volume = 0.95;
      round2FactAudioRef.current = audio;

      const jingle = new Audio(buildAudioUrl(QUESTION_JINGLE_FILE));
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

      const ordinal = getRound2AudioOrdinal(index, true);
      const voice = new Audio(buildAudioUrl(`round2/explanation/${ordinal}.mp3`));
      voice.volume = isVoiceMutedRef.current ? 0 : 0.95;

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

      const ordinal = getRound2AudioOrdinal(index, false);
      const voice = new Audio(buildAudioUrl(`round2/fictionExplanation/${ordinal}.mp3`));
      voice.volume = isVoiceMutedRef.current ? 0 : 0.95;

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
      dispatchRoundEvent({
        type: 'SERVER_UPDATE',
        status: nextStatus,
        allAnswered: serverAllPlayersAnswered,
        startedAt: questionStartedAt,
        transitioningToNext: true,
      });
      if (nextStatus !== 'waiting') {
        setIsPrestartVisible(false);
        setIsRulesVisible(false);
        setIsCountdownVisible(false);
        clearCountdownTimeout();
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
        if (nextStatus !== 'round4-running') {
          setRound4CurrentPuzzle(null);
          setRound4AnswerRows([]);
          setIsRound4Scoring(false);
          round4CurrentPuzzleIdRef.current = null;
        }
      if (nextStatus !== 'round5-running' && nextStatus !== 'round5-explanation') {
        setRound5CurrentBankIndex(null);
        setRound5CurrentQuestion(null);
        setIsRound5Scoring(false);
        stopRound5Audio();
        lastRound5QuestionPlaybackKeyRef.current = null;
        lastRound5ExplanationPlaybackKeyRef.current = null;
      }
    },
    [
      clearCountdownTimeout,
      clearRound2Timer,
      setRound2CurrentIndex,
      setRound2Phase,
      stopRound2Audio,
      stopRound2RulesAudio,
        setRound4AnswerRows,
        setRound4CurrentPuzzle,
      stopRound5Audio,
    ]
  );

  const syncTimerWithStart = useCallback(
    (startedAt: string | null, offsetOverride?: number) => {
      const effectiveOffset = typeof offsetOverride === 'number' ? offsetOverride : timeOffsetMs;
      setQuestionStartedAt(startedAt);
      setTimeLeft(getRemainingSeconds(startedAt, QUESTION_DURATION_SECONDS, effectiveOffset));
    },
    [timeOffsetMs]
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const summaryQuestions = useMemo<Question[]>(() => {
    if (!selectedQuestionIds.length) {
      return [];
    }
    return buildQuestionsFromSelection(selectedQuestionIds, round1BankRef.current);
  }, [selectedQuestionIds, packId]);

  const playerRatings = useMemo(() => {
    return [...players].sort((a, b) => b.total_points - a.total_points);
  }, [players]);

  const tournamentLeaderboard = useMemo(() => {
    return [...players].sort((a, b) => b.total_points - a.total_points || a.name.localeCompare(b.name));
  }, [players]);

  const postRoundLeaderboard = useMemo(() => {
    if (roomStatus === 'final-results') {
      return round5RoundLeaderboard;
    }
    if (isFinalRoundAvailable) {
      return round4RoundLeaderboard;
    }
    return round3RoundLeaderboard;
  }, [isFinalRoundAvailable, roomStatus, round3RoundLeaderboard, round4RoundLeaderboard, round5RoundLeaderboard]);

  const postRoundStaggerMs = 130;

  const loadQuestionFromSelection = useCallback(
    (questionIndex: number, selectionOverride?: number[]) => {
      const sourceSelection = selectionOverride && selectionOverride.length ? selectionOverride : selectedQuestionIds;
      if (!sourceSelection.length) {
        setQuestion(null);
        return;
      }
      const nextQuestion = getQuestionForIndex(sourceSelection, questionIndex, round1BankRef.current);
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

      // Ignore stale responses from previous question index (important for mirror stability).
      if (questionIndex !== currentRound3QuestionIndexRef.current) {
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

      // Guard against races: an in-flight fetch for the previous item can resolve after
      // the next question has already started, which would incorrectly flip UI state
      // (e.g. stop the new timer and jump to explanation).
      if (round2CurrentIndexRef.current !== itemIndex) {
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

  const loadRound4AnswerStats = useCallback(
    async (puzzleId: number | null) => {
      if (puzzleId === null || puzzleId === undefined) {
        setAnswerCount(0);
        setCorrectAnswerCount(0);
        setAnsweredPlayerIds([]);
        return;
      }

      const { data, error } = await supabase
        .from('round4_answers')
        .select('player_id, submitted_at', { count: 'exact' })
        .eq('room_id', roomId)
        .eq('puzzle_id', puzzleId)
        .order('submitted_at', { ascending: true });

      if (error) {
        console.error('Не удалось загрузить ответы Раунда 4', error);
        setAnswerCount(0);
        setAnsweredPlayerIds([]);
        return;
      }

      const rows = (data || []) as Array<{ player_id: string; submitted_at: string }>;
      const uniqueMap = new Map<string, { player_id: string; submitted_at: string }>();
      for (const row of rows) {
        uniqueMap.set(row.player_id, row);
      }
      const unique = Array.from(uniqueMap.values());
      const ids = unique.map((row) => row.player_id);

      setAnsweredPlayerIds(ids);
      setAnswerCount(ids.length);
      setCorrectAnswerCount(0);

      const everyoneHandled = totalPlayerCount > 0 && ids.length >= totalPlayerCount;
      if (everyoneHandled !== serverAllPlayersAnswered) {
        setServerAllPlayersAnswered(everyoneHandled);
      }
    },
    [roomId, serverAllPlayersAnswered, totalPlayerCount]
  );

  const loadRound4AnswerStatsRef = useRef(loadRound4AnswerStats);

  useEffect(() => {
    loadRound4AnswerStatsRef.current = loadRound4AnswerStats;
  }, [loadRound4AnswerStats]);

  const loadRound5AnswerStats = useCallback(
    async (bankQuestionIndex: number | null) => {
      if (bankQuestionIndex === null || bankQuestionIndex === undefined) {
        setAnswerCount(0);
        setCorrectAnswerCount(0);
        setAnsweredPlayerIds([]);
        return;
      }

      const { data, error } = await supabase
        .from('round5_answers')
        .select('player_id, submitted_at', { count: 'exact' })
        .eq('room_id', roomId)
        .eq('question_index', bankQuestionIndex)
        .order('submitted_at', { ascending: true });

      if (error) {
        console.error('Не удалось загрузить ответы Раунда 5', error);
        setAnswerCount(0);
        setAnsweredPlayerIds([]);
        return;
      }

      const rows = (data || []) as Array<{ player_id: string; submitted_at: string }>;
      const uniqueMap = new Map<string, { player_id: string; submitted_at: string }>();
      for (const row of rows) {
        uniqueMap.set(row.player_id, row);
      }
      const unique = Array.from(uniqueMap.values());
      const ids = unique.map((row) => row.player_id);

      setAnsweredPlayerIds(ids);
      setAnswerCount(ids.length);
      setCorrectAnswerCount(0);

      const everyoneHandled = totalPlayerCount > 0 && ids.length >= totalPlayerCount;
      if (everyoneHandled !== serverAllPlayersAnswered) {
        setServerAllPlayersAnswered(everyoneHandled);
      }
    },
    [roomId, serverAllPlayersAnswered, totalPlayerCount]
  );

  const loadRound5AnswerRows = useCallback(
    async (bankQuestionIndex: number | null) => {
      if (bankQuestionIndex === null || bankQuestionIndex === undefined) {
        setRound5AnswerRows([]);
        return;
      }

      const { data, error } = await supabase
        .from('round5_answers')
        .select('id, player_id, answer_value, points_earned, submitted_at')
        .eq('room_id', roomId)
        .eq('question_index', bankQuestionIndex)
        .order('submitted_at', { ascending: true });

      if (error) {
        console.error('Не удалось загрузить ответы Раунда 5', error);
        setRound5AnswerRows([]);
        return;
      }

      const rows = (data ?? []) as Round5AnswerRow[];
      const latestByPlayer = new Map<string, Round5AnswerRow>();
      for (const row of rows) {
        latestByPlayer.set(row.player_id, row);
      }

      const unique = Array.from(latestByPlayer.values()).sort((a, b) =>
        String(a.submitted_at).localeCompare(String(b.submitted_at))
      );
      setRound5AnswerRows(unique);
    },
    [roomId]
  );

  const loadRound5AnswerRowsRef = useRef(loadRound5AnswerRows);

  useEffect(() => {
    loadRound5AnswerRowsRef.current = loadRound5AnswerRows;
  }, [loadRound5AnswerRows]);

  const loadRound5AnswerStatsRef = useRef(loadRound5AnswerStats);

  useEffect(() => {
    loadRound5AnswerStatsRef.current = loadRound5AnswerStats;
  }, [loadRound5AnswerStats]);

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
          .select('*')
          .eq('id', roomId)
          .single();

        if (roomError || !room) {
          console.error('Room not found or error:', roomError);
          setError('Комната не найдена или недоступна');
          return;
        }

        const storedPack = normalizePackId(localStorage.getItem('hostPackId'));
        const rawPack = (room as { pack_id?: unknown }).pack_id;
        const nextPack = rawPack ? normalizePackId(rawPack) : storedPack;
        if (nextPack !== packIdRef.current) {
          setPackId(nextPack);
        }

        const selection = (room.selected_question_ids as number[] | null) || [];
        setSelectedQuestionIds(selection);
        setRoomCode(room.code);
        setCurrentQuestionIndex(room.current_question_index);
        const detectedStatus = (room.status as RoomStatus) || 'waiting';
        updateRoomStatus(detectedStatus);
        const isLiveRound =
          detectedStatus === 'running' ||
          detectedStatus === 'round2-running' ||
          detectedStatus === 'round3-running' ||
          detectedStatus === 'round4-running' ||
          detectedStatus === 'round5-running' ||
          detectedStatus === 'round5-explanation';
        const everyoneAnsweredFlag = isLiveRound ? !!room.all_players_answered : false;
        setServerAllPlayersAnswered(everyoneAnsweredFlag);
        dispatchRoundEvent({
          type: 'SERVER_UPDATE',
          status: detectedStatus,
          allAnswered: everyoneAnsweredFlag,
          startedAt: room.question_started_at,
          transitioningToNext: Boolean((room as { transitioning_to_next?: boolean | null }).transitioning_to_next),
        });
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
        setShowResults(false);
        setQuestion(null);
        const usedRound2Indices = await loadUsedRound2ItemIndices();
        const normalizedRound2Used = Array.from(
          new Set([
            ...usedRound2Indices,
            ...(typeof nextRound2Index === 'number' && Number.isFinite(nextRound2Index) ? [nextRound2Index] : []),
          ])
        );
        setRound2AskedIndices(normalizedRound2Used);
        round2AskedIndicesRef.current = normalizedRound2Used;
        const round2Total = Math.min(ROUND2_TOTAL_QUESTIONS, round2ItemsRef.current.length || ROUND2_TOTAL_QUESTIONS);
        const nextRound2QuestionCounter = Math.min(
          Math.max(normalizedRound2Used.length, typeof nextRound2Index === 'number' ? 1 : 0),
          round2Total
        );
        setRound2QuestionCounter(nextRound2QuestionCounter);
        round2QuestionCounterRef.current = nextRound2QuestionCounter;
        if (nextRound2Index !== round2CurrentIndexRef.current) {
          setAnswerCount(0);
          setCorrectAnswerCount(0);
          setAnsweredPlayerIds([]);
        }
        syncTimerWithStart(room.question_started_at, effectiveOffset);
        if (room.all_players_answered) {
          setTimeLeft(0);
        }
        await loadRound2AnswerStats(nextRound2Index);
      } else if (detectedStatus === 'round3-running') {
        setShowResults(false);
        setQuestion(null);
        setAnswerCount(0);
        setCorrectAnswerCount(0);
        setAnsweredPlayerIds([]);
        if (room.question_started_at) {
          syncTimerWithStart(room.question_started_at, effectiveOffset);
        } else {
          setQuestionStartedAt(null);
          setTimeLeft(QUESTION_DURATION_SECONDS);
        }
        if (room.all_players_answered) {
          setTimeLeft(0);
        }
        await loadRound2AnswerStats(null, { preserveRound1Counters: true });
      } else if (detectedStatus === 'round4-running') {
        const puzzleId = room.current_question_index;
        const puzzle = round4Puzzles.find((p) => p.id === puzzleId) ?? null;
        const usedRound4Ids = await loadUsedRound4PuzzleIds();
        const normalizedRound4AskedIds = Array.from(
          new Set([
            ...usedRound4Ids,
            ...(typeof puzzleId === 'number' && Number.isFinite(puzzleId) ? [puzzleId] : []),
          ])
        );
        setRound4AskedIds(normalizedRound4AskedIds);
        round4AskedIdsRef.current = normalizedRound4AskedIds;
        round4CurrentPuzzleIdRef.current = puzzleId;
        setRound4CurrentPuzzle(puzzle ?? null);
        setShowResults(false);
        setQuestion(null);
        await loadRound4AnswerStats(puzzleId);
        if (room.question_started_at) {
          syncTimerWithStart(room.question_started_at, effectiveOffset);
        } else {
          setQuestionStartedAt(null);
          setTimeLeft(QUESTION_DURATION_SECONDS);
        }
        if (room.all_players_answered) {
          setTimeLeft(0);
        }
        await loadRound2AnswerStats(null, { preserveRound1Counters: true });
      } else if (detectedStatus === 'round5-running' || detectedStatus === 'round5-explanation') {
        setIsTournamentVisible(false);
        setShowResults(false);
        setQuestion(null);
        setAnswerCount(0);
        setCorrectAnswerCount(0);
        setAnsweredPlayerIds([]);
        setRound5AnswerRows([]);
        setRound4CurrentPuzzle(null);
        setRound4AnswerRows([]);

        const bank = round5QuestionsRef.current;
        const tourIndex = room.current_question_index ?? 0;
        const bankIndex = typeof selection[tourIndex] === 'number' ? selection[tourIndex] : null;
        setRound5CurrentBankIndex(bankIndex);
        setRound5CurrentQuestion(bankIndex !== null ? bank[bankIndex] ?? null : null);

        if (detectedStatus === 'round5-running') {
          syncTimerWithStart(room.question_started_at, effectiveOffset);
          if (room.all_players_answered) {
            setTimeLeft(0);
          }
        } else {
          setQuestionStartedAt(room.question_started_at);
          setTimeLeft(0);
        }

        await loadRound5AnswerStats(bankIndex);
        await loadRound5AnswerRows(bankIndex);
        await loadRound2AnswerStats(null, { preserveRound1Counters: true });
      } else if (detectedStatus === 'final-results') {
        setIsTournamentVisible(true);
        setIsFinalRoundAvailable(false);
        setShowResults(false);
        setQuestion(null);
        setAnswerCount(0);
        setCorrectAnswerCount(0);
        setAnsweredPlayerIds([]);
        setQuestionStartedAt(null);
        setTimeLeft(0);
        setServerAllPlayersAnswered(false);
        await loadRound2AnswerStats(null, { preserveRound1Counters: true });
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
      loadUsedRound2ItemIndices,
      loadPlayers,
      syncTimerWithStart,
      updateRoomStatus,
      setQuestion,
      setRound2CurrentIndex,
      setRound2Phase,
      round4Puzzles,
      loadUsedRound4PuzzleIds,
      loadRound4AnswerStats,
      loadRound5AnswerStats,
      loadRound5AnswerRows,
      dispatchRoundEvent,
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

    const nextAudio = new Audio('/audio/sound/jingle-lobby.mp3');
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

  const stopJoinSound = useCallback(() => {
    const audio = lastJoinAudioRef.current;
    if (!audio) {
      return;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
    audio.onended = null;
    audio.onerror = null;
    lastJoinAudioRef.current = null;
  }, []);

  const stopAnswerDuckSound = useCallback(() => {
    const audio = lastAnswerDuckAudioRef.current;
    if (!audio) {
      return;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
    audio.onended = null;
    audio.onerror = null;
    lastAnswerDuckAudioRef.current = null;
  }, []);

  const playAnswerDuckSound = useCallback(async () => {
    if (!hasUserInteractedRef.current || isVoiceMutedRef.current) {
      return;
    }

    stopAnswerDuckSound();
    const file = pickRandomItem(ANSWER_DUCK_AUDIO_FILES);
    const audio = new Audio(buildAudioUrl(file));
    audio.volume = 0.9;
    lastAnswerDuckAudioRef.current = audio;
    try {
      await audio.play();
    } catch (err) {
      console.error('Не удалось проиграть звук ответа игрока', err);
    }
  }, [stopAnswerDuckSound]);

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
    const bg = rulesBgAudioRef.current;
    if (!audio && !bg) {
      return;
    }
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      audio.onerror = null;
      rulesAudioRef.current = null;
    }
    if (bg) {
      bg.pause();
      bg.currentTime = 0;
      bg.onended = null;
      bg.onerror = null;
      rulesBgAudioRef.current = null;
    }
    rulesAudioCompletedRef.current = true;
  }, []);

  const playRulesAudio = useCallback(() => {
    if (!hasUserInteractedRef.current) {
      return;
    }

    stopLobby();
    stopConnectAudio();
    const skip = skipAudioRef.current;
    if (skip) {
      skip.pause();
      skip.currentTime = 0;
      skip.onended = null;
      skipAudioRef.current = null;
    }
    stopRulesAudio();
    rulesAudioCompletedRef.current = false;

    const bgAudio = new Audio(buildAudioUrl(ROUND2_EXPLANATION_BG_FILE));
    bgAudio.volume = isMusicMutedRef.current ? 0 : 0.35;
    bgAudio.loop = true;
    rulesBgAudioRef.current = bgAudio;

    const file = pickRandomItem(RULES_ROUND1_FILES);
    const audio = new Audio(buildAudioUrl(file));
    audio.volume = 0.95;
    rulesAudioRef.current = audio;

    audio.onended = () => {
      const bg = rulesBgAudioRef.current;
      if (bg) {
        bg.pause();
        bg.currentTime = 0;
        bg.onended = null;
        bg.onerror = null;
        rulesBgAudioRef.current = null;
      }
      rulesAudioCompletedRef.current = true;

      // Auto-start Round 1 countdown when rules narration ends.
      if (
        roomStatusRef.current === 'waiting' &&
        isRulesVisibleRef.current &&
        !isCountdownVisibleRef.current &&
        playersRef.current.length > 0
      ) {
        setTimeout(() => {
          handleCountdownStartRef.current?.({ playSkip: false });
        }, 0);
      }
    };

    audio.onerror = () => {
      const bg = rulesBgAudioRef.current;
      if (bg) {
        bg.pause();
        bg.currentTime = 0;
        bg.onended = null;
        bg.onerror = null;
        rulesBgAudioRef.current = null;
      }
      rulesAudioCompletedRef.current = true;
    };

    bgAudio.play().catch((error) => {
      console.error('Не удалось проиграть фон правил раунда', error);
    });

    audio.play().catch((error) => {
      const bg = rulesBgAudioRef.current;
      if (bg) {
        bg.pause();
        bg.currentTime = 0;
        bg.onended = null;
        bg.onerror = null;
        rulesBgAudioRef.current = null;
      }
      rulesAudioCompletedRef.current = true;
      console.error('Не удалось проиграть правила раунда', error);
    });
  }, [stopConnectAudio, stopLobby, stopRulesAudio]);

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
    async (percent: number, options?: { onEnded?: () => void }) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      const questionJingle = questionJingleAudioRef.current;
      if (questionJingle) {
        questionJingle.pause();
        questionJingle.currentTime = 0;
        questionJingleAudioRef.current = null;
      }
      const questionVoice = questionVoiceAudioRef.current;
      if (questionVoice) {
        questionVoice.pause();
        questionVoice.currentTime = 0;
        questionVoiceAudioRef.current = null;
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

      audio.onended = () => {
        if (betweenAudioRef.current === audio) {
          betweenAudioRef.current = null;
        }
        options?.onEnded?.();
      };

      audio.onerror = () => {
        if (betweenAudioRef.current === audio) {
          betweenAudioRef.current = null;
        }
        options?.onEnded?.();
      };

      try {
        await audio.play();
      } catch (error) {
        console.error('Не удалось проиграть озвучку между вопросами', error);
        options?.onEnded?.();
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
    const isAnswerTrackingActive =
      !showResults &&
      (roomStatus === 'running' ||
        roomStatus === 'round2-running' ||
        roomStatus === 'round4-running' ||
        roomStatus === 'round5-running' ||
        roomStatus === 'round5-explanation');

    const context =
      roomStatus === 'running'
        ? `r1:${currentQuestionIndex}`
        : roomStatus === 'round2-running'
          ? `r2:${round2CurrentIndex ?? 'x'}:${round2Phase}`
          : roomStatus === 'round4-running'
            ? `r4:${round4CurrentPuzzle?.id ?? 'x'}`
            : roomStatus === 'round5-running' || roomStatus === 'round5-explanation'
              ? `r5:${currentQuestionIndex}`
              : `idle:${roomStatus}`;

    if (!isAnswerTrackingActive) {
      lastAnsweredContextRef.current = context;
      lastAnsweredIdsRef.current = new Set(answeredPlayerIds);
      return;
    }

    if (lastAnsweredContextRef.current !== context) {
      lastAnsweredContextRef.current = context;
      lastAnsweredIdsRef.current = new Set(answeredPlayerIds);
      return;
    }

    const prev = lastAnsweredIdsRef.current;
    const next = new Set(answeredPlayerIds);
    lastAnsweredIdsRef.current = next;

    let hasNew = false;
    for (const id of next) {
      if (!prev.has(id)) {
        hasNew = true;
        break;
      }
    }

    if (hasNew) {
      void playAnswerDuckSound();
    }
  }, [
    answeredPlayerIds,
    currentQuestionIndex,
    playAnswerDuckSound,
    roomStatus,
    round2CurrentIndex,
    round2Phase,
    round4CurrentPuzzle?.id,
    showResults,
  ]);

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

  useEffect(() => {
    if (!isMirror || !isCountdownVisible) {
      lastMirroredCountdownValueRef.current = null;
      return;
    }
    if (lastMirroredCountdownValueRef.current === countdownValue) {
      return;
    }
    lastMirroredCountdownValueRef.current = countdownValue;
    const isFinalStep = countdownValue === COUNTDOWN_STEPS[COUNTDOWN_STEPS.length - 1];
    void playBeep(isFinalStep ? 1200 : 880);
  }, [countdownValue, isCountdownVisible, isMirror, playBeep]);

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

  const stopAllAudioImmediate = useCallback(() => {
    stopAllAudio();
    stopLobby();
    stopRulesAudio();
    stopSkipAudio();
    stopConnectAudio();
    stopJoinSound();
    stopAnswerDuckSound();
    stopQuestionAudio();
    stopRound2EndCeremonyAudio();
    stopRound3VoteAudio();
    stopRound3ResultsAudio();
  }, [
    stopAllAudio,
    stopLobby,
    stopRulesAudio,
    stopSkipAudio,
    stopConnectAudio,
    stopJoinSound,
    stopAnswerDuckSound,
    stopQuestionAudio,
    stopRound2EndCeremonyAudio,
    stopRound3VoteAudio,
    stopRound3ResultsAudio,
  ]);

  const playQuestionAudio = useCallback(
    async (questionId: number) => {
      if (!hasUserInteractedRef.current) {
        return;
      }

      stopQuestionAudio();

      const jingle = new Audio(buildAudioUrl(QUESTION_JINGLE_FILE));
      jingle.loop = false;
      jingle.volume = 0.45;
      questionJingleAudioRef.current = jingle;

      const voice = new Audio(buildAudioUrl(getRound1AudioPath(questionId)));
      voice.loop = false;
      voice.volume = isVoiceMutedRef.current ? 0 : 0.95;
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
    if (!roomId || currentLikeQuestionId === null) {
      setCurrentQuestionLikes(null);
      return;
    }
    const fetchLikes = async () => {
      const { count } = await supabase
        .from('question_likes')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .eq('question_id', currentLikeQuestionId);
      setCurrentQuestionLikes(typeof count === 'number' ? count : 0);
    };
    void fetchLikes();
  }, [currentLikeQuestionId, roomId]);

  useEffect(() => {
    if (roomStatus !== 'round5-running') {
      lastRound5QuestionPlaybackKeyRef.current = null;
      return;
    }
    if (round5CurrentBankIndex === null) {
      return;
    }
    if (!questionStartedAt) {
      return;
    }

    const startedAtMs = new Date(questionStartedAt).getTime();
    const startedAtKey = Number.isFinite(startedAtMs) ? Math.floor(startedAtMs / 1000) : questionStartedAt;
    const key = `${round5CurrentBankIndex}-${startedAtKey}`;
    if (lastRound5QuestionPlaybackKeyRef.current === key) {
      return;
    }
    lastRound5QuestionPlaybackKeyRef.current = key;
    void playRound5QuestionAudio(round5CurrentBankIndex);
  }, [playRound5QuestionAudio, questionStartedAt, roomStatus, round5CurrentBankIndex]);

  useEffect(() => {
    if (roomStatus !== 'round5-running' && roomStatus !== 'round5-explanation') {
      lastRound5ExplanationPlaybackKeyRef.current = null;
      stopRound5Audio();
    }
  }, [roomStatus, stopRound5Audio]);

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
      stopRound2EndCeremonyAudio();
      stopRound2RulesAudio();
      stopRound4Audio();
      stopRound5RulesAudio();
      stopRound5Audio();
      stopTournamentJingle();
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
    stopRound2EndCeremonyAudio,
    stopRound2RulesAudio,
    stopRound4Audio,
    stopRound5Audio,
    stopRound5RulesAudio,
    stopTournamentJingle,
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
        console.warn('Room ID mismatch:', { hostRoomId, roomId });
        // Don't redirect immediately, try to load the room first
        // This allows the host to access the room even if localStorage is stale
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
    if (!syncedRoom) {
      return;
    }
    const status = (syncedRoom.status as RoomStatus) || 'waiting';
    const allAnswered = Boolean(syncedRoom.all_players_answered);
    dispatchRoundEvent({
      type: 'SERVER_UPDATE',
      status,
      allAnswered,
      startedAt: syncedRoom.question_started_at ?? null,
      transitioningToNext: Boolean(syncedRoom.transitioning_to_next),
    });
    void loadRoomDataRef.current?.();
  }, [dispatchRoundEvent, syncedRoom]);

  useEffect(() => {
    if (!roomId) return undefined;

    let mounted = true;

    if (!realtimeEnabled) {
      const poll = () => {
        loadRoomDataRef.current?.();
      };
      poll();
      const intervalId = setInterval(poll, 2000);
      return () => {
        mounted = false;
        clearInterval(intervalId);
      };
    }
    let playersChannel: ReturnType<typeof supabase.channel> | null = null;
    let answersChannel: ReturnType<typeof supabase.channel> | null = null;
    let round2AnswersChannel: ReturnType<typeof supabase.channel> | null = null;
    let round4AnswersChannel: ReturnType<typeof supabase.channel> | null = null;
    let round5AnswersChannel: ReturnType<typeof supabase.channel> | null = null;
    let playersPollId: ReturnType<typeof setInterval> | null = null;

    const startRealtime = async () => {
      const authOk = await ensureRealtimeAuth(roomId);
      if (!mounted || !authOk) {
        return;
      }

      playersChannel = supabase
        .channel(`host-players-${roomId}`)
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
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
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

      playersPollId = setInterval(() => {
        if (mounted) {
          loadPlayersRef.current?.();
        }
      }, 3000);

      answersChannel = supabase
        .channel(`host-answers-${roomId}`)
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

      round2AnswersChannel = supabase
        .channel(`host-round2-answers-${roomId}`)
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
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
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

      round4AnswersChannel = supabase
        .channel(`host-round4-answers-${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'round4_answers',
            filter: `room_id=eq.${roomId}`,
          },
          async (payload: Round4AnswerInsertPayload) => {
            if (!mounted) return;
            if (roomStatusRef.current !== 'round4-running') {
              return;
            }
            const currentPuzzleId = round4CurrentPuzzleIdRef.current;
            if (currentPuzzleId === null) {
              return;
            }
            if (payload.new.puzzle_id === currentPuzzleId) {
              await loadRound4AnswerStatsRef.current?.(currentPuzzleId);
            }
          }
        )
        .subscribe();

      round5AnswersChannel = supabase
        .channel(`host-round5-answers-${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'round5_answers',
            filter: `room_id=eq.${roomId}`,
          },
          async (payload: { new: { question_index: number } }) => {
            if (!mounted) return;
            const currentBankIndex = round5CurrentBankIndexRef.current;
            if (currentBankIndex === null) {
              return;
            }
            if (payload.new.question_index === currentBankIndex) {
              await loadRound5AnswerStatsRef.current?.(currentBankIndex);
              await loadRound5AnswerRowsRef.current?.(currentBankIndex);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'round5_answers',
            filter: `room_id=eq.${roomId}`,
          },
          async (payload: { new: { question_index: number } }) => {
            if (!mounted) return;
            const currentBankIndex = round5CurrentBankIndexRef.current;
            if (currentBankIndex === null) {
              return;
            }
            if (payload.new.question_index === currentBankIndex) {
              await loadRound5AnswerStatsRef.current?.(currentBankIndex);
              await loadRound5AnswerRowsRef.current?.(currentBankIndex);
            }
          }
        )
        .subscribe();
    };

    void startRealtime();

    return () => {
      mounted = false;
      if (playersPollId) {
        clearInterval(playersPollId);
      }
      if (playersChannel) {
        playersChannel.unsubscribe().then(() => {
          if (playersChannel) supabase.removeChannel(playersChannel);
        });
      }
      if (answersChannel) {
        answersChannel.unsubscribe().then(() => {
          if (answersChannel) supabase.removeChannel(answersChannel);
        });
      }
      if (round2AnswersChannel) {
        round2AnswersChannel.unsubscribe().then(() => {
          if (round2AnswersChannel) supabase.removeChannel(round2AnswersChannel);
        });
      }
      if (round4AnswersChannel) {
        round4AnswersChannel.unsubscribe().then(() => {
          if (round4AnswersChannel) supabase.removeChannel(round4AnswersChannel);
        });
      }
      if (round5AnswersChannel) {
        round5AnswersChannel.unsubscribe().then(() => {
          if (round5AnswersChannel) supabase.removeChannel(round5AnswersChannel);
        });
      }
    };
  }, [ensureRealtimeAuth, realtimeEnabled, roomId]);

  const everyoneAnswered = players.length > 0 && answerCount >= players.length;
  const shouldForceZero =
    roomStatus === 'running'
      ? everyoneAnswered
      : serverAllPlayersAnswered || everyoneAnswered;
  const isRound2FactPhase = roomStatus === 'round2-running' && round2Phase === 'fact';
  const isTimerRoundActive =
    roomStatus === 'running' ||
    isRound2FactPhase ||
    roomStatus === 'round3-running' ||
    roomStatus === 'round5-running';
  const timerActive =
    isTimerRoundActive &&
    Boolean(questionStartedAt) &&
    (roomStatus === 'round3-running' ? true : !showResults) &&
    (roomStatus === 'round3-running' ? true : !shouldForceZero);

  useEffect(() => {
    if (roomStatus !== 'running') {
      stopQuestionAudio();
    }
  }, [roomStatus, stopQuestionAudio]);

  useEffect(() => {
    if (roomStatus === 'running' && everyoneAnswered) {
      stopQuestionAudio();
    }
  }, [roomStatus, everyoneAnswered, stopQuestionAudio]);

  useEffect(() => {
    if (roomStatus !== 'round2-running') {
      lastRound2FactPlaybackKeyRef.current = null;
      lastRound2ExplanationPlaybackKeyRef.current = null;
      return;
    }
    if (!isMirrorRef.current || round2CurrentIndex === null) {
      return;
    }

    if (round2Phase === 'fact') {
      const factKey = `${round2CurrentIndex}-${round2ShowingFact ? 't' : 'f'}-${questionStartedAt ?? 'na'}`;
      if (lastRound2FactPlaybackKeyRef.current === factKey) {
        return;
      }
      lastRound2FactPlaybackKeyRef.current = factKey;
      void playRound2FactAudio(round2CurrentIndex, round2ShowingFact);
      return;
    }

    if (round2Phase === 'explanation') {
      const explanationKey = `${round2CurrentIndex}-${round2ShowingFact ? 't' : 'f'}-explanation`;
      if (lastRound2ExplanationPlaybackKeyRef.current === explanationKey) {
        return;
      }
      lastRound2ExplanationPlaybackKeyRef.current = explanationKey;
      if (round2ShowingFact) {
        void playRound2ExplanationAudio(round2CurrentIndex);
      } else {
        void playRound2FictionExplanationAudio(round2CurrentIndex);
      }
    }
  }, [
    playRound2ExplanationAudio,
    playRound2FactAudio,
    playRound2FictionExplanationAudio,
    questionStartedAt,
    roomStatus,
    round2CurrentIndex,
    round2Phase,
    round2ShowingFact,
  ]);

  useEffect(() => {
    if (roomStatus !== 'round4-running') {
      lastRound4CuePlaybackKeyRef.current = null;
      lastRound4AnswerPlaybackKeyRef.current = null;
      return;
    }
    if (!round4CurrentPuzzle || !questionStartedAt) {
      return;
    }

    const remaining = getRemainingSeconds(questionStartedAt, QUESTION_DURATION_SECONDS, timeOffsetMs);
    if (remaining <= 0 || serverAllPlayersAnswered) {
      return;
    }

    const cueKey = `${round4CurrentPuzzle.id}-${questionStartedAt}`;
    if (lastRound4CuePlaybackKeyRef.current === cueKey) {
      return;
    }

    lastRound4CuePlaybackKeyRef.current = cueKey;
    lastRound4AnswerPlaybackKeyRef.current = null;
    playRound4CategoryAudio(round4CurrentPuzzle.category);
    playRound4TimerAudio();
  }, [
    playRound4CategoryAudio,
    playRound4TimerAudio,
    questionStartedAt,
    roomStatus,
    round4CurrentPuzzle,
    serverAllPlayersAnswered,
    timeOffsetMs,
  ]);

  useEffect(() => {
    if (roomStatus !== 'round4-running' || !round4CurrentPuzzle || !questionStartedAt) {
      return;
    }
    if (!isMirrorRef.current) {
      return;
    }

    const remaining = getRemainingSeconds(questionStartedAt, QUESTION_DURATION_SECONDS, timeOffsetMs);
    if (remaining > 0) {
      return;
    }

    const answerKey = `${round4CurrentPuzzle.id}-${questionStartedAt}-answer`;
    if (lastRound4AnswerPlaybackKeyRef.current === answerKey) {
      return;
    }

    lastRound4AnswerPlaybackKeyRef.current = answerKey;
    playRound4AnswerAudio(round4CurrentPuzzle.id);
  }, [playRound4AnswerAudio, questionStartedAt, roomStatus, round4CurrentPuzzle, timeOffsetMs]);

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

      const remaining = getRemainingSeconds(questionStartedAt, QUESTION_DURATION_SECONDS, timeOffsetMs);
      setTimeLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [roomStatus, timerActive, questionStartedAt, timeOffsetMs]);

  useEffect(() => {
    if (!roomId || roomStatus !== 'running') {
      return;
    }
    if (isMirrorRef.current) return;

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
    if (isMirrorRef.current) return;

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
    if (!roomId || roomStatus !== 'round5-running') {
      return;
    }
    if (isMirrorRef.current) return;

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
        console.error('Не удалось обновить статус ответов финала', error);
        return;
      }
      setServerAllPlayersAnswered(everyoneAnswered);
    };

    updateFlag();
  }, [answerCount, roomId, roomStatus, serverAllPlayersAnswered, totalPlayerCount]);

  useEffect(() => {
    // Poll answers during the fact phase so the host still sees fresh counts if realtime misses events.
    // Round 2 has its own answer channel + explicit loads; polling it can cause phase glitches
    // (e.g. jumping straight to explanation when the previous interval tick races the next question start).
    if (roomStatus !== 'running' || serverAllPlayersAnswered) {
      return;
    }

    const fetchLatestAnswers = () => {
      if (typeof currentQuestionIndex !== 'number' || currentQuestionIndex < 0) {
        return;
      }
      void loadAnswerCount(currentQuestionIndex);
    };

    fetchLatestAnswers();
    const intervalId = setInterval(fetchLatestAnswers, ROUND2_ANSWER_POLL_INTERVAL_MS);
    return () => {
      clearInterval(intervalId);
    };
  }, [currentQuestionIndex, loadAnswerCount, roomStatus, serverAllPlayersAnswered]);

  useEffect(() => {
    // Round 2: keep the “Состояние раунда” player highlights responsive even if realtime misses events.
    // Safe because loadRound2AnswerStats ignores stale responses (previous item resolving late).
    if (roomStatus !== 'round2-running' || round2Phase !== 'fact' || serverAllPlayersAnswered) {
      return;
    }

    const fetchLatestRound2 = () => {
      const activeIndex = round2CurrentIndexRef.current ?? round2CurrentIndex;
      if (activeIndex === null) {
        return;
      }
      void loadRound2AnswerStatsRef.current?.(activeIndex);
    };

    fetchLatestRound2();
    const intervalId = setInterval(fetchLatestRound2, ROUND2_ANSWER_POLL_INTERVAL_MS);
    return () => {
      clearInterval(intervalId);
    };
  }, [roomStatus, round2Phase, round2CurrentIndex, serverAllPlayersAnswered]);

  useEffect(() => {
    if (roomStatus !== 'waiting') {
      stopLobby();
      stopRulesAudio();
      stopConnectAudio();
    }
  }, [roomStatus, stopLobby, stopRulesAudio, stopConnectAudio]);

  useEffect(() => {
    const previous = finalResultsStatusRef.current;
    if (previous === roomStatus) {
      return;
    }

    finalResultsStatusRef.current = roomStatus;

    if (roomStatus !== 'final-results') {
      if (previous === 'final-results') {
        stopFinalNarratorAudio();
        stopTournamentJingle();
      }
      return;
    }

    setIsTournamentVisible(true);
    setIsFinalRoundAvailable(false);
    stopAllAudio();
    playTournamentJingle();
    playFinalNarratorAudio();
  }, [playFinalNarratorAudio, playTournamentJingle, roomStatus, stopAllAudio, stopFinalNarratorAudio, stopTournamentJingle]);

  const resolveLikedQuestionText = useCallback(
    (questionId: number) => {
      const meta = parseLikeQuestionId(questionId);
      if (meta.round === 1) {
        return getQuestionById(meta.index, round1BankRef.current)?.text ?? describeLikeQuestionId(questionId);
      }
      if (meta.round === 2) {
        const item = round2Items[meta.index];
        if (!item) {
          return describeLikeQuestionId(questionId);
        }
        return meta.variant === 'fiction' ? item.fiction : item.fact;
      }
      if (meta.round === 3) {
        const questionData = round3Questions.find((q) => q.originalIndex === meta.index) ?? round3Questions[meta.index];
        return questionData?.question ?? describeLikeQuestionId(questionId);
      }
      if (meta.round === 4) {
        const puzzle = round4Puzzles.find((p) => p.id === meta.index);
        return puzzle?.category ?? describeLikeQuestionId(questionId);
      }
      if (meta.round === 5) {
        const questionData = round5Questions[meta.index];
        return questionData?.question ?? describeLikeQuestionId(questionId);
      }
      return describeLikeQuestionId(questionId);
    },
    [round2Items, round3Questions, round4Puzzles, round5Questions]
  );

  useEffect(() => {
    if (roomStatus !== 'final-results' || !roomId) {
      return;
    }
    const loadBestQuestion = async () => {
      const { data, error } = await supabase.rpc('get_best_question', { p_room_id: roomId });
      if (error) {
        console.warn('Failed to load best question', error);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row.question_id !== 'number') {
        setBestQuestion(null);
        return;
      }
      const questionId = Number(row.question_id);
      const questionText = Number.isFinite(questionId) ? resolveLikedQuestionText(questionId) : '—';
      setBestQuestion({ id: questionId, likes: Number(row.likes ?? 0), text: questionText });
    };
    void loadBestQuestion();
  }, [resolveLikedQuestionText, roomId, roomStatus]);

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
    if (isMirrorRef.current) return;
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
    if (isMirrorRef.current) return;
    if (!isPackReady) {
      setError('Пакет вопросов ещё загружается. Подождите пару секунд и попробуйте снова.');
      return;
    }

    if (!hasEnoughQuestions(ROUND1_TOTAL_QUESTIONS, round1BankRef.current)) {
      setError('Недостаточно вопросов для начала игры. Пополните список раунда.');
      return;
    }

    stopQuestionAudio();
    stopLobby();
    stopSkipAudio();

    const questionIds = pickRandomQuestionIds(ROUND1_TOTAL_QUESTIONS, round1BankRef.current);
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
    if (isMirrorRef.current) return;
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
      if (isMirrorRef.current) return;
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

  const handleCountdownStart = (options?: { playSkip?: boolean }) => {
    if (roomStatus !== 'waiting' || players.length === 0 || isCountdownVisible) {
      return;
    }
    stopLobby();
    stopRulesAudio();
    stopConnectAudio();

    const shouldPlaySkip = (options?.playSkip ?? true) && !rulesAudioCompletedRef.current;
    if (shouldPlaySkip) {
      playSkipAudio();
    }

    hasUserInteractedRef.current = true;
    setIsRulesVisible(false);
    clearCountdownTimeout();
    setCountdownContext('round1');
    countdownCompleteActionRef.current = () => startRound();
    setIsCountdownVisible(true);
    runCountdownSequence(0);
  };

  useEffect(() => {
    handleCountdownStartRef.current = handleCountdownStart;
  });

  const handlePrepareRound = () => {
    if (roomStatus !== 'waiting' || players.length === 0) {
      return;
    }
    hasUserInteractedRef.current = true;
    stopAllAudioImmediate();
    void playConnectAudio(players.length);
    setIsPrestartVisible(true);
    setIsRulesVisible(false);
    setIsPrestartNextEnabled(false);
    clearPrestartEnableTimeout();
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
  };

  const handleRulesCancel = () => {
    setIsRulesVisible(false);
  };

  const endGame = async () => {
    if (isMirrorRef.current) return;
    setIsTournamentVisible(false);
    stopAllAudio();
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
      if (isMirrorRef.current) return;
      if (round2PhaseRef.current !== 'fact' || isTransitioningRound2Ref.current) {
        return;
      }
      isTransitioningRound2Ref.current = true;

      const awardKey = `${round2QuestionCounterRef.current}-${index}`;
      if (lastRound2AwardKeyRef.current === awardKey) {
        isTransitioningRound2Ref.current = false;
        return;
      }
      lastRound2AwardKeyRef.current = awardKey;

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

      // Award Round 2 points into players.total_points so the host sidebar shows updated totals.
      try {
        const pointsMap = await loadRound2Points();

        if (pointsMap.size > 0) {
          const totalMap = new Map(playersRef.current.map((player) => [player.id, player.total_points ?? 0] as const));
          const previousTotals = round2AwardedPointsRef.current;

          const updates = Array.from(pointsMap.entries())
            .map(([playerId, roundPoints]) => {
              const alreadyAwarded = previousTotals.get(playerId) ?? 0;
              const delta = roundPoints - alreadyAwarded;
              if (delta <= 0) {
                return null;
              }
              previousTotals.set(playerId, roundPoints);
              return { playerId, delta } as const;
            })
            .filter(Boolean) as Array<{ playerId: string; delta: number }>;

          if (updates.length) {
            await Promise.all(
              updates.map(async ({ playerId, delta }) => {
                const currentTotal = totalMap.get(playerId) ?? 0;
                const nextTotal = currentTotal + delta;
                const { error: updateError } = await supabase
                  .from('players')
                  .update({ total_points: nextTotal })
                  .eq('id', playerId);
                if (updateError) {
                  console.error('Не удалось обновить очки игрока (round2)', updateError);
                }
              })
            );
          }
          loadPlayersRef.current?.();
        }
      } catch (err) {
        console.error('Не удалось начислить очки в Раунде 2', err);
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
    // Round 2 per-round leaderboard must not leak into later rounds (it causes brief flickers during transitions).
    if (isTournamentVisible && round2Leaderboard.length > 0) {
      setRound2Leaderboard([]);
    }
  }, [isTournamentVisible, round2Leaderboard.length]);

  useEffect(() => {
    if (roomStatus !== 'round2-running' || round2Phase !== 'fact' || !serverAllPlayersAnswered || isTransitioningRound2Ref.current) {
      return;
    }
    if (isMirrorRef.current) return;
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
      if (isMirrorRef.current) return;
      hasUserInteractedRef.current = true;
      clearRound2Timer();
      stopRound2Audio();
      stopBetweenAudio();
      stopQuestionAudio();
      stopRoundEndAudio();
      stopRound2RulesAudio();
      setIsRound2RulesVisible(false);
      const nextUsedRaw = options?.resetTrackers
        ? [...round2AskedIndicesRef.current, index]
        : [...round2AskedIndicesRef.current, index];

      const nextUsedDeduped = Array.from(
        new Set(
          nextUsedRaw
            .filter((idx) => typeof idx === 'number' && Number.isFinite(idx))
            .filter((idx) => idx >= 0 && idx < round2Items.length)
        )
      );

      round2AskedIndicesRef.current = nextUsedDeduped;
      setRound2AskedIndices(nextUsedDeduped);

      round2QuestionCounterRef.current = questionNumber;
      setRound2QuestionCounter(questionNumber);
      const remaining = Math.max(0, round2Items.length - nextUsedDeduped.length);
      const effectiveTotal = Math.min(ROUND2_TOTAL_QUESTIONS, round2Items.length || ROUND2_TOTAL_QUESTIONS);
      isLastRound2QuestionRef.current = questionNumber >= effectiveTotal || remaining === 0;

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
      round2Items.length,
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
    if (!available.length) {
      return null;
    }
    return pickRandomItem(available);
  }, [round2Items]);


  const performRound2Start = useCallback(async () => {
    resetRound2Stats();
    if (!round2Items.length) {
      setError('Вопросы для Раунда 2 ещё не загружены');
      return;
    }

    const usedFromDb = await loadUsedRound2ItemIndices();
    if (usedFromDb.length) {
      const merged = Array.from(
        new Set(
          [...round2AskedIndicesRef.current, ...usedFromDb]
            .filter((idx) => typeof idx === 'number' && Number.isFinite(idx))
            .filter((idx) => idx >= 0 && idx < round2Items.length)
        )
      );
      round2AskedIndicesRef.current = merged;
      setRound2AskedIndices(merged);
    }

    const index = pickNextRound2Index();
    if (index === null) {
      setError('Не удалось выбрать факт для Раунда 2');
      return;
    }

    const showingFact = Math.random() < 0.5;
    await launchRound2Question(index, showingFact, 1, { resetTrackers: true });
  }, [launchRound2Question, loadUsedRound2ItemIndices, pickNextRound2Index, resetRound2Stats, round2Items.length, setError]);

  const startRound2 = useCallback(() => {
    if (!round2Items.length) {
      setError('Вопросы для Раунда 2 ещё не загружены');
      return;
    }

    hasUserInteractedRef.current = true;
    stopAllAudioImmediate();
    const shouldPlaySkip = !round2RulesAudioCompletedRef.current;

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
    stopAllAudioImmediate,
    stopRound2RulesAudio,
  ]);

  useEffect(() => {
    startRound2Ref.current = startRound2;
  }, [startRound2]);

  const startRound3Countdown = useCallback(() => {
    if (isMirrorRef.current) return;
    if (round3StartLockRef.current || isCountdownVisible) {
      return;
    }
    round3StartLockRef.current = true;
    hasUserInteractedRef.current = true;
    stopAllAudioImmediate();
    setIsTournamentVisible(false);

    const shouldPlaySkip = !round3RulesAudioCompletedRef.current;

    setIsRound3RulesVisible(false);
    stopRound3RulesAudio();

    if (shouldPlaySkip) {
      playSkipAudio();
    }

    clearCountdownTimeout();
    setCountdownContext('round3');
    countdownCompleteActionRef.current = async () => {
      try {
        if (!round3Questions.length) {
          setError('Вопросы для Раунда 3 ещё не загружены');
          return;
        }

        const { data, error: startError } = await supabase.rpc('start_round3', {
          p_room_id: roomId,
        });

        if (startError) {
          logError('rpc', 'start_round3 failed', startError, {
            roomId,
            eventName: 'start_round3_error',
          });
          setError(`Не удалось запустить Раунд 3. ${startError.message ?? 'Проверьте настройки БД.'}`);
          return;
        }

        const started = Array.isArray(data) ? data[0] : data;
        if (!started?.id) {
          logEvent('error', 'rpc', 'start_round3 returned empty payload', {
            roomId,
            eventName: 'start_round3_empty',
          });
          setError('Не удалось запустить Раунд 3');
          return;
        }

        updateRoomStatus('round3-running');
        setShowResults(false);
        setQuestion(null);
        setCurrentQuestionIndex(started.current_question_index ?? 0);
        setQuestionStartedAt(started.question_started_at ?? null);
        setTimeLeft(QUESTION_DURATION_SECONDS);
      } finally {
        round3StartLockRef.current = false;
      }
    };
    setIsCountdownVisible(true);
    runCountdownSequence(0);
  }, [
    clearCountdownTimeout,
    isCountdownVisible,
    stopAllAudioImmediate,
    playSkipAudio,
    roomId,
    round3Questions.length,
    runCountdownSequence,
    setCountdownContext,
    setIsCountdownVisible,
    setIsRound3RulesVisible,
    stopRound3RulesAudio,
    updateRoomStatus,
  ]);

  useEffect(() => {
    startRound3CountdownRef.current = startRound3Countdown;
  }, [startRound3Countdown]);

  const handleRound3Complete = useCallback(async () => {
    if (isMirrorRef.current) return;
    stopRound3Audio();
    stopRound3VoteAudio();
    stopRound3ResultsAudio();
    setIsTournamentVisible(true);
    playRound3EndAfterAudio();
    setShowResults(false);
    setQuestion(null);
    setQuestionStartedAt(null);
    setTimeLeft(0);

    const { error } = await supabase
      .from('rooms')
      .update({
        status: 'finished',
        // Keep room joinable for reconnections / late joins between rounds.
        is_active: true,
        all_players_answered: true,
        question_started_at: null,
        round2_phase: 'idle',
      })
      .eq('id', roomId);

    if (error) {
      setError('Не удалось завершить Раунд 3');
      return;
    }

    setRoomStatus('finished');
    playTournamentJingle();
  }, [playTournamentJingle, roomId, setQuestion, stopRound3Audio, stopRound3ResultsAudio, stopRound3VoteAudio]);

  const handleRound3NextQuestion = useCallback(async () => {
    if (isMirrorRef.current) return;
    if (roomStatus !== 'round3-running') {
      return;
    }
    if (!round3Questions.length) {
      setError('Вопросы для Раунда 3 ещё не загружены');
      return;
    }

    const max = Math.min(ROUND3_TOTAL_QUESTIONS, round3Questions.length);
    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex >= max) {
      await handleRound3Complete();
      return;
    }

    const { error: updateError } = await supabase
      .from('rooms')
      .update({
        is_active: true,
        current_question_index: nextIndex,
        // Таймер стартует после окончания озвучки.
        question_started_at: null,
        all_players_answered: false,
      })
      .eq('id', roomId);

    if (updateError) {
      setError('Не удалось открыть следующий факт');
      return;
    }

    setCurrentQuestionIndex(nextIndex);
    setQuestionStartedAt(null);
    setTimeLeft(QUESTION_DURATION_SECONDS);
  }, [currentQuestionIndex, handleRound3Complete, roomId, roomStatus, round3Questions.length]);

  useEffect(() => {
    handleRound3NextQuestionRef.current = handleRound3NextQuestion;
  }, [handleRound3NextQuestion]);

  useEffect(() => {
    handleRound3CompleteRef.current = handleRound3Complete;
  }, [handleRound3Complete]);

  const handleRound3BackToEndOfRound2 = useCallback(async () => {
    if (isMirrorRef.current) return;
    stopRound3Audio();
    lastRound3PlaybackKeyRef.current = null;
    setIsTournamentVisible(false);
    stopTournamentJingle();

    const { error } = await supabase
      .from('rooms')
      .update({
        status: 'finished',
        // Keep room joinable for reconnections / late joins between rounds.
        is_active: true,
        all_players_answered: true,
        question_started_at: null,
        round2_phase: 'idle',
      })
      .eq('id', roomId);

    if (error) {
      setError('Не удалось вернуться к концу Раунда 2');
      return;
    }

    setRoomStatus('finished');
    setShowResults(true);
    setQuestion(null);
    setQuestionStartedAt(null);

    // Тестовый режим: после входа в Раунд 3 локальный рейтинг Раунда 2 может быть пустым.
    // Нам важно вернуться на экран, где доступна кнопка старта Раунда 3, поэтому
    // формируем fallback-рейтинг из текущих игроков.
    if (round2Leaderboard.length === 0) {
      const snapshot = playersRef.current;
      const fallback = snapshot
        .map((player) => ({
          playerId: player.id,
          name: player.name,
          points: player.total_points,
          correct: 0,
          attempts: 0,
        }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
      setRound2Leaderboard(fallback);
    }
  }, [roomId, setQuestion, stopRound3Audio, stopTournamentJingle]);

  const completeRound2 = useCallback(async () => {
    if (isMirrorRef.current) return;
    handleRound2NextQuestionRef.current = null;
    clearRound2Timer();
    stopRound2Audio();
    stopRound2RulesAudio();
    const { error } = await supabase
      .from('rooms')
      .update({
        status: 'finished',
        // Keep room joinable for reconnections / late joins between rounds.
        is_active: true,
        all_players_answered: true,
        question_started_at: null,
        round2_phase: 'idle',
      })
      .eq('id', roomId);

    if (error) {
      setError('Не удалось завершить Раунд 2');
      return;
    }

    await updateRound2Leaderboard();
    setRoomStatus('finished');
    setShowResults(true);
    setRound2Phase('idle');
    setRound2CurrentIndex(null);

    const ceremonyKey = `round2-end-${roomId}-${round2AskedIndicesRef.current.length}`;
    const lastPercent = Number.isFinite(round2LastAccuracyRef.current) ? round2LastAccuracyRef.current : 0;
    playRound2EndCeremony(lastPercent, ceremonyKey);

    setRound2QuestionCounter(0);
    setRound2AskedIndices([]);
    round2QuestionCounterRef.current = 0;
    round2AskedIndicesRef.current = [];
    setServerAllPlayersAnswered(true);
    setQuestionStartedAt(null);
  }, [clearRound2Timer, playRound2EndCeremony, roomId, setRound2CurrentIndex, setRound2Phase, stopRound2Audio, stopRound2RulesAudio, updateRound2Leaderboard]);

  const handleRound2NextQuestion = useCallback(async () => {
    if (isMirrorRef.current) return;
    if (roomStatus !== 'round2-running') {
      return;
    }

    const effectiveTotal = Math.min(ROUND2_TOTAL_QUESTIONS, round2Items.length || ROUND2_TOTAL_QUESTIONS);

    const currentStep = round2QuestionCounterRef.current;
    if (currentStep >= effectiveTotal) {
      await completeRound2();
      return;
    }

    const usedFromDb = await loadUsedRound2ItemIndices();
    if (usedFromDb.length) {
      const merged = Array.from(
        new Set(
          [...round2AskedIndicesRef.current, ...usedFromDb]
            .filter((idx) => typeof idx === 'number' && Number.isFinite(idx))
            .filter((idx) => idx >= 0 && idx < round2Items.length)
        )
      );
      round2AskedIndicesRef.current = merged;
      setRound2AskedIndices(merged);
    }

    const nextIndex = pickNextRound2Index();
    if (nextIndex === null) {
      await completeRound2();
      return;
    }

    const showingFact = Math.random() < 0.5;
    await launchRound2Question(nextIndex, showingFact, currentStep + 1);
  }, [completeRound2, launchRound2Question, loadUsedRound2ItemIndices, pickNextRound2Index, roomStatus, round2Items.length]);

  useEffect(() => {
    handleRound2NextQuestionRef.current = handleRound2NextQuestion;
  }, [handleRound2NextQuestion]);

  const playersListRef = useRef<HTMLDivElement | null>(null);
  const playersListRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const container = playersListRef.current;
    if (!container) {
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      return;
    }

    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-flip-id]'));
    const nextRects = new Map<string, DOMRect>();

    for (const el of items) {
      const id = el.dataset.flipId;
      if (!id) {
        continue;
      }
      nextRects.set(id, el.getBoundingClientRect());
    }

    const prevRects = playersListRectsRef.current;
    for (const el of items) {
      const id = el.dataset.flipId;
      if (!id) {
        continue;
      }
      const prev = prevRects.get(id);
      const next = nextRects.get(id);
      if (!prev || !next) {
        continue;
      }

      const dy = prev.top - next.top;
      if (Math.abs(dy) < 1) {
        continue;
      }

      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0px)' }], {
        duration: 1200,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
    }

    playersListRectsRef.current = nextRects;
  }, [players]);

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
  const totalQuestions = selectedQuestionIds.length || ROUND1_TOTAL_QUESTIONS;
  const allPlayersAnswered = serverAllPlayersAnswered || (totalPlayers > 0 && answeredCount >= totalPlayers);
  const isLastQuestion = totalQuestions > 0 ? currentQuestionIndex >= totalQuestions - 1 : false;
  const isRound1Active = roomStatus === 'running';
  const isRound2Running = roomStatus === 'round2-running';
  const isRound3Running = roomStatus === 'round3-running';
  const isRound4Running = roomStatus === 'round4-running';
  const canAdvance = isRound1Active && (effectiveTimeLeft === 0 || allPlayersAnswered);
  const nextButtonDisabled = !canAdvance || (isLastQuestion && (isSummaryLoading || isRoundEndButtonLocked));
  const progressPercent = Math.max(0, Math.min(100, (effectiveTimeLeft / QUESTION_DURATION_SECONDS) * 100));
  const round4ProgressPercent = Math.max(0, Math.min(100, (timeLeft / QUESTION_DURATION_SECONDS) * 100));
  const round3ElapsedSeconds = isRound3Running ? getRound3ElapsedSeconds(questionStartedAt) : null;

  const round3TotalSeconds = ROUND3_ANSWER_SECONDS + ROUND3_VOTE_COUNTDOWN_SECONDS + ROUND3_VOTE_SECONDS;

  const round3TimerDuration = round3TotalSeconds;
  const round3TimerTimeLeft = isRound3Running
    ? getRemainingSeconds(questionStartedAt, round3TotalSeconds, timeOffsetMs)
    : effectiveTimeLeft;
  const round3ProgressPercent = Math.max(0, Math.min(100, (round3TimerTimeLeft / round3TimerDuration) * 100));
  const isLastRound3Fact = isRound3Running && currentQuestionIndex + 1 >= round3QuestionCount;
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
  const round2ExplanationText = round2ShowingFact
    ? round2Explanation || ROUND2_EXPLANATION_FALLBACK
    : round2FictionExplanation || ROUND2_EXPLANATION_FALLBACK;
  const dedupedRound2Answers = useMemo(() => {
    const unique = new Map<string, Round2AnswerRow>();
    for (const answer of round2Answers) {
      unique.set(answer.player_id, answer);
    }
    return Array.from(unique.values());
  }, [round2Answers]);
  const headerActionLabel = isTournamentVisible
    ? roomStatus === 'final-results'
      ? 'Закрыть комнату'
      : isFinalRoundAvailable
        ? 'Финал'
        : 'Раунд 4'
    : roomStatus === 'finished' && showResults
      ? lastActiveRound === 'round2-running'
        ? 'Раунд 3'
        : lastActiveRound === 'round3-running'
          ? 'Раунд 4'
          : lastActiveRound === 'round4-running'
            ? 'Финал'
            : 'Раунд 2'
      : 'Закрыть комнату';
  const round2QuestionNumber =
    round2QuestionCounter > 0
      ? round2QuestionCounter
      : Math.max(round2AskedIndices.length, round2CurrentIndex !== null ? 1 : 0, 1);
  const effectiveRound2Total = Math.min(ROUND2_TOTAL_QUESTIONS, round2Items.length || ROUND2_TOTAL_QUESTIONS);
  const clampedRound2QuestionNumber = Math.min(round2QuestionNumber, effectiveRound2Total);
  const round1QuestionCount = totalQuestions;
  const round2QuestionCount = effectiveRound2Total;
  const round3TotalCount = round3QuestionCount || ROUND3_TOTAL_QUESTIONS;
  const round4TotalCount = ROUND4_TOTAL_TOURS;
  const round5TotalCount = ROUND5_TOTAL_TOURS;
  const round2Offset = round1QuestionCount;
  const round3Offset = round1QuestionCount + round2QuestionCount;
  const round4Offset = round3Offset + round3TotalCount;
  const round5Offset = round4Offset + round4TotalCount;
  const currentRound4TourNumber = round4CurrentPuzzle
    ? Math.min(Math.max(round4AskedIds.length, 1), round4TotalCount)
    : 0;
  const round2TruthLabel =
    round2Phase === 'fact'
      ? ''
      : round2ShowingFact
        ? 'Ответ: правда'
        : 'Ответ: вымысел';
  const round2TruthClass =
    round2Phase === 'fact'
      ? 'text-black/60'
      : round2ShowingFact
        ? 'text-[#00c3ff]'
        : 'text-[#ff007f]';
  const round2AccuracyPercent = Math.max(0, Math.min(100, Math.round(round2LastAccuracy)));
  const round2AccuracyLabel =
    round2Leaderboard.length > 0 ? `${round2AccuracyPercent}% попали в точку` : 'Ждём первую статистику';

  const handlePrimaryHeaderAction = () => {
    if (roomStatus === 'final-results') {
      hasUserInteractedRef.current = true;
      void endGame();
      return;
    }

    if (isTournamentVisible) {
      hasUserInteractedRef.current = true;
      if (isFinalRoundAvailable) {
        handleOpenRound5Rules();
      } else {
        handleOpenRound4Rules();
      }
      return;
    }

    if (roomStatus === 'finished' && showResults) {
      hasUserInteractedRef.current = true;
      stopAllAudioImmediate();
      if (lastActiveRound === 'round2-running') {
        setIsRound3RulesVisible(true);
      } else if (lastActiveRound === 'round3-running') {
        setIsRound4RulesVisible(true);
      } else if (lastActiveRound === 'round4-running') {
        setIsRound5RulesVisible(true);
      } else {
        setIsRound2RulesVisible(true);
      }
      return;
    }
    void endGame();
  };

  const handleOpenRound4Rules = useCallback(() => {
    hasUserInteractedRef.current = true;
    stopAllAudioImmediate();
    setIsRound4RulesVisible(true);
  }, [stopAllAudioImmediate]);

  const handleOpenRound5Rules = useCallback(() => {
    hasUserInteractedRef.current = true;
    stopAllAudioImmediate();
    setIsRound5RulesVisible(true);
  }, [stopAllAudioImmediate]);

  const calculateRound5Points = useCallback((correct: number, answer: number) => {
    if (!Number.isFinite(correct) || correct <= 0) {
      return 0;
    }
    if (!Number.isFinite(answer) || answer <= 0) {
      return 0;
    }
    if (answer >= correct * 2) {
      return 0;
    }
    const deviationPercent = Math.round((Math.abs(correct - answer) / correct) * 100);
    if (deviationPercent >= 100) {
      return 0;
    }
    const points = Math.round((ROUND5_MAX_POINTS * (100 - deviationPercent)) / 100);
    return Math.max(0, Math.min(ROUND5_MAX_POINTS, points));
  }, []);

  const startRound5Game = useCallback(async () => {
    if (isMirrorRef.current) return;
    if (round5StartLockRef.current) {
      return;
    }
    round5StartLockRef.current = true;

    try {
      hasUserInteractedRef.current = true;
      stopAllAudioImmediate();
      setIsTournamentVisible(false);

      const bank = round5QuestionsRef.current;
      if (bank.length < ROUND5_TOTAL_TOURS) {
        setError('Вопросы финала ещё не загружены или их меньше 6');
        return;
      }

      const selection = shuffleArray(Array.from({ length: bank.length }, (_, i) => i)).slice(0, ROUND5_TOTAL_TOURS);
      const { iso: startedAt, offset } = await getServerIsoTimestamp();

      round5ScoredQuestionIndicesRef.current = new Set();
      lastRound5QuestionPlaybackKeyRef.current = null;
      lastRound5ExplanationPlaybackKeyRef.current = null;
      round5AdvanceLockRef.current = false;

      const { error: updateError } = await supabase
        .from('rooms')
        .update({
          status: 'round5-running',
          selected_question_ids: selection,
          current_question_index: 0,
          question_started_at: startedAt,
          all_players_answered: false,
          is_active: true,
        })
        .eq('id', roomId);

      if (updateError) {
        console.error('Не удалось запустить Раунд 5', updateError);
        const details =
          typeof (updateError as { message?: unknown }).message === 'string'
            ? (updateError as { message: string }).message
            : '';
        setError(details ? `Не удалось запустить финал: ${details}` : 'Не удалось запустить финал');
        return;
      }

      setSelectedQuestionIds(selection);
      setCurrentQuestionIndex(0);
      setRound5CurrentBankIndex(selection[0] ?? null);
      setRound5CurrentQuestion(selection[0] !== undefined ? bank[selection[0]] ?? null : null);
      setShowResults(false);
      setQuestion(null);
      setAnswerCount(0);
      setAnsweredPlayerIds([]);
      setServerAllPlayersAnswered(false);
      updateRoomStatus('round5-running');
      syncTimerWithStart(startedAt, offset);
    } finally {
      round5StartLockRef.current = false;
    }
  }, [getServerIsoTimestamp, roomId, stopAllAudioImmediate, syncTimerWithStart, updateRoomStatus]);

  const advanceRound5Tour = useCallback(async () => {
    if (isMirrorRef.current) return;
    if (round5AdvanceLockRef.current) {
      return;
    }
    round5AdvanceLockRef.current = true;

    try {
      const nextTourIndex = currentQuestionIndex + 1;
      if (nextTourIndex >= ROUND5_TOTAL_TOURS) {
        stopAllAudio();
        const { error } = await supabase
          .from('rooms')
          .update({
            status: 'final-results',
            is_active: false,
            all_players_answered: true,
            question_started_at: null,
          })
          .eq('id', roomId);

        if (error) {
          console.error('Не удалось завершить финал', error);
          return;
        }

        updateRoomStatus('final-results');
        setIsTournamentVisible(true);
        setIsFinalRoundAvailable(false);
        return;
      }

      const { iso: startedAt } = await getServerIsoTimestamp();
      await supabase
        .from('rooms')
        .update({
          status: 'round5-running',
          current_question_index: nextTourIndex,
          question_started_at: startedAt,
          all_players_answered: false,
        })
        .eq('id', roomId);

      round5AdvanceLockRef.current = false;
    } catch (e) {
      console.error('Не удалось перейти к следующему туру финала', e);
      round5AdvanceLockRef.current = false;
    }
  }, [currentQuestionIndex, getServerIsoTimestamp, roomId, stopAllAudio, updateRoomStatus]);

  const scoreAndRevealRound5 = useCallback(async () => {
    if (isMirrorRef.current) return;
    if (isRound5Scoring) {
      return;
    }
    if (round5CurrentBankIndex === null || !round5CurrentQuestion) {
      return;
    }

    setIsRound5Scoring(true);
    try {
      const bankIndex = round5CurrentBankIndex;
      const correct = round5CurrentQuestion.answer;

      const { data, error } = await supabase
        .from('round5_answers')
        .select('id, player_id, answer_value, points_earned, submitted_at')
        .eq('room_id', roomId)
        .eq('question_index', bankIndex)
        .order('submitted_at', { ascending: true });

      if (error) {
        console.error('Не удалось загрузить ответы финала для начисления очков', error);
      }

      const rows = (data ?? []) as Round5AnswerRow[];
      const latestByPlayer = new Map<string, Round5AnswerRow>();
      for (const row of rows) {
        latestByPlayer.set(row.player_id, row);
      }

      const uniqueRows = Array.from(latestByPlayer.values());

      setRound5AnswerRows(
        uniqueRows
          .slice()
          .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)))
      );

      const withPoints = uniqueRows.map((row) => {
        const points = calculateRound5Points(correct, row.answer_value);
        const delta = points - (row.points_earned ?? 0);
        return { ...row, points_earned: points, delta };
      });

      await Promise.all(
        withPoints.map((row) =>
          supabase
            .from('round5_answers')
            .update({ points_earned: row.points_earned })
            .eq('id', row.id)
        )
      );

      const totalMap = new Map(playersRef.current.map((player) => [player.id, player.total_points ?? 0] as const));
      for (const row of withPoints) {
        if (!row.delta) {
          continue;
        }
        const current = totalMap.get(row.player_id) ?? 0;
        const nextTotal = current + row.delta;
        totalMap.set(row.player_id, nextTotal);
        const { error: updateError } = await supabase
          .from('players')
          .update({ total_points: nextTotal })
          .eq('id', row.player_id);
        if (updateError) {
          console.error('Не удалось обновить очки игрока (Раунд 5)', updateError);
        }
      }

      round5ScoredQuestionIndicesRef.current.add(bankIndex);
      await supabase
        .from('rooms')
        .update({ status: 'round5-explanation', all_players_answered: true })
        .eq('id', roomId);
    } catch (e) {
      console.error('Не удалось начислить очки финала', e);
    } finally {
      setIsRound5Scoring(false);
    }
  }, [calculateRound5Points, isRound5Scoring, roomId, round5CurrentBankIndex, round5CurrentQuestion]);

  const startRound4Game = useCallback(async () => {
    if (isMirrorRef.current) return;
    const usedFromDb = await loadUsedRound4PuzzleIds();
    const mergedUsed = Array.from(
      new Set(
        [...round4AskedIdsRef.current, ...usedFromDb].filter((id) => typeof id === 'number' && Number.isFinite(id))
      )
    );

    if (mergedUsed.length !== round4AskedIdsRef.current.length) {
      round4AskedIdsRef.current = mergedUsed;
      setRound4AskedIds(mergedUsed);
    }

    if (mergedUsed.length >= ROUND4_TOTAL_TOURS) {
      setError('Раунд 4 уже отыгран: 6 туров завершены');
      round4StartLockRef.current = false;
      return;
    }

    if (!round4Puzzles.length) {
      setError('Вопросы Раунда 4 ещё не загружены');
      round4StartLockRef.current = false;
      return;
    }

    const usedSet = new Set(mergedUsed);
    const available = round4Puzzles.filter((puzzle) => !usedSet.has(puzzle.id));
    if (!available.length) {
      setError('Раунд 4 завершён: вопросы закончились');
      round4StartLockRef.current = false;
      return;
    }

    const puzzle = pickRandomItem(available);

    const { iso: startedAt, offset } = await getServerIsoTimestamp();

    const { error: updateError } = await supabase
      .from('rooms')
      .update({
        status: 'round4-running',
        question_started_at: startedAt,
        current_question_index: puzzle.id,
        all_players_answered: false,
      })
      .eq('id', roomId);

    if (updateError) {
      setError('Не удалось запустить Раунд 4');
      round4StartLockRef.current = false;
      return;
    }

    round4ScoredPuzzleIdsRef.current.delete(puzzle.id);
    setRound4CurrentPuzzle(puzzle);
    setRound4AnswerRows([]);
    const nextAsked = Array.from(new Set([...mergedUsed, puzzle.id]));
    round4AskedIdsRef.current = nextAsked;
    setRound4AskedIds(nextAsked);
    setShowResults(false);
    setQuestion(null);
    setAnswerCount(0);
    setCorrectAnswerCount(0);
    setAnsweredPlayerIds([]);
    setServerAllPlayersAnswered(false);
    updateRoomStatus('round4-running');
    syncTimerWithStart(startedAt, offset);
    setQuestionStartedAt(startedAt);
    round4StartLockRef.current = false;
  }, [getServerIsoTimestamp, loadUsedRound4PuzzleIds, roomId, round4Puzzles, updateRoomStatus, syncTimerWithStart]);

  const handleRound4Complete = useCallback(async () => {
    if (isMirrorRef.current) return;
    stopRound4Audio();
    setIsTournamentVisible(true);
    setIsFinalRoundAvailable(true);
    playTournamentJingle();
    playRound4EndAudio();
    setShowResults(false);
    setQuestion(null);
    setQuestionStartedAt(null);
    setTimeLeft(0);

    const { error } = await supabase
      .from('rooms')
      .update({
        status: 'finished',
        // Keep room joinable for reconnections / late joins between rounds.
        is_active: true,
        all_players_answered: true,
        question_started_at: null,
      })
      .eq('id', roomId);

    if (error) {
      setError('Не удалось завершить Раунд 4');
      return;
    }

    setRoomStatus('finished');
  }, [playTournamentJingle, playRound4EndAudio, roomId, setQuestion, stopRound4Audio]);

  const maybeAutoAdvanceRound4 = useCallback(() => {
    if (isMirrorRef.current) return;
    if (roomStatusRef.current !== 'round4-running') {
      return;
    }
    if (round4AskedIdsRef.current.length >= ROUND4_TOTAL_TOURS) {
      // Round 4 completed - show leaderboard
      void handleRound4Complete();
      return;
    }
    if (round4StartLockRef.current) {
      return;
    }
    round4StartLockRef.current = true;
    void startRound4Game();
  }, [handleRound4Complete, startRound4Game]);

  const scoreRound4Puzzle = useCallback(
    async (puzzle: Round4Puzzle) => {
      if (isMirrorRef.current) return;
      if (!puzzle || isRound4Scoring) {
        return;
      }
      if (round4ScoredPuzzleIdsRef.current.has(puzzle.id)) {
        return;
      }
      setIsRound4Scoring(true);
      try {
        const { data, error } = await supabase
          .from('round4_answers')
          .select(
            'id, room_id, player_id, puzzle_id, answer_text, is_correct, correct_rank, points_earned, submitted_at'
          )
          .eq('room_id', roomId)
          .eq('puzzle_id', puzzle.id)
          .order('submitted_at', { ascending: true });

        if (error) {
          console.error('Не удалось загрузить ответы Раунда 4', error);
          return;
        }

        const rows = (data ?? []) as Round4AnswerRow[];
        const normalizedAnswers = puzzle.answers.map((a) => normalizeRound4Answer(a));
        let rank = 0;

        const withDeltas = rows.map((row) => {
          const playerAnswer = normalizeRound4Answer(row.answer_text);
          const isCorrect = normalizedAnswers.includes(playerAnswer);
          const correctRank = isCorrect ? ++rank : null;
          const points = isCorrect ? (correctRank === 1 ? 100 : 50) : 0;
          const delta = points - (row.points_earned ?? 0);
          return { ...row, is_correct: isCorrect, correct_rank: correctRank, points_earned: points, delta };
        });

        setRound4AnswerRows(withDeltas);

        await Promise.all(
          withDeltas.map((row) =>
            supabase
              .from('round4_answers')
              .update({
                is_correct: row.is_correct,
                correct_rank: row.correct_rank,
                points_earned: row.points_earned,
              })
              .eq('id', row.id)
          )
        );

        const totalMap = new Map(playersRef.current.map((player) => [player.id, player.total_points ?? 0] as const));

        for (const row of withDeltas) {
          if (!row.delta) {
            continue;
          }
          const current = totalMap.get(row.player_id) ?? 0;
          const nextTotal = current + row.delta;
          totalMap.set(row.player_id, nextTotal);
          const { error: updateError } = await supabase
            .from('players')
            .update({ total_points: nextTotal })
            .eq('id', row.player_id);
          if (updateError) {
            console.error('Не удалось обновить очки игрока (Раунд 4)', updateError);
          }
        }

        round4ScoredPuzzleIdsRef.current.add(puzzle.id);
        setServerAllPlayersAnswered(true);
        await supabase.from('rooms').update({ all_players_answered: true }).eq('id', roomId);
        playRound4AnswerAudio(puzzle.id, { onEnded: maybeAutoAdvanceRound4 });
      } catch (err) {
        console.error('Не удалось начислить очки Раунда 4', err);
      } finally {
        setIsRound4Scoring(false);
      }
    },
    [isRound4Scoring, maybeAutoAdvanceRound4, playRound4AnswerAudio, roomId]
  );

  useEffect(() => {
    if (roomStatus !== 'round4-running') {
      return;
    }
    if (!round4CurrentPuzzle) {
      return;
    }
    if (timeLeft > 0) {
      return;
    }
    void scoreRound4Puzzle(round4CurrentPuzzle);
  }, [roomStatus, round4CurrentPuzzle, timeLeft, scoreRound4Puzzle]);

  useEffect(() => {
    if (roomStatus !== 'round5-running') {
      return;
    }
    if (round5CurrentBankIndex === null || !round5CurrentQuestion) {
      return;
    }
    if (timeLeft > 0) {
      return;
    }
    void scoreAndRevealRound5();
  }, [roomStatus, round5CurrentBankIndex, round5CurrentQuestion, scoreAndRevealRound5, timeLeft]);

  useEffect(() => {
    if (roomStatus !== 'round5-running') {
      return;
    }
    if (!serverAllPlayersAnswered) {
      return;
    }
    if (round5CurrentBankIndex === null || !round5CurrentQuestion) {
      return;
    }
    if (round5ScoredQuestionIndicesRef.current.has(round5CurrentBankIndex)) {
      return;
    }
    void scoreAndRevealRound5();
  }, [roomStatus, round5CurrentBankIndex, round5CurrentQuestion, scoreAndRevealRound5, serverAllPlayersAnswered]);

  useEffect(() => {
    if (roomStatus !== 'round5-explanation') {
      return;
    }
    if (round5CurrentBankIndex === null) {
      return;
    }
    if (!questionStartedAt) {
      return;
    }
    const explanationKey = `${round5CurrentBankIndex}-explanation-${questionStartedAt}`;
    if (lastRound5ExplanationPlaybackKeyRef.current === explanationKey) {
      return;
    }
    lastRound5ExplanationPlaybackKeyRef.current = explanationKey;
    playRound5ExplanationAudio(round5CurrentBankIndex, { onEnded: () => void advanceRound5Tour() });
  }, [advanceRound5Tour, playRound5ExplanationAudio, questionStartedAt, roomStatus, round5CurrentBankIndex]);

  const startRound4Countdown = useCallback(() => {
    if (round4StartLockRef.current || isCountdownVisible) {
      return;
    }
    round4StartLockRef.current = true;
    hasUserInteractedRef.current = true;
    stopAllAudioImmediate();
    setIsTournamentVisible(false);

    const shouldPlaySkip = !round4RulesAudioCompletedRef.current;

    setIsRound4RulesVisible(false);
    stopRound4RulesAudio();

    if (shouldPlaySkip) {
      playSkipAudio();
    }

    clearCountdownTimeout();
    setCountdownContext('round4');
    countdownCompleteActionRef.current = async () => {
      await startRound4Game();
    };
    setIsCountdownVisible(true);
    runCountdownSequence(0);
  }, [
    clearCountdownTimeout,
    isCountdownVisible,
    stopAllAudioImmediate,
    playSkipAudio,
    runCountdownSequence,
    setCountdownContext,
    setIsCountdownVisible,
    setIsRound4RulesVisible,
    stopRound4RulesAudio,
    startRound4Game,
  ]);

  useEffect(() => {
    startRound4CountdownRef.current = startRound4Countdown;
  }, [startRound4Countdown]);

  const handleStartRound4Rules = useCallback(() => {
    void startRound4Countdown();
  }, [startRound4Countdown]);

  const handleCancelRound4Rules = useCallback(() => {
    setIsRound4RulesVisible(false);
    stopRound4RulesAudio();
  }, [stopRound4RulesAudio]);

  const startRound5Countdown = useCallback(() => {
    if (isCountdownVisible) {
      return;
    }
    clearCountdownTimeout();
    setCountdownContext('round5');
    countdownCompleteActionRef.current = async () => {
      await startRound5Game();
    };
    setIsCountdownVisible(true);
    runCountdownSequence(0);
  }, [clearCountdownTimeout, isCountdownVisible, runCountdownSequence, startRound5Game]);

  useEffect(() => {
    startRound5CountdownRef.current = startRound5Countdown;
  }, [startRound5Countdown]);

  const handleStartRound5Rules = useCallback(() => {
    if (isCountdownVisible) {
      return;
    }
    hasUserInteractedRef.current = true;
    stopAllAudioImmediate();
    const shouldPlaySkip = isRound5RulesAudioPlaying;
    setIsRound5RulesVisible(false);
    stopRound5RulesAudio();

    if (shouldPlaySkip) {
      playSkipAudio();
    }

    startRound5Countdown();
  }, [
    isCountdownVisible,
    isRound5RulesAudioPlaying,
    playSkipAudio,
    startRound5Countdown,
    stopAllAudioImmediate,
    stopRound5RulesAudio,
  ]);

  const handleCancelRound5Rules = useCallback(() => {
    setIsRound5RulesVisible(false);
    stopRound5RulesAudio();
  }, [stopRound5RulesAudio]);

  useEffect(() => {
    const isRound1TransitionReady = roomStatus === 'running' && (timeLeft <= 0 || everyoneAnswered);
    if (!question || isLastQuestion || !isRound1TransitionReady || totalPlayers === 0) {
      return;
    }

    const questionKey = typeof question.id === 'number' ? question.id : question.order;
    if (betweenCueQuestionRef.current === questionKey) {
      return;
    }

    betweenCueQuestionRef.current = questionKey;
    const playAndAdvance = () => {
      void playBetweenAudioForPercent(correctAnswerPercentage, {
        onEnded: () => {
          if (roomStatusRef.current !== 'running') {
            return;
          }
          if (isMirrorRef.current) {
            return;
          }
          void nextQuestion();
        },
      });
    };

    playAndAdvance();
  }, [
    question,
    isLastQuestion,
    roomStatus,
    timeLeft,
    everyoneAnswered,
    totalPlayers,
    correctAnswerPercentage,
    playBetweenAudioForPercent,
    nextQuestion,
  ]);

  useEffect(() => {
    const isRound1TransitionReady = roomStatus === 'running' && (timeLeft <= 0 || everyoneAnswered);
    if (!question || !isLastQuestion || !isRound1TransitionReady) {
      return;
    }

    const questionKey = typeof question.id === 'number' ? question.id : question.order;
    if (roundEndLockQuestionRef.current === questionKey) {
      return;
    }

    roundEndLockQuestionRef.current = questionKey;

    if (isMirrorRef.current) {
      stopQuestionAudio();
      playRound1EndCeremonyAudio();
      return;
    }

    roundEndButtonSetterRef.current(true);
    clearRoundEndDelayTimeout();
    clearRoundEndUnlockTimeout();

    const finishIfStillSame = () => {
      if (roundEndLockQuestionRef.current !== questionKey) {
        return;
      }
      playRound1EndCeremonyAudio();
      roundEndButtonSetterRef.current(false);
      void finishRound();
    };

    void playBetweenAudioForPercent(correctAnswerPercentage, { onEnded: finishIfStillSame });
    roundEndDelayTimeoutRef.current = setTimeout(finishIfStillSame, 12000);
  }, [
    question,
    roomStatus,
    timeLeft,
    everyoneAnswered,
    isLastQuestion,
    stopQuestionAudio,
    playRound1EndCeremonyAudio,
    finishRound,
    clearRoundEndUnlockTimeout,
    playBetweenAudioForPercent,
    correctAnswerPercentage,
    clearRoundEndDelayTimeout,
  ]);

  useEffect(() => {
    if (roomStatus !== 'running' || showResults) {
      clearAutoNextTimeout();
      clearAutoFinishTimeout();
      return;
    }

    if (!canAdvance || isLastQuestion) {
      clearAutoNextTimeout();
      clearAutoFinishTimeout();
      return;
    }
    if (isMirrorRef.current) return;

    const questionKey = typeof question?.id === 'number' ? question.id : question?.order;
    if (questionKey !== undefined && betweenCueQuestionRef.current === questionKey) {
      clearAutoNextTimeout();
      clearAutoFinishTimeout();
      return;
    }

    if (autoNextTimeoutRef.current) {
      return;
    }

    const outroDelay = Math.max(0, AUTO_NEXT_DELAY_MS - ROUND1_VARIANTS_OUTRO_MS);
    round1VariantsOutroTimeoutRef.current = setTimeout(() => {
      round1VariantsOutroTimeoutRef.current = null;
      void round1VariantsPanelRef.current?.hideCorrect();
    }, outroDelay);

    autoNextTimeoutRef.current = setTimeout(() => {
      autoNextTimeoutRef.current = null;
      void nextQuestion();
    }, AUTO_NEXT_DELAY_MS);

    return () => {
      clearAutoNextTimeout();
    };
  }, [roomStatus, showResults, canAdvance, isLastQuestion, nextQuestion, clearAutoNextTimeout]);

  useEffect(() => {
    if (roomStatus !== 'running' || showResults) {
      clearAutoFinishTimeout();
      return;
    }
    if (isLastQuestion) {
      clearAutoFinishTimeout();
      return;
    }
    if (!canAdvance || !isLastQuestion) {
      clearAutoFinishTimeout();
      return;
    }
    // On the last question we intentionally delay finishing the round to allow
    // the end-of-round audio (round1end/* + ROUND1_END_JINGLE_FILE) to play.
    if (isSummaryLoading || (!isLastQuestion && isRoundEndButtonLocked)) {
      clearAutoFinishTimeout();
      return;
    }
    if (autoFinishTimeoutRef.current) {
      return;
    }
    autoFinishTimeoutRef.current = setTimeout(() => {
      autoFinishTimeoutRef.current = null;
      void finishRound();
    }, 1500);
    return () => {
      clearAutoFinishTimeout();
    };
  }, [
    roomStatus,
    showResults,
    canAdvance,
    isLastQuestion,
    isSummaryLoading,
    isRoundEndButtonLocked,
    finishRound,
    clearAutoFinishTimeout,
  ]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center comic-bg-dots-yellow text-black">
        <div className="comic-panel border-[4px] border-[#000] bg-white px-6 py-4 text-xl comic-font">
          Загрузка панели ведущего…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center comic-bg-dots-yellow text-black px-4">
        <div className="comic-panel border-[4px] border-[#000] bg-white  max-w-md w-full p-8 text-center space-y-4">
          <p className="comic-font text-xs tracking-[0.4em] text-[#ff2a2a]/70">Ошибка</p>
          <h2 className="text-2xl comic-font text-[#ff2a2a]">Комната не найдена</h2>
          <p className="text-sm text-black">{error}</p>
          <button
            onClick={() => router.push('/host')}
            className="w-full py-3 comic-panel comic-font text-base tracking-[0.2em] bg-[#ff2a2a] text-white border-[4px] border-[#000] hover:scale-105 hover: transition-all duration-200"
          >
            ← Вернуться на главную
          </button>
        </div>
      </div>
    );
  }

  if (!isRoomOpened) {
    return (
      <div className="min-h-screen flex items-center justify-center comic-bg-dots-yellow text-black">
        <button
          onClick={handleHostInteraction}
          className="px-8 py-4 comic-panel border-[4px] border-[#000] bg-[#ffde00] text-black comic-font text-2xl tracking-[0.2em] hover:bg-[#ff2a2a] hover:text-white transition-colors"
        >
          {isMirror ? '📡 ОТКРЫТЬ ЗЕРКАЛО' : 'ОТКРЫТЬ КОМНАТУ'}
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
    isTournamentVisible
      ? roomStatus === 'final-results'
        ? 'Финальные результаты'
        : isFinalRoundAvailable
          ? '4 раунд завершён'
          : '3 раунд завершён'
      : roomStatus === 'waiting'
        ? 'Ожидание и подключение'
        : roomStatus === 'running'
          ? 'Раунд 1 в эфире'
          : roomStatus === 'round2-running'
            ? 'Раунд 2 в эфире'
            : roomStatus === 'round3-running'
              ? 'Раунд 3 в эфире'
              : roomStatus === 'round4-running'
                ? 'Раунд 4 в эфире'
                : roomStatus === 'round5-running' || roomStatus === 'round5-explanation'
                  ? 'Раунд 5 в эфире'
                  : roomStatus === 'final-results'
                    ? 'Финальные результаты'
                    : 'Итоги раунда';
  const statusBadgeClass =
    roomStatus === 'running'
      ? 'bg-[#ff007f] text-white'
      : roomStatus === 'round2-running'
        ? 'bg-[#ff007f] text-white'
        : roomStatus === 'round3-running'
          ? 'bg-[#ff007f] text-white'
          : roomStatus === 'round4-running'
            ? 'bg-[#00c3ff] text-white'
            : roomStatus === 'round5-running' || roomStatus === 'round5-explanation'
              ? 'bg-[#ff2a2a] text-white'
        : roomStatus === 'waiting'
          ? 'bg-[#ffde00] text-black'
          : 'bg-[#00c3ff] text-white';

  const isMobileLayout = layoutMode === 'mobile';
  const isStackedLayout = layoutMode === 'stacked';
  const isCompactLayout = layoutMode === 'compact';
  const isCompactForcedLayout = layoutMode === 'compact';
  const layoutModeLabel =
    layoutMode === 'default' ? 'Desktop' : layoutMode === 'compact' ? 'Compact' : layoutMode === 'stacked' ? 'Stacked' : 'Mobile';
  const mobileQuestionText =
    roomStatus === 'round2-running'
      ? round2Phase === 'fact'
        ? round2Statement
        : round2ExplanationText
      : roomStatus === 'round3-running'
        ? currentRound3Question?.question ?? 'Подождите, факты загружаются…'
        : roomStatus === 'round4-running'
          ? round4CurrentPuzzle?.emoji ?? '⏳'
          : roomStatus === 'round5-running' || roomStatus === 'round5-explanation'
            ? round5CurrentQuestion?.question ?? 'Подождите, вопрос загружается…'
            : question
              ? question.text
              : showResults
                ? 'Итоги раунда'
                : 'Подождите, раунд загружается…';
  const mobileTimerLabel =
    roomStatus === 'round3-running'
      ? `${round3TimerTimeLeft} c`
      : roomStatus === 'round4-running'
        ? `${timeLeft} c`
        : roomStatus === 'round5-running' || roomStatus === 'round5-explanation'
          ? `${timeLeft} c`
          : `${effectiveTimeLeft} c`;

  const getBackgroundClass = () => {
    if (roomStatus.startsWith('round1')) return 'comic-bg-dots-yellow';
    if (roomStatus.startsWith('round2')) return 'comic-bg-dots-blue';
    if (roomStatus.startsWith('round3')) return 'comic-bg-dots-pink';
    if (roomStatus.startsWith('round4')) return 'comic-bg-dots-red';
    if (roomStatus.startsWith('round5')) return 'comic-bg-rays-yellow-red';
    return 'comic-bg-dots-yellow';
  };

  return (
    <div className={isAnimationsDisabled ? 'disable-animations' : ''}>
      <div
        style={
          isMobileLayout
            ? ({ '--host-font-scale': 0.8 } as CSSProperties)
            : isCompactLayout
              ? ({ zoom: forcedLayoutScale } as unknown as CSSProperties)
              : undefined
        }
        className={`min-h-screen text-black ${isCompactForcedLayout ? 'px-2 py-3' : 'px-4 py-6'} transition-opacity duration-1000 opacity-100 ${
          isMobileLayout ? 'text-[calc(1rem*var(--host-font-scale))]' : ''
        } ${getBackgroundClass()}`}
      >
        <div className={`${isMobileLayout ? 'max-w-full' : 'max-w-[95vw] mx-auto'} ${isCompactForcedLayout ? 'space-y-3' : 'space-y-6'}`}>
          {!isMobileLayout && !isStackedLayout ? (
            <header className="comic-panel bg-[#ff2a2a] text-white px-6 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="comic-font text-[11px] tracking-[0.5em] text-white/70">Панель ведущего</p>
                <h1 className={`${isCompactForcedLayout ? 'text-xl' : 'text-3xl'} comic-font leading-tight`}>
                  Комната {roomCode || '----'}
                </h1>
              </div>
                {isMirror ? (
                  <MirrorControls
                    compact={isCompactForcedLayout}
                    isAnimationsDisabled={isAnimationsDisabled}
                    onToggleAnimations={() => {
                      const next = !isAnimationsDisabled;
                      setIsAnimationsDisabled(next);
                      localStorage.setItem('host_animations_disabled', String(next));
                    }}
                    isMusicMuted={isMusicMuted}
                    onToggleMusicMute={toggleMusicMute}
                    isVoiceMuted={isVoiceMuted}
                    onToggleVoiceMute={toggleVoiceMute}
                  />
                ) : (
                  <HostControls
                    primaryLabel={headerActionLabel}
                    onPrimaryAction={handlePrimaryHeaderAction}
                    onOpenQr={() => setIsJoinQrModalOpen(true)}
                    onToggleLayout={setNextLayoutMode}
                    layoutLabel={layoutModeLabel}
                    compact={isCompactForcedLayout}
                    isAnimationsDisabled={isAnimationsDisabled}
                    onToggleAnimations={() => {
                      const next = !isAnimationsDisabled;
                      setIsAnimationsDisabled(next);
                      localStorage.setItem('host_animations_disabled', String(next));
                    }}
                    isMusicMuted={isMusicMuted}
                    onToggleMusicMute={toggleMusicMute}
                    isVoiceMuted={isVoiceMuted}
                    onToggleVoiceMute={toggleVoiceMute}
                  />
                )}
            </div>
            </header>
          ) : null}

        {showMobilePrompt && !isMirror ? (
          <div className="comic-panel border-[#000]/30 bg-white px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm comic-font text-black">Похоже, у вас мобильный экран. Переключиться на Mobile view?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={switchToMobileLayout}
                className="px-4 py-2 comic-panel border-[#000] bg-[#ff2a2a] text-white comic-font text-xs tracking-[0.2em]"
              >
                Переключить
              </button>
              <button
                type="button"
                onClick={dismissMobilePrompt}
                className="px-4 py-2 comic-panel border-[#000]/30 bg-white comic-font text-xs"
              >
                Позже
              </button>
            </div>
          </div>
        ) : null}

        {error && (
          <div className="comic-panel border-[#000] bg-[#ff2a2a] px-4 py-3 text-sm comic-font text-white">
            {error}
          </div>
        )}

        {isStackedLayout ? (
          <HostStackedLayout
            controlsView={
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="comic-font text-[11px] tracking-[0.5em] text-white/80">Панель ведущего</p>
                  <h2 className="text-2xl comic-font leading-tight text-white">Комната {roomCode || '----'}</h2>
                </div>
                {isMirror ? (
                  <MirrorControls
                    compact
                    isAnimationsDisabled={isAnimationsDisabled}
                    onToggleAnimations={() => {
                      const next = !isAnimationsDisabled;
                      setIsAnimationsDisabled(next);
                      localStorage.setItem('host_animations_disabled', String(next));
                    }}
                    isMusicMuted={isMusicMuted}
                    onToggleMusicMute={toggleMusicMute}
                    isVoiceMuted={isVoiceMuted}
                    onToggleVoiceMute={toggleVoiceMute}
                  />
                ) : (
                  <HostControls
                    primaryLabel={headerActionLabel}
                    onPrimaryAction={handlePrimaryHeaderAction}
                    onOpenQr={() => setIsJoinQrModalOpen(true)}
                    onToggleLayout={setNextLayoutMode}
                    layoutLabel={layoutModeLabel}
                    compact
                  />
                )}
              </div>
            }
            questionView={(() => {
              if (roomStatus === 'waiting') {
                return (
                  <div className="comic-panel bg-white p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="comic-font text-xs tracking-[0.4em] text-black/60">Сцена перед стартом</p>
                        <h2 className="text-2xl comic-font">⌛ Ждём подключений</h2>
                        <p className="text-sm text-black/80 mt-1 comic-font">Код комнаты: <span className="font-mono comic-font text-lg">{roomCode}</span></p>
                      </div>
                      <span className="text-sm comic-font text-black/70 whitespace-nowrap">Игроков: {players.length}</span>
                    </div>
                    <div className="comic-panel bg-white p-4 space-y-2">
                      <p className="text-sm comic-font text-black/80">Поделитесь кодом или QR, затем жмите старт.</p>
                      <JoinQrBlock
                        roomCode={roomCode}
                        qrWindowUrl={`/host/${roomId}/qr?code=${encodeURIComponent(roomCode)}`}
                        className="comic-panel bg-white"
                      />
                      {!isMirror && (() => {
                        const mirrorUrl = typeof window !== 'undefined' ? `${window.location.origin}/host/mirror/${roomId}` : '';
                        return mirrorUrl ? (
                          <div className="border-t-2 border-dashed border-black/20 pt-3 mt-3 space-y-2 text-center">
                            <p className="text-sm comic-font text-purple-700 font-bold">📡 Зеркало трансляции</p>
                            <div className="inline-block border-2 border-purple-400 rounded-xl p-2 bg-white">
                              <QRCodeCanvas value={mirrorUrl} size={120} fgColor="#7c3aed" bgColor="#ffffff" />
                            </div>
                            <p className="text-xs text-purple-600 comic-font break-all">{mirrorUrl}</p>
                          </div>
                        ) : null;
                      })()}
                    </div>
                    {!isMirror ? (
                      <button
                        onClick={handlePrepareRound}
                        disabled={players.length === 0}
                        className="comic-button hover:scale-105 hover: transition-all duration-200 w-full py-3 text-base bg-[#ffde00] text-black disabled:opacity-40 disabled:cursor-not-allowed host-start-blink"
                      >
                        Начать игру →
                      </button>
                    ) : (
                      <div className="w-full py-3 comic-panel comic-font text-base tracking-[0.2em] text-center text-black/50 border-[4px] border-dashed border-black/20">
                        ⏳ ОЖИДАЕМ НАЧАЛО...
                      </div>
                    )}
                    {players.length === 0 && <p className="text-xs text-black/60 comic-font">Нужно как минимум 1 игрок.</p>}
                  </div>
                );
              }

              if (roomStatus === 'running' && question) {
                return (
                  <div className="comic-panel bg-white p-6 flex flex-col gap-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-h-[44px]">
                      <span className="px-4 py-2 comic-panel border-[4px] border-[#000] text-sm comic-font">
                        Вопрос {question.order} / {totalQuestions}
                      </span>
                      <span className="text-sm comic-font text-black/70 whitespace-nowrap">
                        Ответили: <span className="text-[#00c3ff] tabular-nums">{answeredCount}/{totalPlayers}</span>
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-black/70 mb-1">
                        <span>Таймер · 30 сек</span>
                        <span className="comic-font text-black">
                          {allPlayersAnswered ? 'Все ответили' : `${effectiveTimeLeft} c`}
                        </span>
                      </div>
                      <div className="h-3 comic-panel bg-[#ffde00] overflow-hidden">
                        <div
                          className={`h-full ${effectiveTimeLeft > 5 ? 'bg-[#00c3ff]' : 'bg-[#ff007f]'}`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className="min-h-[20px]">
                        {allPlayersAnswered && (
                          <p className="text-xs text-[#00c3ff] comic-font mt-2">Все игроки уже ответили — можно переходить дальше.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col gap-5">
                      <div className="flex-1 min-h-0 flex items-center justify-center">
                        <h2 className="text-3xl comic-font leading-tight text-center max-h-full overflow-y-auto">
                          <AnimatedText
                            key={`r1-q-${typeof question.id === 'number' ? question.id : question.order}`}
                            text={question.text}
                            className="text-4xl sm:text-5xl comic-font leading-tight"
                          />
                        </h2>
                      </div>

                      <div className="comic-panel border-dashed border-[#000]/30 bg-white p-4 space-y-3 shrink-0">
                        <div className="flex items-center justify-between">
                          <p className="comic-font text-[11px] tracking-[0.4em] text-black/70">Варианты</p>
                          <span className="text-xs comic-font text-black/60">+{question.points} 💎</span>
                        </div>
                        <Round1VariantsPanel
                          ref={round1VariantsPanelRef}
                          options={question.options.slice(0, 4)}
                          correctIndex={question.correctIndex}
                          points={question.points}
                          revealCorrect={canAdvance}
                          questionKey={typeof question.id === 'number' ? question.id : question.order}
                        />
                      </div>

                      <p className="text-xs text-black/70 shrink-0">
                        {isRoundEndButtonLocked
                          ? 'Подождите несколько секунд — звучит финальный джингл перед стартом следующего раунда.'
                          : canAdvance
                            ? isLastQuestion
                              ? 'Итоги появятся автоматически.'
                              : 'Следующий вопрос появится автоматически.'
                            : 'После таймера правильный ответ покажется сам.'}
                      </p>
                    </div>
                  </div>
                );
              }

              if (roomStatus === 'round2-running') {
                return (
                  <div className="comic-panel border-[4px] border-[#000] bg-white  p-6 space-y-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="comic-font text-xs tracking-[0.4em] text-[#ff007f]/70">Раунд 2 · «Фейколов»</p>
                        <h2 className="text-3xl comic-font">⚡ Охота на фейк</h2>
                      </div>
                      <div className="flex flex-col items-start sm:items-end gap-2">
                        <span className="px-4 py-2 comic-panel border-[4px] border-[#000] text-sm comic-font text-[#ff007f]">
                          Факт <span className="text-black">{clampedRound2QuestionNumber}</span>/{ROUND2_TOTAL_QUESTIONS}
                        </span>
                        <span className="text-xs comic-font text-black/70">
                          Ответили: <span className="comic-font text-[#ff007f]">{answeredCount}/{totalPlayers}</span>
                        </span>
                      </div>
                    </div>

                    <div
                      key={`round2-onair-${round2CurrentIndex ?? clampedRound2QuestionNumber}-${round2Phase}`}
                      className="comic-panel border-[#000]/20 bg-white p-5 space-y-2 animate-round2-onair"
                    >
                      <p className="text-[11px] tracking-[0.4em] text-[#ff007f]/60">{round2Phase === 'fact' ? 'Сейчас в эфире' : 'Объяснение'}</p>

                      {round2Phase === 'fact' ? (
                        <p className="text-4xl sm:text-5xl comic-font leading-tight text-center">
                          <AnimatedText
                            key={`r2-fact-${round2CurrentIndex ?? clampedRound2QuestionNumber}`}
                            text={round2Statement}
                          />
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <div className="comic-panel border-[#000]/30 bg-white px-4 py-5 text-center">
                            <p
                              className={`text-5xl sm:text-6xl comic-font ${round2ShowingFact ? 'text-[#00c3ff]' : 'text-[#ff007f]'} animate-round2-answer`}
                            >
                              {round2ShowingFact ? 'ПРАВДА' : 'ВЫМЫСЕЛ'}
                            </p>
                          </div>
                          <p className="text-3xl sm:text-4xl comic-font leading-tight text-center">
                            <AnimatedText
                              key={`r2-expl-${round2CurrentIndex ?? clampedRound2QuestionNumber}-${round2ShowingFact ? 't' : 'f'}`}
                              text={round2ExplanationText}
                            />
                          </p>
                        </div>
                      )}
                    </div>

                    {round2Phase === 'fact' ? (
                      <div>
                        <div className="flex justify-between text-xs text-black/70 mb-1">
                          <span>Таймер · 30 сек</span>
                          <span className={`comic-font ${serverAllPlayersAnswered ? 'text-[#ff007f]' : 'text-black'}`}>
                            {serverAllPlayersAnswered ? 'Все проголосовали' : `${effectiveTimeLeft} c`}
                          </span>
                        </div>
                        <div className="h-3 comic-panel bg-[#ffde00] overflow-hidden">
                          <div
                            className={`h-full ${effectiveTimeLeft > 5 ? 'bg-[#ff007f]' : 'bg-[#ff007f]'}`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        {serverAllPlayersAnswered && (
                          <p className="text-xs text-[#ff007f] comic-font mt-2">Можно открывать правду прямо сейчас.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              }

              if (roomStatus === 'round3-running') {
                return (
                  <div className="comic-panel border-[4px] border-[#000] bg-white  p-6 space-y-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-3xl comic-font">🧠 {currentRound3Question?.category ?? 'Категория не указана'}</h2>
                      </div>
                      <div className="flex flex-col items-start sm:items-end gap-2">
                        <span className="px-4 py-2 comic-panel border-[4px] border-[#000] text-sm comic-font text-[#ff007f]">
                          Факт <span className="text-black">{currentQuestionIndex + 1}</span>/{round3QuestionCount || ROUND3_TOTAL_QUESTIONS}
                        </span>
                      </div>
                    </div>

                    {isRound3ResultsPhase && (
                      <div className="comic-panel border-[#000]/20 bg-white p-4 space-y-3 animate-round3-panel">
                        <p className="text-lg sm:text-xl tracking-[0.35em] text-[#ff007f]/70 comic-font">Правильный ответ</p>
                        <p className="text-2xl sm:text-3xl comic-font leading-snug">
                          {renderRound3CorrectAnswerExcerpt(currentRound3Question?.question ?? '', currentRound3Question?.answer ?? '')}
                        </p>
                      </div>
                    )}

                    {isRound3ResultsPhase && bestRound3WrongAnswerText && (
                      <div className="comic-panel border-[#000]/15 bg-white p-4 space-y-3 animate-round3-panel">
                        <p className="text-base sm:text-lg tracking-[0.25em] text-black/65 comic-font">Лучший неправильный ответ</p>
                        <p className="text-2xl sm:text-3xl comic-font leading-snug">
                          {renderRound3WrongAnswerExcerpt(currentRound3Question?.question ?? '', bestRound3WrongAnswerText)}
                        </p>
                      </div>
                    )}

                    {!isRound3ResultsPhase && (
                      <div className="comic-panel border-[#000]/20 bg-white p-5 space-y-2 animate-round3-panel">
                        <p className="text-[11px] tracking-[0.4em] text-[#ff007f]/60">Сейчас в эфире</p>
                        <p className="text-4xl sm:text-5xl comic-font leading-tight">
                          {currentRound3Question?.question ? (
                            <AnimatedText key={`r3-q-${currentQuestionIndex}`} text={currentRound3Question.question} />
                          ) : (
                            'Подождите, факты загружаются…'
                          )}
                        </p>
                      </div>
                    )}

                    <div>
                      <div className="flex justify-between text-xs text-black/70 mb-1">
                        <span>{isRound3ResultsPhase ? 'Итоги' : `Таймер · ${ROUND3_ANSWER_SECONDS} сек`}</span>
                        <span className={`comic-font ${allPlayersAnswered ? 'text-[#00c3ff]' : 'text-black'}`}>
                          {isRound3ResultsPhase ? 'Готово' : allPlayersAnswered ? 'Все ответили' : `${round3TimerTimeLeft} c`}
                        </span>
                      </div>
                      <div className="h-3 comic-panel bg-[#ffde00] overflow-hidden">
                        <div
                          className={`h-full ${round3TimerTimeLeft > 5 ? 'bg-[#00c3ff]' : 'bg-[#ff007f]'}`}
                          style={{ width: `${round3ProgressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              }

              if (roomStatus === 'round4-running') {
                return (
                  <div className="comic-panel bg-white p-6 space-y-5 animate-round4-panel">
                    <div className="text-center space-y-3">
                      {round4CurrentPuzzle && (
                        <p className="text-3xl comic-font text-[#00c3ff] uppercase tracking-wide">{round4CurrentPuzzle.category}</p>
                      )}
                      <h2 className="text-5xl sm:text-6xl comic-font leading-tight text-center">{round4CurrentPuzzle ? round4CurrentPuzzle.emoji : '⏳'}</h2>
                      {!round4CurrentPuzzle && (
                        <p className="text-sm text-black/70">Ждём выдачу первой загадки — нажмите «Раунд 4», если нужно перезапустить.</p>
                      )}
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-black/70 mb-1">
                        <span>Таймер · 30 сек</span>
                        <span className={`comic-font ${timeLeft <= 0 ? 'text-[#ff007f]' : 'text-black'}`}>
                          {timeLeft > 0 ? `${timeLeft} c` : 'Время истекло'}
                        </span>
                      </div>
                      <div className="h-3 comic-panel bg-[#ffde00] overflow-hidden">
                        <div
                          className={`h-full ${timeLeft > 5 ? 'bg-[#00c3ff]' : 'bg-[#ff007f]'}`}
                          style={{ width: `${round4ProgressPercent}%` }}
                        />
                      </div>
                      {timeLeft <= 0 && <p className="text-xs text-[#00c3ff] comic-font mt-2">Время истекло — озвучиваем ответ.</p>}
                    </div>

                    {timeLeft <= 0 && round4CurrentPuzzle && (
                      <div className="comic-panel border-[#000]/15 bg-white p-5 space-y-2 text-center animate-correct-reveal">
                        <p className="comic-font text-[11px] tracking-[0.5em] text-black/70">Правильный ответ</p>
                        <p className="text-4xl comic-font text-[#00c3ff]">{round4CurrentPuzzle.answers?.[0] ?? '—'}</p>

                        {round4AnswerRows.length > 0 && (
                          <div className="pt-2 space-y-2">
                            <p className="comic-font text-[11px] tracking-[0.4em] text-black/60">Ответы игроков</p>
                            <div className="flex flex-wrap justify-center gap-2">
                              {round4AnswerRows
                                .slice()
                                .sort((a, b) => Number(!!b.is_correct) - Number(!!a.is_correct))
                                .map((row, index) => (
                                  <span
                                    key={row.id}
                                    className={`px-4 py-3 comic-panel comic-font text-lg sm:text-xl animate-drop-in ${
                                      row.is_correct
                                        ? 'border-[#000]/30 bg-white text-[#00c3ff]'
                                        : 'border-[#000]/15 bg-white text-black'
                                    }`}
                                    style={{ animationDelay: `${index * 40}ms` }}
                                  >
                                    {row.answer_text?.trim() ? row.answer_text : '—'}
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-center">
                      <span className="px-4 py-2 comic-panel border-[4px] border-[#000] text-sm comic-font">
                        Тур {currentRound4TourNumber} / {ROUND4_TOTAL_TOURS}
                      </span>
                    </div>
                  </div>
                );
              }

              if (roomStatus === 'round5-running' || roomStatus === 'round5-explanation') {
                return (
                  <div className="comic-panel bg-white p-6 space-y-5">
                    <div className="text-center space-y-3">
                      <p className="comic-font text-xs tracking-[0.4em] text-black/70">Финал · «Цифровая интуиция»</p>
                      {roomStatus === 'round5-running' ? (
                        <h2 className="text-5xl sm:text-6xl comic-font leading-tight text-center text-black">
                          {round5CurrentQuestion?.question ? (
                            <AnimatedText
                              key={`r5-q-${round5CurrentBankIndex ?? currentQuestionIndex}`}
                              text={round5CurrentQuestion.question}
                            />
                          ) : (
                            '⏳'
                          )}
                        </h2>
                      ) : (
                        <div className="h-[44px] sm:h-[56px]" aria-hidden="true" />
                      )}
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        <span className="px-4 py-2 comic-panel border-[4px] border-[#000] text-sm comic-font">
                          Тур {Math.min(Math.max(currentQuestionIndex + 1, 1), round5TotalCount)} / {round5TotalCount}
                        </span>
                        <span className="text-sm comic-font text-black/70">
                          Ответили: <span className="text-[#00c3ff]">{answerCount}/{totalPlayers}</span>
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-black/70 mb-1">
                        <span>Таймер · 30 сек</span>
                        {roomStatus === 'round5-running' ? (
                          <span className={`comic-font ${timeLeft <= 0 ? 'text-[#ff007f]' : 'text-black'}`}>
                            {timeLeft > 0 ? `${timeLeft} c` : 'Время истекло'}
                          </span>
                        ) : (
                          <span className="comic-font text-[#00c3ff]">Ответ открыт</span>
                        )}
                      </div>
                      <div className="h-3 comic-panel bg-[#ffde00] overflow-hidden">
                        <div
                          className={`h-full ${timeLeft > 5 ? 'bg-[#00c3ff]' : 'bg-[#ff007f]'}`}
                          style={{ width: `${Math.max(0, Math.min(100, (timeLeft / QUESTION_DURATION_SECONDS) * 100))}%` }}
                        />
                      </div>
                      {roomStatus === 'round5-running' && timeLeft <= 0 && (
                        <p className="text-xs text-[#00c3ff] comic-font mt-2">Время истекло — начисляем очки и показываем ответ.</p>
                      )}
                    </div>

                    {roomStatus === 'round5-explanation' && round5CurrentQuestion && (
                      <div className="comic-panel border-[#000]/15 bg-white p-5 space-y-3 text-center animate-correct-reveal">
                        <p className="comic-font text-[11px] tracking-[0.5em] text-black/70">Правильный ответ</p>
                        <p className="text-5xl comic-font text-[#00c3ff]">{round5CurrentQuestion.answer}</p>
                        {round5CurrentQuestion.explanation && (
                          <p className="text-sm comic-font text-black/80 whitespace-pre-line">{round5CurrentQuestion.explanation}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <QuestionView>
                  <p className="comic-font text-[10px] tracking-[0.35em] text-black/60">СЕЙЧАС</p>
                  <h2 className="text-2xl comic-font text-black leading-tight">{statusLabel}</h2>
                  <p className="text-xl comic-font text-black break-words leading-tight">{mobileQuestionText}</p>
                  <div className="flex items-center justify-between text-sm sm:text-base text-black/70">
                    <span>Таймер</span>
                    <span className="comic-font text-xl text-black">{mobileTimerLabel}</span>
                  </div>
                </QuestionView>
              );
            })()}
            stateView={
              <section className="comic-panel border-[#000] bg-white  p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="comic-font text-xs tracking-[0.4em] text-black/60">Состояние раунда</p>
                    <p className="text-lg sm:text-xl comic-font text-black leading-tight whitespace-normal break-words">{statusLabel}</p>
                    <p className="text-xs comic-font text-black/60">{roomStatus === 'waiting' ? 'Ждём игроков' : 'Игра идёт'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-black/60">Игроки</p>
                    <p className="text-2xl comic-font">{players.length || 0}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm comic-font">
                  <div className="comic-panel border-[#000]/20 bg-white px-4 py-3">
                    <p className="text-[11px] text-black/60">Вопрос</p>
                    <p className="text-2xl comic-font">
                      {roomStatus === 'round2-running'
                        ? round2Offset + clampedRound2QuestionNumber
                        : isRound3Running
                          ? round3Offset + (currentQuestionIndex + 1)
                          : roomStatus === 'round4-running'
                            ? round4Offset + currentRound4TourNumber
                            : roomStatus === 'round5-running' || roomStatus === 'round5-explanation'
                              ? round5Offset + (currentQuestionIndex + 1)
                              : showResults && roomStatus === 'finished'
                                ? round2Leaderboard.length > 0
                                  ? round2Offset + ROUND2_TOTAL_QUESTIONS
                                  : totalQuestions
                                : question
                                  ? question.order
                                  : 0}
                    </p>
                  </div>
                  <div className="comic-panel border-[#000]/20 bg-white px-4 py-3">
                    <p className="text-[11px] text-black/60">Ответы</p>
                    <p className="text-2xl comic-font text-[#00c3ff]">{answeredCount}</p>
                  </div>
                </div>
              </section>
            }
            answersView={
              <AnswersView>
                <div className="flex items-center justify-between text-sm comic-font">
                  <span>Ответы</span>
                  <span className="comic-font text-[#00c3ff]">
                    {answeredCount}/{totalPlayers}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm comic-font">
                  <span>Правильные</span>
                  <span className="comic-font text-[#00c3ff]">{correctAnswerCount}</span>
                </div>
              </AnswersView>
            }
            likesView={
              <LikesView>
                <div className="flex items-center justify-between text-sm comic-font">
                  <span>Текущий вопрос</span>
                  <span className="comic-font text-[#ff007f]">{currentQuestionLikes ?? 0}</span>
                </div>
              </LikesView>
            }
            extraView={null}
            playersView={
              <PlayersAccordion title="Игроки" count={players.length}>
                {players.length === 0 ? (
                  <p className="text-sm text-black/70 text-center py-2">Пока никто не присоединился</p>
                ) : (
                  <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1 no-scrollbar">
                    {players.map((player, index) => (
                      <div
                        key={player.id}
                        className="comic-panel border-[2px] border-[#000]/15 bg-white px-3 py-2 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-7 h-7 comic-panel border-[2px] border-[#000]/30 flex items-center justify-center comic-font text-xs">
                            {index + 1}
                          </span>
                          <p className="comic-font text-sm leading-snug whitespace-normal break-words overflow-hidden max-h-[2.8em]">
                            {player.name}
                          </p>
                        </div>
                        <p className="comic-font text-[#ff007f] text-sm">{player.total_points} 💎</p>
                      </div>
                    ))}
                  </div>
                )}
              </PlayersAccordion>
            }
          />
        ) : isMobileLayout ? (
          <HostMobileLayout
            questionView={
              <QuestionView>
                <p className="comic-font text-[10px] tracking-[0.35em] text-black/60">СЕЙЧАС</p>
                <h2 className="text-lg comic-font text-black">{statusLabel}</h2>
                <p className="text-base comic-font text-black break-words">{mobileQuestionText}</p>
                <div className="flex items-center justify-between text-xs text-black/70">
                  <span>Таймер</span>
                  <span className="comic-font">{mobileTimerLabel}</span>
                </div>
              </QuestionView>
            }
            answersView={
              <AnswersView>
                <div className="flex items-center justify-between text-sm comic-font">
                  <span>Ответы</span>
                  <span className="comic-font text-[#00c3ff]">
                    {answeredCount}/{totalPlayers}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm comic-font">
                  <span>Правильные</span>
                  <span className="comic-font text-[#00c3ff]">{correctAnswerCount}</span>
                </div>
              </AnswersView>
            }
            likesView={
              <LikesView>
                <div className="flex items-center justify-between text-sm comic-font">
                  <span>Текущий вопрос</span>
                  <span className="comic-font text-[#ff007f]">{currentQuestionLikes ?? 0}</span>
                </div>
                {bestQuestion ? (
                  <div className="text-xs text-black/70">Лучший: {bestQuestion.text} ({bestQuestion.likes})</div>
                ) : (
                  <div className="text-xs text-black/70">Лучший вопрос пока не определён</div>
                )}
              </LikesView>
            }
            extraView={
              isWaiting ? (
                <section className="comic-panel border-[#000] bg-white  p-4 space-y-3">
                  {!isMirror ? (
                    <button
                      type="button"
                      onClick={handlePrepareRound}
                      disabled={players.length === 0}
                      className="w-full py-3 comic-panel comic-font text-sm tracking-[0.2em] bg-[#ff2a2a] text-white border-[4px] border-[#000] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Начать игру
                    </button>
                  ) : (
                    <div className="w-full py-3 comic-panel comic-font text-sm tracking-[0.2em] text-center text-black/50 border-[4px] border-dashed border-black/20">
                      ⏳ ОЖИДАЕМ...
                    </div>
                  )}
                  {players.length === 0 ? (
                    <p className="text-xs text-black/60 text-center">Нужно как минимум 1 игрок.</p>
                  ) : null}

                  <details className="comic-panel border-[2px] border-[#000]/20 bg-white">
                    <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-xs comic-font tracking-[0.25em] text-black/60">
                      QR
                      <span className="text-black">Развернуть</span>
                    </summary>
                    <div className="px-3 pb-4">
                      <JoinQrBlock
                        roomCode={roomCode}
                        qrWindowUrl={`/host/${roomId}/qr?code=${encodeURIComponent(roomCode)}`}
                        className="comic-panel border-[#000]/15 bg-white"
                      />
                    </div>
                  </details>
                </section>
              ) : null
            }
            playersView={
              <PlayersAccordion title="Игроки" count={players.length}>
                {players.length === 0 ? (
                  <p className="text-sm text-black/70 text-center py-2">Пока никто не присоединился</p>
                ) : (
                  <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1 no-scrollbar">
                    {players.map((player, index) => (
                      <div
                        key={player.id}
                        className="comic-panel border-[2px] border-[#000]/15 bg-white px-3 py-2 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-7 h-7 comic-panel border-[2px] border-[#000]/30 flex items-center justify-center comic-font text-xs">
                            {index + 1}
                          </span>
                          <p className="comic-font text-sm leading-snug whitespace-normal break-words overflow-hidden max-h-[2.8em]">
                            {player.name}
                          </p>
                        </div>
                        <p className="comic-font text-[#ff007f] text-sm">{player.total_points} 💎</p>
                      </div>
                    ))}
                  </div>
                )}
              </PlayersAccordion>
            }
            controlsView={
              isMirror ? (
                <MirrorControls
                  compact
                  isAnimationsDisabled={isAnimationsDisabled}
                  onToggleAnimations={() => {
                    const next = !isAnimationsDisabled;
                    setIsAnimationsDisabled(next);
                    localStorage.setItem('host_animations_disabled', String(next));
                  }}
                  isMusicMuted={isMusicMuted}
                  onToggleMusicMute={toggleMusicMute}
                  isVoiceMuted={isVoiceMuted}
                  onToggleVoiceMute={toggleVoiceMute}
                />
              ) : (
                <HostControls
                  primaryLabel={headerActionLabel}
                  onPrimaryAction={handlePrimaryHeaderAction}
                  onOpenQr={() => setIsJoinQrModalOpen(true)}
                  onToggleLayout={setNextLayoutMode}
                  layoutLabel={layoutModeLabel}
                  compact
                />
              )
            }
          />
        ) : (
          <div
            className={`grid ${isCompactForcedLayout ? 'gap-3' : 'gap-6'} ${
              isCompactLayout ? 'grid-cols-12' : 'lg:grid-cols-12'
            }`}
          >
          <section className={isCompactLayout ? 'col-span-4' : 'lg:col-span-3'}>
            <div className={`comic-panel bg-white ${isCompactForcedLayout ? 'p-4' : 'p-5'} space-y-4`}>
              {isCompactForcedLayout ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <p className="comic-font text-sm tracking-[0.25em] text-black/60">Игроки и очки</p>
                    <div className="text-right">
                      <p className="text-xs text-black/60">Игроки</p>
                      <p className="text-3xl comic-font">{players.length || 0}</p>
                    </div>
                  </div>

                  {players.length === 0 ? (
                    <p className="text-sm text-black/70 text-center py-6">Пока никто не присоединился</p>
                  ) : (
                    <div ref={playersListRef} className="space-y-3 max-h-[68vh] overflow-y-auto pr-1 no-scrollbar">
                      {players.map((player, index) => (
                        <div
                          key={player.id}
                          data-flip-id={player.id}
                          className="comic-panel border-[#000]/15 bg-white px-3 py-3 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 comic-panel border-[4px] border-[#000]/30 flex items-center justify-center comic-font">
                              {index + 1}
                            </span>
                            <p className="comic-font text-sm leading-snug whitespace-normal break-words overflow-hidden max-h-[2.8em]">
                              {player.name}
                            </p>
                          </div>
                          <p className="comic-font text-[#ff007f] text-base">{player.total_points} 💎</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="comic-font text-xs tracking-[0.4em] text-black/60">Состояние раунда</p>
                      <p className="text-base sm:text-lg comic-font text-black leading-tight whitespace-normal break-words">
                        {statusLabel}
                      </p>
                      <p className="text-xs comic-font text-black/60">
                        {roomStatus === 'waiting' ? 'Ждём игроков' : 'Игра идёт'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-black/60">Игроки</p>
                      <p className="text-2xl comic-font">{players.length || 0}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm comic-font">
                    <div className="comic-panel border-[#000]/20 bg-white px-4 py-3">
                      <p className="text-[11px] text-black/60">Вопрос</p>
                      <p className="text-2xl comic-font">
                        {roomStatus === 'round2-running'
                          ? round2Offset + clampedRound2QuestionNumber
                          : isRound3Running
                            ? round3Offset + (currentQuestionIndex + 1)
                            : roomStatus === 'round4-running'
                              ? round4Offset + currentRound4TourNumber
                              : roomStatus === 'round5-running' || roomStatus === 'round5-explanation'
                                ? round5Offset + (currentQuestionIndex + 1)
                                : showResults && roomStatus === 'finished'
                                  ? round2Leaderboard.length > 0
                                    ? round2Offset + ROUND2_TOTAL_QUESTIONS
                                    : totalQuestions
                                  : question
                                    ? question.order
                                    : 0}
                      </p>
                    </div>
                    <div className="comic-panel border-[#000]/20 bg-white px-4 py-3">
                      <p className="text-[11px] text-black/60">Ответы</p>
                      <p className="text-2xl comic-font text-[#00c3ff]">{answeredCount}</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="comic-font text-xs tracking-[0.4em] text-black/60">Игроки и очки</p>
                      </div>
                    </div>

                    {players.length === 0 ? (
                      <p className="text-sm text-black/70 text-center py-6">Пока никто не присоединился</p>
                    ) : (
                      <div ref={playersListRef} className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 no-scrollbar">
                        {players.map((player, index) => {
                          const hasAnswered = answeredPlayerIds.includes(player.id);
                          return (
                            <div
                              key={player.id}
                              data-flip-id={player.id}
                              className={`comic-panel px-3 py-3 flex items-center justify-between ${
                                hasAnswered ? 'border-[#000]/40 bg-[#00c3ff]' : 'border-[#000]/15 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-8 h-8 comic-panel border-[4px] border-[#000]/30 flex items-center justify-center comic-font">
                                  {index + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="comic-font text-sm leading-snug whitespace-normal break-words overflow-hidden max-h-[2.8em]">
                                    {player.name}
                                  </p>
                                  {roomStatus === 'running' && question ? (
                                    <p className={`text-xs comic-font ${hasAnswered ? 'text-[#00c3ff]' : 'text-black/50'}`}>
                                      {hasAnswered ? 'Ответ получен' : 'Ждём ответ'}
                                    </p>
                                  ) : roomStatus === 'round2-running' ? (
                                    <p className={`text-xs comic-font ${hasAnswered ? 'text-[#ff007f]' : 'text-black/50'}`}>
                                      {hasAnswered ? 'Выбор сделан' : 'Ждём выбор'}
                                    </p>
                                  ) : roomStatus === 'round3-running' ? (
                                    <p className="text-xs comic-font text-black/50">Раунд 3</p>
                                  ) : null}
                                </div>
                              </div>
                              <p className="comic-font text-[#ff007f]">{player.total_points} 💎</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

              <div
                className={`${isCompactLayout ? 'col-span-8' : 'lg:col-span-9'} ${isCompactForcedLayout ? 'space-y-3' : 'space-y-6'}`}
              >
            {isTournamentVisible ? (
              <div
                className={`comic-panel bg-white p-6 space-y-6 ${
                  roomStatus === 'final-results' ? 'animate-final-panel' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="comic-font text-xs tracking-[0.4em] text-black/60">
                      {roomStatus === 'final-results'
                        ? 'итоги после 5 раунда'
                        : isFinalRoundAvailable
                          ? 'итоги после 4 раунда'
                          : 'итоги после 3 раунда'}
                    </p>
                    <h2 className="text-3xl comic-font">🏁 Турнирная таблица</h2>
                  </div>
                </div>

                {roomStatus === 'final-results' && tournamentLeaderboard[0] ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <WinnerBanner
                      winnerName={tournamentLeaderboard[0].name}
                      points={tournamentLeaderboard[0].total_points ?? 0}
                    />
                    {bestQuestion ? (
                      <BestQuestionCard questionText={bestQuestion.text} likes={bestQuestion.likes} className="animate-final-panel" />
                    ) : (
                      <BestQuestionCard questionText="Нет данных" likes={0} className="animate-final-panel" />
                    )}
                  </div>
                ) : null}

                {postRoundLeaderboard.length === 0 ? (
                  <p className="text-sm text-black/70">Игроки не подключены, таблица пуста.</p>
                ) : (
                  <ol className="space-y-3">
                    {postRoundLeaderboard.map((entry, index) => {
                      const delayMs = (postRoundLeaderboard.length - 1 - index) * postRoundStaggerMs;
                      return (
                        <li
                          key={entry.playerId}
                          className="flex items-center justify-between comic-panel border-[#000]/15 bg-white p-4 animate-drop-in"
                          style={{ animationDelay: `${delayMs}ms` }}
                        >
                        <div className="flex items-center gap-4 min-w-0">
                          <span className={`w-10 h-10 comic-panel border-[4px] flex items-center justify-center comic-font text-lg ${
                            index === 0
                              ? 'border-[#000] bg-[#ff007f] text-white'
                              : index === 1
                                ? 'border-[#000] bg-[#ff007f] text-white'
                                : index === 2
                                  ? 'border-[#000] bg-[#00c3ff] text-white'
                                  : 'border-[#000]/30 bg-white text-black'
                          }`}>
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="comic-font text-black truncate">{entry.name}</p>
                            <p className="text-xs text-black/60">
                              Очки за раунд: {entry.points}
                            </p>
                          </div>
                        </div>
                        <span className="comic-font text-2xl text-[#ff007f]">{entry.points} 💎</span>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {roomStatus === 'final-results' ? (
                  <>
                    {!isMirror && (
                      <button
                        type="button"
                        onClick={() => {
                          hasUserInteractedRef.current = true;
                          void endGame();
                        }}
                        className="w-full py-4 comic-panel comic-font text-xl tracking-[0.2em] bg-[#ff2a2a] text-white border-[4px] border-[#000] hover:scale-105 hover: transition-all duration-200"
                      >
                        Закрыть комнату
                      </button>
                    )}
                  </>
                ) : isFinalRoundAvailable && !isMirror && (
                  <button
                    type="button"
                    onClick={handleOpenRound5Rules}
                    className="w-full py-4 comic-panel comic-font text-xl tracking-[0.2em] bg-[#ff2a2a] text-white border-[4px] border-[#000] hover:scale-105 hover: transition-all duration-200"
                  >
                    Финал
                  </button>
                )}

              </div>
            ) : showResults ? (
              roomStatus === 'finished' ? (
                round2Leaderboard.length === 0 ? (
                  <div className="comic-panel bg-white p-6 text-center space-y-2">
                    <p className="comic-font text-xs tracking-[0.4em] text-black/60">Раунд завершён</p>
                    <h2 className="text-2xl comic-font">Очки начислены</h2>
                    <p className="text-sm text-black/70">Смотрите очки игроков в панели слева.</p>
                  </div>
                ) : (
                  <div className="comic-panel bg-white p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="comic-font text-xs tracking-[0.4em] text-black/60">Итоги после 2 раунда</p>
                        <h2 className="text-3xl comic-font">🏆 Рейтинг после 2 раунда</h2>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <ol className="space-y-3">
                        {round2Leaderboard.map((entry, index) => {
                          const delayMs = (round2Leaderboard.length - 1 - index) * postRoundStaggerMs;
                          return (
                            <li
                              key={entry.playerId}
                              className="flex items-center justify-between comic-panel border-[#000]/15 bg-white p-4 animate-drop-in"
                              style={{ animationDelay: `${delayMs}ms` }}
                            >
                            <div className="flex items-center gap-4">
                              <span className={`w-10 h-10 comic-panel border-[4px] flex items-center justify-center comic-font text-lg ${
                                index === 0 ? 'border-[#000] bg-[#ff007f] text-white' :
                                index === 1 ? 'border-[#000] bg-[#ff007f] text-white' :
                                index === 2 ? 'border-[#000] bg-[#00c3ff] text-white' :
                                'border-[#000]/30 bg-white text-black'
                              }`}>
                                {index + 1}
                              </span>
                              <div>
                                <p className="comic-font text-black">{entry.name}</p>
                                <p className="text-xs text-black/70">Очки за 2 раунд: {entry.points}</p>
                              </div>
                            </div>
                            <span className="comic-font text-2xl text-[#ff007f]">{entry.points} 💎</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                )
              ) : (
                <div className="comic-panel bg-white p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="comic-font text-xs tracking-[0.4em] text-black/60">Итоги раунда</p>
                    <h2 className="text-3xl comic-font">🏆 Результаты</h2>
                  </div>
                  <span className="text-sm comic-font text-[#00c3ff]">Очки уже начислены игрокам</span>
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                  {!isMirror && (
                    <button
                      type="button"
                      onClick={() => setIsRatingVisible((prev) => !prev)}
                      className={`px-4 py-2 comic-panel comic-font transition ${
                        isRatingVisible
                          ? 'border-[#000] bg-[#00c3ff] text-white'
                          : 'border-[#000]/40 bg-white text-black'
                      }`}
                    >
                    {isRatingVisible ? 'Скрыть рейтинг' : 'Рейтинг'}
                  </button>
                  )}
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
                        className="comic-panel border-[#000]/15 bg-white p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between text-xs text-black/70">
                          <span className="comic-font tracking-[0.3em]">Вопрос {summaryQuestion.order}</span>
                          <span className="comic-font text-[#ff007f]">+{summaryQuestion.points}💎</span>
                        </div>
                        <p className="text-lg comic-font">{summaryQuestion.text}</p>
                        <p className="text-sm text-[#00c3ff] comic-font animate-correct-reveal">
                          Правильный ответ: {OPTION_LABELS[correctKey]} — {correctText}
                        </p>
                        <div className="space-y-2">
                          {answersForQuestion.length === 0 ? (
                            <p className="text-xs text-black/70">Никто не ответил на этот вопрос</p>
                          ) : (
                            answersForQuestion.map((answer) => (
                              <div
                                key={`${answer.player_id}-${answer.question_index}`}
                                className={`comic-panel px-3 py-2 text-sm flex items-center justify-between ${
                                  answer.is_correct
                                    ? 'border-[#000]/40 bg-white'
                                    : 'border-[#000]/30 bg-white'
                                }`}
                              >
                                <div>
                                  <p className="comic-font">{getPlayerName(answer.player_id)}</p>
                                  <p className="text-xs text-black/70">
                                    {formatOptionLabel(answer.text)} — {getOptionText(summaryQuestion, answer.text)}
                                  </p>
                                </div>
                                <span className={`comic-font ${answer.is_correct ? 'text-[#00c3ff]' : 'text-[#ff007f]'}`}>
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
                    <p className="text-sm text-black/70">Ответов пока нет — возможно, раунд завершили слишком рано.</p>
                  )}
                </div>
                {isRatingVisible && (
                  <div className="comic-panel border-[#000]/15 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="comic-font text-xs tracking-[0.4em] text-black/70">Рейтинг игроков</p>
                      <span className="text-xs comic-font text-[#00c3ff]">По итогам раунда</span>
                    </div>
                    {playerRatings.length === 0 ? (
                      <p className="text-sm text-black/70">Рейтинг появится после завершения первого раунда.</p>
                    ) : (
                      <ol className="space-y-2">
                        {playerRatings.map((player, index) => (
                          <li
                            key={player.id}
                            className="flex items-center justify-between comic-panel border-[#000]/10 bg-white px-3 py-2"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 comic-panel border-[4px] border-[#000]/30 flex items-center justify-center comic-font">
                                {index + 1}
                              </span>
                              <span className="comic-font text-black">{player.name}</span>
                            </div>
                            <span className="comic-font text-[#ff007f]">{player.total_points} 💎</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
              )
            ) : isWaiting ? (
              <div className="comic-panel bg-white p-6 space-y-6">
                <div className="flex flex-col gap-2">
                  <p className="comic-font text-xs tracking-[0.4em] text-black/70">Сцена перед стартом</p>
                  <h2 className="text-3xl comic-font">⌛ Ждём подключений</h2>
                  <p className="text-sm text-black/80">
                    Поделитесь кодом <span className="font-mono comic-font text-lg">{roomCode}</span> и следите за списком игроков слева.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {!isMirror && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          hasUserInteractedRef.current = true;
                          void (isLobbySoundOn ? stopLobby() : tryPlayLobby());
                        }}
                        className={`hover:scale-105 hover: transition-all duration-200 px-4 py-2 comic-panel comic-font ${
                          isLobbySoundOn ? 'border-[#000] bg-[#00c3ff] text-white' : 'border-[#000] bg-[#ffde00]'
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
                        className={`hover:scale-105 hover: transition-all duration-200 px-4 py-2 comic-panel comic-font ${
                          isJoinSoundEnabled ? 'border-[#000] bg-white text-[#00c3ff]' : 'border-dashed border-[#000] bg-white'
                        }`}
                      >
                        {isJoinSoundEnabled ? '🔔 Звук подключения' : '🔕 Включить звук подключения'}
                      </button>
                    </>
                  )}
                </div>
                {audioError && <p className="text-xs text-[#ff2a2a] comic-font">{audioError}</p>}

                <JoinQrBlock
                  roomCode={roomCode}
                  qrWindowUrl={`/host/${roomId}/qr?code=${encodeURIComponent(roomCode)}`}
                  className="comic-panel border-[#000]/15 bg-white"
                />

                {!isMirror && (() => {
                  const mirrorUrl = typeof window !== 'undefined' ? `${window.location.origin}/host/mirror/${roomId}` : '';
                  return mirrorUrl ? (
                    <div className="border-t-2 border-dashed border-black/20 pt-4 space-y-2 text-center">
                      <p className="text-sm comic-font text-purple-700 font-bold">📡 Зеркало трансляции</p>
                      <div className="inline-block border-2 border-purple-400 rounded-xl p-3 bg-white">
                        <QRCodeCanvas value={mirrorUrl} size={140} fgColor="#7c3aed" bgColor="#ffffff" />
                      </div>
                      <p className="text-xs text-purple-600 comic-font break-all">{mirrorUrl}</p>
                    </div>
                  ) : null;
                })()}

                {!isMirror ? (
                  <button
                    onClick={handlePrepareRound}
                    disabled={players.length === 0}
                    className="hover:scale-105 hover: transition-all duration-200 w-full py-3 comic-panel comic-font text-base tracking-[0.2em] bg-[#ff2a2a] text-white border-[4px] border-[#000] disabled:opacity-40 disabled:cursor-not-allowed host-start-blink"
                  >
                    Начать игру →
                  </button>
                ) : (
                  <div className="w-full py-3 comic-panel comic-font text-base tracking-[0.2em] text-center text-black/50 border-[4px] border-dashed border-black/20">
                    ⏳ ОЖИДАЕМ НАЧАЛО...
                  </div>
                )}
                {players.length === 0 && (
                  <p className="text-xs text-black/60">Нужно как минимум 1 игрок.</p>
                )}
              </div>
            ) : isRound2Running ? (
              <div className="comic-panel border-[4px] border-[#000] bg-white  p-6 space-y-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="comic-font text-xs tracking-[0.4em] text-[#ff007f]/70">Раунд 2 · «Фейколов»</p>
                    <h2 className={`${isCompactForcedLayout ? 'text-xl' : 'text-3xl'} comic-font`}>⚡ Охота на фейк</h2>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-2">
                    <span
                      className={`px-4 py-2 comic-panel border-[4px] border-[#000] ${
                        isCompactForcedLayout ? 'text-xs' : 'text-sm'
                      } comic-font text-[#ff007f]`}
                    >
                      Факт <span className="text-black">{clampedRound2QuestionNumber}</span>/{ROUND2_TOTAL_QUESTIONS}
                    </span>
                    <span className="text-xs comic-font text-black/70">
                      Ответили: <span className="comic-font text-[#ff007f]">{answeredCount}/{totalPlayers}</span>
                    </span>
                  </div>
                </div>

                <div
                  key={`round2-onair-${round2CurrentIndex ?? clampedRound2QuestionNumber}-${round2Phase}`}
                  className="comic-panel border-[#000]/20 bg-white p-5 space-y-2 animate-round2-onair"
                >
                  <p className="text-[11px] tracking-[0.4em] text-[#ff007f]/60">
                    {round2Phase === 'fact' ? 'Сейчас в эфире' : 'Объяснение'}
                  </p>

                  {round2Phase === 'fact' ? (
                    <p
                      className={`${
                        isCompactForcedLayout ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'
                      } comic-font leading-tight text-center`}
                    >
                      <AnimatedText
                        key={`r2-fact-${round2CurrentIndex ?? clampedRound2QuestionNumber}`}
                        text={round2Statement}
                      />
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="comic-panel border-[#000]/30 bg-white px-4 py-5 text-center">
                        <p
                          className={`${
                            isCompactForcedLayout ? 'text-3xl sm:text-4xl' : 'text-5xl sm:text-6xl'
                          } comic-font ${round2ShowingFact ? 'text-[#00c3ff]' : 'text-[#ff007f]'} animate-round2-answer`}
                          key={`${round2CurrentIndex ?? 'x'}-${round2Phase}-${round2ShowingFact ? 't' : 'f'}`}
                        >
                          {round2ShowingFact ? 'ПРАВДА' : 'ВЫМЫСЕЛ'}
                        </p>
                      </div>
                      <p
                        className={`${
                          isCompactForcedLayout ? 'text-xl sm:text-2xl' : 'text-3xl sm:text-4xl'
                        } comic-font leading-tight text-center`}
                      >
                        <AnimatedText
                          key={`r2-expl-${round2CurrentIndex ?? clampedRound2QuestionNumber}-${round2ShowingFact ? 't' : 'f'}`}
                          text={round2ExplanationText}
                        />
                      </p>
                    </div>
                  )}
                </div>

                {round2Phase === 'fact' ? (
                  <div>
                    <div className="flex justify-between text-xs text-black/70 mb-1">
                      <span>Таймер · 30 сек</span>
                      <span className={`comic-font ${serverAllPlayersAnswered ? 'text-[#ff007f]' : 'text-black'}`}>
                        {serverAllPlayersAnswered ? 'Все проголосовали' : `${effectiveTimeLeft} c`}
                      </span>
                    </div>
                    <div className="h-3 comic-panel bg-[#ffde00] overflow-hidden">
                      <div
                        className={`h-full ${effectiveTimeLeft > 5 ? 'bg-[#ff007f]' : 'bg-[#ff007f]'}`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    {serverAllPlayersAnswered && (
                      <p className="text-xs text-[#ff007f] comic-font mt-2">Можно открывать правду прямо сейчас.</p>
                    )}
                  </div>
                ) : null}

              </div>
            ) : isRound3Running ? (
              <div className="comic-panel border-[4px] border-[#000] bg-white  p-6 space-y-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className={`${isCompactForcedLayout ? 'text-xl' : 'text-3xl'} comic-font`}>
                      🧠 {currentRound3Question?.category ?? 'Категория не указана'}
                    </h2>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-2">
                    <span className="px-4 py-2 comic-panel border-[4px] border-[#000] text-sm comic-font text-[#ff007f]">
                      Факт <span className="text-black">{currentQuestionIndex + 1}</span>/{round3QuestionCount || ROUND3_TOTAL_QUESTIONS}
                    </span>
                  </div>
                </div>

                {isRound3ResultsPhase && (
                  <div
                    key={`round3-correct-${currentQuestionIndex}`}
                    className="comic-panel border-[#000]/20 bg-white p-4 space-y-3 animate-round3-panel"
                  >
                    <p className="text-lg sm:text-xl tracking-[0.35em] text-[#ff007f]/70 comic-font">Правильный ответ</p>
                    <p className={`${isCompactForcedLayout ? 'text-base sm:text-lg' : 'text-2xl sm:text-3xl'} comic-font leading-snug`}>
                      {renderRound3CorrectAnswerExcerpt(currentRound3Question?.question ?? '', currentRound3Question?.answer ?? '')}
                    </p>
                  </div>
                )}

                {isRound3ResultsPhase && bestRound3WrongAnswerText && (
                  <div className="comic-panel border-[#000]/15 bg-white p-4 space-y-3 animate-round3-panel">
                    <p className="text-base sm:text-lg tracking-[0.25em] text-black/65 comic-font">Лучший неправильный ответ</p>
                    <p className={`${isCompactForcedLayout ? 'text-base sm:text-lg' : 'text-2xl sm:text-3xl'} comic-font leading-snug`}>
                      {renderRound3WrongAnswerExcerpt(currentRound3Question?.question ?? '', bestRound3WrongAnswerText)}
                    </p>
                  </div>
                )}

                {!isRound3ResultsPhase && (
                  <div
                    key={`round3-onair-${currentQuestionIndex}`}
                    className="comic-panel border-[#000]/20 bg-white p-5 space-y-2 animate-round3-panel"
                  >
                    <p className="text-[11px] tracking-[0.4em] text-[#ff007f]/60">Сейчас в эфире</p>
                    <p className={`${isCompactForcedLayout ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'} comic-font leading-tight`}>
                      {currentRound3Question?.question ? (
                        <AnimatedText key={`r3-q-${currentQuestionIndex}`} text={currentRound3Question.question} />
                      ) : (
                        'Подождите, факты загружаются…'
                      )}
                    </p>
                  </div>
                )}

                <div>
                  <div className="flex justify-between text-xs text-black/70 mb-1">
                    <span>{isRound3ResultsPhase ? 'Итоги' : `Таймер · ${ROUND3_ANSWER_SECONDS} сек`}</span>
                    <span className={`comic-font ${allPlayersAnswered ? 'text-[#00c3ff]' : 'text-black'}`}>
                      {isRound3ResultsPhase ? 'Готово' : allPlayersAnswered ? 'Все ответили' : `${round3TimerTimeLeft} c`}
                    </span>
                  </div>
                  <div className="h-3 comic-panel bg-[#ffde00] overflow-hidden">
                    <div
                      className={`h-full ${round3TimerTimeLeft > 5 ? 'bg-[#00c3ff]' : 'bg-[#ff007f]'}`}
                      style={{ width: `${round3ProgressPercent}%` }}
                    />
                  </div>
                </div>

                {isRound3ResultsPhase && (
                  <div className="comic-panel border-[#000]/15 bg-white p-5 space-y-4 animate-round3-panel">
                    <p className="comic-font text-[11px] tracking-[0.5em] text-black/70">Итоги факта</p>

                    <div className="comic-panel border-dashed border-[#000]/30 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="comic-font text-[11px] tracking-[0.4em] text-black/70">Ответы игроков</p>
                        <span className="text-xs comic-font text-[#00c3ff]">
                          +{ROUND3_POINTS} за точный ответ · +{ROUND3_VOTE_LIKE_POINTS} за лайк · -{ROUND3_VOTE_SKIP_PENALTY} за пропуск голосования
                        </span>
                      </div>
                      {isRound3VoteAnswersLoading ? (
                        <p className="text-sm text-black/70">Ответы загружаются…</p>
                      ) : round3ScoredAnswers.length > 0 ? (
                        <>
                          <div className="text-xs text-black/70">
                            Голосовали: <span className="comic-font text-[#00c3ff]">{round3VotersCount}</span>
                            /{players.length}. Не проголосовали: <span className="comic-font text-[#ff007f]">{round3SkippedVoterIds.length}</span>
                            {round3SkippedVoterIds.length > 0 ? ` (−${ROUND3_VOTE_SKIP_PENALTY} каждому)` : ''}.
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {round3ScoredAnswers
                              .slice()
                              .sort((a, b) => b.pointsEarned - a.pointsEarned || Number(b.isCorrect) - Number(a.isCorrect))
                              .map((row, index) => (
                                <div
                                  key={row.playerId}
                                  className={`comic-panel px-3 py-3 flex flex-col gap-2 animate-drop-in ${
                                    row.isCorrect ? 'border-[#000]/30 bg-white' : 'border-[#000]/30 bg-white'
                                  }`}
                                  style={{ animationDelay: `${index * 35}ms` }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="comic-font text-xs truncate min-w-0">{getPlayerName(row.playerId)}</p>
                                    <span className={`shrink-0 comic-font text-xs ${row.pointsEarned > 0 ? 'text-[#00c3ff]' : 'text-[#ff007f]'}`}>
                                      {row.pointsEarned >= 0 ? `+${row.pointsEarned}` : row.pointsEarned}
                                    </span>
                                  </div>
                                  <p
                                    className={`${
                                      isCompactForcedLayout ? 'text-sm sm:text-base' : 'text-xl sm:text-2xl'
                                    } comic-font leading-tight text-black break-words`}
                                  >
                                    {row.text?.trim() ? row.text : '(пусто)'}
                                  </p>
                                  <p className="text-[11px] text-black/60">
                                    Лайков: {row.votes} (+{row.votePoints})
                                    {row.basePoints > 0 ? ` · Точный ответ: +${row.basePoints}` : ''}
                                  </p>
                                </div>
                              ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-black/70">Пока нет ответов.</p>
                      )}
                    </div>
                  </div>
                )}

                {round3AudioBlocked && !isMirror && (
                  <button
                    type="button"
                    onClick={() => playRound3Audio(currentQuestionIndex)}
                    className="w-full py-3 comic-panel comic-font text-base tracking-[0.16em] bg-[#ffde00] text-black border-[4px] border-[#000]"
                  >
                    Включить музыку
                  </button>
                )}

              </div>
            ) : roomStatus === 'round4-running' ? (
              <div
                key={`round4-panel-${round4CurrentPuzzle?.id ?? 'none'}-${timeLeft <= 0 ? 'reveal' : 'run'}`}
                className="comic-panel bg-white p-6 space-y-5 animate-round4-panel"
              >
                <div className="text-center space-y-3">
                  {round4CurrentPuzzle && (
                    <p className="text-3xl comic-font text-[#00c3ff] uppercase tracking-wide">
                      {round4CurrentPuzzle.category}
                    </p>
                  )}
                  <h2 className={`${isCompactForcedLayout ? 'text-3xl sm:text-4xl' : 'text-5xl sm:text-6xl'} comic-font leading-tight text-center`}>
                    {round4CurrentPuzzle ? round4CurrentPuzzle.emoji : '⏳'}
                  </h2>
                  {!round4CurrentPuzzle && (
                    <p className="text-sm text-black/70">
                      Ждём выдачу первой загадки — нажмите «Раунд 4», если нужно перезапустить.
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between text-xs text-black/70 mb-1">
                    <span>Таймер · 30 сек</span>
                    <span className={`comic-font ${timeLeft <= 0 ? 'text-[#ff007f]' : 'text-black'}`}>
                      {timeLeft > 0 ? `${timeLeft} c` : 'Время истекло'}
                    </span>
                  </div>
                  <div className="h-3 comic-panel bg-[#ffde00] overflow-hidden">
                    <div
                      className={`h-full ${timeLeft > 5 ? 'bg-[#00c3ff]' : 'bg-[#ff007f]'}`}
                      style={{ width: `${round4ProgressPercent}%` }}
                    />
                  </div>
                  {timeLeft <= 0 && (
                    <p className="text-xs text-[#00c3ff] comic-font mt-2">Время истекло — озвучиваем ответ.</p>
                  )}
                </div>

                {timeLeft <= 0 && round4CurrentPuzzle && (
                  <div
                    key={`round4-correct-${round4CurrentPuzzle.id}`}
                    className="comic-panel border-[#000]/15 bg-white p-5 space-y-2 text-center animate-correct-reveal"
                  >
                    <p className="comic-font text-[11px] tracking-[0.5em] text-black/70">Правильный ответ</p>
                    <p className="text-4xl comic-font text-[#00c3ff]">{round4CurrentPuzzle.answers?.[0] ?? '—'}</p>

                    {round4AnswerRows.length > 0 && (
                      <div className="pt-2 space-y-2">
                        <p className="comic-font text-[11px] tracking-[0.4em] text-black/60">Ответы игроков</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {round4AnswerRows
                            .slice()
                            .sort((a, b) => Number(!!b.is_correct) - Number(!!a.is_correct))
                            .map((row, index) => (
                              <span
                                key={row.id}
                                className={`px-4 py-3 comic-panel comic-font text-lg sm:text-xl animate-drop-in ${
                                  row.is_correct
                                    ? 'border-[#000]/30 bg-white text-[#00c3ff]'
                                    : 'border-[#000]/15 bg-white text-black'
                                }`}
                                style={{ animationDelay: `${index * 40}ms` }}
                              >
                                {row.answer_text?.trim() ? row.answer_text : '—'}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-center">
                  <span className="px-4 py-2 comic-panel border-[4px] border-[#000] text-sm comic-font">
                    Тур {currentRound4TourNumber} / {ROUND4_TOTAL_TOURS}
                  </span>
                </div>
              </div>
            ) : roomStatus === 'round5-running' || roomStatus === 'round5-explanation' ? (
              <div className="comic-panel bg-white p-6 space-y-5">
                <div className="text-center space-y-3">
                  <p className="comic-font text-xs tracking-[0.4em] text-black/70">Финал · «Цифровая интуиция»</p>
                  {roomStatus === 'round5-running' ? (
                    <h2
                      className={`${
                        isCompactForcedLayout ? 'text-2xl sm:text-3xl' : 'text-5xl sm:text-6xl'
                      } comic-font leading-tight text-center text-black`}
                    >
                      {round5CurrentQuestion?.question ? (
                        <AnimatedText
                          key={`r5-q-${round5CurrentBankIndex ?? currentQuestionIndex}`}
                          text={round5CurrentQuestion.question}
                        />
                      ) : (
                        '⏳'
                      )}
                    </h2>
                  ) : (
                    <div className="h-[44px] sm:h-[56px]" aria-hidden="true" />
                  )}
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <span className="px-4 py-2 comic-panel border-[4px] border-[#000] text-sm comic-font">
                      Тур {Math.min(Math.max(currentQuestionIndex + 1, 1), round5TotalCount)} / {round5TotalCount}
                    </span>
                    <span className="text-sm comic-font text-black/70">
                      Ответили: <span className="text-[#00c3ff]">{answerCount}/{totalPlayers}</span>
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-black/70 mb-1">
                    <span>Таймер · 30 сек</span>
                    {roomStatus === 'round5-running' ? (
                      <span className={`comic-font ${timeLeft <= 0 ? 'text-[#ff007f]' : 'text-black'}`}>
                        {timeLeft > 0 ? `${timeLeft} c` : 'Время истекло'}
                      </span>
                    ) : (
                      <span className="comic-font text-[#00c3ff]">Ответ открыт</span>
                    )}
                  </div>
                  <div className="h-3 comic-panel bg-[#ffde00] overflow-hidden">
                    <div
                      className={`h-full ${timeLeft > 5 ? 'bg-[#00c3ff]' : 'bg-[#ff007f]'}`}
                      style={{ width: `${Math.max(0, Math.min(100, (timeLeft / QUESTION_DURATION_SECONDS) * 100))}%` }}
                    />
                  </div>
                  {roomStatus === 'round5-running' && timeLeft <= 0 && (
                    <p className="text-xs text-[#00c3ff] comic-font mt-2">Время истекло — начисляем очки и показываем ответ.</p>
                  )}
                </div>

                {roomStatus === 'round5-explanation' && round5CurrentQuestion && (
                  <>
                    <div
                      key={`round5-correct-${round5CurrentBankIndex ?? currentQuestionIndex}`}
                      className="comic-panel border-[#000]/15 bg-white p-5 space-y-3 text-center animate-correct-reveal"
                    >
                      <p className="comic-font text-[11px] tracking-[0.5em] text-black/70">Правильный ответ</p>
                      <p className="text-5xl comic-font text-[#00c3ff]">{round5CurrentQuestion.answer}</p>
                      {round5CurrentQuestion.explanation && (
                        <p className="text-sm comic-font text-black/80 whitespace-pre-line">
                          {round5CurrentQuestion.explanation}
                        </p>
                      )}
                    </div>

                    {round5AnswerRows.length > 0 && (
                      <div className="comic-panel border-[#000]/15 bg-white p-5 space-y-3">
                        <p className="comic-font text-[11px] tracking-[0.4em] text-black/60 text-center">Ответы игроков</p>
                        {(() => {
                          const correct = round5CurrentQuestion.answer;
                          const clampedCorrect = Number.isFinite(correct) ? correct : 0;
                          const maxAllowed = clampedCorrect > 0 ? clampedCorrect * 2 : 0;

                          const sorted = round5AnswerRows
                            .slice()
                            .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));

                          const inRange = sorted.filter((row) => {
                            const answer = row.answer_value;
                            return Number.isFinite(clampedCorrect) && clampedCorrect > 0 && Number.isFinite(answer) && answer > 0 && answer < maxAllowed;
                          });

                          const outOfRange = sorted.filter((row) => {
                            const answer = row.answer_value;
                            return !(Number.isFinite(clampedCorrect) && clampedCorrect > 0 && Number.isFinite(answer) && answer > 0 && answer < maxAllowed);
                          });

                          const hashSeed = (value: string) => {
                            let h = 2166136261;
                            for (let i = 0; i < value.length; i += 1) {
                              h ^= value.charCodeAt(i);
                              h = Math.imul(h, 16777619);
                            }
                            return h >>> 0;
                          };

                          const mulberry32 = (seed: number) => {
                            let a = seed >>> 0;
                            return () => {
                              a = (a + 0x6d2b79f5) >>> 0;
                              let t = a;
                              t = Math.imul(t ^ (t >>> 15), t | 1);
                              t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                              return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                            };
                          };

                          const lanes = [-34, -14, 14, 34, -52, 52];
                          const positioned = inRange
                            .map((row) => {
                              const answer = row.answer_value;
                              const deviationPercent =
                                clampedCorrect > 0
                                  ? Math.max(0, Math.min(100, Math.round((Math.abs(clampedCorrect - answer) / clampedCorrect) * 100)))
                                  : 100;

                              const mix = deviationPercent / 100;
                              const blue = { r: 0x1f, g: 0x6a, b: 0xc6 };
                              const red = { r: 0xf1, g: 0x53, b: 0x2f };
                              const tone = `rgb(${Math.round(blue.r + (red.r - blue.r) * mix)}, ${Math.round(
                                blue.g + (red.g - blue.g) * mix
                              )}, ${Math.round(blue.b + (red.b - blue.b) * mix)})`;

                              const xPercent = maxAllowed > 0 ? Math.max(0, Math.min(100, (answer / maxAllowed) * 100)) : 50;
                              return { row, xPercent, tone, deviationPercent };
                            })
                            .sort((a, b) => Math.abs(a.xPercent - 50) - Math.abs(b.xPercent - 50));

                          const outOfRangePositioned = outOfRange.map((row, index) => {
                            const seed = hashSeed(String(row.id ?? `${row.player_id}-${index}`));
                            const rand = mulberry32(seed);

                            // Target positions are intentionally outside the panel bounds.
                            // We animate pills from the center to these positions and clip them via overflow-hidden.
                            const left = 50 + (rand() - 0.5) * 220; // ~(-60%..160%)
                            const top = (rand() - 0.5) * 420; // px: move far above/below
                            const rotate = (rand() - 0.5) * 18;

                            return { row, left, top, rotate };
                          });

                          return (
                            <>
                              <div className="comic-panel border-dashed border-[#000]/25 bg-white p-4 overflow-hidden">
                                <div className="relative h-[160px]">
                                  <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t-[3px] border-[#000]/20" />
                                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                                    <div className="comic-panel border-[#000]/40 bg-white px-4 py-2 text-center ">
                                      <p className="text-[11px] tracking-[0.3em] text-black/60 comic-font">правильный</p>
                                      <p className="text-3xl comic-font text-[#00c3ff] tabular-nums">{Math.round(clampedCorrect)}</p>
                                    </div>
                                  </div>

                                  {positioned.map((item, index) => {
                                    const laneOffset = lanes[index % lanes.length] ?? 0;
                                    return (
                                      <div
                                        key={item.row.id}
                                        className="animate-pill-from-center"
                                        style={
                                          {
                                            '--pill-left': `${item.xPercent}%`,
                                            '--pill-top': `${laneOffset}px`,
                                            '--pill-duration': '1560ms',
                                            animationDelay: `${index * 70}ms`,
                                          } as PillAnimationStyle
                                        }
                                      >
                                        <div className="comic-panel border-[#000]/15 bg-white px-3 py-2 text-center min-w-[84px]">
                                          <p className="text-[11px] comic-font text-black/70 truncate max-w-[120px]">
                                            {getPlayerName(item.row.player_id)}
                                          </p>
                                          <p className="text-xl comic-font tabular-nums" style={{ color: item.tone }}>
                                            <TweenedInteger
                                              from={clampedCorrect}
                                              to={item.row.answer_value}
                                              durationMs={1560}
                                              delayMs={index * 70}
                                            />
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {outOfRangePositioned.map((item, index) => {
                                    const delayBase = positioned.length * 70;
                                    return (
                                      <div
                                        key={item.row.id}
                                        className="animate-pill-from-center"
                                        style={
                                          {
                                            '--pill-left': `${item.left}%`,
                                            '--pill-top': `${item.top}px`,
                                            '--pill-duration': '1560ms',
                                            animationDelay: `${delayBase + index * 80}ms`,
                                          } as PillAnimationStyle
                                        }
                                      >
                                        <div style={{ transform: `rotate(${item.rotate}deg)` }}>
                                          <div className="comic-panel border-[#000]/15 bg-white px-3 py-2 text-center min-w-[84px] max-w-[220px]">
                                            <p className="text-[11px] comic-font text-black/70 truncate">
                                              {getPlayerName(item.row.player_id)}
                                            </p>
                                            <p className="text-lg comic-font tabular-nums text-[#ff007f] truncate">
                                              <TweenedInteger
                                                from={clampedCorrect}
                                                to={Number.isFinite(item.row.answer_value) ? item.row.answer_value : clampedCorrect}
                                                durationMs={1560}
                                                delayMs={delayBase + index * 80}
                                              />
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="mt-2 flex items-center justify-between text-[11px] comic-font text-black/60">
                                  <span>0</span>
                                  <span>{maxAllowed > 0 ? Math.round(maxAllowed) : '—'}</span>
                                </div>
                              </div>

                              {maxAllowed > 0 && outOfRange.length > 0 && (
                                <p className="mt-3 text-[11px] comic-font text-black/60 text-center">
                                  Очки начисляются только за ответы в диапазоне (0…{Math.round(maxAllowed)})
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : question ? (
              <div className="comic-panel bg-white p-6 flex flex-col gap-5 h-[78vh] max-h-[860px]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-h-[44px]">
                  <span className="px-4 py-2 comic-panel border-[4px] border-[#000] text-sm comic-font">
                    Вопрос {question.order} / {totalQuestions}
                  </span>
                  <span className="text-sm comic-font text-black/70 whitespace-nowrap">
                    Ответили: <span className="text-[#00c3ff] tabular-nums">{answeredCount}/{totalPlayers}</span>
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-black/70 mb-1">
                    <span>Таймер · 30 сек</span>
                    <span className="comic-font text-black">
                      {allPlayersAnswered ? 'Все ответили' : `${effectiveTimeLeft} c`}
                    </span>
                  </div>
                  <div className="h-3 comic-panel bg-[#ffde00] overflow-hidden">
                    <div
                      className={`h-full ${effectiveTimeLeft > 5 ? 'bg-[#00c3ff]' : 'bg-[#ff007f]'}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="min-h-[20px]">
                    {allPlayersAnswered && (
                      <p className="text-xs text-[#00c3ff] comic-font mt-2">Все игроки уже ответили — можно переходить дальше.</p>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col gap-5">
                  <div className="flex-1 min-h-0 flex items-center justify-center">
                    <h2 className="text-3xl comic-font leading-tight text-center max-h-full overflow-y-auto">
                      <AnimatedText
                        key={`r1-q-${typeof question.id === 'number' ? question.id : question.order}`}
                        text={question.text}
                        className="text-4xl sm:text-5xl comic-font leading-tight"
                      />
                    </h2>
                  </div>

                  <div className="comic-panel border-dashed border-[#000]/30 bg-white p-4 space-y-3 shrink-0">
                    <div className="flex items-center justify-between">
                      <p className="comic-font text-[11px] tracking-[0.4em] text-black/70">Варианты</p>
                      <span className="text-xs comic-font text-black/60">+{question.points} 💎</span>
                    </div>
                    <Round1VariantsPanel
                      ref={round1VariantsPanelRef}
                      options={question.options.slice(0, 4)}
                      correctIndex={question.correctIndex}
                      points={question.points}
                      revealCorrect={canAdvance}
                      questionKey={typeof question.id === 'number' ? question.id : question.order}
                    />
                  </div>

                  <p className="text-xs text-black/70 shrink-0">
                    {isRoundEndButtonLocked
                      ? 'Подождите несколько секунд — звучит финальный джингл перед стартом следующего раунда.'
                      : canAdvance
                        ? isLastQuestion
                          ? 'Итоги появятся автоматически.'
                          : 'Следующий вопрос появится автоматически.'
                        : 'Идёт сбор ответов…'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="comic-panel bg-white p-6 text-center space-y-3">
                <h2 className="text-2xl comic-font">🎉 Раунд завершён</h2>
                <p className="text-sm text-black/70">Все вопросы уже прозвучали. Нажмите «Итоги», чтобы подвести результаты.</p>
              </div>
            )}

          </div>
        </div>
        )}
      </div>
    </div>

      {isWaiting && isPrestartVisible && (
        <div className="fixed inset-0 z-40 bg-[#ff2a2a]/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="max-w-lg w-full comic-panel border-[4px] border-[#000] bg-white p-6 space-y-4 ">
            <div>
              <p className="comic-font text-xs tracking-[0.4em] text-black/70">Подключённые игроки</p>
              <h3 className="text-2xl comic-font text-black">Перед стартом игры</h3>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {players.length === 0 ? (
                <p className="text-sm text-black/60">Игроки ещё не подключились.</p>
              ) : (
                players.map((player, index) => (
                  <div key={player.id} className="flex items-center justify-between comic-panel border-[#000]/15 bg-white px-3 py-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 comic-panel border-[4px] border-[#000]/30 flex items-center justify-center comic-font">
                        {index + 1}
                      </span>
                      <span className="comic-font text-black">{player.name}</span>
                    </div>
                    <span className="text-xs text-black/60">{player.total_points} 💎</span>
                  </div>
                ))
              )}
            </div>
            {isPlayerLimitReached && (
              <p className="text-xs comic-font text-[#ff2a2a]">Предел — 10 игроков. Лишние участники не смогут войти.</p>
            )}
            <p className="text-xs text-black/70">Убедитесь, что все готовы. После продолжения прозвучат правила раунда.</p>
            {!isMirror && (
              <>
                <div className="flex gap-3 flex-col sm:flex-row">
                  <button
                    type="button"
                    onClick={handlePrestartNext}
                    disabled={!isPrestartNextEnabled}
                    className="flex-1 py-3 comic-panel comic-font text-lg tracking-[0.25em] bg-[#ff2a2a] text-white border-[4px] border-[#000] transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Далее →
                  </button>
                  <button
                    type="button"
                    onClick={handlePrestartCancel}
                    className="flex-1 py-3 comic-panel border-dashed border-[#000] bg-white comic-font text-black"
                  >
                    Отмена
                  </button>
                </div>
                {!isPrestartNextEnabled && (
                  <p className="text-xs text-black/60">Кнопка активируется через несколько секунд после сигнала подключения.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {isJoinQrModalOpen && !isMirror && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="max-w-xl w-full comic-panel border-[4px] border-[#000] bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="comic-font text-xs tracking-[0.35em] text-black/70">Подключение</p>
                <h3 className="text-2xl comic-font text-black">QR для новых игроков</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsJoinQrModalOpen(false)}
                className="px-3 py-2 comic-panel border-[4px] border-[#000] bg-white comic-font text-black"
              >
                ✕
              </button>
            </div>

            <JoinQrBlock
              roomCode={roomCode}
              qrWindowUrl={`/host/${roomId}/qr?code=${encodeURIComponent(roomCode)}`}
              className="comic-panel border-[#000]/15 bg-white"
            />

            <p className="text-xs text-black/70 text-center">
              Если камера не сканирует QR: откройте <span className="font-semibold">/join</span> и введите код <span className="comic-font">{roomCode}</span>
            </p>
          </div>
        </div>
      )}

      {shouldShowRulesModal && (
        <div className="fixed inset-0 z-40 bg-[#ff2a2a]/70 backdrop-blur-sm flex items-center justify-center px-4 transition-opacity duration-300">
          <div className="max-w-md w-full comic-panel border-[4px] border-[#000] bg-white p-6 space-y-4  transform transition-all duration-300 scale-100 opacity-100">
            {!isCompactForcedLayout && (
              <>
                <div>
                  <p className="comic-font text-xs tracking-[0.4em] text-black/70">Правила раунда</p>
                  <h3 className="text-2xl comic-font text-black">Разогрев!</h3>
                </div>
                <ul className="text-sm text-black/80 space-y-2">
                  <li>6 вопросов на всё подряд. К каждому — 4 варианта ответа среди которых надо выбрать правильный.</li>
                  <li>За правильный ответ получаете очки. 30 секунд на вопрос!</li>
                  <li>Подсчитываем очки. Погнали!</li>
                </ul>
              </>
            )}
            {!isMirror && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleCountdownStart()}
                  className="hover:scale-105 hover: transition-all duration-200 w-full py-3 comic-panel comic-font text-lg tracking-[0.3em] bg-[#ff2a2a] text-white border-[4px] border-[#000]"
                >
                  Старт
                </button>
                <button
                  type="button"
                  onClick={handleRulesCancel}
                  className="hover:scale-105 hover: transition-all duration-200 w-full py-3 comic-panel border-dashed border-[#000] bg-white comic-font text-black"
                >
                  Отмена
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {shouldShowCountdownOverlay && (
        <div className="fixed inset-0 z-50 bg-[#ff2a2a]/90 flex flex-col items-center justify-center text-center text-white px-4">
          <p className="text-sm uppercase tracking-[0.5em] text-white/70 mb-4">
            {countdownContext === 'round2'
              ? 'Запуск Раунда 2'
              : countdownContext === 'round3'
                ? 'Запуск Раунда 3'
                : countdownContext === 'round4'
                  ? 'Запуск Раунда 4'
                  : countdownContext === 'round5'
                    ? 'Запуск Финала'
                    : 'Запуск раунда'}
          </p>
          <div className="text-7xl sm:text-8xl comic-font drop-">
            {countdownValue.toUpperCase()}
          </div>
          <p className="mt-6 text-sm text-white/80">
            {countdownContext === 'round2'
              ? 'Фейколов уже на подходе — готовим новое утверждение для игроков.'
              : countdownContext === 'round3'
                ? 'Готовимся к мозговому штурму — скоро включим следующий этап.'
                : countdownContext === 'round4'
                  ? 'Дэшифровщик загружается — готовим эмодзи-загадки!'
                  : countdownContext === 'round5'
                    ? 'Финал начинается — готовим вопросы на точность!' 
                  : 'Звук уже пошёл — готовим вопросы на экране игроков.'}
          </p>
        </div>
      )}

      {isRound3RulesVisible && (
        <div className="fixed inset-0 z-50 bg-[#ff2a2a]/70 backdrop-blur-sm flex items-center justify-center px-4 transition-opacity duration-300">
          <div className="max-w-lg w-full comic-panel border-[4px] border-[#000] bg-white p-6 space-y-4  transform transition-all duration-300 scale-100 opacity-100">
            {!isCompactForcedLayout && (
              <>
                <div>
                  <p className="comic-font text-xs tracking-[0.4em] text-black/70">Раунд 3 · «МозгоШтурм»</p>
                  <h3 className="text-2xl comic-font text-black">Правила</h3>
                </div>
                <div className="text-sm text-black/80 whitespace-pre-line leading-relaxed">{ROUND3_RULES_TEXT}</div>
              </>
            )}
            {!isMirror && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => void startRound3Countdown()}
                  className="w-full py-3 comic-panel comic-font text-lg tracking-[0.3em] bg-[#ff2a2a] text-white border-[4px] border-[#000] hover:scale-105 hover: transition-all duration-200"
                >
                  Старт
                </button>
                <button
                  type="button"
                  onClick={() => setIsRound3RulesVisible(false)}
                  className="w-full py-3 comic-panel border-dashed border-[#000] bg-white comic-font text-black hover:scale-105 hover: transition-all duration-200"
                >
                  Отмена
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isRound2RulesVisible && (
        <div className="fixed inset-0 z-50 bg-[#ff2a2a]/70 backdrop-blur-sm flex items-center justify-center px-4 transition-opacity duration-300">
          <div className="max-w-lg w-full comic-panel border-[4px] border-[#000] bg-white p-6 space-y-4  transform transition-all duration-300 scale-100 opacity-100">
            {!isCompactForcedLayout && (
              <>
                <div>
                  <p className="comic-font text-xs tracking-[0.4em] text-black/70">Раунд 2 · «Фейколов»</p>
                  <h3 className="text-2xl comic-font text-black">Правда или выдумка</h3>
                </div>
                <ul className="text-sm text-black/80 space-y-2">
                  <li>• На экранах игроков появляется утверждение. Нужно выбрать «Правда» или «Вымысел».</li>
                  <li>• На каждое утверждение даём 30 секунд. После сигнала открываем объяснение.</li>
                  <li>
                    • Точное попадание приносит <span className="comic-font text-[#ff007f]">+{ROUND2_POINTS}💎</span>. Неверный ответ — 0.
                  </li>
                </ul>
              </>
            )}
            {!isMirror && (
              <>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={startRound2}
                    disabled={round2Items.length === 0}
                    className="w-full py-3 comic-panel comic-font text-lg tracking-[0.3em] bg-[#ff007f] text-white border-[4px] border-[#000] transition hover:scale-105 hover: transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Запустить Раунд 2
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRound2RulesVisible(false)}
                    className="w-full py-3 comic-panel border-dashed border-[#000] bg-white comic-font text-black hover:scale-105 hover: transition-all duration-200"
                  >
                    Отмена
                  </button>
                </div>
                {!isCompactForcedLayout &&
                  round2Items.length === 0 && (
                    <p className="text-xs text-[#ff2a2a] comic-font">Факты ещё загружаются — подождите пару секунд.</p>
                  )}
              </>
            )}
          </div>
        </div>
      )}

      {isRound4RulesVisible && (
        <div className="fixed inset-0 z-50 bg-[#ff2a2a]/70 backdrop-blur-sm flex items-center justify-center px-4 transition-opacity duration-300">
          <div className="max-w-lg w-full comic-panel border-[4px] border-[#000] bg-white p-6 space-y-4  transform transition-all duration-300 scale-100 opacity-100">
            {!isCompactForcedLayout && (
              <>
                <div>
                  <p className="comic-font text-xs tracking-[0.4em] text-black/70">Раунд 4 · «Дэшифровщик»</p>
                  <h3 className="text-2xl comic-font text-black">Эмодзи-загадки</h3>
                </div>
                <div className="text-sm text-black/80 whitespace-pre-line leading-relaxed">{ROUND4_RULES_TEXT}</div>
              </>
            )}
            {!isMirror && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleStartRound4Rules}
                  className="w-full py-3 comic-panel comic-font text-lg tracking-[0.3em] bg-[#ff007f] text-white border-[4px] border-[#000] hover:scale-105 hover: transition-all duration-200"
                >
                  Старт
                </button>
                <button
                  type="button"
                  onClick={handleCancelRound4Rules}
                  className="w-full py-3 comic-panel border-dashed border-[#000] bg-white comic-font text-black hover:scale-105 hover: transition-all duration-200"
                >
                  Отмена
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isRound5RulesVisible && (
        <div className="fixed inset-0 z-50 bg-[#ff2a2a]/70 backdrop-blur-sm flex items-center justify-center px-4 transition-opacity duration-300">
          <div className="max-w-lg w-full comic-panel border-[4px] border-[#000] bg-white p-6 space-y-4  transform transition-all duration-300 scale-100 opacity-100">
            {!isCompactForcedLayout && (
              <>
                <div>
                  <p className="comic-font text-xs tracking-[0.4em] text-black/70">Финал · «Цифровая интуиция»</p>
                  <h3 className="text-2xl comic-font text-black">Правила</h3>
                </div>
                <div className="text-sm text-black/80 whitespace-pre-line leading-relaxed">{ROUND5_RULES_TEXT}</div>
              </>
            )}
            {!isMirror && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleStartRound5Rules}
                  disabled={isRound5RulesAudioPlaying || isCountdownVisible}
                  className="w-full py-3 comic-panel comic-font text-lg tracking-[0.3em] bg-[#ff2a2a] text-white border-[4px] border-[#000] hover:scale-105 hover: transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isRound5RulesAudioPlaying ? 'ОЗВУЧКА…' : 'СТАРТ'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelRound5Rules}
                  className="w-full py-3 comic-panel border-dashed border-[#000] bg-white comic-font text-black hover:scale-105 hover: transition-all duration-200"
                >
                  Отмена
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HostRoomPage() {
  return <HostRoomContent />;
}
