// src/lib/jokester/api.ts
// Supabase CRUD + realtime для «Пошути-кач»

import { supabase } from '../supabase';
import type {
  JokesterRoom,
  JokesterPlayer,
  JokesterDuel,
  JokesterAnswer,
  JokesterVote,
  JokesterCategoryVote,
  JokesterRole,
  DuelPair,
  JokesterCategory,
} from './types';
import { MAX_PLAYERS } from './types';

/* ══════════════════════════════════════════════
   Session storage (localStorage)
   ══════════════════════════════════════════════ */

const LS_PREFIX = 'jokester_';

export const jokesterStorage = {
  setSession(data: {
    roomId: string;
    roomCode: string;
    playerId: string;
    playerName: string;
    role: JokesterRole;
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
      role: (localStorage.getItem(`${LS_PREFIX}role`) || 'player') as JokesterRole,
    };
  },
  clear() {
    [
      'roomId',
      'roomCode',
      'playerId',
      'playerName',
      'role',
    ].forEach(k => localStorage.removeItem(`${LS_PREFIX}${k}`));
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

export async function createJokesterRoom(hostName: string): Promise<{
  room: JokesterRoom;
  player: JokesterPlayer;
}> {
  let code = '';
  let room: JokesterRoom | null = null;

  // Retry до 10 раз на коллизии кода
  for (let i = 0; i < 10; i++) {
    code = generateCode();
    const { data, error } = await supabase
      .from('jokester_rooms')
      .insert({ code, status: 'lobby', state_version: 1 })
      .select()
      .single();
    if (!error && data) {
      room = data as JokesterRoom;
      break;
    }
  }
  if (!room) throw new Error('Не удалось создать комнату');

  // Создаём ведущего
  const { data: player, error: pErr } = await supabase
    .from('jokester_players')
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

  // Обновляем host_id
  await supabase
    .from('jokester_rooms')
    .update({ host_id: (player as JokesterPlayer).id })
    .eq('id', room.id);

  const p = player as JokesterPlayer;
  jokesterStorage.setSession({
    roomId: room.id,
    roomCode: room.code,
    playerId: p.id,
    playerName: p.name,
    role: 'player',
  });

  return { room, player: p };
}

export async function joinJokesterRoom(
  roomCode: string,
  playerName: string,
  avatar: string,
  role: JokesterRole,
): Promise<{ room: JokesterRoom; player: JokesterPlayer }> {
  const { data: roomData, error: rErr } = await supabase
    .from('jokester_rooms')
    .select('*')
    .eq('code', roomCode)
    .single();
  if (rErr || !roomData) throw new Error('Комната не найдена');

  const room = roomData as JokesterRoom;
  if (room.status !== 'lobby' && role === 'player') {
    // Игра идёт — предлагаем войти зрителем
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
    if (!resolvedName) {
      throw new Error('Введите имя');
    }

    // Проверяем лимит
    const { count } = await supabase
      .from('jokester_players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .eq('role', 'player')
      .eq('is_host', false);

    if ((count || 0) >= MAX_PLAYERS) {
      throw new Error('MAX_PLAYERS');
    }

    // Проверка занятой аватарки среди игроков
    const { data: occupied } = await supabase
      .from('jokester_players')
      .select('avatar, name')
      .eq('room_id', room.id)
      .eq('role', 'player')
      .eq('is_host', false)
      .limit(50);
    const avatarTaken = (occupied || []).some((p: { avatar: string }) => normalizeAvatarFile(p.avatar) === resolvedAvatar);
    if (avatarTaken) {
      throw new Error('AVATAR_TAKEN');
    }
    // Проверка дубликата имени
    const nameTaken = (occupied || []).some(
      (p: { name: string }) => p.name.trim().toLowerCase() === resolvedName.toLowerCase(),
    );
    if (nameTaken) {
      throw new Error('NAME_TAKEN');
    }
  }

  // Считаем seat
  const { count: totalCount } = await supabase
    .from('jokester_players')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id);

  const { data: player, error: pErr } = await supabase
    .from('jokester_players')
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

  const p = player as JokesterPlayer;
  jokesterStorage.setSession({
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

export async function fetchJokesterRoom(code: string): Promise<JokesterRoom | null> {
  const { data } = await supabase
    .from('jokester_rooms')
    .select('*')
    .eq('code', code)
    .single();
  return (data as JokesterRoom) || null;
}

export async function fetchJokesterPlayers(roomId: string): Promise<JokesterPlayer[]> {
  const { data } = await supabase
    .from('jokester_players')
    .select('*')
    .eq('room_id', roomId)
    .order('seat', { ascending: true });
  return (data as JokesterPlayer[]) || [];
}

export async function fetchJokesterDuels(roomId: string, round?: number): Promise<JokesterDuel[]> {
  let q = supabase
    .from('jokester_duels')
    .select('*')
    .eq('room_id', roomId)
    .order('duel_index', { ascending: true });
  if (round !== undefined) q = q.eq('round', round);
  const { data } = await q;
  return (data as JokesterDuel[]) || [];
}

export async function fetchDuelAnswers(duelId: string): Promise<JokesterAnswer[]> {
  const { data } = await supabase
    .from('jokester_answers')
    .select('*')
    .eq('duel_id', duelId)
    .order('question_index', { ascending: true });
  return (data as JokesterAnswer[]) || [];
}

export async function fetchDuelVotes(duelId: string): Promise<JokesterVote[]> {
  const { data } = await supabase
    .from('jokester_votes')
    .select('*')
    .eq('duel_id', duelId);
  return (data as JokesterVote[]) || [];
}

/* ══════════════════════════════════════════════
   Room state updates (host)
   ══════════════════════════════════════════════ */

export async function updateJokesterRoom(
  roomId: string,
  patch: Partial<JokesterRoom>,
) {
  const { error } = await supabase
    .from('jokester_rooms')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', roomId);
  if (error) console.error('updateJokesterRoom error:', error);
}

export async function incrementStateVersion(roomId: string) {
  // Сначала получить текущую версию, затем инкрементировать
  const { data } = await supabase
    .from('jokester_rooms')
    .select('state_version')
    .eq('id', roomId)
    .single();
  if (data) {
    await supabase
      .from('jokester_rooms')
      .update({ state_version: (data as { state_version: number }).state_version + 1 })
      .eq('id', roomId);
  }
}

/* ══════════════════════════════════════════════
   Category voting
   ══════════════════════════════════════════════ */

export async function submitCategoryVote(
  roomId: string,
  round: number,
  voterId: string,
  category: string,
) {
  const { error } = await supabase
    .from('jokester_category_votes')
    .upsert(
      { room_id: roomId, round, voter_id: voterId, category },
      { onConflict: 'room_id,round,voter_id,category' },
    );
  if (error) console.error('submitCategoryVote error:', error);
}

export async function fetchCategoryVotes(
  roomId: string,
  round: number,
): Promise<JokesterCategoryVote[]> {
  const { data } = await supabase
    .from('jokester_category_votes')
    .select('*')
    .eq('room_id', round ? roomId : roomId)
    .eq('round', round);
  return (data as JokesterCategoryVote[]) || [];
}

/* ══════════════════════════════════════════════
   Duel management
   ══════════════════════════════════════════════ */

/**
 * Формирует расписание дуэлей: каждый игрок участвует ровно в 2 дуэлях.
 * Для N игроков будет N дуэлей (каждый играет 2 раза).
 */
export function generateDuelSchedule(playerIds: string[]): DuelPair[] {
  const n = playerIds.length;
  if (n < 2) return [];

  const pairs: DuelPair[] = [];
  // Каждый игрок i дерётся с i+1 (по кольцу) и i+n/2 (примерно)
  // Простой алгоритм: кольцо + сдвиг
  for (let i = 0; i < n; i++) {
    pairs.push({
      player1_id: playerIds[i],
      player2_id: playerIds[(i + 1) % n],
    });
  }
  // Перемешать порядок дуэлей
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

export async function createDuels(
  roomId: string,
  round: number,
  pairs: DuelPair[],
  questions: Array<{ text: string; category: string }>,
) {
  const duelsToInsert = pairs.map((pair, idx) => ({
    room_id: roomId,
    round,
    duel_index: idx,
    player1_id: pair.player1_id,
    player2_id: pair.player2_id,
    question1_text: questions[idx]?.text || null,
    question1_cat: questions[idx]?.category || null,
    question2_text: null,
    question2_cat: null,
    status: 'pending',
  }));

  const { error } = await supabase.from('jokester_duels').insert(duelsToInsert);
  if (error) console.error('createDuels error:', error);
}

/* ══════════════════════════════════════════════
   Answers
   ══════════════════════════════════════════════ */

export async function submitAnswer(
  duelId: string,
  playerId: string,
  questionIndex: number,
  answerText: string,
) {
  const { error } = await supabase.from('jokester_answers').upsert(
    {
      duel_id: duelId,
      player_id: playerId,
      question_index: questionIndex,
      answer_text: answerText,
    },
    { onConflict: 'duel_id,player_id,question_index' },
  );
  if (error) console.error('submitAnswer error:', error);
}

/* ══════════════════════════════════════════════
   Votes
   ══════════════════════════════════════════════ */

export async function submitDuelVote(
  duelId: string,
  voterId: string,
  questionIndex: number,
  votedForId: string,
  voterRole: JokesterRole,
) {
  const { error } = await supabase.from('jokester_votes').upsert(
    {
      duel_id: duelId,
      voter_id: voterId,
      question_index: questionIndex,
      voted_for_id: votedForId,
      voter_role: voterRole,
    },
    { onConflict: 'duel_id,voter_id,question_index' },
  );
  if (error) console.error('submitDuelVote error:', error);
}

/* ══════════════════════════════════════════════
   Points calculation
   ══════════════════════════════════════════════ */

export async function updatePlayerPoints(
  playerId: string,
  pointsDelta: number,
  playerVotesDelta: number,
  spectatorVotesDelta: number,
) {
  // Fetch current → update (нет RPC, делаем оптимистично)
  const { data } = await supabase
    .from('jokester_players')
    .select('total_points, player_votes, spectator_votes')
    .eq('id', playerId)
    .single();
  if (!data) return;
  const d = data as { total_points: number; player_votes: number; spectator_votes: number };
  await supabase
    .from('jokester_players')
    .update({
      total_points: d.total_points + pointsDelta,
      player_votes: d.player_votes + playerVotesDelta,
      spectator_votes: d.spectator_votes + spectatorVotesDelta,
    })
    .eq('id', playerId);
}

/* ══════════════════════════════════════════════
   Question selection
   ══════════════════════════════════════════════ */

export async function getUsedQuestions(roomId: string): Promise<string[]> {
  const { data } = await supabase
    .from('jokester_used_questions')
    .select('question_text')
    .eq('room_id', roomId);
  return (data || []).map(r => (r as { question_text: string }).question_text);
}

export async function markQuestionsUsed(
  roomId: string,
  round: number,
  questions: Array<{ text: string; category: string }>,
) {
  const rows = questions.map(q => ({
    room_id: roomId,
    question_text: q.text,
    category: q.category,
    round,
  }));
  if (rows.length > 0) {
    await supabase.from('jokester_used_questions').insert(rows);
  }
}

/**
 * Выбирает N уникальных вопросов из топ-категорий (не повторяя использованные)
 */
export function selectQuestions(
  categories: JokesterCategory[],
  topCategoryIds: string[],
  count: number,
  usedTexts: string[],
): Array<{ text: string; category: string }> {
  const pool: Array<{ text: string; category: string }> = [];
  const seen = new Set<string>();
  for (const catId of topCategoryIds) {
    const cat = categories.find(c => c.id === catId);
    if (cat) {
      for (const q of cat.questions) {
        if (!usedTexts.includes(q) && !seen.has(q)) {
          seen.add(q);
          pool.push({ text: q, category: cat.id });
        }
      }
    }
  }

  // If pool is too small, allow reusing previously used questions (fallback)
  if (pool.length < count) {
    for (const cat of categories) {
      for (const q of cat.questions) {
        if (!seen.has(q)) {
          seen.add(q);
          pool.push({ text: q, category: cat.id });
        }
      }
    }
  }
  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/* ══════════════════════════════════════════════
   Realtime subscriptions
   ══════════════════════════════════════════════ */

export function subscribeJokesterRoom(
  roomId: string,
  onChange: (room: JokesterRoom) => void,
) {
  const channel = supabase
    .channel(`jokester-room-${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'jokester_rooms',
        filter: `id=eq.${roomId}`,
      },
      payload => onChange(payload.new as JokesterRoom),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeJokesterPlayers(
  roomId: string,
  onChange: (players: JokesterPlayer[]) => void,
) {
  const channel = supabase
    .channel(`jokester-players-${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'jokester_players',
        filter: `room_id=eq.${roomId}`,
      },
      async () => {
        // Рефетч всех игроков
        const players = await fetchJokesterPlayers(roomId);
        onChange(players);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeJokesterDuels(
  roomId: string,
  onChange: (duels: JokesterDuel[]) => void,
) {
  const channel = supabase
    .channel(`jokester-duels-${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'jokester_duels',
        filter: `room_id=eq.${roomId}`,
      },
      async () => {
        const duels = await fetchJokesterDuels(roomId);
        onChange(duels);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeJokesterAnswers(
  duelId: string,
  onChange: (answers: JokesterAnswer[]) => void,
) {
  const channel = supabase
    .channel(`jokester-answers-${duelId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'jokester_answers',
        filter: `duel_id=eq.${duelId}`,
      },
      async () => {
        const answers = await fetchDuelAnswers(duelId);
        onChange(answers);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeJokesterVotes(
  duelId: string,
  onChange: (votes: JokesterVote[]) => void,
) {
  const channel = supabase
    .channel(`jokester-votes-${duelId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'jokester_votes',
        filter: `duel_id=eq.${duelId}`,
      },
      async () => {
        const votes = await fetchDuelVotes(duelId);
        onChange(votes);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeJokesterCategoryVotes(
  roomId: string,
  round: number,
  onChange: (votes: JokesterCategoryVote[]) => void,
) {
  const channel = supabase
    .channel(`jokester-catvotes-${roomId}-${round}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'jokester_category_votes',
        filter: `room_id=eq.${roomId}`,
      },
      async () => {
        const votes = await fetchCategoryVotes(roomId, round);
        onChange(votes);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
