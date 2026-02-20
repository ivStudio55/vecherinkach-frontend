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

function isMissing(err: { code?: string; message?: string } | null) {
  return err?.code === '42P01' || /relation .* does not exist/i.test(err?.message ?? '');
}

type SeriesPoint = { label: string; value: number };

function createBuckets(startMs: number, endMs: number) {
  const rangeMs = endMs - startMs;
  const hour = 3_600_000;
  const day = 24 * hour;
  const bucketMs = rangeMs <= 2 * day ? hour : rangeMs <= 14 * day ? 6 * hour : day;
  const labels: string[] = [];
  const buckets: Record<string, number> = {};
  for (let ts = startMs; ts < endMs; ts += bucketMs) {
    const l = new Date(ts).toISOString();
    labels.push(l);
    buckets[l] = 0;
  }
  const add = (ts: string | null) => {
    if (!ts) return;
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) return;
    const bucketStart = Math.floor((ms - startMs) / bucketMs) * bucketMs + startMs;
    const l = new Date(bucketStart).toISOString();
    if (buckets[l] !== undefined) buckets[l] += 1;
  };
  const toSeries = (): SeriesPoint[] => labels.map(l => ({ label: l, value: buckets[l] }));
  return { add, toSeries };
}

const ROUND2_OFFSET = 200_000;
const ROUND3_OFFSET = 300_000;
const ROUND4_OFFSET = 400_000;
const ROUND5_OFFSET = 500_000;

function detectQuestionRound(questionId: number): 1 | 2 | 3 | 4 | 5 {
  if (questionId >= ROUND5_OFFSET) return 5;
  if (questionId >= ROUND4_OFFSET) return 4;
  if (questionId >= ROUND3_OFFSET) return 3;
  if (questionId >= ROUND2_OFFSET) return 2;
  return 1;
}

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Ожидание',
  running: 'Раунд 1',
  'round2-ready': 'Раунд 2 готов',
  'round2-running': 'Раунд 2',
  'round3-running': 'Раунд 3',
  'round4-running': 'Раунд 4',
  'round5-running': 'Раунд 5',
  'round5-explanation': 'Раунд 5 пояснение',
  'final-results': 'Финал',
  finished: 'Завершена',
};

/* ─── Main handler ─── */

