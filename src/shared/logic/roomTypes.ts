export type RoomStatus =
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

export type Round2Phase = 'idle' | 'fact' | 'explanation';

export type RoomSyncRow = {
  id: string;
  status?: RoomStatus | string | null;
  is_active?: boolean | null;
  current_question_index?: number | string | null;
  question_started_at?: string | null;
  all_players_answered?: boolean | null;
  selected_question_ids?: number[] | null;
  round2_item_index?: number | null;
  round2_showing_fact?: boolean | null;
  round2_phase?: Round2Phase | string | null;
  pack_id?: string | null;
  code?: string | null;
  state_version?: number | null;
  transitioning_to_next?: boolean | null;
};
