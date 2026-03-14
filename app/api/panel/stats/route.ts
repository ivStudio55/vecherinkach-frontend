import { NextResponse } from 'next/server';
import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

async function countRows(db: ReturnType<typeof getSupabaseAdminClient>, table: string, from?: string, to?: string) {
  let q = db.from(table).select('id');
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to + 'T23:59:59.999Z');
  const { data } = await q;
  return data?.length ?? 0;
}

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  const db = getSupabaseAdminClient();

  const [
    vecherinkachRooms, vecherinkachPlayers, vecherinkachAnswers,
    jokesterRooms, jokesterPlayers, jokesterDuels,
    creativachRooms, creativachPlayers, creativachAnswers,
    drawRooms, drawPlayers,
    unoRooms, unoPlayers,
  ] = await Promise.all([
    countRows(db, 'rooms', from, to),
    countRows(db, 'players', from, to),
    countRows(db, 'answers', from, to),
    countRows(db, 'jokester_rooms', from, to),
    countRows(db, 'jokester_players', from, to),
    countRows(db, 'jokester_duels', from, to),
    countRows(db, 'creativach_rooms', from, to),
    countRows(db, 'creativach_players', from, to),
    countRows(db, 'creativach_answers', from, to),
    countRows(db, 'draw_rooms', from, to),
    countRows(db, 'draw_players', from, to),
    countRows(db, 'uno_rooms', from, to),
    countRows(db, 'uno_players', from, to),
  ]);

  // Recent activity: last 10 rooms per game
  const buildRecent = (table: string, fields: string) => {
    let q = db.from(table).select(fields).order('created_at', { ascending: false }).limit(10);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to + 'T23:59:59.999Z');
    return q;
  };

  const [
    { data: recentVech },
    { data: recentJokester },
    { data: recentCreativach },
    { data: recentDraw },
    { data: recentUno },
  ] = await Promise.all([
    buildRecent('rooms', 'id,code,status,is_active,created_at,current_question_index'),
    buildRecent('jokester_rooms', 'id,code,status,current_round,created_at'),
    buildRecent('creativach_rooms', 'id,code,status,current_round,created_at'),
    buildRecent('draw_rooms', 'id,code,status,current_round,created_at'),
    buildRecent('uno_rooms', 'id,code,status,mode,created_at'),
  ]);

  return NextResponse.json({
    totals: {
      vecherinkach: { rooms: vecherinkachRooms, players: vecherinkachPlayers, answers: vecherinkachAnswers },
      jokester: { rooms: jokesterRooms, players: jokesterPlayers, duels: jokesterDuels },
      creativach: { rooms: creativachRooms, players: creativachPlayers, answers: creativachAnswers },
      draw: { rooms: drawRooms, players: drawPlayers },
      uno: { rooms: unoRooms, players: unoPlayers },
    },
    recent: {
      vecherinkach: recentVech ?? [],
      jokester: recentJokester ?? [],
      creativach: recentCreativach ?? [],
      draw: recentDraw ?? [],
      uno: recentUno ?? [],
    },
  });
}
