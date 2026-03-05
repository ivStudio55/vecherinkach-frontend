// src/lib/creativach/api.ts
// Supabase CRUD + realtime для «Креативач»

import { supabase } from '../supabase';
import { subscribeChannel } from '../centrifuge';
import type {
  CreativachRoom,
  CreativachPlayer,
  CreativachAnswer,
  CreativachVote,
  CreativachRole,
} from './types';
import { MAX_PLAYERS } from './types';

/* ══════════════════════════════════════════════
   Session storage (localStorage)
   ══════════════════════════════════════════════ */

const LS_PREFIX = 'creativach_';

export const creativachStorage = {
  setSession(data: {
    roomId: string;
    roomCode: string;
    playerId: string;
    playerName: string;
    role: CreativachRole;
  }) {
    localStorage.setItem(`${LS_PREFIX}roomId`, data.roomId);
    localStorage.setItem(`${LS_PREFIX}roomCode`, data.roomCode);
    localStorage.setItem(`${LS_PREFIX}playerId`, data.playerId);
    localStorage.setItem(`${LS_PREFIX}playerName`, data.playerName);
    localStorage.setItem(`${LS_PREFIX}role`, data.role);
  },
  get() {
    return {
      roomId: localStorage.getItem(`${LS_PREFIX}roomId`) || '',
      roomCode: localStorage.getItem(`${LS_PREFIX}roomCode`) || '',
      playerId: localStorage.getItem(`${LS_PREFIX}playerId`) || '',
      playerName: localStorage.getItem(`${LS_PREFIX}playerName`) || '',
      role: (localStorage.getItem(`${LS_PREFIX}role`) || 'player') as CreativachRole,
    };
  },
  clear() {
    ['roomId', 'roomCode', 'playerId', 'playerName', 'role'].forEach(k =>
      localStorage.removeItem(`${LS_PREFIX}${k}`),
    );
  },
};

/* ══════════════════════════════════════════════
   Room CRUD
   ══════════════════════════════════════════════ */

function generateCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function normalizeAvatarFile(value: string): string {
  const match = value.match(/^ava(\d+)\.png$/i);
  if (match) return `${match[1]}.png`;
  return value;
}

export async function createCreativachRoom(hostName: string): Promise<{
  room: CreativachRoom;
  player: CreativachPlayer;
}> {
  let code = '';
  let room: CreativachRoom | null = null;

  for (let i = 0; i < 10; i++) {
    code = generateCode();
    const { data, error } = await supabase
      .from('creativach_rooms')
      .insert({ code, status: 'lobby', state_version: 1 })
      .select()
      .single();
    if (!error && data) {
      room = data as CreativachRoom;
      break;
    }
  }
  if (!room) throw new Error('Не удалось создать комнату');

  const { data: player, error: pErr } = await supabase
    .from('creativach_players')
    .insert({
      room_id: room.id,
      name: hostName,
      role: 'player',
      is_host: true,
      seat: 0,
      avatar: '1.png',
    })
    .select()
    .single();
  if (pErr || !player) throw new Error('Не удалось создать игрока-ведущего');

  await supabase
    .from('creativach_rooms')
    .update({ host_id: (player as CreativachPlayer).id })
    .eq('id', room.id);

  const p = player as CreativachPlayer;
  creativachStorage.setSession({
    roomId: room.id,
    roomCode: room.code,
    playerId: p.id,
    playerName: p.name,
    role: 'player',
  });

  return { room, player: p };
}

