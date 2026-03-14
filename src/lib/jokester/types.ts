// src/lib/jokester/types.ts
// Типы данных для мини-игры «Пошути-кач»

export type JokesterRoomStatus =
  | 'lobby'
  | 'starting'
  | 'category_vote'
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

export type JokesterVotingPhase = 'idle' | 'answering' | 'voting' | 'results';

export type JokesterRole = 'player' | 'spectator';

export type DuelStatus = 'pending' | 'answering' | 'voting' | 'done';

/* ─── DB row types ─── */

export interface JokesterRoom {
  id: string;
  code: string;
  status: JokesterRoomStatus;
  current_round: number;
  current_duel_index: number;
  current_question: number; // 0 или 1 (два вопроса на дуэль)
  voting_phase: JokesterVotingPhase;
  timer_started_at: string | null;
  timer_duration_sec: number;
  host_id: string | null;
  pack_id: string;
  state_version: number;
  created_at: string;
  updated_at: string;
}

export interface JokesterPlayer {
  id: string;
  room_id: string;
  name: string;
  avatar: string;
  role: JokesterRole;
  is_host: boolean;
  total_points: number;
  player_votes: number;
  spectator_votes: number;
  seat: number;
  joined_at: string;
}

export interface JokesterDuel {
  id: string;
  room_id: string;
  round: number;
  duel_index: number;
  player1_id: string;
  player2_id: string;
  question1_text: string | null;
  question1_cat: string | null;
  question2_text: string | null;
  question2_cat: string | null;
  winner_id: string | null;
  status: DuelStatus;
  created_at: string;
}

export interface JokesterAnswer {
  id: string;
  duel_id: string;
  player_id: string;
  question_index: number;
  answer_text: string;
  submitted_at: string;
}

export interface JokesterVote {
  id: string;
  duel_id: string;
  voter_id: string;
  question_index: number;
  voted_for_id: string;
  voter_role: JokesterRole;
  created_at: string;
}

export interface JokesterCategoryVote {
  id: string;
  room_id: string;
  round: number;
  voter_id: string;
  category: string;
  created_at: string;
}

/* ─── Question pack ─── */

export interface JokesterCategory {
  id: string;
  name: string;
  emoji: string;
  questions: string[];
}

export interface JokesterQuestionPack {
  categories: JokesterCategory[];
}

/* ─── Composite state for client ─── */

export interface JokesterState {
  room: JokesterRoom;
  players: JokesterPlayer[];
  me: JokesterPlayer | null;
  duels: JokesterDuel[];
}

/* ─── Duel schedule pair ─── */
export interface DuelPair {
  player1_id: string;
  player2_id: string;
}

/* ─── Round multipliers ─── */
export function roundMultiplier(round: number): number {
  if (round === 1) return 1;
  if (round === 2) return 2;
  if (round === 3) return 3;
  return 1; // финал — базовый множитель
}

/* ─── Points constants ─── */
export const POINTS = {
  DUEL_WIN: 100,
  PLAYER_VOTE: 50,
  SPECTATOR_VOTE: 50,
} as const;

export const MAX_PLAYERS = 12;
export const ANSWER_TIME_SEC = 120;
export const VOTE_TIME_SEC = 30;
export const CATEGORY_VOTE_TIME_SEC = 30;
