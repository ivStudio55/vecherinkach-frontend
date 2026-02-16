export type UnoMode = 'classic' | 'irregular-verbs' | 'verb-match';
export type UnoColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
export type UnoKind = 'number' | 'verb' | 'verb-match' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
export type VerbForm = 'infinitive' | 'past_simple' | 'past_participle' | 'translation';

/** DB uses snake_case: past_simple, past_participle */
export type UnoVerb = {
  id: string;
  infinitive: string;
  past_simple: string;
  past_participle: string;
  translation?: string | null;
};

export type UnoCard = {
  id: string;
  color: UnoColor;
  kind: UnoKind;
  value?: number | null;
  verb?: UnoVerb | null;
  /** verb-match mode: the single word displayed on the card */
  display?: string | null;
  /** verb-match mode: which form this card shows */
  form?: VerbForm | null;
  /** verb-match mode: verb id for matching (same verb = same nominal) */
  verb_id?: string | null;
};

export type UnoPlayer = {
  id: string;
  room_id: string;
  name: string;
  is_host: boolean;
  seat: number;
  joined_at?: string;
};

export type UnoRoom = {
  id: string;
  code: string;
  mode: UnoMode;
  status: 'lobby' | 'playing' | 'finished';
  direction: 1 | -1;
  current_player_id: string | null;
  host_id: string | null;
  winner_id: string | null;
  draw_pile: UnoCard[];
  discard_pile: UnoCard[];
  hands: Record<string, UnoCard[]>;
  verb_count: number;
  state_version: number;
  created_at?: string;
  updated_at?: string;
};

export type UnoState = {
  room: UnoRoom | null;
  players: UnoPlayer[];
  me?: UnoPlayer;
};
