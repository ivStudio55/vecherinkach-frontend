import { supabase } from '../supabase';
import type { UnoMode, UnoRoom, UnoPlayer, UnoCard, UnoColor } from './types';

/* ============ localStorage session ============ */

const PLAYER_ID_KEY = 'unoPlayerId';
const PLAYER_NAME_KEY = 'unoPlayerName';
const ROOM_CODE_KEY = 'unoRoomCode';
const ROOM_ID_KEY = 'unoRoomId';

export const unoStorage = {
  setSession(data: { playerId: string; playerName: string; roomCode: string; roomId: string }) {
    localStorage.setItem(PLAYER_ID_KEY, data.playerId);
    localStorage.setItem(PLAYER_NAME_KEY, data.playerName);
    localStorage.setItem(ROOM_CODE_KEY, data.roomCode);
    localStorage.setItem(ROOM_ID_KEY, data.roomId);
  },
  clear() {
    [PLAYER_ID_KEY, PLAYER_NAME_KEY, ROOM_CODE_KEY, ROOM_ID_KEY].forEach(k => localStorage.removeItem(k));
  },
  get() {
    return {
      playerId: localStorage.getItem(PLAYER_ID_KEY),
      playerName: localStorage.getItem(PLAYER_NAME_KEY),
      roomCode: localStorage.getItem(ROOM_CODE_KEY),
      roomId: localStorage.getItem(ROOM_ID_KEY),
    };
  },
};

/* ============ RPC wrappers ============ */

export async function createUnoRoom(params: { mode: UnoMode; verbCount?: number; hostName: string; code?: string }) {
  const code = params.code || Math.random().toString(36).slice(2, 6).toUpperCase();

  const { data, error } = await supabase.rpc('uno_create_room', {
    p_code: code,
    p_mode: params.mode,
    p_verb_count: params.verbCount ?? 20,
    p_host_name: params.hostName,
  });
  if (error) throw error;

  const room = (data as any)?.room as UnoRoom | undefined;
  const player = (data as any)?.player as UnoPlayer | undefined;
  if (!room || !player) throw new Error('Не удалось создать комнату UNO');

  unoStorage.setSession({ playerId: player.id, playerName: player.name, roomCode: room.code, roomId: room.id });
  return { room, player };
}

export async function joinUnoRoom(params: { code: string; name: string }) {
  // Проверка дубликата имени до вызова RPC
  const { data: unoRoom } = await supabase
    .from('uno_rooms')
    .select('id')
    .eq('code', params.code.toUpperCase())
    .maybeSingle();
  if (unoRoom) {
    const trimmedName = params.name.trim();
    const { data: existingPlayers } = await supabase
      .from('uno_players')
      .select('id')
      .eq('room_id', unoRoom.id)
      .ilike('name', trimmedName)
      .limit(1);
    if (existingPlayers && existingPlayers.length > 0) {
      throw new Error('Игрок с таким именем уже есть в комнате. Выберите другое имя.');
    }
  }

  const { data, error } = await supabase.rpc('uno_join_room', {
    p_room_code: params.code,
    p_player_name: params.name,
  });
  if (error) throw error;

  const room = (data as any)?.room as UnoRoom | undefined;
  const player = (data as any)?.player as UnoPlayer | undefined;
  if (!room || !player) throw new Error('Не удалось подключиться к комнате');

  unoStorage.setSession({ playerId: player.id, playerName: player.name, roomCode: room.code, roomId: room.id });
  return { room, player };
}

export async function fetchUnoRoomByCode(code: string) {
  const { data, error } = await supabase.from('uno_rooms').select('*').eq('code', code).single();
  if (error) throw error;
  return data as UnoRoom;
}

export async function fetchUnoPlayers(roomId: string) {
  const { data, error } = await supabase
    .from('uno_players')
    .select('*')
    .eq('room_id', roomId)
    .order('seat', { ascending: true });
  if (error) throw error;
  return (data || []) as UnoPlayer[];
}

export async function startUnoGame(roomCode: string) {
  const { data, error } = await supabase.rpc('uno_start_game', { p_room_code: roomCode });
  if (error) throw error;
  return data as UnoRoom;
}

export async function drawUnoCard(roomCode: string, playerId: string) {
  const { data, error } = await supabase.rpc('uno_draw_card', {
    p_room_code: roomCode,
    p_player_id: playerId,
  });
  if (error) throw error;
  return data as { card: UnoCard; room: UnoRoom };
}

export async function playUnoCard(params: {
  roomCode: string;
  playerId: string;
  cardId: string;
  chosenColor?: UnoColor;
}) {
  const { data, error } = await supabase.rpc('uno_play_card', {
    p_room_code: params.roomCode,
    p_player_id: params.playerId,
    p_card_id: params.cardId,
    p_chosen_color: params.chosenColor ?? null,
  });
  if (error) throw error;
  return data as { room: UnoRoom };
}

/* ============ Realtime subscriptions ============ */

export function subscribeUnoRoom(roomId: string, onChange: (room: UnoRoom) => void) {
  const channel = supabase
    .channel(`uno-room-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'uno_rooms', filter: `id=eq.${roomId}` },
      payload => onChange(payload.new as UnoRoom),
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

export function subscribeUnoPlayers(roomId: string, onChange: () => void) {
  const channel = supabase
    .channel(`uno-players-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'uno_players', filter: `room_id=eq.${roomId}` }, () => onChange())
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

/* ============ Card helpers ============ */

/** Can this card be played on `top`? */
export function cardPlayable(card: UnoCard, top: UnoCard | null): boolean {
  if (!top) return true;
  if (card.kind === 'wild' || card.kind === 'wild4') return true;
  if (card.color === top.color) return true;
  // verb mode: match by verb object id
  if (card.kind === 'verb' && top.kind === 'verb' && card.verb && top.verb && card.verb.id === top.verb.id) return true;
  // verb-match mode: match by verb_id
  if (card.kind === 'verb-match' && top.kind === 'verb-match' && card.verb_id && top.verb_id && card.verb_id === top.verb_id) return true;
  if (card.kind === 'number' && top.kind === 'number' && card.value === top.value) return true;
  if (card.kind === top.kind && ['skip', 'reverse', 'draw2'].includes(card.kind)) return true;
  return false;
}

/** Human-readable card label */
export function cardLabel(card: UnoCard): string {
  // verb-match: show ONE word only
  if (card.kind === 'verb-match' && card.display) return card.display;
  if (card.kind === 'verb' && card.verb) {
    return `${card.verb.infinitive}\n${card.verb.past_simple}\n${card.verb.past_participle}`;
  }
  if (card.kind === 'number') return `${card.value ?? ''}`;
  if (card.kind === 'wild') return '🌈';
  if (card.kind === 'wild4') return '+4';
  if (card.kind === 'draw2') return '+2';
  if (card.kind === 'skip') return '⊘';
  if (card.kind === 'reverse') return '⟲';
  return card.kind;
}

/** Background colour class for a card */
export function cardColorClass(card: UnoCard): string {
  switch (card.color) {
    case 'red': return 'uno-red';
    case 'yellow': return 'uno-yellow';
    case 'green': return 'uno-green';
    case 'blue': return 'uno-blue';
    default: return 'uno-wild';
  }
}
