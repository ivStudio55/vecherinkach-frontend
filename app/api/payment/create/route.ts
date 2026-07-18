import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';
import {
  applyPromoDiscount,
  getBasePriceForPack,
  getPackRow,
  getPromoCodeRow,
  getPromoValidationError,
  normalizePromoCode,
  type SupportedPaidGame,
} from '@/lib/payments/pricing';
import { jsonError } from '@/lib/server/api';

const SHOP_ID = process.env.YUKASSA_SHOP_ID;
const SECRET_KEY = process.env.YUKASSA_SECRET_KEY;
const BASE_URL = 'https://vecherinkach.ru';

const GAME_NAMES: Record<SupportedPaidGame, string> = {
  vecherinkach: 'Вечеринкач — игровая сессия',
  jokester: 'Пошутикач — игровая сессия',
  creativach: 'Креативач — игровая сессия',
  draw: 'Рисункач — игровая сессия',
};

function generateGameCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function createVecherinkachRoom(packId: string) {
  const supabase = getSupabaseAdminClient();
  const code = generateGameCode();
  const { data, error } = await supabase.rpc('create_room', { p_code: code, p_pack_id: packId });
  if (error) throw new Error(`create_room failed: ${error.message}`);
  const room = Array.isArray(data) ? data[0] : data;
  if (!room?.id) throw new Error('create_room returned no id');
  return { id: room.id as string, code };
}

async function createJokesterRoom(packId: string) {
  const supabase = getSupabaseAdminClient();
  for (let i = 0; i < 10; i += 1) {
    const code = generateGameCode();
    const { data: room, error } = await supabase
      .from('jokester_rooms')
      .insert({ code, status: 'lobby', state_version: 1, pack_id: packId })
      .select('id, code')
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') continue;
      throw new Error(`jokester_rooms insert: ${error.message}`);
    }
    if (!room) continue;
    const { data: player, error: pe } = await supabase
      .from('jokester_players')
      .insert({ room_id: room.id, name: 'Ведущий', role: 'player', is_host: true, seat: 0, avatar: '1.png' })
      .select('id')
      .single();
    if (pe || !player) throw new Error(`jokester_players insert: ${pe?.message}`);
    await supabase.from('jokester_rooms').update({ host_id: player.id }).eq('id', room.id);
    return { id: room.id as string, code: room.code as string };
  }
  throw new Error('Could not generate unique jokester code');
}

async function createDrawRoom(packId: string) {
  const supabase = getSupabaseAdminClient();
  for (let i = 0; i < 10; i += 1) {
    const code = generateGameCode();
    const { data: room, error } = await supabase
      .from('draw_rooms')
      .insert({ code, status: 'lobby', mode: 'russian', pack_id: packId })
      .select('id, code')
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') continue;
      throw new Error(`draw_rooms insert: ${error.message}`);
    }
    if (!room) continue;
    const { data: player, error: pe } = await supabase
      .from('draw_players')
      .insert({ room_id: room.id, name: 'Ведущий', is_host: true, seat: 1 })
      .select('id')
      .single();
    if (pe || !player) throw new Error(`draw_players insert: ${pe?.message}`);
    await supabase.from('draw_rooms').update({ host_id: player.id }).eq('id', room.id);
    return { id: room.id as string, code: room.code as string };
  }
  throw new Error('Could not generate unique draw code');
}

async function createPaidRoom(game: SupportedPaidGame, packId: string) {
  if (game === 'jokester') return createJokesterRoom(packId);
  if (game === 'draw') return createDrawRoom(packId);
  return createVecherinkachRoom(packId);
}

