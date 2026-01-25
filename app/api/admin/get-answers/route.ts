import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

type PostgrestErrorLike = { message?: string; code?: string } | null;

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isMissingTableError(error: PostgrestErrorLike) {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return code === '42P01' || /relation .* does not exist/i.test(message);
}

function isMissingColumnError(error: PostgrestErrorLike) {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return code === '42703' || /column .* does not exist/i.test(message);
}

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const roomId = url.searchParams.get('roomId');
  if (!roomId) {
    return Response.json({ error: 'roomId is required' }, { status: 400 });
  }
  if (!uuidRegex.test(roomId)) {
    return Response.json({ error: 'Invalid roomId' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  const countMaybe = async (table: string) => {
    const res = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('room_id', roomId);
    if (res.error && isMissingTableError(res.error as PostgrestErrorLike)) return 0;
    if (res.error) throw res.error;
    return res.count ?? 0;
  };

  const loadRowsMaybe = async <T,>(table: string, columns: string, limit: number) => {
    const res = await supabase.from(table).select(columns).eq('room_id', roomId).limit(limit);
    if (res.error && isMissingTableError(res.error as PostgrestErrorLike)) return [] as T[];
    if (res.error) throw res.error;
    return (res.data ?? []) as T[];
  };

  try {
    const [
      answersCount,
      round2Count,
      round3AnswersCount,
      round3VotesCount,
      round4Count,
      round5Count,
      likesCount,
      logsCount,
    ] = await Promise.all([
      countMaybe('answers'),
      countMaybe('round2_answers'),
      countMaybe('round3_answers'),
      countMaybe('round3_votes'),
      countMaybe('round4_answers'),
      countMaybe('round5_answers'),
      countMaybe('question_likes'),
      countMaybe('logs'),
    ]);

    const [
      answerRows,
      round2Rows,
      round3AnswerRows,
      round3VoteRows,
      round4Rows,
      round5Rows,
      likeRows,
      errorLogs,
    ] = await Promise.all([
      loadRowsMaybe<{ question_index: number; is_correct: boolean }>('answers', 'question_index, is_correct', 10000),
      loadRowsMaybe<{ item_index: number; answer_is_fact: boolean; is_correct: boolean }>('round2_answers', 'item_index, answer_is_fact, is_correct', 10000),
      loadRowsMaybe<{ question_index: number }>('round3_answers', 'question_index', 10000),
      loadRowsMaybe<{ question_index: number }>('round3_votes', 'question_index', 10000),
      loadRowsMaybe<{ puzzle_id: number; is_correct: boolean }>('round4_answers', 'puzzle_id, is_correct', 10000),
      loadRowsMaybe<{ question_index: number }>('round5_answers', 'question_index', 10000),
      loadRowsMaybe<{ question_id: number }>('question_likes', 'question_id', 10000),
      (async () => {
        const loadLogs = async (withPlayerName: boolean) =>
          supabase
            .from('logs')
            .select(
              withPlayerName
                ? 'id, created_at, level, channel, event_name, message, player_id, player_name, context'
                : 'id, created_at, level, channel, event_name, message, player_id, context'
            )
            .eq('room_id', roomId)
            .in('level', ['error', 'warn'])
            .order('created_at', { ascending: false })
            .limit(50);

        const initial = await loadLogs(true);
        if (initial.error && isMissingTableError(initial.error as PostgrestErrorLike)) return [];
        if (initial.error && isMissingColumnError(initial.error as PostgrestErrorLike)) {
          const fallback = await loadLogs(false);
          if (fallback.error) throw fallback.error;
          return fallback.data ?? [];
        }
        if (initial.error) throw initial.error;
        return initial.data ?? [];
      })(),
    ]);

    const aggregateByNumberKey = (rows: Array<Record<string, unknown>>, key: string, correctKey?: string) => {
      const map = new Map<number, { total: number; correct: number }>();
      for (const row of rows) {
        const id = Number(row[key]);
        if (!Number.isFinite(id)) continue;
        const current = map.get(id) ?? { total: 0, correct: 0 };
        current.total += 1;
        if (correctKey && Boolean(row[correctKey])) current.correct += 1;
        map.set(id, current);
      }
      return Array.from(map.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([id, v]) => ({ id, ...v }));
    };

    const round1ByQuestion = aggregateByNumberKey(answerRows as Array<Record<string, unknown>>, 'question_index', 'is_correct');
    const round2ByItem = aggregateByNumberKey(round2Rows as Array<Record<string, unknown>>, 'item_index', 'is_correct');
    const round3AnswersByQuestion = aggregateByNumberKey(round3AnswerRows as Array<Record<string, unknown>>, 'question_index');
    const round3VotesByQuestion = aggregateByNumberKey(round3VoteRows as Array<Record<string, unknown>>, 'question_index');
    const round4ByPuzzle = aggregateByNumberKey(round4Rows as Array<Record<string, unknown>>, 'puzzle_id', 'is_correct');
    const round5ByQuestion = aggregateByNumberKey(round5Rows as Array<Record<string, unknown>>, 'question_index');

    const likesMap = new Map<number, number>();
    for (const row of likeRows) {
      const qid = Number(row.question_id);
      if (!Number.isFinite(qid)) continue;
      likesMap.set(qid, (likesMap.get(qid) ?? 0) + 1);
    }
    const topLikes = Array.from(likesMap.entries())
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 10)
      .map(([questionId, likes]) => ({ questionId, likes }));

    return Response.json({
      counts: {
        answers: answersCount,
        round2Answers: round2Count,
        round3Answers: round3AnswersCount,
        round3Votes: round3VotesCount,
        round4Answers: round4Count,
        round5Answers: round5Count,
        likes: likesCount,
        logs: logsCount,
      },
      topLikes,
      breakdowns: {
        round1: round1ByQuestion,
        round2: round2ByItem,
        round3Answers: round3AnswersByQuestion,
        round3Votes: round3VotesByQuestion,
        round4: round4ByPuzzle,
        round5: round5ByQuestion,
      },
      errorLogs,
    });
  } catch (e: unknown) {
    const message = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Failed to load answers';
    return Response.json({ error: message }, { status: 500 });
  }
}
