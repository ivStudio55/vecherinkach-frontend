export type PanelGameKey =
  | 'vecherinkach'
  | 'jokester'
  | 'creativach'
  | 'draw'
  | 'uno'
  | 'survivach';

export const PANEL_GAME_TABLES: Record<PanelGameKey, { rooms: string; players: string }> = {
  vecherinkach: { rooms: 'rooms', players: 'players' },
  jokester: { rooms: 'jokester_rooms', players: 'jokester_players' },
  creativach: { rooms: 'creativach_rooms', players: 'creativach_players' },
  draw: { rooms: 'draw_rooms', players: 'draw_players' },
  uno: { rooms: 'uno_rooms', players: 'uno_players' },
  survivach: { rooms: 'survivach_rooms', players: 'survivach_players' },
};

export const PANEL_ROOM_LIST_FIELDS: Record<PanelGameKey, string> = {
  vecherinkach: 'id, code, status, created_at, is_active, current_question_index',
  jokester: 'id, code, status, created_at, current_round',
  creativach: 'id, code, status, created_at, current_round',
  draw: 'id, code, status, created_at, current_round',
  uno: 'id, code, status, created_at, mode',
  survivach: 'id, code, status, created_at, current_round',
};

export const PANEL_PACK_FIELDS =
  'id, label, description, is_public, is_active, json_base_url, audio_round2_start, audio_round2_end, audio_round3_start, audio_round5_start, price, created_at, updated_at';

export const PANEL_JOKESTER_PACK_FIELDS =
  'id, label, description, is_public, is_active, json_url, price, created_at, updated_at';

export const PANEL_DRAW_PACK_FIELDS =
  'id, label, description, is_public, is_active, price, created_at, updated_at';

export const PANEL_PROMO_FIELDS =
  'id, code, discount_pct, discount_fixed, game, pack_id, expires_at, max_uses, used_count, is_active, created_at';

export const PANEL_PRICE_FIELDS = 'game, price, updated_at';

export const PANEL_ROUND4_CATEGORY_FIELDS =
  'id, name, folder_key, audio_variants, is_active, created_at, updated_at';

export const PANEL_STREAM_FIELDS =
  'id, title, url, scheduled_at, is_live, created_at, updated_at';
