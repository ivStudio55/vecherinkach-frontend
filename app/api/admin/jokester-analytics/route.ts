import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

/* ─── Helpers ─── */

function parseRange(url: URL) {
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

function isMissing(error: { code?: string; message?: string } | null) {
  const code = error?.code;
  const msg = error?.message ?? '';
  return code === '42P01' || /relation .* does not exist/i.test(msg);
}

type SeriesPoint = { label: string; value: number };

function createBuckets(startMs: number, endMs: number) {
  const rangeMs = endMs - startMs;
  const hour = 3600_000;
  const day = 24 * hour;
  const bucketMs = rangeMs <= 2 * day ? hour : rangeMs <= 14 * day ? 6 * hour : day;
  const labels: string[] = [];
  const buckets: Record<string, number> = {};
  for (let ts = startMs; ts < endMs; ts += bucketMs) {
    const lbl = new Date(ts).toISOString();
    labels.push(lbl);
    buckets[lbl] = 0;
  }
  const add = (timestamp: string | null) => {
    if (!timestamp) return;
    const ms = Date.parse(timestamp);
    if (!Number.isFinite(ms)) return;
    const bucketStart = Math.floor((ms - startMs) / bucketMs) * bucketMs + startMs;
    const lbl = new Date(bucketStart).toISOString();
    if (buckets[lbl] !== undefined) buckets[lbl] += 1;
  };
  const toSeries = (): SeriesPoint[] => labels.map(l => ({ label: l, value: buckets[l] }));
  return { add, toSeries };
}

/* ─── Main handler ─── */

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const range = parseRange(url);
  if (!range) {
    return Response.json({ error: 'Provide start and end ISO timestamps.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { startIso, endIso } = range;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);

  /* ── Rooms ── */
  const { data: rooms, error: roomsErr } = await supabase
    .from('jokester_rooms')
    .select('id, code, status, created_at, updated_at, current_round, host_id')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (roomsErr && !isMissing(roomsErr)) console.error('jokester_rooms', roomsErr);
  const roomRows = rooms ?? [];

  /* ── Players ── */
  const roomIds = roomRows.map(r => r.id);
  let playerRows: Array<{
    id: string; room_id: string; name: string; role: string; is_host: boolean;
    total_points: number; player_votes: number; spectator_votes: number; joined_at: string | null;
  }> = [];
  if (roomIds.length > 0) {
    const { data, error } = await supabase
      .from('jokester_players')
      .select('id, room_id, name, role, is_host, total_points, player_votes, spectator_votes, joined_at')
      .in('room_id', roomIds)
      .limit(10000);
    if (error && !isMissing(error)) console.error('jokester_players', error);
    playerRows = data ?? [];
  }

  /* ── Duels ── */
  let duelRows: Array<{
    id: string; room_id: string; round: number; duel_index: number;
    player1_id: string; player2_id: string; question1_text: string | null;
    question1_cat: string | null; question2_text: string | null; question2_cat: string | null;
    winner_id: string | null; status: string; created_at: string | null;
  }> = [];
  if (roomIds.length > 0) {
    const { data, error } = await supabase
      .from('jokester_duels')
      .select('id, room_id, round, duel_index, player1_id, player2_id, question1_text, question1_cat, question2_text, question2_cat, winner_id, status, created_at')
      .in('room_id', roomIds)
      .limit(20000);
    if (error && !isMissing(error)) console.error('jokester_duels', error);
    duelRows = data ?? [];
  }

  /* ── Answers ── */
  const duelIds = duelRows.map(d => d.id);
  let answerRows: Array<{
    id: string; duel_id: string; player_id: string; question_index: number;
    answer_text: string | null; submitted_at: string | null;
  }> = [];
  if (duelIds.length > 0) {
    const { data, error } = await supabase
      .from('jokester_answers')
      .select('id, duel_id, player_id, question_index, answer_text, submitted_at')
      .in('duel_id', duelIds)
      .limit(50000);
    if (error && !isMissing(error)) console.error('jokester_answers', error);
    answerRows = data ?? [];
  }

  /* ── Votes ── */
  let voteRows: Array<{
    id: string; duel_id: string; voter_id: string; question_index: number;
    voted_for_id: string; voter_role: string; created_at: string | null;
  }> = [];
  if (duelIds.length > 0) {
    const { data, error } = await supabase
      .from('jokester_votes')
      .select('id, duel_id, voter_id, question_index, voted_for_id, voter_role, created_at')
      .in('duel_id', duelIds)
      .limit(50000);
    if (error && !isMissing(error)) console.error('jokester_votes', error);
    voteRows = data ?? [];
  }

  /* ── Category Votes ── */
  let categoryVoteRows: Array<{
    id: string; room_id: string; round: number; voter_id: string; category: string;
  }> = [];
  if (roomIds.length > 0) {
    const { data, error } = await supabase
      .from('jokester_category_votes')
      .select('id, room_id, round, voter_id, category')
      .in('room_id', roomIds)
      .limit(20000);
    if (error && !isMissing(error)) console.error('jokester_category_votes', error);
    categoryVoteRows = data ?? [];
  }

  /* ══════════════ Compute analytics ══════════════ */

  // --- KPI totals ---
  const totalRooms = roomRows.length;
  const finishedRooms = roomRows.filter(r => r.status === 'finished' || r.status === 'credits').length;
  const activeRooms = roomRows.filter(r => r.status && !['finished', 'credits', 'lobby'].includes(r.status)).length;
  const lobbyAbandoned = roomRows.filter(r => r.status === 'lobby').length;

  const allPlayers = playerRows.filter(p => !p.is_host);
  const gamePlayers = allPlayers.filter(p => p.role === 'player');
  const spectators = allPlayers.filter(p => p.role === 'spectator');
  const uniqueNames = new Set(allPlayers.map(p => p.name.toLowerCase().trim()));

  const totalDuels = duelRows.length;
  const completedDuels = duelRows.filter(d => d.status === 'done').length;
  const totalAnswers = answerRows.length;
  const totalVotes = voteRows.length;

  // --- Finish rate ---
  const finishRate = totalRooms > 0 ? Math.round((finishedRooms / totalRooms) * 100) : 0;

  // --- Avg players per room ---
  const playersByRoom = new Map<string, number>();
  for (const p of gamePlayers) {
    playersByRoom.set(p.room_id, (playersByRoom.get(p.room_id) ?? 0) + 1);
  }
  const avgPlayersPerRoom = playersByRoom.size > 0
    ? +(Array.from(playersByRoom.values()).reduce((a, b) => a + b, 0) / playersByRoom.size).toFixed(1)
    : 0;

  // --- Avg spectators per room ---
  const spectatorsByRoom = new Map<string, number>();
  for (const s of spectators) {
    spectatorsByRoom.set(s.room_id, (spectatorsByRoom.get(s.room_id) ?? 0) + 1);
  }
  const avgSpectatorsPerRoom = spectatorsByRoom.size > 0
    ? +(Array.from(spectatorsByRoom.values()).reduce((a, b) => a + b, 0) / spectatorsByRoom.size).toFixed(1)
    : 0;

  // --- Rounds distribution ---
  const roundDistribution: Record<number, number> = {};
  for (const r of roomRows) {
    const round = r.current_round ?? 1;
    roundDistribution[round] = (roundDistribution[round] ?? 0) + 1;
  }

  // --- Room status distribution ---
  const statusDistribution: Record<string, number> = {};
  for (const r of roomRows) {
    const st = r.status ?? 'unknown';
    statusDistribution[st] = (statusDistribution[st] ?? 0) + 1;
  }

  // --- Category popularity ---
  const categoryPopularity: Record<string, number> = {};
  for (const cv of categoryVoteRows) {
    categoryPopularity[cv.category] = (categoryPopularity[cv.category] ?? 0) + 1;
  }
  const topCategories = Object.entries(categoryPopularity)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([category, votes]) => ({ category, votes }));

  // --- Question engagement (answers + votes per question text) ---
  const duelMap = new Map(duelRows.map(d => [d.id, d]));
  const questionStats = new Map<string, { question: string; category: string; answers: number; votes: number; duels: number }>();
  for (const d of duelRows) {
    for (const q of [{ text: d.question1_text, cat: d.question1_cat, idx: 0 }, { text: d.question2_text, cat: d.question2_cat, idx: 1 }]) {
      if (!q.text) continue;
      const key = q.text;
      if (!questionStats.has(key)) {
        questionStats.set(key, { question: q.text, category: q.cat ?? '', answers: 0, votes: 0, duels: 0 });
      }
      const qs = questionStats.get(key)!;
      qs.duels += 1;
      const duelAnswers = answerRows.filter(a => a.duel_id === d.id && a.question_index === q.idx);
      qs.answers += duelAnswers.length;
      const duelVotes = voteRows.filter(v => v.duel_id === d.id && v.question_index === q.idx);
      qs.votes += duelVotes.length;
    }
  }
  const topQuestions = Array.from(questionStats.values())
    .sort((a, b) => (b.votes + b.answers) - (a.votes + a.answers))
    .slice(0, 20);

  // --- Engagement: answer rate (what % of possible answers were submitted) ---
  const possibleAnswers = completedDuels * 2; // 2 players per duel, each answers
  const answerRate = possibleAnswers > 0 ? Math.round((totalAnswers / possibleAnswers) * 100) : 0;

  // --- Engagement: vote participation (votes / possible votes) ---
  const totalPossibleVoters = duelRows.reduce((acc, d) => {
    const roomPlayers = playersByRoom.get(d.room_id) ?? 0;
    const roomSpecs = spectatorsByRoom.get(d.room_id) ?? 0;
    return acc + (roomPlayers + roomSpecs - 2); // exclude the 2 duelists
  }, 0);
  const voteParticipation = totalPossibleVoters > 0 ? Math.round((totalVotes / totalPossibleVoters) * 100) : 0;

  // --- Player leaderboard ---
  const playerLeaderboard = gamePlayers
    .filter(p => p.total_points > 0)
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 20)
    .map(p => ({
      id: p.id,
      name: p.name,
      roomId: p.room_id,
      totalPoints: p.total_points,
      playerVotes: p.player_votes,
      spectatorVotes: p.spectator_votes,
    }));

  // --- Best answers (by votes received) ---
  const answerVoteCounts = new Map<string, number>();
  for (const v of voteRows) {
    const key = `${v.duel_id}:${v.question_index}:${v.voted_for_id}`;
    answerVoteCounts.set(key, (answerVoteCounts.get(key) ?? 0) + 1);
  }
  const bestAnswers = answerRows
    .map(a => {
      const key = `${a.duel_id}:${a.question_index}:${a.player_id}`;
      const votesReceived = answerVoteCounts.get(key) ?? 0;
      const duel = duelMap.get(a.duel_id);
      const questionText = duel
        ? (a.question_index === 0 ? duel.question1_text : duel.question2_text)
        : null;
      const player = playerRows.find(p => p.id === a.player_id);
      return {
        answerText: a.answer_text ?? '',
        questionText: questionText ?? '',
        playerName: player?.name ?? '???',
        votesReceived,
        duelId: a.duel_id,
      };
    })
    .filter(a => a.votesReceived > 0 && a.answerText.length > 0)
    .sort((a, b) => b.votesReceived - a.votesReceived)
    .slice(0, 20);

  // --- Voter type split ---
  const playerVotes = voteRows.filter(v => v.voter_role === 'player').length;
  const spectatorVotes = voteRows.filter(v => v.voter_role === 'spectator').length;

  // --- Time charts ---
  const roomTimeline = createBuckets(startMs, endMs);
  for (const r of roomRows) roomTimeline.add(r.created_at);

  const playerTimeline = createBuckets(startMs, endMs);
  for (const p of allPlayers) playerTimeline.add(p.joined_at);

  const duelTimeline = createBuckets(startMs, endMs);
  for (const d of duelRows) duelTimeline.add(d.created_at);

  // --- Game duration (for finished rooms) ---
  const durations: number[] = [];
  for (const r of roomRows) {
    if ((r.status === 'finished' || r.status === 'credits') && r.created_at && r.updated_at) {
      const durMin = (Date.parse(r.updated_at) - Date.parse(r.created_at)) / 60000;
      if (durMin > 0 && durMin < 300) durations.push(durMin);
    }
  }
  durations.sort((a, b) => a - b);
  const avgDuration = durations.length > 0 ? +(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) : 0;
  const medianDuration = durations.length > 0 ? +durations[Math.floor(durations.length / 2)].toFixed(1) : 0;

  // --- Max round reached distribution ---
  const maxRoundReached: Record<string, number> = {};
  for (const r of roomRows) {
    const label = `Раунд ${r.current_round ?? 1}`;
    maxRoundReached[label] = (maxRoundReached[label] ?? 0) + 1;
  }

  return Response.json({
    range: { start: startIso, end: endIso },
    rooms: {
      total: totalRooms,
      finished: finishedRooms,
      active: activeRooms,
      lobbyAbandoned,
      finishRate,
      avgDurationMin: avgDuration,
      medianDurationMin: medianDuration,
      statusDistribution,
      maxRoundReached,
    },
    players: {
      total: allPlayers.length,
      gamePlayers: gamePlayers.length,
      spectators: spectators.length,
      uniqueNames: uniqueNames.size,
      avgPlayersPerRoom,
      avgSpectatorsPerRoom,
    },
    duels: {
      total: totalDuels,
      completed: completedDuels,
    },
    engagement: {
      totalAnswers,
      totalVotes,
      answerRate,
      voteParticipation,
      playerVotes,
      spectatorVotes,
    },
    categories: {
      topCategories,
      totalCategoryVotes: categoryVoteRows.length,
    },
    topQuestions,
    bestAnswers,
    playerLeaderboard,
    charts: {
      roomsByTime: roomTimeline.toSeries(),
      playersByTime: playerTimeline.toSeries(),
      duelsByTime: duelTimeline.toSeries(),
    },
  });
}
