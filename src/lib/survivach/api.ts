// src/lib/survivach/api.ts
// Supabase CRUD + realtime для игры «Выживач»

import { supabase } from '../supabase';
import { subscribeChannel } from '../centrifuge';
import type {
  SurvivachRoom,
  SurvivachPlayer,
  SurvivachAnswer,
  SurvivachBet,
  SurvivachDuel,
  SurvivachPack,
  SurvivachRoomStatus,
  RoundMode,
  QuestionData,
  RoundResultsData,
  BetResultsData,
  DuelData,
  SurvivachSession,
} from './types';

/* ══════════════════════════════════════════
   LocalStorage session
   ══════════════════════════════════════════ */

const LS_KEY = 'survivach_session';

export const survivachStorage = {
  setSession(s: SurvivachSession) {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  },
  get(): SurvivachSession | null {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as SurvivachSession) : null;
    } catch { return null; }
  },
  clear() { localStorage.removeItem(LS_KEY); },
};

/* ══════════════════════════════════════════
   Room helpers
   ══════════════════════════════════════════ */

function generateCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function createSurvivachRoom(packId = 'default'): Promise<{
  room: SurvivachRoom;
  hostPlayer: SurvivachPlayer;
}> {
  let room: SurvivachRoom | null = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const { data, error } = await supabase
      .from('survivach_rooms')
      .insert({ code, pack_id: packId, state_version: 1 })
      .select()
      .single();
    if (!error && data) { room = data as SurvivachRoom; break; }
  }
  if (!room) throw new Error('Не удалось создать комнату');

  const { data: player, error: pErr } = await supabase
    .from('survivach_players')
    .insert({ room_id: room.id, name: 'Ведущий', avatar: 'duck1', is_host: true })
    .select()
    .single();
  if (pErr || !player) throw new Error('Не удалось создать ведущего');

  await supabase.from('survivach_rooms')
    .update({ host_id: (player as SurvivachPlayer).id })
    .eq('id', room.id);

  return { room, hostPlayer: player as SurvivachPlayer };
}

export async function fetchRoomByCode(code: string): Promise<SurvivachRoom | null> {
  const { data, error } = await supabase
    .from('survivach_rooms')
    .select('*')
    .eq('code', code)
    .single();
  if (error || !data) return null;
  return data as SurvivachRoom;
}

export async function fetchRoomById(roomId: string): Promise<SurvivachRoom | null> {
  const { data, error } = await supabase
    .from('survivach_rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  if (error || !data) return null;
  return data as SurvivachRoom;
}

export async function updateRoom(roomId: string, updates: Partial<SurvivachRoom> & {
  question_data?: QuestionData | null;
  round_results_data?: RoundResultsData | null;
  bet_results_data?: BetResultsData | null;
  duel_data?: DuelData | null;
}) {
  const { error } = await supabase
    .from('survivach_rooms')
    .update({ ...updates, state_version: supabase.rpc as unknown as number })
    .eq('id', roomId);
  if (error) throw error;
}

export async function setRoomStatus(
  roomId: string,
  status: SurvivachRoomStatus,
  extra: Record<string, unknown> = {},
) {
  const { error } = await supabase
    .from('survivach_rooms')
    .update({ status, ...extra })
    .eq('id', roomId);
  if (error) throw error;
}

/* ══════════════════════════════════════════
   Players
   ══════════════════════════════════════════ */

export async function joinSurvivachRoom(
  roomCode: string,
  playerName: string,
  avatar: string,
): Promise<{ room: SurvivachRoom; player: SurvivachPlayer }> {
  const room = await fetchRoomByCode(roomCode);
  if (!room) throw new Error('Комната не найдена');
  if (room.status !== 'lobby') throw new Error('Игра уже началась');

  const name = playerName.trim();
  if (!name) throw new Error('Введите имя');

  const { data: player, error } = await supabase
    .from('survivach_players')
    .insert({ room_id: room.id, name, avatar, is_host: false })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      if (error.message.includes('avatar')) throw new Error('Этот аватар уже занят');
      if (error.message.includes('name')) throw new Error('Это имя уже занято');
    }
    throw new Error('Не удалось подключиться');
  }

  survivachStorage.setSession({
    roomId: room.id,
    roomCode: room.code,
    playerId: (player as SurvivachPlayer).id,
    playerName: name,
    isHost: false,
  });

  return { room, player: player as SurvivachPlayer };
}

