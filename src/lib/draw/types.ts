/* ===== Рисункач — TypeScript types ===== */

export type DrawRoomStatus = 'lobby' | 'playing' | 'voting' | 'results' | 'finished';

export type DrawRoom = {
  id: string;
  code: string;
  status: DrawRoomStatus;
  current_round: number;
  current_step: number;
  total_steps: number;
  step_started_at: string | null;
  step_duration: number;
  voting_chain_index: number;
  host_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DrawPlayer = {
  id: string;
  room_id: string;
  name: string;
  is_host: boolean;
  seat: number;
  score: number;
  joined_at: string;
};

export type DrawChain = {
  id: string;
  room_id: string;
  round: number;
  chain_index: number;
  original_word: string;
  created_at: string;
};

export type DrawStep = {
  id: string;
  chain_id: string;
  step_number: number;
  player_id: string;
  target_word: string | null;
  guess: string | null;
  drawing_data: string | null;
  is_correct: boolean;
  submitted: boolean;
  created_at: string;
};

export type DrawVote = {
  id: string;
  room_id: string;
  round: number;
  chain_id: string;
  voter_id: string;
  voted_for_player_id: string;
  created_at: string;
};

export type DrawWord = {
  id: string;
  word: string;
  category: string;
};

/** Touch-limit by round number */
export function maxStrokesForRound(round: number): number | undefined {
  if (round === 2) return 3;
  if (round === 3) return 1;
  return undefined; // unlimited for round 1
}

export function roundLabel(round: number): string {
  if (round === 1) return 'Без ограничений';
  if (round === 2) return 'Только 3 касания';
  if (round === 3) return 'Только 1 касание';
  return '';
}
