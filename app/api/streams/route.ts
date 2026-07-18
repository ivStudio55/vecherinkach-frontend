import { query } from '@/lib/db.server';
import { json, jsonError } from '@/lib/server/api';

type StreamRow = {
  id: string;
  title: string;
  url: string;
  scheduled_at: string;
  is_live: boolean;
};

export async function GET() {
  try {
    const data = await query<StreamRow>(
      `select id, title, url, scheduled_at, is_live
       from streams
       order by scheduled_at asc`
    );
    return json(data);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to load streams', 500);
  }
}
