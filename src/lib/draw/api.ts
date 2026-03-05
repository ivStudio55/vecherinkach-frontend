import { supabase } from '../supabase';
import { subscribeChannel } from '../centrifuge';
import type { DrawRoom, DrawPlayer, DrawChain, DrawStep, DrawVote, DrawWord, DrawGameMode } from './types';
import { FALLBACK_WORDS, FALLBACK_WORDS_EN, pickRandomWords } from './words';

/* ============ localStorage session ============ */

const PLAYER_ID_KEY = 'drawPlayerId';
const PLAYER_NAME_KEY = 'drawPlayerName';
const ROOM_CODE_KEY = 'drawRoomCode';
const ROOM_ID_KEY = 'drawRoomId';

export const drawStorage = {
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

/* ============ Room CRUD ============ */

export async function createDrawRoom(hostName: string, mode: DrawGameMode = 'russian'): Promise<{ room: DrawRoom; player: DrawPlayer }> {
  const code = Math.random().toString(36).slice(2, 6).toUpperCase();

  const { data: roomData, error: roomErr } = await supabase
    .from('draw_rooms')
    .insert({ code, mode })
    .select()
    .single();
  if (roomErr) throw roomErr;
  const room = roomData as DrawRoom;

  const { data: playerData, error: playerErr } = await supabase
    .from('draw_players')
    .insert({ room_id: room.id, name: hostName || 'Ведущий', is_host: true, seat: 1 })
    .select()
    .single();
  if (playerErr) throw playerErr;
  const player = playerData as DrawPlayer;

  await supabase.from('draw_rooms').update({ host_id: player.id }).eq('id', room.id);

  drawStorage.setSession({ playerId: player.id, playerName: player.name, roomCode: room.code, roomId: room.id });
  return { room: { ...room, host_id: player.id }, player };
}

export async function joinDrawRoom(roomCode: string, playerName: string): Promise<{ room: DrawRoom; player: DrawPlayer }> {
  const { data: roomData, error: roomErr } = await supabase
    .from('draw_rooms')
    .select('*')
    .eq('code', roomCode.toUpperCase())
    .single();
  if (roomErr || !roomData) throw new Error('Комната не найдена');
  const room = roomData as DrawRoom;

  if (room.status !== 'lobby') throw new Error('Игра уже началась');

  // Проверка дубликата имени
  const finalPlayerName = playerName || 'Игрок';
  const { data: existingPlayers } = await supabase
    .from('draw_players')
    .select('id, name')
    .eq('room_id', room.id)
    .ilike('name', finalPlayerName)
    .limit(1);
  if (existingPlayers && existingPlayers.length > 0) {
    throw new Error('Игрок с таким именем уже есть в комнате. Выберите другое имя.');
  }

  const { count } = await supabase
    .from('draw_players')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id);
  const seat = (count || 0) + 1;

  const { data: playerData, error: playerErr } = await supabase
    .from('draw_players')
    .insert({ room_id: room.id, name: finalPlayerName, is_host: false, seat })
    .select()
    .single();
  if (playerErr) throw playerErr;
  const player = playerData as DrawPlayer;

  drawStorage.setSession({ playerId: player.id, playerName: player.name, roomCode: room.code, roomId: room.id });
  return { room, player };
}

/* ============ Fetchers ============ */

export async function fetchDrawRoom(code: string): Promise<DrawRoom> {
  const { data, error } = await supabase.from('draw_rooms').select('*').eq('code', code).single();
  if (error) throw error;
  return data as DrawRoom;
}

export async function fetchDrawPlayers(roomId: string): Promise<DrawPlayer[]> {
  const { data, error } = await supabase
    .from('draw_players')
    .select('*')
    .eq('room_id', roomId)
    .order('seat', { ascending: true });
  if (error) throw error;
  return (data || []) as DrawPlayer[];
}

