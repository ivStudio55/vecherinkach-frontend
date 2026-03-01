// src/lib/creativach/types.ts
// Типы данных для мини-игры «Креативач»

export type CreativachRoomStatus =
  | 'lobby'
  | 'round_rules'
  | 'round_playing'
  | 'round_voting'
  | 'round_results'
  | 'final_rules'
  | 'final_playing'
  | 'final_voting'
  | 'final_results'
  | 'credits'
  | 'finished';

export type CreativachVotingPhase = 'idle' | 'answering' | 'voting' | 'results';

export type CreativachRole = 'player' | 'spectator';

/* ─── DB row types ─── */

export interface CreativachRoom {
  id: string;
  code: string;
  status: CreativachRoomStatus;
  current_round: number;
  round_task: string | null;
  round_task_extra: string | null;
  voting_phase: CreativachVotingPhase;
  timer_started_at: string | null;
  timer_duration_sec: number;
  host_id: string | null;
  state_version: number;
  created_at: string;
  updated_at: string;
}

export interface CreativachPlayer {
  id: string;
  room_id: string;
  name: string;
  avatar: string;
  role: CreativachRole;
  is_host: boolean;
  total_points: number;
  seat: number;
  joined_at: string;
}

export interface CreativachAnswer {
  id: string;
  room_id: string;
  round: number;
  player_id: string;
  answer_text: string;
  submitted_at: string;
}

export interface CreativachVote {
  id: string;
  room_id: string;
  round: number;
  voter_id: string;
  voted_for_id: string;
  voter_role: CreativachRole;
  created_at: string;
}

/* ─── Round info ─── */

export interface RoundInfo {
  number: number;
  title: string;
  description: string;
  maxChars: number;
  inputLabel: string;
}

export const ROUNDS: RoundInfo[] = [
  {
    number: 1,
    title: 'Аббревиатура 1.0',
    description: 'Программа выдаст вам 3 случайные буквы. Придумайте самую смешную или оригинальную расшифровку этой аббревиатуры. Чем креативнее — тем больше шансов получить голоса в вашу пользу!',
    maxChars: 100,
    inputLabel: 'Ваша расшифровка',
  },
  {
    number: 2,
    title: 'Оправдание',
    description: 'Программа выдаст вам нелепую ситуацию, в которую вы попали. Ваша задача — придумать максимально абсурдное, но звучащее правдоподобно оправдание. Чем смешнее — тем лучше!',
    maxChars: 200,
    inputLabel: 'Ваше оправдание',
  },
  {
    number: 3,
    title: 'Анти-реклама',
    description: 'Программа покажет известный бренд. Придумайте для него слоган, который будет звучать как реклама, но на самом деле будет высмеивать бренд или говорить о нём правду. Допускается добрый юмор.',
    maxChars: 150,
    inputLabel: 'Ваш слоган',
  },
  {
    number: 4,
    title: 'Битва комплиментов',
    description: 'Программа укажет на игрока с максимальным количеством баллов. Придумайте самый изощрённый, пафосный и смешной комплимент в его/её честь.',
    maxChars: 200,
    inputLabel: 'Ваш комплимент',
  },
  {
    number: 5,
    title: 'Аббревиатура 2.0 (Финал)',
    description: 'Вам снова даны 3 буквы, но теперь есть ещё и тема! Придумайте расшифровку так, как если бы её придумал профессионал в этой области, киногерой или человек из той сферы.',
    maxChars: 100,
    inputLabel: 'Ваша расшифровка',
  },
];

/* ─── Points constants ─── */
export const POINTS = {
  VOTE: 1,
  WINNER_BONUS: 3,
  FINAL_VOTE: 2,
  FINAL_WINNER_BONUS: 6,
} as const;

export const MAX_PLAYERS = 12;
export const MIN_PLAYERS = 4;
export const ANSWER_TIME_SEC = 60;
export const VOTE_TIME_SEC = 30;
export const TOTAL_ROUNDS = 5;

/* ─── Russian alphabet for abbreviations ─── */
const RUSSIAN_CONSONANTS = 'БВГДЖЗКЛМНПРСТФХЦЧШЩ'.split('');
const RUSSIAN_VOWELS = 'АЕИОУЭЮЯ'.split(''); // Ы исключена — не может начинать слово
const RUSSIAN_ALL = [...RUSSIAN_CONSONANTS, ...RUSSIAN_VOWELS];

export function generateAbbreviation(): string {
  const letters: string[] = [];
  for (let i = 0; i < 3; i++) {
    letters.push(RUSSIAN_ALL[Math.floor(Math.random() * RUSSIAN_ALL.length)]);
  }
  return letters.join('.');
}
