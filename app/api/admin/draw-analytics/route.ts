import { NextResponse } from 'next/server';
import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const supabase = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30', 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // ── 1. Room stats ──
  const { count: totalRooms } = await supabase
    .from('draw_rooms')
    .select('id', { count: 'exact', head: true });

  const { count: roomsInPeriod } = await supabase
    .from('draw_rooms')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);

  const { count: finishedRooms } = await supabase
    .from('draw_rooms')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'finished');

  const { count: activeRooms } = await supabase
    .from('draw_rooms')
    .select('id', { count: 'exact', head: true })
    .in('status', ['lobby', 'playing', 'voting', 'results']);

  // ── 2. Player stats ──
  const { count: totalPlayers } = await supabase
    .from('draw_players')
    .select('id', { count: 'exact', head: true })
    .eq('is_host', false);

  const { count: playersInPeriod } = await supabase
    .from('draw_players')
    .select('id', { count: 'exact', head: true })
    .eq('is_host', false)
    .gte('joined_at', since);

  // ── 3. Rooms with details for charts & calculations ──
  const { data: rooms } = await supabase
    .from('draw_rooms')
    .select('id, code, mode, status, current_round, created_at, updated_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);

  // ── 4. Player counts per room (for avg players) ──
  const roomIds = (rooms || []).map(r => r.id);
  let playerCountMap: Record<string, number> = {};
  if (roomIds.length > 0) {
    const { data: players } = await supabase
      .from('draw_players')
      .select('room_id')
      .eq('is_host', false)
      .in('room_id', roomIds);
    if (players) {
      for (const p of players) {
        playerCountMap[p.room_id] = (playerCountMap[p.room_id] || 0) + 1;
      }
    }
  }

  // ── 5. Mode distribution ──
  const modeDistribution: Record<string, number> = {};
  for (const r of rooms || []) {
    modeDistribution[r.mode] = (modeDistribution[r.mode] || 0) + 1;
  }

  // ── 6. Status distribution ──
  const statusDistribution: Record<string, number> = {};
  for (const r of rooms || []) {
    statusDistribution[r.status] = (statusDistribution[r.status] || 0) + 1;
  }

  // ── 7. Calculate avg players per game, avg game duration ──
  const finishedRoomsData = (rooms || []).filter(r => r.status === 'finished');
  const playerCounts = finishedRoomsData.map(r => playerCountMap[r.id] || 0).filter(c => c > 0);
  const avgPlayers = playerCounts.length > 0
    ? Math.round((playerCounts.reduce((a, b) => a + b, 0) / playerCounts.length) * 10) / 10
    : 0;

  const durations = finishedRoomsData
    .map(r => {
      if (!r.created_at || !r.updated_at) return 0;
      return (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 60000; // minutes
    })
    .filter(d => d > 0 && d < 180); // ignore outliers
  const avgDurationMin = durations.length > 0
    ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
    : 0;

  // ── 8. Activity timeline (rooms per day) ──
  const timeline: Record<string, number> = {};
  for (const r of rooms || []) {
    const day = r.created_at?.slice(0, 10);
    if (day) timeline[day] = (timeline[day] || 0) + 1;
  }
  const sortedTimeline = Object.entries(timeline)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ label: date, value: count }));

  // ── 9. Repeat players (played in 2+ rooms) ──
  let repeatPlayerCount = 0;
  let totalUniquePlayerNames = 0;
  if (roomIds.length > 0) {
    const { data: allPlayers } = await supabase
      .from('draw_players')
      .select('name, room_id')
      .eq('is_host', false)
      .in('room_id', roomIds);
    if (allPlayers) {
      const nameRooms: Record<string, Set<string>> = {};
      for (const p of allPlayers) {
        if (!nameRooms[p.name]) nameRooms[p.name] = new Set();
        nameRooms[p.name].add(p.room_id);
      }
      totalUniquePlayerNames = Object.keys(nameRooms).length;
      repeatPlayerCount = Object.values(nameRooms).filter(s => s.size >= 2).length;
    }
  }

  // ── 10. Rounds reached distribution ──
  const roundsReached: Record<number, number> = {};
  for (const r of finishedRoomsData) {
    const round = r.current_round || 1;
    roundsReached[round] = (roundsReached[round] || 0) + 1;
  }

  // ── 11. Vote count ──
  const { count: totalVotes } = await supabase
    .from('draw_votes')
    .select('id', { count: 'exact', head: true });

  // ── 12. Drawing count ──
  const { count: totalDrawings } = await supabase
    .from('draw_steps')
    .select('id', { count: 'exact', head: true })
    .not('drawing_data', 'is', null);

  // ── 13. Correct guesses ──
  const { count: correctGuesses } = await supabase
    .from('draw_steps')
    .select('id', { count: 'exact', head: true })
    .eq('is_correct', true);

  const { count: totalGuesses } = await supabase
    .from('draw_steps')
    .select('id', { count: 'exact', head: true })
    .not('guess', 'is', null);

  return NextResponse.json({
    kpis: {
      totalRooms: totalRooms ?? 0,
      roomsInPeriod: roomsInPeriod ?? 0,
      finishedRooms: finishedRooms ?? 0,
      activeRooms: activeRooms ?? 0,
      totalPlayers: totalPlayers ?? 0,
      playersInPeriod: playersInPeriod ?? 0,
      avgPlayers,
      avgDurationMin,
      totalDrawings: totalDrawings ?? 0,
      totalVotes: totalVotes ?? 0,
      correctGuesses: correctGuesses ?? 0,
      totalGuesses: totalGuesses ?? 0,
      guessAccuracy: totalGuesses ? Math.round(((correctGuesses ?? 0) / totalGuesses) * 100) : 0,
    },
    modeDistribution,
    statusDistribution,
    timeline: sortedTimeline,
    repeatPlayers: {
      total: totalUniquePlayerNames,
      repeat: repeatPlayerCount,
      percentage: totalUniquePlayerNames > 0
        ? Math.round((repeatPlayerCount / totalUniquePlayerNames) * 100)
        : 0,
    },
    roundsReached,
  });
}