export async function fetchPlayers(roomId: string): Promise<SurvivachPlayer[]> {
  const { data, error } = await supabase
    .from('survivach_players')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at');
  if (error) return [];
  return (data ?? []) as SurvivachPlayer[];
}

export async function updatePlayer(
  playerId: string,
  updates: Partial<SurvivachPlayer>,
) {
  const { error } = await supabase
    .from('survivach_players')
    .update(updates)
    .eq('id', playerId);
  if (error) throw error;
}

/** Bulk-update multiple players in parallel */
export async function updatePlayers(
  updates: Array<{ id: string } & Partial<SurvivachPlayer>>,
) {
  await Promise.all(updates.map(({ id, ...rest }) => updatePlayer(id, rest)));
}

/* ══════════════════════════════════════════
   Answers
   ══════════════════════════════════════════ */

export async function submitAnswer(
  roomId: string,
  playerId: string,
  round: number,
  payload: {
    answer_text?: string;
    answer_index?: number;
    answer_data?: Record<string, unknown>;
    is_correct?: boolean;
    answer_time_ms?: number;
  },
) {
  const { error } = await supabase
    .from('survivach_answers')
    .upsert({
      room_id: roomId,
      player_id: playerId,
      round,
      ...payload,
    }, { onConflict: 'room_id,player_id,round' });
  if (error) throw error;
}

export async function fetchAnswers(roomId: string, round: number): Promise<SurvivachAnswer[]> {
  const { data, error } = await supabase
    .from('survivach_answers')
    .select('*')
    .eq('room_id', roomId)
    .eq('round', round);
  if (error) return [];
  return (data ?? []) as SurvivachAnswer[];
}

/* ══════════════════════════════════════════
   Bets ("Ставка на зеро")
   ══════════════════════════════════════════ */

export async function submitBet(
  roomId: string,
  playerId: string,
  round: number,
  betType: 'karma' | 'life',
) {
  const { error } = await supabase
    .from('survivach_bets')
    .upsert({
      room_id: roomId,
      player_id: playerId,
      round,
      bet_type: betType,
      resolved: false,
    }, { onConflict: 'room_id,player_id,round' });
  if (error) throw error;
}

export async function fetchBets(roomId: string, round: number): Promise<SurvivachBet[]> {
  const { data, error } = await supabase
    .from('survivach_bets')
    .select('*')
    .eq('room_id', roomId)
    .eq('round', round);
  if (error) return [];
  return (data ?? []) as SurvivachBet[];
}

/* ══════════════════════════════════════════
   Duels
   ══════════════════════════════════════════ */

export async function createDuel(
  roomId: string,
  round: number,
  mode: 'minesweeper' | 'arithmetic_mean' | 'crowd_forecast',
  challengerId: string,
  challengedId: string,
  duelData: DuelData,
): Promise<SurvivachDuel> {
  const { data, error } = await supabase
    .from('survivach_duels')
    .insert({
      room_id: roomId,
      round,
      mode,
      challenger_id: challengerId,
      challenged_id: challengedId,
      status: 'pending',
      duel_data: duelData,
    })
    .select()
    .single();
  if (error || !data) throw new Error('Не удалось создать дуэль');
  return data as SurvivachDuel;
}

export async function updateDuel(
  duelId: string,
  updates: Partial<SurvivachDuel> & { duel_data?: DuelData },
) {
  const { error } = await supabase
    .from('survivach_duels')
    .update(updates)
    .eq('id', duelId);
  if (error) throw error;
}

export async function fetchActiveDuel(roomId: string, round: number): Promise<SurvivachDuel | null> {
  const { data, error } = await supabase
    .from('survivach_duels')
    .select('*')
    .eq('room_id', roomId)
    .eq('round', round)
    .not('status', 'eq', 'done')
    .maybeSingle();
  if (error || !data) return null;
  return data as SurvivachDuel;
}

/* ══════════════════════════════════════════
   Packs
   ══════════════════════════════════════════ */

export async function fetchPacks(): Promise<SurvivachPack[]> {
  const { data, error } = await supabase
    .from('survivach_packs')
    .select('*')
    .eq('is_active', true)
    .order('created_at');
  if (error) return [];
  return (data ?? []) as SurvivachPack[];
}

export async function fetchPack(packId: string): Promise<SurvivachPack | null> {
  const { data, error } = await supabase
    .from('survivach_packs')
    .select('*')
    .eq('id', packId)
    .single();
  if (error || !data) return null;
  return data as SurvivachPack;
}

