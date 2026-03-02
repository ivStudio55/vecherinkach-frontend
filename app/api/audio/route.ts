import { NextResponse } from 'next/server';
import path from 'path';

const sanitizeRelativePath = (input: string) => {
  const normalized = path.posix.normalize(input.replace(/\\/g, '/'));
  if (normalized.startsWith('..')) {
    throw new Error('Invalid path traversal');
  }
  return normalized.replace(/^\//, '');
};

/**
 * Redirect to the static public/audio asset so the audio files are served
 * directly from Vercel CDN instead of being read from disk inside the
 * serverless function.  This avoids bundling 150+ MB of audio into the
 * function package which would exceed Vercel's 250 MB limit.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get('file');

  if (!requested) {
    return NextResponse.json({ error: 'Missing "file" query parameter' }, { status: 400 });
  }

  let safeRelativePath: string;
  try {
    safeRelativePath = sanitizeRelativePath(requested);
  } catch {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  // Encode each path segment individually so spaces / parens / unicode are safe.
  const encodedPath = safeRelativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const staticUrl = new URL(`/audio/${encodedPath}`, url);
  return NextResponse.redirect(staticUrl, { status: 302 });
}
