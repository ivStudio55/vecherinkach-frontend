import { requirePanelAuth } from '@/lib/panelAuth';
import { json, jsonError } from '@/lib/server/api';
import { query, queryOne } from '@/lib/db.server';

type DetailGameKey = 'vecherinkach' | 'jokester' | 'creativach' | 'draw' | 'uno' | 'survivach';

const DETAIL_LOADERS: Record<
  DetailGameKey,
  (roomId: string) => Promise<Record<string, unknown>>
> = {
  vecherinkach: async (roomId) => {
    const [room, players, answers] = await Promise.all([
      queryOne('select * from rooms where id = $1', [roomId]),
      query('select * from players where room_id = $1 order by joined_at asc', [roomId]),
      query('select * from answers where room_id = $1 order by submitted_at asc', [roomId]),
    ]);
    return { room, players, answers };
  },
  jokester: async (roomId) => {
    const [room, players, duels] = await Promise.all([
      queryOne('select * from jokester_rooms where id = $1', [roomId]),
      query('select * from jokester_players where room_id = $1 order by joined_at asc', [roomId]),
      query('select * from jokester_duels where room_id = $1 order by round asc, duel_index asc', [roomId]),
    ]);
    return { room, players, duels };
  },
  creativach: async (roomId) => {
    const [room, players, answers, votes] = await Promise.all([
      queryOne('select * from creativach_rooms where id = $1', [roomId]),
      query('select * from creativach_players where room_id = $1 order by joined_at asc', [roomId]),
      query('select * from creativach_answers where room_id = $1 order by round asc, submitted_at asc', [roomId]),
      query('select * from creativach_votes where room_id = $1 order by round asc, created_at asc', [roomId]),
    ]);
    return { room, players, answers, votes };
  },
  draw: async (roomId) => {
    const [room, players, chains] = await Promise.all([
      queryOne('select * from draw_rooms where id = $1', [roomId]),
      query('select * from draw_players where room_id = $1 order by joined_at asc', [roomId]),
      query('select * from draw_chains where room_id = $1 order by round asc, chain_index asc', [roomId]),
    ]);
    return { room, players, chains };
  },
  uno: async (roomId) => {
    const [room, players] = await Promise.all([
      queryOne('select * from uno_rooms where id = $1', [roomId]),
      query('select * from uno_players where room_id = $1 order by joined_at asc', [roomId]),
    ]);
    return { room, players };
  },
  survivach: async (roomId) => {
    const [room, players, answers, bets, duels] = await Promise.all([
      queryOne('select * from survivach_rooms where id = $1', [roomId]),
      query('select * from survivach_players where room_id = $1 order by joined_at asc', [roomId]),
      query('select * from survivach_answers where room_id = $1 order by round asc, submitted_at asc', [roomId]),
      query('select * from survivach_bets where room_id = $1 order by round asc, created_at asc', [roomId]),
      query('select * from survivach_duels where room_id = $1 order by round asc, created_at asc', [roomId]),
    ]);
    return { room, players, answers, bets, duels };
  },
};

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const game = (searchParams.get('game') || 'vecherinkach') as DetailGameKey;
  const roomId = searchParams.get('roomId');

  if (!roomId) return jsonError('roomId required', 400);
  if (!DETAIL_LOADERS[game]) return jsonError('Unknown game', 400);

  try {
    return json(await DETAIL_LOADERS[game](roomId));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to load room detail', 500);
  }
}
