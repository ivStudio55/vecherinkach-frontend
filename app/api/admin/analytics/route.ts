import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

const ROUND2_LIKE_OFFSET = 200000;
const ROUND3_LIKE_OFFSET = 300000;
const ROUND4_LIKE_OFFSET = 400000;
const ROUND5_LIKE_OFFSET = 500000;

function detectQuestionRound(questionId: number): 1 | 2 | 3 | 4 | 5 {
  if (questionId >= ROUND5_LIKE_OFFSET) return 5;
  if (questionId >= ROUND4_LIKE_OFFSET) return 4;
  if (questionId >= ROUND3_LIKE_OFFSET) return 3;
  if (questionId >= ROUND2_LIKE_OFFSET) return 2;
  return 1;
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  const code = error?.code;
  const message = error?.message ?? '';
  return code === '42P01' || /relation .* does not exist/i.test(message);
}

function parseRange(url: URL) {
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!start || !end) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

function parseFilters(url: URL) {
  return {
    roomId: url.searchParams.get('room_id') || url.searchParams.get('roomId'),
    playerId: url.searchParams.get('player_id') || url.searchParams.get('playerId'),
    eventName: url.searchParams.get('event_name') || url.searchParams.get('eventName'),
  };
}

function pickBucketMs(rangeMs: number) {
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (rangeMs <= 2 * day) return hour;
  if (rangeMs <= 14 * day) return 6 * hour;
  return day;
}

function createBucketSeries(startMs: number, endMs: number, bucketMs: number) {
  const buckets: Record<string, number> = {};
  const labels: string[] = [];
  for (let ts = startMs; ts < endMs; ts += bucketMs) {
    const label = new Date(ts).toISOString();
    labels.push(label);
    buckets[label] = 0;
  }
  const add = (timestamp: string | null) => {
    if (!timestamp) return;
    const ms = Date.parse(timestamp);
    if (!Number.isFinite(ms)) return;
    const bucketStart = Math.floor((ms - startMs) / bucketMs) * bucketMs + startMs;
    const label = new Date(bucketStart).toISOString();
    if (buckets[label] === undefined) return;
    buckets[label] += 1;
  };
  return { labels, buckets, add };
}

