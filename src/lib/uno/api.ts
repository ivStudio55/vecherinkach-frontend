import { supabase } from '../supabase';
import type { UnoMode, UnoRoom, UnoPlayer, UnoCard } from './types';

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
    localStorage.removeItem(PLAYER_ID_KEY);
    localStorage.removeItem(PLAYER_NAME_KEY);
    localStorage.removeItem(ROOM_CODE_KEY);
    localStorage.removeItem(ROOM_ID_KEY);
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

export async function createUnoRoom(params: { mode: UnoMode; verbCount?: number; hostName: string; code?: string }) {
  const code = params.code || Math.random().toString(36).slice(2, 6).toUpperCase();
  const verbCount = params.verbCount ?? 20;

  const { data, error } = await supabase.rpc('uno_create_room', {
    p_code: code,
    p_mode: params.mode,
    p_verb_count: verbCount,
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
  const { data, error } = await supabase.rpc('uno_draw_card', { p_room_code: roomCode, p_player_id: playerId });
  if (error) throw error;
  return data as { card: UnoCard; room: UnoRoom };
}

export async function playUnoCard(params: {
  roomCode: string;
  playerId: string;
  cardId: string;
  chosenColor?: 'red' | 'yellow' | 'green' | 'blue';
}) {
  const { data, error } = await supabase.rpc('uno_play_card', {
    p_room_code: params.roomCode,
    p_player_id: params.playerId,
    p_card_id: params.cardId,
    p_chosen_color: params.chosenColor ?? null,
  });
  if (error) throw error;
  return data as { room: any };
}

export function subscribeUnoRoom(roomId: string, onChange: (room: UnoRoom) => void) {
  const channel = supabase
    .channel(`uno-room-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'uno_rooms', filter: `id=eq.${roomId}` },
      payload => {
        onChange(payload.new as UnoRoom);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeUnoPlayers(roomId: string, onChange: () => void) {
  const channel = supabase
    .channel(`uno-players-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'uno_players', filter: `room_id=eq.${roomId}` }, () => {
      onChange();
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function cardPlayable(card: UnoCard, top: UnoCard | null) {
  if (!top) return true;
  if (card.kind === 'wild' || card.kind === 'wild4') return true;
  if (card.color === top.color) return true;
  if (card.kind === 'verb' && top.kind === 'verb' && card.verb && top.verb && card.verb.id === top.verb.id) return true;
  if (card.kind === 'number' && top.kind === 'number' && card.value === top.value) return true;
  if (card.kind === top.kind && ['skip', 'reverse', 'draw2'].includes(card.kind)) return true;
  return false;
}
