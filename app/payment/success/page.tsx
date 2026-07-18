import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const metadata: Metadata = {
  title: 'Оплата успешна — Вечеринкач',
};

const GAME_LABELS: Record<string, string> = {
  vecherinkach: 'Вечеринкач',
  jokester: 'Пошутикач',
  creativach: 'Креативач',
  draw: 'Рисункач',
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
  for (let i = 0; i < 10; i++) {
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
  for (let i = 0; i < 10; i++) {
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

async function createPaidRoom(game: string, packId: string) {
  if (game === 'jokester') return createJokesterRoom(packId);
  if (game === 'draw') return createDrawRoom(packId);
  return createVecherinkachRoom(packId);
}

async function resolveOrder(orderId: string) {
  const supabase = getSupabaseAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, game, pack_id, pack_name, amount, status, room_code, room_id, yukassa_payment_id')
    .eq('id', orderId)
    .single();

  if (!order) return null;
  // A "real" room code is 4 digits. Old orders have 6-char codes (e.g. ZQV5NX) that are not real rooms.
  const hasRealRoom = !!(order.room_id || /^\d{4}$/.test(order.room_code ?? ''));
  if (order.status === 'paid' && hasRealRoom) return order;

  let paymentSucceeded = order.status === 'paid';

  if (!paymentSucceeded && order.yukassa_payment_id && process.env.YUKASSA_SHOP_ID && process.env.YUKASSA_SECRET_KEY) {
    const creds = Buffer.from(`${process.env.YUKASSA_SHOP_ID}:${process.env.YUKASSA_SECRET_KEY}`).toString('base64');
    try {
      const res = await fetch(`https://api.yookassa.ru/v3/payments/${order.yukassa_payment_id}`, {
        headers: { Authorization: `Basic ${creds}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const payment = await res.json();
        if (payment.status === 'succeeded') {
          paymentSucceeded = true;
          await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId);
        }
      }
    } catch { /* fall through */ }
  }

  if (!paymentSucceeded) return order;

  if (!hasRealRoom && order.pack_id) {
    try {
      const roomInfo = await createPaidRoom(order.game, order.pack_id);
      await supabase
        .from('orders')
        .update({ room_code: roomInfo.code, room_id: roomInfo.id, status: 'paid' })
        .eq('id', orderId);
      return { ...order, status: 'paid', room_code: roomInfo.code, room_id: roomInfo.id };
    } catch (err) {
      console.error('[success] room creation error:', err);
      return { ...order, status: 'paid', room_code: null as unknown as string, room_id: null as unknown as string };
    }
  }

  return { ...order, status: 'paid' };
}

interface Props {
  searchParams: Promise<{ orderId?: string }>;
}

export default async function PaymentSuccessPage({ searchParams }: Props) {
  const { orderId } = await searchParams;

  if (!orderId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <p className="opacity-70" style={{ color: 'var(--foreground)' }}>Заказ не найден.</p>
        <Link href="/pricing" className="mt-4 underline opacity-70" style={{ color: 'var(--accent-blue)' }}>
          ← Вернуться к пакетам
        </Link>
      </div>
    );
  }

  const order = await resolveOrder(orderId);

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <p className="opacity-70" style={{ color: 'var(--foreground)' }}>Заказ не найден.</p>
        <Link href="/pricing" className="mt-4 underline opacity-70" style={{ color: 'var(--accent-blue)' }}>
          ← Вернуться к пакетам
        </Link>
      </div>
    );
  }

  const gameName = GAME_LABELS[order.game] ?? order.game;
  const isRealRoomCode = /^\d{4}$/.test(order.room_code ?? '');
  const hostUrl =
    order.game === 'jokester'
      ? (isRealRoomCode ? `/jokester/host/${order.room_code}` : null)
      : order.game === 'draw'
      ? (isRealRoomCode ? `/draw/host/${order.room_code}` : null)
      : order.room_id ? `/host/${order.room_id}` : null;

  if (order.status === 'paid' && (isRealRoomCode || order.room_id) && hostUrl) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 py-12">
        <div
          className="w-full max-w-md rounded-2xl shadow-xl p-8 text-center"
          style={{ background: 'var(--panel)', color: 'var(--foreground)' }}
        >
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-comic-cat)' }}>
            Комната создана!
          </h1>
          <p className="opacity-70 mb-6 text-sm">
            {gameName} · {order.pack_name ?? ''} · {order.amount > 0 ? `${order.amount} ₽` : 'Бесплатно 🎁'}
          </p>

          <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--background)' }}>
            <p className="text-xs opacity-60 mb-1">Код комнаты — сообщите игрокам</p>
            <p
              className="text-5xl font-bold tracking-widest"
              style={{ fontFamily: 'var(--font-bangers)', color: 'var(--accent-blue)' }}
            >
              {order.room_code}
            </p>
            <p className="text-xs opacity-50 mt-2">Игроки вводят этот код на главном экране</p>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href={hostUrl}
              className="inline-block w-full px-6 py-3 rounded-full font-bold text-white transition-transform hover:scale-105"
              style={{ background: 'var(--accent-blue)', fontFamily: 'var(--font-comic-cat)' }}
            >
              Открыть комнату →
            </Link>
            <Link
              href="/"
              className="inline-block w-full px-6 py-3 rounded-full font-semibold transition-transform hover:scale-105"
              style={{ background: 'var(--panel-muted)', color: 'var(--foreground)' }}
            >
              На главную
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (order.status === 'paid' && !order.pack_id) {
    // Legacy order: paid but no pack was recorded — room cannot be auto-created
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 py-12">
        <div
          className="w-full max-w-md rounded-2xl shadow-xl p-8 text-center"
          style={{ background: 'var(--panel)', color: 'var(--foreground)' }}
        >
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-comic-cat)' }}>
            Оплата прошла!
          </h1>
          <p className="opacity-70 mb-2 text-sm">
            {gameName} · {order.amount} ₽
          </p>
          <p className="opacity-60 mb-6 text-sm">
            Комната не была создана автоматически (старый заказ).
            Пожалуйста, напишите нам: создадим комнату вручную.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href="https://t.me/alekzander_iv"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full px-6 py-3 rounded-full font-bold text-white transition-transform hover:scale-105"
              style={{ background: 'var(--accent-blue)', fontFamily: 'var(--font-comic-cat)' }}
            >
              Написать в Telegram
            </a>
            <Link
              href="/"
              className="inline-block w-full px-6 py-3 rounded-full font-semibold transition-transform hover:scale-105"
              style={{ background: 'var(--panel-muted)', color: 'var(--foreground)' }}
            >
              На главную
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (order.status === 'paid' && !isRealRoomCode && !order.room_id) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 py-12">
        <div
          className="w-full max-w-md rounded-2xl shadow-xl p-8 text-center"
          style={{ background: 'var(--panel)', color: 'var(--foreground)' }}
        >
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-comic-cat)' }}>
            Оплата прошла, создаём комнату…
          </h1>
          <p className="opacity-70 mb-6 text-sm">
            Обновите страницу — обычно помогает сразу.
          </p>
          <a
            href={`/payment/success?orderId=${orderId}`}
            className="inline-block w-full px-6 py-3 rounded-full font-bold text-white transition-transform hover:scale-105"
            style={{ background: 'var(--accent-blue)', fontFamily: 'var(--font-comic-cat)' }}
          >
            Обновить страницу
          </a>
        </div>
      </div>
    );
  }

  // Payment pending
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 py-12">
      <div
        className="w-full max-w-md rounded-2xl shadow-xl p-8 text-center"
        style={{ background: 'var(--panel)', color: 'var(--foreground)' }}
      >
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-comic-cat)' }}>
          Обрабатывается…
        </h1>
        <p className="opacity-70 mb-6 text-sm">
          Платёж поступил — подождите несколько секунд и обновите страницу.
        </p>
        <div className="flex flex-col gap-3">
          <a
            href={`/payment/success?orderId=${orderId}`}
            className="inline-block w-full px-6 py-3 rounded-full font-bold text-white transition-transform hover:scale-105"
            style={{ background: 'var(--accent-blue)', fontFamily: 'var(--font-comic-cat)' }}
          >
            Обновить
          </a>
          <Link
            href="/"
            className="inline-block w-full px-6 py-3 rounded-full font-semibold transition-transform hover:scale-105"
            style={{ background: 'var(--panel-muted)', color: 'var(--foreground)' }}
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
