import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export async function GET() {
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from('streams')
    .select('id, title, url, scheduled_at, is_live')
    .order('scheduled_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
