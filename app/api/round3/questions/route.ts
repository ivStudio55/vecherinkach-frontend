import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_COUNT = 6;

const hashStringToSeed = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash || 1; // избегаем нулевого сида
};

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleWithSeed = <T,>(items: T[], seedString: string | null) => {
  if (!items.length) return items;
  const seed = seedString ? hashStringToSeed(seedString) : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  const rng = mulberry32(seed);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId') || url.searchParams.get('seed');
    const countParam = url.searchParams.get('count');
    const requestedCount = countParam ? Number.parseInt(countParam, 10) : NaN;

    const jsonPath = path.join(process.cwd(), 'app', 'public', 'questions', '3round_questions.json');
    const raw = await readFile(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { questions?: unknown[] } | null;

    const questions = Array.isArray(parsed?.questions) ? parsed!.questions : [];
    const shuffled = shuffleWithSeed(questions, roomId);
    const count = Number.isFinite(requestedCount) && requestedCount > 0 ? requestedCount : DEFAULT_COUNT;
    const limited = shuffled.slice(0, count);

    return Response.json(
      {
        ...parsed,
        questions: limited,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: 'Failed to load round3 questions', details: message },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
