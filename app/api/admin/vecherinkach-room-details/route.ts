import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

const ROUND2_OFFSET = 200_000;
const ROUND3_OFFSET = 300_000;
const ROUND4_OFFSET = 400_000;
const ROUND5_OFFSET = 500_000;

function detectQuestionRound(qid: number): 1 | 2 | 3 | 4 | 5 {
  if (qid >= ROUND5_OFFSET) return 5;
  if (qid >= ROUND4_OFFSET) return 4;
  if (qid >= ROUND3_OFFSET) return 3;
  if (qid >= ROUND2_OFFSET) return 2;
  return 1;
}

export async function GET(request: Request) {
  const authErr = requireAdminBasicAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const roomId = url.searchParams.get('roomId');
  if (!roomId) return Response.json({ error: 'roomId required' }, { status: 400 });

  const supabase = getSupabaseAdminClient();

  // Room
  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (!room) return Response.json({ error: 'Room not found' }, { status: 404 });

  // Players
  const { data: players } = await supabase
    .from('players')
    .select('id, name, total_points, joined_at')
    .eq('room_id', roomId)
    .order('total_points', { ascending: false });
  const playerMap = new Map((players ?? []).map(p => [p.id, p.name]));

  // All answers in parallel
  const [r1, r2, r3a, r3v, r4, r5, likes, logs] = await Promise.all([
    supabase.from('answers').select('player_id, question_index, is_correct, points_earned, submitted_at').eq('room_id', roomId).order('question_index').limit(2000),
    supabase.from('round2_answers').select('player_id, item_index, answer_is_fact, is_correct, points_earned, submitted_at').eq('room_id', roomId).order('item_index').limit(1000),
    supabase.from('round3_answers').select('id, player_id, question_index, text, submitted_at').eq('room_id', roomId).order('question_index').limit(1000),
    supabase.from('round3_votes').select('voter_player_id, question_index, answer_id, submitted_at').eq('room_id', roomId).limit(1000),
    supabase.from('round4_answers').select('player_id, puzzle_id, answer_text, is_correct, correct_rank, points_earned, elapsed_ms, submitted_at').eq('room_id', roomId).order('puzzle_id').limit(1000),
    supabase.from('round5_answers').select('player_id, question_index, answer_value, points_earned, elapsed_ms, submitted_at').eq('room_id', roomId).order('question_index').limit(1000),
    supabase.from('question_likes').select('question_id, player_id').eq('room_id', roomId).limit(1000),
    supabase.from('logs').select('created_at, level, channel, message, event_name, context').eq('room_id', roomId).order('created_at', { ascending: false }).limit(100),
  ]);

  // Per-question stats for R1
  const r1ByQ = new Map<number, { total: number; correct: number; players: string[] }>();
  for (const a of r1.data ?? []) {
    const cur = r1ByQ.get(a.question_index) ?? { total: 0, correct: 0, players: [] };
    cur.total += 1;
    if (a.is_correct) cur.correct += 1;
    cur.players.push(playerMap.get(a.player_id) ?? a.player_id);
    r1ByQ.set(a.question_index, cur);
  }
  const r1Questions = Array.from(r1ByQ.entries())
    .map(([idx, s]) => ({ index: idx, total: s.total, correct: s.correct, correctRate: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => a.index - b.index);

  // R3 answers with vote counts
  const r3VoteCountsByAnswer = new Map<string, number>();
  for (const v of r3v.data ?? []) {
    r3VoteCountsByAnswer.set(v.answer_id, (r3VoteCountsByAnswer.get(v.answer_id) ?? 0) + 1);
  }
  const r3Answers = (r3a.data ?? []).map(a => ({
    ...a,
    playerName: playerMap.get(a.player_id) ?? '???',
    voteCount: r3VoteCountsByAnswer.get(a.id) ?? 0,
  }));

  // R4 summary
  const r4Summary = (r4.data ?? []).map(a => ({
    ...a,
    playerName: playerMap.get(a.player_id) ?? '???',
  }));

  // Likes per round
  const likesByRound: Record<number, number> = {};
  for (const l of likes.data ?? []) {
    const r = detectQuestionRound(l.question_id);
    likesByRound[r] = (likesByRound[r] ?? 0) + 1;
  }
  const topLikes = Array.from(
    (likes.data ?? []).reduce((m, l) => {
      m.set(l.question_id, (m.get(l.question_id) ?? 0) + 1);
      return m;
    }, new Map<number, number>())
  ).map(([qid, cnt]) => ({ questionId: qid, likes: cnt, round: detectQuestionRound(qid) }))
    .sort((a, b) => b.likes - a.likes);

  // Player leaderboard
  const leaderboard = (players ?? []).map(p => ({ ...p, name: p.name }));

  // Completion stats
  const playerCount = (players ?? []).length;
  const stats = {
    playerCount,
    r1Answers: r1.data?.length ?? 0,
    r2Answers: r2.data?.length ?? 0,
    r3Answers: r3a.data?.length ?? 0,
    r3Votes: r3v.data?.length ?? 0,
    r4Answers: r4.data?.length ?? 0,
    r5Answers: r5.data?.length ?? 0,
    totalLikes: likes.data?.length ?? 0,
    errorLogs: (logs.data ?? []).filter(l => l.level === 'error').length,
  };

  return Response.json({
    room,
    players: leaderboard,
    stats,
    r1Questions,
    r2Answers: (r2.data ?? []).map(a => ({ ...a, playerName: playerMap.get(a.player_id) ?? '???' })),
    r3Answers,
    r4Summary,
    r5Answers: (r5.data ?? []).map(a => ({ ...a, playerName: playerMap.get(a.player_id) ?? '???' })),
    topLikes,
    likesByRound,
    recentLogs: (logs.data ?? []).slice(0, 50),
  });
}
