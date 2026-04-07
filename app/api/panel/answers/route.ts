import { NextResponse } from 'next/server';
import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const game = searchParams.get('game') || 'vecherinkach';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const roomId = searchParams.get('roomId') || null;
  const offset = (page - 1) * PAGE_SIZE;

  const db = getSupabaseAdminClient();

  try {
    if (game === 'vecherinkach') {
      return await getVecherinkachAnswers(db, offset, roomId);
    }
    if (game === 'jokester') {
      return await getJokesterAnswers(db, offset, roomId);
    }
    if (game === 'creativach') {
      return await getCreativachAnswers(db, offset, roomId);
    }
    if (game === 'draw') {
      return await getDrawData(db, offset, roomId);
    }
    return NextResponse.json({ error: 'Unknown game' }, { status: 400 });
  } catch (err) {
    console.error('panel/answers error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/* ===== Vecherinkach: round1 + round2 + round3 + round4 + round5 answers ===== */
async function getVecherinkachAnswers(
  db: ReturnType<typeof getSupabaseAdminClient>,
  offset: number,
  roomId: string | null,
) {
  // Round 1 answers
  let q1 = db
    .from('answers')
    .select('id, room_id, player_id, question_index, text, is_correct, points_earned, submitted_at, players!inner(name), rooms!inner(code)')
    .order('submitted_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (roomId) q1 = q1.eq('room_id', roomId);
  const { data: r1 } = await q1;

  // Round 2
  let q2 = db
    .from('round2_answers')
    .select('id, room_id, player_id, round2_item_index, showing_fact, is_correct, points_earned, submitted_at, players!inner(name), rooms!inner(code)')
    .order('submitted_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (roomId) q2 = q2.eq('room_id', roomId);
  const { data: r2 } = await q2;

  // Round 3
  let q3 = db
    .from('round3_answers')
    .select('id, room_id, player_id, question_index, answer_text, is_correct, submitted_at, players!inner(name), rooms!inner(code)')
    .order('submitted_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (roomId) q3 = q3.eq('room_id', roomId);
  const { data: r3 } = await q3;

  // Round 4
  let q4 = db
    .from('round4_answers')
    .select('id, room_id, player_id, puzzle_id, answer_text, is_correct, correct_rank, points_earned, submitted_at, elapsed_ms, players!inner(name), rooms!inner(code)')
    .order('submitted_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (roomId) q4 = q4.eq('room_id', roomId);
  const { data: r4 } = await q4;

  // Round 5
  let q5 = db
    .from('round5_answers')
    .select('id, room_id, player_id, question_index, answer_text, is_correct, submitted_at, players!inner(name), rooms!inner(code)')
    .order('submitted_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (roomId) q5 = q5.eq('room_id', roomId);
  const { data: r5 } = await q5;

  return NextResponse.json({
    round1: (r1 ?? []).map(normalizeJoins),
    round2: (r2 ?? []).map(normalizeJoins),
    round3: (r3 ?? []).map(normalizeJoins),
    round4: (r4 ?? []).map(normalizeJoins),
    round5: (r5 ?? []).map(normalizeJoins),
  });
}

/* ===== Jokester: duel answers ===== */
async function getJokesterAnswers(
  db: ReturnType<typeof getSupabaseAdminClient>,
  offset: number,
  roomId: string | null,
) {
  let q = db
    .from('jokester_answers')
    .select('id, duel_id, player_id, question_index, answer_text, submitted_at, jokester_players!inner(name, room_id), jokester_duels!inner(round, duel_index, question1_text, question2_text, room_id)')
    .order('submitted_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (roomId) {
    q = q.eq('jokester_duels.room_id', roomId);
  }
  const { data: answers } = await q;

  // Get room codes for each unique room_id
  const roomIds = [...new Set((answers ?? []).map((a: Record<string, unknown>) => {
    const duel = a.jokester_duels as Record<string, unknown> | undefined;
    return duel?.room_id as string;
  }).filter(Boolean))];

  let roomCodes: Record<string, string> = {};
  if (roomIds.length > 0) {
    const { data: rooms } = await db
      .from('jokester_rooms')
      .select('id, code')
      .in('id', roomIds);
    roomCodes = Object.fromEntries((rooms ?? []).map(r => [r.id, r.code]));
  }

  const normalized = (answers ?? []).map((a: Record<string, unknown>) => {
    const player = a.jokester_players as Record<string, unknown> | undefined;
    const duel = a.jokester_duels as Record<string, unknown> | undefined;
    const duelRoomId = duel?.room_id as string;
    return {
      ...a,
      player_name: player?.name ?? '—',
      room_code: roomCodes[duelRoomId] ?? '—',
      room_id: duelRoomId,
      round: duel?.round,
      duel_index: duel?.duel_index,
      question_text: a.question_index === 0 ? duel?.question1_text : duel?.question2_text,
      jokester_players: undefined,
      jokester_duels: undefined,
    };
  });

  return NextResponse.json({ answers: normalized });
}

/* ===== Creativach ===== */
async function getCreativachAnswers(
  db: ReturnType<typeof getSupabaseAdminClient>,
  offset: number,
  roomId: string | null,
) {
  let q = db
    .from('creativach_answers')
    .select('id, room_id, round, player_id, answer_text, submitted_at, creativach_players!inner(name), creativach_rooms!inner(code, round_task)')
    .order('submitted_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (roomId) q = q.eq('room_id', roomId);
  const { data: answers } = await q;

  return NextResponse.json({
    answers: (answers ?? []).map(normalizeJoinsCreativach),
  });
}

/* ===== Draw: chains + steps with drawings ===== */
async function getDrawData(
  db: ReturnType<typeof getSupabaseAdminClient>,
  offset: number,
  roomId: string | null,
) {
  // Get chains
  let qChains = db
    .from('draw_chains')
    .select('id, room_id, round, chain_index, original_word, created_at, draw_rooms!inner(code)')
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (roomId) qChains = qChains.eq('room_id', roomId);
  const { data: chains } = await qChains;

  if (!chains || chains.length === 0) {
    return NextResponse.json({ chains: [], steps: [] });
  }

  const chainIds = chains.map(c => c.id);

  // Get steps for these chains
  const { data: steps } = await db
    .from('draw_steps')
    .select('id, chain_id, step_number, player_id, target_word, guess, drawing_data, is_correct, submitted, created_at, draw_players!inner(name)')
    .in('chain_id', chainIds)
    .order('step_number');

  const normalizedChains = chains.map((c: Record<string, unknown>) => {
    const room = c.draw_rooms as Record<string, unknown> | undefined;
    return {
      ...c,
      room_code: room?.code ?? '—',
      draw_rooms: undefined,
    };
  });

  const normalizedSteps = (steps ?? []).map((s: Record<string, unknown>) => {
    const player = s.draw_players as Record<string, unknown> | undefined;
    return {
      ...s,
      player_name: player?.name ?? '—',
      draw_players: undefined,
    };
  });

  return NextResponse.json({ chains: normalizedChains, steps: normalizedSteps });
}

/* ===== Helpers ===== */
function normalizeJoins(row: Record<string, unknown>) {
  const player = row.players as Record<string, unknown> | undefined;
  const room = row.rooms as Record<string, unknown> | undefined;
  return {
    ...row,
    player_name: player?.name ?? '—',
    room_code: room?.code ?? '—',
    players: undefined,
    rooms: undefined,
  };
}

function normalizeJoinsCreativach(row: Record<string, unknown>) {
  const player = row.creativach_players as Record<string, unknown> | undefined;
  const room = row.creativach_rooms as Record<string, unknown> | undefined;
  return {
    ...row,
    player_name: player?.name ?? '—',
    room_code: room?.code ?? '—',
    round_task: room?.round_task ?? '—',
    creativach_players: undefined,
    creativach_rooms: undefined,
  };
}
