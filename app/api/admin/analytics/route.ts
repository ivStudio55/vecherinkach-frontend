import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

const DEFAULT_EVENTS = [
  'player_join',
  'player_exit',
  'round_start',
  'room_status_change',
  'realtime_latency',
  'realtime_reconnect',
  'realtime_fallback',
];

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
    .select('event_name, player_id, room_id, level, channel, context, created_at')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso);

  if (filters.roomId) logsQuery = logsQuery.eq('room_id', filters.roomId);
  if (filters.playerId) logsQuery = logsQuery.eq('player_id', filters.playerId);
  if (filters.eventName) {
    logsQuery = logsQuery.eq('event_name', filters.eventName);
  } else {
    logsQuery = logsQuery.in('event_name', DEFAULT_EVENTS);
  }

  const { data, error } = await logsQuery.limit(10000);

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to load analytics' }, { status: 500 });
  }

  const rows = (data ?? []) as Array<LogRow & {
    room_id?: string | null;
    level?: string | null;
    channel?: string | null;
  }>;
  const uniquePlayers = new Set<string>();
  let roundsStarted = 0;
  const finishedRooms = new Set<string>();
  const exitByStatus: Record<string, number> = {};
  const exitByReason: Record<string, number> = {};
  let reconnectCount = 0;
  let fallbackCount = 0;
  const latencyValues: number[] = [];

  rows.forEach((row) => {
    if (row.event_name === 'player_join' && row.player_id) {
      uniquePlayers.add(row.player_id);
      joinBuckets.add(row.created_at);
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
    .select('created_at')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .limit(10000);

  (roomRows ?? []).forEach((row) => {
    const createdAt = (row as { created_at?: string | null }).created_at ?? null;
    roomBuckets.add(createdAt);
  });

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