/** Load question JSON for a given mode from a pack's base_url */
export async function loadPackQuestions(
  packBaseUrl: string,
  mode: RoundMode,
): Promise<unknown | null> {
  const fileMap: Partial<Record<RoundMode, string>> = {
    umnik: 'quiz.json',
    art_historian: 'art_historian_questions.json',
    interpreter: 'interpreter_questions.json',
    blitz: 'blitz.json',
  };

  const file = fileMap[mode];
  if (!file) return null; // mathematician, memory_diary, tag_puzzle are generated

  try {
    const url = `${packBaseUrl}/json/${file}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Load duel questions (arithmetic_mean / crowd_forecast) */
export async function loadDuelQuestions(
  packBaseUrl: string,
  duelMode: 'arithmetic_mean' | 'crowd_forecast',
): Promise<unknown | null> {
  const fileMap = {
    arithmetic_mean: 'arithmetic_mean_questions.json',
    crowd_forecast: 'crowd_forecast_questions.json',
  };
  try {
    const url = `${packBaseUrl}/json/${fileMap[duelMode]}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════
   Hot Potato
   ══════════════════════════════════════════ */

export async function passPotatoBomb(roomId: string, currentHolderId: string, newHolderId: string) {
  // Use RPC or a simple select-update if it's fine for concurrency.
  // The simplest is to fetch room and update its JSONB.
  const { data: room, error: fetchErr } = await supabase
    .from('survivach_rooms')
    .select('round_results_data, status')
    .eq('id', roomId)
    .single();

  if (fetchErr || !room || room.status !== 'potato_playing') return;
  const rd = room.round_results_data as any;
  if (!rd || rd.potato_bomb_holder !== currentHolderId) return;

  const newData = { ...rd, potato_bomb_holder: newHolderId, potato_task: Math.floor(Math.random() * 3) };
  await supabase
    .from('survivach_rooms')
    .update({ round_results_data: newData })
    .eq('id', roomId);
}

/* ══════════════════════════════════════════
   Realtime subscriptions
   ══════════════════════════════════════════ */

export function subscribeRoom(
  roomId: string,
  onUpdate: (room: SurvivachRoom) => void,
): () => void {
  const channel = `survivach:${roomId}`;
  const fallback = async () => {
    const r = await fetchRoomById(roomId);
    if (r) onUpdate(r);
  };
  return subscribeChannel(
    channel,
    (payload) => {
      if (payload.table === 'survivach_rooms') {
        onUpdate(payload.data as unknown as SurvivachRoom);
      }
    },
    fallback,
    2000,
  );
}

export function subscribeRoomPlayers(
  roomId: string,
  onUpdate: (players: SurvivachPlayer[]) => void,
): () => void {
  const channel = `survivach:${roomId}`;
  const fallback = async () => {
    const p = await fetchPlayers(roomId);
    onUpdate(p);
  };
  return subscribeChannel(
    channel,
    (payload) => {
      if (payload.table === 'survivach_players') {
        fetchPlayers(roomId).then(onUpdate);
      }
    },
    fallback,
    2000,
  );
}

export function subscribeRoomAnswers(
  roomId: string,
  round: number,
  onUpdate: (answers: SurvivachAnswer[]) => void,
): () => void {
  const channel = `survivach:${roomId}`;
  const fallback = async () => {
    const a = await fetchAnswers(roomId, round);
    onUpdate(a);
  };
  return subscribeChannel(
    channel,
    (payload) => {
      if (payload.table === 'survivach_answers') {
        fetchAnswers(roomId, round).then(onUpdate);
      }
    },
    fallback,
    1500,
  );
}

export function subscribeRoomBets(
  roomId: string,
  round: number,
  onUpdate: (bets: SurvivachBet[]) => void,
): () => void {
  const channel = `survivach:${roomId}`;
  return subscribeChannel(
    channel,
    (payload) => {
      if (payload.table === 'survivach_bets') {
        fetchBets(roomId, round).then(onUpdate);
      }
    },
    () => fetchBets(roomId, round).then(onUpdate),
    2000,
  );
}

export function subscribeRoomDuel(
  roomId: string,
  round: number,
  onUpdate: (duel: SurvivachDuel | null) => void,
): () => void {
  const channel = `survivach:${roomId}`;
  return subscribeChannel(
    channel,
    (payload) => {
      if (payload.table === 'survivach_duels') {
        fetchActiveDuel(roomId, round).then(onUpdate);
      }
    },
    () => fetchActiveDuel(roomId, round).then(onUpdate),
    2000,
  );
}
