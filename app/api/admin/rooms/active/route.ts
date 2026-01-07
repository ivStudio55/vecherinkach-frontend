import { requireAdminBasicAuth } from '@/lib/adminAuth.server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authResponse = requireAdminBasicAuth(request);
  if (authResponse) return authResponse;

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('rooms')
    .select('id, code, status, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return Response.json({ error: error.message ?? 'Failed to load rooms' }, { status: 500 });
  }

  return Response.json({
    items: (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      status: (row as any).status,
      isActive: (row as any).is_active,
      createdAt: (row as any).created_at,
    })),
  });
}