export async function fetchDrawChains(roomId: string, round: number): Promise<DrawChain[]> {
  const { data, error } = await supabase
    .from('draw_chains')
    .select('*')
    .eq('room_id', roomId)
    .eq('round', round)
    .order('chain_index', { ascending: true });
  if (error) throw error;
  return (data || []) as DrawChain[];
}

export async function fetchDrawSteps(chainIds: string[]): Promise<DrawStep[]> {
  if (chainIds.length === 0) return [];
  const { data, error } = await supabase
    .from('draw_steps')
    .select('*')
    .in('chain_id', chainIds)
    .order('step_number', { ascending: true });
  if (error) throw error;
  return (data || []) as DrawStep[];
}

export async function fetchMyStep(chainIds: string[], stepNumber: number, playerId: string): Promise<DrawStep | null> {
  if (chainIds.length === 0) return null;
  const { data, error } = await supabase
    .from('draw_steps')
    .select('*')
    .in('chain_id', chainIds)
    .eq('step_number', stepNumber)
    .eq('player_id', playerId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return (data as DrawStep) || null;
}

export async function fetchPreviousStepDrawing(chainId: string, stepNumber: number): Promise<DrawStep | null> {
  if (stepNumber <= 1) return null;
  const { data, error } = await supabase
    .from('draw_steps')
    .select('*')
    .eq('chain_id', chainId)
    .eq('step_number', stepNumber - 1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return (data as DrawStep) || null;
}

export async function fetchSubmittedCount(chainIds: string[], stepNumber: number): Promise<number> {
  if (chainIds.length === 0) return 0;
  const { count, error } = await supabase
    .from('draw_steps')
    .select('*', { count: 'exact', head: true })
    .in('chain_id', chainIds)
    .eq('step_number', stepNumber)
    .eq('submitted', true);
  if (error) throw error;
  return count || 0;
}

export async function fetchVotes(roomId: string, round: number): Promise<DrawVote[]> {
  const { data, error } = await supabase
    .from('draw_votes')
    .select('*')
    .eq('room_id', roomId)
    .eq('round', round);
  if (error) throw error;
  return (data || []) as DrawVote[];
}

/** Count how many unique voters voted for a specific chain */
export async function fetchVoteCountForChain(chainId: string): Promise<number> {
  const { count, error } = await supabase
    .from('draw_votes')
    .select('*', { count: 'exact', head: true })
    .eq('chain_id', chainId);
  if (error) throw error;
  return count || 0;
}

/* ============ Game Flow — Host actions ============ */

export async function fetchRandomWords(count: number, mode: DrawGameMode = 'russian'): Promise<string[]> {
  if (mode === 'english') {
    return pickRandomWords(FALLBACK_WORDS_EN, count);
  }
  if (mode === 'free') {
    // In free mode, words are entered by players — return placeholder markers
    return Array.from({ length: count }, (_, i) => `__FREE_${i}__`);
  }
  const { data, error } = await supabase.from('draw_words').select('word');
  if (error || !data || data.length === 0) {
    return pickRandomWords(FALLBACK_WORDS, count);
  }
  const allWords = (data as DrawWord[]).map(d => d.word);
  return pickRandomWords(allWords, count);
}

/** Start a new round: create chains + steps, update room.
 *  Only non-host players participate in the game chains. */
export async function startRound(roomId: string, roundNumber: number, players: DrawPlayer[], mode: DrawGameMode = 'russian'): Promise<void> {
  // Exclude host from game players
  const gamePlayers = players.filter(p => !p.is_host);
  const n = gamePlayers.length;
  if (n < 2) throw new Error('Нужно минимум 2 игрока (не считая ведущего)');
  const sorted = [...gamePlayers].sort((a, b) => a.seat - b.seat);
  const words = await fetchRandomWords(n, mode);

  // Create chains
  const chainInserts = words.map((word, ci) => ({
    room_id: roomId,
    round: roundNumber,
    chain_index: ci,
    original_word: word,
  }));

  const { data: chainsData, error: chainsErr } = await supabase
    .from('draw_chains')
    .insert(chainInserts)
    .select();
  if (chainsErr) throw chainsErr;
  const chains = (chainsData as DrawChain[]).sort((a, b) => a.chain_index - b.chain_index);

  // Create steps for each chain
  const stepInserts: Array<{
    chain_id: string;
    step_number: number;
    player_id: string;
    target_word: string | null;
  }> = [];

  for (let ci = 0; ci < n; ci++) {
    for (let k = 1; k <= n; k++) {
      const playerIdx = (ci + k - 1) % n;
      stepInserts.push({
        chain_id: chains[ci].id,
        step_number: k,
        player_id: sorted[playerIdx].id,
        target_word: k === 1 ? chains[ci].original_word : null,
      });
    }
  }

  const { error: stepsErr } = await supabase.from('draw_steps').insert(stepInserts);
  if (stepsErr) throw stepsErr;

  // Update room
  await supabase.from('draw_rooms').update({
    status: 'playing',
    current_round: roundNumber,
    current_step: 1,
    total_steps: n,
    step_started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', roomId);
}

/** Advance to the next step within a round */
export async function advanceStep(room: DrawRoom): Promise<void> {
  const nextStep = room.current_step + 1;

  if (nextStep > room.total_steps) {
    // Round finished → voting phase
    await supabase.from('draw_rooms').update({
      status: 'voting',
      voting_chain_index: 0,
      updated_at: new Date().toISOString(),
    }).eq('id', room.id);
  } else {
    await supabase.from('draw_rooms').update({
      current_step: nextStep,
      step_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', room.id);
  }
}

/** Move to results phase after voting */
export async function finishVoting(roomId: string): Promise<void> {
  await supabase.from('draw_rooms').update({
    status: 'results',
    updated_at: new Date().toISOString(),
  }).eq('id', roomId);
}

/** Start next round or finish game */
export async function nextRoundOrFinish(room: DrawRoom, players: DrawPlayer[]): Promise<void> {
  if (room.current_round >= 3) {
    await supabase.from('draw_rooms').update({
      status: 'finished',
      updated_at: new Date().toISOString(),
    }).eq('id', room.id);
  } else {
    await startRound(room.id, room.current_round + 1, players, room.mode);
  }
}

/** Advance voting_chain_index (host shows next chain) */
export async function advanceVotingChain(room: DrawRoom): Promise<void> {
  await supabase.from('draw_rooms').update({
    voting_chain_index: room.voting_chain_index + 1,
    updated_at: new Date().toISOString(),
  }).eq('id', room.id);
}

/* ============ Player actions ============ */

/** Submit drawing for step 1 (no guess) */
export async function submitDrawingStep1(stepId: string, drawingData: string): Promise<void> {
  const { error } = await supabase.from('draw_steps').update({
    drawing_data: drawingData,
    submitted: true,
  }).eq('id', stepId);
  if (error) {
    console.error('submitDrawingStep1 error:', error);
    throw new Error(error.message);
  }
}

/** Submit guess + drawing for step >= 2 */
export async function submitGuessAndDrawing(
  stepId: string,
  guess: string,
  drawingData: string,
  previousStep: DrawStep,
): Promise<{ isCorrect: boolean }> {
  const prevWord = previousStep.target_word || '';
  const isCorrect = normalizeGuess(guess) === normalizeGuess(prevWord);

  await supabase.from('draw_steps').update({
    guess,
    target_word: guess, // the guess becomes the target word for this step's drawing
    drawing_data: drawingData,
    is_correct: isCorrect,
    submitted: true,
  }).eq('id', stepId);

  // Award points if correct
  if (isCorrect) {
    // +50 to guesser
    const { data: stepData } = await supabase.from('draw_steps').select('player_id').eq('id', stepId).single();
    if (stepData) {
      const { data: guesserData } = await supabase.from('draw_players').select('score').eq('id', stepData.player_id).single();
      if (guesserData) {
        await supabase.from('draw_players').update({ score: (guesserData as DrawPlayer).score + 50 }).eq('id', stepData.player_id);
      }
    }

    // +50 to drawer (previous step's player)
    const { data: drawerData } = await supabase.from('draw_players').select('score').eq('id', previousStep.player_id).single();
    if (drawerData) {
      await supabase.from('draw_players').update({ score: (drawerData as DrawPlayer).score + 50 }).eq('id', previousStep.player_id);
    }
  }

  return { isCorrect };
}

/** Cast a vote */
export async function castVote(
  roomId: string,
  round: number,
  chainId: string,
  voterId: string,
  votedForPlayerId: string,
): Promise<void> {
  const { error } = await supabase.from('draw_votes').upsert({
    room_id: roomId,
    round,
    chain_id: chainId,
    voter_id: voterId,
    voted_for_player_id: votedForPlayerId,
  }, { onConflict: 'chain_id,voter_id' });
  if (error) throw error;
}

/** Award vote points after voting round */
export async function awardVotePoints(roomId: string, round: number): Promise<void> {
  const votes = await fetchVotes(roomId, round);
  // Count votes per player
  const voteCounts: Record<string, number> = {};
  for (const v of votes) {
    voteCounts[v.voted_for_player_id] = (voteCounts[v.voted_for_player_id] || 0) + 1;
  }
  // Award +25 per vote
  for (const [playerId, count] of Object.entries(voteCounts)) {
    const { data } = await supabase.from('draw_players').select('score').eq('id', playerId).single();
    if (data) {
      await supabase.from('draw_players').update({ score: (data as DrawPlayer).score + 25 * count }).eq('id', playerId);
    }
  }
}

/* ============ Realtime ============ */

export function subscribeDrawRoom(roomId: string, onChange: (room: DrawRoom) => void) {
  return subscribeChannel(
    `draw:${roomId}`,
    (payload) => {
      if (payload.table === 'draw_rooms') onChange(payload.data as unknown as DrawRoom);
    },
    async () => {
      const { data } = await supabase.from('draw_rooms').select('*').eq('id', roomId).single();
      if (data) onChange(data as DrawRoom);
    },
    3000,
  );
}

export function subscribeDrawPlayers(roomId: string, onChange: () => void) {
  return subscribeChannel(
    `draw:${roomId}`,
    (payload) => {
      if (payload.table === 'draw_players') onChange();
    },
    onChange,
    3000,
  );
}

export function subscribeDrawSteps(roomId: string, onChange: () => void) {
  return subscribeChannel(
    `draw:${roomId}`,
    (payload) => {
      if (payload.table === 'draw_steps') onChange();
    },
    onChange,
    3000,
  );
}

/* ============ Room Management ============ */

/** Close/delete a draw room */
export async function closeDrawRoom(roomId: string): Promise<void> {
  await supabase.from('draw_rooms').update({
    status: 'finished',
    updated_at: new Date().toISOString(),
  }).eq('id', roomId);
}

/** Fetch all draw rooms (for admin) */
export async function fetchAllDrawRooms(): Promise<DrawRoom[]> {
  const { data, error } = await supabase
    .from('draw_rooms')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []) as DrawRoom[];
}

/** Delete a draw room completely */
export async function deleteDrawRoom(roomId: string): Promise<void> {
  await supabase.from('draw_rooms').delete().eq('id', roomId);
}

/** Submit custom word for free mode (step 1) */
export async function submitFreeWord(stepId: string, word: string): Promise<void> {
  const { data } = await supabase.from('draw_steps').update({
    target_word: word,
  }).eq('id', stepId).select('chain_id').single();

  // Also update chain's original_word so voting/results show the real word
  if (data) {
    await supabase.from('draw_chains').update({
      original_word: word,
    }).eq('id', (data as { chain_id: string }).chain_id);
  }
}

/* ============ Helpers ============ */

export function normalizeGuess(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е');
}