export async function POST(req: NextRequest) {
  let body: { game?: string; email?: string; pack_id?: string; promo_code?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid request body', 400);
  }

  const { game, email, pack_id, promo_code } = body;
  const normalizedGame = game as SupportedPaidGame | undefined;

  if (!normalizedGame || !(normalizedGame in GAME_NAMES)) {
    return jsonError('Unknown game', 400);
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Invalid email', 400);
  }
  if (!pack_id) {
    return jsonError('Pack not selected', 400);
  }

  const supabase = getSupabaseAdminClient();
  const { data: packRow, error: packErr } = await getPackRow(supabase, normalizedGame, pack_id);

  if (packErr || !packRow) {
    return jsonError('Пакет не найден', 400);
  }
  if (!packRow.is_active) {
    return jsonError('Пакет недоступен', 400);
  }
  if (packRow.is_public) {
    return jsonError('Этот пакет бесплатный', 400);
  }

  const originalPrice = await getBasePriceForPack(supabase, normalizedGame, packRow.price);
  const packName = `${GAME_NAMES[normalizedGame]}: ${packRow.label}`;

  let finalPrice = originalPrice;
  let appliedPromoCode: string | null = null;

  if (promo_code) {
    const normalizedCode = normalizePromoCode(promo_code);
    const { data: promoRow, error: promoFetchErr } = await getPromoCodeRow(supabase, normalizedCode);
    const promoError = promoFetchErr
      ? 'Промокод недействителен'
      : getPromoValidationError(promoRow, normalizedGame, pack_id);

    if (promoError || !promoRow) {
      return jsonError(promoError ?? 'Промокод недействителен', 400);
    }

    const { error: updateErr } = await supabase
      .from('promo_codes')
      .update({ used_count: promoRow.used_count + 1 })
      .eq('id', promoRow.id)
      .eq('used_count', promoRow.used_count);

    if (updateErr) {
      console.error('[payment/create] promo increment error:', updateErr);
      return jsonError('Промокод уже использован', 400);
    }

    finalPrice = applyPromoDiscount(originalPrice, promoRow);
    appliedPromoCode = normalizedCode;
  }

  if (finalPrice <= 0) {
    try {
      const roomInfo = await createPaidRoom(normalizedGame, pack_id);

      const { data: order, error: dbErr } = await supabase
        .from('orders')
        .insert({
          game: normalizedGame,
          pack_id,
          pack_name: packName,
          amount: 0,
          original_amount: originalPrice,
          customer_email: email,
          status: 'paid',
          promo_code: appliedPromoCode,
          room_code: roomInfo.code,
          room_id: roomInfo.id,
        })
        .select('id')
        .single();

      if (dbErr || !order) {
        console.error('[payment/create] free order DB error:', dbErr);
        return jsonError('Ошибка создания заказа', 500);
      }

      return NextResponse.json({ free: true, orderId: order.id });
    } catch (err) {
      console.error('[payment/create] free room creation error:', err);
      return jsonError('Ошибка создания комнаты', 500);
    }
  }

  if (!SHOP_ID || !SECRET_KEY) {
    return jsonError('Payment not configured', 503);
  }

  const priceStr = finalPrice.toFixed(2);

  const { data: order, error: dbError } = await supabase
    .from('orders')
    .insert({
      game: normalizedGame,
      pack_id,
      pack_name: packName,
      amount: finalPrice,
      original_amount: finalPrice < originalPrice ? originalPrice : null,
      customer_email: email,
      status: 'pending',
      promo_code: appliedPromoCode,
    })
    .select('id')
    .single();

  if (dbError || !order) {
    console.error('[payment/create] DB error:', dbError);
    return jsonError('Ошибка создания заказа', 500);
  }

  const orderId: string = order.id;
  const credentials = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');

  let yukassaRes: Response;
  try {
    yukassaRes = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
        'Idempotence-Key': orderId,
      },
      body: JSON.stringify({
        amount: { value: priceStr, currency: 'RUB' },
        confirmation: {
          type: 'redirect',
          return_url: `${BASE_URL}/payment/success?orderId=${orderId}`,
        },
        capture: true,
        description: packName,
        receipt: {
          customer: { email },
          items: [
            {
              description: packName,
              quantity: '1.00',
              amount: { value: priceStr, currency: 'RUB' },
              vat_code: 1,
              payment_subject: 'service',
              payment_mode: 'full_payment',
            },
          ],
        },
        metadata: { orderId },
      }),
    });
  } catch (err) {
    console.error('[payment/create] YuKassa fetch error:', err);
    return jsonError('Ошибка платёжного сервиса', 502);
  }

  if (!yukassaRes.ok) {
    const errData = await yukassaRes.json().catch(() => ({}));
    console.error('[payment/create] YuKassa error:', errData);
    return jsonError('Ошибка платёжного сервиса', 502);
  }

  const payment = await yukassaRes.json();

  await supabase
    .from('orders')
    .update({ yukassa_payment_id: payment.id })
    .eq('id', orderId);

  return NextResponse.json({
    confirmationUrl: payment.confirmation.confirmation_url,
    orderId,
  });
}
