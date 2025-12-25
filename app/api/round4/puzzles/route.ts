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
  return hash || 1;
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

type Puzzle = {
  id: number;
  category: string;
  emoji: string;
  answer: string;
};

type Round4Data = {
  round?: string;
  rules?: string[];
  puzzles?: Puzzle[];
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId') || url.searchParams.get('seed');
    const countParam = url.searchParams.get('count');
    const requestedCount = countParam ? Number.parseInt(countParam, 10) : NaN;

    const jsonPath = path.join(process.cwd(), 'app', 'public', 'questions', '4round.json');
    const raw = await readFile(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as Round4Data | null;

    const puzzles = Array.isArray(parsed?.puzzles) ? parsed!.puzzles : [];

    const shuffled = shuffleWithSeed(puzzles, roomId);
    const count = Number.isFinite(requestedCount) && requestedCount > 0 ? requestedCount : DEFAULT_COUNT;
    const limited = shuffled.slice(0, count);

    return Response.json(
      {
        round: parsed?.round,
        rules: parsed?.rules,
        puzzles: limited,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Round4 puzzles API error:', error);
    return Response.json({ error: 'Failed to load puzzles' }, { status: 500 });
  }
}
