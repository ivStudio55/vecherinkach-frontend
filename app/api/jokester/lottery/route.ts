import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';
import { json, jsonError } from '@/lib/server/api';
import { requirePanelAuth } from '@/lib/panelAuth';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QUESTION_VOTE_PREFIX = 'question:';
const LOTTERY_ROUNDS = [1, 2, 3];
const DEFAULT_LOTTERY_DISCOUNT_PCT = 50;
const DEFAULT_PROMO_DAYS = 30;

function normalizePromoCode(value: unknown) {
  return String(value ?? '').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}

function generateLotteryCode(round: number) {
  const chunk = randomBytes(5).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return `JOKE50-R${round}-${chunk}`;
}

function getExpiresAt(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

async function createPromoCodeRows(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  rounds: number[],
  options: { discountPct: number; maxUses: number; expiresAt: string | null },
) {
  const rows: Array<{ round: number; code: string }> = [];

  for (const round of rounds) {
    let created = false;
    for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
      const code = generateLotteryCode(round);
      const { error } = await supabase
        .from('promo_codes')
        .insert({
          code,
          discount_pct: options.discountPct,
          discount_fixed: 0,
          game: 'jokester',
          pack_id: null,
          expires_at: options.expiresAt,
          max_uses: options.maxUses,
          is_active: true,
        });

      if (!error) {
        rows.push({ round, code });
        created = true;
        continue;
      }

      if (!error.message?.includes('duplicate') && !error.message?.includes('unique')) {
        throw new Error(error.message);
      }
    }

    if (!created) throw new Error(`Could not generate promo code for round ${round}`);
  }

  return rows;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roomId = url.searchParams.get('room_id');
  const playerId = url.searchParams.get('player_id');
  if (!roomId) return jsonError('room_id required', 400);

  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from('jokester_lottery_prizes')
    .select('id, room_id, round, winner_id, promo_code, created_at')
    .eq('room_id', roomId)
    .order('round', { ascending: true });

  if (playerId) query = query.eq('winner_id', playerId);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  return json(data ?? []);
}

export async function POST(request: Request) {
  let body: {
    action?: string;
    room_id?: string;
    round?: number;
    promo_codes?: Array<{ round?: number; code?: string }>;
    auto_generate?: boolean;
    discount_pct?: number;
    max_uses?: number;
    expires_days?: number;
  };

  try {
    body = await request.json();
  } catch {
    return jsonError('invalid json', 400);
  }

  const roomId = body.room_id;
  if (!roomId) return jsonError('room_id required', 400);

  const supabase = getSupabaseAdminClient();

  if (body.action === 'configure') {
    if (body.auto_generate) {
      const authErr = requirePanelAuth(request);
      if (authErr) return authErr;
    }

    await supabase
      .from('jokester_lottery_prizes')
      .delete()
      .eq('room_id', roomId)
      .in('round', LOTTERY_ROUNDS);

    const sourceCodes = body.auto_generate
      ? await createPromoCodeRows(supabase, LOTTERY_ROUNDS, {
          discountPct: Math.min(100, Math.max(1, Number(body.discount_pct ?? DEFAULT_LOTTERY_DISCOUNT_PCT))),
          maxUses: Math.max(1, Number(body.max_uses ?? 1)),
          expiresAt: body.expires_days === 0 ? null : getExpiresAt(Math.max(1, Number(body.expires_days ?? DEFAULT_PROMO_DAYS))),
        })
      : (body.promo_codes ?? []).map(item => ({
          round: Number(item.round),
          code: normalizePromoCode(item.code),
        }));

    const rows = sourceCodes
      .map(item => ({
        room_id: roomId,
        round: Number(item.round),
        promo_code: normalizePromoCode(item.code),
        winner_id: null,
      }))
      .filter(item => LOTTERY_ROUNDS.includes(item.round) && item.promo_code.length >= 2);

    if (rows.length === 0) return json({ ok: true, prizes: [] });

    const { data, error } = await supabase
      .from('jokester_lottery_prizes')
      .insert(rows)
      .select('id, room_id, round, winner_id, promo_code, created_at');

    if (error) return jsonError(error.message, 500);
    return json({ ok: true, prizes: data ?? [] });
  }

  if (body.action === 'draw') {
    const round = Number(body.round);
    if (![1, 2, 3].includes(round)) return json({ ok: true, skipped: true, reason: 'round_not_supported' });

    const { data: prize, error: prizeError } = await supabase
      .from('jokester_lottery_prizes')
      .select('id, room_id, round, winner_id, promo_code, created_at')
      .eq('room_id', roomId)
      .eq('round', round)
      .maybeSingle();

    if (prizeError) return jsonError(prizeError.message, 500);
    if (!prize?.promo_code) return json({ ok: true, skipped: true, reason: 'no_promo' });
    if (prize.winner_id) return json({ ok: true, prize });

    const { data: votes, error: votesError } = await supabase
      .from('jokester_category_votes')
      .select('voter_id, category')
      .eq('room_id', roomId)
      .eq('round', round)
      .like('category', `${QUESTION_VOTE_PREFIX}%`);

    if (votesError) return jsonError(votesError.message, 500);

    const voterIds = [...new Set((votes ?? []).map(v => String(v.voter_id)).filter(Boolean))];
    if (voterIds.length === 0) return json({ ok: true, skipped: true, reason: 'no_question_votes' });

    const { data: spectators, error: spectatorsError } = await supabase
      .from('jokester_players')
      .select('id')
      .eq('room_id', roomId)
      .eq('role', 'spectator')
      .in('id', voterIds);

    if (spectatorsError) return jsonError(spectatorsError.message, 500);

    const eligibleIds = (spectators ?? []).map(p => String(p.id));
    if (eligibleIds.length === 0) return json({ ok: true, skipped: true, reason: 'no_spectator_votes' });

    const winnerId = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
    const { data: updated, error: updateError } = await supabase
      .from('jokester_lottery_prizes')
      .update({ winner_id: winnerId })
      .eq('id', prize.id)
      .is('winner_id', null)
      .select('id, room_id, round, winner_id, promo_code, created_at')
      .single();

    if (updateError) return jsonError(updateError.message, 500);
    return json({ ok: true, prize: updated });
  }

  return jsonError('unknown action', 400);
}
