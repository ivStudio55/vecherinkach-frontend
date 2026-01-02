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
  const requestedFile = url.searchParams.get('file');

  if (!requestedFile) {
    return NextResponse.json({ error: 'Missing "file" query parameter' }, { status: 400 });
  }

  let safeRelativePath: string;
  try {
    safeRelativePath = sanitizeRelativePath(requestedFile);
  } catch {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  const filePath = path.join(AUDIO_ROOT, safeRelativePath);

  if (!filePath.startsWith(AUDIO_ROOT)) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  try {
    const fileBuffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to load jingle audio', error);
    return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
  }
}
