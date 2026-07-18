import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';
import { PANEL_GAME_TABLES, type PanelGameKey } from '@/lib/panel/config';
import { json, jsonError } from '@/lib/server/api';

export async function POST(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { game, roomId, action } = await request.json();
  if (!game || !roomId || !action) {
    return jsonError('game, roomId, action required', 400);
  }

  const db = getSupabaseAdminClient();
  const panelGame = game as PanelGameKey;
  const table = PANEL_GAME_TABLES[panelGame]?.rooms;
  if (!table) return jsonError('Unknown game', 400);

  if (action === 'delete') {
    const { error } = await db.from(table).delete().eq('id', roomId);
    if (error) return jsonError(error.message, 500);
    return json({ ok: true, action: 'deleted' });
  }

  if (action === 'close') {
    const statusField = panelGame === 'vecherinkach' ? { is_active: false, status: 'finished' } : { status: 'finished' };
    const { error } = await db.from(table).update(statusField).eq('id', roomId);
    if (error) return jsonError(error.message, 500);
    return json({ ok: true, action: 'closed' });
  }

  if (action === 'reopen') {
    const statusField = panelGame === 'vecherinkach'
      ? { is_active: true, status: 'waiting' }
      : { status: 'lobby' };
    const { error } = await db.from(table).update(statusField).eq('id', roomId);
    if (error) return jsonError(error.message, 500);
    return json({ ok: true, action: 'reopened' });
  }

  if (action === 'next_question' && panelGame === 'vecherinkach') {
    const { data: room } = await db.from('rooms').select('current_question_index').eq('id', roomId).single();
    if (!room) return jsonError('Room not found', 404);

    const { error } = await db.from('rooms').update({
      current_question_index: room.current_question_index + 1,
      question_started_at: new Date().toISOString(),
      all_players_answered: false,
    }).eq('id', roomId);

    if (error) return jsonError(error.message, 500);
    return json({ ok: true, action: 'next_question', newIndex: room.current_question_index + 1 });
  }

  return jsonError('Unknown action', 400);
}
