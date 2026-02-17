import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

type UnoRoom = {
  id: string;
  mode: 'classic' | 'irregular-verbs' | 'verb-match';
  status: 'lobby' | 'playing' | 'finished';
  created_at: string | null;
  updated_at: string | null;
};

type UnoPlayer = {
  room_id: string;
  name: string;
  joined_at: string | null;
};

type UnoEvent = {
  room_id: string;
  player_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type LogRow = {
  id: string;
  created_at: string;
  level: string | null;
  channel: string | null;
  message: string | null;
  event_name: string | null;
  room_id: string | null;
  page: string | null;
};

function parseRange(url: URL) {
  const now = new Date();
  const defaultEnd = now.toISOString();
  const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const start = url.searchParams.get('start') ?? defaultStart;
  const end = url.searchParams.get('end') ?? defaultEnd;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    startMs,
    endMs,
  };
}

function pickBucketMs(rangeMs: number) {
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (rangeMs <= 2 * day) return hour;
  if (rangeMs <= 14 * day) return 6 * hour;
  return day;
}

function createBuckets(startMs: number, endMs: number, bucketMs: number) {
  const labels: string[] = [];
  const values: Record<string, number> = {};
  for (let ts = startMs; ts < endMs; ts += bucketMs) {
    const label = new Date(ts).toISOString();
    labels.push(label);
    values[label] = 0;
  }
  const add = (iso: string | null | undefined) => {
    if (!iso) return;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return;
    const bucketStart = Math.floor((ms - startMs) / bucketMs) * bucketMs + startMs;
    const label = new Date(bucketStart).toISOString();
    if (values[label] === undefined) return;
    values[label] += 1;
  };
  return { labels, values, add };
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  const code = error?.code;
  const message = error?.message ?? '';
  return code === '42P01' || /relation .* does not exist/i.test(message);
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const range = parseRange(url);
  if (!range) {
    return Response.json({ error: 'Invalid range. Provide valid start/end timestamps.' }, { status: 400 });
  }

  const statusFilter = url.searchParams.get('status');
  const modeFilter = url.searchParams.get('mode');

  const supabase = getSupabaseAdminClient();

  const allRoomsRes = await supabase
    .from('uno_rooms')
    .select('id, mode, status, created_at, updated_at');

  if (allRoomsRes.error) {
    return Response.json({ error: allRoomsRes.error.message ?? 'Failed to load UNO rooms' }, { status: 500 });
  }

  const allRooms = (allRoomsRes.data ?? []) as UnoRoom[];

  let rangeRoomsQuery = supabase
    .from('uno_rooms')
    .select('id, mode, status, created_at, updated_at')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .limit(20000);

  if (statusFilter) rangeRoomsQuery = rangeRoomsQuery.eq('status', statusFilter);
  if (modeFilter) rangeRoomsQuery = rangeRoomsQuery.eq('mode', modeFilter);

  const rangeRoomsRes = await rangeRoomsQuery;
  if (rangeRoomsRes.error) {
    return Response.json({ error: rangeRoomsRes.error.message ?? 'Failed to load UNO rooms in range' }, { status: 500 });
  }

  const roomsInRange = (rangeRoomsRes.data ?? []) as UnoRoom[];
  const roomIds = roomsInRange.map((room) => room.id);

  let players: UnoPlayer[] = [];
  let events: UnoEvent[] = [];

  if (roomIds.length > 0) {
    const [playersRes, eventsRes] = await Promise.all([
      supabase.from('uno_players').select('room_id, name, joined_at').in('room_id', roomIds).limit(50000),
      supabase.from('uno_events').select('room_id, player_id, event_type, payload, created_at').in('room_id', roomIds).limit(100000),
    ]);

    if (playersRes.error) {
      return Response.json({ error: playersRes.error.message ?? 'Failed to load UNO players' }, { status: 500 });
    }
    if (eventsRes.error) {
      return Response.json({ error: eventsRes.error.message ?? 'Failed to load UNO events' }, { status: 500 });
    }

    players = (playersRes.data ?? []) as UnoPlayer[];
    events = (eventsRes.data ?? []) as UnoEvent[];
  }

  const roomCountByStatusAll = {
    lobby: allRooms.filter((room) => room.status === 'lobby').length,
    playing: allRooms.filter((room) => room.status === 'playing').length,
    finished: allRooms.filter((room) => room.status === 'finished').length,
  };

  const roomCountByStatusRange = {
    lobby: roomsInRange.filter((room) => room.status === 'lobby').length,
    playing: roomsInRange.filter((room) => room.status === 'playing').length,
    finished: roomsInRange.filter((room) => room.status === 'finished').length,
  };

  const modeCounts: Record<string, number> = { classic: 0, 'irregular-verbs': 0, 'verb-match': 0 };
  roomsInRange.forEach((room) => {
    modeCounts[room.mode] = (modeCounts[room.mode] ?? 0) + 1;
  });

  const playersByRoom = new Map<string, number>();
  players.forEach((player) => {
    playersByRoom.set(player.room_id, (playersByRoom.get(player.room_id) ?? 0) + 1);
  });

  const avgPlayersPerRoom = roomsInRange.length
    ? Math.round((Array.from(playersByRoom.values()).reduce((sum, count) => sum + count, 0) / roomsInRange.length) * 100) / 100
    : 0;

  const finishedDurations: number[] = [];
  roomsInRange.forEach((room) => {
    if (room.status !== 'finished') return;
    const start = room.created_at ? Date.parse(room.created_at) : NaN;
    const end = room.updated_at ? Date.parse(room.updated_at) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    finishedDurations.push((end - start) / 60000);
  });

  const avgFinishedMinutes = finishedDurations.length
    ? Math.round((finishedDurations.reduce((sum, value) => sum + value, 0) / finishedDurations.length) * 10) / 10
    : 0;

  const totalTurns = events.filter((event) => event.event_type === 'play_card').length;
  const totalDraws = events.filter((event) => event.event_type === 'draw_card').length;

  const cardKindCounts: Record<string, number> = {
    number: 0,
    verb: 0,
    'verb-match': 0,
    skip: 0,
    reverse: 0,
    draw2: 0,
    wild: 0,
    wild4: 0,
  };

  const topVerbCounts = new Map<string, number>();
  events.forEach((event) => {
    if (event.event_type !== 'play_card') return;
    const cardRaw = event.payload?.card;
    if (!cardRaw || typeof cardRaw !== 'object') return;
    const card = cardRaw as Record<string, unknown>;
    const kind = typeof card.kind === 'string' ? card.kind : 'unknown';
    if (cardKindCounts[kind] !== undefined) cardKindCounts[kind] += 1;

    if (kind === 'verb') {
      const verb = card.verb;
      if (verb && typeof verb === 'object') {
        const inf = (verb as Record<string, unknown>).infinitive;
        if (typeof inf === 'string' && inf.trim()) {
          topVerbCounts.set(inf, (topVerbCounts.get(inf) ?? 0) + 1);
        }
      }
    }

    if (kind === 'verb-match') {
      const display = card.display;
      if (typeof display === 'string' && display.trim()) {
        topVerbCounts.set(display, (topVerbCounts.get(display) ?? 0) + 1);
      }
    }
  });

  const topVerbReactions = Array.from(topVerbCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([label, count]) => ({ label, count }));

  const uniquePlayers = new Set(players.map((player) => normalizeName(player.name)).filter(Boolean));

  const playersByName = new Map<string, Array<{ roomId: string; joinedAt: number }>>();
  players.forEach((player) => {
    const nameKey = normalizeName(player.name);
    if (!nameKey) return;
    const joinedAt = player.joined_at ? Date.parse(player.joined_at) : NaN;
    if (!Number.isFinite(joinedAt)) return;
    const list = playersByName.get(nameKey) ?? [];
    list.push({ roomId: player.room_id, joinedAt });
    playersByName.set(nameKey, list);
  });

  let returningPlayers = 0;
  let consecutivePlayers = 0;

  playersByName.forEach((joins) => {
    const sorted = [...joins].sort((a, b) => a.joinedAt - b.joinedAt);
    const uniqueRooms = new Set(sorted.map((entry) => entry.roomId));
    if (uniqueRooms.size >= 2) returningPlayers += 1;

    let hasConsecutive = false;
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i].joinedAt - sorted[i - 1].joinedAt;
      if (gap >= 0 && gap <= 30 * 60 * 1000) {
        hasConsecutive = true;
        break;
      }
    }
    if (hasConsecutive) consecutivePlayers += 1;
  });

  const returningRate = uniquePlayers.size
    ? Math.round((returningPlayers / uniquePlayers.size) * 1000) / 10
    : 0;
  const consecutiveRate = uniquePlayers.size
    ? Math.round((consecutivePlayers / uniquePlayers.size) * 1000) / 10
    : 0;

  const startedRooms = roomsInRange.filter((room) => room.status !== 'lobby').length;
  const finishedRooms = roomsInRange.filter((room) => room.status === 'finished').length;
  const finishRateFromCreated = roomsInRange.length
    ? Math.round((finishedRooms / roomsInRange.length) * 1000) / 10
    : 0;

  const rangeMs = range.endMs - range.startMs;
  const bucketMs = pickBucketMs(rangeMs);
  const roomBuckets = createBuckets(range.startMs, range.endMs, bucketMs);
  const joinBuckets = createBuckets(range.startMs, range.endMs, bucketMs);
  const eventBuckets = createBuckets(range.startMs, range.endMs, bucketMs);

  roomsInRange.forEach((room) => roomBuckets.add(room.created_at));
  players.forEach((player) => joinBuckets.add(player.joined_at));
  events.forEach((event) => eventBuckets.add(event.created_at));

  let logsBlock = {
    total: 0,
    critical: 0,
    warnings: 0,
    recent: [] as Array<{
      id: string;
      createdAt: string;
      level: string;
      channel: string;
      message: string;
      eventName: string | null;
      roomId: string | null;
    }>,
    topByEvent: [] as Array<{ event: string; count: number }>,
  };

  const logsRes = await supabase
    .from('logs')
    .select('id, created_at, level, channel, message, event_name, room_id, page')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .or('page.ilike.%/uno%,message.ilike.%uno%,event_name.ilike.%uno%')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (!logsRes.error) {
    const rows = (logsRes.data ?? []) as LogRow[];
    const recent = rows.slice(0, 8).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      level: row.level ?? 'info',
      channel: row.channel ?? 'unknown',
      message: row.message ?? '',
      eventName: row.event_name,
      roomId: row.room_id,
    }));

    const topByEventMap = new Map<string, number>();
    rows.forEach((row) => {
      const key = row.event_name ?? 'unknown_event';
      topByEventMap.set(key, (topByEventMap.get(key) ?? 0) + 1);
    });

    logsBlock = {
      total: rows.filter((row) => row.level === 'error' || row.level === 'warn').length,
      critical: rows.filter((row) => row.level === 'error').length,
      warnings: rows.filter((row) => row.level === 'warn').length,
      recent,
      topByEvent: Array.from(topByEventMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([event, count]) => ({ event, count })),
    };
  } else if (!isMissingTableError(logsRes.error)) {
    return Response.json({ error: logsRes.error.message ?? 'Failed to load logs for UNO analytics' }, { status: 500 });
  }

  return Response.json({
    range: { startIso: range.startIso, endIso: range.endIso },
    rooms: {
      totalAll: allRooms.length,
      totalInRange: roomsInRange.length,
      allByStatus: roomCountByStatusAll,
      rangeByStatus: roomCountByStatusRange,
      byMode: modeCounts,
      startedInRange: startedRooms,
      finishedInRange: finishedRooms,
      finishRateFromCreated,
      avgFinishedMinutes,
    },
    players: {
      joinsInRange: players.length,
      uniquePlayersInRange: uniquePlayers.size,
      avgPlayersPerRoom,
      returningPlayers,
      returningRate,
      consecutivePlayers,
      consecutiveRate,
    },
    activity: {
      playCardEvents: totalTurns,
      drawCardEvents: totalDraws,
      cardKinds: cardKindCounts,
      topVerbReactions,
      avgTurnsPerRoom: roomsInRange.length ? Math.round((totalTurns / roomsInRange.length) * 100) / 100 : 0,
      avgTurnsPerPlayer: uniquePlayers.size ? Math.round((totalTurns / uniquePlayers.size) * 100) / 100 : 0,
    },
    stability: logsBlock,
    charts: {
      roomsByTime: roomBuckets.labels.map((label) => ({ label, value: roomBuckets.values[label] ?? 0 })),
      joinsByTime: joinBuckets.labels.map((label) => ({ label, value: joinBuckets.values[label] ?? 0 })),
      eventsByTime: eventBuckets.labels.map((label) => ({ label, value: eventBuckets.values[label] ?? 0 })),
    },
  });
}
