import { NextResponse } from 'next/server';
import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export async function POST(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { game, roomId, action } = await request.json();
  if (!game || !roomId || !action) {
    return NextResponse.json({ error: 'game, roomId, action required' }, { status: 400 });
  }

  const db = getSupabaseAdminClient();

  const roomTable: Record<string, string> = {
    vecherinkach: 'rooms',
    jokester: 'jokester_rooms',
    creativach: 'creativach_rooms',
    draw: 'draw_rooms',
    uno: 'uno_rooms',
  };

  const table = roomTable[game];
  if (!table) return NextResponse.json({ error: 'Unknown game' }, { status: 400 });

  if (action === 'delete') {
    const { error } = await db.from(table).delete().eq('id', roomId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: 'deleted' });
  }

  if (action === 'close') {
    const statusField = game === 'vecherinkach' ? { is_active: false, status: 'finished' } : { status: 'finished' };
    const { error } = await db.from(table).update(statusField).eq('id', roomId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: 'closed' });
  }

  if (action === 'reopen') {
    const statusField = game === 'vecherinkach'
      ? { is_active: true, status: 'waiting' }
      : { status: 'lobby' };
    const { error } = await db.from(table).update(statusField).eq('id', roomId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: 'reopened' });
  }

  if (action === 'next_question' && game === 'vecherinkach') {
    const { data: room } = await db.from('rooms').select('current_question_index').eq('id', roomId).single();
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    const { error } = await db.from('rooms').update({
      current_question_index: room.current_question_index + 1,
      question_started_at: new Date().toISOString(),
      all_players_answered: false,
    }).eq('id', roomId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: 'next_question', newIndex: room.current_question_index + 1 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
