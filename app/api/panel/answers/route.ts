import { requirePanelAuth } from '@/lib/panelAuth';
import { query } from '@/lib/db.server';
import { json, jsonError } from '@/lib/server/api';

const PAGE_SIZE = 50;

type AnswerGameKey = 'vecherinkach' | 'jokester' | 'creativach' | 'draw';
type Row = Record<string, unknown>;

function buildRoomFilter(column: string, roomId: string | null) {
  const params: unknown[] = [];
  const where = roomId ? `where ${column} = $${params.push(roomId)}` : '';
  params.push(PAGE_SIZE);
  params.push(0);
  return { where, params };
}

function withPagination(params: unknown[], offset: number) {
  const next = [...params];
  next[next.length - 1] = offset;
  return next;
}

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const game = (searchParams.get('game') || 'vecherinkach') as AnswerGameKey;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const roomId = searchParams.get('roomId') || null;
  const offset = (page - 1) * PAGE_SIZE;

  try {
    if (game === 'vecherinkach') return json(await getVecherinkachAnswers(offset, roomId));
    if (game === 'jokester') return json(await getJokesterAnswers(offset, roomId));
    if (game === 'creativach') return json(await getCreativachAnswers(offset, roomId));
    if (game === 'draw') return json(await getDrawData(offset, roomId));
    return jsonError('Unknown game', 400);
  } catch (err) {
    console.error('panel/answers error:', err);
    return jsonError('Internal error', 500);
  }
}

async function getVecherinkachAnswers(offset: number, roomId: string | null) {
  const round1Filter = buildRoomFilter('a.room_id', roomId);
  const round2Filter = buildRoomFilter('a.room_id', roomId);
  const round3Filter = buildRoomFilter('a.room_id', roomId);
  const round4Filter = buildRoomFilter('a.room_id', roomId);
  const round5Filter = buildRoomFilter('a.room_id', roomId);

  const [round1, round2, round3, round4, round5] = await Promise.all([
    query<Row>(
      `select a.id, a.room_id, a.player_id, a.question_index, a.text, a.is_correct, a.points_earned, a.submitted_at,
              p.name as player_name, r.code as room_code
       from answers a
       join players p on p.id = a.player_id
       join rooms r on r.id = a.room_id
       ${round1Filter.where}
       order by a.submitted_at desc
       limit $${round1Filter.params.length - 1} offset $${round1Filter.params.length}`,
      withPagination(round1Filter.params, offset),
    ),
    query<Row>(
      `select a.id, a.room_id, a.player_id, a.round2_item_index, a.showing_fact, a.is_correct, a.points_earned, a.submitted_at,
              p.name as player_name, r.code as room_code
       from round2_answers a
       join players p on p.id = a.player_id
       join rooms r on r.id = a.room_id
       ${round2Filter.where}
       order by a.submitted_at desc
       limit $${round2Filter.params.length - 1} offset $${round2Filter.params.length}`,
      withPagination(round2Filter.params, offset),
    ),
    query<Row>(
      `select a.id, a.room_id, a.player_id, a.question_index, a.answer_text, a.is_correct, a.submitted_at,
              p.name as player_name, r.code as room_code
       from round3_answers a
       join players p on p.id = a.player_id
       join rooms r on r.id = a.room_id
       ${round3Filter.where}
       order by a.submitted_at desc
       limit $${round3Filter.params.length - 1} offset $${round3Filter.params.length}`,
      withPagination(round3Filter.params, offset),
    ),
    query<Row>(
      `select a.id, a.room_id, a.player_id, a.puzzle_id, a.answer_text, a.is_correct, a.correct_rank, a.points_earned, a.submitted_at, a.elapsed_ms,
              p.name as player_name, r.code as room_code
       from round4_answers a
       join players p on p.id = a.player_id
       join rooms r on r.id = a.room_id
       ${round4Filter.where}
       order by a.submitted_at desc
       limit $${round4Filter.params.length - 1} offset $${round4Filter.params.length}`,
      withPagination(round4Filter.params, offset),
    ),
    query<Row>(
      `select a.id, a.room_id, a.player_id, a.question_index, a.answer_text, a.is_correct, a.submitted_at,
              p.name as player_name, r.code as room_code
       from round5_answers a
       join players p on p.id = a.player_id
       join rooms r on r.id = a.room_id
       ${round5Filter.where}
       order by a.submitted_at desc
       limit $${round5Filter.params.length - 1} offset $${round5Filter.params.length}`,
      withPagination(round5Filter.params, offset),
    ),
  ]);

  return { round1, round2, round3, round4, round5 };
}

async function getJokesterAnswers(offset: number, roomId: string | null) {
  const filter = buildRoomFilter('d.room_id', roomId);
  const answers = await query<Row>(
    `select a.id, a.duel_id, a.player_id, a.question_index, a.answer_text, a.submitted_at,
            p.name as player_name, d.room_id, d.round, d.duel_index,
            case when a.question_index = 0 then d.question1_text else d.question2_text end as question_text,
            r.code as room_code
     from jokester_answers a
     join jokester_players p on p.id = a.player_id
     join jokester_duels d on d.id = a.duel_id
     join jokester_rooms r on r.id = d.room_id
     ${filter.where}
     order by a.submitted_at desc
     limit $${filter.params.length - 1} offset $${filter.params.length}`,
    withPagination(filter.params, offset),
  );

  return { answers };
}

async function getCreativachAnswers(offset: number, roomId: string | null) {
  const filter = buildRoomFilter('a.room_id', roomId);
  const answers = await query<Row>(
    `select a.id, a.room_id, a.round, a.player_id, a.answer_text, a.submitted_at,
            p.name as player_name, r.code as room_code, r.round_task
     from creativach_answers a
     join creativach_players p on p.id = a.player_id
     join creativach_rooms r on r.id = a.room_id
     ${filter.where}
     order by a.submitted_at desc
     limit $${filter.params.length - 1} offset $${filter.params.length}`,
    withPagination(filter.params, offset),
  );

  return { answers };
}

async function getDrawData(offset: number, roomId: string | null) {
  const filter = buildRoomFilter('c.room_id', roomId);
  const chains = await query<Row>(
    `select c.id, c.room_id, c.round, c.chain_index, c.original_word, c.created_at, r.code as room_code
     from draw_chains c
     join draw_rooms r on r.id = c.room_id
     ${filter.where}
     order by c.created_at desc
     limit $${filter.params.length - 1} offset $${filter.params.length}`,
    withPagination(filter.params, offset),
  );

  if (chains.length === 0) {
    return { chains: [], steps: [] };
  }

  const chainIds = chains.map((chain) => chain.id as string);
  const steps = await query<Row>(
    `select s.id, s.chain_id, s.step_number, s.player_id, s.target_word, s.guess, s.drawing_data, s.is_correct, s.submitted, s.created_at,
            p.name as player_name
     from draw_steps s
     join draw_players p on p.id = s.player_id
     where s.chain_id = any($1::uuid[])
     order by s.step_number asc`,
    [chainIds],
  );

  return { chains, steps };
}