export async function joinCreativachRoom(
  roomCode: string,
  playerName: string,
  avatar: string,
  role: CreativachRole,
): Promise<{ room: CreativachRoom; player: CreativachPlayer }> {
  const { data: roomData, error: rErr } = await supabase
    .from('creativach_rooms')
    .select('*')
    .eq('code', roomCode)
    .single();
  if (rErr || !roomData) throw new Error('Комната не найдена');

  const room = roomData as CreativachRoom;
  if (room.status !== 'lobby' && role === 'player') {
    throw new Error('GAME_RUNNING_SPECTATOR_SUGGEST');
  }

  let resolvedName = playerName?.trim() || '';
  let resolvedAvatar = normalizeAvatarFile(avatar || '1.png');

  if (role === 'spectator') {
    if (!resolvedName) {
      resolvedName = `Зритель-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    resolvedAvatar = '1.png';
  }

  if (role === 'player') {
    if (!resolvedName) throw new Error('Введите имя');

    const { count } = await supabase
      .from('creativach_players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .eq('role', 'player')
      .eq('is_host', false);

    if ((count || 0) >= MAX_PLAYERS) throw new Error('MAX_PLAYERS');

    const { data: occupied } = await supabase
      .from('creativach_players')
      .select('avatar, name')
      .eq('room_id', room.id)
      .eq('role', 'player')
      .eq('is_host', false)
      .limit(50);
    const avatarTaken = (occupied || []).some(
      (p: { avatar: string }) => normalizeAvatarFile(p.avatar) === resolvedAvatar,
    );
    if (avatarTaken) throw new Error('AVATAR_TAKEN');
    // Проверка дубликата имени
    const nameTaken = (occupied || []).some(
      (p: { name: string }) => p.name.trim().toLowerCase() === resolvedName.toLowerCase(),
    );
    if (nameTaken) throw new Error('NAME_TAKEN');
  }

  const { count: totalCount } = await supabase
    .from('creativach_players')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id);

  const { data: player, error: pErr } = await supabase
    .from('creativach_players')
    .insert({
      room_id: room.id,
      name: resolvedName,
      avatar: resolvedAvatar,
      role,
      is_host: false,
      seat: (totalCount || 0) + 1,
    })
    .select()
    .single();
  if (pErr || !player) throw new Error('Не удалось подключиться');

  const p = player as CreativachPlayer;
  creativachStorage.setSession({
    roomId: room.id,
    roomCode: room.code,
    playerId: p.id,
    playerName: p.name,
    role,
  });

  return { room, player: p };
}

/* ══════════════════════════════════════════════
   Fetch helpers
   ══════════════════════════════════════════════ */

export async function fetchCreativachRoom(code: string): Promise<CreativachRoom | null> {
  const { data } = await supabase
    .from('creativach_rooms')
    .select('*')
    .eq('code', code)
    .single();
  return (data as CreativachRoom) || null;
}

export async function fetchCreativachRoomById(roomId: string): Promise<CreativachRoom | null> {
  const { data } = await supabase
    .from('creativach_rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  return (data as CreativachRoom) || null;
}

export async function fetchCreativachPlayers(roomId: string): Promise<CreativachPlayer[]> {
  const { data } = await supabase
    .from('creativach_players')
    .select('*')
    .eq('room_id', roomId)
    .order('seat', { ascending: true });
  return (data as CreativachPlayer[]) || [];
}

export async function fetchCreativachAnswers(roomId: string, round?: number): Promise<CreativachAnswer[]> {
  let q = supabase
    .from('creativach_answers')
    .select('*')
    .eq('room_id', roomId)
    .order('submitted_at', { ascending: true });
  if (round !== undefined) q = q.eq('round', round);
  const { data } = await q;
  return (data as CreativachAnswer[]) || [];
}

export async function fetchCreativachVotes(roomId: string, round?: number): Promise<CreativachVote[]> {
  let q = supabase
    .from('creativach_votes')
    .select('*')
    .eq('room_id', roomId);
  if (round !== undefined) q = q.eq('round', round);
  const { data } = await q;
  return (data as CreativachVote[]) || [];
}

/* ══════════════════════════════════════════════
   Room state updates (host)
   ══════════════════════════════════════════════ */

export async function updateCreativachRoom(
  roomId: string,
  patch: Partial<CreativachRoom>,
) {
  const { error } = await supabase
    .from('creativach_rooms')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', roomId);
  if (error) console.error('updateCreativachRoom error:', error);
}

/* ══════════════════════════════════════════════
   Answers
   ══════════════════════════════════════════════ */

export async function submitCreativachAnswer(
  roomId: string,
  round: number,
  playerId: string,
  answerText: string,
) {
  const { error } = await supabase.from('creativach_answers').upsert(
    {
      room_id: roomId,
      round,
      player_id: playerId,
      answer_text: answerText,
    },
    { onConflict: 'room_id,round,player_id' },
  );
  if (error) {
    console.error('submitCreativachAnswer error:', error);
    throw new Error(error.message);
  }
}

/* ══════════════════════════════════════════════
   Votes
   ══════════════════════════════════════════════ */

export async function submitCreativachVote(
  roomId: string,
  round: number,
  voterId: string,
  votedForId: string,
  voterRole: CreativachRole,
) {
  const { error } = await supabase.from('creativach_votes').upsert(
    {
      room_id: roomId,
      round,
      voter_id: voterId,
      voted_for_id: votedForId,
      voter_role: voterRole,
    },
    { onConflict: 'room_id,round,voter_id' },
  );
  if (error) {
    console.error('submitCreativachVote error:', error);
    throw new Error(error.message);
  }
}

/* ══════════════════════════════════════════════
   Points calculation
   ══════════════════════════════════════════════ */

export async function updatePlayerPoints(playerId: string, pointsDelta: number) {
  const { data } = await supabase
    .from('creativach_players')
    .select('total_points')
    .eq('id', playerId)
    .single();
  if (!data) return;
  const d = data as { total_points: number };
  await supabase
    .from('creativach_players')
    .update({ total_points: d.total_points + pointsDelta })
    .eq('id', playerId);
}

export async function resetAllPoints(roomId: string) {
  await supabase
    .from('creativach_players')
    .update({ total_points: 0 })
    .eq('room_id', roomId);
}

/* ══════════════════════════════════════════════
   Realtime subscriptions
   ══════════════════════════════════════════════ */

export function subscribeCreativachRoom(
  roomId: string,
  onChange: (room: CreativachRoom) => void,
) {
  return subscribeChannel(
    `creativach:${roomId}`,
    (payload) => {
      if (payload.table === 'creativach_rooms') onChange(payload.data as unknown as CreativachRoom);
    },
    async () => {
      const room = await fetchCreativachRoomById(roomId);
      if (room) onChange(room);
    },
    3000,
  );
}

export function subscribeCreativachPlayers(
  roomId: string,
  onChange: (players: CreativachPlayer[]) => void,
) {
  return subscribeChannel(
    `creativach:${roomId}`,
    (payload) => {
      if (payload.table === 'creativach_players') {
        fetchCreativachPlayers(roomId).then(onChange).catch(() => {});
      }
    },
    () => { fetchCreativachPlayers(roomId).then(onChange).catch(() => {}); },
    3000,
  );
}

export function subscribeCreativachAnswers(
  roomId: string,
  round: number,
  onChange: (answers: CreativachAnswer[]) => void,
) {
  return subscribeChannel(
    `creativach:${roomId}`,
    (payload) => {
      if (payload.table === 'creativach_answers') {
        fetchCreativachAnswers(roomId, round).then(onChange).catch(() => {});
      }
    },
    () => { fetchCreativachAnswers(roomId, round).then(onChange).catch(() => {}); },
    3000,
  );
}

export function subscribeCreativachVotes(
  roomId: string,
  round: number,
  onChange: (votes: CreativachVote[]) => void,
) {
  return subscribeChannel(
    `creativach:${roomId}`,
    (payload) => {
      if (payload.table === 'creativach_votes') {
        fetchCreativachVotes(roomId, round).then(onChange).catch(() => {});
      }
    },
    () => { fetchCreativachVotes(roomId, round).then(onChange).catch(() => {}); },
    3000,
  );
}
