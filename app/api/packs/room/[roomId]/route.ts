import { getSupabaseAdminClient } from '@/lib/supabaseAdmin.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the pack config for a specific room identified by its UUID.
 * Room UUIDs are not guessable, so this is safe for both public and private packs.
 * Used by /host/[roomId] and /room/[code] pages after they have the room UUID.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;

  if (!roomId || typeof roomId !== 'string') {
    return Response.json({ error: 'Missing roomId' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  // Fetch the room to get its pack_id
  const { data: room } = await supabase
    .from('rooms')
    .select('pack_id')
    .eq('id', roomId)
    .single();

  if (!room?.pack_id) {
    // Room not found or has no pack — return empty list (caller falls back to default)
    return Response.json([], { headers: { 'Cache-Control': 'no-store' } });
  }

  const packId = room.pack_id as string;

  // Fetch the pack config (works for both public and private packs)
  const { data: pack } = await supabase
    .from('question_packs')
    .select(
      'id, label, description, is_public, json_base_url, audio_round2_start, audio_round2_end, audio_round3_start, audio_round5_start',
    )
    .eq('id', packId)
    .eq('is_active', true)
    .single();

  if (!pack) {
    return Response.json([], { headers: { 'Cache-Control': 'no-store' } });
  }

  // Cache briefly — game sessions can last an hour, room UUID is already auth
  return Response.json([pack], {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  });
}