type LogRow = {
  event_name: string | null;
  player_id: string | null;
  room_id: string | null;
  session_id: string | null;
  level: string | null;
  channel: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
};

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const range = parseRange(url);
  const filters = parseFilters(url);
  if (!range) {
    return Response.json({ error: 'Invalid range. Provide start and end as ISO strings.' }, { status: 400 });
  }

  const startMs = Date.parse(range.startIso);
  const endMs = Date.parse(range.endIso);
  const bucketMs = pickBucketMs(endMs - startMs);
  const bucketLabels = createBucketSeries(startMs, endMs, bucketMs);
  const roomBuckets = createBucketSeries(startMs, endMs, bucketMs);
  const joinBuckets = createBucketSeries(startMs, endMs, bucketMs);
  const exitBuckets = createBucketSeries(startMs, endMs, bucketMs);
  const roundFinishBuckets = createBucketSeries(startMs, endMs, bucketMs);
  const realtimeErrorBuckets = createBucketSeries(startMs, endMs, bucketMs);
  const latencyBuckets: Record<string, { total: number; count: number }> = Object.fromEntries(
    bucketLabels.labels.map((label) => [label, { total: 0, count: 0 }])
  );

  const supabase = getSupabaseAdminClient();

  let logsQuery = supabase
    .from('logs')
    .select('event_name, player_id, room_id, session_id, level, channel, context, created_at')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso);

  if (filters.roomId) logsQuery = logsQuery.eq('room_id', filters.roomId);
  if (filters.playerId) logsQuery = logsQuery.eq('player_id', filters.playerId);
  if (filters.eventName) logsQuery = logsQuery.eq('event_name', filters.eventName);

  const { data, error } = await logsQuery.limit(10000);

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to load analytics' }, { status: 500 });
  }

  const rows = (data ?? []) as LogRow[];
  const uniquePlayers = new Set<string>();
  let roundsStarted = 0;
  const finishedRooms = new Set<string>();
  const exitByStatus: Record<string, number> = {};
  const exitByReason: Record<string, number> = {};
  let reconnectCount = 0;
  let fallbackCount = 0;
  const latencyValues: number[] = [];
  const errorByEvent: Record<string, number> = {};
  const errorByChannel: Record<string, number> = {};
  let errorTotal = 0;
  let errorCritical = 0;
  const sessionJoins = new Map<string, Array<{ at: number; roomId: string | null }>>();
  const sessionActivities = new Map<string, number[]>();

  rows.forEach((row) => {
    if (row.event_name === 'player_join' && row.player_id) {
      uniquePlayers.add(row.player_id);
      joinBuckets.add(row.created_at);
    }

    const sessionId = row.session_id ?? null;
    const createdAtMs = Date.parse(row.created_at);
    if (sessionId && Number.isFinite(createdAtMs)) {
      const events = sessionActivities.get(sessionId) ?? [];
      events.push(createdAtMs);
      sessionActivities.set(sessionId, events);

      if (row.event_name === 'player_join') {
        const joins = sessionJoins.get(sessionId) ?? [];
        joins.push({ at: createdAtMs, roomId: row.room_id ?? null });
        sessionJoins.set(sessionId, joins);
      }
    }

    if (row.level === 'error' || row.level === 'warn') {
      const eventKey = row.event_name ?? 'unknown_event';
      const channelKey = row.channel ?? 'unknown_channel';
      errorByEvent[eventKey] = (errorByEvent[eventKey] ?? 0) + 1;
      errorByChannel[channelKey] = (errorByChannel[channelKey] ?? 0) + 1;
      errorTotal += 1;
      if (row.level === 'error') errorCritical += 1;
    }
    if (row.event_name === 'round_start') {
      roundsStarted += 1;
    }
    if (row.event_name === 'player_exit') {
      const status = typeof row.context?.status === 'string' ? row.context.status : 'unknown';
      const reason = typeof row.context?.reason === 'string' ? row.context.reason : 'unknown';
      exitByStatus[status] = (exitByStatus[status] ?? 0) + 1;
      exitByReason[reason] = (exitByReason[reason] ?? 0) + 1;
      exitBuckets.add(row.created_at);
    }
    if (row.event_name === 'room_status_change') {
      const nextStatus = typeof row.context?.to === 'string' ? row.context.to : null;
      if (nextStatus === 'finished' || nextStatus === 'final-results') {
        if (row.room_id) {
          finishedRooms.add(row.room_id);
        }
        roundFinishBuckets.add(row.created_at);
      }
    }
    if (row.event_name === 'realtime_reconnect') {
      reconnectCount += 1;
      realtimeErrorBuckets.add(row.created_at);
    }
    if (row.event_name === 'realtime_fallback') {
      fallbackCount += 1;
      realtimeErrorBuckets.add(row.created_at);
    }
    if (row.event_name === 'realtime_latency') {
      const latency = typeof row.context?.latencyMs === 'number' ? row.context.latencyMs : null;
      if (typeof latency === 'number') {
        latencyValues.push(latency);
        const bucketStart = Math.floor((Date.parse(row.created_at) - startMs) / bucketMs) * bucketMs + startMs;
        const label = new Date(bucketStart).toISOString();
        if (latencyBuckets[label]) {
          latencyBuckets[label].total += latency;
          latencyBuckets[label].count += 1;
        }
      }
    }
  });

  const latencySorted = [...latencyValues].sort((a, b) => a - b);
  const latencyAvg = latencyValues.length ? Math.round(latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length) : null;
  const latencyP95 = latencySorted.length
    ? latencySorted[Math.floor(latencySorted.length * 0.95)]
    : null;

  const latencySeries = bucketLabels.labels.map((label) => {
    const bucket = latencyBuckets[label];
    const avg = bucket && bucket.count ? Math.round(bucket.total / bucket.count) : 0;
    return { label, value: avg };
  });

  const { data: roomRows } = await supabase
    .from('rooms')
    .select('created_at, updated_at, status')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .limit(10000);

  (roomRows ?? []).forEach((row) => {
    const createdAt = (row as { created_at?: string | null }).created_at ?? null;
    roomBuckets.add(createdAt);
  });

  const finishedRoomDurations: number[] = [];
  (roomRows ?? []).forEach((row) => {
    const room = row as { created_at?: string | null; updated_at?: string | null; status?: string | null };
    if (room.status !== 'finished') return;
    const start = room.created_at ? Date.parse(room.created_at) : NaN;
    const end = room.updated_at ? Date.parse(room.updated_at) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    finishedRoomDurations.push((end - start) / 60000);
  });

  const sessionDurations: number[] = [];
  let returningSessions = 0;
  let marathonSessions = 0;
  let consecutiveSessions = 0;
  let totalGamesInSessions = 0;

  sessionJoins.forEach((joins, sessionId) => {
    if (!joins.length) return;
    const sorted = [...joins].sort((a, b) => a.at - b.at);
    const uniqueRooms = new Set(sorted.map((entry) => entry.roomId).filter(Boolean));
    if (uniqueRooms.size >= 2) returningSessions += 1;
    if (sorted.length >= 3) marathonSessions += 1;
    totalGamesInSessions += sorted.length;

    let hasConsecutiveGap = false;
    for (let i = 1; i < sorted.length; i += 1) {
      const gapMs = sorted[i].at - sorted[i - 1].at;
      if (gapMs >= 0 && gapMs <= 20 * 60 * 1000) {
        hasConsecutiveGap = true;
        break;
      }
    }
    if (hasConsecutiveGap) consecutiveSessions += 1;

    const activity = (sessionActivities.get(sessionId) ?? []).sort((a, b) => a - b);
    if (activity.length >= 2) {
      const minutes = (activity[activity.length - 1] - activity[0]) / 60000;
      if (Number.isFinite(minutes) && minutes >= 0) sessionDurations.push(minutes);
    }
  });

  const sortedSessionDurations = [...sessionDurations].sort((a, b) => a - b);
  const avgSessionMinutes = sessionDurations.length
    ? Math.round((sessionDurations.reduce((sum, value) => sum + value, 0) / sessionDurations.length) * 10) / 10
    : 0;
  const medianSessionMinutes = sortedSessionDurations.length
    ? Math.round(sortedSessionDurations[Math.floor(sortedSessionDurations.length / 2)] * 10) / 10
    : 0;
  const avgGamesPerSession = sessionJoins.size
    ? Math.round((totalGamesInSessions / sessionJoins.size) * 100) / 100
    : 0;
  const avgFinishedRoomDurationMinutes = finishedRoomDurations.length
    ? Math.round((finishedRoomDurations.reduce((sum, value) => sum + value, 0) / finishedRoomDurations.length) * 10) / 10
    : 0;
  const topErrorEvents = Object.entries(errorByEvent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([event, count]) => ({ event, count }));

  const roomsActive = await supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('is_active', true);
  const playersActive = await supabase
    .from('players')
    .select('id, rooms!inner(is_active)', { count: 'exact', head: true })
    .eq('rooms.is_active', true);

  const playersJoined = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .gte('joined_at', range.startIso)
    .lt('joined_at', range.endIso);

  const retentionNotes: string[] = [];
  let answer1Count = 0;
  const answerColumns = ['created_at', 'submitted_at'];
  for (const col of answerColumns) {
    const answerRes = await supabase
      .from('answers')
      .select(`player_id, ${col}`)
      .gte(col, range.startIso)
      .lt(col, range.endIso)
      .limit(50000);
    if (!answerRes.error) {
      const unique = new Set<string>();
      (answerRes.data ?? []).forEach((row) => {
        const playerId = (row as { player_id?: string | null }).player_id;
        if (playerId) unique.add(playerId);
      });
      answer1Count = unique.size;
      break;
    }
    retentionNotes.push(`answers.${col} not found`);
  }

  const round2Res = await supabase
    .from('round2_answers')
    .select('player_id, submitted_at')
    .gte('submitted_at', range.startIso)
    .lt('submitted_at', range.endIso)
    .limit(50000);
  const round2Players = new Set<string>();
  if (!round2Res.error) {
    (round2Res.data ?? []).forEach((row) => {
      const playerId = (row as { player_id?: string | null }).player_id;
      if (playerId) round2Players.add(playerId);
    });
  }

  const likesQuery = supabase
    .from('question_likes')
    .select('question_id, room_id, player_id, created_at')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .limit(50000);
  if (filters.roomId) likesQuery.eq('room_id', filters.roomId);
  if (filters.playerId) likesQuery.eq('player_id', filters.playerId);

  const likesRes = await likesQuery;
  const questionLikesMap = new Map<number, number>();
  const likesByRound: Record<string, number> = { round1: 0, round2: 0, round3: 0, round4: 0, round5: 0 };

  if (likesRes.error && !isMissingTableError(likesRes.error)) {
    return Response.json({ error: likesRes.error.message ?? 'Failed to load question likes analytics' }, { status: 500 });
  }

  if (!likesRes.error) {
    (likesRes.data ?? []).forEach((row) => {
      const qid = Number((row as { question_id?: unknown }).question_id ?? NaN);
      if (!Number.isFinite(qid)) return;
      questionLikesMap.set(qid, (questionLikesMap.get(qid) ?? 0) + 1);
      const round = detectQuestionRound(qid);
      likesByRound[`round${round}`] = (likesByRound[`round${round}`] ?? 0) + 1;
    });
  }

  const totalQuestionLikes = Array.from(questionLikesMap.values()).reduce((sum, value) => sum + value, 0);
  const topQuestionReactions = Array.from(questionLikesMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 10)
    .map(([questionId, likes]) => ({
      questionId,
      likes,
      sharePct: totalQuestionLikes > 0 ? Math.round((likes / totalQuestionLikes) * 1000) / 10 : 0,
    }));

  return Response.json({
    range,
    filters,
    players: {
      unique: uniquePlayers.size,
      joined: playersJoined.count ?? 0,
    },
    rounds: {
      started: roundsStarted,
      finished: finishedRooms.size,
    },
    exits: {
      byStatus: exitByStatus,
      byReason: exitByReason,
    },
    realtime: {
      latencyAvg,
      latencyP95,
      reconnects: reconnectCount,
      fallbackCount,
    },
    diagnostics: {
      activeRooms: roomsActive.count ?? 0,
      activePlayers: playersActive.count ?? 0,
    },
    retention: {
      join: playersJoined.count ?? 0,
      answer1: answer1Count,
      round2: round2Players.size,
      finish: finishedRooms.size,
      notes: retentionNotes,
    },
    engagement: {
      sessions: sessionJoins.size,
      returningSessions,
      marathonSessions,
      consecutiveSessions,
      avgSessionMinutes,
      medianSessionMinutes,
      avgGamesPerSession,
      avgFinishedRoomDurationMinutes,
    },
    questionReactions: {
      totalLikes: totalQuestionLikes,
      byRound: likesByRound,
      topQuestions: topQuestionReactions,
    },
    errors: {
      total: errorTotal,
      critical: errorCritical,
      byEvent: errorByEvent,
      byChannel: errorByChannel,
      topEvents: topErrorEvents,
    },
    charts: {
      roomsByTime: roomBuckets.labels.map((label) => ({ label, value: roomBuckets.buckets[label] ?? 0 })),
      playerJoinsByTime: joinBuckets.labels.map((label) => ({ label, value: joinBuckets.buckets[label] ?? 0 })),
      playerExitsByTime: exitBuckets.labels.map((label) => ({ label, value: exitBuckets.buckets[label] ?? 0 })),
      roundsFinishedByTime: roundFinishBuckets.labels.map((label) => ({ label, value: roundFinishBuckets.buckets[label] ?? 0 })),
      realtimeErrorsByTime: realtimeErrorBuckets.labels.map((label) => ({ label, value: realtimeErrorBuckets.buckets[label] ?? 0 })),
      realtimeLatencyByTime: latencySeries,
    },
  });
}
