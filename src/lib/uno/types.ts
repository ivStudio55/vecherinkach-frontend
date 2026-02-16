export type UnoMode = 'classic' | 'irregular-verbs';
export type UnoColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
export type UnoKind = 'number' | 'verb' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export type UnoVerb = {
  id: string;
  infinitive: string;
  pastSimple: string;
  pastParticiple: string;
  translation?: string | null;
  audioUrl?: string | null;
};

export type UnoCard = {
  id: string;
  color: UnoColor;
  kind: UnoKind;
  value?: number | null;
  verb?: UnoVerb | null;
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
  draw_pile: UnoCard[];
  discard_pile: UnoCard[];
  hands: Record<string, UnoCard[]>;
  verb_count: number;
  created_at?: string;
  updated_at?: string;
};

export type UnoState = {
  room: UnoRoom | null;
  players: UnoPlayer[];
  me?: UnoPlayer;
};
