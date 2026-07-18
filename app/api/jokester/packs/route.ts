import { query, queryOne } from '@/lib/db.server';
import { json, jsonError } from '@/lib/server/api';

type JokesterPackRow = {
  id: string;
  label: string;
  description: string | null;
  is_public?: boolean;
  json_url: string;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const packId = url.searchParams.get('id');

  try {
    if (packId) {
      const data = await queryOne<JokesterPackRow>(
        `select id, label, description, is_public, json_url
         from jokester_question_packs
         where id = $1 and is_active = true`,
        [packId],
      );
      if (!data) return jsonError('Пакет не найден', 404);
      return json(data);
    }

    const data = await query<JokesterPackRow>(
      `select id, label, description, json_url
       from jokester_question_packs
       where is_active = true and is_public = true
       order by created_at asc`
    );
    return json(data);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to load packs', 500);
  }
}
