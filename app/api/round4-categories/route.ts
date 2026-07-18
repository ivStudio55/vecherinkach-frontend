import { query } from '@/lib/db.server';
import { json, jsonError, withCacheControl } from '@/lib/server/api';

type Round4CategoryRow = {
  name: string;
  folder_key: string;
  audio_variants: number;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await query<Round4CategoryRow>(
      `select name, folder_key, audio_variants
       from round4_categories
       where is_active = true
       order by name asc`,
    );

    return json(data, withCacheControl('public, max-age=60, s-maxage=120'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(msg, 500);
  }
}
