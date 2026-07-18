import { requirePanelAuth } from '@/lib/panelAuth';
import { execute, query } from '@/lib/db.server';
import { json, jsonError } from '@/lib/server/api';

type PanelStreamRow = {
  id: string;
  title: string;
  url: string;
  scheduled_at: string;
  is_live: boolean;
  created_at: string;
  updated_at: string;
};

export async function GET(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  try {
    const data = await query<PanelStreamRow>(
      `select id, title, url, scheduled_at, is_live, created_at, updated_at
       from streams
       order by scheduled_at desc`
    );
    return json(data);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to load streams', 500);
  }
}

export async function POST(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const { title, url, scheduled_at, is_live } = body;

  if (!title || !url || !scheduled_at) {
    return jsonError('title, url, scheduled_at обязательны', 400);
  }

  try {
    await execute(
      `insert into streams (title, url, scheduled_at, is_live)
       values ($1, $2, $3, $4)`,
      [title, url, scheduled_at, is_live ?? false],
    );
    return json({ ok: true }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to create stream', 500);
  }
}

export async function PUT(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const body = await request.json();
  const { id, title, url, scheduled_at, is_live } = body;

  if (!id) {
    return jsonError('id обязателен', 400);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (url !== undefined) updates.url = url;
  if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
  if (is_live !== undefined) updates.is_live = is_live;

  const fields = Object.entries(updates);
  const assignments = fields.map(([key], index) => `"${key}" = $${index + 2}`).join(', ');
  const values = [id, ...fields.map(([, value]) => value)];

  try {
    await execute(`update streams set ${assignments} where id = $1`, values);
    return json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to update stream', 500);
  }
}

export async function DELETE(request: Request) {
  const authErr = requirePanelAuth(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return jsonError('id обязателен', 400);
  }

  try {
    await execute('delete from streams where id = $1', [id]);
    return json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to delete stream', 500);
  }
}
