import { queryOne } from '@/lib/db.server';
import { json, withCacheControl } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;

  if (!roomId || typeof roomId !== 'string') {
    return json({ error: 'Missing roomId' }, { status: 400 });
  }

  const room = await queryOne<{ pack_id: string | null }>(
    'select pack_id from rooms where id = $1',
    [roomId],
  );

  if (!room?.pack_id) {
    return json([], withCacheControl('no-store'));
  }

  const pack = await queryOne(
    `select id, label, description, is_public, json_base_url, audio_round2_start, audio_round2_end, audio_round3_start, audio_round5_start
     from question_packs
     where id = $1 and is_active = true`,
    [room.pack_id],
  );

  if (!pack) {
    return json([], withCacheControl('no-store'));
  }

  return json([pack], withCacheControl('private, max-age=3600'));
}
