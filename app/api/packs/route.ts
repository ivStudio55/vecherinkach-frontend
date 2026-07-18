import { query, queryOne } from '@/lib/db.server';
import { json, jsonError, withCacheControl } from '@/lib/server/api';

type PublicPackRow = {
  id: string;
  label: string;
  description: string | null;
  is_public: boolean;
  json_base_url: string;
  audio_round2_start: number;
  audio_round2_end: number;
  audio_round3_start: number;
  audio_round5_start: number;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PACK_SELECT = `
  id,
  label,
  description,
  is_public,
  json_base_url,
  audio_round2_start,
  audio_round2_end,
  audio_round3_start,
  audio_round5_start
`;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeId = url.searchParams.get('include');

    const result = await query<PublicPackRow>(
      `select ${PACK_SELECT}
       from question_packs
       where is_active = true and is_public = true
       order by created_at asc`
    );

    if (includeId && !result.some((pack) => pack.id === includeId)) {
      const extra = await queryOne<PublicPackRow>(
        `select ${PACK_SELECT}
         from question_packs
         where id = $1 and is_active = true and is_public = true`,
        [includeId],
      );
      if (extra) result.push(extra);
    }

    return json(result, withCacheControl('public, max-age=30, s-maxage=60'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(msg, 500);
  }
}
