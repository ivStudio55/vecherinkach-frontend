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
  const { data: rooms } = await supabase
    .from('creativach_rooms')
    .select('id, code, status, created_at, updated_at, current_round, host_id')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(5000);
  const roomRows = rooms ?? [];
  const roomIds = roomRows.map(r => r.id);

  /* ── Players ── */
  let playerRows: Array<{
    id: string; room_id: string; name: string; role: string; is_host: boolean;
    total_points: number; joined_at: string | null;
  }> = [];
  if (roomIds.length > 0) {
    const { data } = await supabase
      .from('creativach_players')
      .select('id, room_id, name, role, is_host, total_points, joined_at')
      .in('room_id', roomIds)
      .limit(10000);
    playerRows = data ?? [];
  }

  /* ── Answers ── */
  let answerRows: Array<{ id: string; room_id: string; round: number; player_id: string; created_at: string | null }> = [];
  if (roomIds.length > 0) {
    const { data } = await supabase
      .from('creativach_answers')
      .select('id, room_id, round, player_id, created_at')
      .in('room_id', roomIds)
      .limit(20000);
    answerRows = data ?? [];
  }

  /* ── Votes ── */
  let voteRows: Array<{ id: string; room_id: string; round: number; voter_id: string; voter_role: string | null; created_at: string | null }> = [];
  if (roomIds.length > 0) {
    const { data } = await supabase
      .from('creativach_votes')
      .select('id, room_id, round, voter_id, voter_role, created_at')
      .in('room_id', roomIds)
      .limit(20000);
    voteRows = data ?? [];
  }

  /* ── Compute stats ── */
  const totalRooms = roomRows.length;
  const finished = roomRows.filter(r => r.status === 'finished').length;
  const active = roomRows.filter(r => r.status !== 'finished' && r.status !== 'lobby').length;
  const lobbyAbandoned = roomRows.filter(r => r.status === 'lobby').length;
  const finishRate = totalRooms > 0 ? Math.round((finished / totalRooms) * 100) : 0;

  // Duration
  const durations = roomRows
    .filter(r => r.status === 'finished' && r.created_at && r.updated_at)
    .map(r => (new Date(r.updated_at!).getTime() - new Date(r.created_at!).getTime()) / 60000);
  const avgDurationMin = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const medianDurationMin = durations.length > 0
    ? Math.round(durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)])
    : 0;

  // Status distribution
  const statusDistribution: Record<string, number> = {};
  for (const r of roomRows) {
    const s = r.status || 'unknown';
    statusDistribution[s] = (statusDistribution[s] || 0) + 1;
  }

  // Max round reached
  const maxRoundReached: Record<string, number> = {};
  for (const r of roomRows) {
    const key = `Раунд ${r.current_round ?? 0}`;
    maxRoundReached[key] = (maxRoundReached[key] || 0) + 1;
  }

  // Players
  const nonHostPlayers = playerRows.filter(p => !p.is_host);
  const gamePlayers = nonHostPlayers.filter(p => p.role === 'player');
  const spectators = nonHostPlayers.filter(p => p.role === 'spectator');
  const uniqueNames = new Set(nonHostPlayers.map(p => p.name)).size;
  const avgPlayersPerRoom = totalRooms > 0 ? Math.round((gamePlayers.length / totalRooms) * 10) / 10 : 0;
  const avgSpectatorsPerRoom = totalRooms > 0 ? Math.round((spectators.length / totalRooms) * 10) / 10 : 0;

  // Engagement
  const totalAnswers = answerRows.length;
  const totalVotes = voteRows.length;
  const playerVotes = voteRows.filter(v => v.voter_role === 'player').length;
  const spectatorVotes = voteRows.filter(v => v.voter_role === 'spectator').length;
  const expectedAnswers = gamePlayers.length * 5; // 5 rounds
  const answerRate = expectedAnswers > 0 ? Math.round((totalAnswers / expectedAnswers) * 100) : 0;
  const expectedVotes = nonHostPlayers.length * 5;
  const voteParticipation = expectedVotes > 0 ? Math.round((totalVotes / expectedVotes) * 100) : 0;

  // Leaderboard
  const playerLeaderboard = nonHostPlayers
    .filter(p => p.role === 'player')
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 20)
    .map(p => ({ id: p.id, name: p.name, roomId: p.room_id, totalPoints: p.total_points }));

  // Charts
  const roomsBuckets = createBuckets(startMs, endMs);
  const playersBuckets = createBuckets(startMs, endMs);
  const answersBuckets = createBuckets(startMs, endMs);
  for (const r of roomRows) roomsBuckets.add(r.created_at);
  for (const p of nonHostPlayers) playersBuckets.add(p.joined_at);
  for (const a of answerRows) answersBuckets.add(a.created_at);

  return Response.json({
    range: { start: startIso, end: endIso },
    rooms: {
      total: totalRooms, finished, active, lobbyAbandoned,
      finishRate, avgDurationMin, medianDurationMin,
      statusDistribution, maxRoundReached,
    },
    players: {
      total: nonHostPlayers.length, gamePlayers: gamePlayers.length,
      spectators: spectators.length, uniqueNames,
      avgPlayersPerRoom, avgSpectatorsPerRoom,
    },
    engagement: {
      totalAnswers, totalVotes, answerRate, voteParticipation,
      playerVotes, spectatorVotes,
    },
    playerLeaderboard,
    charts: {
      roomsByTime: roomsBuckets.toSeries(),
      playersByTime: playersBuckets.toSeries(),
      answersByTime: answersBuckets.toSeries(),
    },
  });
}