export async function GET(request: Request) {
  const authErr = requireAdminBasicAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const range = parseRange(url);
  if (!range) return Response.json({ error: 'Provide start and end ISO timestamps.' }, { status: 400 });

  const packFilter = url.searchParams.get('pack_id') || '';
  const supabase = getSupabaseAdminClient();
  const { startIso, endIso } = range;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);

  /* ══ 1. Rooms ══ */
  let roomsQuery = supabase
    .from('rooms')
    .select('id, code, status, is_active, created_at, pack_id, selected_question_ids, current_question_index, round2_item_index')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (packFilter) roomsQuery = roomsQuery.eq('pack_id', packFilter);
  const { data: rooms, error: roomsErr } = await roomsQuery;
  if (roomsErr && !isMissing(roomsErr)) console.error('rooms', roomsErr);
  const roomRows = rooms ?? [];
  const roomIds = roomRows.map(r => r.id);

  /* ══ 2. Players ══ */
  let playerRows: Array<{ id: string; room_id: string; name: string; total_points: number; joined_at: string | null }> = [];
  if (roomIds.length > 0) {
    const { data, error } = await supabase
      .from('players')
      .select('id, room_id, name, total_points, joined_at')
      .in('room_id', roomIds)
      .limit(10_000);
    if (error && !isMissing(error)) console.error('players', error);
    playerRows = data ?? [];
  }

  /* ══ 3. Round 1 answers ══ */
  let r1Rows: Array<{ room_id: string; player_id: string; question_index: number; is_correct: boolean; points_earned: number }> = [];
  if (roomIds.length > 0) {
    const { data, error } = await supabase
      .from('answers')
      .select('room_id, player_id, question_index, is_correct, points_earned')
      .in('room_id', roomIds)
      .limit(50_000);
    if (error && !isMissing(error)) console.error('answers', error);
    r1Rows = data ?? [];
  }

  /* ══ 4. Round 2 answers ══ */
  let r2Rows: Array<{ room_id: string; player_id: string; item_index: number; is_correct: boolean; points_earned: number }> = [];
  if (roomIds.length > 0) {
    const { data, error } = await supabase
      .from('round2_answers')
      .select('room_id, player_id, item_index, is_correct, points_earned')
      .in('room_id', roomIds)
      .limit(20_000);
    if (error && !isMissing(error)) console.error('round2_answers', error);
    r2Rows = data ?? [];
  }

  /* ══ 5. Round 3 answers + votes ══ */
  let r3AnswerRows: Array<{ room_id: string; player_id: string; question_index: number }> = [];
  let r3VoteRows: Array<{ room_id: string; voter_player_id: string; question_index: number; answer_id: string }> = [];
  if (roomIds.length > 0) {
    const [r3a, r3v] = await Promise.all([
      supabase.from('round3_answers').select('room_id, player_id, question_index').in('room_id', roomIds).limit(20_000),
      supabase.from('round3_votes').select('room_id, voter_player_id, question_index, answer_id').in('room_id', roomIds).limit(20_000),
    ]);
    if (r3a.error && !isMissing(r3a.error)) console.error('round3_answers', r3a.error);
    if (r3v.error && !isMissing(r3v.error)) console.error('round3_votes', r3v.error);
    r3AnswerRows = r3a.data ?? [];
    r3VoteRows = r3v.data ?? [];
  }

  /* ══ 6. Round 4 answers ══ */
  let r4Rows: Array<{ room_id: string; player_id: string; puzzle_id: number; is_correct: boolean; correct_rank: number | null; points_earned: number; elapsed_ms: number | null }> = [];
  if (roomIds.length > 0) {
    const { data, error } = await supabase
      .from('round4_answers')
      .select('room_id, player_id, puzzle_id, is_correct, correct_rank, points_earned, elapsed_ms')
      .in('room_id', roomIds)
      .limit(20_000);
    if (error && !isMissing(error)) console.error('round4_answers', error);
    r4Rows = data ?? [];
  }

  /* ══ 7. Round 5 answers ══ */
  let r5Rows: Array<{ room_id: string; player_id: string; question_index: number; answer_value: number; points_earned: number; elapsed_ms: number | null }> = [];
  if (roomIds.length > 0) {
    const { data, error } = await supabase
      .from('round5_answers')
      .select('room_id, player_id, question_index, answer_value, points_earned, elapsed_ms')
      .in('room_id', roomIds)
      .limit(20_000);
    if (error && !isMissing(error)) console.error('round5_answers', error);
    r5Rows = data ?? [];
  }

  /* ══ 8. Question likes ══ */
  let likesRows: Array<{ room_id: string; question_id: number; player_id: string }> = [];
  if (roomIds.length > 0) {
    const { data, error } = await supabase
      .from('question_likes')
      .select('room_id, question_id, player_id')
      .in('room_id', roomIds)
      .limit(50_000);
    if (error && !isMissing(error)) console.error('question_likes', error);
    likesRows = data ?? [];
  }

  /* ══ 9. Logs for event-based metrics ══ */
  const { data: logData, error: logErr } = await supabase
    .from('logs')
    .select('event_name, room_id, player_id, level, created_at, context')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .in('event_name', ['player_join', 'player_exit', 'round_start', 'room_status_change', 'realtime_reconnect', 'realtime_latency'])
    .limit(20_000);
  if (logErr && !isMissing(logErr)) console.error('logs', logErr);
  const logRows = logData ?? [];

  /* ══════════════ Compute ══════════════ */

  // --- Room KPIs ---
  const finishedRooms = roomRows.filter(r => r.status === 'finished').length;
  const finalResultsRooms = roomRows.filter(r => r.status === 'final-results').length;
  const completedRooms = finishedRooms + finalResultsRooms;
  const activeRooms = roomRows.filter(r => r.is_active && r.status !== 'finished').length;
  const finishRate = roomRows.length > 0 ? Math.round((completedRooms / roomRows.length) * 100) : 0;

  // Status distribution
  const statusDistribution: Record<string, number> = {};
  for (const r of roomRows) {
    const s = r.status ?? 'unknown';
    statusDistribution[s] = (statusDistribution[s] ?? 0) + 1;
  }

  // Pack distribution
  const packDistribution: Record<string, number> = {};
  for (const r of roomRows) {
    const p = r.pack_id ?? 'classic';
    packDistribution[p] = (packDistribution[p] ?? 0) + 1;
  }

  // Max round reached per room (inferred from status)
  const roundReached: Record<string, number> = {};
  const statusToRound: Record<string, number> = {
    waiting: 0, running: 1, 'round2-ready': 1, 'round2-running': 2,
    'round3-running': 3, 'round4-running': 4, 'round5-running': 5,
    'round5-explanation': 5, 'final-results': 5, finished: 5,
  };
  for (const r of roomRows) {
    const round = statusToRound[r.status ?? ''] ?? 0;
    const label = round === 0 ? 'Не начата' : `До Раунда ${round}`;
    roundReached[label] = (roundReached[label] ?? 0) + 1;
  }

  // --- Player KPIs ---
  const byRoom = new Map<string, typeof playerRows>();
  for (const p of playerRows) {
    const arr = byRoom.get(p.room_id) ?? [];
    arr.push(p);
    byRoom.set(p.room_id, arr);
  }
  const roomPlayerCounts = Array.from(byRoom.values()).map(ps => ps.length);
  const avgPlayersPerRoom = roomPlayerCounts.length > 0
    ? +(roomPlayerCounts.reduce((a, b) => a + b, 0) / roomPlayerCounts.length).toFixed(1)
    : 0;
  const uniqueNames = new Set(playerRows.map(p => p.name.toLowerCase().trim()));

  // --- Retention funnel (how many rooms reached each round) ---
  const hasR1 = new Set(r1Rows.map(a => a.room_id));
  const hasR2 = new Set(r2Rows.map(a => a.room_id));
  const hasR3 = new Set(r3AnswerRows.map(a => a.room_id));
  const hasR4 = new Set(r4Rows.map(a => a.room_id));
  const hasR5 = new Set(r5Rows.map(a => a.room_id));
  const retention = {
    started: roomRows.length,
    round1: hasR1.size,
    round2: hasR2.size,
    round3: hasR3.size,
    round4: hasR4.size,
    round5: hasR5.size,
    finished: completedRooms,
  };

  // --- Answer rate per round ---
  const r1AnswerRate = (hasR1.size > 0 && playerRows.length > 0)
    ? Math.round((r1Rows.length / (playerRows.length * 10)) * 100) : 0; // 10 Q per game avg
  const r2AnswerRate = r2Rows.length > 0 && r2Rows.length > 0
    ? Math.round((r2Rows.filter(r => r.is_correct).length / r2Rows.length) * 100) : 0;
  const r4CorrectRate = r4Rows.length > 0
    ? Math.round((r4Rows.filter(r => r.is_correct).length / r4Rows.length) * 100) : 0;

  // --- Round 1: per question stats ---
  const r1ByQ = new Map<number, { total: number; correct: number }>();
  for (const a of r1Rows) {
    const cur = r1ByQ.get(a.question_index) ?? { total: 0, correct: 0 };
    cur.total += 1;
    if (a.is_correct) cur.correct += 1;
    r1ByQ.set(a.question_index, cur);
  }
  const r1Questions = Array.from(r1ByQ.entries())
    .map(([idx, s]) => ({ index: idx, total: s.total, correct: s.correct, correctRate: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);
  const hardestR1 = [...r1Questions].sort((a, b) => a.correctRate - b.correctRate).slice(0, 10);
  const easiestR1 = [...r1Questions].sort((a, b) => b.correctRate - a.correctRate).slice(0, 10);

  // --- Round 4: fastest correct answers ---
  const r4Puzzles = new Map<number, { total: number; correct: number; firstSolves: number; avgElapsedMs: number | null }>();
  for (const a of r4Rows) {
    const cur = r4Puzzles.get(a.puzzle_id) ?? { total: 0, correct: 0, firstSolves: 0, avgElapsedMs: null };
    cur.total += 1;
    if (a.is_correct) cur.correct += 1;
    if (a.correct_rank === 1) cur.firstSolves += 1;
    r4Puzzles.set(a.puzzle_id, cur);
  }
  const r4Stats = Array.from(r4Puzzles.entries())
    .map(([puzzleId, s]) => ({ puzzleId, ...s, correctRate: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // --- Round 5: guess accuracy ---
  const r5ByQ = new Map<number, { total: number; sumPoints: number; maxPoints: number }>();
  for (const a of r5Rows) {
    const cur = r5ByQ.get(a.question_index) ?? { total: 0, sumPoints: 0, maxPoints: 0 };
    cur.total += 1;
    cur.sumPoints += a.points_earned;
    if (a.points_earned > cur.maxPoints) cur.maxPoints = a.points_earned;
    r5ByQ.set(a.question_index, cur);
  }
  const r5Stats = Array.from(r5ByQ.entries())
    .map(([idx, s]) => ({ index: idx, total: s.total, avgPoints: s.total > 0 ? Math.round(s.sumPoints / s.total) : 0, maxPoints: s.maxPoints }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // --- Likes: top liked questions ----
  const likesByQ = new Map<number, number>();
  for (const l of likesRows) likesByQ.set(l.question_id, (likesByQ.get(l.question_id) ?? 0) + 1);
  const topLiked = Array.from(likesByQ.entries())
    .map(([qid, likes]) => ({ questionId: qid, likes, round: detectQuestionRound(qid) }))
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 20);
  const likesByRound: Record<number, number> = {};
  for (const [qid, cnt] of likesByQ.entries()) {
    const r = detectQuestionRound(qid);
    likesByRound[r] = (likesByRound[r] ?? 0) + cnt;
  }

  // --- Round 3 engagement ---
  const r3VoteParticipation = (r3AnswerRows.length > 0)
    ? Math.round((r3VoteRows.length / r3AnswerRows.length) * 100) : 0;

  // --- Player leaderboard ---
  const topPlayers = playerRows
    .filter(p => p.total_points > 0)
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 20)
    .map(p => ({ id: p.id, name: p.name, roomId: p.room_id, totalPoints: p.total_points }));

  // --- Time charts ---
  const roomTimeline = createBuckets(startMs, endMs);
  for (const r of roomRows) roomTimeline.add(r.created_at);

  const playerTimeline = createBuckets(startMs, endMs);
  for (const p of playerRows) playerTimeline.add(p.joined_at);

  const r1Timeline = createBuckets(startMs, endMs);
  for (const row of logRows) {
    if (row.event_name === 'round_start') r1Timeline.add(row.created_at);
  }

  // Retention funnel by round (log events)
  const r2StartTimeline = createBuckets(startMs, endMs);
  for (const row of logRows) {
    if (row.event_name === 'room_status_change') {
      const to = (row.context as Record<string, unknown>)?.to;
      if (to === 'round2-running') r2StartTimeline.add(row.created_at);
    }
  }

  // --- Engagement score (composite) ---
  const answersTotal = r1Rows.length + r2Rows.length + r3AnswerRows.length + r4Rows.length + r5Rows.length;
  const pointsTotal = playerRows.reduce((s, p) => s + p.total_points, 0);

  return Response.json({
    range: { start: startIso, end: endIso },
    rooms: {
      total: roomRows.length,
      completed: completedRooms,
      active: activeRooms,
      finishRate,
      statusDistribution,
      packDistribution,
      roundReached,
    },
    players: {
      total: playerRows.length,
      uniqueNames: uniqueNames.size,
      avgPlayersPerRoom,
      topPlayers,
      pointsTotal,
    },
    retention,
    engagement: {
      answersTotal,
      likesTotal: likesRows.length,
      r1AnswerRate,
      r2CorrectRate: r2AnswerRate,
      r4CorrectRate,
      r3VoteParticipation,
    },
    questionAnalytics: {
      r1Questions,
      hardestR1,
      easiestR1,
      r4Stats,
      r5Stats,
      topLiked,
      likesByRound,
    },
    charts: {
      roomsByTime: roomTimeline.toSeries(),
      playersByTime: playerTimeline.toSeries(),
      roundsStartedByTime: r1Timeline.toSeries(),
      round2ByTime: r2StartTimeline.toSeries(),
    },
  });
}
