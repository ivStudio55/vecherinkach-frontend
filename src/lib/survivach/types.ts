// src/lib/survivach/types.ts
// Типы данных для игры «Выживач»

/* ─── Room status machine ─── */
export type SurvivachRoomStatus =
  | 'lobby'
  | 'rules'
  | 'moving'
  | 'round_intro'
  | 'round_playing'
  | 'round_results'
  | 'bet_reveal'
  | 'duel_intro'
  | 'duel_setup'
  | 'duel_playing'
  | 'duel_result'
  | 'blitz_intro'
  | 'blitz_playing'
  | 'blitz_results'
  | 'potato_intro'
  | 'potato_playing'
  | 'potato_result'
  | 'finished';

export type RoundMode =
  | 'umnik'
  | 'mathematician'
  | 'art_historian'
  | 'interpreter'
  | 'memory_diary'
  | 'tag_puzzle'
  | 'blitz';

export type DuelMode = 'minesweeper' | 'arithmetic_mean' | 'crowd_forecast';

/* ─── DB row types ─── */

export interface SurvivachRoom {
  id: string;
  code: string;
  status: SurvivachRoomStatus;
  current_round: number;
  current_mode: RoundMode | null;
  leader_position: number;
  zombie_bomb_active: boolean;
  zombie_bomb_player_id: string | null;
  timer_started_at: string | null;
  timer_duration_sec: number;
  pack_id: string;
  question_data: QuestionData | null;
  round_results_data: RoundResultsData | null;
  bet_results_data: BetResultsData | null;
  duel_data: DuelData | null;
  host_id: string | null;
  state_version: number;
  created_at: string;
  updated_at: string;
}

export interface SurvivachPlayer {
  id: string;
  room_id: string;
  name: string;
  avatar: string;                // 'duck1' … 'duck8'
  position: number;              // 1–26
  lives: number;                 // 0–3; 0 = zombie
  karma: number;
  correct_streak: number;
  total_correct: number;
  total_answer_time_ms: number;
  is_zombie: boolean;
  is_host: boolean;
  joined_at: string;
}

export interface SurvivachAnswer {
  id: string;
  room_id: string;
  player_id: string;
  round: number;
  answer_text: string | null;
  answer_index: number | null;
  answer_data: Record<string, unknown> | null;
  is_correct: boolean | null;
  answer_time_ms: number | null;
  submitted_at: string;
}

export interface SurvivachBet {
  id: string;
  room_id: string;
  player_id: string;
  round: number;
  bet_type: 'karma' | 'life';
  resolved: boolean;
  won: boolean | null;
  created_at: string;
}

export interface SurvivachDuel {
  id: string;
  room_id: string;
  round: number;
  mode: DuelMode;
  challenger_id: string;
  challenged_id: string;
  winner_id: string | null;
  status: 'pending' | 'setup' | 'playing' | 'done';
  duel_data: DuelData | null;
  created_at: string;
}

export interface SurvivachPack {
  id: string;
  name: string;
  description: string | null;
  base_url: string;
  cell_sequence: RoundMode[] | null;
  is_active: boolean;
  created_at: string;
}

/* ─── Question data shapes (stored in room.question_data) ─── */

export interface UmnikQuestion {
  mode: 'umnik';
  id: string;
  question: string;
  options: string[];             // 5 normal, 10 with zombie bomb
  correct: number;
}

export interface ArtHistorianQuestion {
  mode: 'art_historian';
  id: number;
  question: string;
  image_url: string;
  accept_answer: string[];
  primary_answer: string;
  author: string;
  year: string;
  fun_fact: string;
  zombie_bomb_mode?: { blur_image: boolean; hint: string };
}

export interface InterpreterQuestion {
  mode: 'interpreter';
  id: number;
  translated_text: string;
  original_text: string;
  accept_answer: string[];
  primary_answer: string;
  artist: string;
  zombie_bomb_mode?: { accept_only: string[]; hint: string };
}

export interface MathematicianQuestion {
  mode: 'mathematician';
  problems: MathProblem[];      // list of problems for the 1-minute sprint
  timer_sec: number;            // 60
}

export interface MathProblem {
  expression: string;
  answer: number;
}

export interface MemoryDiaryQuestion {
  mode: 'memory_diary';
  sequence: string[];            // color names: ['red','blue','green',...]
  show_duration_ms: number;      // 5000
}

export interface TagPuzzleQuestion {
  mode: 'tag_puzzle';
  size: number;                  // 3 = 3×3 (8-puzzle), 4 = 4×4 (15-puzzle)
  initial_state: number[];       // scrambled tile indices (0 = empty)
  solved_state: number[];        // goal state
}

export interface BlitzQuestion {
  mode: 'blitz';
  id: number;
  question: string;
  options: string[];
  correct_index: number;
}

export type QuestionData =
  | UmnikQuestion
  | ArtHistorianQuestion
  | InterpreterQuestion
  | MathematicianQuestion
  | MemoryDiaryQuestion
  | TagPuzzleQuestion
  | BlitzQuestion;

/* ─── Round results (stored in room.round_results_data) ─── */

export interface PlayerRoundResult {
  player_id: string;
  is_correct: boolean;
  was_first: boolean;
  position_change: number;
  lives_change: number;
  karma_change: number;
  new_position: number;
  new_lives: number;
  new_karma: number;
  is_zombie_now: boolean;
}

export interface RoundResultsData {
  round: number;
  mode: RoundMode;
  correct_answer: string;
  player_results: PlayerRoundResult[];
  perfect_round?: boolean;
  potato_bomb_holder?: string | null;
  potato_loser?: string | null;
}

/* ─── Bet results ─── */

export interface BetResultsData {
  round: number;
  anyone_correct: boolean;
  bets: Array<{
    player_id: string;
    bet_type: 'karma' | 'life';
    won: boolean;
  }>;
}

/* ─── Duel data (stored in room.duel_data and survivach_duels.duel_data) ─── */

export interface MinesweeperDuelData {
  mode: 'minesweeper';
  tile_count: number;            // players_count + 2
  mined_tiles: Record<string, number[]>; // player_id → tile indices they mined
  challenger_picks: number[];
  challenged_picks: number[];
  exploded_challenger: boolean;
  exploded_challenged: boolean;
}

export interface ArithmeticMeanDuelData {
  mode: 'arithmetic_mean';
  question: string;
  player_guesses: Record<string, number>;  // player_id → number
  average: number | null;
  challenger_answer: number | null;
  challenged_answer: number | null;
}

export interface CrowdForecastDuelData {
  mode: 'crowd_forecast';
  question: string;
  options: string[];
  player_votes: Record<string, number>;    // player_id → option index
  majority_index: number | null;
  challenger_prediction: number | null;
  challenged_prediction: number | null;
}

export type DuelData =
  | MinesweeperDuelData
  | ArithmeticMeanDuelData
  | CrowdForecastDuelData;

/* ─── LocalStorage session ─── */

export interface SurvivachSession {
  roomId: string;
  roomCode: string;
  playerId: string;
  playerName: string;
  isHost: boolean;
}
