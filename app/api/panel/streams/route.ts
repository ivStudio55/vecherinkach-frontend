import { NextResponse } from 'next/server';
import { requirePanelAuth } from '@/lib/panelAuth';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from('streams')
    .select('*')
    .order('scheduled_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const { title, url, scheduled_at, is_live } = body;

  if (!title || !url || !scheduled_at) {
    return NextResponse.json({ error: 'title, url, scheduled_at обязательны' }, { status: 400 });
  }

  const db = getSupabaseAdminClient();
  const { error } = await db
    .from('streams')
    .insert({ title, url, scheduled_at, is_live: is_live ?? false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PUT(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const { id, title, url, scheduled_at, is_live } = body;

  if (!id) {
    return NextResponse.json({ error: 'id обязателен' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (url !== undefined) updates.url = url;
  if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
  if (is_live !== undefined) updates.is_live = is_live;

  const db = getSupabaseAdminClient();
  const { error } = await db
    .from('streams')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id обязателен' }, { status: 400 });
  }

  const db = getSupabaseAdminClient();
  const { error } = await db.from('streams').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
