import { requirePanelAuth } from '@/lib/panelAuth';
import { json, jsonError } from '@/lib/server/api';
import { query, queryCount } from '@/lib/db.server';

type RecentRoomRow = Record<string, unknown>;

function buildDateWhere(from?: string, to?: string) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (from) {
    params.push(from);
    clauses.push(`created_at >= $${params.length}`);
  }
  if (to) {
    params.push(`${to}T23:59:59.999Z`);
    clauses.push(`created_at <= $${params.length}`);
  }

  return {
    where: clauses.length ? ` where ${clauses.join(' and ')}` : '',
    params,
  };
}

async function countRows(table: string, from?: string, to?: string) {
  const { where, params } = buildDateWhere(from, to);
  return queryCount(`select count(*) from ${table}${where}`, params);
}

async function loadRecent(table: string, fields: string, from?: string, to?: string) {
  const { where, params } = buildDateWhere(from, to);
  return query<RecentRoomRow>(
    `select ${fields}
     from ${table}${where}
     order by created_at desc
     limit 10`,
    params,
  );
}

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  try {
    const [
      vecherinkachRooms, vecherinkachPlayers, vecherinkachAnswers,
      jokesterRooms, jokesterPlayers, jokesterDuels,
      creativachRooms, creativachPlayers, creativachAnswers,
      drawRooms, drawPlayers,
      unoRooms, unoPlayers,
      survivachRooms, survivachPlayers, survivachAnswers,
      recentVech, recentJokester, recentCreativach, recentDraw, recentUno, recentSurvivach,
    ] = await Promise.all([
      countRows('rooms', from, to),
      countRows('players', from, to),
      countRows('answers', from, to),
      countRows('jokester_rooms', from, to),
      countRows('jokester_players', from, to),
      countRows('jokester_duels', from, to),
      countRows('creativach_rooms', from, to),
      countRows('creativach_players', from, to),
      countRows('creativach_answers', from, to),
      countRows('draw_rooms', from, to),
      countRows('draw_players', from, to),
      countRows('uno_rooms', from, to),
      countRows('uno_players', from, to),
      countRows('survivach_rooms', from, to),
      countRows('survivach_players', from, to),
      countRows('survivach_answers', from, to),
      loadRecent('rooms', 'id, code, status, is_active, created_at, current_question_index', from, to),
      loadRecent('jokester_rooms', 'id, code, status, current_round, created_at', from, to),
      loadRecent('creativach_rooms', 'id, code, status, current_round, created_at', from, to),
      loadRecent('draw_rooms', 'id, code, status, current_round, created_at', from, to),
      loadRecent('uno_rooms', 'id, code, status, mode, created_at', from, to),
      loadRecent('survivach_rooms', 'id, code, status, current_round, current_mode, created_at', from, to),
    ]);

    return json({
      totals: {
        vecherinkach: { rooms: vecherinkachRooms, players: vecherinkachPlayers, answers: vecherinkachAnswers },
        jokester: { rooms: jokesterRooms, players: jokesterPlayers, duels: jokesterDuels },
        creativach: { rooms: creativachRooms, players: creativachPlayers, answers: creativachAnswers },
        draw: { rooms: drawRooms, players: drawPlayers },
        uno: { rooms: unoRooms, players: unoPlayers },
        survivach: { rooms: survivachRooms, players: survivachPlayers, answers: survivachAnswers },
      },
      recent: {
        vecherinkach: recentVech,
        jokester: recentJokester,
        creativach: recentCreativach,
        draw: recentDraw,
        uno: recentUno,
        survivach: recentSurvivach,
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to load stats', 500);
  }
}
