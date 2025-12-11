import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

const AUDIO_ROOT = path.join(process.cwd(), 'public', 'audio');
const MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

const sanitizeRelativePath = (input: string) => {
  const normalized = path.posix.normalize(input.replace(/\\/g, '/'));
  if (normalized.startsWith('..')) {
    throw new Error('Invalid path traversal');
  }
  return normalized.replace(/^\//, '');
};

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
  const resolvedPath = path.join(AUDIO_ROOT, safeRelativePath);

  if (!resolvedPath.startsWith(AUDIO_ROOT)) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  try {
    const buffer = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to read audio asset', error);
    return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
  }
}
